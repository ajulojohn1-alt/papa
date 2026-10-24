/**
 * @file src/engine/FontAtlas.js
 * @module engine/FontAtlas
 *
 * @description
 * Dynamic glyph texture atlas for "YUCCA"'s hybrid WebGL pipeline.
 *
 * The GPU presenter (engine/Engine.js) never rasterizes text in a fragment
 * shader — instead, every glyph the virtual grid can possibly show is
 * rasterized ONCE into a texture atlas of square tiles, and the fullscreen
 * quad shader selects a tile per cell by index. This module owns that
 * atlas: tile assignment, rasterization, growth, and the UV math the
 * shader mirrors.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ATLAS LAYOUT
 * ───────────────────────────────────────────────────────────────────────────
 * The atlas is a power-of-two square canvas subdivided into a T×T grid of
 * square tiles. Slot 0 is permanently reserved for the blank glyph (NUL /
 * space): the shader reads slot 0 as "no glyph", so a freshly cleared cell
 * costs one texture fetch and zero alpha.
 *
 *   atlas size 1024×1024 → 16×16 tiles of 64×64 → 256 slots
 *   atlas size 2048×2048 → 32×32 tiles of 64×64 → 1024 slots
 *   atlas size 4096×4096 → 64×64 tiles of 64×64 → 4096 slots (hard cap)
 *
 * The engine's complete glyph vocabulary (ASCII + box drawing + blocks +
 * arrows + sprinkles, see main.css unicode-range) sits comfortably inside
 * one 256-slot page; growth exists so a modded glyph set or a future
 * alphabet can never deadlock the presenter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RASTERIZATION
 * ───────────────────────────────────────────────────────────────────────────
 * Each glyph is drawn as pure white on transparent at the tile center:
 *
 *   ctx.font      = `${weight} ${RASTER_SIZE}px ${family}`
 *   ctx.textAlign = 'center'
 *   fillText(glyph, tileCenterX, tileCenterY + baselineNudge)
 *
 * White-on-transparent is deliberate: the fragment shader multiplies the
 * sampled coverage by the cell's FOREGROUND color and composites over the
 * cell's BACKGROUND color, so one rasterization serves every color pair in
 * the game. `RASTER_SIZE` (48px into a 64px tile) leaves ≥8px of padding
 * on every side, which means LINEAR filtering can never bleed a neighbor
 * glyph across a tile boundary even at 4× zoom.
 *
 * The baseline nudge centers the glyph's visual mass: monospace digits and
 * letters have their cap-height band above the mathematical middle, so a
 * small downward shift (12% of the raster size) restores optical centering
 * for the dense-weight glyphs this game favors (#, %, M, W, @).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DYNAMIC GROWTH PROTOCOL
 * ───────────────────────────────────────────────────────────────────────────
 * `ensure(codePoints)` is the only mutation entry point the presenter
 * calls (once per frame, over the live buffer). It:
 *
 *   1. assigns slots to any unseen code points (ascending order keeps
 *      rebuilds deterministic across clients), and
 *   2. when free slots run out, rebuilds the atlas at the next page size,
 *      re-rasterizing every mapped glyph into its (stable) slot.
 *
 * Slot indices NEVER change once assigned: growth re-rasterizes into the
 * same slots, so the per-frame char→slot packing buffers stay valid and
 * only `atlasGeneration` increments (the presenter re-uploads the atlas
 * texture exactly when the generation moves).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HEADLESS OPERATION
 * ───────────────────────────────────────────────────────────────────────────
 * Construction accepts an injected `createCanvas(width, height)` factory.
 * When no factory is available (Node validation harness) the atlas still
 * performs full slot assignment and UV math — `rasterized` simply reports
 * false and `canvas` stays null. This keeps every layout invariant testable
 * outside a browser while the browser path rasterizes for real.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** Edge length of one atlas tile, texels. 48px glyphs + ≥8px pad each side. */
const TILE_SIZE = 64;

/** Glyph rasterization font size, px inside the tile. */
const RASTER_SIZE = 48;

/** Downward baseline nudge for optical centering, fraction of raster size. */
const BASELINE_NUDGE = 0.12;

/** Atlas page edge in tiles: starts 16×16 (256 slots). */
const INITIAL_TILES = 16;

/** Hard cap on tiles per axis (4096×4096 atlas = 4096 slots). */
const MAX_TILES = 64;

/** Font family used for rasterization; mirrors the 2D Renderer stack. */
const DEFAULT_FONT_FAMILY =
    "'Yucca Mono', 'Fira Code', 'Courier New', Courier, monospace";

/** Glyph code points that always map to the reserved blank slot 0. */
const BLANK_CODE_POINTS = new Set([0x00, 0x20]);

/* ══════════════════════════════════════════════════════════════════════════
 * FONT ATLAS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dynamic square-tiled glyph atlas with stable slot assignment.
 *
 * Renderer/shader contract:
 * @property {number} atlasGeneration Increments whenever pixels change.
 * @property {number} tilesX          Tiles per axis (square grid).
 * @property {HTMLCanvasElement|null} canvas The raster surface, when a
 *   canvas factory is available.
 */
export class FontAtlas {
    /**
     * @param {Object} [options]
     * @param {string} [options.fontFamily] Rasterization font stack.
     * @param {number} [options.weight=700] CSS font weight (dense glyphs).
     * @param {(width: number, height: number) => {width:number, height:number,
     *   getContext:(type:string)=>CanvasRenderingContext2D|null}} [options.createCanvas]
     *   Canvas factory. Defaults to document.createElement when present;
     *   omit/unavailable → headless layout-only mode.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[FontAtlas] options must be an object.');
        }

        /** @type {string} */
        this._fontFamily = typeof options.fontFamily === 'string' && options.fontFamily
            ? options.fontFamily
            : DEFAULT_FONT_FAMILY;

        /** @type {number} */
        this._weight = Number.isFinite(options.weight) && options.weight > 0
            ? options.weight
            : 700;

        /** @type {number} Tiles per axis. */
        this._tiles = INITIAL_TILES;

        /** @type {Map<number, number>} code point → slot index. */
        this._slots = new Map();

        /** @type {number} Next free slot (slot 0 reserved for blank). */
        this._nextSlot = 1;

        /** @type {number} Bumped on every pixel mutation. */
        this._generation = 1;

        /** @type {number} Total glyphs rasterized (diagnostics). */
        this._rasterCount = 0;

        /* ---- Canvas surface ------------------------------------------------ */
        const factory = typeof options.createCanvas === 'function'
            ? options.createCanvas
            : (typeof document !== 'undefined' &&
               typeof document.createElement === 'function'
                ? (w, h) => {
                    const el = document.createElement('canvas');
                    el.width = w;
                    el.height = h;
                    return el;
                }
                : null);

        /** @type {?Function} */
        this._createCanvas = factory;

        /** @type {?HTMLCanvasElement} */
        this._canvas = null;

        /** @type {?CanvasRenderingContext2D} */
        this._ctx = null;

        if (factory) this._allocateSurface();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * READ-ONLY PROPERTIES
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {number} Pixels-change generation counter. */
    get atlasGeneration() {
        return this._generation;
    }

    /** @returns {number} Tiles per axis. */
    get tilesX() {
        return this._tiles;
    }

    /** @returns {number} Edge length of one tile, texels. */
    get tileSize() {
        return TILE_SIZE;
    }

    /** @returns {number} Atlas edge length, texels (tiles × tileSize). */
    get atlasSize() {
        return this._tiles * TILE_SIZE;
    }

    /** @returns {number} Total slots at the current page size. */
    get capacity() {
        return this._tiles * this._tiles;
    }

    /** @returns {number} Assigned (non-reserved) glyph count. */
    get glyphCount() {
        return this._slots.size;
    }

    /** @returns {number} Glyphs rasterized over this atlas's lifetime. */
    get rasterizedCount() {
        return this._rasterCount;
    }

    /** @returns {boolean} True when a raster surface exists. */
    get canRasterize() {
        return this._ctx !== null;
    }

    /** @returns {HTMLCanvasElement|null} The atlas surface (for textures). */
    get canvas() {
        return this._canvas;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * SLOT MAPPING
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Slot index for a code point. Slot 0 is the reserved blank; unmapped
     * code points also return 0 so a stale packing buffer can only ever
     * show emptiness, never a wrong glyph.
     *
     * @param {number} codePoint Unicode code point.
     * @returns {number} Slot index (0 = blank).
     */
    slotFor(codePoint) {
        if (BLANK_CODE_POINTS.has(codePoint)) return 0;
        return this._slots.get(codePoint) ?? 0;
    }

    /**
     * True when the code point already owns a slot.
     * @param {number} codePoint Unicode code point.
     * @returns {boolean}
     */
    has(codePoint) {
        return BLANK_CODE_POINTS.has(codePoint) || this._slots.has(codePoint);
    }

    /**
     * Assigns slots for every unmapped code point, rasterizes them, and
     * grows the atlas page when free slots run out. Safe to call every
     * frame: when nothing is new it touches no pixels and returns false.
     *
     * @param {Iterable<number>} codePoints Live glyph vocabulary.
     * @returns {boolean} True when the atlas pixels changed (re-upload).
     */
    ensure(codePoints) {
        if (!codePoints || typeof codePoints[Symbol.iterator] !== 'function') {
            throw new TypeError('[FontAtlas] ensure() requires an iterable of code points.');
        }

        /* ---- Collect genuinely new code points --------------------------- */
        const fresh = [];
        for (const code of codePoints) {
            const cp = code >>> 0;
            if (BLANK_CODE_POINTS.has(cp)) continue;
            if (!this._slots.has(cp)) fresh.push(cp);
        }

        if (fresh.length === 0) return false;

        /* Deterministic slot assignment order across clients. */
        fresh.sort((a, b) => a - b);

        /* ---- Grow when the page cannot absorb the batch ------------------ */
        let grew = false;
        while (this._nextSlot + fresh.length > this.capacity) {
            if (this._tiles >= MAX_TILES) {
                /* Page cap reached: assign what fits, drop the overflow
                 * silently — they present as blank, never as garbage. */
                const room = this.capacity - this._nextSlot;
                if (room <= 0) return false;
                fresh.length = room;
                break;
            }
            this._tiles *= 2;
            grew = true;
        }

        if (grew) {
            /* A new page invalidates every rasterized pixel; re-create the
             * surface at the new size and re-rasterize all known glyphs
             * into their STABLE slots, then continue with the fresh batch. */
            this._allocateSurface();
            for (const code of this._slots.keys()) {
                this._rasterize(code, this._slots.get(code));
            }
        }

        for (const code of fresh) {
            const slot = this._nextSlot;
            this._nextSlot += 1;
            this._slots.set(code, slot);
            this._rasterize(code, slot);
        }

        this._generation += 1;
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * UV MATH (SHADER MIRROR)
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Tile-grid coordinates for a slot.
     *
     * Slot n maps row-major from the top-left:
     *   col = n mod tiles, row = floor(n / tiles)
     *
     * @param {number} slot Slot index.
     * @param {number} [tilesX=this.tilesX] Grid breadth (overridable so
     *   tests can verify layout math without a live atlas).
     * @returns {{col: number, row: number}}
     */
    static layoutSlot(slot, tilesX) {
        const t = tilesX > 0 ? tilesX : INITIAL_TILES;
        const s = Math.max(0, Math.trunc(slot));
        return { col: s % t, row: Math.floor(s / t) };
    }

    /**
     * Normalized UV rect for a slot, inset by half a texel on every side.
     *
     * The half-texel inset is the classic atlas-safety measure: bilinear
     * sampling at the exact tile edge can never reach into the neighboring
     * tile, so glyphs stay pristine under LINEAR filtering at any zoom.
     *
     * @param {number} slot Slot index.
     * @returns {{u0: number, v0: number, u1: number, v1: number}}
     */
    uvRect(slot) {
        const { col, row } = FontAtlas.layoutSlot(slot, this._tiles);
        const tile = 1 / this._tiles;
        const half = 0.5 / this.atlasSize;

        return {
            u0: col * tile + half,
            v0: row * tile + half,
            u1: (col + 1) * tile - half,
            v1: (row + 1) * tile - half
        };
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DIAGNOSTICS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Snapshot for the HUD telemetry panel and the validation harness.
     * @returns {Object}
     */
    getMetrics() {
        return {
            tiles: this._tiles,
            atlasSize: this.atlasSize,
            capacity: this.capacity,
            glyphs: this._slots.size,
            rasterized: this._rasterCount,
            generation: this._generation,
            headless: this._ctx === null
        };
    }

    /* ══════════════════════════════════════════════════════════════════════
     * INTERNALS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * (Re-)creates the raster surface at the current page size.
     * @private
     */
    _allocateSurface() {
        if (!this._createCanvas) return;

        const size = this.atlasSize;
        this._canvas = this._createCanvas(size, size);
        this._ctx = this._canvas
            ? this._canvas.getContext('2d')
            : null;

        if (this._ctx) {
            this._ctx.clearRect(0, 0, size, size);
        }
    }

    /**
     * Rasterizes one glyph into its slot tile (white on transparent).
     * Headless no-op when no surface exists — slot assignment still holds.
     *
     * @param {number} codePoint Glyph code point.
     * @param {number} slot Destination slot.
     * @private
     */
    _rasterize(codePoint, slot) {
        if (!this._ctx) return;

        const { col, row } = FontAtlas.layoutSlot(slot, this._tiles);
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const ctx = this._ctx;

        ctx.clearRect(x, y, TILE_SIZE, TILE_SIZE);

        ctx.font = `${this._weight} ${RASTER_SIZE}px ${this._fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';

        ctx.fillText(
            String.fromCodePoint(codePoint),
            x + TILE_SIZE / 2,
            y + TILE_SIZE / 2 + RASTER_SIZE * BASELINE_NUDGE
        );

        this._rasterCount += 1;
    }
}

export default FontAtlas;
