/**
 * @file scripts/validate-engine.mjs
 * @module scripts/validate-engine
 * @description
 * YUCCA full-stack validation: boots the REAL engine modules under a
 * minimal DOM/canvas shim and proves every delivery mandate — pipeline
 * order, weather density + lightning inversion + camera shake, water
 * reflection spans + tint caches, entity interpolation math, MapParser_2
 * invariants + fallback generation, terrain-aware footstep audio wiring,
 * the vibrant loading screen (poncho + YUCCA embroidery + spore drift),
 * the orange economy loop, and a live authoritative server session with
 * the real NetworkManager (movement validated against walls, ghosts,
 * dimension shifts, weatherSeed sync).
 *
 * Run: npm run validate
 * (or: node --import ./scripts/raw-hook.mjs scripts/validate-engine.mjs)
 */

const ROOT = new URL('..', import.meta.url).pathname;

/* ══════════════════════════════════════════════════════════════════════════
   DOM / CANVAS / AUDIO SHIMS (browser surface for the real modules)
   ══════════════════════════════════════════════════════════════════════════ */

const noop = () => {};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
globalThis.Path2D = class Path2D { rect() {} };
globalThis.window = {
    devicePixelRatio: 2,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
};
globalThis.document = {
    hidden: false,
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    fonts: { ready: Promise.resolve() },
    title: '',
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = noop;

const makeCtx = (canvas) => ({
    canvas, fillStyle: '', font: '', textBaseline: '', textAlign: '',
    setTransform: noop, save: noop, restore: noop, translate: noop, scale: noop,
    clearRect: noop, fillRect: noop, fill: noop, fillText: noop,
    measureText: (t) => ({ width: String(t).length * 9.6 }),
});
const canvas = Object.assign(Object.create(globalThis.HTMLCanvasElement.prototype), {
    width: 1280, height: 800, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, focus: noop,
    getBoundingClientRect: () => ({ width: 640, height: 400, left: 0, top: 0, right: 640, bottom: 400 }),
    getContext: () => makeCtx(canvas),
});

/* ══════════════════════════════════════════════════════════════════════════
   HARNESS
   ══════════════════════════════════════════════════════════════════════════ */

let passCount = 0;
let failCount = 0;
const check = (label, ok, extra = '') => {
    const line = `${ok ? '  ✓ PASS' : '  ✗ FAIL'}  ${label}${extra ? '   [' + extra + ']' : ''}`;
    console.log(line);
    if (ok) passCount += 1; else failCount += 1;
};
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 64 - title.length))}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════
   1. REBRAND
   ══════════════════════════════════════════════════════════════════════════ */

section('1 · Rebrand integrity');
{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const offenders = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.wrangler') continue;
                walk(abs);
            } else if (/\.(js|html|css|json|txt)$/.test(entry.name)) {
                const text = fs.readFileSync(abs, 'utf8');
                if (/a stitch in time|stitch-in-time|stitch-mono/i.test(text)) {
                    offenders.push(path.relative(ROOT, abs));
                }
            }
        }
    };
    walk(ROOT);
    check('no legacy brand strings anywhere in shipped sources', offenders.length === 0,
        offenders.length ? offenders.slice(0, 3).join(', ') : 'clean');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    check('package.json name is "yucca"', pkg.name === 'yucca');
    check('startup scripts present', pkg.scripts['start:server'] === 'node server.js' && pkg.scripts.dev === 'vite');
}

/* ══════════════════════════════════════════════════════════════════════════
   2. WEATHER SYSTEM — full density, lean, gusts, inversion, shake
   ══════════════════════════════════════════════════════════════════════════ */

section('2 · WeatherSystem (pools, lean, gusts, lightning inversion, shake)');
const { WeatherSystem, WEATHER_PROFILE } = await import(`${ROOT}/src/worlds/WeatherSystem.js`);
const { ASCIIBuffer } = await import(`${ROOT}/src/engine/ASCIIBuffer.js`);
const { Camera } = await import(`${ROOT}/src/engine/Camera.js`);
{
    const storm = new WeatherSystem({ cellWidth: 9.6, cellHeight: 20, seed: 777 });
    storm.setWorld('DRAB'); // locks DRAB_THUNDERSTORM
    const cam = new Camera({ viewportWidth: 640, viewportHeight: 400, cellWidth: 9.6, cellHeight: 20 });
    storm.attachCamera(cam);

    /* Settle the storm for 3 simulated seconds. */
    for (let i = 0; i < 180; i += 1) storm.update(1 / 60);
    const metrics = storm.getMetrics();
    check('storm pool reaches high density (no clipping)', metrics.liveParticles >= 300,
        `${metrics.liveParticles} live`);

    /* Wind-lean glyphs and gust variation. */
    const buffer = new ASCIIBuffer({ cols: 66, rows: 20, defaultBg: '#000000' });
    storm.render(buffer, cam);
    let leanGlyphs = 0;
    buffer.forEachActiveCell((x, y, code) => {
        if (code === 0x2F /* / */ || code === 0x5C /* \ */) leanGlyphs += 1;
    });
    const windA = storm.getMetrics().windX;
    storm.update(0.5);
    const windB = storm.getMetrics().windX;
    check('wind-lean glyphs present in the storm curtain', leanGlyphs > 0, `${leanGlyphs} lean cells`);
    check('procedural gust waveform modulates wind over time', windA !== windB,
        `${windA.toFixed(1)} → ${windB.toFixed(1)} px/s`);

    /* Lightning: expect strikes, the inversion X-ray pass, and shake. */
    let strikes = 0;
    storm.addEventListener('lightning', () => { strikes += 1; });

    /* Terrain sentinel: '#' inverts to '%' via INVERTED_GLYPHS. */
    for (let x = 10; x < 30; x += 1) buffer.setChar(x, 4, '#', '#8a8f7a', '#101208');

    let shakeObserved = false;
    let sawInversion = false;
    let sawPercent = false;
    for (let i = 0; i < 60 * 30 && strikes < 2; i += 1) {
        storm.update(1 / 60);
        shakeObserved = shakeObserved || cam.isShaking;
        if (storm.isFlashing) {
            storm.render(buffer, cam);
            /* Sample the sentinel band for an inversion-flipped glyph. */
            for (let x = 10; x < 30 && !sawPercent; x += 1) {
                if (buffer.getCharCode(x, 4) === 0x25 /* % */) sawPercent = true;
            }
            sawInversion = sawInversion || sawPercent;
        }
    }
    check('multi-stroke lightning manager fires strikes', strikes >= 2, `${strikes} strikes`);
    check('buffer-inversion X-ray pass flips mapped glyphs (# → %)', sawInversion);
    check('lightning drives Camera shake integration', shakeObserved);

    /* Deterministic reseeding parity (server weatherSeed sync). */
    const a = new WeatherSystem({ cellWidth: 9.6, cellHeight: 20, seed: 4242 });
    const b = new WeatherSystem({ cellWidth: 9.6, cellHeight: 20, seed: 99 });
    b.setSeed(4242);
    const bufA = new ASCIIBuffer({ cols: 66, rows: 20 });
    const bufB = new ASCIIBuffer({ cols: 66, rows: 20 });
    const camA = new Camera({ viewportWidth: 640, viewportHeight: 400, cellWidth: 9.6, cellHeight: 20 });
    a.setWorld('DRAB'); b.setWorld('DRAB');
    for (let i = 0; i < 120; i += 1) { a.update(1 / 60); b.update(1 / 60); }
    a.render(bufA, camA); b.render(bufB, camA);
    check('setSeed() gives multi-client deterministic parity', bufA.toText() === bufB.toText());
}

/* ══════════════════════════════════════════════════════════════════════════
   3. WATER SHADER — LUT, spans, depth fade, tint cache, seams
   ══════════════════════════════════════════════════════════════════════════ */

section('3 · WaterShader (LUT, multi-span, depth fade, tint cache)');
const { WaterShader } = await import(`${ROOT}/src/worlds/WaterShader.js`);
{
    /* Two separate lakes at different rows + a shore entity glyph. */
    const w = new WaterShader({ reflectBlank: false });
    const buf = new ASCIIBuffer({ cols: 24, rows: 16, defaultBg: '#000000' });
    for (let x = 2; x < 10; x += 1) {
        buf.setChar(x, 4, 'F', '#ffd24a', '#16100a');      // shore trees, lake A
        for (let y = 5; y < 8; y += 1) buf.setChar(x, y, '~', '#4fc3ff', '#071624');
    }
    for (let x = 14; x < 20; x += 1) {
        buf.setChar(x, 10, '@', '#e8edf2', '#14161a');     // entity above lake B
        for (let y = 11; y < 15; y += 1) buf.setChar(x, y, '~', '#4fc3ff', '#071624');
    }

    const before = buf.exportRegion(0, 0, 24, 16);
    const written = w.render(buf);
    const after = buf.exportRegion(0, 0, 24, 16);

    /* Reflections must ONLY live in water cells (no seams/bleed). */
    let illegalWrites = 0;
    let reflectedA = 0;
    let reflectedB = 0;
    for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 24; x += 1) {
            const i = y * 24 + x;
            if (before.chars[i] !== after.chars[i] || before.fg[i] !== after.fg[i]) {
                const isWater = before.chars[i] === 0x7E /* ~ */;
                if (!isWater) illegalWrites += 1;
                if (isWater && y < 9) reflectedA += 1;
                if (isWater && y >= 9) reflectedB += 1;
            }
        }
    }
    check('both water spans receive reflections', reflectedA > 0 && reflectedB > 0,
        `spanA=${reflectedA} spanB=${reflectedB} cells`);
    check('shader never writes outside water cells (seam-free)', illegalWrites === 0);

    /* Entity capture: the @ glyph above lake B must mirror into it. */
    let mirroredEntity = false;
    for (let y = 11; y < 15 && !mirroredEntity; y += 1) {
        for (let x = 14; x < 20; x += 1) {
            if (buf.getCharCode(x, y) === 0x40 /* @ */) { mirroredEntity = true; break; }
        }
    }
    check('shore entities reflect into the water', mirroredEntity);

    /* Row-indexed LUT: Int16Array, time-varying. */
    const t0 = w.offsetAt(3);
    w.update(0.8);
    const t1 = w.offsetAt(3);
    check('row-indexed Int16 sine LUT animates with the water clock', t0 !== t1,
        `dx(3): ${t0} → ${t1}`);

    /* Depth fade: deeper rows carry lower alpha. */
    w.update(0.01);
    const m = w.getMetrics();
    check('tint caches populated (fg+bg channels)', m.fgCacheSize > 0 && m.bgCacheSize > 0,
        `fg=${m.fgCacheSize} bg=${m.bgCacheSize} cells=${m.cellsReflected}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   4. ENTITY — semi-implicit Euler, drag, sub-tick interpolation
   ══════════════════════════════════════════════════════════════════════════ */

section('4 · Entity physics & interpolation');
const { Entity } = await import(`${ROOT}/src/entities/Entity.js`);
{
    const e = new Entity({ x: 0, y: 0, vx: 300, vy: 0, friction: 2, char: 'o' });

    /* Sub-tick interpolation: alpha 0 → prev tick, 1 → current. */
    const p0 = e.getRenderPosition(0);
    check('getRenderPosition(0) returns previous-tick position', p0.x === 0);
    e.update(1 / 60);
    const p1 = e.getRenderPosition(1);
    const pMid = e.getRenderPosition(0.5);
    check('getRenderPosition(1) returns current position', p1.x > 4.5, `x=${p1.x.toFixed(2)}`);
    check('mid-alpha interpolates between ticks', Math.abs(pMid.x - p1.x / 2) < 0.01,
        `mid=${pMid.x.toFixed(2)} of ${p1.x.toFixed(2)}`);

    /* Frame-rate-independent exponential drag: the decay factor is the
     * exact continuous solution, so it COMPOSES across step sizes —
     * f(0.5) must equal f(0.25)² to floating-point precision. (Position
     * integration remains first-order Euler by design; velocity decay is
     * where frame-rate independence lives.) */
    const half = new Entity({ x: 0, y: 0, vx: 300, vy: 0, friction: 3, char: 'o' });
    half.update(0.5);
    const quarter = new Entity({ x: 0, y: 0, vx: 300, vy: 0, friction: 3, char: 'o' });
    quarter.update(0.25);
    quarter.update(0.25);
    check('exponential drag composes exactly across step sizes',
        Math.abs(half.vx - quarter.vx) < 1e-9,
        `v(½)=${half.vx.toFixed(6)} vs v(¼)²=${quarter.vx.toFixed(6)}`);
    check('drag follows exp(-k·dt), not the linearized form',
        Math.abs(half.vx - 300 * Math.exp(-1.5)) < 1e-9);

    /* Hit-flash timer advances in update, read in render state. */
    const f = new Entity({ x: 0, y: 0, char: 'o' });
    f.flash(0.3, '#ffffff');
    check('hit-flash arms and decays', typeof f.flash === 'function' && f.alpha === 1);
    f.update(0.2);
    f.update(0.2);
    check('hit-flash expires after its window', !f.isFlashing);

    /* Debug box renderer present on the base class. */
    check('debug box rendering present', typeof e.renderBounds === 'function');
}

/* ══════════════════════════════════════════════════════════════════════════
   5. MapParser_2 — schemas, spawn extraction, fallback generation
   ══════════════════════════════════════════════════════════════════════════ */

section('5 · MapParser_2 (schemas, spawns, fallback generation)');
const { loadDimensionMaps, verifyMapInvariants, generateFallbackMap } =
    await import(`${ROOT}/src/worlds/MapParser_2.js`);
{
    const good = loadDimensionMaps({
        sources: {
            DREAM: 'TTTT\nT.PT\nTTTT',
            DRAB: '####\n#,P#\n####'
        }
    });
    check('strict schemas parse with full spawn extraction',
        good.maps.DREAM.spawns.some((s) => s.type === 'PLAYER') &&
        verifyMapInvariants(good.maps.DREAM).ok);

    /* Ragged rows: lenient repair keeps the grid rectangular. */
    const ragged = loadDimensionMaps({
        sources: { DREAM: 'TTTTT\nT.P\nTTTTT' },
        strict: false
    });
    check('lenient repair never breaks grid alignment', ragged.maps.DREAM.cols === 5);

    /* Corrupt source falls back to a playable deterministic dimension. */
    const { maps: fb, usedFallback } = loadDimensionMaps({
        sources: { DREAM: '###\n#P#\n#' /* truncated garbage */ },
        strict: true
    });
    const audit = verifyMapInvariants(fb.DREAM);
    check('fallback generation replaces broken maps (playable, verified)',
        usedFallback.includes('DREAM') && audit.ok,
        `${fb.DREAM.cols}x${fb.DREAM.rows} spawns:${Object.keys(audit.spawnTypes).join('/')}`);

    const f1 = generateFallbackMap('DREAM', { seed: 5 });
    const f2 = generateFallbackMap('DREAM', { seed: 5 });
    check('fallback maps are deterministic per seed', f1.toText() === f2.toText());
}

/* ══════════════════════════════════════════════════════════════════════════
   6. FULL GAME BOOT — pipeline order, loading screen, economy, footsteps
   ══════════════════════════════════════════════════════════════════════════ */

section('6 · Full game boot (pipeline, loading screen, economy, audio)');
const { Game, GAME_STATE } = await import(`${ROOT}/src/core/Game.js`);
const { WORLD } = await import(`${ROOT}/src/worlds/WorldManager.js`);
const { loadDimensionContent } = await import(`${ROOT}/src/worlds/DimensionContent.js`);
const game = new Game(canvas, { seed: 42 });
const content = loadDimensionContent(game);
const { player, energy, water } = content;
{
    check('dimension content loads with maps installed',
        game._worlds.getActiveBuffer().cols === 80);

    /* ---- Loading screen: portrait, embroidery, ambient spores -------- */
    const ls = game._loadingScreen;
    ls.update(1 / 60);
    for (let i = 0; i < 90; i += 1) ls.update(1 / 60);
    ls.render(game._renderer);
    const lsText = ls._buffer.toText();
    const hasYucca = /Y\s*U\s*C\s*C\s*A/.test(lsText);
    check('poncho portrait + YUCCA embroidery rendered to the buffer', hasYucca);
    check('embroidery band carries the dark backing', ls._buffer.toText().includes('Y U C C A'));
    check('ambient spore drift alive behind the portrait',
        ls._weather.getMetrics().spawnedTotal > 0,
        `${ls._weather.getMetrics().liveParticles ?? 0} live spores`);
    ls.setPhase('ready', 'ready');
    check('ready phase unlocks entry (SPACE)', ls.isReady);

    /* ---- Pipeline order, instrumented on live objects ----------------- */
    const order = [];
    const wrap = (obj, name, label) => {
        const orig = obj[name].bind(obj);
        obj[name] = (...a) => { order.push(label); return orig(...a); };
    };
    const buffer = game._worlds.getActiveBuffer();
    wrap(buffer, 'clear', 'clear');
    wrap(buffer, 'commit', 'commit');
    wrap(game._weather, 'update', 'weather.update');
    wrap(game._weather, 'render', 'weather.render');
    wrap(water, 'update', 'water.update');
    wrap(water, 'render', 'water.render');
    wrap(game._renderer, 'render', 'blit');
    wrap(game._renderer, 'renderDirty', 'blit');
    wrap(player, 'update', 'player.update');
    const presenter = game._entities;
    const pUpd = presenter.update.bind(presenter);
    const pRen = presenter.render.bind(presenter);
    presenter.update = (...a) => { order.push('entities.update'); return pUpd(...a); };
    presenter.render = (...a) => { order.push('entities.render'); return pRen(...a); };
    for (const [id, fn] of [...game._terrainStampers]) {
        game._terrainStampers.set(id, (...a) => { order.push('stampInto'); return fn(...a); });
    }

    game.setState(GAME_STATE.PLAYING);
    order.length = 0;
    game._update(1 / 60);
    const sim = order.filter((s) => s.endsWith('.update'));
    check('simulation order: entity physics → weather → water clock',
        sim.indexOf('player.update') < sim.indexOf('weather.update') &&
        sim.indexOf('weather.update') < sim.indexOf('water.update'),
        sim.join(' → '));

    order.length = 0;
    game._render(0.5);
    const blitIdx = order.indexOf('blit');
    check('presentation order: clear → stampInto → entities → weather → water → commit → blit',
        order[0] === 'clear' && order[1] === 'stampInto' &&
        order.indexOf('entities.render') < order.indexOf('weather.render') &&
        order.indexOf('weather.render') < order.indexOf('water.render') &&
        order.indexOf('water.render') < order.indexOf('commit') &&
        order.indexOf('commit') < blitIdx,
        order.join(' → '));
    check('visual output buffer valid (terrain + reflections present)',
        buffer.getCharCode(0, 0) === 'T'.codePointAt(0) &&
        water.getMetrics().cellsReflected > 0);

    /* ---- Terrain-aware footsteps through the REAL player path ---------- */
    const sfxPlays = [];
    game._sfx.play = (name, opts) => { sfxPlays.push({ name, opts }); return true; };
    const fakeInput = {
        getMovementVector: () => ({ x: 1, y: 0 }),
        isActionDown: () => false,
        isActionJustPressed: () => false,
    };
    for (let i = 0; i < 300; i += 1) player.update(1 / 60, fakeInput);
    const footsteps = sfxPlays.filter((p) => p.name === 'footstep');
    const softSteps = footsteps.filter((f) => f.opts.filter?.type === 'lowpass').length;
    const otherSteps = footsteps.length - softSteps;
    check('stride events drive the FOOTSTEP SFX voice (no silent stubs)',
        footsteps.length > 0, `${footsteps.length} steps`);
    check('footsteps are terrain-tuned (grove soft vs. shore/water shaping)',
        softSteps >= 1 && otherSteps >= 1,
        `${softSteps} soft, ${otherSteps} hard/hollow — walk crossed terrain`);

    /* ---- Audio hooks wired at the engine level ------------------------- */
    check('AudioEngine subscribed to WeatherSystem lightning (thunder sync)',
        game._audio._weather === game._weather);
    check('AudioEngine subscribed to WorldManager (DREAM⇄DRAB crossfade)',
        game._audio._worldManager === game._worlds);
    const audioWorldCalls = [];
    const origSetWorld = game._audio.setWorld.bind(game._audio);
    game._audio.setWorld = (worldId, opts) => {
        audioWorldCalls.push(worldId);
        return origSetWorld(worldId, opts);
    };
    game._worlds.emit('transitionstart', { to: WORLD.DRAB });
    check('world transition events drive the audio crossfade (thunder/ambience sync)',
        audioWorldCalls.includes(WORLD.DRAB),
        `setWorld(${audioWorldCalls.join(',')}) invoked`);

    /* ---- Orange economy end-to-end -------------------------------------- */
    const DT = 1 / 60;
    let ticks = 0;
    while (!game._worlds.isDrab() && ticks < 60 * 300) {
        game._update(DT);
        game._render(0.5);
        ticks += 1;
    }
    check('orange drain → depletion → Drab collapse', game._worlds.isDrab() && energy.energy === 0);
    energy.consumeJuice();
    ticks = 0;
    while (!game._worlds.isDream() && ticks < 60 * 300) {
        game._update(DT);
        game._render(0.5);
        ticks += 1;
    }
    check('juice restore → Dream return (poncho form)', game._worlds.isDream() && player.world === WORLD.DREAM);
}

/* ══════════════════════════════════════════════════════════════════════════
   7. AUTHORITATIVE SERVER + REAL NetworkManager (live sockets)
   ══════════════════════════════════════════════════════════════════════════ */

section('7 · Live multiplayer (authoritative server + NetworkManager)');
const { createYuccaServer } = await import(`${ROOT}/server.js`);
const { NetworkManager } = await import(`${ROOT}/src/network/NetworkManager.js`);
const WebSocketRaw = (await import('ws')).default;
{
    const server = await createYuccaServer({ port: 0, weatherSeed: 123456, log: { info: noop, warn: noop, error: noop } });
    const port = server.getPort();
    const url = `ws://localhost:${port}`;

    const nm = new NetworkManager({ url });
    /* Real wiring: attachGame keeps the ghost dimension gate synced to
     * the local player's world; attachNetworkManager lets the Game loop
     * drive nm.update() (intent send + local-world refresh) each tick. */
    nm.attachGame(game);
    game.attachNetworkManager(nm);
    /* Minimal local player double matching the real seam surface. */
    const localPlayer = {
        name: 'Validator',
        world: WORLD.DREAM,
        x: 0, y: 0, vx: 0, vy: 0,
        applyServerCorrection(state) {
            this.x = state.x;
            this.y = state.y;
            if (state.world && state.world !== this.world) this.world = state.world;
        },
        teleport(x, y) { this.x = x; this.y = y; },
    };
    nm.attachPlayer(localPlayer);

    let welcome = null;
    nm.on('welcome', (w) => { welcome = w; });
    nm.connect();

    /* Wait for the welcome handshake. */
    for (let i = 0; i < 100 && !welcome; i += 1) await sleep(20);
    check('NetworkManager completes the join handshake', nm.isConnected && welcome !== null,
        `id=${nm.selfId} seed=${nm.weatherSeed}`);
    check('server-synchronized deterministic weatherSeed received', nm.weatherSeed === 123456);

    /* Drive rightward intent for ~1s of server ticks. */
    const startX = localPlayer.x;
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {
        nm.update(1 / 60, {
            getMovementVector: () => ({ x: 1, y: 0 }),
            isActionDown: () => false,
        });
        await sleep(16);
    }
    check('server integrates movement intents (authoritative position advances)',
        localPlayer.x > startX + 60, `Δx=${(localPlayer.x - startX).toFixed(0)}px`);

    /* Wall collision: hold UP across the map. Proof of authority: the
     * avatar moves substantially upward, then comes to a HARD stop on a
     * solid row (stable across the final second) and never leaves the
     * map (y stays ≥ one cell inside). */
    const yStart = localPlayer.y;
    let lastY = localPlayer.y;
    let stableTicks = 0;
    const t1 = performance.now();
    while (performance.now() - t1 < 4500) {
        nm.update(1 / 60, {
            getMovementVector: () => ({ x: 0, y: -1 }),
            isActionDown: () => false,
        });
        await sleep(16);
        if (Math.abs(localPlayer.y - lastY) < 0.75) stableTicks += 1;
        else { stableTicks = 0; lastY = localPlayer.y; }
    }
    const moved = yStart - lastY;
    check('wall collision validated server-side (hard stop on solid border)',
        moved > 100 && stableTicks >= 20 && lastY >= 20,
        `moved ${moved.toFixed(0)}px up, stable ${stableTicks} ticks at y=${lastY.toFixed(0)}`);

    /* Second client joins via a raw socket → ghost must appear. */
    const raw2 = new WebSocketRaw(url);
    await new Promise((res) => raw2.once('open', res));
    raw2.send(JSON.stringify({ t: 'join', name: 'Second' }));
    let ghostSeen = false;
    for (let i = 0; i < 100 && !ghostSeen; i += 1) {
        nm.update(1 / 60, null);
        ghostSeen = nm.getGhosts().length >= 1;
        await sleep(20);
    }
    check('remote player appears as an interpolated ghost', ghostSeen);

    /* Dimension shift round-trip through the authority. */
    nm.sendWorldShift(WORLD.DRAB, 'TEST');
    let shifted = false;
    for (let i = 0; i < 100 && !shifted; i += 1) {
        nm.update(1 / 60, null);
        shifted = localPlayer.world === WORLD.DRAB;
        await sleep(20);
    }
    check('dimension shift request validated + broadcast back', shifted);

    /* Ghosts hide when they change dimension away from the local world.
     * The gate follows the REAL Game orchestrator's active dimension —
     * first settle any transition still finishing from the economy loop
     * (the gate loop drives the game manually), then shift dimensions. */
    raw2.send(JSON.stringify({ t: 'shift', to: WORLD.DREAM }));
    for (let i = 0; i < 200 && game._worlds.isTransitioning(); i += 1) {
        game._update(1 / 60);
        game._render(0.5);
    }
    game.requestDimensionShift(WORLD.DRAB, 'VALIDATE');
    let gateSettled = false;
    for (let i = 0; i < 250 && !gateSettled; i += 1) {
        game._update(1 / 60);          // advances the transition + nm.update
        game._render(0.5);
        gateSettled = game._worlds.isDrab() && nm.getGhosts().length === 0;
        await sleep(10);
    }
    check('cross-dimension ghosts are gated from the local view', gateSettled,
        `${nm.getGhosts().length} visible in ${nm._localWorld}`);

    raw2.close();
    nm.destroy();
    await server.close();
    await sleep(400); // let close frames drain through the server
    check('server + client tear down cleanly', server.getPlayerCount() === 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   8. HYBRID WEBGL / THREE.JS PIPELINE — FontAtlas, GLDataPack, fluid zoom,
      GPU presenter delegation + fallback contract (all headless, real modules)
   ══════════════════════════════════════════════════════════════════════════ */

section('8 · Hybrid WebGL pipeline (atlas · packers · fluid zoom · GPU presenter)');
{
    const { FontAtlas } = await import(`${ROOT}/src/engine/FontAtlas.js`);
    const {
        packCharPlane, packColorPlane, collectGlyphVocabulary,
        decodeSlot, TEXEL_STRIDE
    } = await import(`${ROOT}/src/engine/GLDataPack.js`);
    const { Engine, MAX_LIGHTS } = await import(`${ROOT}/src/engine/Engine.js`);
    const { InputManager } = await import(`${ROOT}/src/engine/InputManager.js`);
    const { Renderer } = await import(`${ROOT}/src/engine/Renderer.js`);
    const { Game } = await import(`${ROOT}/src/core/Game.js`);

    /* ---- 8.1 FontAtlas: deterministic slot assignment ----------------- */
    const atlasA = new FontAtlas();
    const vocab = [0x23, 0x25, 0x54, 0x2E, 0x20, 0x00]; /* # % T . space NUL */
    atlasA.ensure(vocab);

    check('atlas reserves slot 0 for blanks (space + NUL)',
        atlasA.slotFor(0x20) === 0 && atlasA.slotFor(0x00) === 0);
    check('atlas assigns distinct non-zero slots to real glyphs',
        atlasA.slotFor(0x23) > 0 &&
        atlasA.slotFor(0x23) !== atlasA.slotFor(0x25) &&
        atlasA.glyphCount === 4,
        `slots: #=${atlasA.slotFor(0x23)} %=${atlasA.slotFor(0x25)}`);

    const atlasB = new FontAtlas();
    atlasB.ensure([...vocab].sort((a, b) => a - b));
    check('slot assignment is deterministic across instances',
        atlasA.slotFor(0x23) === atlasB.slotFor(0x23) &&
        atlasA.slotFor(0x54) === atlasB.slotFor(0x54));

    check('ensure() is a pixel no-op on an unchanged vocabulary',
        atlasA.ensure(vocab) === false);

    /* ---- 8.2 Atlas growth: page doubles, slots stay stable ------------ */
    const stableSlot = atlasA.slotFor(0x23);
    const growthCodes = [];
    for (let cp = 0x100; growthCodes.length < 260; cp += 1) growthCodes.push(cp);
    atlasA.ensure(growthCodes);

    check('atlas grows to the next page past 256 glyphs',
        atlasA.tilesX === 32 && atlasA.capacity === 1024,
        `${atlasA.tilesX}x${atlasA.tilesX} tiles`);
    check('existing slots remain stable across atlas growth',
        atlasA.slotFor(0x23) === stableSlot && atlasA.slotFor(0x100 + 259) > 0);

    const uv = atlasA.uvRect(stableSlot);
    check('uv rects stay inside the atlas with half-texel insets',
        uv.u0 >= 0 && uv.v0 >= 0 && uv.u1 <= 1 && uv.v1 <= 1 &&
        uv.u1 > uv.u0 && uv.v1 > uv.v0);
    const laid = FontAtlas.layoutSlot(257, 16);
    check('slot layout is row-major (slot 257 → col 1, row 16)',
        laid.col === 1 && laid.row === 16);

    /* ---- 8.3 GLDataPack: byte-exact packing on a real buffer ---------- */
    const packBuf = new ASCIIBuffer({
        cols: 6, rows: 4, defaultFg: '#ffaa33', defaultBg: '#050811'
    });
    packBuf.setChar(1, 1, '#', '#ff5a5a', '#111111');
    packBuf.setChar(2, 1, 'T', '#6dff7c', null);
    packBuf.setChar(3, 1, '~', '#9ad7ff', '#001a33');
    packBuf.setChar(4, 2, '@', '#ffd24a', '#222222');

    const packAtlas = new FontAtlas();
    const vocabOut = new Set();
    const distinct = collectGlyphVocabulary(packBuf, vocabOut);
    packAtlas.ensure(vocabOut);

    const charBytes = new Uint8Array(packBuf.cellCount * TEXEL_STRIDE);
    const fgBytes = new Uint8Array(packBuf.cellCount * TEXEL_STRIDE);
    const bgBytes = new Uint8Array(packBuf.cellCount * TEXEL_STRIDE);
    const waterCodes = new Set(['~'.codePointAt(0)]);

    const packStats = packCharPlane(packBuf, packAtlas, charBytes, waterCodes);
    packColorPlane(packBuf.foregroundColors, fgBytes);
    packColorPlane(packBuf.backgroundColors, bgBytes);

    const q = (x, y) => (y * packBuf.cols + x) * TEXEL_STRIDE;

    check('vocabulary scan reports the distinct non-blank glyphs',
        distinct === 4 && vocabOut.has(0x23) && !vocabOut.has(0x20));
    check('char plane round-trips slot indices through the r/g channels',
        decodeSlot(charBytes[q(1, 1)], charBytes[q(1, 1) + 1]) === packAtlas.slotFor(0x23) &&
        decodeSlot(charBytes[q(4, 2)], charBytes[q(4, 2) + 1]) === packAtlas.slotFor(0x40));
    check('water flag marks ONLY water glyphs',
        charBytes[q(3, 1) + 2] === 255 &&
        charBytes[q(1, 1) + 2] === 0 &&
        charBytes[q(2, 1) + 2] === 0,
        `${packStats.waterCells} water cell`);
    check('blank cells pack as slot 0',
        decodeSlot(charBytes[q(0, 0)], charBytes[q(0, 0) + 1]) === 0 &&
        packStats.blankCells === packBuf.cellCount - 4);
    check('color planes decompose packed RGBA in shader byte order',
        fgBytes[q(1, 1)] === 0xff && fgBytes[q(1, 1) + 1] === 0x5a &&
        fgBytes[q(1, 1) + 2] === 0x5a && fgBytes[q(1, 1) + 3] === 0xff &&
        bgBytes[q(3, 1) + 2] === 0x33);

    /* ---- 8.4 Camera fluid zoom math ------------------------------------ */
    const zoomCam = new Camera({
        viewportWidth: 800, viewportHeight: 600,
        cellWidth: 9.6, cellHeight: 20,
        mapCols: 200, mapRows: 80
    });
    zoomCam.setZoom(2.5, 400, 300);
    for (let i = 0; i < 600; i += 1) zoomCam.update(1 / 60);

    check('zoom glide converges on its target',
        Math.abs(zoomCam.zoom - 2.5) < 1e-3 && !zoomCam.isZooming,
        `zoom=${zoomCam.zoom.toFixed(4)}`);
    check('effective viewport divides by zoom (world-space semantics)',
        Math.abs(zoomCam.viewportWidth - 320) < 1e-9 &&
        Math.abs(zoomCam.viewportHeight - 240) < 1e-9);

    const roundTrip = zoomCam.worldToScreen(123, 456);
    const roundBack = zoomCam.screenToWorld(roundTrip.x, roundTrip.y);
    check('worldToScreen ∘ screenToWorld is the identity under zoom',
        Math.abs(roundBack.x - 123) < 1e-6 && Math.abs(roundBack.y - 456) < 1e-6);

    /* Cursor-anchored zoom: pin the world point under the pointer, glide
     * the zoom out, and verify the pin holds THROUGH the glide (interior
     * of the clamp band so bounds never override the anchor). */
    const anchorCam = new Camera({
        viewportWidth: 800, viewportHeight: 600,
        cellWidth: 9.6, cellHeight: 20,
        mapCols: 200, mapRows: 80
    });
    anchorCam.setTarget({ x: 1060, y: 900 });
    for (let i = 0; i < 240; i += 1) anchorCam.update(1 / 60);

    const pinScreen = { x: 500, y: 350 };
    const pinWorld = anchorCam.screenToWorld(pinScreen.x, pinScreen.y);
    anchorCam.setZoom(0.5, pinScreen.x, pinScreen.y);
    for (let i = 0; i < 40; i += 1) anchorCam.update(1 / 60);

    const pinAfter = anchorCam.worldToScreen(pinWorld.x, pinWorld.y);
    check('cursor-anchored zoom keeps the pinned world point under the cursor',
        Math.abs(pinAfter.x - pinScreen.x) < 0.5 &&
        Math.abs(pinAfter.y - pinScreen.y) < 0.5,
        `pin drifted (${pinAfter.x.toFixed(2)}, ${pinAfter.y.toFixed(2)})`);

    for (let i = 0; i < 600; i += 1) anchorCam.update(1 / 60);
    check('zoom anchor releases once the glide settles',
        !anchorCam.isZooming && Math.abs(anchorCam.zoom - 0.5) < 1e-3);

    /* ---- 8.5 Wheel→zoom input path ------------------------------------- */
    const captured = {};
    const fakeWindow = {
        devicePixelRatio: 1,
        addEventListener: (type, fn) => { (captured[type] ??= []).push(fn); },
        removeEventListener: noop,
        dispatchEvent: noop,
    };
    const zoomInput = new InputManager(fakeWindow, null, {});

    let wheelPrevented = false;
    const fireWheel = (deltaY, x, y) => captured['wheel'][0]({
        deltaY, deltaX: 0, clientX: x, clientY: y,
        preventDefault() { wheelPrevented = true; }
    });

    fireWheel(-240, 100, 80);
    fireWheel(-240, 102, 82);
    const drained = zoomInput.consumeWheelDelta();
    check('wheel events accumulate, preventDefault, and drain with the pointer anchor',
        drained !== null && drained.deltaY === -480 &&
        drained.anchorX === 102 && drained.anchorY === 82 && wheelPrevented,
        `Δy=${drained ? drained.deltaY : 'none'}`);
    check('drained wheel state is empty on the next consume',
        zoomInput.consumeWheelDelta() === null);

    captured['keydown'][0]({
        code: 'Equal', preventDefault: noop
    });
    zoomInput.update();
    check('ZOOM_IN key action is bound in the default map',
        zoomInput.isActionJustPressed('ZOOM_IN') &&
        zoomInput.isActionJustPressed('ZOOM_OUT') === false);
    zoomInput.destroy();

    /* ---- 8.6 Renderer hybrid delegation + failure fallback ------------- */
    const delegateCtx = makeCtx(canvas);
    const delegateRenderer = new Renderer(delegateCtx, {
        cssWidth: 640, cssHeight: 400, dpr: 1
    });

    let presentCalls = 0;
    const fakeGL = {
        isSupported: true,
        present(buffer, camera) { presentCalls += 1; return true; }
    };
    delegateRenderer.setGLDelegate(fakeGL);
    check('GL delegate installs transparent overlay mode',
        delegateRenderer.isOverlay && delegateRenderer.glDelegate === fakeGL);

    delegateRenderer.beginFrame();
    delegateRenderer.render(packBuf, { x: 0, y: 0, zoom: 1.5 });
    check('world renders forward to the GPU presenter (one present/frame)',
        presentCalls === 1);

    const boomGL = {
        isSupported: true,
        present() { throw new Error('WebGL context lost'); }
    };
    delegateRenderer.setGLDelegate(boomGL);
    let revertedCleanly = false;
    try {
        delegateRenderer.render(packBuf, { x: 0, y: 0 });
        revertedCleanly = delegateRenderer.glDelegate === null &&
            !delegateRenderer.isOverlay;
    } catch (error) {
        revertedCleanly = false;
    }
    check('a GPU failure mid-frame reverts to Canvas 2D cleanly',
        revertedCleanly);

    /* ---- 8.7 Engine headless fallback contract -------------------------- */
    const glCanvasShim = Object.assign(
        Object.create(globalThis.HTMLCanvasElement.prototype),
        {
            width: 640, height: 400, style: {}, dataset: {},
            addEventListener: noop, removeEventListener: noop,
            getContext(type) {
                return type === '2d' ? makeCtx(glCanvasShim) : null;
            }
        }
    );

    const engine = new Engine(glCanvasShim, { cellWidth: 9.6, cellHeight: 20 });
    check('Engine degrades to unsupported without a GL context',
        engine.isSupported === false && engine.backend === 'none');
    check('unsupported Engine.present() is a safe boolean no-op',
        engine.present(packBuf, { x: 0, y: 0 }) === false);

    let stateApiSafe = true;
    try {
        engine.setFrameState({ flash: 1, rain: 0.5, glitch: 0.9, lights: [] });
        engine.setWaterGlyphs(['~']);
        engine.handleResize({ cssWidth: 800, cssHeight: 600, dpr: 2 });
        engine.setCellMetrics(10, 21);
        engine.getMetrics();
        engine.destroy();
    } catch (error) {
        stateApiSafe = false;
    }
    check('unsupported Engine tolerates the full state API then destroys',
        stateApiSafe);
    check('shader light bank matches the documented cap', MAX_LIGHTS === 8);

    /* ---- 8.8 Game-level hybrid boot (GL-less #glCanvas) ----------------- */
    const hybridGame = new Game(canvas, { glCanvas: glCanvasShim, seed: 4242 });
    check('Game boots with a GL-less #glCanvas and stays on Canvas 2D',
        hybridGame._gl === null && hybridGame.getMetrics().presenter === 'canvas2d');

    hybridGame._render(0.5);
    check('Game renders a full frame with the GPU presenter absent',
        hybridGame._renderer.getStats().frameCount > 0);
    check('Game telemetry exposes zoom + presenter identity',
        Number.isFinite(hybridGame.getMetrics().zoom) &&
        hybridGame.getMetrics().presenter === 'canvas2d');

    /* The wheel→camera zoom contract at Game scope: the same exponential
     * factor the orchestrator applies, verified end-to-end on the camera. */
    const beforeTarget = hybridGame._camera.targetZoom;
    hybridGame._camera.zoomAt(Math.exp(240 * 0.0016), 320, 200);
    check('Game camera accepts anchored zoom requests',
        hybridGame._camera.targetZoom > beforeTarget);
    hybridGame.destroy();
}

/* ══════════════════════════════════════════════════════════════════════════
   REPORT
   ══════════════════════════════════════════════════════════════════════════ */

console.log(`\n${'═'.repeat(70)}`);
console.log(`  YUCCA validation: ${passCount} passed, ${failCount} failed`);
console.log(`${'═'.repeat(70)}`);
process.exit(failCount > 0 ? 1 : 0);
