/**
 * @file src/worlds/WorldManager.js
 * @module worlds/WorldManager
 *
 * @description
 * Dual-world state machine for "YUCCA".
 *
 * WorldManager owns the single most important piece of game state: WHICH
 * REALITY IS ACTIVE. It governs the Dream World (vibrant orange groves,
 * mystic caves, combat-enabled) and the Drab World (monochrome rain-slicked
 * streets, combat-disabled), the transition pipeline between them, and the
 * fan-out of world-change events to every dependent subsystem.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STATE MACHINE
 * ───────────────────────────────────────────────────────────────────────────
 * Transition phases:
 *
 *                 requestShift()               buffer ready
 *   IDLE ─────────────────────────► LOADING ──────────────► OUT
 *    ▲                                                       │
 *    │                                                       │ elapsed ≥
 *    │                                                       │ switchPoint
 *    │              IN completes                             ▼
 *    └──────────────────────────── IN ◄──────────── world commit
 *                                      elapsed ≥ outDuration
 *
 *   IDLE     Stable residence in one dimension.
 *   LOADING  Target map is being resolved through its async map loader.
 *            Simulation keeps running; input stays live; the shift waits.
 *   OUT      Reality disengagement. Dream→Drab plays a hard glitch flicker
 *            (energy-collapse aesthetic); Drab→Dream plays a smooth fade
 *            (juice-restored calm). At `switchPoint` (default 50% of the
 *            phase) the world commit executes atomically.
 *   IN       Reality re-engagement. The new world is already active; this
 *            phase only bleeds the transition signal back to zero so the
 *            presentation overlay can relax into the new dimension.
 *
 * The commit is deliberately placed MID-transition: at the switch point the
 * screen signal is at peak obscuration (full flicker or full fade), so the
 * instantaneous palette/map/rules swap underneath is invisible to the player.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TRANSITION SIGNAL MATH
 * ───────────────────────────────────────────────────────────────────────────
 * Two signal shapes are produced for the TransitionFX overlay:
 *
 *   flicker(t)  Glitch intensity in [0, 1]. A ramp × deterministic noise:
 *                 ramp  = p^1.5                       (OUT, energy collapse)
 *                 noise = |sin(31.7t)·sin(17.3t) + sin(7.9t)| / 2
 *               The three incommensurate sine frequencies produce beat
 *               interference that reads as analog static without ever
 *               repeating visibly, and — critically — it is deterministic
 *               in simulation time, so fixed-timestep catch-up frames
 *               reproduce identical flicker instead of shimmering.
 *
 *   fade(t)     Smooth obscuration in [0, 1] using cubic easing:
 *                 OUT: easeInOutCubic(p)     slow start, fast middle
 *                 IN:  1 - easeOutCubic(p)   fast release, gentle landing
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MAP SYNCHRONIZATION ARCHITECTURE
 * ───────────────────────────────────────────────────────────────────────────
 * Each registered world owns:
 *   - an ASCIIBuffer (its tile grid), resolved eagerly, provided later via
 *     setWorldBuffer() (MapParser integration point), or loaded through an
 *     async mapLoader;
 *   - a presentation profile (renderer palette, grayscale collapse, clear
 *     color);
 *   - an environmental ruleset (combat permission, weather configuration).
 *
 * On commit, WorldManager swaps the active buffer, reprograms the Renderer
 * presentation profile, re-clamps the Camera to the new map bounds, and
 * emits 'worldchanged'. Audio, weather, particles, HUD, and network systems
 * subscribe via on() and react in the same tick — there is no polling.
 *
 * Integration map:
 *   EnergySystem  → requestShift(DRAB, ENERGY_DEPLETED) at zero oranges
 *   Juice Cart    → requestShift(DREAM, JUICE_CONSUMED) on purchase
 *   WeatherSystem → on('worldchanged') then reads rules.weather
 *   AudioSystem   → on('worldchanged') to crossfade ambience
 *   NetworkClient → getNetworkSnapshot() for server 'DREAM'/'DRAB' sync
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';
import { Camera } from '../engine/Camera.js';

/* ══════════════════════════════════════════════════════════════════════════
 * ENUMERATIONS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical dimension identifiers. These strings cross the wire to the
 * WebSocket server, so they must stay stable and uppercase.
 * @enum {string}
 */
export const WORLD = Object.freeze({
    DREAM: 'DREAM',
    DRAB: 'DRAB'
});

/**
 * Why a dimension shift was requested. Drives transition aesthetics:
 * energy collapse flickers; juice restoration fades.
 * @enum {string}
 */
export const SHIFT_REASON = Object.freeze({
    ENERGY_DEPLETED: 'ENERGY_DEPLETED',
    JUICE_CONSUMED: 'JUICE_CONSUMED',
    SCRIPTED: 'SCRIPTED',
    INITIAL: 'INITIAL'
});

/**
 * Transition phase identifiers.
 * @enum {string}
 */
export const TRANSITION_PHASE = Object.freeze({
    IDLE: 'IDLE',
    LOADING: 'LOADING',
    OUT: 'OUT',
    IN: 'IN'
});

/* ══════════════════════════════════════════════════════════════════════════
 * DEFAULT WORLD DEFINITIONS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Factory-fresh definitions for both dimensions. Map content is intentionally
 * absent here: MapParser installs real grids later via setWorldBuffer(), and
 * until then each world presents a valid, empty void grid so the engine is
 * fully runnable from frame one.
 *
 * @type {Object<string, Object>}
 */
const DEFAULT_WORLD_DEFINITIONS = Object.freeze({
    [WORLD.DREAM]: Object.freeze({
        name: 'The Dream World',
        description: 'Vibrant orange groves, mystic caves, and fictional nature.',
        grayscale: false,
        palette: null,
        clearColor: 0x000000FF,
        combatAllowed: true,
        weather: Object.freeze({ type: 'none', intensity: 0, lightning: false })
    }),

    [WORLD.DRAB]: Object.freeze({
        name: 'The Drab World',
        description: 'Monochrome city streets under continuous rain.',
        grayscale: true,
        palette: null,
        clearColor: 0x0C0C0CFF,
        combatAllowed: false,
        weather: Object.freeze({ type: 'rain', intensity: 0.8, lightning: true })
    })
});

/** Dirty-cell budget above which a full batched repaint beats sparse blits. */
const DIRTY_BLIT_BUDGET = 512;

/** Default void grid dimensions before real maps are parsed. */
const DEFAULT_VOID_COLS = 120;
const DEFAULT_VOID_ROWS = 60;

/* ══════════════════════════════════════════════════════════════════════════
 * EASING FUNCTIONS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cubic ease-in-out: gentle launch, fast midpoint, gentle landing.
 *   f(p) = 4p³            for p < 0.5
 *   f(p) = 1 - (-2p+2)³/2 for p ≥ 0.5
 * @param {number} p Progress in [0, 1].
 * @returns {number} Eased value in [0, 1].
 */
function easeInOutCubic(p) {
    return p < 0.5
        ? 4 * p * p * p
        : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * Cubic ease-out: fast start, decelerating finish.
 *   f(p) = 1 - (1 - p)³
 * @param {number} p Progress in [0, 1].
 * @returns {number} Eased value in [0, 1].
 */
function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
}

/**
 * Deterministic pseudo-noise built from three incommensurate sine waves.
 * The beat pattern never visibly repeats within a transition's duration and
 * is a pure function of simulation time, keeping fixed-timestep replays
 * stable. See the header derivation.
 *
 * @param {number} t Time in seconds.
 * @returns {number} Noise value in [0, 1].
 */
function flickerNoise(t) {
    const interference =
        Math.sin(t * 31.7) * Math.sin(t * 17.3) + Math.sin(t * 7.9);

    return Math.min(1, Math.abs(interference) / 2);
}

/* ══════════════════════════════════════════════════════════════════════════
 * WORLD MANAGER
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dual-dimension orchestrator: state machine, transition pipeline, map
 * registry, presentation programming, and world-change event bus.
 */
export class WorldManager {
    /**
     * @param {import('../engine/Renderer.js').Renderer} renderer
     *   The engine renderer. WorldManager programs its palette, grayscale
     *   mode, and clear color on every world commit.
     * @param {Object} [options]
     * @param {string} [options.initialWorld='DREAM'] Starting dimension.
     * @param {Object<string, Object>} [options.worlds]
     *   Per-world definition overrides merged over the defaults.
     * @param {number} [options.defaultMapCols=120] Void grid width.
     * @param {number} [options.defaultMapRows=60] Void grid height.
     * @param {number} [options.outDuration=1.2] OUT phase length, seconds.
     * @param {number} [options.inDuration=0.9] IN phase length, seconds.
     * @param {number} [options.switchPoint=0.5] Commit point within OUT, [0,1].
     */
    constructor(renderer, options = {}) {
        if (!renderer || typeof renderer.render !== 'function') {
            throw new TypeError(
                '[WorldManager] A Renderer instance with render() is required.'
            );
        }

        if (options === null || typeof options !== 'object') {
            throw new TypeError('[WorldManager] options must be an object.');
        }

        /** @type {import('../engine/Renderer.js').Renderer} */
        this._renderer = renderer;

        /* ---- Timing configuration -------------------------------------- */
        /** @type {number} OUT phase duration in seconds. */
        this._outDuration = Number.isFinite(options.outDuration) && options.outDuration > 0
            ? options.outDuration
            : 1.2;

        /** @type {number} IN phase duration in seconds. */
        this._inDuration = Number.isFinite(options.inDuration) && options.inDuration > 0
            ? options.inDuration
            : 0.9;

        /** @type {number} Fraction of OUT at which the commit executes. */
        this._switchPoint = Number.isFinite(options.switchPoint)
            ? Math.min(0.95, Math.max(0.05, options.switchPoint))
            : 0.5;

        /** @type {number} Void grid width for unpopulated worlds. */
        this._voidCols = Number.isInteger(options.defaultMapCols) && options.defaultMapCols > 0
            ? options.defaultMapCols
            : DEFAULT_VOID_COLS;

        /** @type {number} Void grid height for unpopulated worlds. */
        this._voidRows = Number.isInteger(options.defaultMapRows) && options.defaultMapRows > 0
            ? options.defaultMapRows
            : DEFAULT_VOID_ROWS;

        /* ---- Registries -------------------------------------------------- */
        /** @type {Map<string, Object>} worldId → merged definition. */
        this._worlds = new Map();

        /** @type {Map<string, ASCIIBuffer>} worldId → resolved tile grid. */
        this._buffers = new Map();

        /* ---- Event bus --------------------------------------------------- */
        /** @type {Map<string, Set<Function>>} eventType → listener set. */
        this._events = new Map();

        /* ---- Camera ------------------------------------------------------ */
        /** @type {Camera} Viewport controller for the active dimension. */
        this._camera = new Camera({
            viewportWidth: renderer.viewportWidth,
            viewportHeight: renderer.viewportHeight,
            cellWidth: renderer.cellWidth,
            cellHeight: renderer.cellHeight,
            smoothing: 8
        });

        /* Renderer-metric tracking for self-healing resize detection. */
        /** @type {number} */ this._trackedViewW = renderer.viewportWidth;
        /** @type {number} */ this._trackedViewH = renderer.viewportHeight;
        /** @type {number} */ this._trackedCellW = renderer.cellWidth;
        /** @type {number} */ this._trackedCellH = renderer.cellHeight;

        /* ---- Transition state -------------------------------------------- */
        /**
         * Live transition record. Never null; `active` gates all reads.
         * @type {{
         *   active: boolean,
         *   phase: string,
         *   from: ?string,
         *   to: ?string,
         *   reason: ?string,
         *   elapsed: number,
         *   switched: boolean,
         *   flickerStyle: boolean
         * }}
         */
        this._transition = this._createIdleTransition();

        /** @type {number} Monotonic token invalidating stale async loads. */
        this._loadToken = 0;

        /* ---- World registration ------------------------------------------ */
        const overrides = options.worlds ?? {};

        for (const id of Object.values(WORLD)) {
            this.registerWorld(id, {
                ...DEFAULT_WORLD_DEFINITIONS[id],
                ...(overrides[id] ?? {})
            });
        }

        /* ---- Initial residence ------------------------------------------- */
        const requested = options.initialWorld ?? WORLD.DREAM;
        const initial = this._worlds.has(requested) ? requested : WORLD.DREAM;

        this._activeWorldId = initial;
        this._activeBuffer = this._ensureBuffer(initial);

        /* Program presentation and camera for the starting world. Emitted so
         * late-attaching systems can initialize from a worldchanged event. */
        this._applyPresentation(this._worlds.get(initial));
        this._camera.setMapSize(this._activeBuffer.cols, this._activeBuffer.rows);

        this.emit('worldchanged', {
            from: null,
            to: initial,
            reason: SHIFT_REASON.INITIAL,
            world: this._worlds.get(initial),
            rules: this.getActiveRules(),
            buffer: this._activeBuffer
        });
    }

    /* ══════════════════════════════════════════════════════════════════════
     * WORLD REGISTRATION & MAP PIPELINE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Registers or re-registers a world definition.
     *
     * Definition fields:
     *   name {string}            Display name.
     *   description {string}     Lore/usage note.
     *   grayscale {boolean}      Renderer luminance-collapse mode.
     *   palette {?Map|?Object}   Renderer color remap table, or null.
     *   clearColor {?number}     Renderer clear color, packed RGBA.
     *   combatAllowed {boolean}  Environmental combat gate.
     *   weather {Object}         WeatherSystem configuration.
     *   buffer {?ASCIIBuffer}    Pre-built tile grid, if already parsed.
     *   mapLoader {?Function}    async (worldId) => ASCIIBuffer.
     *
     * @param {string} id World identifier (WORLD.DREAM / WORLD.DRAB / custom).
     * @param {Object} definition World definition.
     * @returns {this}
     */
    registerWorld(id, definition) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new TypeError('[WorldManager] world id must be a non-empty string.');
        }
        if (definition === null || typeof definition !== 'object') {
            throw new TypeError('[WorldManager] world definition must be an object.');
        }

        this._worlds.set(id, { id, ...definition });

        if (definition.buffer) {
            this.setWorldBuffer(id, definition.buffer, { silent: true });
        } else if (!this._buffers.has(id) && typeof definition.mapLoader !== 'function') {
            /* No content path declared: install the void grid so the world
             * is always presentable. MapParser replaces this later. */
            this._buffers.set(id, this._createVoidBuffer());
        }

        this.emit('worldregistered', { id, world: this._worlds.get(id) });
        return this;
    }

    /**
     * Installs a parsed tile grid for a world. This is the MapParser
     * integration point: parse the ASCII layout, hand the buffer here.
     *
     * If the world is currently active, the camera is re-clamped to the new
     * bounds and the renderer cache invalidated in the same call.
     *
     * @param {string} id World identifier.
     * @param {ASCIIBuffer} buffer Parsed grid.
     * @param {Object} [flags]
     * @param {boolean} [flags.silent=false] Suppress the maploaded event.
     * @returns {this}
     */
    setWorldBuffer(id, buffer, flags = {}) {
        if (!this._worlds.has(id)) {
            throw new RangeError(`[WorldManager] Unknown world id: ${id}`);
        }
        if (!buffer || typeof buffer.cellCount !== 'number' || !buffer.charCodes) {
            throw new TypeError(
                '[WorldManager] buffer must be an ASCIIBuffer-compatible grid.'
            );
        }

        this._buffers.set(id, buffer);

        if (id === this._activeWorldId) {
            this._activeBuffer = buffer;
            this._camera.setCellMetrics(this._renderer.cellWidth, this._renderer.cellHeight);
            this._camera.setMapSize(buffer.cols, buffer.rows);
            this._camera.snapToTarget();
            this._renderer.invalidate();
        }

        if (!flags.silent) {
            this.emit('maploaded', { id, buffer });
        }

        return this;
    }

    /**
     * Resolves a world's buffer, invoking its async mapLoader when present.
     * Idempotent: already-resolved worlds return immediately.
     *
     * @param {string} id World identifier.
     * @returns {Promise<ASCIIBuffer>} The resolved grid.
     * @throws {RangeError} If the world is not registered.
     */
    async loadWorldBuffer(id) {
        if (!this._worlds.has(id)) {
            throw new RangeError(`[WorldManager] Unknown world id: ${id}`);
        }

        if (this._buffers.has(id)) {
            return this._buffers.get(id);
        }

        const def = this._worlds.get(id);

        if (typeof def.mapLoader === 'function') {
            const loaded = await def.mapLoader(id);

            if (!loaded || typeof loaded.cellCount !== 'number') {
                throw new TypeError(
                    `[WorldManager] mapLoader for ${id} must resolve to an ASCIIBuffer.`
                );
            }

            this.setWorldBuffer(id, loaded);
            return loaded;
        }

        const voidBuffer = this._createVoidBuffer();
        this._buffers.set(id, voidBuffer);
        return voidBuffer;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DIMENSION SHIFT PIPELINE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Requests a dimension shift.
     *
     * Acceptance rules:
     *   - Unknown target worlds are rejected.
     *   - Requests for the already-active world are no-ops.
     *   - Requests during an active transition are rejected unless they
     *     duplicate the in-flight destination (idempotent re-request).
     *
     * The aesthetic of the transition derives from the destination: shifting
     * INTO the Drab World flickers (energy collapse), shifting INTO the Dream
     * World fades (juice restoration).
     *
     * @param {string} target Destination world id.
     * @param {string} [reason=SHIFT_REASON.SCRIPTED] Why the shift happens.
     * @returns {boolean} True if the shift was accepted and started.
     */
    requestShift(target, reason = SHIFT_REASON.SCRIPTED) {
        if (!this._worlds.has(target)) {
            console.warn(`[WorldManager] Shift rejected: unknown world '${target}'.`);
            return false;
        }

        if (target === this._activeWorldId && !this._transition.active) {
            return false;
        }

        if (this._transition.active) {
            /* Idempotent duplicate of the in-flight destination. */
            return this._transition.to === target;
        }

        this._transition = {
            active: true,
            phase: TRANSITION_PHASE.LOADING,
            from: this._activeWorldId,
            to: target,
            reason,
            elapsed: 0,
            switched: false,
            flickerStyle: target === WORLD.DRAB
        };

        this.emit('transitionstart', this.getTransitionStatus());

        if (this._buffers.has(target)) {
            this._beginOutPhase();
        } else {
            /* Async resolution; LOADING holds the pipeline until ready. */
            void this._loadAndBegin(target, reason);
        }

        return true;
    }

    /**
     * Aborts an in-flight transition.
     *
     * Pre-commit aborts restore the source world seamlessly (the commit never
     * happened, so only the transition signal is dropped). Post-commit aborts
     * fast-forward the IN phase so the new world settles immediately rather
     * than hanging mid-fade.
     *
     * @returns {boolean} True if a transition was aborted.
     */
    abortTransition() {
        if (!this._transition.active) return false;

        if (!this._transition.switched) {
            this._transition = this._createIdleTransition();
            this.emit('transitionaborted', { restored: this._activeWorldId });
        } else {
            this._transition.phase = TRANSITION_PHASE.IN;
            this._transition.elapsed = this._inDuration;
        }

        return true;
    }

    /**
     * Async bridge from LOADING to OUT. Guarded by a load token so a stale
     * load (superseded by abort or a newer request) cannot resurrect itself.
     *
     * @param {string} target Destination world id.
     * @param {string} reason Shift reason.
     * @private
     */
    async _loadAndBegin(target, reason) {
        const token = ++this._loadToken;

        try {
            await this.loadWorldBuffer(target);

            const t = this._transition;
            if (
                token !== this._loadToken ||
                !t.active ||
                t.phase !== TRANSITION_PHASE.LOADING ||
                t.to !== target
            ) {
                return;
            }

            this._beginOutPhase();
        } catch (error) {
            console.error(`[WorldManager] Failed to load world '${target}':`, error);

            if (token === this._loadToken) {
                const failed = { to: target, reason, error };
                this._transition = this._createIdleTransition();
                this.emit('transitionfailed', failed);
            }
        }
    }

    /**
     * Enters the OUT phase. Called synchronously when the target buffer is
     * already resident, or from the loader bridge once it resolves.
     * @private
     */
    _beginOutPhase() {
        this._transition.phase = TRANSITION_PHASE.OUT;
        this._transition.elapsed = 0;
    }

    /**
     * Executes the atomic world commit: swaps the active grid, reprograms
     * renderer presentation, re-clamps the camera, and broadcasts the change
     * to every subscribed subsystem in the same tick.
     *
     * @param {?Object} [transition=null] Transition context for the event.
     * @private
     */
    _commitWorld(transition = null) {
        const id = this._transition.to;
        const def = this._worlds.get(id);
        const buffer = this._ensureBuffer(id);

        const from = this._activeWorldId;

        this._activeWorldId = id;
        this._activeBuffer = buffer;

        this._applyPresentation(def);

        this._camera.setCellMetrics(this._renderer.cellWidth, this._renderer.cellHeight);
        this._camera.setMapSize(buffer.cols, buffer.rows);
        this._camera.snapToTarget();

        /* Energy collapse lands with physical weight; juice restoration is
         * serene. Shake is presentation-only and never invalidates the
         * renderer cache. */
        if (transition && transition.flickerStyle) {
            this._camera.shake(0.45, 6, 28);
        }

        this.emit('worldchanged', {
            from,
            to: id,
            reason: transition ? transition.reason : SHIFT_REASON.SCRIPTED,
            world: def,
            rules: this.getActiveRules(),
            buffer
        });
    }

    /**
     * Programs the Renderer's presentation profile for a world definition.
     * Order matters: palette and grayscale first, then the clear color,
     * which also invalidates the presented-cell cache and forces a clean
     * repaint of the new dimension.
     *
     * @param {Object} def World definition.
     * @private
     */
    _applyPresentation(def) {
        this._renderer.setPalette(def.palette ?? null);
        this._renderer.setGrayscale(Boolean(def.grayscale));

        if (def.clearColor !== null && def.clearColor !== undefined) {
            this._renderer.clear(def.clearColor);
        } else {
            this._renderer.invalidate();
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PER-TICK UPDATE & PRESENTATION
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Advances the world simulation tick.
     *
     * Order is contractual:
     *   1. Input frame commit (edge rotation) — InputManager's contract
     *      designates WorldManager as the owner of this call.
     *   2. Renderer metric self-heal (resize/font recalibration detection).
     *   3. Transition timeline advancement.
     *   4. Camera pursuit, clamping, and shake.
     *
     * @param {number} dt Fixed timestep in seconds.
     * @param {import('../engine/InputManager.js').InputManager} [input]
     * @returns {this}
     */
    update(dt, input) {
        if (input && typeof input.update === 'function') {
            input.update();
        }

        this._syncRendererMetrics();
        this._updateTransition(dt);
        this._camera.update(dt);

        return this;
    }

    /**
     * Presents the active world through the Renderer.
     *
     * Blit strategy selection:
     *   - Sparse frames (few dirty cells) route through renderDirty, which
     *     redraws only changed cells — the common steady-state path.
     *   - Dense frames (large fills, weather churn) route through the full
     *     batched repaint, where per-color Path2D batching wins.
     *   - renderDirty self-promotes to a full repaint whenever the camera
     *     or palette invalidated the renderer cache, so this call site
     *     never has to reason about cache state.
     *
     * @param {import('../engine/Renderer.js').Renderer} renderer
     * @param {number} interpolationAlpha Sub-tick interpolation phase.
     * @returns {void}
     */
    render(renderer, interpolationAlpha) {
        const buffer = this._activeBuffer;
        if (!buffer) return;

        /* Commit resolves the buffer's back/front diff exactly once per
         * presentation frame and produces the dirty set. */
        const delta = buffer.commit();

        if (delta.count > 0 && delta.count <= DIRTY_BLIT_BUDGET) {
            renderer.renderDirty(buffer, this._camera, delta.cells);
        } else {
            renderer.render(buffer, this._camera);
        }
    }

    /**
     * Detects renderer viewport/font changes that bypassed WorldManager
     * (window resize, DPR change, font swap) and propagates them to the
     * camera. Compared by value each tick — four float comparisons, far
     * cheaper than a resize event plumbing duplicate.
     * @private
     */
    _syncRendererMetrics() {
        const r = this._renderer;

        if (r.viewportWidth !== this._trackedViewW || r.viewportHeight !== this._trackedViewH) {
            this._trackedViewW = r.viewportWidth;
            this._trackedViewH = r.viewportHeight;
            this._camera.setViewport(r.viewportWidth, r.viewportHeight);
        }

        if (r.cellWidth !== this._trackedCellW || r.cellHeight !== this._trackedCellH) {
            this._trackedCellW = r.cellWidth;
            this._trackedCellH = r.cellHeight;
            this._camera.setCellMetrics(r.cellWidth, r.cellHeight);

            if (this._activeBuffer) {
                this._camera.setMapSize(this._activeBuffer.cols, this._activeBuffer.rows);
            }
        }
    }

    /**
     * Advances the transition timeline and fires the mid-OUT commit.
     * @param {number} dt Fixed timestep in seconds.
     * @private
     */
    _updateTransition(dt) {
        const t = this._transition;
        if (!t.active || t.phase === TRANSITION_PHASE.LOADING) return;

        t.elapsed += dt;

        if (t.phase === TRANSITION_PHASE.OUT) {
            /* Atomic commit at peak obscuration. */
            if (!t.switched && t.elapsed >= this._outDuration * this._switchPoint) {
                t.switched = true;
                this._commitWorld(t);
            }

            if (t.elapsed >= this._outDuration) {
                t.phase = TRANSITION_PHASE.IN;
                t.elapsed = 0;
            }
            return;
        }

        if (t.phase === TRANSITION_PHASE.IN) {
            if (t.elapsed >= this._inDuration) {
                const completed = this.getTransitionStatus();
                this._transition = this._createIdleTransition();
                this.emit('transitioncomplete', completed);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
     * TRANSITION SIGNAL QUERIES
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Live transition signal for the TransitionFX overlay and audio ducking.
     *
     * `flicker` and `fade` are mutually dominant: flicker-style transitions
     * (into Drab) carry glitch intensity; fade-style transitions (into Dream)
     * carry smooth obscuration. Both are always present so consumers never
     * branch on style.
     *
     * @returns {{
     *   active: boolean,
     *   phase: string,
     *   from: ?string,
     *   to: ?string,
     *   reason: ?string,
     *   progress: number,
     *   flicker: number,
     *   fade: number,
     *   switched: boolean
     * }}
     */
    getTransitionStatus() {
        const t = this._transition;

        if (!t.active) {
            return {
                active: false,
                phase: TRANSITION_PHASE.IDLE,
                from: this._activeWorldId,
                to: null,
                reason: null,
                progress: 0,
                flicker: 0,
                fade: 0,
                switched: false
            };
        }

        let progress = 0;
        let flicker = 0;
        let fade = 0;

        if (t.phase === TRANSITION_PHASE.LOADING) {
            return {
                active: true,
                phase: t.phase,
                from: t.from,
                to: t.to,
                reason: t.reason,
                progress: 0,
                flicker: 0,
                fade: 0,
                switched: false
            };
        }

        if (t.phase === TRANSITION_PHASE.OUT) {
            progress = Math.min(1, t.elapsed / this._outDuration);

            if (t.flickerStyle) {
                /* Glitch ramps with superlinear urgency toward the commit. */
                const ramp = Math.pow(progress, 1.5);
                flicker = ramp * (0.35 + 0.65 * flickerNoise(t.elapsed));
            } else {
                fade = easeInOutCubic(progress);
            }
        } else if (t.phase === TRANSITION_PHASE.IN) {
            progress = Math.min(1, t.elapsed / this._inDuration);

            if (t.flickerStyle) {
                /* Residual static decays as reality reasserts itself. */
                const decay = 1 - easeOutCubic(progress);
                flicker = decay * 0.6 * flickerNoise(t.elapsed);
            } else {
                fade = 1 - easeOutCubic(progress);
            }
        }

        return {
            active: true,
            phase: t.phase,
            from: t.from,
            to: t.to,
            reason: t.reason,
            progress,
            flicker,
            fade,
            switched: t.switched
        };
    }

    /** @returns {boolean} True while any transition phase is in flight. */
    isTransitioning() {
        return this._transition.active;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * WORLD & RULE QUERIES
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {string} Active world identifier. */
    getActiveWorldId() {
        return this._activeWorldId;
    }

    /** @returns {Object} Active world definition. */
    getActiveWorld() {
        return this._worlds.get(this._activeWorldId);
    }

    /** @returns {?ASCIIBuffer} Active tile grid. */
    getActiveBuffer() {
        return this._activeBuffer;
    }

    /** @returns {Camera} The shared viewport camera. */
    getCamera() {
        return this._camera;
    }

    /** @returns {boolean} True when residing in the Dream World. */
    isDream() {
        return this._activeWorldId === WORLD.DREAM;
    }

    /** @returns {boolean} True when residing in the Drab World. */
    isDrab() {
        return this._activeWorldId === WORLD.DRAB;
    }

    /**
     * Environmental rules of the active dimension. CombatSystem gates on
     * `combatAllowed`; WeatherSystem consumes `weather` verbatim.
     *
     * @returns {{
     *   id: string,
     *   name: string,
     *   combatAllowed: boolean,
     *   weather: Object
     * }}
     */
    getActiveRules() {
        const def = this._worlds.get(this._activeWorldId);

        return {
            id: this._activeWorldId,
            name: def.name,
            combatAllowed: Boolean(def.combatAllowed),
            weather: def.weather
        };
    }

    /** @returns {boolean} Whether combat systems may engage right now. */
    isCombatAllowed() {
        return Boolean(this._worlds.get(this._activeWorldId).combatAllowed);
    }

    /**
     * Network-safe snapshot matching the WebSocket server protocol, which
     * expects world as the raw 'DREAM'/'DRAB' string.
     *
     * @returns {{world: string, transitioning: boolean, phase: string}}
     */
    getNetworkSnapshot() {
        return {
            world: this._activeWorldId,
            transitioning: this._transition.active,
            phase: this._transition.phase
        };
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CAMERA TARGETING
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Registers the camera's pursuit target (the Player entity once the
     * entity layer boots). Any object exposing numeric x/y is accepted.
     *
     * @param {?{x: number, y: number}} entity Pursuit target or null.
     * @returns {this}
     */
    setPlayerTarget(entity) {
        this._camera.setTarget(entity);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * EVENT BUS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a world event.
     *
     * Events emitted by this module:
     *   'worldregistered'    {id, world}
     *   'maploaded'          {id, buffer}
     *   'worldchanged'       {from, to, reason, world, rules, buffer}
     *   'transitionstart'    transition status snapshot
     *   'transitioncomplete' transition status snapshot
     *   'transitionaborted'  {restored}
     *   'transitionfailed'   {to, reason, error}
     *
     * Listener exceptions are isolated: a throwing subscriber never breaks
     * the commit pipeline or other subscribers.
     *
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving the event payload.
     * @returns {Function} Unsubscribe function.
     */
    on(type, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('[WorldManager] listener must be a function.');
        }

        let set = this._events.get(type);
        if (!set) {
            set = new Set();
            this._events.set(type, set);
        }
        set.add(listener);

        return () => this.off(type, listener);
    }

    /**
     * Subscribes to exactly one emission of an event.
     * @param {string} type Event name.
     * @param {Function} listener Callback.
     * @returns {Function} Unsubscribe function.
     */
    once(type, listener) {
        const wrapper = (payload) => {
            this.off(type, wrapper);
            listener(payload);
        };
        return this.on(type, wrapper);
    }

    /**
     * Unsubscribes a listener.
     * @param {string} type Event name.
     * @param {Function} listener Previously registered callback.
     * @returns {this}
     */
    off(type, listener) {
        const set = this._events.get(type);
        if (set) {
            set.delete(listener);
            if (set.size === 0) this._events.delete(type);
        }
        return this;
    }

    /**
     * Broadcasts an event to all subscribers with error isolation.
     * @param {string} type Event name.
     * @param {*} payload Event payload.
     * @returns {void}
     */
    emit(type, payload) {
        const set = this._events.get(type);
        if (!set) return;

        for (const listener of set) {
            try {
                listener(payload);
            } catch (error) {
                console.error(`[WorldManager] Listener error on '${type}':`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
     * INTERNAL HELPERS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Guarantees a buffer exists for a world, materializing the void grid on
     * demand. Keeps the commit path total: it can never dereference a
     * missing grid.
     *
     * @param {string} id World identifier.
     * @returns {ASCIIBuffer} The resident grid.
     * @private
     */
    _ensureBuffer(id) {
        let buffer = this._buffers.get(id);

        if (!buffer) {
            buffer = this._createVoidBuffer();
            this._buffers.set(id, buffer);
        }

        return buffer;
    }

    /**
     * Builds the default empty grid used before MapParser content arrives.
     * @returns {ASCIIBuffer}
     * @private
     */
    _createVoidBuffer() {
        return new ASCIIBuffer({
            cols: this._voidCols,
            rows: this._voidRows,
            defaultChar: ' ',
            defaultFg: 0xE0E0E0FF,
            defaultBg: 0x000000FF
        });
    }

    /**
     * Factory for the canonical idle transition record.
     * @returns {Object} Fresh transition state.
     * @private
     */
    _createIdleTransition() {
        return {
            active: false,
            phase: TRANSITION_PHASE.IDLE,
            from: this._activeWorldId ?? null,
            to: null,
            reason: null,
            elapsed: 0,
            switched: false,
            flickerStyle: false
        };
    }
}

export default WorldManager;