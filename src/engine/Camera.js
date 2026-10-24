/**
 * @file src/engine/Camera.js
 * @module engine/Camera
 *
 * @description
 * Viewport controller for "YUCCA".
 *
 * The Camera owns the mapping between WORLD space (the full ASCII map,
 * measured in CSS pixels) and SCREEN space (the player's viewport). It
 * provides:
 *
 *   1. Smooth target tracking with frame-rate-independent exponential
 *      damping, so the view glides toward the player instead of snapping.
 *   2. Hard bounds clamping against the active map matrix, so the viewport
 *      never exposes dead space beyond the world edges.
 *   3. A procedural screen-shake system with duration, frequency, and
 *      intensity parameters for impacts, boss hits, and Drab World thunder.
 *   4. World↔screen conversion helpers for mouse picking, floating combat
 *      text, and UI overlays.
 *
 * The Renderer consumes this object's `x`, `y`, `shakeX`, and `shakeY`
 * fields every frame; those four properties form the stable contract
 * between the two systems.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TRACKING MATH: EXPONENTIAL DAMPING (FRAME-RATE-INDEPENDENT LERP)
 * ───────────────────────────────────────────────────────────────────────────
 * A naive per-tick lerp:
 *
 *   pos += (target - pos) * s            (s = fixed fraction per tick)
 *
 * converges at different speeds on a 60 Hz and a 144 Hz display, because it
 * applies the fraction once per tick. This game runs a fixed timestep, but
 * cameras must also survive catch-up bursts and future variable-rate
 * rendering, so we use the continuous-time solution instead.
 *
 * For a critically damped pursuit with rate constant k (1/seconds):
 *
 *   remaining_fraction(t) = e^(-k · t)
 *
 * Over one tick of length dt the camera must cover:
 *
 *   alpha = 1 - e^(-k · dt)
 *   pos  += (target - pos) * alpha
 *
 * After any elapsed time T the remaining distance is exactly e^(-k·T) of the
 * original gap, REGARDLESS of how many ticks subdivided T. k = 8 converges
 * ~98% of the gap in 0.5 s; raise k for snappier combat cameras, lower it
 * for dreamy exploration drift.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BOUNDS CLAMPING
 * ───────────────────────────────────────────────────────────────────────────
 * Let mapW/mapH be the map pixel size and viewW/viewH the viewport size.
 * The camera top-left must satisfy:
 *
 *   0 ≤ cam ≤ map - view           when map ≥ view on that axis
 *
 * When the map is SMALLER than the viewport (tiny caves, boss arenas), the
 * inequality inverts. Instead of exposing void, we center the map:
 *
 *   cam = (map - view) / 2         (negative offset, map centered)
 *
 * Clamping runs AFTER the lerp, every tick. Lerping toward a clamped edge
 * naturally decelerates against the boundary without any special casing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SCREEN-SHAKE VECTOR MATH
 * ───────────────────────────────────────────────────────────────────────────
 * A shake is a decaying sinusoid, not random jitter: random per-frame jitter
 * aliases against the fixed timestep and looks like vibration noise. Two
 * phase-offset sine waves with slightly different frequencies produce smooth
 * elliptical motion that reads as impact:
 *
 *   progress = t / duration
 *   envelope = (1 - progress)²                    ← quadratic ease-out
 *   shakeX   = intensity · envelope · sin(2π·f·t + φx)
 *   shakeY   = intensity · envelope · cos(2π·1.13·f·t + φy)
 *
 * The 1.13 frequency ratio between axes prevents the path from closing into
 * a visible circle. The quadratic envelope spends most of its energy early —
 * the hit lands hard, then the world settles. Phases φ are randomized per
 * shake so consecutive impacts never phase-align into a predictable rhythm.
 *
 * The Renderer applies shake as a transient ctx.translate() that does NOT
 * invalidate its presented-cell cache, so shakes cost zero redraws.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** Default damping rate constant k (see header math). ~98% in 0.5 s. */
const DEFAULT_SMOOTHING = 8;

/* ══════════════════════════════════════════════════════════════════════════
 * ZOOM CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════
 * The camera owns a fluid zoom exactly like its pursuit: a target level
 * approached through the same frame-rate-independent exponential damping,
 * so wheel input resolves to a glide, never a snap.
 *
 *   MIN 0.35× — macro world overview: most of a 80×36 map in one glance.
 *   MAX 4.0× — intimate close-up: individual glyph stitches of the poncho.
 *
 * ZOOM SEMANTICS — camera.x/.y remain WORLD CSS pixels of the view's
 * top-left, and viewportWidth/Height report the EFFECTIVE world-space view
 * extent (physical / zoom). Every existing consumer that reasons in world
 * pixels (WeatherSystem spawn bounds, HUD radar center, pursuit, clamping)
 * therefore stays correct at any zoom without knowing zoom exists.
 * Screen-facing consumers use worldToScreen/screenToWorld, which scale by
 * zoom symmetrically.
 */

/** Minimum zoom (macro overview). */
const MIN_ZOOM = 0.35;

/** Maximum zoom (intimate close-up). */
const MAX_ZOOM = 4.0;

/** Damping rate constant for the zoom glide, 1/seconds. */
const DEFAULT_ZOOM_SMOOTHING = 6;

/** Zoom is considered settled below this |zoom − target| distance. */
const ZOOM_SNAP_EPSILON = 0.001;

/**
 * Distance in pixels below which the camera snaps to the target. Kills
 * sub-pixel oscillation that would otherwise churn the Renderer's rounding
 * forever. Half a pixel is invisible; anything less is wasted work.
 */
const SNAP_EPSILON_PIXELS = 0.5;

/** Vertical frequency multiplier for the shake ellipse (see header math). */
const SHAKE_AXIS_FREQUENCY_RATIO = 1.13;

/** Hard cap on shake intensity to protect readability during bug storms. */
const MAX_SHAKE_INTENSITY = 64;

/* ══════════════════════════════════════════════════════════════════════════
 * CAMERA
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Viewport state machine: smooth pursuit, bounds clamping, screen shake,
 * and coordinate conversion.
 *
 * Renderer consumption contract (read-only, every frame):
 * @property {number} x       Camera top-left x in world CSS pixels.
 * @property {number} y       Camera top-left y in world CSS pixels.
 * @property {number} shakeX  Transient horizontal shake offset, CSS pixels.
 * @property {number} shakeY  Transient vertical shake offset, CSS pixels.
 */
export class Camera {
    /**
     * @param {Object} [options]
     * @param {number} options.viewportWidth  Viewport width in CSS pixels.
     * @param {number} options.viewportHeight Viewport height in CSS pixels.
     * @param {number} [options.cellWidth=1]  Glyph advance width, CSS pixels.
     * @param {number} [options.cellHeight=1] Row pitch, CSS pixels.
     * @param {number} [options.mapCols=0]    Map width in cells (0 = unbounded).
     * @param {number} [options.mapRows=0]    Map height in cells (0 = unbounded).
     * @param {number} [options.smoothing=8]  Damping rate constant k (1/s).
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[Camera] options must be an object.');
        }

        const viewportWidth = options.viewportWidth;
        const viewportHeight = options.viewportHeight;

        if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
            throw new RangeError('[Camera] viewportWidth must be positive and finite.');
        }
        if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
            throw new RangeError('[Camera] viewportHeight must be positive and finite.');
        }

        /** @type {number} Viewport width in CSS pixels. */
        this._viewportW = viewportWidth;

        /** @type {number} Viewport height in CSS pixels. */
        this._viewportH = viewportHeight;

        /** @type {number} Glyph advance width in CSS pixels. */
        this._cellW = Number.isFinite(options.cellWidth) && options.cellWidth > 0
            ? options.cellWidth
            : 1;

        /** @type {number} Row pitch in CSS pixels. */
        this._cellH = Number.isFinite(options.cellHeight) && options.cellHeight > 0
            ? options.cellHeight
            : 1;

        /** @type {number} Map width in cells (0 disables clamping on x). */
        this._mapCols = 0;

        /** @type {number} Map height in cells (0 disables clamping on y). */
        this._mapRows = 0;

        /** @type {number} Map width in CSS pixels, derived from cells. */
        this._mapW = 0;

        /** @type {number} Map height in CSS pixels, derived from cells. */
        this._mapH = 0;

        /** @type {number} Camera top-left x, world CSS pixels. */
        this._x = 0;

        /** @type {number} Camera top-left y, world CSS pixels. */
        this._y = 0;

        /** @type {?{x: number, y: number}} Tracked target (usually Player). */
        this._target = null;

        /** @type {number} Damping rate constant k in 1/seconds. */
        this._smoothing = Number.isFinite(options.smoothing) && options.smoothing > 0
            ? options.smoothing
            : DEFAULT_SMOOTHING;

        /* ---- Shake state ----------------------------------------------- */
        /** @type {number} Total shake duration in seconds. */
        this._shakeDuration = 0;

        /** @type {number} Elapsed shake time in seconds. */
        this._shakeElapsed = 0;

        /** @type {number} Peak shake displacement in CSS pixels. */
        this._shakeIntensity = 0;

        /** @type {number} Horizontal oscillation frequency in Hz. */
        this._shakeFrequency = 0;

        /** @type {number} Random phase for the x sine wave. */
        this._phaseX = 0;

        /** @type {number} Random phase for the y cosine wave. */
        this._phaseY = 0;

        /** @type {number} Live horizontal shake offset, CSS pixels. */
        this._shakeX = 0;

        /** @type {number} Live vertical shake offset, CSS pixels. */
        this._shakeY = 0;

        /* ---- Zoom state ------------------------------------------------- */
        /** @type {number} Current zoom level (1 = native cell size). */
        this._zoom = 1;

        /** @type {number} Target zoom level. */
        this._targetZoom = 1;

        /** @type {number} Zoom glide damping rate constant, 1/seconds. */
        this._zoomSmoothing = Number.isFinite(options.zoomSmoothing) &&
            options.zoomSmoothing > 0
            ? options.zoomSmoothing
            : DEFAULT_ZOOM_SMOOTHING;

        /**
         * Cursor-anchored zoom pin: while the zoom glides, the world point
         * captured under the pointer stays under the pointer.
         * @type {?{screenX: number, screenY: number, worldX: number, worldY: number}}
         */
        this._zoomAnchor = null;

        /* Apply initial map bounds if provided. */
        if (options.mapCols || options.mapRows) {
            this.setMapSize(options.mapCols || 0, options.mapRows || 0);
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
     * RENDERER CONTRACT PROPERTIES
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {number} Camera top-left x in world CSS pixels. */
    get x() {
        return this._x;
    }

    /** @returns {number} Camera top-left y in world CSS pixels. */
    get y() {
        return this._y;
    }

    /** @returns {number} Current horizontal shake offset, CSS pixels. */
    get shakeX() {
        return this._shakeX;
    }

    /** @returns {number} Current vertical shake offset, CSS pixels. */
    get shakeY() {
        return this._shakeY;
    }

    /** @returns {boolean} True while a shake effect is still active. */
    get isShaking() {
        return this._shakeDuration > 0 && this._shakeElapsed < this._shakeDuration;
    }

    /** @returns {number} Current zoom level (1 = native cell size). */
    get zoom() {
        return this._zoom;
    }

    /** @returns {number} Target zoom level the glide is approaching. */
    get targetZoom() {
        return this._targetZoom;
    }

    /** @returns {boolean} True while a zoom glide or its anchor is active. */
    get isZooming() {
        return Math.abs(this._targetZoom - this._zoom) > ZOOM_SNAP_EPSILON ||
            this._zoomAnchor !== null;
    }

    /**
     * EFFECTIVE viewport width in WORLD CSS pixels (physical / zoom).
     * This is the world-space horizontal extent of the view — the quantity
     * every world-space consumer (spawn bounds, radar centers, clamping)
     * needs. At zoom 1 it equals the physical width (legacy behavior).
     * @returns {number}
     */
    get viewportWidth() {
        return this._viewportW / this._zoom;
    }

    /**
     * EFFECTIVE viewport height in WORLD CSS pixels (physical / zoom).
     * @returns {number}
     */
    get viewportHeight() {
        return this._viewportH / this._zoom;
    }

    /**
     * PHYSICAL viewport width in CSS pixels (window size, zoom-independent).
     * @returns {number}
     */
    get physicalWidth() {
        return this._viewportW;
    }

    /**
     * PHYSICAL viewport height in CSS pixels.
     * @returns {number}
     */
    get physicalHeight() {
        return this._viewportH;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CONFIGURATION
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Assigns the tracked entity. Any object exposing numeric `x`/`y` works
     * (Player, BossDragon, a scripted cinematic focus point). Pass null to
     * freeze the camera at its current position.
     *
     * @param {?{x: number, y: number}} target Entity to pursue.
     * @returns {this}
     */
    setTarget(target) {
        if (target !== null && (typeof target.x !== 'number' || typeof target.y !== 'number')) {
            throw new TypeError('[Camera] target must expose numeric x and y.');
        }
        this._target = target;
        return this;
    }

    /**
     * Sets the active map dimensions and re-derives pixel bounds.
     *
     * Call on every WorldManager map load and dimension shift. A value of 0
     * on an axis disables clamping on that axis (endless-scroll arenas).
     *
     * @param {number} cols Map width in grid cells.
     * @param {number} rows Map height in grid cells.
     * @returns {this}
     */
    setMapSize(cols, rows) {
        const c = Math.max(0, Math.trunc(cols));
        const r = Math.max(0, Math.trunc(rows));

        this._mapCols = c;
        this._mapRows = r;
        this._mapW = c * this._cellW;
        this._mapH = r * this._cellH;

        /* Re-clamp immediately so a smaller map never leaves the camera
         * stranded outside the new world. */
        this._x = this._clampAxis(this._x, this._mapW, this.effectiveViewW());
        this._y = this._clampAxis(this._y, this._mapH, this.effectiveViewH());
        return this;
    }

    /**
     * Updates glyph metrics after Renderer font recalibration or resize.
     * Pixel map bounds are re-derived from the stored cell dimensions.
     *
     * @param {number} cellWidth New glyph advance width, CSS pixels.
     * @param {number} cellHeight New row pitch, CSS pixels.
     * @returns {this}
     */
    setCellMetrics(cellWidth, cellHeight) {
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
            throw new RangeError('[Camera] cellWidth must be positive.');
        }
        if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
            throw new RangeError('[Camera] cellHeight must be positive.');
        }

        this._cellW = cellWidth;
        this._cellH = cellHeight;
        this._mapW = this._mapCols * cellWidth;
        this._mapH = this._mapRows * cellHeight;

        this._x = this._clampAxis(this._x, this._mapW, this.effectiveViewW());
        this._y = this._clampAxis(this._y, this._mapH, this.effectiveViewH());
        return this;
    }

    /**
     * Handles viewport resize events forwarded from the Renderer pipeline.
     *
     * @param {number} width New viewport width, CSS pixels.
     * @param {number} height New viewport height, CSS pixels.
     * @returns {this}
     */
    setViewport(width, height) {
        if (!Number.isFinite(width) || width <= 0) {
            throw new RangeError('[Camera] viewport width must be positive.');
        }
        if (!Number.isFinite(height) || height <= 0) {
            throw new RangeError('[Camera] viewport height must be positive.');
        }

        this._viewportW = width;
        this._viewportH = height;

        this._x = this._clampAxis(this._x, this._mapW, this.effectiveViewW());
        this._y = this._clampAxis(this._y, this._mapH, this.effectiveViewH());
        return this;
    }

    /**
     * Adjusts pursuit stiffness.
     *
     * @param {number} k Damping rate constant in 1/seconds. Higher = snappier.
     * @returns {this}
     */
    setSmoothing(k) {
        if (!Number.isFinite(k) || k <= 0) {
            throw new RangeError('[Camera] smoothing must be positive.');
        }
        this._smoothing = k;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ZOOM CONTROL
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Effective world-space view width (physical / zoom).
     * @returns {number}
     */
    effectiveViewW() {
        return this._viewportW / this._zoom;
    }

    /**
     * Effective world-space view height (physical / zoom).
     * @returns {number}
     */
    effectiveViewH() {
        return this._viewportH / this._zoom;
    }

    /**
     * Sets a new target zoom with an optional screen-space anchor.
     *
     * The anchor pins the world point currently under (screenX, screenY):
     * while the zoom glides, every tick re-solves the camera position so
     * that point stays under the pointer — the familiar map-application
     * zoom-to-cursor. Anchoring at the viewport center reproduces
     * classic centered zoom. The anchor is released once the glide
     * settles or a new pursuit target takes over.
     *
     * @param {number} zoom Absolute target zoom (clamped to [0.35, 4]).
     * @param {number} [screenX] Anchor screen x, CSS px (defaults to the
     *   physical viewport center).
     * @param {number} [screenY] Anchor screen y, CSS px.
     * @returns {this}
     */
    setZoom(zoom, screenX, screenY) {
        if (!Number.isFinite(zoom) || zoom <= 0) return this;

        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
        if (next === this._targetZoom) return this;

        const anchorX = Number.isFinite(screenX)
            ? screenX
            : this._viewportW / 2;
        const anchorY = Number.isFinite(screenY)
            ? screenY
            : this._viewportH / 2;

        const world = this.screenToWorld(anchorX, anchorY);
        this._zoomAnchor = {
            screenX: anchorX,
            screenY: anchorY,
            worldX: world.x,
            worldY: world.y
        };
        this._targetZoom = next;
        return this;
    }

    /**
     * Multiplicative zoom request (wheel notches): target ×= factor.
     *
     * @param {number} factor Multiplier > 0 (> 1 zooms in).
     * @param {number} [screenX] Anchor screen x, CSS px.
     * @param {number} [screenY] Anchor screen y, CSS px.
     * @returns {this}
     */
    zoomAt(factor, screenX, screenY) {
        if (!Number.isFinite(factor) || factor <= 0) return this;
        return this.setZoom(this._targetZoom * factor, screenX, screenY);
    }

    /**
     * Cancels any in-flight zoom glide and anchor immediately.
     * @returns {this}
     */
    cancelZoom() {
        this._targetZoom = this._zoom;
        this._zoomAnchor = null;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PER-TICK UPDATE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Advances zoom glide, pursuit, clamping, and shake by one fixed tick.
     *
     * Order is contractual:
     *   1. Glide zoom toward its target (exponential damping, like pursuit).
     *   2. Lerp toward the target's centered desired position, using the
     *      EFFECTIVE (zoom-divided) viewport extent.
     *   3. Snap when inside the epsilon to stop sub-pixel churn.
     *   4. Re-solve the zoom anchor (cursor pin) for the new zoom level.
     *   5. Clamp into map bounds at the effective view size.
     *   6. Advance the shake envelope.
     *
     * @param {number} dt Fixed timestep in seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;

        /* ---- 1. Zoom glide ------------------------------------------------ */
        if (Math.abs(this._targetZoom - this._zoom) > ZOOM_SNAP_EPSILON) {
            const zAlpha = 1 - Math.exp(-this._zoomSmoothing * dt);
            this._zoom += (this._targetZoom - this._zoom) * zAlpha;

            if (Math.abs(this._targetZoom - this._zoom) <= ZOOM_SNAP_EPSILON) {
                this._zoom = this._targetZoom;
                this._zoomAnchor = null; /* glide settled: release the pin */
            }
        }

        /* ---- 2. Exponential-damped pursuit ------------------------------- */
        if (this._target) {
            const viewW = this._viewportW / this._zoom;
            const viewH = this._viewportH / this._zoom;
            const desiredX = this._target.x - viewW / 2;
            const desiredY = this._target.y - viewH / 2;

            /* alpha = 1 - e^(-k·dt): the exact discrete solution of the
             * continuous decay, independent of tick rate. See header. */
            const alpha = 1 - Math.exp(-this._smoothing * dt);

            this._x += (desiredX - this._x) * alpha;
            this._y += (desiredY - this._y) * alpha;

            /* ---- 3. Epsilon snap -------------------------------------- */
            if (Math.abs(desiredX - this._x) < SNAP_EPSILON_PIXELS) {
                this._x = desiredX;
            }
            if (Math.abs(desiredY - this._y) < SNAP_EPSILON_PIXELS) {
                this._y = desiredY;
            }
        }

        /* ---- 4. Zoom anchor: keep the pinned world point under the pin --- */
        if (this._zoomAnchor) {
            this._x = this._zoomAnchor.worldX - this._zoomAnchor.screenX / this._zoom;
            this._y = this._zoomAnchor.worldY - this._zoomAnchor.screenY / this._zoom;
        }

        /* ---- 5. Bounds clamping (effective view size) --------------------- */
        this._x = this._clampAxis(this._x, this._mapW, this.effectiveViewW());
        this._y = this._clampAxis(this._y, this._mapH, this.effectiveViewH());

        /* ---- 6. Shake envelope -------------------------------------------- */
        this._updateShake(dt);

        return this;
    }

    /**
     * Clamps one camera axis into legal map space.
     *
     * mapPx ≤ 0      → axis unbounded, position passes through untouched.
     * mapPx ≤ viewPx → map smaller than viewport: center the map, which
     *                  yields a negative offset that the Renderer handles.
     * otherwise      → classic clamp into [0, mapPx - viewPx].
     *
     * @param {number} pos Candidate camera position on this axis.
     * @param {number} mapPx Map size on this axis in CSS pixels.
     * @param {number} viewPx Viewport size on this axis in CSS pixels.
     * @returns {number} Legal camera position.
     * @private
     */
    _clampAxis(pos, mapPx, viewPx) {
        if (!Number.isFinite(mapPx) || mapPx <= 0) return pos;

        if (mapPx <= viewPx) {
            return (mapPx - viewPx) / 2;
        }

        const max = mapPx - viewPx;
        return Math.min(Math.max(pos, 0), max);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * SCREEN SHAKE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Triggers a screen-shake effect.
     *
     * Stacking policy: if a shake is already running, the new parameters
     * only take over when their intensity is at least as large as the
     * CURRENT envelope-scaled intensity. Weak tremors during a boss slam
     * must not cancel the slam.
     *
     * @param {number} duration  Shake length in seconds (> 0).
     * @param {number} intensity Peak displacement in CSS pixels (> 0,
     *   capped at 64 to keep the ASCII grid readable).
     * @param {number} [frequency=25] Oscillation frequency in Hz. 20–30 reads
     *   as impact; 5–10 reads as rolling thunder.
     * @returns {this}
     */
    shake(duration, intensity, frequency = 25) {
        if (!Number.isFinite(duration) || duration <= 0) return this;
        if (!Number.isFinite(intensity) || intensity <= 0) return this;

        const cappedIntensity = Math.min(intensity, MAX_SHAKE_INTENSITY);
        const safeFrequency = Number.isFinite(frequency) && frequency > 0
            ? frequency
            : 25;

        /* Envelope-scaled remaining intensity of the running shake. */
        if (this.isShaking) {
            const progress = this._shakeElapsed / this._shakeDuration;
            const envelope = (1 - progress) * (1 - progress);
            const remaining = this._shakeIntensity * envelope;

            if (cappedIntensity < remaining) {
                return this;
            }
        }

        this._shakeDuration = duration;
        this._shakeElapsed = 0;
        this._shakeIntensity = cappedIntensity;
        this._shakeFrequency = safeFrequency;

        /* Random phases so repeated shakes never sync into a visible loop. */
        this._phaseX = Math.random() * Math.PI * 2;
        this._phaseY = Math.random() * Math.PI * 2;

        return this;
    }

    /**
     * Cancels any active shake immediately and zeroes the offsets.
     * Use on pause or dimension shift to avoid carrying motion across worlds.
     * @returns {this}
     */
    cancelShake() {
        this._shakeDuration = 0;
        this._shakeElapsed = 0;
        this._shakeX = 0;
        this._shakeY = 0;
        return this;
    }

    /**
     * Advances the shake envelope by dt and evaluates the offset vectors.
     *
     *   envelope(t) = (1 - t/D)²
     *   x(t) = I · envelope · sin(2π f t + φx)
     *   y(t) = I · envelope · cos(2π · 1.13 f t + φy)
     *
     * @param {number} dt Fixed timestep in seconds.
     * @private
     */
    _updateShake(dt) {
        if (!this.isShaking) {
            /* Guarantee clean zero state when idle. */
            if (this._shakeX !== 0 || this._shakeY !== 0) {
                this._shakeX = 0;
                this._shakeY = 0;
            }
            return;
        }

        this._shakeElapsed += dt;

        if (this._shakeElapsed >= this._shakeDuration) {
            this._shakeDuration = 0;
            this._shakeElapsed = 0;
            this._shakeX = 0;
            this._shakeY = 0;
            return;
        }

        const t = this._shakeElapsed;
        const progress = t / this._shakeDuration;
        const envelope = (1 - progress) * (1 - progress);
        const angular = Math.PI * 2 * this._shakeFrequency * t;

        this._shakeX = this._shakeIntensity * envelope * Math.sin(angular + this._phaseX);
        this._shakeY = this._shakeIntensity * envelope *
            Math.cos(angular * SHAKE_AXIS_FREQUENCY_RATIO + this._phaseY);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * POSITION CONTROL
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Instantly centers the viewport on the current target, bypassing the
     * damper. Use after teleports, Dream↔Drab shifts, and respawns where a
     * glide would mislead the player about their new position.
     * @returns {this}
     */
    snapToTarget() {
        if (!this._target) return this;

        this._x = this._target.x - this.effectiveViewW() / 2;
        this._y = this._target.y - this.effectiveViewH() / 2;

        this._x = this._clampAxis(this._x, this._mapW, this.effectiveViewW());
        this._y = this._clampAxis(this._y, this._mapH, this.effectiveViewH());
        return this;
    }

    /**
     * Hard-focuses the viewport on an arbitrary world point (boss intros,
     * dialogue camera pushes). Does not change the tracked target.
     *
     * @param {number} worldX Focus x in world CSS pixels.
     * @param {number} worldY Focus y in world CSS pixels.
     * @returns {this}
     */
    focus(worldX, worldY) {
        this._x = this._clampAxis(
            worldX - this.effectiveViewW() / 2,
            this._mapW,
            this.effectiveViewW()
        );
        this._y = this._clampAxis(
            worldY - this.effectiveViewH() / 2,
            this._mapH,
            this.effectiveViewH()
        );
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * COORDINATE TRANSFORMATION
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Converts world coordinates to viewport-relative screen coordinates.
     *
     *   screen = (world − cameraTopLeft) × zoom + shake
     *
     * At zoom 1 this reduces to the legacy translation. Shake is EXCLUDED
     * by default: gameplay systems (mouse picking, hit markers, floating
     * combat text anchoring) want stable coordinates, not the transient
     * presentation wobble. Pass includeShake=true when a system must match
     * exactly what the player sees mid-shake.
     *
     * @param {number} worldX World x in CSS pixels.
     * @param {number} worldY World y in CSS pixels.
     * @param {boolean} [includeShake=false] Add live shake offsets.
     * @returns {{x: number, y: number}} Screen-space coordinates.
     */
    worldToScreen(worldX, worldY, includeShake = false) {
        const offsetX = includeShake ? this._shakeX : 0;
        const offsetY = includeShake ? this._shakeY : 0;

        return {
            x: (worldX - this._x) * this._zoom + offsetX,
            y: (worldY - this._y) * this._zoom + offsetY
        };
    }

    /**
     * Converts viewport-relative screen coordinates to world coordinates.
     * The exact inverse of worldToScreen; the primary consumer is mouse
     * picking through InputManager.getMousePosition().
     *
     *   world = (screen − shake) / zoom + cameraTopLeft
     *
     * @param {number} screenX Screen x in CSS pixels.
     * @param {number} screenY Screen y in CSS pixels.
     * @param {boolean} [includeShake=false] Account for live shake offsets.
     * @returns {{x: number, y: number}} World-space coordinates.
     */
    screenToWorld(screenX, screenY, includeShake = false) {
        const offsetX = includeShake ? this._shakeX : 0;
        const offsetY = includeShake ? this._shakeY : 0;

        return {
            x: (screenX - offsetX) / this._zoom + this._x,
            y: (screenY - offsetY) / this._zoom + this._y
        };
    }

    /**
     * Converts world pixel coordinates to grid cell coordinates.
     *
     *   col = floor(worldX / cellW)
     *   row = floor(worldY / cellH)
     *
     * @param {number} worldX World x in CSS pixels.
     * @param {number} worldY World y in CSS pixels.
     * @returns {{col: number, row: number}} Grid cell.
     */
    worldToCell(worldX, worldY) {
        return {
            col: Math.floor(worldX / this._cellW),
            row: Math.floor(worldY / this._cellH)
        };
    }

    /**
     * Converts grid cell coordinates to the top-left world pixel position.
     *
     * @param {number} col Grid column.
     * @param {number} row Grid row.
     * @returns {{x: number, y: number}} Top-left corner in world CSS pixels.
     */
    cellToWorld(col, row) {
        return {
            x: col * this._cellW,
            y: row * this._cellH
        };
    }

    /**
     * Converts screen coordinates directly to grid cell coordinates.
     * Convenience chain of screenToWorld + worldToCell for mouse picking.
     *
     * @param {number} screenX Screen x in CSS pixels.
     * @param {number} screenY Screen y in CSS pixels.
     * @returns {{col: number, row: number}} Grid cell under the pointer.
     */
    screenToCell(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        return this.worldToCell(world.x, world.y);
    }

    /**
     * Visibility test for grid-cell culling in gameplay systems (minimap
     * radar pings, off-screen indicator suppression). Uses the EFFECTIVE
     * world-space view extents so zoomed-out overviews widen the margin.
     *
     * @param {number} col Grid column.
     * @param {number} row Grid row.
     * @param {number} [marginCells=1] Extra cells of slack around the edge so
     *   entities straddling the border are not culled prematurely.
     * @returns {boolean} True if the cell overlaps the current viewport.
     */
    isCellVisible(col, row, marginCells = 1) {
        const margin = Number.isFinite(marginCells) ? marginCells : 1;

        const viewCol0 = Math.floor(this._x / this._cellW) - margin;
        const viewRow0 = Math.floor(this._y / this._cellH) - margin;
        const viewCol1 = Math.ceil((this._x + this.effectiveViewW()) / this._cellW) + margin;
        const viewRow1 = Math.ceil((this._y + this.effectiveViewH()) / this._cellH) + margin;

        return col >= viewCol0 && col < viewCol1 && row >= viewRow0 && row < viewRow1;
    }

    /**
     * Tests whether a world-space point lies inside the viewport.
     *
     * @param {number} worldX World x in CSS pixels.
     * @param {number} worldY World y in CSS pixels.
     * @returns {boolean}
     */
    isPointVisible(worldX, worldY) {
        return (
            worldX >= this._x &&
            worldY >= this._y &&
            worldX < this._x + this.effectiveViewW() &&
            worldY < this._y + this.effectiveViewH()
        );
    }
}

export default Camera;