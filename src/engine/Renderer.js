/**
 * @file src/engine/Renderer.js
 * @module engine/Renderer
 *
 * @description
 * Canvas 2D blitting engine for "A Stitch in Time".
 *
 * The Renderer is the only subsystem allowed to touch the CanvasRenderingContext2D.
 * It reads virtual grid state from an ASCIIBuffer and presents it through a
 * camera-translated viewport. It is deliberately decoupled from gameplay:
 * WorldManager decides WHICH buffer and WHICH camera to present; this module
 * decides HOW to present it at the lowest possible cost.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TEXT-BLITTING STRATEGY
 * ───────────────────────────────────────────────────────────────────────────
 * ASCII rendering is dominated by two expensive canvas operations:
 *
 *   1. ctx.fillText()        — glyph rasterization.
 *   2. ctx.fillStyle writes  — GPU state changes.
 *
 * The pipeline therefore minimizes both:
 *
 *   - Glyphs are drawn with a single cached monospace font at textBaseline
 *     'top', so each glyph maps to an integer-aligned grid cell.
 *   - Blank glyphs (space / NUL) are never submitted to fillText.
 *   - Colors are packed 32-bit integers end-to-end; CSS strings are derived
 *     once per unique color and cached, never rebuilt per cell.
 *   - Full repaints batch backgrounds into Path2D buckets per color and
 *     glyphs into per-color lists, producing one fillStyle write per color
 *     instead of one per cell.
 *   - Steady-state frames use a presented-cell cache: cells whose effective
 *     glyph + colors are unchanged since the last presentation are skipped
 *     entirely, so an idle scene costs one visibility loop and zero draw
 *     calls.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COORDINATE TRANSFORMATION MATH
 * ───────────────────────────────────────────────────────────────────────────
 * The backing store is pre-scaled by devicePixelRatio upstream (main.js).
 * This Renderer installs the transform:
 *
 *   ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
 *
 * so all subsequent drawing is expressed in CSS pixels. Per frame it then
 * applies camera shake as a transient translation that never affects cache
 * validity:
 *
 *   ctx.translate(shakeX, shakeY)
 *
 * Grid cell (col, row) maps to screen space through the camera:
 *
 *   x0 = round(col       * cellW - camX)
 *   x1 = round((col + 1) * cellW - camX)
 *   y0 = round(row       * cellH - camY)
 *   y1 = round((row + 1) * cellH - camY)
 *
 * Computing both edges from the floating-point grid and rounding each edge
 * independently guarantees integer-width rectangles with no seams, even
 * though cellW (measured font advance) is fractional.
 *
 * Camera translation is snapped to integer pixels before cache-keying.
 * Sub-pixel camera drift would otherwise shimmer glyph rounding; snapping
 * keeps text razor-sharp and keeps the presented-cell cache valid across
 * sub-pixel camera easing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * VIEWPORT CULLING
 * ───────────────────────────────────────────────────────────────────────────
 * Only the cell range overlapping the viewport is visited:
 *
 *   col0 = floor(camX / cellW)
 *   col1 = ceil((camX + viewportW) / cellW)
 *
 * clamped to the buffer dimensions. Cells outside the buffer are never
 * sampled, so camera over-scroll past the map edge costs nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PALETTES & DIMENSION SHIFTS
 * ───────────────────────────────────────────────────────────────────────────
 * Colors can be remapped at presentation time without touching the buffer:
 *
 *   - setPalette(map)    explicit packed→packed replacements.
 *   - setGrayscale(true) luminance collapse used by the Drab World.
 *
 * Both increment a generation counter that invalidates the presented-cell
 * cache, so a Dream↔Drab shift repaints every cell exactly once.
 */

import { ASCIIBuffer } from './ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** Monospace stack used when the canvas element provides no override. */
const DEFAULT_FONT_FAMILY = "'Fira Code', 'Courier New', Courier, monospace";

/** Fallback font size in CSS pixels. */
const DEFAULT_FONT_SIZE = 16;

/** Fallback row pitch when no dataset hint exists. */
const DEFAULT_CELL_HEIGHT = 20;

/** Opaque black used to erase cells whose new background is transparent. */
const DEFAULT_CLEAR_COLOR = 0x000000FF;

/** Glyph code points that are never submitted to fillText. */
const BLANK_GLYPHS = new Set([0x00, 0x20]);

/* ══════════════════════════════════════════════════════════════════════════
 * RENDERER
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * High-performance ASCII blitter with camera culling, style batching,
 * palette remapping, and presented-cell caching.
 *
 * Camera contract (all fields optional):
 * @typedef {Object} RenderCamera
 * @property {number} [x=0]      Camera offset in CSS pixels, world space.
 * @property {number} [y=0]      Camera offset in CSS pixels, world space.
 * @property {number} [shakeX=0] Transient horizontal shake, not cached.
 * @property {number} [shakeY=0] Transient vertical shake, not cached.
 */
export class Renderer {
    /**
     * @param {CanvasRenderingContext2D} ctx
     *   2D context of #gameCanvas. Must already be configured for the
     *   physical backing-store size by main.js.
     * @param {?{
     *   cssWidth: number,
     *   cssHeight: number,
     *   backingWidth: number,
     *   backingHeight: number,
     *   dpr: number
     * }} [displayInfo=null]
     *   Display calibration snapshot. Falls back to live measurement when
     *   omitted (useful for unit tests).
     */
    constructor(ctx, displayInfo = null) {
        if (!ctx || typeof ctx.fillText !== 'function') {
            throw new TypeError(
                '[Renderer] A valid CanvasRenderingContext2D is required.'
            );
        }

        /** @type {CanvasRenderingContext2D} */
        this._ctx = ctx;

        /** @type {HTMLCanvasElement} */
        this._canvas = ctx.canvas;

        /* ---- Display metrics ------------------------------------------- */
        const measured = this._measureCanvas();

        /** @type {number} Logical viewport width in CSS pixels. */
        this._cssWidth = displayInfo?.cssWidth ?? measured.cssWidth;

        /** @type {number} Logical viewport height in CSS pixels. */
        this._cssHeight = displayInfo?.cssHeight ?? measured.cssHeight;

        /** @type {number} Effective device pixel ratio. */
        this._dpr = displayInfo?.dpr ?? measured.dpr;

        /* ---- Font & grid configuration --------------------------------- */
        const dataset = this._canvas.dataset || {};

        /** @type {string} Font family stack. */
        this._fontFamily = dataset.fontFamily || DEFAULT_FONT_FAMILY;

        /** @type {number} Font size in CSS pixels. */
        this._fontSize = parseFloat(dataset.baseFontSize) || DEFAULT_FONT_SIZE;

        /** @type {number} Requested row pitch hint from markup, if any. */
        this._cellHeightHint = parseFloat(dataset.cellHeight) || 0;

        /** @type {number} Measured glyph advance width (fractional). */
        this._cellWidth = this._fontSize;

        /** @type {number} Row pitch in CSS pixels. */
        this._cellHeight = this._fontSize;

        /** @type {number} Vertical pad centering glyphs inside a row. */
        this._textPadY = 0;

        this._configureFont();

        /* ---- Palette state --------------------------------------------- */
        /** @type {Map<number, number>} Explicit packed→packed remaps. */
        this._palette = new Map();

        /** @type {boolean} Drab World luminance-collapse mode. */
        this._grayscale = false;

        /** @type {Map<number, number>} Grayscale result cache. */
        this._grayscaleCache = new Map();

        /** @type {number} Increments on any palette mutation. */
        this._paletteGeneration = 0;

        /* ---- CSS string & glyph caches --------------------------------- */
        /** @type {Map<number, string>} Packed color → CSS fillStyle. */
        this._cssCache = new Map();

        /** @type {Map<number, string>} Code point → JS string. */
        this._glyphCache = new Map();

        /* ---- Presented-cell cache --------------------------------------- */
        /** @type {?Uint32Array} Presented glyph code points by buffer index. */
        this._cacheChars = null;

        /** @type {?Uint32Array} Presented foreground colors (resolved). */
        this._cacheFg = null;

        /** @type {?Uint32Array} Presented background colors (resolved). */
        this._cacheBg = null;

        /** @type {?string} Key describing camera/palette/dims of the cache. */
        this._cacheKey = null;

        /** @type {number} Clear color, packed RGBA. */
        this._clearColor = DEFAULT_CLEAR_COLOR;

        /* ---- Diagnostics ------------------------------------------------ */
        /** @type {Object} Per-frame render statistics. */
        this._stats = {
            frameCount: 0,
            lastCellsVisited: 0,
            lastCellsDrawn: 0,
            lastGlyphs: 0,
            lastBackgrounds: 0,
            lastStyleChanges: 0,
            lastRenderMs: 0
        };

        this._applyBaseTransform();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PUBLIC READ-ONLY PROPERTIES
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {number} Measured glyph advance width, CSS pixels. */
    get cellWidth() {
        return this._cellWidth;
    }

    /** @returns {number} Row pitch, CSS pixels. */
    get cellHeight() {
        return this._cellHeight;
    }

    /** @returns {number} Configured font size, CSS pixels. */
    get fontSize() {
        return this._fontSize;
    }

    /** @returns {number} Effective device pixel ratio. */
    get devicePixelRatio() {
        return this._dpr;
    }

    /** @returns {number} Viewport width in CSS pixels. */
    get viewportWidth() {
        return this._cssWidth;
    }

    /** @returns {number} Viewport height in CSS pixels. */
    get viewportHeight() {
        return this._cssHeight;
    }

    /**
     * Approximate viewport size in grid cells. Useful for HUD layout and
     * camera clamping.
     * @returns {{columns: number, rows: number}}
     */
    getViewportGridSize() {
        return {
            columns: Math.max(1, Math.ceil(this._cssWidth / this._cellWidth)),
            rows: Math.max(1, Math.ceil(this._cssHeight / this._cellHeight))
        };
    }

    /**
     * Frame diagnostics for the debug HUD.
     * @returns {{
     *   frameCount: number,
     *   lastCellsVisited: number,
     *   lastCellsDrawn: number,
     *   lastGlyphs: number,
     *   lastBackgrounds: number,
     *   lastStyleChanges: number,
     *   lastRenderMs: number
     * }}
     */
    getStats() {
        return { ...this._stats };
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DISPLAY & FONT MANAGEMENT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Re-applies display calibration after a window resize or DPR change.
     * Called by main.js from its coalesced resize handler.
     *
     * @param {{
     *   cssWidth: number,
     *   cssHeight: number,
     *   backingWidth?: number,
     *   backingHeight?: number,
     *   dpr: number
     * }} displayInfo New display snapshot.
     * @returns {this}
     */
    handleResize(displayInfo) {
        this._cssWidth = Math.max(1, Math.floor(displayInfo.cssWidth));
        this._cssHeight = Math.max(1, Math.floor(displayInfo.cssHeight));
        this._dpr = displayInfo.dpr;

        this._applyBaseTransform();
        this.invalidate();
        return this;
    }

    /**
     * Measures the live canvas for CSS size and DPR. Used when no external
     * display snapshot is provided.
     * @returns {{cssWidth: number, cssHeight: number, dpr: number}}
     * @private
     */
    _measureCanvas() {
        const rect = this._canvas.getBoundingClientRect();

        return {
            cssWidth: Math.max(1, Math.floor(rect.width)),
            cssHeight: Math.max(1, Math.floor(rect.height)),
            dpr: this._canvas.width > 0 && rect.width > 0
                ? this._canvas.width / rect.width
                : 1
        };
    }

    /**
     * Installs the DPR base transform so all drawing uses CSS pixels.
     * @private
     */
    _applyBaseTransform() {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    }

    /**
     * Configures the canvas font and derives true grid metrics.
     *
     * The AUTHORITATIVE column pitch is the measured font advance of 'M',
     * not any authored hint: if the two disagree, trusting the hint causes
     * cumulative horizontal drift across long rows, visibly shearing maps.
     * The row pitch honors the markup hint when present, otherwise falls
     * back to a comfortable 1.25× leading.
     *
     * @private
     */
    _configureFont() {
        const ctx = this._ctx;

        ctx.font = `${this._fontSize}px ${this._fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const advance = ctx.measureText('M').width;

        this._cellWidth = Number.isFinite(advance) && advance > 0
            ? advance
            : this._fontSize * 0.6;

        this._cellHeight = this._cellHeightHint > 0
            ? Math.max(this._fontSize, this._cellHeightHint)
            : Math.ceil(this._fontSize * 1.25);

        /* Center the glyph vertically inside the row when leading > size. */
        this._textPadY = Math.max(0, Math.floor((this._cellHeight - this._fontSize) / 2));
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PALETTE MANAGEMENT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Installs an explicit color remap table.
     *
     * @param {?Map<number, number>|Object<number, number>} entries
     *   Map or plain object of packed RGBA → packed RGBA. Null clears the
     *   explicit palette.
     * @returns {this}
     */
    setPalette(entries) {
        this._palette.clear();

        if (entries) {
            const iterable = entries instanceof Map
                ? entries.entries()
                : Object.entries(entries);

            for (const [from, to] of iterable) {
                this._palette.set(from >>> 0, to >>> 0);
            }
        }

        this._paletteGeneration += 1;
        this.invalidate();
        return this;
    }

    /**
     * Enables or disables grayscale presentation.
     *
     * Used for the Drab World: every color collapses to its Rec. 709
     * luminance, preserving perceived brightness hierarchy while draining
     * all hue from the city streets.
     *
     * @param {boolean} enabled True to collapse colors to luminance.
     * @returns {this}
     */
    setGrayscale(enabled) {
        const next = Boolean(enabled);
        if (next !== this._grayscale) {
            this._grayscale = next;
            this._paletteGeneration += 1;
            this.invalidate();
        }
        return this;
    }

    /**
     * Resolves a buffer color through the active presentation pipeline:
     * explicit palette first, grayscale second, identity otherwise.
     *
     * @param {number} packed Packed RGBA color from the buffer.
     * @returns {number} Packed RGBA color to present.
     * @private
     */
    _resolveColor(packed) {
        const key = packed >>> 0;

        if (this._palette.size > 0 && this._palette.has(key)) {
            return this._palette.get(key);
        }

        if (this._grayscale) {
            const cached = this._grayscaleCache.get(key);
            if (cached !== undefined) return cached;

            const { r, g, b, a } = ASCIIBuffer.unpackColor(key);

            /* Rec. 709 luma coefficients. */
            const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            const gray = (
                ((luma & 0xFF) << 24) |
                ((luma & 0xFF) << 16) |
                ((luma & 0xFF) << 8) |
                (a & 0xFF)
            ) >>> 0;

            /* Cache is keyed by a 32-bit space; cap defensively. */
            if (this._grayscaleCache.size > 4096) this._grayscaleCache.clear();
            this._grayscaleCache.set(key, gray);
            return gray;
        }

        return key;
    }

    /**
     * Converts a packed color to a cached CSS fillStyle string.
     * @param {number} packed Packed RGBA color.
     * @returns {string} CSS color.
     * @private
     */
    _cssColor(packed) {
        const key = packed >>> 0;
        let css = this._cssCache.get(key);

        if (css === undefined) {
            css = ASCIIBuffer.colorToCSS(key);
            this._cssCache.set(key, css);
        }

        return css;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * FRAME LIFECYCLE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Begins a presentation frame.
     *
     * Deliberately does NOT clear the canvas: the presented-cell cache owns
     * erasure, clearing only the cells that actually change. A global clear
     * would force a full repaint of thousands of glyphs every frame.
     *
     * @returns {this}
     */
    beginFrame() {
        this._stats.lastCellsVisited = 0;
        this._stats.lastCellsDrawn = 0;
        this._stats.lastGlyphs = 0;
        this._stats.lastBackgrounds = 0;
        this._stats.lastStyleChanges = 0;

        this._applyBaseTransform();
        return this;
    }

    /**
     * Ends a presentation frame and finalizes diagnostics.
     * @returns {this}
     */
    endFrame() {
        this._stats.frameCount += 1;
        return this;
    }

    /**
     * Invalidates the presented-cell cache, forcing a full repaint on the
     * next render call. Call after world shifts, palette swaps, teleports,
     * or any event that desynchronizes canvas contents from the cache.
     * @returns {this}
     */
    invalidate() {
        this._cacheKey = null;
        return this;
    }

    /**
     * Hard-clears the entire canvas and invalidates the cache.
     *
     * @param {string|number|null} [color=null]
     *   Optional new clear color. Omit to keep the current one.
     * @returns {this}
     */
    clear(color = null) {
        if (color !== null && color !== undefined) {
            this._clearColor = ASCIIBuffer.packColor(color, DEFAULT_CLEAR_COLOR);
        }

        this._ctx.save();
        this._applyBaseTransform();
        this._ctx.fillStyle = this._cssColor(this._clearColor);
        this._ctx.fillRect(0, 0, this._cssWidth, this._cssHeight);
        this._ctx.restore();

        this.invalidate();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PRIMARY RENDER PATH
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Presents an ASCII buffer through a camera.
     *
     * Chooses between a batched full repaint (first frame, camera moved,
     * palette changed) and an incremental dirty-cell pass (steady state).
     *
     * @param {ASCIIBuffer} buffer Virtual grid to present.
     * @param {RenderCamera} [camera={}] Camera state.
     * @returns {this}
     */
    render(buffer, camera = {}) {
        const startTime = performance.now();

        const camX = Math.round(camera.x || 0);
        const camY = Math.round(camera.y || 0);
        const shakeX = Math.round(camera.shakeX || 0);
        const shakeY = Math.round(camera.shakeY || 0);

        const key = this._buildCacheKey(buffer, camX, camY);

        if (key !== this._cacheKey) {
            this._fullRepaint(buffer, camX, camY, shakeX, shakeY);
            this._cacheKey = key;
        } else {
            this._incrementalRepaint(buffer, camX, camY, shakeX, shakeY);
        }

        this._stats.lastRenderMs = performance.now() - startTime;
        return this;
    }

    /**
     * Presents only a known dirty cell set (typically from buffer.commit()).
     *
     * Falls back to a full render when the camera or palette has moved since
     * the cache was built, because dirty indices alone cannot repaint the
     * exposed regions of a scrolled viewport.
     *
     * @param {ASCIIBuffer} buffer Virtual grid to present.
     * @param {RenderCamera} [camera={}] Camera state.
     * @param {number[]} [dirtyCells=null]
     *   Flat dirty indices. Defaults to the buffer's last committed set.
     * @returns {this}
     */
    renderDirty(buffer, camera = {}, dirtyCells = null) {
        const camX = Math.round(camera.x || 0);
        const camY = Math.round(camera.y || 0);
        const shakeX = Math.round(camera.shakeX || 0);
        const shakeY = Math.round(camera.shakeY || 0);

        const key = this._buildCacheKey(buffer, camX, camY);

        if (key !== this._cacheKey) {
            return this.render(buffer, camera);
        }

        const cells = dirtyCells ?? buffer.getDirtyCells();
        if (!cells || cells.length === 0) return this;

        this._ensureScreenCache(buffer);

        const ctx = this._ctx;
        const cols = buffer.cols;
        const rows = buffer.rows;
        const chars = buffer.charCodes;
        const fgColors = buffer.foregroundColors;
        const bgColors = buffer.backgroundColors;

        ctx.save();
        ctx.translate(shakeX, shakeY);

        for (let i = 0; i < cells.length; i += 1) {
            const index = cells[i];
            if (index < 0 || index >= buffer.cellCount) continue;

            const col = index % cols;
            const row = (index / cols) | 0;

            const rect = this._cellRect(col, row, camX, camY);
            if (!this._rectOverlapsViewport(rect)) continue;

            this._paintCell(
                ctx,
                index,
                rect,
                chars[index],
                fgColors[index],
                bgColors[index]
            );
        }

        ctx.restore();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * REPAINT INTERNALS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Batched full repaint.
     *
     * Background rectangles are bucketed into one Path2D per resolved color;
     * glyphs are bucketed into per-color lists. The final pass issues one
     * fillStyle write and one fill() per background color, then one
     * fillStyle write plus one fillText() per visible glyph — the minimum
     * possible state churn for a cold frame.
     *
     * @param {ASCIIBuffer} buffer Source grid.
     * @param {number} camX Integer camera x.
     * @param {number} camY Integer camera y.
     * @param {number} shakeX Shake offset x.
     * @param {number} shakeY Shake offset y.
     * @private
     */
    _fullRepaint(buffer, camX, camY, shakeX, shakeY) {
        const ctx = this._ctx;

        this._ensureScreenCache(buffer);

        const range = this._visibleRange(buffer, camX, camY);
        const chars = buffer.charCodes;
        const fgColors = buffer.foregroundColors;
        const bgColors = buffer.backgroundColors;

        /* Shake can expose up to |shake| pixels of canvas beyond the normal
         * viewport on each axis; inflate the base clear to cover it. */
        const margin = Math.max(Math.abs(shakeX), Math.abs(shakeY));

        ctx.save();
        ctx.translate(shakeX, shakeY);

        /* Base clear: one rectangle, one fill. */
        ctx.fillStyle = this._cssColor(this._clearColor);
        ctx.fillRect(
            -margin,
            -margin,
            this._cssWidth + margin * 2,
            this._cssHeight + margin * 2
        );
        this._stats.lastStyleChanges += 1;

        /** @type {Map<number, Path2D>} Background buckets by resolved color. */
        const bgBuckets = new Map();

        /** @type {Map<number, Array<{x: number, y: number, ch: string}>>} */
        const glyphBuckets = new Map();

        for (let row = range.row0; row < range.row1; row += 1) {
            let index = row * buffer.cols + range.col0;

            for (let col = range.col0; col < range.col1; col += 1, index += 1) {
                const charCode = chars[index];
                const fg = this._resolveColor(fgColors[index]);
                const bg = this._resolveColor(bgColors[index]);

                /* Commit the effective presented state to the cache. */
                this._cacheChars[index] = charCode;
                this._cacheFg[index] = fg;
                this._cacheBg[index] = bg;

                this._stats.lastCellsVisited += 1;

                const rect = this._cellRect(col, row, camX, camY);

                /* Background bucket: skip colors identical to the base clear
                 * since the base rectangle already covers them. */
                if (bg !== this._clearColor && (bg & 0xFF) !== 0) {
                    let path = bgBuckets.get(bg);
                    if (!path) {
                        path = new Path2D();
                        bgBuckets.set(bg, path);
                    }
                    path.rect(rect.x, rect.y, rect.w, rect.h);
                    this._stats.lastBackgrounds += 1;
                }

                /* Glyph bucket: blanks never reach fillText. */
                if (!BLANK_GLYPHS.has(charCode)) {
                    let glyphs = glyphBuckets.get(fg);
                    if (!glyphs) {
                        glyphs = [];
                        glyphBuckets.set(fg, glyphs);
                    }
                    glyphs.push({
                        x: rect.x,
                        y: rect.y + this._textPadY,
                        ch: this._glyphString(charCode)
                    });
                    this._stats.lastGlyphs += 1;
                }
            }
        }

        /* Emit backgrounds: one fillStyle + one fill per color. */
        for (const [bg, path] of bgBuckets) {
            ctx.fillStyle = this._cssColor(bg);
            ctx.fill(path);
            this._stats.lastStyleChanges += 1;
        }

        /* Emit glyphs: one fillStyle per color, one fillText per glyph. */
        for (const [fg, glyphs] of glyphBuckets) {
            ctx.fillStyle = this._cssColor(fg);
            this._stats.lastStyleChanges += 1;

            for (let i = 0; i < glyphs.length; i += 1) {
                ctx.fillText(glyphs[i].ch, glyphs[i].x, glyphs[i].y);
            }
        }

        ctx.restore();

        this._stats.lastCellsDrawn = this._stats.lastCellsVisited;
    }

    /**
     * Steady-state incremental repaint.
     *
     * Visits the visible range and redraws only cells whose resolved
     * glyph/foreground/background triple differs from the presented-cell
     * cache. An idle scene therefore performs zero canvas draw calls.
     *
     * Redrawing a cell is self-healing: painting the new background (or the
     * clear color when the new background is transparent) fully erases any
     * previous glyph before the new glyph is stamped, so no separate erase
     * pass is required.
     *
     * @param {ASCIIBuffer} buffer Source grid.
     * @param {number} camX Integer camera x.
     * @param {number} camY Integer camera y.
     * @param {number} shakeX Shake offset x.
     * @param {number} shakeY Shake offset y.
     * @private
     */
    _incrementalRepaint(buffer, camX, camY, shakeX, shakeY) {
        const ctx = this._ctx;

        this._ensureScreenCache(buffer);

        const range = this._visibleRange(buffer, camX, camY);
        const chars = buffer.charCodes;
        const fgColors = buffer.foregroundColors;
        const bgColors = buffer.backgroundColors;

        ctx.save();
        ctx.translate(shakeX, shakeY);

        for (let row = range.row0; row < range.row1; row += 1) {
            let index = row * buffer.cols + range.col0;

            for (let col = range.col0; col < range.col1; col += 1, index += 1) {
                const charCode = chars[index];
                const fg = this._resolveColor(fgColors[index]);
                const bg = this._resolveColor(bgColors[index]);

                this._stats.lastCellsVisited += 1;

                /* Skip cells already presented in exactly this state. */
                if (
                    this._cacheChars[index] === charCode &&
                    this._cacheFg[index] === fg &&
                    this._cacheBg[index] === bg
                ) {
                    continue;
                }

                const rect = this._cellRect(col, row, camX, camY);

                this._paintCell(ctx, index, rect, charCode, fgColors[index], bgColors[index]);
            }
        }

        ctx.restore();
    }

    /**
     * Draws one cell, resolving palette colors and updating the cache.
     *
     * Accepts RAW buffer colors so both the incremental path (which already
     * resolved for comparison) and renderDirty (which did not) can share it;
     * resolution is idempotent and cheap via caches.
     *
     * @param {CanvasRenderingContext2D} ctx Active context.
     * @param {number} index Flat buffer index.
     * @param {{x: number, y: number, w: number, h: number}} rect Cell rect.
     * @param {number} charCode Raw glyph code point.
     * @param {number} rawFg Raw foreground packed color.
     * @param {number} rawBg Raw background packed color.
     * @private
     */
    _paintCell(ctx, index, rect, charCode, rawFg, rawBg) {
        const fg = this._resolveColor(rawFg);
        const bg = this._resolveColor(rawBg);

        /* Erase + background. An opaque non-clear background fills the cell;
         * anything else falls back to the clear color so stale glyphs die. */
        const bgIsVisible = bg !== this._clearColor && (bg & 0xFF) !== 0;

        ctx.fillStyle = this._cssColor(bgIsVisible ? bg : this._clearColor);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        this._stats.lastBackgrounds += 1;
        this._stats.lastStyleChanges += 1;

        if (!BLANK_GLYPHS.has(charCode)) {
            ctx.fillStyle = this._cssColor(fg);
            ctx.fillText(
                this._glyphString(charCode),
                rect.x,
                rect.y + this._textPadY
            );
            this._stats.lastGlyphs += 1;
            this._stats.lastStyleChanges += 1;
        }

        this._cacheChars[index] = charCode;
        this._cacheFg[index] = fg;
        this._cacheBg[index] = bg;
        this._stats.lastCellsDrawn += 1;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CULLING & GEOMETRY
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Computes the buffer cell range overlapping the viewport.
     *
     * @param {ASCIIBuffer} buffer Source grid.
     * @param {number} camX Integer camera x.
     * @param {number} camY Integer camera y.
     * @returns {{col0: number, row0: number, col1: number, row1: number}}
     *   Half-open range, clamped to buffer dimensions.
     * @private
     */
    _visibleRange(buffer, camX, camY) {
        const col0 = Math.max(0, Math.floor(camX / this._cellWidth));
        const row0 = Math.max(0, Math.floor(camY / this._cellHeight));

        const col1 = Math.min(
            buffer.cols,
            Math.ceil((camX + this._cssWidth) / this._cellWidth)
        );
        const row1 = Math.min(
            buffer.rows,
            Math.ceil((camY + this._cssHeight) / this._cellHeight)
        );

        return { col0, row0, col1, row1 };
    }

    /**
     * Maps a grid cell to its integer screen rectangle.
     *
     * Each edge is rounded independently from floating-point grid space,
     * which guarantees adjacent cells share exact pixel edges (no seams, no
     * overlaps) even with a fractional measured advance width.
     *
     * @param {number} col Grid column.
     * @param {number} row Grid row.
     * @param {number} camX Integer camera x.
     * @param {number} camY Integer camera y.
     * @returns {{x: number, y: number, w: number, h: number}}
     * @private
     */
    _cellRect(col, row, camX, camY) {
        const x0 = Math.round(col * this._cellWidth - camX);
        const x1 = Math.round((col + 1) * this._cellWidth - camX);
        const y0 = Math.round(row * this._cellHeight - camY);
        const y1 = Math.round((row + 1) * this._cellHeight - camY);

        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    /**
     * Tests whether a cell rectangle overlaps the viewport at all.
     * @param {{x: number, y: number, w: number, h: number}} rect
     * @returns {boolean}
     * @private
     */
    _rectOverlapsViewport(rect) {
        return (
            rect.x + rect.w > 0 &&
            rect.y + rect.h > 0 &&
            rect.x < this._cssWidth &&
            rect.y < this._cssHeight
        );
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CACHE MANAGEMENT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Builds the presented-cache validity key.
     *
     * The cache remains valid only while ALL of the following hold:
     *   - the integer camera offset is unchanged,
     *   - the buffer dimensions are unchanged,
     *   - the palette generation is unchanged.
     *
     * @param {ASCIIBuffer} buffer Source grid.
     * @param {number} camX Integer camera x.
     * @param {number} camY Integer camera y.
     * @returns {string}
     * @private
     */
    _buildCacheKey(buffer, camX, camY) {
        return `${camX},${camY}|${buffer.cols}x${buffer.rows}|p${this._paletteGeneration}`;
    }

    /**
     * Allocates or reallocates the presented-cell cache to match a buffer.
     * Dimension changes force invalidation because indices no longer map to
     * the same cells.
     *
     * @param {ASCIIBuffer} buffer Source grid.
     * @private
     */
    _ensureScreenCache(buffer) {
        if (this._cacheChars !== null && this._cacheChars.length === buffer.cellCount) {
            return;
        }

        this._cacheChars = new Uint32Array(buffer.cellCount);
        this._cacheFg = new Uint32Array(buffer.cellCount);
        this._cacheBg = new Uint32Array(buffer.cellCount);

        /* Seed with impossible values so the first comparison always fails. */
        this._cacheChars.fill(0xFFFFFFFF);
        this._cacheKey = null;
    }

    /**
     * Returns a cached JS string for a code point, avoiding per-cell
     * String.fromCodePoint allocations in hot paths.
     * @param {number} charCode Glyph code point.
     * @returns {string}
     * @private
     */
    _glyphString(charCode) {
        let glyph = this._glyphCache.get(charCode);

        if (glyph === undefined) {
            glyph = String.fromCodePoint(charCode);
            if (this._glyphCache.size > 4096) this._glyphCache.clear();
            this._glyphCache.set(charCode, glyph);
        }

        return glyph;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * SCREEN-SPACE DRAWING (HUD / OVERLAYS)
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Draws text directly in screen space, bypassing the camera and the
     * presented-cell cache. Intended for HUD panels, dialogue overlays, and
     * floating combat text that must not scroll with the world.
     *
     * @param {number} px Screen x in CSS pixels.
     * @param {number} py Screen y in CSS pixels.
     * @param {string} text Text to draw. Newlines advance by one row.
     * @param {string|number} fg Foreground color.
     * @param {string|number|null} [bg=null]
     *   Optional background color behind the text block.
     * @returns {{width: number, height: number}} Bounding size in CSS pixels.
     */
    drawString(px, py, text, fg, bg = null) {
        if (typeof text !== 'string' || text.length === 0) {
            return { width: 0, height: 0 };
        }

        const ctx = this._ctx;
        const lines = text.split(/\r?\n/);

        const fgPacked = ASCIIBuffer.packColor(fg, 0xFFFFFFFF);
        const bgPacked = bg === null || bg === undefined
            ? null
            : ASCIIBuffer.packColor(bg, 0x00000000);

        let maxColumns = 0;

        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].length > maxColumns) maxColumns = lines[i].length;
        }

        const blockWidth = maxColumns * this._cellWidth;
        const blockHeight = lines.length * this._cellHeight;

        ctx.save();

        if (bgPacked !== null && (bgPacked & 0xFF) !== 0) {
            ctx.fillStyle = this._cssColor(bgPacked);
            ctx.fillRect(px, py, Math.ceil(blockWidth), blockHeight);
        }

        ctx.fillStyle = this._cssColor(fgPacked);

        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].length === 0) continue;

            ctx.fillText(
                lines[i],
                px,
                py + i * this._cellHeight + this._textPadY
            );
        }

        ctx.restore();

        return { width: blockWidth, height: blockHeight };
    }

    /**
     * Draws a solid rectangle in screen space. Useful for HUD frames,
     * health bars, and bullet-hell telegraph zones drawn above the grid.
     *
     * @param {number} px Screen x in CSS pixels.
     * @param {number} py Screen y in CSS pixels.
     * @param {number} width Width in CSS pixels.
     * @param {number} height Height in CSS pixels.
     * @param {string|number} color Fill color.
     * @returns {this}
     */
    drawRect(px, py, width, height, color) {
        const packed = ASCIIBuffer.packColor(color, 0xFFFFFFFF);

        if ((packed & 0xFF) === 0) return this;

        this._ctx.save();
        this._ctx.fillStyle = this._cssColor(packed);
        this._ctx.fillRect(px, py, width, height);
        this._ctx.restore();
        return this;
    }

    /**
     * Measures a string without drawing it.
     * @param {string} text Candidate text.
     * @returns {{width: number, height: number}} Size in CSS pixels.
     */
    measureString(text) {
        if (typeof text !== 'string' || text.length === 0) {
            return { width: 0, height: 0 };
        }

        const lines = text.split(/\r?\n/);
        let maxColumns = 0;

        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].length > maxColumns) maxColumns = lines[i].length;
        }

        return {
            width: maxColumns * this._cellWidth,
            height: lines.length * this._cellHeight
        };
    }
}

export default Renderer;