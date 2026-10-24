/**
 * @file src/network/NetworkManager.js
 * @module network/NetworkManager
 * @description
 * Online multiplayer client for YUCCA: the WebSocket session manager,
 * remote-player ghost pool, and prediction/reconciliation bridge
 * between the local Player and the authoritative server (server.js).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ───────────────────────────────────────────────────────────────────────────
 *   InputManager ──intent──► NetworkManager ──ws──► server.js (20 Hz authoritative)
 *        ▲                                            │
 *        │ local prediction                           │ state snapshots
 *   Player (60 Hz) ◄──── reconciliation ─── NetworkManager ◄────────────┘
 *        │                                            │
 *        └── renders immediately               RemoteGhost pool (interpolated)
 *
 * The local Player keeps predicting at the full 60 Hz fixed tick — input
 * feels instant. Every network tick (20 Hz) the manager ships the
 * sampled intent {x, y, sprint, seq} to the server. Every authoritative
 * snapshot that arrives updates the remote ghosts AND reconciles the
 * local player against its own entry: hard snap-teleport when the
 * server disagrees by more than a body (wall rub, lag spike, shift),
 * gentle exponential pull for small drift so corrections never visibly
 * fight the player's own movement.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SNAPSHOT INTERPOLATION (REMOTE GHOSTS)
 * ───────────────────────────────────────────────────────────────────────────
 * Remote players are NEVER drawn at the raw latest position — at 20 Hz
 * that strobes. Each ghost keeps a ring of recent snapshots:
 *
 *   renderTime = localTime − INTERP_DELAY_MS
 *
 * and the ghost's position is the linear blend of the two snapshots
 * straddling renderTime. The 100 ms delay is one-and-a-half server
 * frames of slack: it absorbs jitter without visible lag. When a remote
 * jumps more than SNAP_PX in one snapshot (dimension shift, teleport,
 * spawn) the ghost abandons interpolation for that pair and snaps —
 * smoothing a 40-cell teleport would look like a rocket, not a move.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WEATHER SYNC
 * ───────────────────────────────────────────────────────────────────────────
 * The welcome handshake carries the server's global deterministic
 * weatherSeed. The manager re-dispatches it as a 'seed' event; the boot
 * wires it into WeatherSystem.setSeed() so every client in the session
 * draws the identical storm from the same mulberry32 stream.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RESILIENCE
 * ───────────────────────────────────────────────────────────────────────────
 * The game is fully playable OFFLINE. A failed or dropped connection
 * retries with exponential backoff (0.5 s → 8 s, jittered) while the
 * simulation continues untouched; ghosts simply stop updating until the
 * session re-establishes. destroy() tears everything down cleanly.
 */

import { Entity, ENTITY_LAYER } from '../entities/Entity.js';
import { WORLD } from '../worlds/WorldManager.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Snapshot render delay, ms — ~1.5 server frames of jitter slack. */
export const INTERP_DELAY_MS = 100;
/** Per-snapshot displacement beyond which ghosts snap, CSS px (~5 cells). */
export const SNAP_PX = 96;
/** Reconciliation thresholds: hard snap above, soft pull between, CSS px. */
export const RECONCILE_SNAP_PX = 96;
export const RECONCILE_SOFT_PX = 24;
/** Soft-pull blend factor per tick toward the authoritative position. */
const SOFT_PULL_K = 0.18;
/** Outbound intent rate cap, Hz (matches the server tick). */
const SEND_RATE_HZ = 20;
/** Snapshot ring capacity per ghost (~1.5 s at 20 Hz). */
const RING_CAPACITY = 32;
/** Reconnect backoff bounds, ms. */
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;
/** Default dev server endpoint when the page origin isn't the game server. */
const DEFAULT_DEV_SERVER = 'ws://localhost:8080';
/** Ports served by the authoritative server itself. */
const SERVER_PORTS = new Set(['8080']);

/* ══════════════════════════════════════════════════════════════════════════
   REMOTE GHOST
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A remote player's interpolated avatar. Receives authoritative
 * snapshots, blends them across the interpolation window, and renders a
 * tinted glyph plus a one-character name tag into the world buffer.
 *
 * Extends Entity for the id/name/position/event surface; physics is
 * fully overridden — ghosts never integrate, they sample.
 */
class RemoteGhost extends Entity {
    /**
     * @param {Object} spec Snapshot fields from the server roster.
     * @param {Object} [options] Entity options.
     */
    constructor(spec, options = {}) {
        super({
            name: spec.name ?? 'wanderer',
            char: '@',
            fgColor: spec.tint ?? '#ff7700',
            zIndex: ENTITY_LAYER.ENTITY,
            width: 12,
            height: 20,
            tags: ['remote', 'ghost'],
            ...options,
            x: spec.x,
            y: spec.y
        });

        /** @type {string} Server tint for this player. */
        this._tint = spec.tint ?? '#ff7700';
        /** @type {string} This ghost's dimension. */
        this._ghostWorld = spec.world ?? WORLD.DREAM;
        /** @type {string} Last authoritative animation state. */
        this._anim = spec.anim ?? 'idle';

        /**
         * Snapshot ring: [{t (ms, local clock), x, y}]. Pushed by
         * onSnapshot; sampled by getRenderPosition.
         * @type {Array<{t: number, x: number, y: number}>}
         */
        this._ring = [{ t: performance.now(), x: spec.x, y: spec.y }];

        /** @type {number} Render-time sample cache, px. */
        this._sampleX = spec.x;
        /** @type {number} Render-time sample cache, px. */
        this._sampleY = spec.y;
    }

    /** @returns {string} This ghost's dimension id. */
    get ghostWorld() {
        return this._ghostWorld;
    }

    /** @returns {string} Authoritative animation state. */
    get anim() {
        return this._anim;
    }

    /**
     * Ingests one authoritative snapshot.
     *
     * Dimension changes flush the ring (the position history of another
     * world is meaningless here); large jumps flag the next sample as a
     * snap so the interpolator does not glide across the map.
     *
     * @param {number} t Local receive time, ms.
     * @param {number} x Authoritative x, px.
     * @param {number} y Authoritative y, px.
     * @param {string} world Dimension id.
     * @param {string} anim Animation state.
     * @returns {void}
     */
    onSnapshot(t, x, y, world, anim) {
        this._anim = anim ?? this._anim;

        if (world !== this._ghostWorld) {
            this._ghostWorld = world;
            this._ring.length = 0;
            this._ring.push({ t, x, y });
            this._sampleX = x;
            this._sampleY = y;
            this._x = x;
            this._y = y;
            return;
        }

        const last = this._ring[this._ring.length - 1];
        const snapped = Math.hypot(x - last.x, y - last.y) > SNAP_PX;
        this._ring.push({ t, x, y });
        if (this._ring.length > RING_CAPACITY) this._ring.shift();

        if (snapped) {
            /* Drop history before the jump so interpolation never blends
             * across the teleport. */
            while (this._ring.length > 1) this._ring.shift();
        }
    }

    /**
     * Time-based interpolated position. Overrides Entity's physics-pass
     * interpolation: ghosts sample the snapshot ring at renderTime
     * instead of blending tick endpoints.
     * @param {number} _alpha Ignored (signature compatibility).
     * @param {?{x: number, y: number}} out Optional reuse target.
     * @returns {{x: number, y: number}} Interpolated position.
     */
    getRenderPosition(_alpha = 1, out = null) {
        const target = out ?? { x: 0, y: 0 };
        const ring = this._ring;
        const renderTime = performance.now() - INTERP_DELAY_MS;

        if (ring.length === 0) {
            target.x = this._sampleX;
            target.y = this._sampleY;
            return target;
        }

        /* Newer than the newest sample: hold (snapshot starved). */
        const newest = ring[ring.length - 1];
        if (renderTime >= newest.t || ring.length === 1) {
            this._sampleX = newest.x;
            this._sampleY = newest.y;
            target.x = newest.x;
            target.y = newest.y;
            return target;
        }

        /* Find the straddling pair. */
        for (let i = ring.length - 1; i > 0; i -= 1) {
            const a = ring[i - 1];
            const b = ring[i];
            if (renderTime >= a.t && renderTime <= b.t) {
                const span = b.t - a.t;
                const f = span > 0 ? (renderTime - a.t) / span : 1;
                this._sampleX = a.x + (b.x - a.x) * f;
                this._sampleY = a.y + (b.y - a.y) * f;
                target.x = this._sampleX;
                target.y = this._sampleY;
                return target;
            }
        }

        /* Older than everything (huge stall): hold oldest. */
        const oldest = ring[0];
        this._sampleX = oldest.x;
        this._sampleY = oldest.y;
        target.x = oldest.x;
        target.y = oldest.y;
        return target;
    }

    /**
     * Presents the ghost: a tinted glyph at the interpolated position,
     * with a dimmed name-tag initial one cell above. Skips when the
     * ghost lives in another dimension than the local camera's world.
     * @param {import('../engine/ASCIIBuffer.js').ASCIIBuffer} buffer World buffer.
     * @param {?import('../engine/Camera.js').Camera} camera Active camera.
     * @returns {void}
     */
    render(buffer, camera = null) {
        if (!camera || this._ghostWorld !== this._localWorld) return;
        const pos = this.getRenderPosition(1, _ghostPoint);
        const screen = camera.worldToScreen(pos.x, pos.y);
        const col = Math.floor(screen.x / (camera._cellW || 9.6));
        const row = Math.floor(screen.y / (camera._cellH || 20));

        const bob = this._anim === 'idle'
            ? Math.floor(Math.sin(performance.now() / 900) * 0.5)
            : 0;

        buffer.setChar(col, row + bob, '@', this._tint, null);
        const initial = this._name.length > 0 ? this._name[0].toUpperCase() : '?';
        buffer.setChar(col, row - 1 + bob, initial, '#8a97a6', null);
    }
}

/** Reused interpolation output to avoid per-frame allocation. */
const _ghostPoint = { x: 0, y: 0 };

/* ══════════════════════════════════════════════════════════════════════════
   NETWORK MANAGER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WebSocket session manager: connection lifecycle, protocol exchange,
 * outbound intents, snapshot interpolation, and local reconciliation.
 */
export class NetworkManager {
    /**
     * @param {Object} [options]
     * @param {?string} [options.url] Explicit server URL (overrides all
     *   derivation; also settable per-session via ?server=host:port).
     * @param {Function} [options.socketFactory] Injectable WebSocket
     *   constructor (tests); defaults to the global.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[NetworkManager] options must be an object.');
        }

        /** @type {?string} Resolved server URL. */
        this._url = options.url ?? null;
        /** @type {Function} WebSocket constructor. */
        this._socketFactory = options.socketFactory ?? globalThis.WebSocket ?? null;

        /** @type {string} Connection phase. */
        this._status = 'idle'; // idle | connecting | connected | reconnecting | closed
        /** @type {?number} This client's server-assigned id. */
        this._selfId = null;
        /** @type {?number} Global deterministic weather seed. */
        this._weatherSeed = null;
        /** @type {number} Outbound intent sequence counter. */
        this._seq = 0;
        /** @type {?Object} Socket handle. */
        this._ws = null;
        /** @type {boolean} Intentional-close latch (no reconnect after destroy). */
        this._intentionalClose = false;
        /** @type {?number} Pending reconnect timer. */
        this._reconnectTimer = null;
        /** @type {number} Backoff exponent state. */
        this._backoffMs = RECONNECT_MIN_MS;
        /** @type {number} Send-rate accumulator, seconds. */
        this._sendAccumulator = 0;
        /** @type {number} Unchanged-intent heartbeat counter (every 4th). */
        this._heartbeatCounter = 0;
        /** @type {number} Last intent sent (dedup). */
        this._lastIntent = { x: 0, y: 0, sprint: false };

        /** @type {Map<number, RemoteGhost>} Ghost pool by remote id. */
        this._ghosts = new Map();

        /** @type {?import('../entities/Player.js').Player} Local player. */
        this._player = null;
        /** @type {?import('../core/Game.js').Game} Game orchestrator. */
        this._game = null;
        /** @type {string} Local dimension for ghost render gating. */
        this._localWorld = WORLD.DREAM;

        /** @type {Map<string, Set<Function>>} Event bus. */
        this._listeners = new Map();

        /** @type {number} Latest self snapshot age, ms. */
        this._lastSelfUpdate = 0;
        /** @type {number} RTT estimate from pong probes, ms. */
        this._rttMs = 0;

        /** @type {Object} Lifetime counters. */
        this._metrics = {
            connects: 0,
            disconnects: 0,
            messagesIn: 0,
            messagesOut: 0,
            snapshots: 0,
            corrections: 0,
            softPulls: 0
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       ATTACHMENT SEAMS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the Game orchestrator (world id gating, shift relay).
     * Subscribes to 'dimensionshift' so local dimension changes are
     * relayed to the authoritative server.
     * @param {?Object} game Game orchestrator or null.
     * @returns {this}
     */
    attachGame(game) {
        if (this._game && typeof this._game.off === 'function') {
            this._game.off('dimensionshift', this._onLocalShift);
        }
        this._game = game;
        if (game && typeof game.on === 'function') {
            this._onLocalShift = (detail) => {
                if (detail && typeof detail.to === 'string') {
                    this.sendWorldShift(detail.to, detail.reason);
                }
            };
            game.on('dimensionshift', this._onLocalShift);
            this._localWorld = game._worlds
                ? game._worlds.getActiveWorldId()
                : this._localWorld;
        }
        return this;
    }

    /**
     * Attaches the local player for outbound intents + reconciliation.
     * @param {?Object} player Player or null.
     * @returns {this}
     */
    attachPlayer(player) {
        this._player = player;
        return this;
    }

    /** @returns {string} Connection phase. */
    get status() {
        return this._status;
    }

    /** @returns {boolean} True while an authenticated session is live. */
    get isConnected() {
        return this._status === 'connected';
    }

    /** @returns {?number} The session's global weather seed. */
    get weatherSeed() {
        return this._weatherSeed;
    }

    /** @returns {?number} Server-assigned self id. */
    get selfId() {
        return this._selfId;
    }

    /** @returns {number} Last RTT probe result, ms. */
    get rttMs() {
        return this._rttMs;
    }

    /* ══════════════════════════════════════════════════════════════════
       URL DERIVATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Derives the server URL: explicit option → ?server= override →
     * same-origin when the page itself is served by the game server →
     * the default dev endpoint.
     * @returns {string} WebSocket URL.
     */
    resolveUrl() {
        if (this._url) return this._url;
        try {
            const params = new URLSearchParams(globalThis.location?.search ?? '');
            const override = params.get('server');
            if (override) {
                return override.startsWith('ws')
                    ? override
                    : `ws://${override}`;
            }
            const loc = globalThis.location;
            if (loc && SERVER_PORTS.has(loc.port)) {
                return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}`;
            }
        } catch {
            /* Non-browser context: fall through to the dev default. */
        }
        return DEFAULT_DEV_SERVER;
    }

    /* ══════════════════════════════════════════════════════════════════
       CONNECTION LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Opens the session (idempotent while a connection is pending).
     * @param {?string} [url] Explicit URL override for this connect.
     * @returns {boolean} True if a connection attempt started.
     */
    connect(url = null) {
        if (this._intentionalClose) return false;
        if (this._ws && (this._status === 'connecting' || this._status === 'connected')) {
            return false;
        }
        if (typeof this._socketFactory !== 'function') {
            console.warn('[NetworkManager] No WebSocket implementation; running offline.');
            return false;
        }

        const target = url ?? this.resolveUrl();
        this._status = 'connecting';
        let ws;
        try {
            ws = new this._socketFactory(target);
        } catch (error) {
            console.warn(`[NetworkManager] socket construct failed (${target}):`, error);
            this._scheduleReconnect();
            return false;
        }
        this._ws = ws;

        ws.onopen = () => {
            this._status = 'connected';
            this._metrics.connects += 1;
            this._backoffMs = RECONNECT_MIN_MS;

            /* Handshake. */
            const cell = this._game?._renderer
                ? {
                    width: this._game._renderer.cellWidth,
                    height: this._game._renderer.cellHeight
                }
                : {};
            this._rawSend({
                t: 'join',
                name: typeof this._player?.name === 'string' ? this._player.name : 'Wanderer',
                ...cell
            });
            this.emit('connect', { url: target });
        };

        ws.onmessage = (event) => {
            this._metrics.messagesIn += 1;
            let msg;
            try {
                msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
            } catch {
                return;
            }
            if (msg && typeof msg.t === 'string') this._handleMessage(msg);
        };

        ws.onclose = () => {
            this._metrics.disconnects += 1;
            this._ws = null;
            if (this._intentionalClose) {
                this._status = 'closed';
                return;
            }
            this._status = 'reconnecting';
            this.emit('disconnect', { willRetry: true });
            this._scheduleReconnect();
        };

        ws.onerror = () => {
            /* onclose follows; nothing to do here. */
        };

        return true;
    }

    /**
     * Schedules a jittered exponential-backoff reconnect.
     * @returns {void}
     * @private
     */
    _scheduleReconnect() {
        if (this._reconnectTimer !== null || this._intentionalClose) return;
        const jitter = this._backoffMs * (0.75 + Math.random() * 0.5);
        this._backoffMs = Math.min(RECONNECT_MAX_MS, this._backoffMs * 2);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, jitter);
    }

    /**
     * Sends a raw frame if the socket is open.
     * @param {Object} payload JSON-ready object.
     * @returns {boolean} True when transmitted.
     * @private
     */
    _rawSend(payload) {
        if (!this._ws || this._ws.readyState !== this._socketFactory?.OPEN) return false;
        this._ws.send(JSON.stringify(payload));
        this._metrics.messagesOut += 1;
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       PROTOCOL HANDLING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Dispatches one decoded server frame.
     * @param {Object} msg Decoded frame.
     * @returns {void}
     * @private
     */
    _handleMessage(msg) {
        switch (msg.t) {
            case 'welcome':
                this._selfId = Number.isFinite(msg.id) ? msg.id : this._selfId;
                if (Number.isInteger(msg.weatherSeed) && msg.weatherSeed !== this._weatherSeed) {
                    this._weatherSeed = msg.weatherSeed >>> 0;
                    this.emit('seed', { seed: this._weatherSeed });
                }
                if (Array.isArray(msg.players)) this._applyRoster(msg.players);
                this.emit('welcome', { id: this._selfId, seed: this._weatherSeed });
                break;

            case 'state':
                this._metrics.snapshots += 1;
                if (Number.isInteger(msg.weatherSeed)) {
                    this._weatherSeed = msg.weatherSeed >>> 0;
                }
                if (Array.isArray(msg.players)) this._applyRoster(msg.players);
                break;

            case 'shift':
                this.emit('remoteshift', { id: msg.id, from: msg.from, to: msg.to });
                break;

            case 'leave':
                this._ghosts.delete(msg.id);
                this.emit('remoteleave', { id: msg.id });
                break;

            case 'pong':
                if (Number.isFinite(msg.ts)) {
                    this._rttMs = Math.round(performance.now() - msg.ts);
                }
                break;

            default:
                break;
        }
    }

    /**
     * Applies a roster snapshot: creates/removes ghosts, feeds samples,
     * and reconciles the local player against its own entry.
     * @param {Object[]} players Wire roster.
     * @returns {void}
     * @private
     */
    _applyRoster(players) {
        const now = performance.now();
        const seen = new Set();

        for (const entry of players) {
            if (!entry || !Number.isFinite(entry.id)) continue;
            seen.add(entry.id);

            if (entry.id === this._selfId) {
                this._reconcileSelf(entry);
                continue;
            }

            let ghost = this._ghosts.get(entry.id);
            if (!ghost) {
                ghost = new RemoteGhost(entry);
                this._ghosts.set(entry.id, ghost);
                this.emit('remotejoin', { id: entry.id, name: entry.name });
            }
            ghost._localWorld = this._localWorld;
            ghost.onSnapshot(now, entry.x, entry.y, entry.world, entry.anim);
        }

        for (const id of [...this._ghosts.keys()]) {
            if (!seen.has(id)) this._ghosts.delete(id);
        }
    }

    /**
     * Reconciles the predicted local player against its authoritative
     * entry: hard snap past RECONCILE_SNAP_PX, soft exponential pull
     * between RECONCILE_SOFT_PX and the snap threshold, ignore below.
     * @param {Object} entry Self wire entry.
     * @returns {void}
     * @private
     */
    _reconcileSelf(entry) {
        const player = this._player;
        if (!player || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) return;
        this._lastSelfUpdate = performance.now();

        /* Dimension disagreement: the server is always right. */
        if (entry.world !== undefined && entry.world !== player.world) {
            player.applyServerCorrection(entry);
            this._metrics.corrections += 1;
            return;
        }

        const dx = entry.x - player.x;
        const dy = entry.y - player.y;
        const dist = Math.hypot(dx, dy);

        if (dist > RECONCILE_SNAP_PX) {
            player.applyServerCorrection(entry);
            this._metrics.corrections += 1;
        } else if (dist > RECONCILE_SOFT_PX) {
            /* Gentle pull: teleport by a fraction of the error. Rapid
             * small teleports read as smooth correction without fighting
             * the local 60 Hz prediction. */
            player.teleport(
                player.x + dx * SOFT_PULL_K,
                player.y + dy * SOFT_PULL_K
            );
            this._metrics.softPulls += 1;
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       FIXED-TICK UPDATE (called by Game each simulation tick)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the network session by one tick: throttled intent send,
     * local-world gate refresh, and a keepalive RTT probe.
     * @param {number} dt Fixed timestep, seconds.
     * @param {?Object} [input] InputManager for intent sampling.
     * @returns {void}
     */
    update(dt, input = null) {
        if (!this.isConnected) return;

        if (this._game?._worlds) {
            this._localWorld = this._game._worlds.getActiveWorldId();
            for (const ghost of this._ghosts.values()) {
                ghost._localWorld = this._localWorld;
            }
        }

        /* ---- Intent sampling at SEND_RATE_HZ --------------------------- */
        this._sendAccumulator += dt;
        const interval = 1 / SEND_RATE_HZ;
        if (this._sendAccumulator < interval) return;
        this._sendAccumulator = 0;

        const intent = this._sampleIntent(input);
        const changed =
            intent.x !== this._lastIntent.x ||
            intent.y !== this._lastIntent.y ||
            intent.sprint !== this._lastIntent.sprint;

        /* Full frames on change; heartbeat otherwise — every 4th send
         * window EVEN WHEN the intent is unchanged — so a held direction
         * keeps the server's staleness clock refreshed. The counter is
         * independent of seq, which advances only on real sends. */
        this._heartbeatCounter = (this._heartbeatCounter + 1) % 4;
        if (changed || this._heartbeatCounter === 0) {
            this._seq += 1;
            this._rawSend({ t: 'input', seq: this._seq, ...intent });
            this._lastIntent = intent;
        }

        /* Occasional RTT probe rides the same throttle. */
        if (this._seq % 20 === 0) {
            this._rawSend({ t: 'ping', ts: performance.now() });
        }
    }

    /**
     * Samples the movement intent from the InputManager (or falls back
     * to the local player's live velocity when no input handle exists).
     * @param {?Object} input InputManager.
     * @returns {{x: number, y: number, sprint: boolean}} Unit intent.
     * @private
     */
    _sampleIntent(input) {
        let x = 0;
        let y = 0;
        let sprint = false;

        if (input && typeof input.getMovementVector === 'function') {
            const vec = input.getMovementVector();
            x = Number.isFinite(vec?.x) ? vec.x : 0;
            y = Number.isFinite(vec?.y) ? vec.y : 0;
            sprint = typeof input.isActionDown === 'function'
                ? input.isActionDown('SPRINT')
                : false;
        } else if (this._player) {
            x = this._player.vx;
            y = this._player.vy;
            const mag = Math.hypot(x, y);
            if (mag > 1) {
                x /= mag;
                y /= mag;
            }
        }

        return { x, y, sprint };
    }

    /* ══════════════════════════════════════════════════════════════════
       OUTBOUND REQUESTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Requests a dimension shift for this player on the server.
     * @param {string} to WORLD.DREAM or WORLD.DRAB.
     * @param {string} [reason] Diagnostics-only reason tag.
     * @returns {boolean} True when transmitted.
     */
    sendWorldShift(to, reason = 'SCRIPTED') {
        return this._rawSend({ t: 'shift', to, reason });
    }

    /* ══════════════════════════════════════════════════════════════════
       QUERIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Ghosts sharing the local player's current dimension — the set the
     * world presenter draws each frame.
     * @returns {RemoteGhost[]} Same-dimension ghosts.
     */
    getGhosts() {
        const out = [];
        for (const ghost of this._ghosts.values()) {
            if (ghost.ghostWorld === this._localWorld) out.push(ghost);
        }
        return out;
    }

    /**
     * Diagnostic snapshot for the debug HUD.
     * @returns {Object}
     */
    getMetrics() {
        return {
            status: this._status,
            url: this._url ?? this.resolveUrl(),
            selfId: this._selfId,
            weatherSeed: this._weatherSeed,
            rttMs: this._rttMs,
            ghosts: this._ghosts.size,
            ...this._metrics,
            lastSelfUpdateAgeMs: this._lastSelfUpdate
                ? Math.round(performance.now() - this._lastUpdateNow())
                : null
        };
    }

    /** @returns {number} Clock for the metric above. */
    _lastUpdateNow() {
        return this._lastSelfUpdate;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a network event: 'connect', 'disconnect', 'welcome',
     * 'seed', 'remotejoin', 'remoteleave', 'remoteshift'.
     * @param {string} type Event name.
     * @param {Function} listener Callback.
     * @returns {Function} Unsubscribe function.
     */
    on(type, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('[NetworkManager] listener must be a function.');
        }
        let set = this._listeners.get(type);
        if (!set) {
            set = new Set();
            this._listeners.set(type, set);
        }
        set.add(listener);
        return () => this.off(type, listener);
    }

    /**
     * Unsubscribes a listener.
     * @param {string} type Event name.
     * @param {Function} listener Callback.
     * @returns {this}
     */
    off(type, listener) {
        const set = this._listeners.get(type);
        if (set) {
            set.delete(listener);
            if (set.size === 0) this._listeners.delete(type);
        }
        return this;
    }

    /**
     * Broadcasts an event with error isolation.
     * @param {string} type Event name.
     * @param {Object} detail Payload.
     * @returns {void}
     */
    emit(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[NetworkManager] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       TELEMETRY & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /** @private Bound handler holder for attachGame cleanup. */
    _onLocalShift = null;

    /**
     * Tears the session down: closes the socket, cancels reconnects,
     * detaches game listeners, clears the ghost pool.
     * @returns {void}
     */
    destroy() {
        this._intentionalClose = true;
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._game && typeof this._game.off === 'function' && this._onLocalShift) {
            this._game.off('dimensionshift', this._onLocalShift);
        }
        if (this._ws) {
            try {
                this._ws.close();
            } catch {
                /* Already closing. */
            }
            this._ws = null;
        }
        this._ghosts.clear();
        this._listeners.clear();
        this._status = 'closed';
    }
}

export default NetworkManager;
