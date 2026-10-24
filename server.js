#!/usr/bin/env node
/**
 * @file server.js
 * @module server
 * @description
 * YUCCA root authoritative multiplayer server.
 *
 * A single-process Node.js WebSocket server that owns the truth of the
 * world: every connected player's position, dimension, and animation
 * state. Clients send INPUT INTENTS (a movement vector, sampled from
 * their InputManager at the fixed tick); the server integrates each
 * player with the same walk/sprint tuning the client avatar uses,
 * validates every step against the shipped dimension maps' wall
 * collision (axis-separated slide, so running into a corner slides
 * along it instead of sticking), and broadcasts the authoritative
 * snapshot at a fixed 20 Hz. Clients predict locally and reconcile
 * against their own entry in each snapshot (see NetworkManager).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC WEATHER SYNC
 * ───────────────────────────────────────────────────────────────────────────
 * One global weatherSeed is drawn at boot, delivered in the welcome
 * handshake, and re-broadcast in every state frame. Clients feed the
 * seed to their WeatherSystem (mulberry32-driven particle pools, gust
 * waveforms, and the multi-stroke lightning scheduler), so every client
 * in the session renders the same storm from the same deterministic
 * stream — synchronized storms without streaming a single particle.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROTOCOL (JSON per frame)
 * ───────────────────────────────────────────────────────────────────────────
 * Client → Server
 *   {t:'join',   name, cellWidth?, cellHeight?}   handshake
 *   {t:'input',  seq, x, y, sprint}               movement intent, x/y ∈ [-1,1]
 *   {t:'shift',  to, reason?}                     dimension change request
 *   {t:'ping',   ts}                              RTT probe
 *
 * Server → Client
 *   {t:'welcome', id, weatherSeed, tickHz, serverTime, cell:{w,h}, you, players}
 *   {t:'state',   tick, serverTime, weatherSeed, players:[{id,name,x,y,world,anim,seq}]}
 *   {t:'shift',   id, from, to}                   dimension fan-out
 *   {t:'leave',   id}
 *   {t:'pong',    ts}
 *   {t:'error',   code, message}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RUN
 * ───────────────────────────────────────────────────────────────────────────
 *   npm run start:server        # or: node server.js
 *   PORT=8080 node server.js    # custom port (default 8080)
 *
 * The same port serves a plain HTTP health page (GET /) reporting tick
 * count and player roster — handy for load balancers and smoke tests.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

import { loadDimensionMaps } from './src/worlds/MapParser_2.js';
import { WORLD } from './src/worlds/WorldManager.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS (MUST MATCH CLIENT TUNING — see src/entities/Player.js)
   ══════════════════════════════════════════════════════════════════════════ */

/** Authoritative simulation rate, ticks per second. */
export const TICK_HZ = 20;
/** Fixed timestep, seconds. */
export const TICK_DT = 1 / TICK_HZ;
/** Base walking speed, CSS px/s (Player.WALK_SPEED). */
const WALK_SPEED = 150;
/** Sprint multiplier (Player.SPRINT_MULTIPLIER). */
const SPRINT_MULTIPLIER = 1.7;
/** Hard speed ceiling (Player.PLAYER_MAX_SPEED headroom). */
const MAX_STEP_SPEED = 560;
/** Default glyph metrics when a client omits them (16px Yucca Mono). */
const DEFAULT_CELL_W = 9.6;
const DEFAULT_CELL_H = 20;
/** Dimension-shift request cooldown, seconds (anti-spam). */
const SHIFT_COOLDOWN_S = 2;
/** Input older than this decays to idle, seconds. */
const INPUT_STALE_S = 2;
/** Heartbeat cadence / timeout, milliseconds. */
const HEARTBEAT_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 35_000;
/** Maximum accepted display name length. */
const MAX_NAME_LENGTH = 16;

/** Ghost tint palette cycled per connection so players read apart. */
const PLAYER_TINTS = Object.freeze([
    '#ff7700', '#5ac8ff', '#7dff8a', '#ff5a5a', '#ffd24a',
    '#c48fff', '#4fe0d0', '#ff9ed2'
]);

/* ══════════════════════════════════════════════════════════════════════════
   SERVER FACTORY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Builds and starts a YUCCA authoritative server instance.
 *
 * Everything is injected/returned for testability: the test harness
 * creates a server on an ephemeral port, drives real WebSocket clients
 * against it, and closes it cleanly.
 *
 * @param {Object} [options]
 * @param {number}  [options.port=8080]        Listen port (0 = ephemeral).
 * @param {string}  [options.host='0.0.0.0']  Bind host.
 * @param {number}  [options.tickHz=20]        Simulation rate.
 * @param {?number} [options.weatherSeed]      Forced deterministic seed.
 * @param {?Object<string, Object>} [options.maps]
 *        Pre-parsed GameMaps keyed by WORLD id (tests); defaults to the
 *        shipped dimension documents via the MapParser_2 pipeline.
 * @param {Function} [options.log]             Logger (defaults to console).
 * @returns {Promise<Object>} Running server handle (see fields below).
 */
export async function createYuccaServer(options = {}) {
    const log = options.log ?? console;
    const tickHz = Number.isFinite(options.tickHz) && options.tickHz > 0 ? options.tickHz : TICK_HZ;
    const tickDt = 1 / tickHz;
    const tickMs = 1000 / tickHz;

    /* ---- Maps (shared pipeline; fallback generation guarantees playability) */
    let maps = options.maps ?? null;
    if (!maps) {
        const rootDir = path.dirname(fileURLToPath(import.meta.url));
        const readMap = (file) =>
            readFileSync(path.join(rootDir, 'assets/data', file), 'utf8');
        const { maps: parsed, warnings } = loadDimensionMaps({
            sources: {
                [WORLD.DREAM]: readMap('dream-grove.txt'),
                [WORLD.DRAB]: readMap('drab-streets.txt')
            },
            names: {
                [WORLD.DREAM]: 'dream_grove',
                [WORLD.DRAB]: 'drab_streets'
            }
        });
        maps = parsed;
        for (const warning of warnings) log.warn?.(`[server] ${warning}`);
    }

    /* ---- Global deterministic weather seed --------------------------- */
    const weatherSeed = Number.isInteger(options.weatherSeed)
        ? (options.weatherSeed >>> 0)
        : (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);

    /* ---- Player registry ---------------------------------------------- */
    /**
     * @type {Map<number, {
     *   id: number, ws: object, name: string, tint: string,
     *   world: string, x: number, y: number, anim: string,
     *   input: {x: number, y: number, sprint: boolean},
     *   seq: number, lastInputAt: number, lastShiftAt: number,
     *   cellW: number, cellH: number, alive: boolean
     * }>}
     */
    const players = new Map();
    let nextPlayerId = 1;

    /* ---- HTTP health endpoint + WebSocket upgrade ---------------------- */
    const httpServer = http.createServer((req, res) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                name: 'yucca-server',
                tick: tickCount,
                uptimeS: Math.round((process.uptime()) * 10) / 10,
                players: [...players.values()].map((p) => ({
                    id: p.id, name: p.name, world: p.world
                })),
                weatherSeed
            }));
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('YUCCA server. WebSocket endpoint: ws://<host>/');
    });

    const wss = new WebSocketServer({ server: httpServer });

    /* ---- Timebook ------------------------------------------------------ */
    const bootTime = performance.now();
    let tickCount = 0;
    let running = false;
    let tickTimer = null;
    let heartbeatTimer = null;

    /* ---- Serialization helpers ----------------------------------------- */

    /**
     * Network shape of one player record.
     * @param {Object} p Player record.
     * @returns {Object} Wire-safe snapshot.
     */
    const wirePlayer = (p) => ({
        id: p.id,
        name: p.name,
        tint: p.tint,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        world: p.world,
        anim: p.anim,
        seq: p.seq
    });

    /** @returns {Object[]} Wire snapshots of every live player. */
    const roster = () => [...players.values()].map(wirePlayer);

    /**
     * Broadcasts a message to every connected client.
     * @param {Object} message JSON-ready payload.
     * @returns {void}
     */
    const broadcast = (message) => {
        const data = JSON.stringify(message);
        for (const client of wss.clients) {
            if (client.readyState === client.OPEN) {
                client.send(data);
            }
        }
    };

    /**
     * Sends to one player's socket if healthy.
     * @param {Object} p Player record.
     * @param {Object} message Payload.
     * @returns {void}
     */
    const sendTo = (p, message) => {
        if (p.ws.readyState === p.ws.OPEN) {
            p.ws.send(JSON.stringify(message));
        }
    };

    /* ---- Collision-validated movement ---------------------------------- */

    /**
     * One authoritative step for one player: normalize the intent, apply
     * walk/sprint speed, then integrate axis-separated against the
     * dimension's wall map (X then Y — blocked axes slide, corners do
     * not stick) and clamp into map bounds.
     *
     * @param {Object} p Player record.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {void}
     */
    function stepPlayer(p, dt) {
        const map = maps[p.world];
        if (!map) return;

        let ix = p.input.x;
        let iy = p.input.y;
        if (!Number.isFinite(ix)) ix = 0;
        if (!Number.isFinite(iy)) iy = 0;

        /* Stale intent decays to idle so disconnected-mid-run players stop. */
        const ageS = (performance.now() - p.lastInputAt) / 1000;
        if (ageS > INPUT_STALE_S) {
            ix = 0;
            iy = 0;
        }

        const mag = Math.hypot(ix, iy);
        if (mag < 0.001) {
            p.anim = 'idle';
            return;
        }
        if (mag > 1) {
            ix /= mag;
            iy /= mag;
        }

        const speed = Math.min(
            MAX_STEP_SPEED,
            WALK_SPEED * (p.input.sprint ? SPRINT_MULTIPLIER : 1)
        );
        p.anim = p.input.sprint ? 'sprint' : 'walk';

        const worldToCellX = (x) => Math.floor(x / p.cellW);
        const worldToCellY = (y) => Math.floor(y / p.cellH);
        const mapPxW = map.cols * p.cellW;
        const mapPxH = map.rows * p.cellH;

        /* Axis-separated slide: try X, then Y. */
        const nextX = p.x + ix * speed * dt;
        if (map.isWalkableAt(worldToCellX(nextX), worldToCellY(p.y))) {
            p.x = nextX;
        }
        const nextY = p.y + iy * speed * dt;
        if (map.isWalkableAt(worldToCellX(p.x), worldToCellY(nextY))) {
            p.y = nextY;
        }

        /* Absolute bounds clamp (teleport recovery). */
        p.x = Math.min(Math.max(p.x, p.cellW), mapPxW - p.cellW);
        p.y = Math.min(Math.max(p.y, p.cellH), mapPxH - p.cellH);
    }

    /* ---- Fixed-tick loop (drift-corrected) ------------------------------ */

    let nextTickAt = 0;

    /**
     * Advances one authoritative tick: integrate every player, then
     * broadcast the snapshot. Drift-corrected scheduling keeps the long
     * run exactly at tickHz without accumulated setTimeout error.
     * @returns {void}
     */
    function tick() {
        tickCount += 1;
        for (const p of players.values()) {
            stepPlayer(p, tickDt);
        }
        broadcast({
            t: 'state',
            tick: tickCount,
            serverTime: Math.round((performance.now() - bootTime) * 1000) / 1000,
            weatherSeed,
            players: roster()
        });
    }

    /**
     * Schedules the next tick with drift correction.
     * @returns {void}
     */
    function scheduleTick() {
        if (!running) return;
        const now = performance.now();
        let delay = nextTickAt - now;
        if (delay < -tickMs * 10) {
            /* We fell far behind (suspend/debugger); resynchronize. */
            nextTickAt = now + tickMs;
            delay = tickMs;
        }
        tickTimer = setTimeout(() => {
            tick();
            nextTickAt += tickMs;
            scheduleTick();
        }, Math.max(0, delay));
    }

    /**
     * Heartbeat sweep: pings live sockets, drops zombie connections.
     * @returns {void}
     */
    function heartbeat() {
        for (const client of wss.clients) {
            if (client.isAlive === false) {
                client.terminate();
                continue;
            }
            client.isAlive = false;
            client.ping();
        }
    }

    /* ---- Connection lifecycle ------------------------------------------- */

    /**
     * Spawns a player at their dimension's player spawn.
     * @param {string} world Dimension id.
     * @param {number} cellW Cell width, CSS px.
     * @param {number} cellH Cell height, CSS px.
     * @returns {{x: number, y: number}} Center-of-cell spawn.
     */
    function spawnPoint(world, cellW, cellH) {
        const map = maps[world] ?? maps[WORLD.DREAM];
        const spawn = map.getPlayerSpawn() ?? { x: 1, y: 1 };
        return {
            x: (spawn.x + 0.5) * cellW,
            y: (spawn.y + 0.5) * cellH
        };
    }

    wss.on('connection', (ws, req) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        log.info?.(`[server] connection from ${req.socket.remoteAddress}`);

        /**
         * Joins the session: assigns id, tint, spawn, and sends welcome.
         * @param {Object} msg Parsed join message.
         * @returns {void}
         */
        function handleJoin(msg) {
            const id = nextPlayerId;
            nextPlayerId += 1;

            let name = typeof msg.name === 'string' ? msg.name.trim() : '';
            /* Strip control characters, clamp length, default name. */
            name = name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_NAME_LENGTH);
            if (name.length === 0) name = `Wanderer ${id}`;

            const cellW = Number.isFinite(msg.cellWidth) && msg.cellWidth > 0
                ? msg.cellWidth : DEFAULT_CELL_W;
            const cellH = Number.isFinite(msg.cellHeight) && msg.cellHeight > 0
                ? msg.cellHeight : DEFAULT_CELL_H;

            const spawn = spawnPoint(WORLD.DREAM, cellW, cellH);
            const player = {
                id,
                ws,
                name,
                tint: PLAYER_TINTS[(id - 1) % PLAYER_TINTS.length],
                world: WORLD.DREAM,
                x: spawn.x,
                y: spawn.y,
                anim: 'idle',
                input: { x: 0, y: 0, sprint: false },
                seq: 0,
                lastInputAt: performance.now(),
                lastShiftAt: -Infinity,
                cellW,
                cellH,
                alive: true
            };
            players.set(id, player);
            ws.playerId = id;

            sendTo(player, {
                t: 'welcome',
                id,
                weatherSeed,
                tickHz,
                serverTime: Math.round((performance.now() - bootTime) * 1000) / 1000,
                cell: { w: cellW, h: cellH },
                you: wirePlayer(player),
                players: roster()
            });
            log.info?.(`[server] player ${id} "${name}" joined`);
        }

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                sendToPlayerSocket(ws, { t: 'error', code: 'BAD_JSON', message: 'malformed frame' });
                return;
            }
            if (!msg || typeof msg.t !== 'string') return;

            switch (msg.t) {
                case 'join': {
                    if (ws.playerId !== undefined) return; // already joined
                    handleJoin(msg);
                    return;
                }
                case 'input': {
                    const p = players.get(ws.playerId);
                    if (!p) return;
                    const seq = Number.isFinite(msg.seq) ? msg.seq : p.seq;
                    if (seq >= p.seq) {
                        p.seq = seq;
                        p.input.x = Number.isFinite(msg.x) ? msg.x : 0;
                        p.input.y = Number.isFinite(msg.y) ? msg.y : 0;
                        p.input.sprint = Boolean(msg.sprint);
                        p.lastInputAt = performance.now();
                    }
                    return;
                }
                case 'shift': {
                    const p = players.get(ws.playerId);
                    if (!p) return;
                    const to = msg.to === WORLD.DRAB ? WORLD.DRAB
                        : msg.to === WORLD.DREAM ? WORLD.DREAM : null;
                    if (!to || to === p.world) return;
                    const nowS = performance.now() / 1000;
                    if (nowS - p.lastShiftAt < SHIFT_COOLDOWN_S) return;
                    p.lastShiftAt = nowS;

                    const from = p.world;
                    p.world = to;
                    /* Re-spawn at the destination dimension's player spawn
                     * so shared-coordinate parity holds across worlds. */
                    const spawn = spawnPoint(to, p.cellW, p.cellH);
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.input.x = 0;
                    p.input.y = 0;
                    broadcast({ t: 'shift', id: p.id, from, to });
                    log.info?.(`[server] player ${p.id} shifted ${from} → ${to}`);
                    return;
                }
                case 'ping': {
                    sendToPlayerSocket(ws, { t: 'pong', ts: msg.ts });
                    return;
                }
                default:
                    return;
            }
        });

        ws.on('close', () => {
            const id = ws.playerId;
            if (id === undefined) return;
            const p = players.get(id);
            players.delete(id);
            if (p) {
                broadcast({ t: 'leave', id });
                log.info?.(`[server] player ${id} "${p.name}" left`);
            }
        });

        ws.on('error', (error) => {
            log.warn?.(`[server] socket error: ${error.message}`);
        });
    });

    /**
     * Sends a raw payload to a socket (guarding pre-join sockets).
     * @param {Object} ws Socket.
     * @param {Object} message Payload.
     * @returns {void}
     */
    function sendToPlayerSocket(ws, message) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    }

    /* ---- Lifecycle ------------------------------------------------------ */

    /**
     * Starts listening and begins the fixed-tick loop.
     * @returns {Promise<Object>} This handle (await listen).
     */
    async function start() {
        if (running) return handle;
        running = true;
        await new Promise((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(options.port ?? 8080, options.host ?? '0.0.0.0', () => {
                httpServer.removeListener('error', reject);
                resolve();
            });
        });
        nextTickAt = performance.now() + tickMs;
        scheduleTick();
        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
        return handle;
    }

    /**
     * Stops the tick loop, closes all sockets, and shuts the listener.
     * @returns {Promise<void>} Resolves when fully closed.
     */
    function close() {
        running = false;
        if (tickTimer !== null) clearTimeout(tickTimer);
        if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
        for (const client of wss.clients) client.terminate();
        return new Promise((resolve) => {
            httpServer.close(() => resolve());
            resolve(); // also resolve immediately for already-idle servers
        });
    }

    const handle = {
        wss,
        httpServer,
        start,
        close,
        getPort: () => httpServer.address()?.port ?? null,
        getPlayerCount: () => players.size,
        getTick: () => tickCount,
        getWeatherSeed: () => weatherSeed,
        getPlayers: () => roster(),
        maps
    };

    return start();
}

/* ══════════════════════════════════════════════════════════════════════════
   STANDALONE ENTRY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Boots the standalone server from CLI arguments and environment.
 * @returns {Promise<void>}
 */
async function main() {
    const args = process.argv.slice(2);
    let port = Number.parseInt(process.env.PORT ?? '8080', 10);
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--port' && Number.isFinite(Number(args[i + 1]))) {
            port = Number.parseInt(args[i + 1], 10);
        }
    }
    if (!Number.isFinite(port)) port = 8080;

    const server = await createYuccaServer({ port });
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   YUCCA — authoritative multiplayer server   ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`  listening   ws://localhost:${server.getPort()}`);
    console.log(`  tick rate   ${TICK_HZ} Hz authoritative`);
    console.log(`  weatherSeed ${server.getWeatherSeed()}`);
    console.log('');
    console.log('  Launch the client in another terminal:');
    console.log('    npm run dev     → http://localhost:3000');
    console.log('');

    const shutdown = () => {
        console.log('\n[server] shutting down…');
        void server.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

/* Run only when executed directly (not when imported by tests). */
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
    main().catch((error) => {
        console.error('[server] fatal:', error);
        process.exit(1);
    });
}
