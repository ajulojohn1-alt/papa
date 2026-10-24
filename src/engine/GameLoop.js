/**
 * @file src/engine/GameLoop.js
 * @module engine/GameLoop
 *
 * @description
 * Master timing architecture for "A Stitch in Time".
 *
 * This module decouples SIMULATION from PRESENTATION. Gameplay (movement,
 * orange-energy decay, projectile integration, boss phase machines, collision
 * sweeps) advances in identical, deterministic increments. Presentation runs
 * at whatever rate the display delivers, interpolating between the last two
 * simulation states so a 144 Hz panel and a 60 Hz panel both look smooth
 * while the simulation remains bit-identical on both.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A FIXED TIMESTEP?
 * ─────────────────────────────────────────────────────────────────────────
 * Variable-delta physics makes traversal frame-rate dependent: a projectile
 * moving `v * dt` integrates differently at 30 Hz than at 144 Hz, which
 * corrupts bullet-hell dodge windows, tunneling guarantees, and any future
 * server-side reconciliation of multiplayer state. A fixed increment `h`
 * makes every tick reproducible, which is a prerequisite for the Dream/Drab
 * reality-shift logic and the deterministic boss pattern emitters.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ACCUMULATOR PATTERN
 * ─────────────────────────────────────────────────────────────────────────
 * Let:
 *   h  = fixedTimeStep          (seconds per simulation tick, e.g. 1/60)
 *   N  = maxFrameSkips          (maximum ticks consumed in one frame)
 *   Δ  = wall time since previous frame, in seconds
 *   A  = accumulator, leftover simulated-but-unconsumed wall time
 *
 * Each animation frame:
 *
 *   1. Δraw = (timestamp_n - timestamp_{n-1}) / 1000
 *   2. Δ    = clamp(Δraw, 0, N * h)          <-- lag-spike guard
 *   3. A   += Δ
 *   4. while (A >= h) and (ticks_this_frame < N):
 *        simulate(h)
 *        A  -= h
 *        ticks_this_frame++
 *   5. alpha = A / h                         <-- interpolation phase
 *   6. render(alpha)
 *
 * The accumulator is a remainder register. If a frame takes 33.3 ms at
 * h = 16.67 ms, two ticks run and A returns to ~0. If a frame takes 10 ms,
 * no tick runs, A grows to 10 ms, and the NEXT frame crosses the threshold.
 * Over time the number of ticks converges to 60/second regardless of how
 * irregular the frame boundaries are.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INTERPOLATION ALPHA
 * ─────────────────────────────────────────────────────────────────────────
 * After the tick loop, A holds the fraction of a tick that has elapsed in
 * wall time but has NOT yet been simulated:
 *
 *   alpha = A / h,   alpha ∈ [0, 1)
 *
 * Entities must retain their pre-tick state. The renderer then draws:
 *
 *   x_draw = lerp(x_previous, x_current, alpha)
 *          = x_previous + (x_current - x_previous) * alpha
 *
 * This is interpolation, NOT extrapolation. Extrapolating forward would
 * predict positions the collision system never validated, causing glyphs
 * to visibly detach from their hitboxes during stutter — unacceptable for
 * fair bullet-hell collisions. The cost of interpolation is up to one tick
 * of input latency (16.67 ms at 60 Hz), which is the standard trade.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPIRAL-OF-DEATH PREVENTION (two independent guards)
 * ─────────────────────────────────────────────────────────────────────────
 * If a tick costs longer than h, the backlog grows: each frame owes more
 * ticks, those ticks take longer, the backlog grows further, and the app
 * locks up. This is the "spiral of death".
 *
 *   Guard 1 — delta clamp: Δ is capped at N * h. A 10-second tab stall
 *     becomes 83 ms of debt, not 10 seconds of debt.
 *   Guard 2 — iteration cap: the while loop consumes at most N ticks per
 *     frame, bounding worst-case CPU work to N * cost(tick) + cost(render).
 *
 * Any debt remaining after Guard 2 is DISCARDED and counted in
 * `droppedTicks`. Discarding simulation time is a deliberate, visible-in-
 * metrics degradation: the world slows briefly instead of the process dying.
 * The accumulator is reset to zero on discard rather than keeping a
 * remainder, because that remainder belongs to time we just threw away and
 * retaining it would immediately re-trigger the overflow branch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CLOCK SOURCES (intentionally different)
 * ─────────────────────────────────────────────────────────────────────────
 *   Simulation clock: the DOMHighResTimeStamp supplied by rAF. It is
 *     monotonic and aligned to the display's presentation cadence, so it
 *     measures the interval the PLAYER actually experienced.
 *   Work-duration clock: performance.now() sampled around callbacks. It
 *     measures CPU/GPU submission cost, which is what a performance HUD
 *     needs. Using the rAF timestamp for work duration would incorrectly
 *     include vsync waiting time.
 *
 * This class is DOM-agnostic beyond rAF/cAF: it registers no window or
 * document listeners. Visibility-based pause/resume and resize refits are
 * owned by src/index.js, keeping the loop unit-testable in isolation.
 *
 * @example
 * const loop = new GameLoop({
 *   fixedTimeStep: 1 / 60,
 *   maxFrameSkips: 5,
 *   update: (dt) => worlds.update(dt, input),
 *   render: (alpha) => {
 *     renderer.beginFrame();
 *     worlds.render(renderer, alpha);
 *     renderer.endFrame();
 *   }
 * });
 * loop.start();
 * // Later, from a diagnostics HUD:
 * console.table(loop.getMetrics());
 */

/* ==========================================================================
 * CONSTANTS & DEFAULTS
 * ========================================================================== */

/**
 * Default simulation rate: 60 Hz. Chosen to match the projectile integration
 * budget of the bullet-hell emitters; the server's authority tick should use
 * the same value so prediction and reconciliation agree.
 * @type {number}
 */
const DEFAULT_FIXED_TIME_STEP = 1 / 60;

/**
 * Default catch-up budget. 5 ticks = 83.33 ms of simulated time per frame,
 * which absorbs a dropped frame at 60 Hz plus jitter without ever allowing
 * an unbounded catch-up storm.
 * @type {number}
 */
const DEFAULT_MAX_FRAME_SKIPS = 5;

/**
 * Default rolling-metrics window. 120 samples ≈ 2 s at 60 Hz and ≈ 1 s at
 * 120 Hz: long enough to hide single-frame noise, short enough that a
 * regression is visible in the HUD immediately.
 * @type {number}
 */
const DEFAULT_METRICS_WINDOW = 120;

/**
 * Floating-point tolerance for the accumulator threshold comparison.
 *
 * Repeated subtraction of an irrational step (1/60 is not exactly
 * representable in binary64) can leave A = 0.9999999999999998 × h after a
 * tick that "should" have landed exactly on the boundary. Without this
 * epsilon the loop would skip a tick and emit a one-frame hitch every so
 * often. The tolerance is many orders of magnitude below any meaningful
 * simulation interval, so it cannot manufacture extra ticks.
 * @type {number}
 */
const ACCUMULATOR_EPSILON_SECONDS = 1e-9;

/** Milliseconds per second, used for the rAF timestamp → seconds conversion. */
const MS_PER_SECOND = 1000;

/** Upper bound on a sane tick length (1 Hz). Guards against unit mistakes. */
const MAX_ALLOWED_TIME_STEP_SECONDS = 1;

/** Hard ceiling on the catch-up budget, protecting the frame budget. */
const MAX_ALLOWED_FRAME_SKIPS = 240;

/* ==========================================================================
 * TYPE DEFINITIONS
 * ========================================================================== */

/**
 * Called exactly once per fixed simulation tick.
 * @callback UpdateCallback
 * @param {number} dt Fixed timestep in seconds. ALWAYS the configured
 *   `fixedTimeStep`, never the raw frame delta.
 * @returns {void}
 */

/**
 * Called once per presentation frame, after all catch-up ticks.
 * @callback RenderCallback
 * @param {number} interpolationAlpha Fraction of a tick still un-simulated,
 *   in [0, 1]. Multiply by (current - previous) state to obtain the drawn
 *   position. See the interpolation derivation in the file header.
 * @returns {void}
 */

/**
 * Construction-time dependency bag. Every field is optional; sensible,
 * validated defaults are applied for anything omitted.
 * @typedef {Object} GameLoopOptions
 * @property {number} [fixedTimeStep=1/60] Simulation tick length, seconds.
 * @property {number} [maxFrameSkips=5] Maximum catch-up ticks per frame.
 * @property {number} [metricsWindow=120] Rolling metric sample capacity.
 * @property {UpdateCallback} [update] Initial simulation hook.
 * @property {RenderCallback} [render] Initial presentation hook.
 */

/**
 * Immutable diagnostic snapshot for the HUD / console.
 *
 * Timing fields are rolling averages over the configured sample window,
 * EXCEPT `worstFrameMs`, which is a high-water mark since the last reset.
 *
 * @typedef {Object} LoopMetrics
 * @property {number} fps Measured presentation rate (1000 / mean frame
 *   interval). This is DISPLAY rate, not simulation tick rate.
 * @property {number} frameMs Mean wall interval between presented frames.
 * @property {number} frameWorkMs Mean callback execution cost (update+render).
 * @property {number} updateMs Mean time spent inside all catch-up ticks.
 * @property {number} renderMs Mean time spent inside the render callback.
 * @property {number} worstFrameMs Highest observed callback cost since reset.
 * @property {number} samples Number of valid samples currently in the window.
 * @property {number} ticksLastFrame Ticks consumed by the most recent frame.
 * @property {number} maxTicksInFrame High-water mark of catch-up work.
 * @property {number} totalTicks Lifetime committed simulation ticks.
 * @property {number} totalFrames Lifetime presented frames.
 * @property {number} droppedTicks Ticks forfeited to the overflow guard.
 * @property {number} clampedFrames Frames whose delta was clamped.
 * @property {number} simulatedSeconds Lifetime simulated time (ticks × h).
 * @property {number} accumulator Un-consumed wall time, seconds.
 * @property {number} interpolationAlpha Last computed render phase, [0, 1].
 * @property {number} fixedTimeStep Configured tick length, seconds.
 * @property {number} maxFrameSkips Configured catch-up budget.
 * @property {boolean} running Whether the lifecycle is active.
 * @property {boolean} paused Whether an active lifecycle is suspended.
 */

/* ==========================================================================
 * ROLLING AVERAGE (internal, O(1) per sample)
 * ========================================================================== */

/**
 * Fixed-capacity ring buffer with an incrementally maintained sum.
 *
 * A naive "average the last N samples" implementation is O(N) per frame;
 * at a 120-sample window and 144 Hz that is ~17k reads/second for nothing.
 * Instead we store the running sum and, when overwriting the oldest slot,
 * subtract that slot's outgoing value before adding the incoming one:
 *
 *   sum' = sum - outgoing + incoming
 *
 * giving O(1) push and O(1) average with O(N) memory.
 *
 * Values are held in a Float64Array (not Float32Array) because millisecond
 * durations accumulate rounding error quickly when repeatedly subtracted
 * from a running sum at sub-microsecond resolution.
 */
class RollingAverage {
    /**
     * @param {number} capacity Positive integer sample capacity.
     */
    constructor(capacity) {
        /** @type {Float64Array} Backing ring storage. */
        this._values = new Float64Array(capacity);
        /** @type {number} Capacity, cached to avoid repeated property reads. */
        this._capacity = capacity;
        /** @type {number} Next write slot (also the oldest slot once full). */
        this._index = 0;
        /** @type {number} Number of valid samples, saturates at capacity. */
        this._count = 0;
        /** @type {number} Incrementally maintained sum of valid samples. */
        this._sum = 0;
    }

    /**
     * Appends a sample, evicting the oldest when the window is full.
     * Negative and non-finite samples are rejected so a single bad clock
     * reading can never poison the entire rolling window.
     * @param {number} value Non-negative, finite sample value.
     * @returns {void}
     */
    push(value) {
        if (!Number.isFinite(value) || value < 0) return;

        if (this._count === this._capacity) {
            this._sum -= this._values[this._index];
        } else {
            this._count += 1;
        }

        this._values[this._index] = value;
        this._sum += value;
        this._index = (this._index + 1) % this._capacity;
    }

    /**
     * @returns {number} Arithmetic mean of valid samples, or 0 when empty.
     */
    get average() {
        return this._count === 0 ? 0 : this._sum / this._count;
    }

    /**
     * @returns {number} Number of valid samples currently stored.
     */
    get samples() {
        return this._count;
    }

    /**
     * Clears all history. Called on start() and explicit resetMetrics().
     * @returns {void}
     */
    reset() {
        this._values.fill(0);
        this._index = 0;
        this._count = 0;
        this._sum = 0;
    }
}

/* ==========================================================================
 * GAME LOOP
 * ========================================================================== */

/**
 * Fixed-timestep simulation pump with variable-rate interpolated rendering.
 *
 * Lifecycle state machine:
 *
 *     ┌───────┐  start()   ┌─────────┐  pause()   ┌────────┐
 *     │ IDLE  │──────────►│ RUNNING │───────────►│ PAUSED │
 *     └───────┘           └─────────┘◄───────────└────────┘
 *         ▲                     │       resume()      │
 *         │       stop()        │                     │
 *         └─────────────────────┴─────────────────────┘
 *
 * All transitions are idempotent: calling start() twice never schedules two
 * rAF chains, and pause()/resume() on an idle loop are safe no-ops.
 *
 * Callback contract:
 *   - Both callbacks run synchronously on the rAF callback stack.
 *   - An update callback must complete well within `h` (16.67 ms at 60 Hz);
 *     the loop cannot reclaim time spent in user code.
 *   - Callbacks must not call start()/stop()/pause() reentrantly; use the
 *     lifecycle methods from outside the frame (events, timers, HUD).
 *   - A throwing callback stops the pump and re-throws into the browser's
 *     uncaught-error channel. Failing loudly is intentional: continuing to
 *     render a half-mutated world would hide the bug and corrupt state.
 */
export class GameLoop {
    /**
     * @param {GameLoopOptions} [options] Dependency bag. See typedef.
     * @throws {TypeError} If a supplied callback is not a function.
     * @throws {RangeError} If timing or window parameters are out of bounds.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[GameLoop] options must be an object.');
        }

        /* ---- Validate timing configuration ----------------------------- */
        const step = options.fixedTimeStep ?? DEFAULT_FIXED_TIME_STEP;
        if (!Number.isFinite(step) || step <= 0 || step > MAX_ALLOWED_TIME_STEP_SECONDS) {
            throw new RangeError(
                `[GameLoop] fixedTimeStep must be finite and in (0, ${MAX_ALLOWED_TIME_STEP_SECONDS}] seconds; received ${step}.`
            );
        }

        const skips = options.maxFrameSkips ?? DEFAULT_MAX_FRAME_SKIPS;
        if (!Number.isInteger(skips) || skips < 1 || skips > MAX_ALLOWED_FRAME_SKIPS) {
            throw new RangeError(
                `[GameLoop] maxFrameSkips must be an integer in [1, ${MAX_ALLOWED_FRAME_SKIPS}]; received ${skips}.`
            );
        }

        const windowSize = options.metricsWindow ?? DEFAULT_METRICS_WINDOW;
        if (!Number.isInteger(windowSize) || windowSize < 2 || windowSize > 4096) {
            throw new RangeError(
                `[GameLoop] metricsWindow must be an integer in [2, 4096]; received ${windowSize}.`
            );
        }

        /** @type {number} Fixed simulation increment, seconds. */
        this._fixedTimeStep = step;

        /** @type {number} Maximum ticks consumed per presentation frame. */
        this._maxFrameSkips = skips;

        /**
         * Maximum wall time admitted per frame, seconds.
         * This is the delta-clamp ceiling: N × h.
         * @type {number}
         */
        this._maxDeltaSeconds = step * skips;

        /* ---- Callbacks (null means "unbound", not "stub") --------------- */
        if (options.update !== undefined && typeof options.update !== 'function') {
            throw new TypeError('[GameLoop] update must be a function.');
        }
        if (options.render !== undefined && typeof options.render !== 'function') {
            throw new TypeError('[GameLoop] render must be a function.');
        }

        /** @type {?UpdateCallback} */
        this._updateCallback = options.update ?? null;
        /** @type {?RenderCallback} */
        this._renderCallback = options.render ?? null;

        /* ---- Accumulator & clock state --------------------------------- */
        /** @type {number} Leftover unsimulated wall time, seconds. */
        this._accumulator = 0;
        /** @type {number} Last computed render interpolation phase. */
        this._interpolationAlpha = 0;
        /** @type {?number} Previous rAF timestamp; null forces a clean restart. */
        this._lastTimestamp = null;
        /** @type {?number} Active rAF handle; null means nothing is scheduled. */
        this._rafId = null;
        /** @type {boolean} Lifecycle active (may still be paused). */
        this._running = false;
        /** @type {boolean} Active lifecycle currently suspended. */
        this._paused = false;

        /* ---- Counters --------------------------------------------------- */
        /** @type {number} */ this._totalTicks = 0;
        /** @type {number} */ this._totalFrames = 0;
        /** @type {number} */ this._ticksLastFrame = 0;
        /** @type {number} */ this._maxTicksInFrame = 0;
        /** @type {number} */ this._droppedTicks = 0;
        /** @type {number} */ this._clampedFrames = 0;

        /* ---- Rolling diagnostics --------------------------------------- */
        /** @type {number} Ring capacity, retained for resetMetrics(). */
        this._metricsWindow = windowSize;
        /** @type {RollingAverage} Wall interval between presented frames. */
        this._frameInterval = new RollingAverage(windowSize);
        /** @type {RollingAverage} Total callback cost per frame. */
        this._frameWork = new RollingAverage(windowSize);
        /** @type {RollingAverage} Cost of all catch-up ticks per frame. */
        this._updateWork = new RollingAverage(windowSize);
        /** @type {RollingAverage} Cost of the render callback per frame. */
        this._renderWork = new RollingAverage(windowSize);
        /** @type {?number} Previous frame's rAF timestamp for interval samples. */
        this._lastSampleTimestamp = null;
        /** @type {number} High-water mark of per-frame callback cost. */
        this._worstFrameMs = 0;

        /**
         * Bound once so every rAF scheduling site passes the SAME function
         * reference. Rebinding per frame would allocate a closure 60–144
         * times per second for no benefit.
         * @type {(timestamp: DOMHighResTimeStamp) => void}
         */
        this._frame = (timestamp) => this._advance(timestamp);
    }

    /* ======================================================================
     * PUBLIC LIFECYCLE API
     * ====================================================================== */

    /**
     * Starts (or restarts) the pump from a clean temporal state.
     *
     * All clocks, counters and metric windows are reset: a restart must not
     * inherit debt from a previous session, or the first frame after a
     * restart would immediately run a catch-up storm.
     *
     * Idempotent while running. If called on a paused loop, delegates to
     * resume() so callers need not track the paused flag themselves.
     *
     * @returns {this} Fluent chaining.
     */
    start() {
        if (this._running) {
            if (this._paused) this.resume();
            return this;
        }

        this._running = true;
        this._paused = false;
        this._accumulator = 0;
        this._interpolationAlpha = 0;
        this._lastTimestamp = null;
        this._lastSampleTimestamp = null;

        this._totalTicks = 0;
        this._totalFrames = 0;
        this._ticksLastFrame = 0;
        this._maxTicksInFrame = 0;
        this._droppedTicks = 0;
        this._clampedFrames = 0;

        this.resetMetrics();
        this._schedule();
        return this;
    }

    /**
     * Halts the pump completely and releases the rAF handle.
     *
     * Metric history and lifetime counters are INTENTIONALLY retained so a
     * post-mortem HUD can still display the last measured FPS and the total
     * number of forfeited ticks. Use resetMetrics() for a clean slate.
     *
     * @returns {this}
     */
    stop() {
        this._cancelScheduledFrame();
        this._running = false;
        this._paused = false;
        this._lastTimestamp = null;
        this._accumulator = 0;
        this._interpolationAlpha = 0;
        return this;
    }

    /**
     * Suspends simulation without discarding the accumulator.
     *
     * The partial tick already banked in the accumulator is preserved, so
     * resuming continues the same simulation phase. Only the CLOCK is
     * cleared: on resume the first frame establishes a fresh baseline
     * instead of charging the entire pause duration as simulation debt.
     *
     * @returns {this}
     */
    pause() {
        if (!this._running || this._paused) return this;

        this._paused = true;
        this._cancelScheduledFrame();
        this._lastTimestamp = null;
        return this;
    }

    /**
     * Resumes a paused pump with a clean clock baseline.
     *
     * The interval-metric baseline is also cleared, otherwise the pause
     * duration would be recorded as one enormous frame interval and drag
     * the rolling FPS average down for its entire window.
     *
     * @returns {this}
     */
    resume() {
        if (!this._running || !this._paused) return this;

        this._paused = false;
        this._lastTimestamp = null;
        this._lastSampleTimestamp = null;
        this._schedule();
        return this;
    }

    /* ======================================================================
     * PUBLIC CALLBACK & QUERY API
     * ====================================================================== */

    /**
     * Binds or unbinds the simulation hook.
     *
     * Safe to call between frames; bindings are read at the start of each
     * frame, never cached, so hot-swapping a subsystem (e.g. attaching the
     * WorldManager after an async map load) needs no loop restart.
     *
     * @param {?UpdateCallback} callback Function, or null to unbind.
     * @returns {this}
     * @throws {TypeError} If callback is neither a function nor null.
     */
    setUpdateCallback(callback) {
        if (callback !== null && typeof callback !== 'function') {
            throw new TypeError('[GameLoop] update callback must be a function or null.');
        }
        this._updateCallback = callback;
        return this;
    }

    /**
     * Binds or unbinds the presentation hook.
     * @param {?RenderCallback} callback Function, or null to unbind.
     * @returns {this}
     * @throws {TypeError} If callback is neither a function nor null.
     */
    setRenderCallback(callback) {
        if (callback !== null && typeof callback !== 'function') {
            throw new TypeError('[GameLoop] render callback must be a function or null.');
        }
        this._renderCallback = callback;
        return this;
    }

    /** @returns {boolean} Whether the lifecycle is active (including paused). */
    isRunning() {
        return this._running;
    }

    /** @returns {boolean} Whether an active lifecycle is suspended. */
    isPaused() {
        return this._paused;
    }

    /**
     * Current render interpolation phase, for systems that render outside
     * the loop (e.g. a DOM HUD sampling entity positions mid-frame).
     * @returns {number} Value in [0, 1].
     */
    getInterpolationAlpha() {
        return this._interpolationAlpha;
    }

    /**
     * Configured fixed tick length, in seconds. Systems that integrate
     * motion must use this value, never an assumed 1/60.
     * @returns {number}
     */
    getFixedTimeStep() {
        return this._fixedTimeStep;
    }

    /**
     * Clears rolling metric history and high-water marks WITHOUT touching
     * simulation state. Useful after a known discontinuity (world shift,
     * asset stream stall) that would otherwise pollute the averages.
     * @returns {this}
     */
    resetMetrics() {
        this._frameInterval.reset();
        this._frameWork.reset();
        this._updateWork.reset();
        this._renderWork.reset();
        this._lastSampleTimestamp = null;
        this._worstFrameMs = 0;
        return this;
    }

    /**
     * Produces a diagnostic snapshot. Allocates one plain object, so HUDs
     * should poll this at a readable rate (4–10 Hz), not once per tick.
     *
     * @returns {LoopMetrics} Consistent snapshot of timing and counters.
     */
    getMetrics() {
        const meanInterval = this._frameInterval.average;

        return {
            fps: meanInterval > 0 ? MS_PER_SECOND / meanInterval : 0,
            frameMs: meanInterval,
            frameWorkMs: this._frameWork.average,
            updateMs: this._updateWork.average,
            renderMs: this._renderWork.average,
            worstFrameMs: this._worstFrameMs,
            samples: this._frameWork.samples,
            ticksLastFrame: this._ticksLastFrame,
            maxTicksInFrame: this._maxTicksInFrame,
            totalTicks: this._totalTicks,
            totalFrames: this._totalFrames,
            droppedTicks: this._droppedTicks,
            clampedFrames: this._clampedFrames,
            simulatedSeconds: this._totalTicks * this._fixedTimeStep,
            accumulator: this._accumulator,
            interpolationAlpha: this._interpolationAlpha,
            fixedTimeStep: this._fixedTimeStep,
            maxFrameSkips: this._maxFrameSkips,
            running: this._running,
            paused: this._paused
        };
    }

    /* ======================================================================
     * INTERNAL: SCHEDULING
     * ====================================================================== */

    /**
     * Schedules exactly one presentation frame, guarding against duplicate
     * chains (the classic bug where start() + resume() each schedule a rAF
     * and the loop silently doubles in speed).
     * @returns {void}
     * @private
     */
    _schedule() {
        if (this._rafId !== null) return;
        this._rafId = requestAnimationFrame(this._frame);
    }

    /**
     * Cancels any pending frame and clears the handle.
     * @returns {void}
     * @private
     */
    _cancelScheduledFrame() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /* ======================================================================
     * INTERNAL: TIMING MATH
     * ====================================================================== */

    /**
     * Converts and clamps a raw wall interval into admissible simulation
     * time.
     *
     * Three cases:
     *   1. Non-finite or non-positive → 0. A duplicate/earlier rAF timestamp
     *      can occur when a browser coalesces callbacks; charging negative
     *      time would move the accumulator backwards.
     *   2. Larger than N × h → N × h, and increment the clamp counter. This
     *      is the tab-switch / GC-stall guard.
     *   3. Otherwise → the raw value, unchanged (no quantization error).
     *
     * @param {number} rawDeltaSeconds Unsigned intent, seconds.
     * @returns {number} Admissible delta, seconds, in [0, N × h].
     * @private
     */
    _clampDelta(rawDeltaSeconds) {
        if (!Number.isFinite(rawDeltaSeconds) || rawDeltaSeconds <= 0) return 0;

        if (rawDeltaSeconds > this._maxDeltaSeconds) {
            this._clampedFrames += 1;
            return this._maxDeltaSeconds;
        }
        return rawDeltaSeconds;
    }

    /**
     * Consumes the accumulator in fixed increments, bounded by the catch-up
     * budget, then disposes of any residual overflow.
     *
     * @returns {number} Number of simulation ticks actually executed.
     * @private
     */
    _consumeAccumulator() {
        /* No simulation hook bound: there is nothing to advance, so drain
         * the clock rather than accumulating phantom debt. Presentation
         * still runs, which lets a loader animate before systems attach. */
        if (this._updateCallback === null) {
            this._accumulator = 0;
            return 0;
        }

        const h = this._fixedTimeStep;
        let ticks = 0;

        while (
            ticks < this._maxFrameSkips &&
            this._accumulator + ACCUMULATOR_EPSILON_SECONDS >= h
        ) {
            this._updateCallback(h);
            this._accumulator = Math.max(0, this._accumulator - h);
            ticks += 1;
        }

        /* Overflow branch: the budget was exhausted while debt remained.
         * Convert the remaining debt into whole discarded ticks for the
         * diagnostic counter, then reset the phase. See the spiral-of-death
         * derivation in the file header for why we do NOT keep a remainder. */
        if (this._accumulator + ACCUMULATOR_EPSILON_SECONDS >= h) {
            const forfeited = Math.floor(
                this._accumulator / h + ACCUMULATOR_EPSILON_SECONDS
            );
            this._droppedTicks += Math.max(1, forfeited);
            this._accumulator = 0;
        }

        return ticks;
    }

    /* ======================================================================
     * INTERNAL: FRAME ADVANCE
     * ====================================================================== */

    /**
     * The single heart of the engine. Called once per display frame.
     *
     * Sequence:
     *   sample wall delta → clamp → bank → tick (bounded) → derive alpha
     *   → render → record metrics → schedule next frame.
     *
     * Scheduling happens LAST and only after callbacks succeed. If a
     * callback throws, the catch block stops the pump and re-throws, so a
     * broken simulation cannot keep presenting corrupted frames.
     *
     * @param {DOMHighResTimeStamp} timestamp rAF's monotonic presentation
     *   timestamp, in milliseconds.
     * @returns {void}
     * @private
     */
    _advance(timestamp) {
        /* The handle is consumed the moment the callback fires. Clearing it
         * here (rather than after scheduling) keeps _schedule()'s duplicate
         * guard correct even if a callback inspects loop state. */
        this._rafId = null;

        if (!this._running || this._paused) return;

        /* First frame after start/resume: establish a baseline and charge
         * zero time. Without this, the first delta would span everything
         * since the previous clock reading, including any pause. */
        if (this._lastTimestamp === null) {
            this._lastTimestamp = timestamp;
        }

        const rawDeltaSeconds = (timestamp - this._lastTimestamp) / MS_PER_SECOND;
        this._lastTimestamp = timestamp;

        const deltaSeconds = this._clampDelta(rawDeltaSeconds);
        this._accumulator += deltaSeconds;

        const workStart = performance.now();
        let updateMs = 0;
        let renderMs = 0;
        let ticks = 0;

        try {
            /* ---- Simulation phase -------------------------------------- */
            const updateStart = workStart;
            ticks = this._consumeAccumulator();
            updateMs = performance.now() - updateStart;

            /* ---- Interpolation phase ----------------------------------- */
            /* Clamping is defensive: the epsilon comparison can leave a
             * mathematically negative remainder, which we already floor to
             * zero, but a future refactor must not be able to emit alpha
             * outside [0, 1] and extrapolate entities out of their hitboxes. */
            this._interpolationAlpha = Math.min(
                1,
                Math.max(0, this._accumulator / this._fixedTimeStep)
            );

            /* ---- Presentation phase ------------------------------------ */
            if (this._renderCallback !== null) {
                const renderStart = performance.now();
                this._renderCallback(this._interpolationAlpha);
                renderMs = performance.now() - renderStart;
            }
        } catch (error) {
            /* Fail closed: stop the pump, then surface the original error
             * unchanged so stack traces and error types survive to the
             * browser's global handler (and to src/index.js's overlay hook.. */
            this.stop();
            throw error;
        }

        const frameWorkMs = performance.now() - workStart;

        /* ---- Commit counters ------------------------------------------- */
        this._totalFrames += 1;
        this._totalTicks += ticks;
        this._ticksLastFrame = ticks;
        if (ticks > this._maxTicksInFrame) this._maxTicksInFrame = ticks;
        if (frameWorkMs > this._worstFrameMs) this._worstFrameMs = frameWorkMs;

        /* ---- Rolling diagnostics --------------------------------------- */
        /* The very first frame has no predecessor interval, so we skip that
         * one sample instead of inserting a fictitious 0 ms interval (which
         * would inflate FPS) or the full page-load duration (which would
         * crater it). */
        if (this._lastSampleTimestamp !== null) {
            const intervalMs = timestamp - this._lastSampleTimestamp;
            this._frameInterval.push(intervalMs);
        }
        this._lastSampleTimestamp = timestamp;

        this._frameWork.push(frameWorkMs);
        this._updateWork.push(updateMs);
        this._renderWork.push(renderMs);

        /* ---- Next presentation ----------------------------------------- */
        this._schedule();
    }
}

export default GameLoop;