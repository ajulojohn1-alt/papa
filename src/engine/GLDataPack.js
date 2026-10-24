/**
 * @file src/engine/GLDataPack.js
 * @module engine/GLDataPack
 *
 * @description
 * Pure typed-array packers bridging the ASCIIBuffer virtual grid onto the
 * GPU data textures consumed by engine/Engine.js.
 *
 * Every function here is allocation-free (callers own the destination
 * buffers), side-effect-free on the source buffer, and completely
 * DOM-free — the Node validation harness exercises the exact byte layout
 * the browser uploads, so a packing regression cannot ship.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TEXTURE FORMATS
 * ───────────────────────────────────────────────────────────────────────────
 * The grid uploads as three parallel RGBA8 textures of cols×rows texels —
 * one texel per virtual cell:
 *
 *   uChars  .r = slot & 0xFF        glyph atlas slot, low byte
 *           .g = slot >> 8          glyph atlas slot, high byte
 *           .b = 255 when water     per-cell water flag (ripple pass)
 *           .a = 255                (reserved, must stay opaque)
 *
 *   uFg     .rgb = foreground       cell foreground color
 *   uBg     .rgb = background       cell background color
 *          (alpha byte carries the packed alpha; the shader treats 0 as
 *           "fall back to the void color")
 *
 * Slot width is 16 bits (two byte channels) because the atlas can grow to
 * 64×64 = 4096 slots, far beyond one byte. Byte order is little-endian
 * across the .r/.g channels to mirror `(slot & 0xFF) | (slot << 8)` integer
 * packing, so the shader recombines with `r + g * 256.0` and no swizzling
 * surprises.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLOR BYTE ORDER
 * ───────────────────────────────────────────────────────────────────────────
 * ASCIIBuffer packs colors as 32-bit `(r << 24) | (g << 16) | (b << 8) | a`
 * (see ASCIIBuffer.packColor). These packers decompose that integer into a
 * Uint8Array RGBA quad — the natural WebGL UNSIGNED_BYTE texel order —
 * without intermediate object allocation (no unpackColor() per cell).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WATER FLAGS
 * ───────────────────────────────────────────────────────────────────────────
 * The CPU WaterShader mirrors shore content into water cells, but the GPU
 * ripple pass needs to know WHICH cells are water without re-deriving the
 * glyph set in GLSL. The active WaterShader's water-glyph vocabulary is
 * snapshotted into a Set of code points (WaterShader.getMetrics()
 * .waterGlyphs) and stamped into the .b channel during char packing, so
 * the flag updates automatically if a world reconfigures its water glyphs.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * GL DATA PACK
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Byte-stride namespace for the RGBA8 texel layout (4 bytes per texel).
 * Exposed for tests and for the Engine's buffer sizing arithmetic.
 */
export const TEXEL_STRIDE = 4;

/* ══════════════════════════════════════════════════════════════════════════
 * CHAR PLANE
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Packs the buffer's glyph plane into the uChars texture bytes.
 *
 * @param {ASCIIBuffer} buffer Source virtual grid.
 * @param {Object} atlas FontAtlas-like mapping (`slotFor(code) → number`).
 * @param {Uint8Array} out Destination, length ≥ cellCount × 4.
 * @param {?Set<number>} [waterCodes=null] Code points that mark water
 *   cells; matching cells flag the ripple pass in the .b channel.
 * @returns {{packed: number, waterCells: number, blankCells: number}}
 *   Diagnostics (packed = total cells visited).
 */
export function packCharPlane(buffer, atlas, out, waterCodes = null) {
    if (!buffer || !buffer.charCodes) {
        throw new TypeError('[GLDataPack] buffer must expose charCodes.');
    }
    if (typeof atlas.slotFor !== 'function') {
        throw new TypeError('[GLDataPack] atlas must expose slotFor().');
    }
    if (!(out instanceof Uint8Array) || out.length < buffer.cellCount * TEXEL_STRIDE) {
        throw new RangeError('[GLDataPack] out must be Uint8Array of cellCount × 4.');
    }

    const chars = buffer.charCodes;
    const count = buffer.cellCount;
    const slotFor = atlas.slotFor.bind(atlas);

    let waterCells = 0;
    let blankCells = 0;

    for (let i = 0, o = 0; i < count; i += 1, o += TEXEL_STRIDE) {
        const code = chars[i];
        const slot = slotFor(code);

        out[o] = slot & 0xFF;
        out[o + 1] = (slot >>> 8) & 0xFF;

        const isWater = waterCodes !== null && slot !== 0 && waterCodes.has(code);
        out[o + 2] = isWater ? 255 : 0;
        out[o + 3] = 255;

        if (isWater) waterCells += 1;
        if (slot === 0) blankCells += 1;
    }

    return { packed: count, waterCells, blankCells };
}

/* ══════════════════════════════════════════════════════════════════════════
 * COLOR PLANES
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Packs one packed-Uint32 color plane into RGBA8 texture bytes.
 *
 * @param {Uint32Array} src Source plane (foregroundColors or
 *   backgroundColors), length = cellCount.
 * @param {Uint8Array} out Destination, length ≥ cellCount × 4.
 * @returns {number} Cells packed.
 */
export function packColorPlane(src, out) {
    if (!(src instanceof Uint32Array)) {
        throw new TypeError('[GLDataPack] src must be a Uint32Array color plane.');
    }
    if (!(out instanceof Uint8Array) || out.length < src.length * TEXEL_STRIDE) {
        throw new RangeError('[GLDataPack] out must be Uint8Array of cellCount × 4.');
    }

    const count = src.length;

    for (let i = 0, o = 0; i < count; i += 1, o += TEXEL_STRIDE) {
        const packed = src[i];

        out[o] = (packed >>> 24) & 0xFF;         /* r */
        out[o + 1] = (packed >>> 16) & 0xFF;     /* g */
        out[o + 2] = (packed >>> 8) & 0xFF;      /* b */
        out[o + 3] = packed & 0xFF;              /* a */
    }

    return count;
}

/* ══════════════════════════════════════════════════════════════════════════
 * GLYPH VOCABULARY SCAN
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fills `out` with every distinct non-blank code point in the buffer.
 *
 * Used once per frame by the presenter to keep the FontAtlas warm; the
 * scan is a single linear pass and the Set is caller-owned so steady-state
 * frames with an unchanged vocabulary allocate nothing.
 *
 * @param {ASCIIBuffer} buffer Source virtual grid.
 * @param {Set<number>} out Destination set (cleared first).
 * @returns {number} Distinct glyph count.
 */
export function collectGlyphVocabulary(buffer, out) {
    if (!buffer || !buffer.charCodes) {
        throw new TypeError('[GLDataPack] buffer must expose charCodes.');
    }
    if (!(out instanceof Set)) {
        throw new TypeError('[GLDataPack] out must be a Set.');
    }

    out.clear();
    const chars = buffer.charCodes;

    for (let i = 0; i < chars.length; i += 1) {
        const code = chars[i];
        if (code !== 0 && code !== 0x20) out.add(code);
    }

    return out.size;
}

/* ══════════════════════════════════════════════════════════════════════════
 * GLSL SLOT DECODING REFERENCE
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Recombines a texel's .r/.g channels into a slot index — the CPU mirror
 * of the shader's `slot = r + g * 256.0` decode. Used by the validation
 * harness to prove the round trip byte-for-byte.
 *
 * @param {number} r Low byte channel value (0-255).
 * @param {number} g High byte channel value (0-255).
 * @returns {number} Slot index (0-65535).
 */
export function decodeSlot(r, g) {
    return ((r & 0xFF) | ((g & 0xFF) << 8)) >>> 0;
}
