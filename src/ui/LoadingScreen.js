/**
 * @file src/ui/LoadingScreen.js
 * @module ui/LoadingScreen
 * @description
 * YUCCA's vibrant boot screen — the primary interactive entry point
 * before the live multiplayer world loads in.
 *
 * Three layers, back to front:
 *
 *   1. AMBIENT SPORE DRIFT — a lightweight, dedicated WeatherSystem
 *      instance (SPORE_DRIFT profile, seeded PRNG) renders golden spores
 *      drifting across the whole viewport, so the screen is alive from
 *      the very first frame. It is a SEPARATE instance from the world's
 *      weather: it never touches the game simulation.
 *
 *   2. THE PONCHO — a hand-authored, back-view ASCII portrait of the
 *      signature quilted patchwork poncho character, rendered large and
 *      centered: hood with net mesh, red/orange/blue patch bands, fringe
 *      hem, boots. Every glyph is colorized through a palette map so the
 *      patchwork reads as fabric, not text.
 *
 *   3. EMBROIDERED BRANDING — "Y U C C A" spelled across the mid-back in
 *      double-height bright letters over a dark embroidery band: the
 *      title is stitched into the garment itself.
 *
 * Below the figure: an animated progress rail, a live status line
 * (connecting → connected + weather seed → "[ SPACE ] enter"), and a
 * blinking call-to-action once the session is ready. The screen is
 * purely presentational plus phase state — the Game orchestrator owns
 * the actual LOADING → PLAYING transition when the player presses SPACE.
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';
import { Camera } from '../engine/Camera.js';
import { WeatherSystem, WEATHER_PROFILE } from '../worlds/WeatherSystem.js';

/* ══════════════════════════════════════════════════════════════════════════
   PONCHO PORTRAIT (back view)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The portrait, one string per row. Characters are chosen for density
 * (blueprint §3.1): outline strokes, @/# heavy patch fill, % medium
 * fill, letters for the embroidery. Colors come from PORTRAIT_PALETTE.
 * @type {string[]}
 */
const PORTRAIT_ROWS = Object.freeze([
    "                 _____                 ",
    "               .'     '.               ",
    "              /  ~~~~~  \\              ",
    "             ;  ~ ~ ~ ~  ;             ",
    "              \\  ~~~~~  /              ",
    "           .---`-------'---.           ",
    "         .'                 '.         ",
    "        /=====================\\        ",
    "       ;=======================;       ",
    "      //@@@@@@@@@@@@@@@@@@@@@@@\\\\     ",
    "     //@@@@%%%%%%%%%%%%%%%@@@@\\\\     ",
    "    //@@%%%  Y U C C A  %%%%@@\\\\     ",
    "    //@@%%%  Y U C C A  %%%%@@\\\\     ",
    "    //@@@@%%%%%%%%%%%%%%%@@@@\\\\     ",
    "     //@@@@%%%%%%%%%%%@@@@\\\\         ",
    "    //@@===============@@\\\\           ",
    "     //@@%%%%%%%%%%%@@\\\\              ",
    "      //@@%%%%%%%%%@@\\\\                ",
    "      ||  ...........  ||              ",
    "      ||  ...........  ||              ",
    "      |||             |||              ",
    "      |||             |||              ",
    "     _|||_           _|||_             ",
    "    '====='         '====='            "
]);

/** Portrait row count. */
const PORTRAIT_ROWS_COUNT = PORTRAIT_ROWS.length;

/**
 * Glyph → color map. The patchwork reads as fabric: heavy @ fill is the
 * red quilt band, % the orange field, = the blue yoke and waist, ~ the
 * white net mesh of the hood, '.' the tan fringe.
 * @type {Object<string, string>}
 */
const PORTRAIT_PALETTE = Object.freeze({
    '/': '#e8edf2',
    '\\': '#e8edf2',
    "'": '#e8edf2',
    '`': '#e8edf2',
    '-': '#e8edf2',
    '_': '#8fa3b8',
    '.': '#d8c08a',
    '~': '#c9ced4',
    ';': '#e8edf2',
    '=': '#5ac8ff',
    '@': '#ff5a5a',
    '%': '#ff7700',
    '|': '#5a6b7d',
    '!': '#5a6b7d'
});

/** Embroidery letters get their own high-contrast treatment. */
const EMBROIDERY_LETTERS = new Set(['Y', 'U', 'C', 'A']);
const EMBROIDERY_FG = '#fff6e0';
const EMBROIDERY_BG = '#33200e';

/* ══════════════════════════════════════════════════════════════════════════
   STATUS / PROGRESS PRESENTATION
   ══════════════════════════════════════════════════════════════════════════ */

/** Spinner frames for the connecting phase. */
const SPINNER = Object.freeze(['|', '/', '-', '\\']);

/** Status line colors by phase. */
const PHASE_COLOR = Object.freeze({
    connecting: '#8a97a6',
    connected: '#7dff8a',
    ready: '#ffe9c4',
    offline: '#ff9e3d'
});

/* ══════════════════════════════════════════════════════════════════════════
   LOADING SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The boot portrait + session status screen. Owns its buffer, camera,
 * and ambient weather instance; presents through the shared Renderer.
 */
export class LoadingScreen {
    /**
     * @param {import('../engine/Renderer.js').Renderer} renderer Engine renderer
     *   (cell metrics + viewport grid sizing).
     * @param {Object} [options]
     * @param {number} [options.seed] Ambient weather PRNG seed.
     * @param {string} [options.title='YUCCA'] Brand line under the figure.
     */
    constructor(renderer, options = {}) {
        if (!renderer || typeof renderer.render !== 'function') {
            throw new TypeError('[LoadingScreen] a Renderer is required.');
        }

        /** @type {import('../engine/Renderer.js').Renderer} */
        this._renderer = renderer;
        /** @type {string} */
        this._title = options.title ?? 'YUCCA';

        /* ---- Phase state ------------------------------------------------ */
        /** @type {string} connecting | connected | ready | offline */
        this._phase = 'connecting';
        /** @type {string} */
        this._statusText = 'waking the grove…';
        /** @type {number} 0..1 presented progress. */
        this._progress = 0.08;
        /** @type {number} Simulation clock for animation, seconds. */
        this._time = 0;
        /** @type {number} Spinner frame index. */
        this._spin = 0;

        /* ---- Ambient weather (separate instance, never the world's) ----- */
        /** @type {WeatherSystem} */
        this._weather = new WeatherSystem({
            cellWidth: renderer.cellWidth,
            cellHeight: renderer.cellHeight,
            seed: options.seed
        });
        this._weather.setProfile(WEATHER_PROFILE.SPORE_DRIFT);
        this._weather.setLightningEnabled(false);

        /* ---- Surface + camera (rebuilt on resize) ----------------------- */
        /** @type {?ASCIIBuffer} */
        this._buffer = null;
        /** @type {?Camera} */
        this._camera = null;
        this._rebuildSurface();

        /** @type {number} Frames presented (diagnostics). */
        this._frames = 0;
    }

    /* ══════════════════════════════════════════════════════════════════
       PHASE CONTROL (driven by the boot / network layer)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Sets the session phase and status line.
     * @param {string} phase connecting | connected | ready | offline.
     * @param {string} [text] Status line override.
     * @returns {this}
     */
    setPhase(phase, text = null) {
        if (!Object.prototype.hasOwnProperty.call(PHASE_COLOR, phase)) {
            throw new RangeError(`[LoadingScreen] unknown phase: ${phase}`);
        }
        this._phase = phase;
        if (text !== null) this._statusText = text;
        if (phase === 'ready') this._progress = 1;
        return this;
    }

    /**
     * Updates just the status line.
     * @param {string} text Status text.
     * @returns {this}
     */
    setStatus(text) {
        this._statusText = String(text);
        return this;
    }

    /**
     * Nudges the presented progress rail.
     * @param {number} value 0..1.
     * @returns {this}
     */
    setProgress(value) {
        this._progress = Math.min(1, Math.max(0, value));
        return this;
    }

    /** @returns {boolean} True when the player may enter the world. */
    get isReady() {
        return this._phase === 'ready' || this._phase === 'offline';
    }

    /** @returns {string} Current phase. */
    get phase() {
        return this._phase;
    }

    /**
     * Reseeds the ambient spore drift (matches the server's seed if the
     * session provides one — cosmetic symmetry with the world storm).
     * @param {number} seed Non-negative integer seed.
     * @returns {this}
     */
    setSeed(seed) {
        this._weather.setSeed(seed);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       SIMULATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the ambient layer and animations by one fixed tick.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;
        this._spin = (this._spin + 1) % SPINNER.length;
        this._weather.update(dt);
        /* Progress creeps toward 0.9 while not ready; 'ready' pins it at 1. */
        if (!this.isReady && this._progress < 0.9) {
            this._progress = Math.min(0.9, this._progress + dt * 0.12);
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PRESENTATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents one frame: clear → spore drift → portrait → branding →
     * progress rail → status. Blits through the shared Renderer with a
     * static (0,0) camera so the screen never scrolls.
     * @param {?import('../engine/Renderer.js').Renderer} [renderer] Override.
     * @returns {void}
     */
    render(renderer = null) {
        const r = renderer ?? this._renderer;
        const buffer = this._buffer;
        if (!buffer) return;

        buffer.clear();
        this._weather.render(buffer, this._camera);
        this._stampPortrait(buffer);
        this._stampChrome(buffer);

        r.render(buffer, { x: 0, y: 0 });
        this._frames += 1;
    }

    /**
     * Stamps the poncho portrait, centered, with palette colorization and
     * the embroidery-band treatment for the YUCCA letters.
     * @param {ASCIIBuffer} buffer Target.
     * @returns {void}
     * @private
     */
    _stampPortrait(buffer) {
        const artW = PORTRAIT_ROWS[0].length;
        const artH = PORTRAIT_ROWS_COUNT;

        /* Center the figure, biased slightly up to leave chrome room. */
        const offX = Math.max(0, Math.floor((buffer.cols - artW) / 2));
        const offY = Math.max(0, Math.floor((buffer.rows - artH) / 2) - 1);

        for (let row = 0; row < artH; row += 1) {
            const line = PORTRAIT_ROWS[row];
            const by = offY + row;
            if (by < 0 || by >= buffer.rows) continue;

            for (let col = 0; col < line.length; col += 1) {
                const ch = line[col];
                if (ch === ' ') continue;
                const bx = offX + col;
                if (bx < 0 || bx >= buffer.cols) continue;

                if (EMBROIDERY_LETTERS.has(ch)) {
                    /* The brand, stitched into the back panel. */
                    buffer.setChar(bx, by, ch, EMBROIDERY_FG, EMBROIDERY_BG);
                } else {
                    const color = PORTRAIT_PALETTE[ch] ?? '#e8edf2';
                    buffer.setChar(bx, by, ch, color, null);
                }
            }
        }
    }

    /**
     * Stamps the title, progress rail, status line, and call-to-action.
     * @param {ASCIIBuffer} buffer Target.
     * @returns {void}
     * @private
     */
    _stampChrome(buffer) {
        const cols = buffer.cols;
        const centerY = Math.max(0, Math.floor((buffer.rows - PORTRAIT_ROWS_COUNT) / 2) - 1);
        const titleRow = centerY + PORTRAIT_ROWS_COUNT + 1;
        const railRow = titleRow + 2;
        const statusRow = railRow + 1;
        const promptRow = statusRow + 2;

        /* ---- Title wordmark --------------------------------------------- */
        const title = this._title;
        if (titleRow < buffer.rows) {
            const x = Math.max(0, Math.floor((cols - title.length) / 2));
            buffer.writeText(x, titleRow, title, '#ff7700', '#0b0e14');
        }

        /* ---- Progress rail ---------------------------------------------- */
        if (railRow < buffer.rows) {
            const railW = Math.min(40, cols - 8);
            const x0 = Math.max(0, Math.floor((cols - railW) / 2));
            const filled = Math.round(railW * this._progress);
            for (let i = 0; i < railW; i += 1) {
                const ch = i < filled ? '▓' : '░';
                const color = i < filled ? '#ff7700' : '#2b3648';
                buffer.setChar(x0 + i, railRow, ch, color, null);
            }
        }

        /* ---- Status line ------------------------------------------------- */
        if (statusRow < buffer.rows) {
            const spinner = this.isReady ? '·' : SPINNER[this._spin];
            const line = `${spinner} ${this._statusText}`;
            const x = Math.max(0, Math.floor((cols - line.length) / 2));
            buffer.writeText(x, statusRow, line, PHASE_COLOR[this._phase], null);
        }

        /* ---- Call to action ---------------------------------------------- */
        if (promptRow < buffer.rows) {
            const blinkOn = Math.floor(this._time * 1.6) % 2 === 0;
            if (blinkOn) {
                const line = this._phase === 'offline'
                    ? '[ SPACE ] explore solo (server offline)'
                    : '[ SPACE ] enter YUCCA';
                const x = Math.max(0, Math.floor((cols - line.length) / 2));
                buffer.writeText(x, promptRow, line, '#ffe9c4', null);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RESIZE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Rebuilds the surface after a viewport or font-metric change.
     * @param {?Object} [displayInfo] {cssWidth, cssHeight} snapshot.
     * @returns {this}
     */
    handleResize(displayInfo = null) {
        const w = displayInfo?.cssWidth ?? this._renderer.viewportWidth;
        const h = displayInfo?.cssHeight ?? this._renderer.viewportHeight;
        this._rebuildSurface(w, h);
        return this;
    }

    /**
     * (Re)creates the buffer + camera from current renderer metrics.
     * @param {?number} [cssW] Explicit viewport width.
     * @param {?number} [cssH] Explicit viewport height.
     * @returns {void}
     * @private
     */
    _rebuildSurface(cssW = null, cssH = null) {
        const cellW = this._renderer.cellWidth;
        const cellH = this._renderer.cellHeight;
        const w = cssW ?? this._renderer.viewportWidth;
        const h = cssH ?? this._renderer.viewportHeight;

        const cols = Math.max(PORTRAIT_ROWS[0].length + 2, Math.floor(w / cellW));
        const rows = Math.max(PORTRAIT_ROWS_COUNT + 8, Math.floor(h / cellH));

        this._buffer = new ASCIIBuffer({
            cols,
            rows,
            defaultChar: ' ',
            defaultFg: '#e0e0e0',
            defaultBg: '#0b0e14'
        });

        this._camera = new Camera({
            viewportWidth: cols * cellW,
            viewportHeight: rows * cellH,
            cellWidth: cellW,
            cellHeight: cellH
        });
        this._weather.setCellMetrics(cellW, cellH);
        this._weather.attachCamera(this._camera);
    }

    /**
     * Diagnostic snapshot.
     * @returns {Object}
     */
    getMetrics() {
        return {
            phase: this._phase,
            progress: this._progress,
            frames: this._frames,
            grid: this._buffer ? `${this._buffer.cols}x${this._buffer.rows}` : null,
            ambient: this._weather.getMetrics()
        };
    }

    /**
     * Releases the ambient weather resources.
     * @returns {void}
     */
    destroy() {
        this._weather.destroy();
    }
}

export default LoadingScreen;
