/**
 * @file src/worlds/WaterShader.js
 * @module worlds/WaterShader
 * @description
 * Real-time water reflection shader for "A Stitch in Time".
 * WaterShader reads the terrain + entity content that sits ABOVE every
 * lake/river tile, mirrors it across the water surface, distorts it with
 * animated sine waves, tints it toward a deep-water palette, and injects
 * the result back into the shared world ASCIIBuffer during the render pass.
 * It is a pure buffer post-processor: it owns no entities, no map state,
 * and performs zero per-frame allocations once warm.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PIPELINE CONTRACT (WHERE WATER LIVES IN A FRAME)
 * ───────────────────────────────────────────────────────────────────────────
 * The WorldManager runs an immediate-mode ASCII pipeline every tick:
 *
 *   buffer.clear();
 *   map.stampInto(buffer);            // terrain (restores '~' water glyphs)
 *   entities.draw(buffer, camera);    // shores, docks, NPCs above water
 *   weather.render(buffer, camera);
 *   water.render(buffer);             // ← runs AFTER terrain + entities
 *   buffer.commit();
 *   renderer.render(buffer, camera);
 *
 * Two ordering guarantees make the shader correct:
 *   1. Terrain is re-stamped every frame, so the '~' water glyphs are
 *      present when the shader scans for water spans. (For persistent
 *      buffers that are NOT re-stamped, supply an explicit water mask via
 *      setWaterMask() so detection never depends on drawn glyphs.)
 *   2. Entities drawn before the shader are naturally captured as
 *      reflection sources, so a lantern on a dock shimmers in the lake.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COORDINATE MATRIX INVERSION (THE MIRROR MATH)
 * ───────────────────────────────────────────────────────────────────────────
 * Each contiguous vertical run of water cells in a column is one water
 * body. Its TOP row `surfaceY` is the first water cell; the mirror line is
 * the horizontal axis half a cell above it, at  y = surfaceY - 0.5  (i.e.
 * the boundary between the last land row and the first water row).
 *
 * Reflecting a point across a horizontal line L maps  y → 2L - y. With
 * L = surfaceY - 0.5:
 *
 *   sourceY = 2·(surfaceY - 0.5) - y
 *           = 2·surfaceY - 1 - y
 *
 * Equivalently, a water cell at depth  d = y - surfaceY + 1  (the topmost
 * water row is depth 1) reflects the row  sourceY = surfaceY - d. Both
 * forms are identical; the depth form makes the depth-fade trivial.
 *
 *   water row y        depth d      reflects row sourceY
 *   surfaceY           1            surfaceY - 1   (the shore row)
 *   surfaceY + 1       2            surfaceY - 2
 *   surfaceY + 2       3            surfaceY - 3
 *
 * Column x is unchanged by the mirror; only rows invert. Horizontal ripple
 * displacement is applied on top (see below), never the inversion itself.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SINE-WAVE DISTORTION FORMULA
 * ───────────────────────────────────────────────────────────────────────────
 * Each water scanline is shifted horizontally by a traveling wave. The
 * displacement depends on the DESTINATION row y (the water surface being
 * drawn), because the ripple is a property of the water at that row:
 *
 *   dx(y, t) = A₁·sin(y·f₁ + t·s₁)
 *            + A₂·sin(y·f₂ + t·s₂ + φ₂)          (optional 2nd harmonic)
 *
 *   sourceX = clamp(x + round(dx), 0, cols-1)
 *
 * f is spatial frequency (radians per row), s is temporal speed (radians
 * per second), A is amplitude in cells. The second harmonic, offset by
 * phase φ₂ and a different frequency, breaks up the perfect comb pattern
 * so the surface reads as liquid rather than a metronome.
 *
 * PERFORMANCE: dx is a function of row y only, NOT of column x. The shader
 * therefore evaluates the sine once per row into a reusable Int16Array
 * offset table, then indexes it for every column — O(rows) transcendentals
 * per frame instead of O(cols·rows).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLOR & OPACITY SHIFTING (THE WATER TINT)
 * ───────────────────────────────────────────────────────────────────────────
 * Reflected glyphs must read as "underwater", not as duplicated terrain.
 * Each sampled color is lerped toward a deep-water tint and faded:
 *
 *   channel' = channel·(1 - k) + tint·k          per R/G/B channel
 *   alpha    = 255 · opacity · depthScale
 *   depthScale = clamp(1 - (depth - 1)·depthFade, minDepthAlpha, 1)
 *
 * The RGB tint result is cached per source color (terrain palettes are
 * small), and only the alpha byte is recomputed per cell, so the depth fade
 * does not defeat the cache. Transparent source backgrounds fall back to a
 * solid water-base color so reflections never punch holes into the void.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CORRECTNESS INVARIANT (WHY NO SNAPSHOT IS NEEDED)
 * ───────────────────────────────────────────────────────────────────────────
 * The shader writes ONLY into water cells and reads ONLY from non-water
 * cells (water sources are skipped). Since the read set and the write set
 * are disjoint, a single in-place pass is order-independent and no full
 * buffer snapshot is required. This is the single largest performance win
 * in the module and is why reflection-of-reflection is intentionally not
 * produced (deep water absorbs it, which is also physically plausible).
 *
 * @example
 * const water = new WaterShader({
 *     waterGlyphs: ['~'],
 *     frequency: 0.55,
 *     speed: 2.2,
 *     amplitude: 1.4
 * });
 * water.setWaterMask(terrainWaterMask);   // recommended for persistent buffers
 *
 * // Per fixed tick:
 * water.update(dt);
 *
 * // Per presentation frame, after terrain + entities + weather:
 * water.render(worldBuffer);
 * worldBuffer.commit();
 * renderer.render(worldBuffer, camera);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Code point of the blank glyph; used to detect empty reflection sources. */
const SPACE_CODE_POINT = 0x20;

/** Default spatial frequency of the primary ripple, radians per row. */
const DEFAULT_FREQUENCY = 0.55;
/** Default temporal speed of the primary ripple, radians per second. */
const DEFAULT_SPEED = 2.2;
/** Default primary amplitude in cells. */
const DEFAULT_AMPLITUDE = 1.4;
/** Hard ceiling on amplitude to keep reflections from smearing off-map. */
const MAX_AMPLITUDE = 16;

/** Global opacity multiplier applied to every reflected cell, 0..1. */
const DEFAULT_OPACITY = 0.85;
/** Per-row-of-depth alpha reduction; reflections dissolve going deeper. */
const DEFAULT_DEPTH_FADE = 0.06;
/** Floor for the depth fade so deep water never goes fully invisible. */
const MIN_DEPTH_ALPHA_FLOOR = 0.1;

/** Default foreground tint (cool cyan-blue) and blend strength 0..1. */
const DEFAULT_FG_TINT = '#1b4a6b';
const DEFAULT_FG_TINT_STRENGTH = 0.5;
/** Default background tint (deep navy) and blend strength 0..1. */
const DEFAULT_BG_TINT = '#06182e';
const DEFAULT_BG_TINT_STRENGTH = 0.65;
/** Solid color used when a reflected source has a transparent background. */
const DEFAULT_WATER_BASE = '#071624';

/** Glyphs treated as water when no explicit mask is supplied. */
const DEFAULT_WATER_GLYPHS = Object.freeze(['~']);

/** Safety cap for the tint caches; caches flush when exceeded. */
const MAX_TINT_CACHE_ENTRIES = 2048;

/* ══════════════════════════════════════════════════════════════════════════
   PACKED-COLOR HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Packs 8-bit RGBA channels into the engine's 32-bit color format.
 * Layout matches ASCIIBuffer.packColor:  R<<24 | G<<16 | B<<8 | A,
 * with the low byte holding alpha. Returned unsigned via >>> 0 so values
 * with the high bit set (e.g. R=255) stay positive.
 * @param {number} r Red 0..255.
 * @param {number} g Green 0..255.
 * @param {number} b Blue 0..255.
 * @param {number} a Alpha 0..255.
 * @returns {number} Unsigned 32-bit packed color.
 */
function packRGBA(r, g, b, a) {
    return (((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (a & 0xFF)) >>> 0;
}

/**
 * Unpacks a 32-bit packed color into its channels.
 * @param {number} packed Packed RGBA color.
 * @returns {{r: number, g: number, b: number, a: number}} Channels 0..255.
 */
function unpackRGBA(packed) {
    const p = packed >>> 0;
    return {
        r: (p >>> 24) & 0xFF,
        g: (p >>> 16) & 0xFF,
        b: (p >>> 8) & 0xFF,
        a: p & 0xFF
    };
}

/* ══════════════════════════════════════════════════════════════════════════
   WATER SHADER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Calculates and injects animated, tinted water reflections into the world
 * buffer. Stateless with respect to entities and map; all it needs each
 * frame is the buffer to operate on.
 */
export class WaterShader {
    /**
     * @param {Object} [options]
     * @param {string[]} [options.waterGlyphs=['~']] Glyphs detected as water
     *   when no explicit mask is set.
     * @param {Uint8Array} [options.waterMask=null] Optional explicit mask;
     *   mask[i] !== 0 marks cell i as water. Robust for persistent buffers.
     * @param {number} [options.frequency=0.55] Primary spatial frequency.
     * @param {number} [options.speed=2.2] Primary temporal speed.
     * @param {number} [options.amplitude=1.4] Primary amplitude in cells.
     * @param {?{frequency: number, speed: number, amplitude: number, phase: number}}
     *   [options.secondaryWave=null] Optional second harmonic.
     * @param {number} [options.opacity=0.85] Global reflection opacity 0..1.
     * @param {number} [options.depthFade=0.06] Alpha reduction per depth row.
     * @param {string} [options.fgTint] Foreground tint color.
     * @param {number} [options.fgTintStrength] Foreground blend 0..1.
     * @param {string} [options.bgTint] Background tint color.
     * @param {number} [options.bgTintStrength] Background blend 0..1.
     * @param {string} [options.waterBaseColor] Fallback water background.
     * @param {boolean} [options.reflectBlank=false] Reflect blank/sky cells.
     * @throws {TypeError|RangeError} If any option is invalid.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[WaterShader] options must be an object.');
        }

        /* ---- Wave configuration -------------------------------------- */
        this.setWave({
            frequency: options.frequency ?? DEFAULT_FREQUENCY,
            speed: options.speed ?? DEFAULT_SPEED,
            amplitude: options.amplitude ?? DEFAULT_AMPLITUDE
        });
        this.setSecondaryWave(options.secondaryWave ?? null);

        /* ---- Opacity & depth fade ------------------------------------ */
        this.setOpacity(options.opacity ?? DEFAULT_OPACITY);
        this.setDepthFade(options.depthFade ?? DEFAULT_DEPTH_FADE);
        /** @type {number} Floor for the depth fade alpha scale. */
        this._minDepthAlpha = MIN_DEPTH_ALPHA_FLOOR;

        /* ---- Tint configuration (packed once at construction) -------- */
        /** @type {?Uint8Array} Explicit water mask, or null to auto-detect. */
        this._waterMask = options.waterMask instanceof Uint8Array ? options.waterMask : null;
        /** @type {boolean} Reflect blank (space + transparent bg) cells. */
        this._reflectBlank = Boolean(options.reflectBlank);

        this._fgTintPacked = this._packConfigColor(options.fgTint ?? DEFAULT_FG_TINT);
        this._bgTintPacked = this._packConfigColor(options.bgTint ?? DEFAULT_BG_TINT);
        this._waterBgPacked = this._packConfigColor(options.waterBaseColor ?? DEFAULT_WATER_BASE);
        this.setTintStrength(
            options.fgTintStrength ?? DEFAULT_FG_TINT_STRENGTH,
            options.bgTintStrength ?? DEFAULT_BG_TINT_STRENGTH
        );

        /* ---- Water glyph detection set -------------------------------- */
        this.setWaterGlyphs(options.waterGlyphs ?? DEFAULT_WATER_GLYPHS);

        /* ---- Simulation clock ----------------------------------------- */
        /** @type {number} Accumulated shader time, seconds. */
        this._time = 0;

        /* ---- Per-frame wave offset table (cached) --------------------- */
        /** @type {?Int16Array} Row-indexed horizontal displacement. */
        this._offsetTable = null;
        /** @type {number} Row count the offset table was built for. */
        this._offsetTableRows = -1;
        /** @type {number} Time the offset table was built at. */
        this._offsetTableTime = Number.NaN;

        /* ---- Tint caches (source packed color → tinted RGB, alpha=255) */
        /** @type {Map<number, number>} */
        this._fgCache = new Map();
        /** @type {Map<number, number>} */
        this._bgCache = new Map();

        /* ---- Diagnostics ----------------------------------------------- */
        /** @type {Object} Lifetime counters for the debug HUD. */
        this._metrics = {
            framesRendered: 0,
            cellsReflected: 0,
            cacheFlushes: 0
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       CONFIGURATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Sets the primary ripple wave parameters.
     * @param {{frequency?: number, speed?: number, amplitude?: number}} wave
     * @returns {this}
     */
    setWave(wave) {
        const frequency = wave.frequency ?? this._frequency ?? DEFAULT_FREQUENCY;
        const speed = wave.speed ?? this._speed ?? DEFAULT_SPEED;
        const amplitude = wave.amplitude ?? this._amplitude ?? DEFAULT_AMPLITUDE;
        if (!Number.isFinite(frequency) || frequency < 0) {
            throw new RangeError('[WaterShader] frequency must be finite and >= 0.');
        }
        if (!Number.isFinite(speed)) {
            throw new RangeError('[WaterShader] speed must be finite.');
        }
        if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > MAX_AMPLITUDE) {
            throw new RangeError(
                `[WaterShader] amplitude must be in [0, ${MAX_AMPLITUDE}]; received ${amplitude}.`
            );
        }
        this._frequency = frequency;
        this._speed = speed;
        this._amplitude = amplitude;
        /* Wave params change the offset table; force rebuild next frame. */
        this._offsetTableTime = Number.NaN;
        return this;
    }

    /**
     * Sets or clears the optional second harmonic. Pass null to disable.
     * @param {?{frequency: number, speed: number, amplitude: number, phase?: number}} wave
     * @returns {this}
     */
    setSecondaryWave(wave) {
        if (wave === null || wave === undefined) {
            this._secondary = null;
            this._offsetTableTime = Number.NaN;
            return this;
        }
        if (!Number.isFinite(wave.frequency) || !Number.isFinite(wave.speed) ||
            !Number.isFinite(wave.amplitude)) {
            throw new RangeError('[WaterShader] secondaryWave fields must be finite.');
        }
        this._secondary = Object.freeze({
            frequency: wave.frequency,
            speed: wave.speed,
            amplitude: Math.min(MAX_AMPLITUDE, Math.max(0, wave.amplitude)),
            phase: Number.isFinite(wave.phase) ? wave.phase : 0
        });
        this._offsetTableTime = Number.NaN;
        return this;
    }

    /**
     * Sets the global reflection opacity.
     * @param {number} opacity Value clamped into [0, 1].
     * @returns {this}
     */
    setOpacity(opacity) {
        if (!Number.isFinite(opacity)) {
            throw new RangeError('[WaterShader] opacity must be finite.');
        }
        this._opacity = Math.min(1, Math.max(0, opacity));
        return this;
    }

    /**
     * Sets the per-depth-row alpha reduction. Higher values make reflections
     * dissolve faster with depth.
     * @param {number} fadePerRow Value clamped into [0, 1].
     * @returns {this}
     */
    setDepthFade(fadePerRow) {
        if (!Number.isFinite(fadePerRow)) {
            throw new RangeError('[WaterShader] depthFade must be finite.');
        }
        this._depthFade = Math.min(1, Math.max(0, fadePerRow));
        return this;
    }

    /**
     * Sets the tint blend strengths for foreground and background.
     * @param {number} fgStrength Foreground blend 0..1.
     * @param {number} bgStrength Background blend 0..1.
     * @returns {this}
     */
    setTintStrength(fgStrength, bgStrength) {
        if (!Number.isFinite(fgStrength) || !Number.isFinite(bgStrength)) {
            throw new RangeError('[WaterShader] tint strengths must be finite.');
        }
        this._fgStrength = Math.min(1, Math.max(0, fgStrength));
        this._bgStrength = Math.min(1, Math.max(0, bgStrength));
        /* Strength changes invalidate cached tints. */
        this._fgCache.clear();
        this._bgCache.clear();
        return this;
    }

    /**
     * Replaces the foreground/background tint colors. Clears the tint caches.
     * @param {string} fgTint Foreground tint (hex / rgb() / rgba()).
     * @param {string} bgTint Background tint.
     * @param {string} [waterBaseColor] Optional new water-base background.
     * @returns {this}
     */
    setTintColors(fgTint, bgTint, waterBaseColor) {
        this._fgTintPacked = this._packConfigColor(fgTint);
        this._bgTintPacked = this._packConfigColor(bgTint);
        if (waterBaseColor !== undefined) {
            this._waterBgPacked = this._packConfigColor(waterBaseColor);
        }
        this._fgCache.clear();
        this._bgCache.clear();
        return this;
    }

    /**
     * Sets the glyph set treated as water during auto-detection.
     * @param {string[]} glyphs Array of single-character glyphs.
     * @returns {this}
     */
    setWaterGlyphs(glyphs) {
        if (!Array.isArray(glyphs) || glyphs.length === 0) {
            throw new TypeError('[WaterShader] waterGlyphs must be a non-empty array.');
        }
        /** @type {Set<number>} */
        this._waterCodes = new Set();
        for (const glyph of glyphs) {
            if (typeof glyph !== 'string' || Array.from(glyph).length !== 1) {
                throw new TypeError('[WaterShader] each water glyph must be one character.');
            }
            this._waterCodes.add(glyph.codePointAt(0));
        }
        return this;
    }

    /**
     * Supplies an explicit water mask, decoupling detection from whatever
     * glyphs are currently drawn. Strongly recommended for persistent
     * buffers that are not re-stamped from the map each frame.
     * @param {?Uint8Array} mask mask[i] !== 0 marks cell i as water, or null
     *   to return to glyph auto-detection.
     * @returns {this}
     */
    setWaterMask(mask) {
        if (mask !== null && !(mask instanceof Uint8Array)) {
            throw new TypeError('[WaterShader] waterMask must be a Uint8Array or null.');
        }
        this._waterMask = mask;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       TIME
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the shader clock. Call once per fixed tick.
     * @param {number} dt Fixed timestep in seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;
        return this;
    }

    /**
     * Sets the shader clock absolutely (scene transitions, pause/resume).
     * @param {number} t Time in seconds.
     * @returns {this}
     */
    setTime(t) {
        if (!Number.isFinite(t)) {
            throw new RangeError('[WaterShader] time must be finite.');
        }
        this._time = t;
        return this;
    }

    /** @returns {number} Current shader time in seconds. */
    get time() {
        return this._time;
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER (BUFFER INJECTION)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Computes reflections and injects them into the buffer in place.
     * Call AFTER terrain and entities are stamped, BEFORE buffer.commit().
     *
     * Algorithm per column:
     *   1. Scan top-to-bottom for contiguous water spans (mask or glyph).
     *   2. For each span, the top row is `surfaceY` (the mirror anchor).
     *   3. For each water row y in the span, mirror-invert to sourceY,
     *      apply the per-row sine offset to sourceX, sample, tint, fade,
     *      and setChar into (x, y).
     *
     * Reads target only non-water cells and writes target only water cells,
     * so the pass is order-independent and snapshot-free (see header).
     *
     * @param {ASCIIBuffer} buffer Destination world buffer.
     * @param {{x?: number, y?: number, width?: number, height?: number}} [region]
     *   Optional sub-region in buffer cells; defaults to the full buffer.
     * @returns {number} Number of water cells that received a reflection.
     */
    render(buffer, region) {
        if (!(buffer instanceof ASCIIBuffer)) {
            throw new TypeError('[WaterShader] render requires an ASCIIBuffer.');
        }
        const cols = buffer.cols;
        const rows = buffer.rows;

        /* Resolve and clamp the processing region. */
        let x0 = 0;
        let y0 = 0;
        let x1 = cols;
        let y1 = rows;
        if (region && typeof region === 'object') {
            x0 = Math.max(0, Math.floor(region.x ?? 0));
            y0 = Math.max(0, Math.floor(region.y ?? 0));
            x1 = Math.min(cols, x0 + Math.ceil(region.width ?? (cols - x0)));
            y1 = Math.min(rows, y0 + Math.ceil(region.height ?? (rows - y0)));
        }
        if (x0 >= x1 || y0 >= y1) return 0;

        /* Rebuild the per-row wave table only when time/rows changed. */
        this._ensureOffsetTable(rows);

        /* Read-only views into the buffer's structure-of-arrays storage. */
        const chars = buffer.charCodes;
        const fgs = buffer.foregroundColors;
        const bgs = buffer.backgroundColors;
        /* Use the explicit mask only if it matches this buffer's size. */
        const mask = (this._waterMask && this._waterMask.length === cols * rows)
            ? this._waterMask
            : null;

        let written = 0;

        for (let x = x0; x < x1; x += 1) {
            let y = y0;
            while (y < y1) {
                const idx = y * cols + x;
                const isWater = mask
                    ? (mask[idx] !== 0)
                    : this._waterCodes.has(chars[idx]);
                if (!isWater) {
                    y += 1;
                    continue;
                }

                /* Found the top of a water span; locate its bottom. */
                const surfaceY = y;
                let bottom = y;
                while (bottom + 1 < y1) {
                    const bidx = (bottom + 1) * cols + x;
                    const stillWater = mask
                        ? (mask[bidx] !== 0)
                        : this._waterCodes.has(chars[bidx]);
                    if (!stillWater) break;
                    bottom += 1;
                }

                /* Fill the span [surfaceY, bottom] with reflections. */
                for (let wy = surfaceY; wy <= bottom; wy += 1) {
                    if (this._reflectCell(buffer, chars, fgs, bgs, mask, cols, rows, x, wy, surfaceY)) {
                        written += 1;
                    }
                }

                y = bottom + 1;
            }
        }

        this._metrics.framesRendered += 1;
        this._metrics.cellsReflected += written;
        return written;
    }

    /**
     * Alias matching the engine's render-pass naming convention.
     * @param {ASCIIBuffer} buffer Destination world buffer.
     * @param {Object} [region] Optional sub-region.
     * @returns {number} Number of cells reflected.
     */
    apply(buffer, region) {
        return this.render(buffer, region);
    }

    /**
     * Computes and writes the reflection for a single water cell.
     *
     * Mirror math:  sourceY = 2·surfaceY - 1 - y. With depth
     * d = y - surfaceY + 1 this is sourceY = surfaceY - d, so depth 1
     * reflects the shore row directly above the water.
     *
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {Uint32Array} chars Buffer code point view.
     * @param {Uint32Array} fgs Buffer foreground color view.
     * @param {Uint32Array} bgs Buffer background color view.
     * @param {?Uint8Array} mask Active water mask, or null.
     * @param {number} cols Buffer columns.
     * @param {number} rows Buffer rows.
     * @param {number} x Destination column.
     * @param {number} y Destination (water) row.
     * @param {number} surfaceY Top row of the owning water span.
     * @returns {boolean} True if a reflection was written.
     * @private
     */
    _reflectCell(buffer, chars, fgs, bgs, mask, cols, rows, x, y, surfaceY) {
        /* ---- Coordinate inversion ------------------------------------ */
        const sourceY = 2 * surfaceY - 1 - y;
        if (sourceY < 0 || sourceY >= rows) {
            /* Water too close to the map top has nothing above to mirror. */
            return false;
        }

        /* ---- Sine displacement, indexed from the cached row table ----- */
        const dx = this._offsetTable[y] | 0;
        let sourceX = x + dx;
        if (sourceX < 0) sourceX = 0;
        else if (sourceX >= cols) sourceX = cols - 1;

        const srcIdx = sourceY * cols + sourceX;
        const srcCode = chars[srcIdx];

        /* ---- Correctness invariant: never reflect water into water ---- */
        const srcIsWater = mask
            ? (mask[srcIdx] !== 0)
            : this._waterCodes.has(srcCode);
        if (srcIsWater) return false;

        /* ---- Skip empty sky cells unless explicitly requested --------- */
        const srcBg = bgs[srcIdx];
        const isBlank = srcCode === SPACE_CODE_POINT && (srcBg & 0xFF) === 0;
        if (isBlank && !this._reflectBlank) return false;

        /* ---- Depth-based fade ----------------------------------------- */
        const depth = y - surfaceY + 1;
        const depthScale = Math.max(
            this._minDepthAlpha,
            1 - (depth - 1) * this._depthFade
        );
        const alpha = Math.round(255 * this._opacity * depthScale) & 0xFF;

        /* ---- Tint foreground (cached RGB, per-cell alpha byte) -------- */
        const srcFg = fgs[srcIdx];
        const tintFg = this._tintRGB(srcFg, this._fgCache, this._fgTintPacked, this._fgStrength);
        const fgFinal = (tintFg & 0xFFFFFF00) | alpha;

        /* ---- Tint background, or fall back to solid water base -------- */
        let bgFinal;
        if ((srcBg & 0xFF) === 0) {
            bgFinal = (this._waterBgPacked & 0xFFFFFF00) | alpha;
        } else {
            const tintBg = this._tintRGB(srcBg, this._bgCache, this._bgTintPacked, this._bgStrength);
            bgFinal = (tintBg & 0xFFFFFF00) | alpha;
        }

        buffer.setChar(x, y, srcCode, fgFinal, bgFinal);
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       WAVE TABLE & TINT CACHE INTERNALS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Ensures the per-row displacement table is current for this frame.
     * Rebuilt only when the row count or shader time changes, so multiple
     * render() calls within one frame reuse the same table.
     *
     * dx(y) = A₁·sin(y·f₁ + t·s₁) + A₂·sin(y·f₂ + t·s₂ + φ₂)
     *
     * @param {number} rows Buffer row count.
     * @private
     */
    _ensureOffsetTable(rows) {
        const time = this._time;
        if (this._offsetTable !== null &&
            this._offsetTableRows === rows &&
            this._offsetTableTime === time) {
            return;
        }
        if (this._offsetTable === null || this._offsetTable.length !== rows) {
            this._offsetTable = new Int16Array(rows);
        }
        const f1 = this._frequency;
        const s1 = this._speed;
        const a1 = this._amplitude;
        const sec = this._secondary;
        for (let y = 0; y < rows; y += 1) {
            let offset = Math.sin(y * f1 + time * s1) * a1;
            if (sec !== null) {
                offset += Math.sin(y * sec.frequency + time * sec.speed + sec.phase) * sec.amplitude;
            }
            this._offsetTable[y] = Math.round(offset);
        }
        this._offsetTableRows = rows;
        this._offsetTableTime = time;
    }

    /**
     * Returns the horizontal displacement for a given row at the current
     * time. Primarily for tests and debug tooling.
     * @param {number} y Row index.
     * @returns {number} Integer cell displacement.
     */
    offsetAt(y) {
        if (!Number.isInteger(y) || y < 0) {
            throw new RangeError('[WaterShader] offsetAt requires a non-negative integer row.');
        }
        this._ensureOffsetTable(y + 1);
        return this._offsetTable[y] | 0;
    }

    /**
     * Lerps a source color's RGB toward a tint color and returns the result
     * with alpha forced to 255. Results are cached by source color because
     * terrain palettes are small; the per-cell alpha byte is applied later.
     * @param {number} src Source packed color.
     * @param {Map<number, number>} cache Cache for this channel role.
     * @param {number} tint Packed tint color.
     * @param {number} strength Blend factor 0..1.
     * @returns {number} Tinted packed color with alpha 255.
     * @private
     */
    _tintRGB(src, cache, tint, strength) {
        const cached = cache.get(src);
        if (cached !== undefined) return cached;

        const s = unpackRGBA(src);
        const t = unpackRGBA(tint);
        const inv = 1 - strength;
        const r = Math.round(s.r * inv + t.r * strength);
        const g = Math.round(s.g * inv + t.g * strength);
        const b = Math.round(s.b * inv + t.b * strength);
        const out = packRGBA(r, g, b, 0xFF);

        /* Flush rather than grow unbounded if colors are highly dynamic. */
        if (cache.size >= MAX_TINT_CACHE_ENTRIES) {
            cache.clear();
            this._metrics.cacheFlushes += 1;
        }
        cache.set(src, out);
        return out;
    }

    /**
     * Packs an author-facing color string via the engine's canonical parser.
     * @param {string} color Hex / rgb() / rgba() color.
     * @returns {number} Packed RGBA.
     * @private
     */
    _packConfigColor(color) {
        return ASCIIBuffer.packColor(color, this._waterBgPacked ?? 0x071624FF);
    }

    /* ══════════════════════════════════════════════════════════════════
       METRICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll at
     * HUD rate, not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            time: this._time,
            frequency: this._frequency,
            speed: this._speed,
            amplitude: this._amplitude,
            secondaryWave: this._secondary !== null,
            opacity: this._opacity,
            depthFade: this._depthFade,
            waterGlyphs: [...this._waterCodes],
            hasMask: this._waterMask !== null,
            framesRendered: this._metrics.framesRendered,
            cellsReflected: this._metrics.cellsReflected,
            cacheFlushes: this._metrics.cacheFlushes,
            fgCacheSize: this._fgCache.size,
            bgCacheSize: this._bgCache.size
        };
    }

    /**
     * Resets the shader clock and clears all caches without changing the
     * configured wave, tint, or detection settings.
     * @returns {this}
     */
    reset() {
        this._time = 0;
        this._fgCache.clear();
        this._bgCache.clear();
        this._offsetTableTime = Number.NaN;
        return this;
    }

    /**
     * Releases caches and mask references for clean teardown and test
     * isolation. The shader must not be reused after destroy().
     * @returns {void}
     */
    destroy() {
        this._fgCache.clear();
        this._bgCache.clear();
        this._waterMask = null;
        this._offsetTable = null;
    }
}

export default WaterShader;