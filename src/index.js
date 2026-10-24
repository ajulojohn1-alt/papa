/**
 * @file src/index.js
 * @module index
 * @description
 * Application bootstrap for "YUCCA".
 *
 * This is the single bridge between the browser and the engine. It owns
 * everything the engine deliberately leaves DOM-agnostic: canvas discovery,
 * high-DPI backing-store scaling, window resize refits, tab-visibility
 * pause/resume, fatal error presentation, and the developer console hook.
 *
 * The GameLoop header is explicit about this split of responsibility:
 * "This class is DOM-agnostic beyond rAF/cAF: it registers no window or
 *  document listeners. Visibility-based pause/resume and resize refits are
 *  owned by src/index.js." This module is that owner.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BOOT SEQUENCE
 * ───────────────────────────────────────────────────────────────────────────
 *     1. Wait for DOM readiness (DOMContentLoaded or already-loaded).
 *     2. Locate #gameCanvas; fatal-overlay if missing.
 *     3. Acquire a 2D context; fatal-overlay if unsupported.
 *     4. Fit the backing store to CSS size × devicePixelRatio (Retina).
 *     5. Instantiate the Game orchestrator (it builds Renderer, Input,
 *        GameLoop, WorldManager, Weather, Audio, UI internally).
 *     6. Expose window.game for console debugging.
 *     7. Install global listeners (resize, visibility, blur/focus, errors).
 *     8. Await game.start() → runs the preloader and enters MAIN_MENU.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HIGH-DPI / RETINA SCALING MATH
 * ───────────────────────────────────────────────────────────────────────────
 * The canvas has two sizes:
 *     CSS size     — layout box the browser composites (rect.width/height).
 *     backing size — physical pixel buffer (canvas.width/height).
 * For crisp glyphs on Retina displays the backing store is scaled up:
 *     backingWidth  = round(cssWidth  × dpr)
 *     backingHeight = round(cssHeight × dpr)
 * The Renderer then installs ctx.setTransform(dpr, 0, 0, dpr, 0, 0) so all
 * draw calls stay expressed in CSS pixels. We cap dpr at MAX_DEVICE_PIXEL_RATIO
 * to bound fill-rate cost on 3×/4× panels — ASCII glyphs read cleanly at 2×.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RESIZE COALESCING
 * ───────────────────────────────────────────────────────────────────────────
 * Window resize events can fire dozens of times per drag. We coalesce them
 * to at most one refit per animation frame via requestAnimationFrame, then
 * propagate a single displayInfo snapshot through Game.handleResize(), which
 * fans out to the Renderer, Camera, and WeatherSystem.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * VISIBILITY & FOCUS PAUSE POLICY
 * ───────────────────────────────────────────────────────────────────────────
 * When the user switches tabs, minimizes, or blurs the window, the loop is
 * suspended with GameLoop.pause() (which keeps the accumulator but cancels
 * the rAF chain — zero CPU/battery while hidden). On return it resumes.
 * This is a "soft" pause: it does NOT touch the game's state machine, so an
 * in-game ESC-pause or a MAIN_MENU stay exactly as they were. GameLoop's
 * pause()/resume() are idempotent and guard their own lifecycle, so stacking
 * blur + visibilitychange + pagehide is safe.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERROR BOUNDARY
 * ───────────────────────────────────────────────────────────────────────────
 * Initialization runs inside try/catch and renders a friendly full-screen
 * overlay on failure (missing canvas, no 2D context, constructor throw).
 * Runtime errors are caught via window 'error' / 'unhandledrejection'; the
 * GameLoop deliberately re-throws simulation failures into this channel, so
 * a corrupted world halts loudly here instead of silently desyncing.
 * Extension-injected errors (chrome-extension:// frames) are filtered out.
 *
 * @example
 * <!-- index.html -->
 * <canvas id="gameCanvas" tabindex="0"></canvas>
 * <script type="module" src="./src/index.js"></script>
 *
 * // Console debugging after boot:
 * window.game.getMetrics();
 * window.game._loop.getMetrics();
 * window.game.requestDimensionShift('DRAB', 'SCRIPTED');
 */

import { Game } from './core/Game.js';
import { loadDimensionContent } from './worlds/DimensionContent.js';
import { NetworkManager } from './network/NetworkManager.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** DOM id of the render surface declared in index.html. */
const CANVAS_ID = 'gameCanvas';

/**
 * Cap on the device pixel ratio used for the backing store. Real device
 * ratios of 3–4 quadruple fill cost for imperceptible glyph sharpness on
 * monospaced text; 2 is the standard quality/performance inflection point.
 * @type {number}
 */
const MAX_DEVICE_PIXEL_RATIO = 2;

/** Fixed simulation tick forwarded to the Game orchestrator, seconds. */
const FIXED_TIME_STEP = 1 / 60;

/* ══════════════════════════════════════════════════════════════════════════
   MODULE STATE
   ══════════════════════════════════════════════════════════════════════════ */

/** @type {?Game} Live orchestrator once boot succeeds. */
let game = null;

/** @type {?HTMLCanvasElement} Render surface reference. */
let canvas = null;

/** @type {?number} Pending resize rAF handle (coalescing guard). */
let resizeFrame = null;

/** @type {boolean} Latch so the fatal overlay renders exactly once. */
let fatalErrorShown = false;

/** @type {boolean} Latch so boot runs exactly once. */
let bootstrapped = false;

/* ══════════════════════════════════════════════════════════════════════════
   FATAL ERROR PRESENTATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Renders a full-screen, user-friendly failure overlay and logs the detail.
 * Idempotent: only the first fatal condition is surfaced, so a cascade of
 * follow-on errors cannot stack overlays.
 * @param {string} title Short headline.
 * @param {string} detail Human-readable explanation.
 * @returns {void}
 */
function showFatalOverlay(title, detail) {
    if (fatalErrorShown) return;
    fatalErrorShown = true;
    console.error(`[index] ${title}:`, detail);

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(0,0,0,0.92)', 'color:#d7e3ee',
        'font-family:monospace', 'text-align:center', 'padding:2rem'
    ].join(';');

    const box = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.cssText = 'color:#ff7700;font-size:1.4rem;margin-bottom:1rem;';
    const message = document.createElement('p');
    message.textContent = detail;
    message.style.cssText = 'max-width:40rem;line-height:1.6;';
    const hint = document.createElement('p');
    hint.textContent = 'Try reloading the page. If this persists, your browser ' +
        'may not support the Canvas features this game requires.';
    hint.style.cssText = 'color:#6d7c8c;margin-top:1.25rem;font-size:0.85rem;';

    box.appendChild(heading);
    box.appendChild(message);
    box.appendChild(hint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS SIZING (HIGH-DPI)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Measures the canvas CSS box, sizes the physical backing store by the
 * (capped) device pixel ratio, and returns the display snapshot consumed
 * by Renderer.handleResize(). Setting canvas.width/height resets context
 * state, which is safe here because the Renderer re-applies its DPR
 * transform and invalidates its cache on every resize.
 * @returns {{cssWidth:number, cssHeight:number, backingWidth:number,
 *            backingHeight:number, dpr:number}}
 */
function fitCanvasToDisplay() {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    const rawDpr = (typeof window.devicePixelRatio === 'number' &&
        window.devicePixelRatio > 0)
        ? window.devicePixelRatio
        : 1;
    const dpr = Math.min(rawDpr, MAX_DEVICE_PIXEL_RATIO);

    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));

    // Only touch the backing store when it actually changed; writing
    // canvas.width clears it and resets GL state, so skip redundant writes.
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
    }

    return { cssWidth, cssHeight, backingWidth, backingHeight, dpr };
}

/* ══════════════════════════════════════════════════════════════════════════
   RESIZE HANDLING (COALESCED)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Performs one resize refit: rescales the backing store and forwards the
 * new metrics through the Game orchestrator.
 * @returns {void}
 */
function applyResize() {
    if (!game || !canvas) return;
    const displayInfo = fitCanvasToDisplay();
    game.handleResize(displayInfo);
}

/**
 * Schedules a coalesced resize so a burst of resize events collapses into
 * a single refit on the next animation frame.
 * @returns {void}
 */
function scheduleResize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        applyResize();
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   VISIBILITY / FOCUS PAUSE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Suspends or resumes the engine's rAF pump without altering game state.
 * GameLoop.pause()/resume() are idempotent and self-guarding, so repeated
 * or overlapping calls from blur + visibilitychange + pagehide are safe.
 * @param {boolean} paused True to suspend, false to resume.
 * @returns {void}
 */
function setEnginePaused(paused) {
    if (!game) return;
    const loop = game._loop;
    if (!loop) return;
    if (paused) {
        loop.pause();
    } else {
        loop.resume();
    }
}

/**
 * Reacts to the Page Visibility API.
 * @returns {void}
 */
function handleVisibilityChange() {
    setEnginePaused(document.hidden);
}

/* ══════════════════════════════════════════════════════════════════════════
   GLOBAL ERROR HOOKS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Window error hook. The GameLoop re-throws fatal simulation errors into
 * this channel; browser-extension frames are filtered so they cannot trip
 * the overlay.
 * @param {ErrorEvent} event Native error event.
 * @returns {void}
 */
function handleWindowError(event) {
    if (event.filename &&
        /^(chrome-extension|moz-extension|safari-web-extension):/.test(event.filename)) {
        return;
    }
    showFatalOverlay('YUCCA hit a snag',
        event.message || 'An unexpected error occurred.');
}

/**
 * Unhandled promise rejection hook (async boot / map-loader failures).
 * @param {PromiseRejectionEvent} event Native rejection event.
 * @returns {void}
 */
function handleUnhandledRejection(event) {
    const reason = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    showFatalOverlay('YUCCA hit a snag', reason);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT OPTIONS (URL-DRIVEN OVERRIDES FOR TESTING)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Reads optional query-string overrides so QA can pin a PRNG seed or force
 * a starting dimension without editing code: ?seed=12345&world=DRAB.
 * @returns {Object} Game constructor option overrides.
 */
function readBootOptions() {
    const options = { fixedTimeStep: FIXED_TIME_STEP };
    try {
        const params = new URLSearchParams(window.location.search);
        const seed = params.get('seed');
        if (seed !== null && seed !== '') {
            const parsed = parseInt(seed, 10);
            if (Number.isInteger(parsed)) options.seed = parsed;
        }
        const world = params.get('world');
        if (world === 'DREAM' || world === 'DRAB') {
            options.initialWorld = world;
        }
    } catch (error) {
        // URL parsing is a convenience; never let it block boot.
        console.warn('[index] Could not read boot options from URL:', error);
    }
    return options;
}

/* ══════════════════════════════════════════════════════════════════════════
   GLOBAL LISTENER INSTALLATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Wires all window/document-level listeners. Called once, after the Game
 * exists, so every handler can assume `game` is present (with its own
 * internal guards as a second line of defense).
 * @returns {void}
 */
function installGlobalListeners() {
    // Viewport geometry.
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);

    // Tab visibility & focus auto-pause.
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', () => setEnginePaused(true));
    window.addEventListener('focus', () => setEnginePaused(false));
    window.addEventListener('pagehide', () => setEnginePaused(true));
    window.addEventListener('pageshow', () => setEnginePaused(false));

    // Error boundary.
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Runs the full startup sequence. Any thrown error is caught by the caller
 * and surfaced through the fatal overlay.
 * @returns {Promise<void>}
 * @throws {Error} If the canvas or 2D context cannot be acquired.
 */
async function boot() {
    if (bootstrapped) return;
    bootstrapped = true;

    document.title = 'YUCCA';

    // ---- DOM dependency checks ---------------------------------------
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error(
            `Could not find a <canvas id="${CANVAS_ID}"> element in the page.`
        );
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
        throw new Error(
            'Your browser could not create a Canvas 2D context. ' +
            'Hardware acceleration may be disabled.'
        );
    }
    /* alpha:true is REQUIRED by the hybrid stack: when the GPU presenter
     * is live this canvas becomes a transparent HUD overlay above the
     * WebGL layer. In pure-2D fallback the Renderer paints every pixel
     * opaque itself, so transparency costs nothing visually. */

    // ---- Retina backing store before the Game measures the canvas -----
    fitCanvasToDisplay();

    // ---- Master orchestrator -----------------------------------------
    // #glCanvas is optional: a missing element or a failed WebGL probe
    // keeps the battle-tested Canvas 2D presenter as the sole surface.
    const glCanvas = document.getElementById('glCanvas');
    game = new Game(canvas, { ...readBootOptions(), glCanvas: glCanvas ?? null });

    // ---- Dimension content: maps, player, energy, water, NPCs --------
    // Modules that land through the Game's typed attach() seams. Never
    // fatal: MapParser_2 degrades corrupted documents to deterministic
    // procedural fallback dimensions.
    const content = loadDimensionContent(game);
    window.__content__ = content;

    // ---- Preloader (kick off early; awaited below) ---------------------
    const worldsReady = game.start();

    // ---- Multiplayer session -------------------------------------------
    const network = new NetworkManager();
    network.attachGame(game);
    if (content) network.attachPlayer(content.player);
    game.attachNetworkManager(network);
    window.__net__ = network;

    /* Server-synchronized deterministic weather: one seed drives every
     * client's storm (particle draws, gust phases, strike delays). */
    network.on('seed', ({ seed }) => {
        game._weather.setSeed(seed);
        game._loadingScreen.setSeed(seed);
    });

    /* Loading-screen phase bridging: connecting → connected+seed → ready
     * once the worlds are preloaded; solo fallback if the server never
     * answers so the game is ALWAYS enterable. */
    const loading = game._loadingScreen;
    loading.setPhase('connecting', 'connecting to the hour…');
    network.on('connect', () => loading.setPhase('connecting', 'handshaking…'));
    network.on('welcome', ({ id, seed }) => {
        loading.setPhase('connected', `connected · wanderer #${id} · storm seed ${seed}`);
        loading.setProgress(0.95);
        void worldsReady.then(() => loading.setPhase('ready', 'the grove is listening — press SPACE'));
    });
    network.connect();

    const offlineGrace = setTimeout(() => {
        if (!loading.isReady && network.status !== 'connected') {
            loading.setPhase('offline', 'server unreachable · solo exploration');
        }
    }, 4000);
    window.addEventListener('pagehide', () => clearTimeout(offlineGrace), { once: true });

    // ---- Developer console hook ---------------------------------------
    // Exposed for live debugging: inspect metrics, force dimension shifts,
    // or drive the state machine from the console.
    window.game = game;

    installGlobalListeners();

    // ---- Await full preload before declaring the engine online ---------
    await worldsReady;

    console.info(
        '%cYUCCA%c engine online — access it via window.game',
        'color:#ff7700;font-weight:bold;',
        'color:#d7e3ee;'
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   DOM-READY GATE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Entry callback invoked once the DOM is ready. Wraps boot() so any
 * synchronous or asynchronous failure lands on the fatal overlay.
 * @returns {void}
 */
function onDomReady() {
    boot().catch((error) => {
        showFatalOverlay(
            'Failed to start the game',
            error && error.message ? error.message : String(error)
        );
    });
}

// Support both classic script ordering and deferred/module loading: if the
// document is still parsing, wait for DOMContentLoaded; otherwise boot now.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
} else {
    onDomReady();
}