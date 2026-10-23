/**
 * @file src/main.js
 * @module main
 * @description
 * Entry point and master orchestrator for "A Stitch in Time".
 *
 * This module owns the client bootstrap lifecycle. It performs no gameplay
 * logic itself; its sole responsibility is to acquire the render surface,
 * calibrate it for the physical display, construct every core subsystem in
 * strict dependency order, wire engine-wide lifecycle hooks, and hand
 * control to the fixed-timestep game loop.
 *
 * Bootstrap lifecycle (in exact execution order):
 *   1. DOM-ready gate            — waits for DOMContentLoaded if the parser
 *                                  is still running (module scripts defer,
 *                                  so the DOM is usually already parsed).
 *   2. Surface acquisition       — resolves #gameCanvas and its 2D context;
 *                                  a missing context aborts with a visible
 *                                  HTML fallback overlay.
 *   3. High-DPI calibration      — backing store = CSS size × devicePixelRatio,
 *                                  with CSS dimensions pinned so one CSS pixel
 *                                  maps to exactly `dpr` physical pixels.
 *   4. Subsystem construction    — Renderer → InputManager → WorldManager →
 *                                  GameLoop (each receives its dependencies
 *                                  via constructor injection).
 *   5. Lifecycle wiring          — resize refit, visibility pause/resume,
 *                                  focus-loss key release, page teardown.
 *   6. Font gate + ignition      — awaits document.fonts.ready so ASCII cell
 *                                  metrics are stable, starts the loop, then
 *                                  dismisses the boot screen overlay.
 *
 * Dependency injection flow:
 *
 *   canvas ctx ─────────────► Renderer
 *   window / canvas ────────► InputManager
 *   Renderer ───────────────► WorldManager ──► (Dream World | Drab World)
 *   update/render closures ─► GameLoop
 *
 * Expected CONFIG contract (see src/config/Config.js):
 *   CONFIG.CANVAS.BASE_WIDTH            Logical fallback width in CSS px.
 *   CONFIG.CANVAS.BASE_HEIGHT           Logical fallback height in CSS px.
 *   CONFIG.CANVAS.MAX_DEVICE_PIXEL_RATIO  Hard DPR cap (perf guard for 3x+).
 *   CONFIG.LOOP.FIXED_TIME_STEP         Simulation tick in seconds (e.g. 1/60).
 *   CONFIG.LOOP.MAX_FRAME_SKIPS         Max catch-up ticks per rendered frame.
 *   CONFIG.WORLDS.INITIAL               Starting dimension ('DREAM').
 */

import { GameLoop } from './engine/GameLoop.js';
import { Renderer } from './engine/Renderer.js';
import { InputManager } from './engine/InputManager.js';
import { WorldManager } from './worlds/WorldManager.js';
import { CONFIG } from './config/Config.js';

/* ==========================================================================
 * ERROR TYPE
 * ========================================================================== */

/**
 * Dedicated error class for bootstrap-phase failures. Distinguishes fatal
 * initialization problems (bad canvas, dead context, missing DOM nodes)
 * from runtime gameplay errors, which are handled by subsystem try/catch.
 */
class EngineBootstrapError extends Error {
    /**
     * @param {string} message Human-readable failure description.
     */
    constructor(message) {
        super(message);
        this.name = 'EngineBootstrapError';
    }
}

/* ==========================================================================
 * TYPE DEFINITIONS
 * ========================================================================== */

/**
 * Physical display calibration snapshot produced by the DPR scaler and
 * consumed by the Renderer for grid derivation and blit scaling.
 * @typedef {Object} DisplayInfo
 * @property {number} cssWidth       Logical width in CSS pixels.
 * @property {number} cssHeight      Logical height in CSS pixels.
 * @property {number} backingWidth   Physical backing-store width (canvas.width).
 * @property {number} backingHeight  Physical backing-store height (canvas.height).
 * @property {number} dpr            Effective device pixel ratio applied.
 */

/**
 * Aggregate handle to every live subsystem. Exposed on window.__STITCH__
 * for the debug HUD and console diagnostics.
 * @typedef {Object} EngineContext
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {DisplayInfo} display
 * @property {Renderer} renderer
 * @property {InputManager} input
 * @property {WorldManager} worlds
 * @property {GameLoop} loop
 */

/** @type {?EngineContext} Live engine handle once boot completes. */
let engine = null;

/* ==========================================================================
 * DOM READY GATE
 * ========================================================================== */

/**
 * Module scripts are deferred, so DOMContentLoaded has normally already
 * fired by the time this module executes. The readyState guard keeps the
 * bootstrap correct even if the script tag is ever switched to a
 * non-deferred loading strategy.
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void boot();
    });
} else {
    void boot();
}

/* ==========================================================================
 * BOOTSTRAP SEQUENCE
 * ========================================================================== */

/**
 * Executes the full bootstrap pipeline. Any thrown EngineBootstrapError is
 * surfaced both to the console and as a styled HTML fallback overlay so a
 * player never stares at a dead black screen without explanation.
 * @returns {Promise<void>} Resolves once the game loop is running.
 */
async function boot() {
    try {
        /* ---- Step 1: acquire the render surface ------------------------ */
        const canvas = document.getElementById('gameCanvas');
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new EngineBootstrapError(
                'Fatal: #gameCanvas element not found in the DOM. ' +
                'The ASCII render surface could not be located.'
            );
        }

        /* alpha:false lets the compositor skip blending the canvas against
         * the page background (opaque black frames are cheaper to present).
         * desynchronized:true hints the browser to decouple the canvas
         * presentation from the DOM compositor, reducing paint latency for
         * full-screen text blits. Both are hints; unsupported browsers
         * silently ignore them. */
        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        if (!ctx) {
            throw new EngineBootstrapError(
                'Fatal: 2D canvas context unavailable. Your browser or GPU ' +
                'driver does not support HTML5 Canvas 2D rendering.'
            );
        }

        /* ---- Step 2: high-DPI calibration ------------------------------- */
        const display = configureHighDPIScaling(canvas);

        /* ---- Step 3: subsystem construction (strict DI order) ----------- */
        const renderer = new Renderer(ctx, display);
        const input = new InputManager(window, canvas);
        const worlds = new WorldManager(renderer, {
            initialWorld: CONFIG.WORLDS.INITIAL
        });

        /**
         * Fixed-timestep simulation callback. Invoked by GameLoop at exactly
         * CONFIG.LOOP.FIXED_TIME_STEP intervals regardless of display Hz.
         * Order is contractual: input is sampled first so the world tick
         * always acts on a coherent snapshot, never a half-mutated one.
         * @param {number} dt Deterministic delta time in seconds.
         * @returns {void}
         */
        const update = (dt) => {
            worlds.update(dt, input);
        };

        /**
         * Render callback. The interpolation alpha lets WorldManager smooth
         * entity positions between the two most recent simulation ticks on
         * high-refresh displays (120Hz+), per the blueprint's frame target.
         * @param {number} interpolationAlpha 0..1 blend factor between ticks.
         * @returns {void}
         */
        const render = (interpolationAlpha) => {
            renderer.beginFrame();
            worlds.render(renderer, interpolationAlpha);
            renderer.endFrame();
        };

        const loop = new GameLoop({
            update,
            render,
            fixedTimeStep: CONFIG.LOOP.FIXED_TIME_STEP,
            maxFrameSkips: CONFIG.LOOP.MAX_FRAME_SKIPS
        });

        /* ---- Step 4: retain the aggregate context ----------------------- */
        engine = { canvas, ctx, display, renderer, input, worlds, loop };

        /* Debug/diagnostic handle for the HUD tooling and console. */
        window.__STITCH__ = engine;

        /* ---- Step 5: lifecycle wiring ----------------------------------- */
        wireResizeHandling(canvas, renderer);
        wirePauseResumeHandling(loop, input);
        wireShutdownHandling(loop, input);

        /* ---- Step 6: font gate, ignition, boot-screen dismissal --------- */
        /* The Renderer calibrates its ASCII cell size via measureText(); if
         * a webfont swaps in after calibration the grid shears. Awaiting
         * fonts.ready guarantees metrics are final before frame one. */
        await document.fonts.ready;

        loop.start();

        /* Signal readiness one frame after ignition so the boot overlay is
         * only removed once pixels are genuinely on screen. */
        requestAnimationFrame(() => {
            window.__STITCH_ENGINE_READY__ = true;

            /* Disarm the fatal-load sentinel installed by index.html. */
            if (typeof window.__stitchBootTimeout === 'number') {
                clearTimeout(window.__stitchBootTimeout);
                window.__stitchBootTimeout = null;
            }

            dismissBootScreen();

            /* The canvas carries tabindex="0"; focusing it immediately lets
             * InputManager receive WASD/arrow events without a click. */
            canvas.focus();

            console.info(
                `[main] Engine online — backing store ${display.backingWidth}x` +
                `${display.backingHeight} @ ${display.dpr}x DPR, ` +
                `tick ${CONFIG.LOOP.FIXED_TIME_STEP.toFixed(4)}s`
            );
        });
    } catch (err) {
        console.error('[main] Bootstrap failed:', err);
        showFatalOverlay(err instanceof Error ? err.message : String(err));
    }
}

/* ==========================================================================
 * HIGH-DPI SCALING
 * ========================================================================== */

/**
 * Configures the canvas backing store for the physical display.
 *
 * Scaling math:
 *   backingWidth  = cssWidth  × dpr
 *   backingHeight = cssHeight × dpr
 *   style.width   = cssWidth px   (pins CSS size, so 1 CSS px = dpr device px)
 *
 * The effective DPR is clamped to CONFIG.CANVAS.MAX_DEVICE_PIXEL_RATIO:
 * fillText() dominates per-frame cost in an ASCII renderer, and backing
 * stores beyond 2x yield negligible glyph-sharpness gains on 3x+ mobile
 * panels while multiplying rasterization work.
 *
 * The CSS layout size is measured from the live element (the stylesheet
 * stretches it to fill the viewport). CONFIG base dimensions are used only
 * as a fallback if measurement returns a degenerate rect.
 *
 * @param {HTMLCanvasElement} canvas Target render surface.
 * @returns {DisplayInfo} Calibration snapshot for the Renderer.
 */
function configureHighDPIScaling(canvas) {
    const dpr = Math.min(
        window.devicePixelRatio || 1,
        CONFIG.CANVAS.MAX_DEVICE_PIXEL_RATIO
    );

    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width > 1
        ? Math.floor(rect.width)
        : CONFIG.CANVAS.BASE_WIDTH;
    const cssHeight = rect.height > 1
        ? Math.floor(rect.height)
        : CONFIG.CANVAS.BASE_HEIGHT;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    /* Pin the CSS dimensions so the freshly enlarged backing store is not
     * stretched a second time by the stylesheet's 100% sizing rules. */
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    return {
        cssWidth,
        cssHeight,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        dpr
    };
}

/* ==========================================================================
 * LIFECYCLE HOOKS
 * ========================================================================== */

/**
 * Refits the backing store on viewport changes (window resize, orientation
 * flip, devtools docking). Refits are coalesced to one per animation frame
 * so resize storms never thrash canvas reallocation.
 * @param {HTMLCanvasElement} canvas Render surface to refit.
 * @param {Renderer} renderer Renderer notified of the new display metrics.
 * @returns {void}
 */
function wireResizeHandling(canvas, renderer) {
    let resizeScheduled = false;

    const scheduleRefit = () => {
        if (resizeScheduled) return;
        resizeScheduled = true;

        requestAnimationFrame(() => {
            resizeScheduled = false;
            const display = configureHighDPIScaling(canvas);
            if (engine) engine.display = display;
            renderer.handleResize(display);
        });
    };

    window.addEventListener('resize', scheduleRefit);
    window.addEventListener('orientationchange', scheduleRefit);
}

/**
 * Suspends simulation when the tab is hidden (saves battery, prevents the
 * fixed-timestep accumulator from exploding after a long background stall)
 * and releases held keys on window blur so a player who alt-tabs mid-sprint
 * does not return to a stuck movement state.
 * @param {GameLoop} loop Loop to pause/resume.
 * @param {InputManager} input Input state to sanitize on focus loss.
 * @returns {void}
 */
function wirePauseResumeHandling(loop, input) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            loop.pause();
            console.info('[main] Simulation paused (tab hidden).');
        } else {
            loop.resume();
            console.info('[main] Simulation resumed.');
        }
    });

    window.addEventListener('blur', () => {
        input.releaseAll();
    });
}

/**
 * Performs orderly teardown when the page is discarded: stops the rAF
 * pump and detaches all DOM listeners registered by InputManager.
 * @param {GameLoop} loop Loop to halt.
 * @param {InputManager} input Input manager to detach.
 * @returns {void}
 */
function wireShutdownHandling(loop, input) {
    window.addEventListener('pagehide', () => {
        loop.stop();
        input.destroy();
        console.info('[main] Engine shut down cleanly.');
    }, { once: true });
}

/* ==========================================================================
 * BOOT SCREEN & FAILURE PRESENTATION
 * ========================================================================== */

/**
 * Fades out and removes the #boot-screen overlay injected by index.html.
 * Includes a timer fallback in case the CSS transitionend event is lost
 * (e.g. the tab was hidden mid-transition).
 * @returns {void}
 */
function dismissBootScreen() {
    const bootScreen = document.getElementById('boot-screen');
    if (!bootScreen) return;

    bootScreen.classList.add('boot-fade');
    bootScreen.addEventListener(
        'transitionend',
        () => {
            if (bootScreen.isConnected) bootScreen.remove();
        },
        { once: true }
    );

    /* Safety net: force removal after the transition budget expires. */
    setTimeout(() => {
        if (bootScreen.isConnected) bootScreen.remove();
    }, 1200);
}

/**
 * Renders a full-screen HTML fallback when the engine cannot boot at all
 * (missing canvas, dead 2D context, etc.). Built imperatively so it works
 * even if parts of the document tree are compromised.
 * @param {string} message Human-readable failure description.
 * @returns {void}
 */
function showFatalOverlay(message) {
    /* Never stack multiple overlays on repeated failures. */
    document.getElementById('fatal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fatal-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '999',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '16px',
        backgroundColor: '#000000',
        color: '#ff5533',
        fontFamily: "'Fira Code', 'Courier New', Courier, monospace",
        fontSize: '14px',
        textAlign: 'center',
        padding: '24px'
    });

    const title = document.createElement('div');
    title.textContent = ':: TEMPORAL ENGINE FAILURE ::';
    title.style.color = '#ff7700';
    title.style.fontSize = '18px';
    title.style.letterSpacing = '3px';

    const body = document.createElement('div');
    body.textContent = message;
    body.style.color = '#cccccc';
    body.style.maxWidth = '560px';
    body.style.lineHeight = '1.6';

    const hint = document.createElement('div');
    hint.textContent = 'Check the browser console for details, then reload.';
    hint.style.color = '#666666';
    hint.style.fontSize = '12px';

    overlay.append(title, body, hint);
    document.body.appendChild(overlay);
}