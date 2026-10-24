/**
 * @file src/engine/ASCIIBuffer.js
 * @module engine/ASCIIBuffer
 *
 * @description
 * Virtual 2D character-grid surface for "YUCCA".
 *
 * ASCIIBuffer is the authoritative simulation-side text surface. All world,
 * combat, weather, water, UI, and transition systems write glyphs and color
 * into this buffer. The Renderer then reads only the cells that changed and
 * blits them to the HTML5 canvas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MEMORY LAYOUT
 * ───────────────────────────────────────────────────────────────────────────
 * The buffer uses a structure-of-arrays layout instead of an array-of-objects.
 * For a grid of C columns and R rows:
 *
 *   cellCount = C * R
 *   index(x, y) = y * C + x
 *   x(index) = index % C
 *   y(index) = (index / C) | 0
 *
 * Stored arrays:
 *
 *   _charBack     Uint32Array  Current working glyph code points.
 *   _fgBack       Uint32Array  Current working foreground RGBA colors.
 *   _bgBack       Uint32Array  Current working background RGBA colors.
 *
 *   _charFront    Uint32Array  Last-committed glyph state.
 *   _fgFront      Uint32Array  Last-committed foreground state.
 *   _bgFront      Uint32Array  Last-committed background state.
 *
 *   _dirtyFlags   Uint8Array   Candidate dirty markers for sparse changes.
 *
 * Unicode glyphs are stored as numeric code points in Uint32Array because
 * typed arrays cannot store JS strings. This also makes equality comparison,
 * copying, and filling extremely cheap.
 *
 * Colors are stored as packed 32-bit RGBA integers:
 *
 *   packed = (r << 24) | (g << 16) | (b << 8) | a
 *
 * Example:
 *   opaque orange #FF7700 -> 0xFF7700FF
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DOUBLE BUFFERING / DIRTY TRACKING
 * ───────────────────────────────────────────────────────────────────────────
 * The back buffer is mutable. The front buffer represents the state that was
 * last committed for presentation. Mutations do not draw anything; they only
 * update the back buffer and record potential dirty cells.
 *
 * commit() resolves the dirty set by comparing back against front:
 *
 *   1. Sparse mutations are stored in a candidate list.
 *   2. Duplicate candidates are filtered with _dirtyFlags.
 *   3. If a candidate's final back state equals the front state, it is
 *      discarded. This means a cell changed five times and restored to its
 *      original value produces zero canvas redraws.
 *   4. If too many candidates accumulate, the buffer switches to a full-scan
 *      commit for that frame to avoid unbounded candidate-list growth.
 *   5. Every truly changed cell is copied from back to front and returned to
 *      the caller as a dirty index list plus a conservative dirty rectangle.
 *
 * This allows the Renderer to issue draw calls only for changed cells, which
 * is essential for maintaining high frame rates when the ASCII viewport is
 * large and only a small portion changes per tick.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** Minimum permitted grid dimension. */
const MIN_DIMENSION = 1;

/**
 * Maximum permitted grid dimension. This is a sanity guard against accidental
 * pixel-to-cell conversion errors such as treating CSS pixels as cells.
 * @type {number}
 */
const MAX_DIMENSION = 16384;

/**
 * Maximum total cell count. At 1,048,576 cells the seven typed arrays used
 * by this class consume roughly 25 MB, which is safe for desktop and modern
 * mobile browsers while still vastly exceeding any sane ASCII viewport.
 * @type {number}
 */
const MAX_CELL_COUNT = 1_048_576;

/** Default grid width in columns. */
const DEFAULT_COLUMNS = 120;

/** Default grid height in rows. */
const DEFAULT_ROWS = 60;

/** Default glyph used by clear() and uninitialized cells. */
const DEFAULT_CHAR = ' ';

/** Default opaque white foreground, packed RGBA. */
const DEFAULT_FOREGROUND = 0xFFFFFFFF;

/** Default opaque black background, packed RGBA. */
const DEFAULT_BACKGROUND = 0x000000FF;

/* ══════════════════════════════════════════════════════════════════════════
 * COLOR HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clamps and rounds a numeric channel to a valid 0..255 byte.
 * @param {number} value Raw channel value.
 * @returns {number} Integer in [0, 255].
 */
function clampByte(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Packs RGBA bytes into the buffer's canonical unsigned 32-bit color format.
 * @param {number} r Red channel, 0..255.
 * @param {number} g Green channel, 0..255.
 * @param {number} b Blue channel, 0..255.
 * @param {number} [a=255] Alpha channel, 0..255.
 * @returns {number} Unsigned packed RGBA integer.
 */
function packRGBA(r, g, b, a = 255) {
    return (
        ((clampByte(r) & 0xFF) << 24) |
        ((clampByte(g) & 0xFF) << 16) |
        ((clampByte(b) & 0xFF) << 8) |
        (clampByte(a) & 0xFF)
    ) >>> 0;
}

/**
 * Common named colors used by ASCII palettes, weather tints, and debug views.
 * This intentionally avoids a full CSS named-color table; hex, rgb(), rgba(),
 * hsl(), and hsla() are supported for arbitrary colors.
 */
const NAMED_COLORS = Object.freeze({
    black: packRGBA(0, 0, 0),
    white: packRGBA(255, 255, 255),
    red: packRGBA(255, 0, 0),
    orange: packRGBA(255, 119, 0),
    yellow: packRGBA(255, 255, 0),
    lime: packRGBA(0, 255, 0),
    green: packRGBA(0, 128, 0),
    cyan: packRGBA(0, 255, 255),
    teal: packRGBA(0, 128, 128),
    blue: packRGBA(0, 128, 255),
    navy: packRGBA(0, 0, 128),
    magenta: packRGBA(255, 0, 255),
    purple: packRGBA(128, 0, 128),
    pink: packRGBA(255, 192, 203),
    brown: packRGBA(139, 69, 19),
    gray: packRGBA(128, 128, 128),
    grey: packRGBA(128, 128, 128),
    darkgray: packRGBA(64, 64, 64),
    darkgrey: packRGBA(64, 64, 64),
    lightgray: packRGBA(192, 192, 192),
    lightgrey: packRGBA(192, 192, 192),
    silver: packRGBA(192, 192, 192),
    transparent: 0x00000000
});

/**
 * Parses a hexadecimal color string.
 *
 * Supported forms:
 *   #RGB
 *   #RGBA
 *   #RRGGBB
 *   #RRGGBBAA
 *
 * @param {string} source Normalized lowercase color string beginning with '#'.
 * @returns {number} Packed RGBA integer.
 * @throws {RangeError} If the hex string is malformed.
 */
function parseHexColor(source) {
    const hex = source.slice(1);

    const valid =
        /^[0-9a-f]{3}$/i.test(hex) ||
        /^[0-9a-f]{4}$/i.test(hex) ||
        /^[0-9a-f]{6}$/i.test(hex) ||
        /^[0-9a-f]{8}$/i.test(hex);

    if (!valid) {
        throw new RangeError(`[ASCIIBuffer] Invalid hex color: ${source}`);
    }

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 255;

    if (hex.length === 3 || hex.length === 4) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);

        if (hex.length === 4) {
            a = parseInt(hex[3] + hex[3], 16);
        }
    } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);

        if (hex.length === 8) {
            a = parseInt(hex.slice(6, 8), 16);
        }
    }

    return packRGBA(r, g, b, a);
}

/**
 * Extracts the interior of a CSS functional color such as rgb(...) or hsl(...).
 * @param {string} source Normalized lowercase color string.
 * @returns {string} Function interior.
 * @throws {RangeError} If the function syntax is malformed.
 */
function extractFunctionalColorBody(source) {
    const match = /^(?:rgba?|hsla?)\((.*)\)$/.exec(source);
    if (!match) {
        throw new RangeError(`[ASCIIBuffer] Invalid functional color: ${source}`);
    }
    return match[1].trim();
}

/**
 * Splits functional color components, supporting both comma syntax and
 * modern space syntax with an optional '/' alpha separator.
 *
 * Examples:
 *   "255, 119, 0, 0.8"
 *   "255 119 0 / 0.8"
 *
 * @param {string} body Interior of the CSS function.
 * @returns {{parts: string[], alpha: ?string}} Channel tokens and alpha token.
 */
function splitFunctionalColorComponents(body) {
    let alpha = null;
    let componentPart = body;

    const slashIndex = body.indexOf('/');
    if (slashIndex !== -1) {
        alpha = body.slice(slashIndex + 1).trim();
        componentPart = body.slice(0, slashIndex).trim();
    }

    let parts;
    if (componentPart.includes(',')) {
        parts = componentPart
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    } else {
        parts = componentPart
            .split(/\s+/)
            .filter((part) => part.length > 0);
    }

    /* Legacy rgba(255, 119, 0, 0.8) syntax without '/'. */
    if (alpha === null && parts.length === 4) {
        alpha = parts[3];
        parts = parts.slice(0, 3);
    }

    return { parts, alpha };
}

/**
 * Parses a 0..255 RGB channel token. Percentage tokens are interpreted as
 * percentages of 255, matching CSS color syntax.
 * @param {string} token Channel token.
 * @returns {number} Byte value in [0, 255].
 * @throws {RangeError} If the token is not numeric.
 */
function parseColorChannel(token) {
    const normalized = String(token).trim().toLowerCase();

    if (normalized.endsWith('%')) {
        const percent = parseFloat(normalized);
        if (!Number.isFinite(percent)) {
            throw new RangeError(`[ASCIIBuffer] Invalid color channel: ${token}`);
        }
        return clampByte(percent * 2.55);
    }

    const value = parseFloat(normalized);
    if (!Number.isFinite(value)) {
        throw new RangeError(`[ASCIIBuffer] Invalid color channel: ${token}`);
    }

    return clampByte(value);
}

/**
 * Parses an alpha token. CSS alpha is normally 0..1 or a percentage, but this
 * helper also tolerates accidental 0..255 input by passing values greater
 * than 1 directly into byte clamping.
 * @param {?string} token Alpha token, or null when omitted.
 * @returns {number} Alpha byte in [0, 255].
 * @throws {RangeError} If a non-empty alpha token is not numeric.
 */
function parseAlphaChannel(token) {
    if (token === null || token === undefined) return 255;

    const normalized = String(token).trim().toLowerCase();
    if (normalized.length === 0) return 255;

    if (normalized.endsWith('%')) {
        const percent = parseFloat(normalized);
        if (!Number.isFinite(percent)) {
            throw new RangeError(`[ASCIIBuffer] Invalid alpha channel: ${token}`);
        }
        return clampByte(percent * 2.55);
    }

    const numeric = parseFloat(normalized);
    if (!Number.isFinite(numeric)) {
        throw new RangeError(`[ASCIIBuffer] Invalid alpha channel: ${token}`);
    }

    if (numeric > 1) return clampByte(numeric);
    return clampByte(numeric * 255);
}

/**
 * Parses rgb()/rgba() color strings.
 * @param {string} source Normalized lowercase color string.
 * @returns {number} Packed RGBA integer.
 */
function parseRgbColor(source) {
    const body = extractFunctionalColorBody(source);
    const { parts, alpha } = splitFunctionalColorComponents(body);

    if (parts.length !== 3) {
        throw new RangeError(`[ASCIIBuffer] Invalid rgb color: ${source}`);
    }

    return packRGBA(
        parseColorChannel(parts[0]),
        parseColorChannel(parts[1]),
        parseColorChannel(parts[2]),
        parseAlphaChannel(alpha)
    );
}

/**
 * Parses a hue token. Supports unitless degrees as well as deg, rad, grad,
 * and turn suffixes.
 * @param {string} token Hue token.
 * @returns {number} Hue normalized to [0, 360).
 * @throws {RangeError} If the hue token is not numeric.
 */
function parseHue(token) {
    let normalized = String(token).trim().toLowerCase();
    let factor = 1;

    if (normalized.endsWith('deg')) {
        normalized = normalized.slice(0, -3);
    } else if (normalized.endsWith('rad')) {
        factor = 180 / Math.PI;
        normalized = normalized.slice(0, -3);
    } else if (normalized.endsWith('grad')) {
        factor = 0.9;
        normalized = normalized.slice(0, -4);
    } else if (normalized.endsWith('turn')) {
        factor = 360;
        normalized = normalized.slice(0, -4);
    }

    const numeric = parseFloat(normalized);
    if (!Number.isFinite(numeric)) {
        throw new RangeError(`[ASCIIBuffer] Invalid hue: ${token}`);
    }

    let degrees = numeric * factor;
    degrees %= 360;
    if (degrees < 0) degrees += 360;
    return degrees;
}

/**
 * Parses saturation/lightness tokens. Accepts CSS percentages as well as
 * bare 0..1 fractions. Bare values greater than 1 are treated as percentages
 * for authoring convenience, e.g. "50" becomes 0.5.
 * @param {string} token Saturation or lightness token.
 * @returns {number} Unit value in [0, 1].
 * @throws {RangeError} If the token is not numeric.
 */
function parseUnitOrPercent(token) {
    const normalized = String(token).trim().toLowerCase();
    const numeric = parseFloat(normalized);

    if (!Number.isFinite(numeric)) {
        throw new RangeError(`[ASCIIBuffer] Invalid percentage: ${token}`);
    }

    let unit;
    if (normalized.endsWith('%')) {
        unit = numeric / 100;
    } else if (numeric > 1) {
        unit = numeric / 100;
    } else {
        unit = numeric;
    }

    return Math.max(0, Math.min(1, unit));
}

/**
 * Converts one hue segment during HSL to RGB conversion.
 * @param {number} p Intermediate value.
 * @param {number} q Intermediate value.
 * @param {number} t Hue offset.
 * @returns {number} Channel value in [0, 1].
 */
function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;

    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

    return p;
}

/**
 * Converts HSL values to RGB bytes.
 * @param {number} hue Hue in degrees, [0, 360).
 * @param {number} saturation Saturation, [0, 1].
 * @param {number} lightness Lightness, [0, 1].
 * @returns {[number, number, number]} RGB channels in [0, 255].
 */
function hslToRgb(hue, saturation, lightness) {
    const h = hue / 360;

    if (saturation === 0) {
        const gray = lightness * 255;
        return [gray, gray, gray];
    }

    const q = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - (lightness * saturation);

    const p = (2 * lightness) - q;

    return [
        hueToRgb(p, q, h + 1 / 3) * 255,
        hueToRgb(p, q, h) * 255,
        hueToRgb(p, q, h - 1 / 3) * 255
    ];
}

/**
 * Parses hsl()/hsla() color strings.
 * @param {string} source Normalized lowercase color string.
 * @returns {number} Packed RGBA integer.
 */
function parseHslColor(source) {
    const body = extractFunctionalColorBody(source);
    const { parts, alpha } = splitFunctionalColorComponents(body);

    if (parts.length !== 3) {
        throw new RangeError(`[ASCIIBuffer] Invalid hsl color: ${source}`);
    }

    const hue = parseHue(parts[0]);
    const saturation = parseUnitOrPercent(parts[1]);
    const lightness = parseUnitOrPercent(parts[2]);

    const [r, g, b] = hslToRgb(hue, saturation, lightness);

    return packRGBA(r, g, b, parseAlphaChannel(alpha));
}

/* ══════════════════════════════════════════════════════════════════════════
 * VALIDATION HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Validates a grid dimension.
 * @param {number} value Candidate dimension.
 * @param {string} name Human-readable parameter name for errors.
 * @throws {RangeError} If the dimension is invalid.
 */
function validateDimension(value, name) {
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
        throw new RangeError(
            `[ASCIIBuffer] ${name} must be an integer between ` +
            `${MIN_DIMENSION} and ${MAX_DIMENSION}; received ${value}.`
        );
    }
}

/**
 * Validates total cell count after width/height multiplication.
 * @param {number} cellCount Candidate total cell count.
 * @throws {RangeError} If the total exceeds the supported memory ceiling.
 */
function validateCellCount(cellCount) {
    if (!Number.isFinite(cellCount) || cellCount > MAX_CELL_COUNT) {
        throw new RangeError(
            `[ASCIIBuffer] Grid size ${cellCount} exceeds maximum supported ` +
            `cell count ${MAX_CELL_COUNT}.`
        );
    }
}

/* ══════════════════════════════════════════════════════════════════════════
 * ASCII BUFFER
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Virtual ASCII frame buffer with independent glyph, foreground, background,
 * and dirty-tracking storage.
 */
export class ASCIIBuffer {
    /**
     * Creates a new ASCII buffer.
     *
     * @param {Object} [options]
     * @param {number} [options.cols=120]
     *   Grid width in columns. Alias: options.columns.
     * @param {number} [options.rows=60]
     *   Grid height in rows.
     * @param {string|number} [options.defaultChar=' ']
     *   Default glyph used by clear() and empty fills.
     * @param {string|number} [options.defaultFg='#ffffff']
     *   Default foreground color.
     * @param {string|number} [options.defaultBg='#000000']
     *   Default background color.
     * @throws {TypeError} If options is not an object.
     * @throws {RangeError} If dimensions or defaults are invalid.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[ASCIIBuffer] options must be an object.');
        }

        const cols = options.cols ?? options.columns ?? DEFAULT_COLUMNS;
        const rows = options.rows ?? DEFAULT_ROWS;

        validateDimension(cols, 'cols');
        validateDimension(rows, 'rows');

        /** @type {number} Grid width in columns. */
        this._cols = cols;

        /** @type {number} Grid height in rows. */
        this._rows = rows;

        /** @type {number} Total number of cells. */
        this._cellCount = cols * rows;

        validateCellCount(this._cellCount);

        /** @type {number} Default glyph code point. */
        this._defaultCharCode = ASCIIBuffer.charToCodePoint(
            options.defaultChar ?? DEFAULT_CHAR,
            32
        );

        /** @type {number} Default foreground packed RGBA. */
        this._defaultFg = ASCIIBuffer.packColor(
            options.defaultFg ?? DEFAULT_FOREGROUND,
            DEFAULT_FOREGROUND
        );

        /** @type {number} Default background packed RGBA. */
        this._defaultBg = ASCIIBuffer.packColor(
            options.defaultBg ?? DEFAULT_BACKGROUND,
            DEFAULT_BACKGROUND
        );

        this._allocateArrays();
        this._resetToDefaults();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * STATIC CONSTRUCTION HELPERS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Creates a buffer sized from a pixel viewport and ASCII cell metrics.
     *
     * This is the preferred constructor for Renderer-driven dynamic resizing:
     *
     *   cols = floor(viewportWidth / cellWidth)
     *   rows = floor(viewportHeight / cellHeight)
     *
     * @param {Object} spec
     * @param {number} spec.viewportWidth CSS pixel viewport width.
     * @param {number} spec.viewportHeight CSS pixel viewport height.
     * @param {number} spec.cellWidth Monospaced cell width in CSS pixels.
     * @param {number} spec.cellHeight Monospaced cell height in CSS pixels.
     * @param {Object} [spec.options] Additional ASCIIBuffer constructor options.
     * @returns {ASCIIBuffer} Newly sized buffer.
     * @throws {RangeError} If viewport or cell metrics are invalid.
     */
    static fromViewport({
        viewportWidth,
        viewportHeight,
        cellWidth,
        cellHeight,
        options = {}
    }) {
        const checks = [viewportWidth, viewportHeight, cellWidth, cellHeight];

        for (const value of checks) {
            if (!Number.isFinite(value) || value <= 0) {
                throw new RangeError(
                    '[ASCIIBuffer] fromViewport requires positive finite metrics.'
                );
            }
        }

        const cols = Math.max(1, Math.floor(viewportWidth / cellWidth));
        const rows = Math.max(1, Math.floor(viewportHeight / cellHeight));

        return new ASCIIBuffer({
            ...options,
            cols,
            rows
        });
    }

    /**
     * Converts a glyph input to a safe Unicode code point.
     *
     * Control characters below U+0020 and DEL U+007F are replaced with the
     * fallback glyph because they either do not render usefully in a
     * monospaced canvas pipeline or can interfere with line-based debug
     * exports.
     *
     * @param {string|number|null|undefined} char
     *   Single-character string, code point number, or null/undefined.
     * @param {number} [fallback=32]
     *   Code point used when the input is empty or non-printable.
     * @returns {number} Valid Unicode code point.
     * @throws {TypeError} If char is not string, number, null, or undefined.
     * @throws {RangeError} If a numeric code point is outside Unicode range.
     */
    static charToCodePoint(char, fallback = 32) {
        let codePoint;

        if (char === null || char === undefined) {
            codePoint = fallback;
        } else if (typeof char === 'number') {
            codePoint = Math.trunc(char);
        } else if (typeof char === 'string') {
            if (char.length === 0) {
                codePoint = fallback;
            } else {
                codePoint = char.codePointAt(0);
            }
        } else {
            throw new TypeError(
                '[ASCIIBuffer] char must be a string, number, null, or undefined.'
            );
        }

        if (
            !Number.isInteger(codePoint) ||
            codePoint < 0 ||
            codePoint > 0x10FFFF
        ) {
            throw new RangeError(
                `[ASCIIBuffer] Invalid Unicode code point: ${char}`
            );
        }

        /* Replace C0 control characters and DEL with fallback. */
        if (codePoint < 32 || codePoint === 0x7F) {
            return fallback;
        }

        return codePoint;
    }

    /**
     * Converts a color input into the packed RGBA integer used internally.
     *
     * Supported inputs:
     *   - packed RGBA number
     *   - '#RGB', '#RGBA', '#RRGGBB', '#RRGGBBAA'
     *   - 'rgb(...)', 'rgba(...)'
     *   - 'hsl(...)', 'hsla(...)'
     *   - common named colors
     *   - 'transparent'
     *   - null/undefined -> fallback
     *
     * @param {*} color Candidate color.
     * @param {number} [fallback=DEFAULT_FOREGROUND]
     *   Packed color returned when color is null/undefined.
     * @returns {number} Packed RGBA integer.
     * @throws {TypeError} If color is an unsupported type.
     * @throws {RangeError} If color syntax is invalid.
     */
    static packColor(color, fallback = DEFAULT_FOREGROUND) {
        if (color === null || color === undefined) {
            return fallback >>> 0;
        }

        if (typeof color === 'number') {
            return Math.trunc(color) >>> 0;
        }

        if (typeof color !== 'string') {
            throw new TypeError(
                '[ASCIIBuffer] color must be a number, string, null, or undefined.'
            );
        }

        const normalized = color.trim().toLowerCase();

        if (normalized === 'transparent') return 0x00000000;

        if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, normalized)) {
            return NAMED_COLORS[normalized];
        }

        if (normalized.startsWith('#')) {
            return parseHexColor(normalized);
        }

        if (normalized.startsWith('rgb')) {
            return parseRgbColor(normalized);
        }

        if (normalized.startsWith('hsl')) {
            return parseHslColor(normalized);
        }

        throw new RangeError(`[ASCIIBuffer] Unsupported color format: ${color}`);
    }

    /**
     * Unpacks a packed RGBA integer into discrete byte channels.
     * @param {number} packed Packed RGBA integer.
     * @returns {{r: number, g: number, b: number, a: number}}
     */
    static unpackColor(packed) {
        const value = packed >>> 0;

        return {
            r: (value >>> 24) & 0xFF,
            g: (value >>> 16) & 0xFF,
            b: (value >>> 8) & 0xFF,
            a: value & 0xFF
        };
    }

    /**
     * Converts a packed RGBA integer into a CSS color string.
     * @param {number} packed Packed RGBA integer.
     * @returns {string} CSS rgb()/rgba() string.
     */
    static colorToCSS(packed) {
        const { r, g, b, a } = ASCIIBuffer.unpackColor(packed);

        if (a === 255) {
            return `rgb(${r},${g},${b})`;
        }

        return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PUBLIC READ-ONLY PROPERTIES
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {number} Grid width in columns. */
    get cols() {
        return this._cols;
    }

    /** @returns {number} Grid width in columns. Alias for cols. */
    get columns() {
        return this._cols;
    }

    /** @returns {number} Grid height in rows. */
    get rows() {
        return this._rows;
    }

    /** @returns {number} Total number of cells. */
    get cellCount() {
        return this._cellCount;
    }

    /** @returns {number} Default glyph code point. */
    get defaultCharCode() {
        return this._defaultCharCode;
    }

    /** @returns {string} Default glyph as a string. */
    get defaultChar() {
        return String.fromCodePoint(this._defaultCharCode);
    }

    /** @returns {number} Default foreground packed RGBA. */
    get defaultFg() {
        return this._defaultFg;
    }

    /** @returns {number} Default background packed RGBA. */
    get defaultBg() {
        return this._defaultBg;
    }

    /** @returns {string} Default foreground as CSS color. */
    get defaultFgCSS() {
        return ASCIIBuffer.colorToCSS(this._defaultFg);
    }

    /** @returns {string} Default background as CSS color. */
    get defaultBgCSS() {
        return ASCIIBuffer.colorToCSS(this._defaultBg);
    }

    /**
     * Conservative dirty-state query.
     *
     * This can return true even when a later commit() resolves all candidate
     * cells as unchanged. It is intended for cheap frame-skip checks, not as
     * an exact dirty-cell count.
     *
     * @returns {boolean} True if a commit may produce dirty cells.
     */
    get isDirty() {
        return this._fullDirty || this._dirtyIndices.length > 0;
    }

    /**
     * Direct read access to current working glyph code points.
     *
     * WARNING: Treat as read-only. Mutating this array bypasses dirty
     * tracking and front/back synchronization.
     *
     * @returns {Uint32Array}
     */
    get charCodes() {
        return this._charBack;
    }

    /**
     * Direct read access to current working foreground colors.
     * @returns {Uint32Array}
     */
    get foregroundColors() {
        return this._fgBack;
    }

    /**
     * Direct read access to current working background colors.
     * @returns {Uint32Array}
     */
    get backgroundColors() {
        return this._bgBack;
    }

    /**
     * Dirty indices from the most recent commit().
     * @returns {number[]}
     */
    getDirtyCells() {
        return this._lastDirtyCells;
    }

    /**
     * Bounding rectangle of the most recent committed dirty set.
     * @returns {?{x: number, y: number, width: number, height: number}}
     */
    getDirtyRect() {
        return this._dirtyRect ? { ...this._dirtyRect } : null;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * COORDINATE MAPPING
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Tests whether integer coordinates fall inside the grid.
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @returns {boolean}
     */
    isValidCell(x, y) {
        return (
            Number.isInteger(x) &&
            Number.isInteger(y) &&
            x >= 0 &&
            y >= 0 &&
            x < this._cols &&
            y < this._rows
        );
    }

    /**
     * Converts 2D coordinates to the flat array index.
     *
     * Formula:
     *   index = y * cols + x
     *
     * This method does not validate bounds. Call isValidCell() first when the
     * coordinates come from untrusted or external systems.
     *
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @returns {number} Flat index.
     */
    cellIndex(x, y) {
        return (y * this._cols) + x;
    }

    /**
     * Converts a flat array index to a column coordinate.
     * @param {number} index Flat index.
     * @returns {number} Column index.
     */
    cellX(index) {
        return index % this._cols;
    }

    /**
     * Converts a flat array index to a row coordinate.
     * @param {number} index Flat index.
     * @returns {number} Row index.
     */
    cellY(index) {
        return (index / this._cols) | 0;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * BUFFER MANIPULATION API
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Clears the entire working back buffer to default glyph and colors.
     *
     * This does not immediately force a redraw. The next commit() resolves
     * which cells actually differ from the front buffer.
     *
     * @returns {this}
     */
    clear() {
        this._charBack.fill(this._defaultCharCode);
        this._fgBack.fill(this._defaultFg);
        this._bgBack.fill(this._defaultBg);

        /* A full clear may affect every cell, so use the full-scan path. */
        this._fullDirty = true;
        this._dirtyIndices.length = 0;
        this._dirtyFlags.fill(0);

        return this;
    }

    /**
     * Sets a single cell.
     *
     * Null/undefined arguments preserve the existing value for that component.
     * To explicitly write blank, pass ' ' for char. To explicitly reset color,
     * pass the buffer default color or a concrete color value.
     *
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @param {string|number|null} char Glyph or code point.
     * @param {string|number|null} [fgColor=null] Foreground color.
     * @param {string|number|null} [bgColor=null] Background color.
     * @returns {boolean} True if coordinates were inside the grid.
     */
    setChar(x, y, char, fgColor = null, bgColor = null) {
        const cx = Math.trunc(x);
        const cy = Math.trunc(y);

        if (!this.isValidCell(cx, cy)) {
            return false;
        }

        const index = this.cellIndex(cx, cy);

        const charCode = char === null || char === undefined
            ? this._charBack[index]
            : ASCIIBuffer.charToCodePoint(char, this._defaultCharCode);

        const fg = fgColor === null || fgColor === undefined
            ? this._fgBack[index]
            : ASCIIBuffer.packColor(fgColor, this._fgBack[index]);

        const bg = bgColor === null || bgColor === undefined
            ? this._bgBack[index]
            : ASCIIBuffer.packColor(bgColor, this._bgBack[index]);

        this._charBack[index] = charCode;
        this._fgBack[index] = fg;
        this._bgBack[index] = bg;

        const differsFromFront =
            this._charBack[index] !== this._charFront[index] ||
            this._fgBack[index] !== this._fgFront[index] ||
            this._bgBack[index] !== this._bgFront[index];

        if (differsFromFront) {
            this._markCandidate(index);
        } else {
            /* The final state matches the presented state, so any previous
             * candidate marker can be retired. The stale index may remain in
             * _dirtyIndices; commit() filters it using _dirtyFlags. */
            this._dirtyFlags[index] = 0;
        }

        return true;
    }

    /**
     * Gets the current glyph string at a coordinate.
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @returns {?string} Glyph string, or null if out of bounds.
     */
    getChar(x, y) {
        const cx = Math.trunc(x);
        const cy = Math.trunc(y);

        if (!this.isValidCell(cx, cy)) {
            return null;
        }

        const index = this.cellIndex(cx, cy);
        return String.fromCodePoint(this._charBack[index]);
    }

    /**
     * Gets the current glyph code point at a coordinate.
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @returns {number} Code point, or -1 if out of bounds.
     */
    getCharCode(x, y) {
        const cx = Math.trunc(x);
        const cy = Math.trunc(y);

        if (!this.isValidCell(cx, cy)) {
            return -1;
        }

        return this._charBack[this.cellIndex(cx, cy)];
    }

    /**
     * Gets a complete style snapshot for one cell.
     * @param {number} x Column index.
     * @param {number} y Row index.
     * @returns {?Object} Cell snapshot, or null if out of bounds.
     */
    getCellStyle(x, y) {
        const cx = Math.trunc(x);
        const cy = Math.trunc(y);

        if (!this.isValidCell(cx, cy)) {
            return null;
        }

        const index = this.cellIndex(cx, cy);
        const charCode = this._charBack[index];
        const fg = this._fgBack[index];
        const bg = this._bgBack[index];

        return {
            x: cx,
            y: cy,
            index,
            charCode,
            char: String.fromCodePoint(charCode),
            fg,
            bg,
            fgCSS: ASCIIBuffer.colorToCSS(fg),
            bgCSS: ASCIIBuffer.colorToCSS(bg)
        };
    }

    /**
     * Fills a rectangular region with one glyph and style.
     *
     * The input rectangle is clipped against the buffer bounds. Null colors
     * use buffer defaults rather than preserving existing per-cell colors.
     *
     * @param {number} x Left column.
     * @param {number} y Top row.
     * @param {number} width Region width in cells.
     * @param {number} height Region height in cells.
     * @param {string|number|null} char Fill glyph.
     * @param {string|number|null} [fgColor=null] Foreground color.
     * @param {string|number|null} [bgColor=null] Background color.
     * @returns {number} Number of cells filled after clipping.
     */
    fillRegion(x, y, width, height, char, fgColor = null, bgColor = null) {
        const clip = this._clipRegion(x, y, width, height);
        if (!clip) return 0;

        const charCode = char === null || char === undefined
            ? this._defaultCharCode
            : ASCIIBuffer.charToCodePoint(char, this._defaultCharCode);

        const fg = fgColor === null || fgColor === undefined
            ? this._defaultFg
            : ASCIIBuffer.packColor(fgColor, this._defaultFg);

        const bg = bgColor === null || bgColor === undefined
            ? this._defaultBg
            : ASCIIBuffer.packColor(bgColor, this._defaultBg);

        const { x0, y0, x1, y1, width: regionWidth } = clip;

        /* TypedArray.subarray().fill() is significantly faster than cell-by-
         * cell assignment for contiguous rows. */
        for (let yy = y0; yy < y1; yy += 1) {
            const start = this.cellIndex(x0, yy);
            const end = start + regionWidth;

            this._charBack.subarray(start, end).fill(charCode);
            this._fgBack.subarray(start, end).fill(fg);
            this._bgBack.subarray(start, end).fill(bg);
        }

        const area = clip.width * clip.height;
        const fullScanThreshold = Math.max(1024, this._cellCount >>> 2);

        if (this._fullDirty || area > fullScanThreshold) {
            this._fullDirty = true;
            this._dirtyIndices.length = 0;
        } else {
            for (let yy = y0; yy < y1; yy += 1) {
                const rowStart = this.cellIndex(x0, yy);
                for (let xx = 0; xx < regionWidth; xx += 1) {
                    this._markCandidate(rowStart + xx);
                }
            }
        }

        return area;
    }

    /**
     * Writes horizontal text starting at a coordinate. Newline characters
     * advance to the next row. Text is clipped against the buffer bounds.
     *
     * @param {number} x Starting column.
     * @param {number} y Starting row.
     * @param {string} text Text to write.
     * @param {string|number|null} [fgColor=null] Foreground color.
     * @param {string|number|null} [bgColor=null] Background color.
     * @returns {number} Number of cells actually written.
     */
    writeText(x, y, text, fgColor = null, bgColor = null) {
        if (typeof text !== 'string' || text.length === 0) {
            return 0;
        }

        let written = 0;
        const lines = text.split(/\r?\n/);
        const startX = Math.trunc(x);
        const startY = Math.trunc(y);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const row = startY + lineIndex;

            if (row < 0) continue;
            if (row >= this._rows) break;

            let cursorX = startX;

            for (const glyph of lines[lineIndex]) {
                if (cursorX >= this._cols) break;

                if (cursorX >= 0) {
                    if (this.setChar(cursorX, row, glyph, fgColor, bgColor)) {
                        written += 1;
                    }
                }

                cursorX += 1;
            }
        }

        return written;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DOUBLE BUFFERING / COMMIT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Resolves back/front differences and produces the dirty set.
     *
     * The returned cell indices are flat buffer indices. Convert them with
     * cellX(index) and cellY(index), or use forEachDirtyCell().
     *
     * @returns {{
     *   count: number,
     *   cells: number[],
     *   rect: ?{x: number, y: number, width: number, height: number}
     * }}
     *   Dirty cell list and bounding rectangle for the Renderer.
     */
    commit() {
        const cells = [];

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        /**
         * Expands the dirty bounding rectangle for one changed index.
         * @param {number} index Flat cell index.
         */
        const expandRect = (index) => {
            const x = index % this._cols;
            const y = (index / this._cols) | 0;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };

        /**
         * Copies one cell from back to front.
         * @param {number} index Flat cell index.
         */
        const syncCell = (index) => {
            this._charFront[index] = this._charBack[index];
            this._fgFront[index] = this._fgBack[index];
            this._bgFront[index] = this._bgBack[index];
        };

        /**
         * Tests whether one cell's back state differs from front state.
         * @param {number} index Flat cell index.
         * @returns {boolean}
         */
        const cellDiffers = (index) => (
            this._charBack[index] !== this._charFront[index] ||
            this._fgBack[index] !== this._fgFront[index] ||
            this._bgBack[index] !== this._bgFront[index]
        );

        if (this._fullDirty) {
            /* Full-scan commit path. Used by clear(), large fills, and
             * candidate overflow. This path is still change-aware: cells
             * whose final state matches the front buffer are not returned. */
            for (let index = 0; index < this._cellCount; index += 1) {
                if (cellDiffers(index)) {
                    syncCell(index);
                    cells.push(index);
                    expandRect(index);
                }
            }

            this._dirtyFlags.fill(0);
            this._dirtyIndices.length = 0;
            this._fullDirty = false;
        } else if (this._dirtyIndices.length > 0) {
            /* Sparse candidate path. Duplicates are filtered by clearing the
             * flag on first encounter. Stale candidates whose final state
             * matches front are discarded. */
            const candidates = this._dirtyIndices;

            for (let i = 0; i < candidates.length; i += 1) {
                const index = candidates[i];

                if (this._dirtyFlags[index] === 0) {
                    continue;
                }

                this._dirtyFlags[index] = 0;

                if (cellDiffers(index)) {
                    syncCell(index);
                    cells.push(index);
                    expandRect(index);
                }
            }

            candidates.length = 0;
        }

        const rect = cells.length > 0
            ? {
                x: minX,
                y: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            }
            : null;

        this._lastDirtyCells = cells;
        this._dirtyRect = rect;

        return {
            count: cells.length,
            cells,
            rect
        };
    }

    /**
     * Semantic alias for commit().
     *
     * In this implementation, presentation synchronization occurs during
     * commit because the front buffer exists to detect changes, not to hide
     * the back buffer from the Renderer.
     *
     * @returns {{
     *   count: number,
     *   cells: number[],
     *   rect: ?{x: number, y: number, width: number, height: number}
     * }}
     */
    present() {
        return this.commit();
    }

    /**
     * Immediately copies the entire back buffer into the front buffer and
     * clears all dirty tracking.
     *
     * Useful after teleports, world shifts, or renderer resizes where the
     * entire visible surface will be redrawn regardless of delta state.
     *
     * @returns {this}
     */
    forceSync() {
        this._charFront.set(this._charBack);
        this._fgFront.set(this._fgBack);
        this._bgFront.set(this._bgBack);
        this._clearDirtyState();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ITERATION & EXPORT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Iterates every cell in row-major order.
     *
     * Callback signature:
     *   (x, y, charCode, fgColor, bgColor, index) => void
     *
     * @param {Function} callback Iteration callback.
     * @returns {this}
     */
    forEachCell(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('[ASCIIBuffer] forEachCell requires a function.');
        }

        for (let y = 0; y < this._rows; y += 1) {
            let index = y * this._cols;

            for (let x = 0; x < this._cols; x += 1, index += 1) {
                callback(
                    x,
                    y,
                    this._charBack[index],
                    this._fgBack[index],
                    this._bgBack[index],
                    index
                );
            }
        }

        return this;
    }

    /**
     * Iterates cells whose glyph or style differs from the buffer defaults.
     *
     * This is useful for minimap/radar export and debug overlays where blank
     * cells are irrelevant.
     *
     * Callback signature:
     *   (x, y, charCode, fgColor, bgColor, index) => void
     *
     * @param {Function} callback Iteration callback.
     * @returns {this}
     */
    forEachActiveCell(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('[ASCIIBuffer] forEachActiveCell requires a function.');
        }

        for (let y = 0; y < this._rows; y += 1) {
            let index = y * this._cols;

            for (let x = 0; x < this._cols; x += 1, index += 1) {
                const charCode = this._charBack[index];
                const fg = this._fgBack[index];
                const bg = this._bgBack[index];

                const active =
                    charCode !== this._defaultCharCode ||
                    fg !== this._defaultFg ||
                    bg !== this._defaultBg;

                if (active) {
                    callback(x, y, charCode, fg, bg, index);
                }
            }
        }

        return this;
    }

    /**
     * Iterates a clipped rectangular region in row-major order.
     *
     * Callback signature:
     *   (x, y, charCode, fgColor, bgColor, index) => void
     *
     * @param {number} x Region left column.
     * @param {number} y Region top row.
     * @param {number} width Region width.
     * @param {number} height Region height.
     * @param {Function} callback Iteration callback.
     * @returns {this}
     */
    forEachCellInRegion(x, y, width, height, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError(
                '[ASCIIBuffer] forEachCellInRegion requires a function.'
            );
        }

        const clip = this._clipRegion(x, y, width, height);
        if (!clip) return this;

        const { x0, y0, x1, y1 } = clip;

        for (let yy = y0; yy < y1; yy += 1) {
            let index = this.cellIndex(x0, yy);

            for (let xx = x0; xx < x1; xx += 1, index += 1) {
                callback(
                    xx,
                    yy,
                    this._charBack[index],
                    this._fgBack[index],
                    this._bgBack[index],
                    index
                );
            }
        }

        return this;
    }

    /**
     * Iterates cells returned by the most recent commit().
     *
     * This method reads the CURRENT back buffer. If the buffer is mutated
     * after commit() and before iteration, the callback observes the mutated
     * values, not a historical snapshot.
     *
     * Callback signature:
     *   (x, y, charCode, fgColor, bgColor, index) => void
     *
     * @param {Function} callback Iteration callback.
     * @returns {this}
     */
    forEachDirtyCell(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('[ASCIIBuffer] forEachDirtyCell requires a function.');
        }

        for (let i = 0; i < this._lastDirtyCells.length; i += 1) {
            const index = this._lastDirtyCells[i];

            if (index < 0 || index >= this._cellCount) {
                continue;
            }

            const x = index % this._cols;
            const y = (index / this._cols) | 0;

            callback(
                x,
                y,
                this._charBack[index],
                this._fgBack[index],
                this._bgBack[index],
                index
            );
        }

        return this;
    }

    /**
     * Exports a clipped rectangular slice of the buffer.
     *
     * The returned arrays are copies, safe to retain across later mutations.
     * They are laid out row-major with width returnedWidth, not buffer cols.
     *
     * @param {number} x Source left column.
     * @param {number} y Source top row.
     * @param {number} width Slice width.
     * @param {number} height Slice height.
     * @returns {{
     *   x: number,
     *   y: number,
     *   width: number,
     *   height: number,
     *   chars: Uint32Array,
     *   fg: Uint32Array,
     *   bg: Uint32Array
     * }}
     */
    exportRegion(x, y, width, height) {
        const clip = this._clipRegion(x, y, width, height);

        if (!clip) {
            return {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                chars: new Uint32Array(0),
                fg: new Uint32Array(0),
                bg: new Uint32Array(0)
            };
        }

        const { x0, y0, x1, y1, width: regionWidth, height: regionHeight } = clip;
        const outCount = regionWidth * regionHeight;

        const chars = new Uint32Array(outCount);
        const fg = new Uint32Array(outCount);
        const bg = new Uint32Array(outCount);

        for (let row = 0; row < regionHeight; row += 1) {
            const srcStart = this.cellIndex(x0, y0 + row);
            const srcEnd = srcStart + regionWidth;
            const dstStart = row * regionWidth;

            chars.set(this._charBack.subarray(srcStart, srcEnd), dstStart);
            fg.set(this._fgBack.subarray(srcStart, srcEnd), dstStart);
            bg.set(this._bgBack.subarray(srcStart, srcEnd), dstStart);
        }

        return {
            x: x0,
            y: y0,
            width: regionWidth,
            height: regionHeight,
            chars,
            fg,
            bg
        };
    }

    /**
     * Exports a clipped region as plain text, one row per line.
     *
     * Useful for debug dumps, map verification, and minimap text snapshots.
     *
     * @param {number} [x=0] Source left column.
     * @param {number} [y=0] Source top row.
     * @param {number} [width=cols] Region width.
     * @param {number} [height=rows] Region height.
     * @returns {string} Text export. Empty string if region is invalid.
     */
    toText(x = 0, y = 0, width = this._cols, height = this._rows) {
        const clip = this._clipRegion(x, y, width, height);
        if (!clip) return '';

        const { x0, y0, x1, y1 } = clip;
        const lines = [];

        for (let yy = y0; yy < y1; yy += 1) {
            let line = '';
            let index = this.cellIndex(x0, yy);

            for (let xx = x0; xx < x1; xx += 1, index += 1) {
                line += String.fromCodePoint(this._charBack[index]);
            }

            lines.push(line);
        }

        return lines.join('\n');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * RESIZE
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Resizes the buffer.
     *
     * If preserve is true, overlapping cells from the old back buffer are
     * copied into the new buffer. This is useful for viewport-driven dynamic
     * scaling where world content should remain anchored to grid coordinates.
     *
     * If preserve is false, the buffer is reset to defaults and marked dirty.
     *
     * @param {number} cols New column count.
     * @param {number} rows New row count.
     * @param {boolean} [preserve=false] Whether to preserve overlapping cells.
     * @returns {this}
     */
    resize(cols, rows, preserve = false) {
        validateDimension(cols, 'cols');
        validateDimension(rows, 'rows');

        const newCols = Math.trunc(cols);
        const newRows = Math.trunc(rows);

        if (newCols === this._cols && newRows === this._rows) {
            if (preserve) {
                this.forceSync();
            } else {
                this.clear();
            }
            return this;
        }

        validateCellCount(newCols * newRows);

        const oldCols = this._cols;
        const oldRows = this._rows;
        const oldChar = this._charBack;
        const oldFg = this._fgBack;
        const oldBg = this._bgBack;

        this._cols = newCols;
        this._rows = newRows;
        this._cellCount = newCols * newRows;

        this._allocateArrays();
        this._resetToDefaults();

        if (preserve && oldChar) {
            const copyCols = Math.min(oldCols, newCols);
            const copyRows = Math.min(oldRows, newRows);

            for (let y = 0; y < copyRows; y += 1) {
                for (let x = 0; x < copyCols; x += 1) {
                    const oldIndex = y * oldCols + x;
                    const newIndex = y * newCols + x;

                    const charCode = oldChar[oldIndex];
                    const fg = oldFg[oldIndex];
                    const bg = oldBg[oldIndex];

                    this._charBack[newIndex] = charCode;
                    this._fgBack[newIndex] = fg;
                    this._bgBack[newIndex] = bg;

                    /* Since resize usually triggers a full redraw anyway,
                     * front is synchronized immediately to avoid emitting a
                     * huge synthetic dirty delta. */
                    this._charFront[newIndex] = charCode;
                    this._fgFront[newIndex] = fg;
                    this._bgFront[newIndex] = bg;
                }
            }
        }

        this._clearDirtyState();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * INTERNAL HELPERS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Allocates all typed arrays for the current cols/rows/cellCount.
     * @private
     */
    _allocateArrays() {
        this._charBack = new Uint32Array(this._cellCount);
        this._fgBack = new Uint32Array(this._cellCount);
        this._bgBack = new Uint32Array(this._cellCount);

        this._charFront = new Uint32Array(this._cellCount);
        this._fgFront = new Uint32Array(this._cellCount);
        this._bgFront = new Uint32Array(this._cellCount);

        this._dirtyFlags = new Uint8Array(this._cellCount);

        /**
         * Sparse candidate list. It may contain stale indices; the matching
         * _dirtyFlags entry is the authoritative marker.
         * @type {number[]}
         */
        this._dirtyIndices = [];

        /**
         * When true, commit() scans every cell instead of using candidates.
         * @type {boolean}
         */
        this._fullDirty = false;

        /** @type {?{x:number,y:number,width:number,height:number}} */
        this._dirtyRect = null;

        /** @type {number[]} */
        this._lastDirtyCells = [];
    }

    /**
     * Fills both buffers with defaults and clears dirty state.
     * @private
     */
    _resetToDefaults() {
        this._charBack.fill(this._defaultCharCode);
        this._fgBack.fill(this._defaultFg);
        this._bgBack.fill(this._defaultBg);

        this._charFront.fill(this._defaultCharCode);
        this._fgFront.fill(this._defaultFg);
        this._bgFront.fill(this._defaultBg);

        this._clearDirtyState();
    }

    /**
     * Clears dirty bookkeeping without touching pixel/glyph data.
     * @private
     */
    _clearDirtyState() {
        this._fullDirty = false;
        this._dirtyIndices.length = 0;

        if (this._dirtyFlags) {
            this._dirtyFlags.fill(0);
        }

        this._dirtyRect = null;
        this._lastDirtyCells = [];
    }

    /**
     * Adds a candidate index to the sparse dirty list.
     *
     * If the candidate list becomes larger than the whole grid, the buffer
     * promotes the frame to a full-scan commit to avoid unbounded growth
     * from repeated mark/unmark churn.
     *
     * @param {number} index Flat cell index.
     * @private
     */
    _markCandidate(index) {
        if (this._fullDirty) return;

        if (this._dirtyFlags[index] === 0) {
            this._dirtyFlags[index] = 1;
            this._dirtyIndices.push(index);

            if (this._dirtyIndices.length > this._cellCount) {
                this._fullDirty = true;
                this._dirtyIndices.length = 0;
                this._dirtyFlags.fill(0);
            }
        }
    }

    /**
     * Clips an arbitrary rectangle against the buffer bounds.
     *
     * @param {number} x Requested left column.
     * @param {number} y Requested top row.
     * @param {number} width Requested width.
     * @param {number} height Requested height.
     * @returns {?{
     *   x0: number,
     *   y0: number,
     *   x1: number,
     *   y1: number,
     *   width: number,
     *   height: number
     * }}
     *   Clipped rectangle with exclusive x1/y1 bounds, or null if empty.
     * @private
     */
    _clipRegion(x, y, width, height) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height)
        ) {
            return null;
        }

        const requestedX = Math.trunc(x);
        const requestedY = Math.trunc(y);
        const requestedWidth = Math.trunc(width);
        const requestedHeight = Math.trunc(height);

        if (requestedWidth <= 0 || requestedHeight <= 0) {
            return null;
        }

        const x0 = Math.max(0, requestedX);
        const y0 = Math.max(0, requestedY);
        const x1 = Math.min(this._cols, requestedX + requestedWidth);
        const y1 = Math.min(this._rows, requestedY + requestedHeight);

        if (x0 >= x1 || y0 >= y1) {
            return null;
        }

        return {
            x0,
            y0,
            x1,
            y1,
            width: x1 - x0,
            height: y1 - y0
        };
    }
}

export default ASCIIBuffer;