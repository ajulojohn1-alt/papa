/**
 * @file src/worlds/MapParser.js
 * @module worlds/MapParser
 * @description
 * Map ingestion pipeline for "A Stitch in Time".
 * MapParser converts raw ASCII text matrices (multi-line strings or string
 * arrays) and JSON grid documents into runtime-ready GameMap objects that
 * the collision, rendering, quest, and WorldManager subsystems consume
 * directly. It is a pure data-transformation module: it never touches the
 * DOM, the canvas, or the network, which keeps it fully unit-testable and
 * safe to run inside the fixed-timestep load path.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * GLYPH DICTIONARY (DEFAULT TILE REGISTRY)
 * ───────────────────────────────────────────────────────────────────────────
 * Every cell of a map is exactly one Unicode code point. The registry maps
 * each code point to an immutable TileDef carrying gameplay metadata:
 *
 *   GLYPH  NAME            WALKABLE  SEE-THROUGH  ROLE
 *   ' '    Void            NO        YES          Unrendered dead space
 *   '.'    Verdant Grass   YES       YES          Default walkable ground
 *   ','    Dirt Path       YES       YES          Roads / caravan routes
 *   '~'    Water           NO        YES          Blocks movement, not sight
 *   '^'    Spike Hazard    YES       YES          interactionId HAZARD_SPIKES
 *   '+'    Timber Door     NO        NO           interactionId DOOR
 *   '*'    Dream Blossom   YES       YES          Dream World flora decor
 *   'C'    Locked Chest    NO        YES          interactionId CHEST
 *   'P'    Player Spawn    —         —            Entity token, base tile '.'
 *   'N'    NPC Spawn       —         —            Entity token, base tile '.'
 *   'E'    Enemy Spawn     —         —            Entity token, base tile '.'
 *   'O'    Dream Portal    —         —            Entity token, base tile '.'
 *
 * Custom campaigns extend or replace the dictionary through the
 * `tileDefinitions` constructor option or registerTiles(); gameplay code
 * only ever sees normalized TileDef objects, never raw characters.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MEMORY LAYOUT
 * ───────────────────────────────────────────────────────────────────────────
 * GameMap stores its grid as a structure-of-arrays pair of typed arrays,
 * matching the ASCIIBuffer philosophy of avoiding per-cell objects:
 *
 *   glyphs   Uint32Array  one Unicode code point per cell (render layer)
 *   tileIds  Uint16Array  one registry index per cell (gameplay layer)
 *
 *   index(x, y) = y * cols + x
 *   x(index)    = index % cols
 *   y(index)    = (index / cols) | 0
 *
 * Per-cell cost is 6 bytes; at the 1,048,576-cell ceiling the whole grid
 * occupies ~6 MB. Metadata objects are shared: one frozen TileDef per
 * registry entry, referenced by tileIds, never duplicated per cell.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SPAWN EXTRACTION
 * ───────────────────────────────────────────────────────────────────────────
 * Tokens with a `spawnType` (P/N/E/O) are entity markers, not terrain.
 * During parsing each token is:
 *   1. recorded in GameMap.spawns as { type, x, y, glyph, index, ... },
 *      preserving order of appearance (`index`) so WorldManager can pair
 *      portals (0↔1, 2↔3, ...) deterministically;
 *   2. replaced in the grid by its `baseGlyph` terrain (default '.'),
 *      so collision and rendering see clean walkable ground underneath.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * VALIDATION POLICY: STRICT VS. LENIENT
 * ───────────────────────────────────────────────────────────────────────────
 * strict = true (default):
 *   - ragged rows            → MapParseError with line/column diagnostics
 *   - unknown glyph          → MapParseError with line/column + code point
 *   - empty / oversized maps → MapParseError / RangeError
 * strict = false (lenient):
 *   - short rows are padded with the fallback glyph, long rows define width
 *   - unknown glyphs are substituted with the fallback glyph
 *   - every repair is recorded in GameMap.warnings for the debug HUD
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FALLBACK STRATEGY
 * ───────────────────────────────────────────────────────────────────────────
 * Recommended WorldManager load pattern — never let a bad asset brick the
 * client; degrade into a guaranteed-bootable arena instead:
 *
 *   let map;
 *   try {
 *       map = parser.parse(await fetchText(url), { name: mapId });
 *   } catch (error) {
 *       console.error(mapId, error);
 *       map = MapParser.createFallbackMap();   // walled room + player spawn
 *   }
 *
 * @example
 * const parser = new MapParser();
 * const map = parser.parse(rawText, { name: 'verdant_glade' });
 * const spawn = map.getPlayerSpawn();          // { x, y, fromSpawn }
 * const buffer = map.createASCIIBuffer();      // stamp into render surface
 * worldManager.loadMap(map, buffer);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Minimum permitted map dimension in cells. */
const MIN_MAP_DIMENSION = 1;

/**
 * Maximum permitted map dimension in cells. Mirrors ASCIIBuffer's own
 * sanity ceiling so a parsed map can always be stamped into a buffer of
 * the same dimensions without a secondary validation path.
 * @type {number}
 */
const MAX_MAP_DIMENSION = 16384;

/**
 * Maximum total cell count (cols × rows). At 6 bytes per cell this caps
 * grid storage near 6 MB — identical to the ASCIIBuffer memory budget.
 * @type {number}
 */
const MAX_MAP_CELL_COUNT = 1_048_576;

/** Glyph substituted for repairs in lenient mode and used by fallback maps. */
const DEFAULT_FALLBACK_GLYPH = '.';

/** Code point of the blank glyph; cells with no visible ink skip rendering. */
const SPACE_CODE_POINT = 0x20;

/**
 * Legal spawn-token categories. Spawn tokens are extracted into
 * GameMap.spawns and replaced by their base terrain during parsing.
 * @type {ReadonlySet<string>}
 */
const SPAWN_TYPES = new Set(['PLAYER', 'NPC', 'ENEMY', 'PORTAL']);

/**
 * Default glyph dictionary for the Dream World overworld tileset.
 * Colors are CSS strings here for authoring readability; registry
 * normalization packs them into 32-bit RGBA once at construction time,
 * so runtime lookups never re-parse color syntax.
 * `backgroundHighlight: null` means "transparent background" — the
 * Renderer then falls back to its clear color for that cell.
 * @type {Object<string, Object>}
 */
export const DEFAULT_TILE_DEFINITIONS = Object.freeze({
    ' ': Object.freeze({
        name: 'Void',
        isWalkable: false,
        isTransparent: true,
        renderColor: '#000000',
        backgroundHighlight: null,
        interactionId: null
    }),
    '.': Object.freeze({
        name: 'Verdant Grass',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#4e8d4e',
        backgroundHighlight: '#070d07',
        interactionId: null
    }),
    ',': Object.freeze({
        name: 'Dirt Path',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#b3a077',
        backgroundHighlight: '#0d0b08',
        interactionId: null
    }),
    '~': Object.freeze({
        name: 'Water',
        isWalkable: false,
        isTransparent: true,
        renderColor: '#4fc3ff',
        backgroundHighlight: '#071624',
        interactionId: null
    }),
    '^': Object.freeze({
        name: 'Spike Hazard',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#ff4d4d',
        backgroundHighlight: null,
        interactionId: 'HAZARD_SPIKES'
    }),
    '+': Object.freeze({
        name: 'Timber Door',
        isWalkable: false,
        isTransparent: false,
        renderColor: '#a06a34',
        backgroundHighlight: '#16100a',
        interactionId: 'DOOR'
    }),
    '*': Object.freeze({
        name: 'Dream Blossom',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#ff8ac2',
        backgroundHighlight: '#070d07',
        interactionId: null
    }),
    'C': Object.freeze({
        name: 'Locked Chest',
        isWalkable: false,
        isTransparent: true,
        renderColor: '#ffc832',
        backgroundHighlight: null,
        interactionId: 'CHEST'
    }),
    'P': Object.freeze({
        name: 'Player Spawn',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#ffffff',
        backgroundHighlight: null,
        interactionId: null,
        spawnType: 'PLAYER',
        baseGlyph: '.'
    }),
    'N': Object.freeze({
        name: 'NPC Spawn',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#66ccff',
        backgroundHighlight: null,
        interactionId: null,
        spawnType: 'NPC',
        baseGlyph: '.'
    }),
    'E': Object.freeze({
        name: 'Enemy Spawn',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#ff3355',
        backgroundHighlight: null,
        interactionId: null,
        spawnType: 'ENEMY',
        baseGlyph: '.'
    }),
    'O': Object.freeze({
        name: 'Dream Portal',
        isWalkable: true,
        isTransparent: true,
        renderColor: '#ff7700',
        backgroundHighlight: null,
        interactionId: 'PORTAL',
        spawnType: 'PORTAL',
        baseGlyph: '.'
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   VALIDATION HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Validates one map dimension against the permitted cell range.
 * @param {number} value Candidate dimension.
 * @param {string} axisName Human-readable axis label for error messages.
 * @param {string} mapName Owning map name for error messages.
 * @throws {RangeError} If the dimension is non-integral or out of range.
 */
function validateMapDimension(value, axisName, mapName) {
    if (!Number.isInteger(value) || value < MIN_MAP_DIMENSION || value > MAX_MAP_DIMENSION) {
        throw new RangeError(
            `[MapParser] map "${mapName}" ${axisName} must be an integer between ` +
            `${MIN_MAP_DIMENSION} and ${MAX_MAP_DIMENSION}; received ${value}.`
        );
    }
}

/**
 * Formats a Unicode code point as a zero-padded U+XXXX label for errors.
 * @param {number} codePoint Unicode code point.
 * @returns {string} e.g. "U+002E".
 */
function formatCodePoint(codePoint) {
    return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Normalizes an author-facing glyph dictionary into the runtime registry.
 *
 * Two passes are required: pass one validates and freezes every TileDef,
 * pass two resolves spawn-token `baseGlyph` references, because a token
 * may reference a glyph that appears later in the dictionary literal.
 *
 * Registry invariants enforced here:
 *   - every glyph key is exactly one UTF-16 code unit pair (one code point);
 *   - isWalkable / isTransparent are real booleans (no truthy coercion);
 *   - colors pass through ASCIIBuffer.packColor exactly once;
 *   - spawn tokens reference an existing, NON-spawn base glyph (chained
 *     spawn-on-spawn tokens are rejected — their semantics are ambiguous);
 *   - tile ids are dense indices into the returned list, fitting Uint16.
 *
 * @param {Object<string, Object>} definitions Author-facing dictionary.
 * @returns {{byCode: Map<number, Object>, list: Object[]}} Frozen registry.
 * @throws {TypeError} If the dictionary or any entry is malformed.
 */
function normalizeRegistry(definitions) {
    if (definitions === null || typeof definitions !== 'object' || Array.isArray(definitions)) {
        throw new TypeError('[MapParser] tileDefinitions must be a plain object.');
    }

    /** @type {Map<number, Object>} code point → mutable working entry */
    const byCode = new Map();
    /** @type {Object[]} dense id-ordered working entries */
    const list = [];

    /* ---- Pass 1: validate and freeze individual entries -------------- */
    for (const [glyph, def] of Object.entries(definitions)) {
        if (typeof glyph !== 'string' || Array.from(glyph).length !== 1) {
            throw new TypeError(
                `[MapParser] tile key must be exactly one glyph; received ${JSON.stringify(glyph)}.`
            );
        }
        if (def === null || typeof def !== 'object') {
            throw new TypeError(`[MapParser] definition for glyph '${glyph}' must be an object.`);
        }

        const codePoint = glyph.codePointAt(0);
        if (byCode.has(codePoint)) {
            throw new TypeError(`[MapParser] duplicate tile definition for '${glyph}'.`);
        }

        if (typeof def.isWalkable !== 'boolean') {
            throw new TypeError(`[MapParser] tile '${glyph}'.isWalkable must be a boolean.`);
        }
        if (typeof def.isTransparent !== 'boolean') {
            throw new TypeError(`[MapParser] tile '${glyph}'.isTransparent must be a boolean.`);
        }
        if (def.interactionId !== null && def.interactionId !== undefined &&
            (typeof def.interactionId !== 'string' || def.interactionId.length === 0)) {
            throw new TypeError(`[MapParser] tile '${glyph}'.interactionId must be null or a non-empty string.`);
        }

        const spawnType = def.spawnType ?? null;
        if (spawnType !== null && !SPAWN_TYPES.has(spawnType)) {
            throw new TypeError(
                `[MapParser] tile '${glyph}'.spawnType must be one of ` +
                `${[...SPAWN_TYPES].join(', ')}; received ${spawnType}.`
            );
        }
        if (spawnType !== null && (typeof def.baseGlyph !== 'string' || Array.from(def.baseGlyph).length !== 1)) {
            throw new TypeError(
                `[MapParser] spawn tile '${glyph}' must declare a single-character baseGlyph.`
            );
        }

        const entry = {
            id: list.length,
            char: glyph,
            codePoint,
            name: typeof def.name === 'string' && def.name.length > 0 ? def.name : glyph,
            isWalkable: def.isWalkable,
            isTransparent: def.isTransparent,
            /* Pack once at build time; null background → transparent (0). */
            renderColor: ASCIIBuffer.packColor(def.renderColor ?? null, 0xFFFFFFFF),
            backgroundHighlight: ASCIIBuffer.packColor(def.backgroundHighlight ?? null, 0x00000000),
            interactionId: def.interactionId ?? null,
            spawnType,
            baseGlyph: spawnType !== null ? def.baseGlyph : null,
            /** Resolved in pass 2. @type {?Object} */
            baseEntry: null
        };

        byCode.set(codePoint, entry);
        list.push(entry);
    }

    if (list.length === 0) {
        throw new TypeError('[MapParser] tileDefinitions must contain at least one glyph.');
    }
    if (list.length > 0xFFFF) {
        throw new RangeError('[MapParser] tile registry exceeds 65535 entries (Uint16 tileId limit).');
    }

    /* ---- Pass 2: resolve spawn base-glyph references ----------------- */
    for (const entry of list) {
        if (entry.spawnType === null) continue;
        const baseCode = entry.baseGlyph.codePointAt(0);
        const base = byCode.get(baseCode);
        if (!base) {
            throw new TypeError(
                `[MapParser] spawn tile '${entry.char}' references unknown base glyph '${entry.baseGlyph}'.`
            );
        }
        if (base.spawnType !== null) {
            throw new TypeError(
                `[MapParser] spawn tile '${entry.char}' may not use another spawn token ('${base.char}') as its base.`
            );
        }
        entry.baseEntry = base;
    }

    /* Freeze everything now that cross-references are resolved. */
    for (let i = 0; i < list.length; i += 1) {
        list[i] = Object.freeze(list[i]);
    }
    return Object.freeze({ byCode, list: Object.freeze(list) });
}

/* ══════════════════════════════════════════════════════════════════════════
   MAP PARSE ERROR
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Structured error for malformed map content. Carries machine-readable
 * location fields so editor tooling and the crash overlay can point at
 * the exact offending cell instead of dumping a wall of text.
 */
export class MapParseError extends Error {
    /**
     * @param {string} message Human-readable description (already prefixed).
     * @param {Object} [details]
     * @param {string} [details.mapName='unknown'] Map identifier.
     * @param {number} [details.line=-1] Zero-based row, -1 when not cell-specific.
     * @param {number} [details.column=-1] Zero-based column, -1 when not cell-specific.
     * @param {Error} [details.cause] Underlying error (e.g. JSON.parse failure).
     */
    constructor(message, details = {}) {
        super(message);
        /** @type {string} */
        this.name = 'MapParseError';
        /** @type {string} */
        this.mapName = typeof details.mapName === 'string' ? details.mapName : 'unknown';
        /** @type {number} */
        this.line = Number.isInteger(details.line) ? details.line : -1;
        /** @type {number} */
        this.column = Number.isInteger(details.column) ? details.column : -1;
        /** @type {?Error} */
        this.cause = details.cause instanceof Error ? details.cause : null;
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   GAME MAP (PARSED, RUNTIME-READY GRID)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Immutable, runtime-ready map produced by MapParser.
 *
 * Hot-path contract: collision and LOS systems should prefer the typed
 * accessors (isWalkableAt, isTransparentAt, getTileIdAt) which perform a
 * single bounds check plus one typed-array read and allocate nothing.
 * getTileAt() allocates a snapshot object and is intended for inspectors,
 * quest triggers, and debug tooling — not per-projectile queries.
 */
export class GameMap {
    /**
     * @param {Object} spec
     * @param {string} spec.name Map identifier.
     * @param {number} spec.cols Grid width in cells.
     * @param {number} spec.rows Grid height in cells.
     * @param {Uint32Array} spec.glyphs Code point per cell (copied defensively).
     * @param {Uint16Array} spec.tileIds Registry id per cell (copied defensively).
     * @param {{byCode: Map<number, Object>, list: Object[]}} spec.registry
     * @param {Object[]} spec.spawn Extracted spawn records.
     * @param {string[]} spec.warnings Lenient-mode repair notes.
     * @param {?Object} spec.meta Author metadata from JSON documents.
     * @throws {TypeError} If any field is missing or mistyped.
     */
    constructor(spec) {
        if (spec === null || typeof spec !== 'object') {
            throw new TypeError('[GameMap] spec must be an object.');
        }
        const { name, cols, rows, glyphs, tileIds, registry, spawns, warnings, meta } = spec;

        if (typeof name !== 'string' || name.length === 0) {
            throw new TypeError('[GameMap] name must be a non-empty string.');
        }
        if (!Number.isInteger(cols) || cols < MIN_MAP_DIMENSION) {
            throw new RangeError('[GameMap] cols must be a positive integer.');
        }
        if (!Number.isInteger(rows) || rows < MIN_MAP_DIMENSION) {
            throw new RangeError('[GameMap] rows must be a positive integer.');
        }
        const cellCount = cols * rows;
        if (!(glyphs instanceof Uint32Array) || glyphs.length !== cellCount) {
            throw new TypeError('[GameMap] glyphs must be a Uint32Array of cols×rows length.');
        }
        if (!(tileIds instanceof Uint16Array) || tileIds.length !== cellCount) {
            throw new TypeError('[GameMap] tileIds must be a Uint16Array of cols×rows length.');
        }
        if (!registry || !(registry.byCode instanceof Map) || !Array.isArray(registry.list)) {
            throw new TypeError('[GameMap] registry must expose byCode (Map) and list (Array).');
        }

        /** @type {string} */
        this._name = name;
        /** @type {number} */
        this._cols = cols;
        /** @type {number} */
        this._rows = rows;
        /** @type {number} */
        this._cellCount = cellCount;
        /* Defensive copies: GameMap is a shared immutable resource; no
         * producer may retain a mutable alias into its grids. */
        /** @type {Uint32Array} */
        this._glyphs = new Uint32Array(glyphs);
        /** @type {Uint16Array} */
        this._tileIds = new Uint16Array(tileIds);
        /** @type {{byCode: Map<number, Object>, list: Object[]}} */
        this._registry = registry;
        /** @type {ReadonlyArray<Object>} */
        this._spawns = Object.freeze((Array.isArray(spawns) ? spawns : []).map((s) => Object.freeze({ ...s })));
        /** @type {ReadonlyArray<string>} */
        this._warnings = Object.freeze(Array.isArray(warnings) ? [...warnings] : []);
        /** @type {?Object} */
        this._meta = meta && typeof meta === 'object' ? Object.freeze({ ...meta }) : null;
    }

    /* ---- Read-only geometry & content properties ---------------------- */

    /** @returns {string} Map identifier. */
    get name() { return this._name; }
    /** @returns {number} Grid width in cells. */
    get cols() { return this._cols; }
    /** @returns {number} Grid height in cells. */
    get rows() { return this._rows; }
    /** @returns {number} Total cell count (cols × rows). */
    get cellCount() { return this._cellCount; }
    /** @returns {ReadonlyArray<Object>} Dense tile registry (id order). */
    get tiles() { return this._registry.list; }
    /** @returns {ReadonlyArray<Object>} Extracted spawn records. */
    get spawns() { return this._spawns; }
    /** @returns {ReadonlyArray<string>} Lenient-mode repair notes. */
    get warnings() { return this._warnings; }
    /** @returns {?Object} Frozen author metadata, or null. */
    get meta() { return this._meta; }
    /**
     * @returns {boolean} True if at least one PLAYER spawn was extracted.
     * When false, WorldManager should place the player at getPlayerSpawn()'s
     * center-of-map fallback or at a save-file position.
     */
    get hasPlayerSpawn() {
        return this._spawns.some((s) => s.type === 'PLAYER');
    }

    /* ---- Spatial lookups (hot-path safe) ------------------------------ */

    /**
     * Converts 2D coordinates to the flat array index.
     * Formula: index = y * cols + x. No bounds validation — pair with
     * isInBounds() when coordinates originate from untrusted systems.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {number} Flat index.
     */
    cellIndex(x, y) {
        return (y * this._cols) + x;
    }

    /**
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {boolean} True when the coordinates lie inside the grid.
     */
    isInBounds(x, y) {
        return Number.isInteger(x) && Number.isInteger(y) &&
            x >= 0 && y >= 0 && x < this._cols && y < this._rows;
    }

    /**
     * Raw registry id at a cell.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {number} Tile id, or -1 when out of bounds.
     */
    getTileIdAt(x, y) {
        if (!this.isInBounds(x, y)) return -1;
        return this._tileIds[this.cellIndex(x, y)];
    }

    /**
     * Raw glyph code point at a cell.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {number} Code point, or -1 when out of bounds.
     */
    getGlyphCodeAt(x, y) {
        if (!this.isInBounds(x, y)) return -1;
        return this._glyphs[this.cellIndex(x, y)];
    }

    /**
     * Glyph string at a cell.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {?string} Single glyph, or null when out of bounds.
     */
    getGlyphAt(x, y) {
        const code = this.getGlyphCodeAt(x, y);
        return code < 0 ? null : String.fromCodePoint(code);
    }

    /**
     * Full tile snapshot at a cell: coordinates merged with the shared
     * TileDef metadata (isWalkable, isTransparent, renderColor,
     * backgroundHighlight, interactionId). Allocates one object — avoid
     * in per-projectile hot loops.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {?Object} Snapshot, or null when out of bounds.
     */
    getTileAt(x, y) {
        const id = this.getTileIdAt(x, y);
        if (id < 0) return null;
        const tile = this._registry.list[id];
        return {
            x,
            y,
            char: tile.char,
            codePoint: this._glyphs[this.cellIndex(x, y)],
            tile
        };
    }

    /**
     * Collision query. Out-of-bounds cells report NON-walkable: leaving
     * the map must always behave like hitting a wall.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {boolean}
     */
    isWalkableAt(x, y) {
        const id = this.getTileIdAt(x, y);
        return id >= 0 && this._registry.list[id].isWalkable;
    }

    /**
     * Line-of-sight query. Out-of-bounds cells report NON-transparent so
     * lighting and ranged-AI rays terminate at the world edge instead of
     * leaking into the void.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {boolean}
     */
    isTransparentAt(x, y) {
        const id = this.getTileIdAt(x, y);
        return id >= 0 && this._registry.list[id].isTransparent;
    }

    /**
     * Interaction hook query for the quest state machine and INTERACT key.
     * @param {number} x Column.
     * @param {number} y Row.
     * @returns {?string} interactionId ('DOOR', 'CHEST', ...), or null.
     */
    getInteractionIdAt(x, y) {
        const id = this.getTileIdAt(x, y);
        return id >= 0 ? this._registry.list[id].interactionId : null;
    }

    /* ---- Spawn & interaction queries ---------------------------------- */

    /**
     * All spawn records of one category, in order of appearance.
     * @param {string} type One of PLAYER / NPC / ENEMY / PORTAL.
     * @returns {Object[]} Frozen spawn records.
     */
    getSpawnsByType(type) {
        return this._spawns.filter((s) => s.type === type);
    }

    /**
     * First spawn of a category, or null.
     * @param {string} type Spawn category.
     * @returns {?Object}
     */
    getFirstSpawn(type) {
        return this._spawns.find((s) => s.type === type) ?? null;
    }

    /**
     * Resolves the player entry position. Prefers the first PLAYER token;
     * falls back to the grid center so a spawn-less map remains bootable.
     * @returns {{x: number, y: number, fromSpawn: boolean}}
     */
    getPlayerSpawn() {
        const spawn = this.getFirstSpawn('PLAYER');
        if (spawn) return { x: spawn.x, y: spawn.y, fromSpawn: true };
        return {
            x: Math.floor(this._cols / 2),
            y: Math.floor(this._rows / 2),
            fromSpawn: false
        };
    }

    /**
     * Scans the grid for every cell carrying a given interactionId.
     * Used by quest triggers to locate all doors/chests/hazards without a
     * second authoring manifest. O(cellCount) — call at load time, not
     * per tick.
     * @param {string} interactionId e.g. 'DOOR', 'CHEST'.
     * @returns {Array<{x: number, y: number, tile: Object}>}
     */
    findInteractionCells(interactionId) {
        if (typeof interactionId !== 'string' || interactionId.length === 0) return [];
        const found = [];
        for (let i = 0; i < this._cellCount; i += 1) {
            const tile = this._registry.list[this._tileIds[i]];
            if (tile.interactionId === interactionId) {
                found.push({ x: i % this._cols, y: (i / this._cols) | 0, tile });
            }
        }
        return found;
    }

    /* ---- Iteration & export ------------------------------------------- */

    /**
     * Iterates every cell in row-major order.
     * Callback signature: (x, y, codePoint, tile, index) => void
     * @param {Function} callback Iteration callback.
     * @returns {this}
     */
    forEachCell(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('[GameMap] forEachCell requires a function.');
        }
        for (let y = 0, i = 0; y < this._rows; y += 1) {
            for (let x = 0; x < this._cols; x += 1, i += 1) {
                callback(x, y, this._glyphs[i], this._registry.list[this._tileIds[i]], i);
            }
        }
        return this;
    }

    /**
     * Stamps this map into an ASCIIBuffer at an offset, clipping against
     * the buffer bounds. Cells that carry no visible ink (space glyph with
     * a transparent background) are skipped so the buffer's defaults show
     * through — this keeps void regions free for parallax or weather fills.
     * @param {ASCIIBuffer} buffer Destination surface.
     * @param {number} [offsetX=0] Destination column for map cell (0, 0).
     * @param {number} [offsetY=0] Destination row for map cell (0, 0).
     * @returns {number} Number of cells written after clipping.
     */
    stampInto(buffer, offsetX = 0, offsetY = 0) {
        if (!(buffer instanceof ASCIIBuffer)) {
            throw new TypeError('[GameMap] stampInto requires an ASCIIBuffer.');
        }
        const ox = Math.trunc(offsetX);
        const oy = Math.trunc(offsetY);
        let written = 0;
        for (let y = 0, i = 0; y < this._rows; y += 1) {
            const by = y + oy;
            for (let x = 0; x < this._cols; x += 1, i += 1) {
                const bx = x + ox;
                if (bx < 0 || bx >= buffer.cols || by < 0 || by >= buffer.rows) continue;
                const tile = this._registry.list[this._tileIds[i]];
                const codePoint = this._glyphs[i];
                /* Skip cells with neither ink nor background paint. */
                if (codePoint === SPACE_CODE_POINT && (tile.backgroundHighlight & 0xFF) === 0) {
                    continue;
                }
                buffer.setChar(bx, by, codePoint, tile.renderColor, tile.backgroundHighlight);
                written += 1;
            }
        }
        return written;
    }

    /**
     * Builds a map-sized ASCIIBuffer pre-stamped with this map's glyphs
     * and colors — the hand-off object WorldManager feeds the Renderer.
     * @returns {ASCIIBuffer}
     */
    createASCIIBuffer() {
        const buffer = new ASCIIBuffer({
            cols: this._cols,
            rows: this._rows,
            defaultChar: ' ',
            defaultFg: '#e0e0e0',
            defaultBg: '#000000'
        });
        this.stampInto(buffer, 0, 0);
        return buffer;
    }

    /**
     * Reconstructs the textual matrix for debug dumps and editor round-trips.
     * Spawn tokens are NOT restored (they were replaced by base terrain);
     * this export reflects the runtime grid, not the source document.
     * @returns {string} Rows joined by '\n'.
     */
    toText() {
        const lines = [];
        for (let y = 0; y < this._rows; y += 1) {
            let line = '';
            const rowStart = y * this._cols;
            for (let x = 0; x < this._cols; x += 1) {
                line += String.fromCodePoint(this._glyphs[rowStart + x]);
            }
            lines.push(line);
        }
        return lines.join('\n');
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   MAP PARSER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Loads, validates, and converts raw ASCII/JSON map sources into GameMap
 * instances. Stateless between parses except for its configuration
 * (registry, strictness, default name, fallback glyph), so one parser can
 * serve every map load in the session.
 */
export class MapParser {
    /**
     * @param {Object} [options]
     * @param {Object<string, Object>} [options.tileDefinitions]
     *   Custom glyph dictionary replacing DEFAULT_TILE_DEFINITIONS.
     * @param {string} [options.fallbackGlyph='.']
     *   Glyph used for lenient repairs. Must exist in the registry and
     *   must not itself be a spawn token.
     * @param {boolean} [options.strict=true]
     *   Default strictness; per-parse overrides via parse options.
     * @param {string} [options.defaultName='unnamed']
     *   Map name used when no name is supplied per parse.
     * @throws {TypeError} If the registry or fallback glyph is invalid.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[MapParser] options must be an object.');
        }

        /** @type {Object<string, Object>} Raw defs, retained for registerTiles(). */
        this._rawDefinitions = { ...(options.tileDefinitions ?? DEFAULT_TILE_DEFINITIONS) };
        /** @type {{byCode: Map<number, Object>, list: Object[]}} */
        this._registry = normalizeRegistry(this._rawDefinitions);

        /** @type {boolean} Default strictness for parse calls. */
        this._strict = options.strict === undefined ? true : Boolean(options.strict);
        /** @type {string} */
        this._defaultName = typeof options.defaultName === 'string' && options.defaultName.length > 0
            ? options.defaultName
            : 'unnamed';

        /* Resolve and validate the fallback glyph once up front. */
        const fallbackChar = options.fallbackGlyph ?? DEFAULT_FALLBACK_GLYPH;
        this._fallbackEntry = this._resolveFallbackEntry(fallbackChar);
    }

    /* ---- Configuration properties ------------------------------------ */

    /** @returns {{byCode: Map<number, Object>, list: Object[]}} Active registry. */
    get registry() { return this._registry; }
    /** @returns {boolean} Default strictness. */
    get strict() { return this._strict; }
    /** @returns {string} Current fallback glyph character. */
    get fallbackGlyph() { return this._fallbackEntry.char; }

    /**
     * Tests whether a glyph exists in the active registry.
     * @param {string} char Single glyph.
     * @returns {boolean}
     */
    hasGlyph(char) {
        return typeof char === 'string' && char.length > 0 &&
            this._registry.byCode.has(char.codePointAt(0));
    }

    /**
     * Merges additional glyph definitions into the registry (existing
     * glyphs are overwritten by key). Re-normalizes the whole dictionary,
     * re-validates the fallback glyph, and returns the parser for chaining.
     * @param {Object<string, Object>} definitions New glyph entries.
     * @returns {this}
     */
    registerTiles(definitions) {
        if (definitions === null || typeof definitions !== 'object') {
            throw new TypeError('[MapParser] registerTiles requires an object.');
        }
        this._rawDefinitions = { ...this._rawDefinitions, ...definitions };
        this._registry = normalizeRegistry(this._rawDefinitions);
        /* The fallback glyph may have been redefined or orphaned. */
        this._fallbackEntry = this._resolveFallbackEntry(this._fallbackEntry.char);
        return this;
    }

    /**
     * Resolves a fallback glyph character to its registry entry.
     * Spawn tokens are rejected: repairing unknown cells with a spawn
     * would silently multiply entity records.
     * @param {string} char Candidate glyph.
     * @returns {Object} Frozen TileDef.
     * @throws {TypeError} If the glyph is missing or is a spawn token.
     * @private
     */
    _resolveFallbackEntry(char) {
        if (typeof char !== 'string' || Array.from(char).length !== 1) {
            throw new TypeError('[MapParser] fallbackGlyph must be a single character.');
        }
        const entry = this._registry.byCode.get(char.codePointAt(0));
        if (!entry) {
            throw new TypeError(`[MapParser] fallbackGlyph '${char}' does not exist in the tile registry.`);
        }
        if (entry.spawnType !== null) {
            throw new TypeError(`[MapParser] fallbackGlyph '${char}' must not be a spawn token.`);
        }
        return entry;
    }

    /* ---- Public parse entry points ------------------------------------ */

    /**
     * Universal entry point. Accepts:
     *   - multi-line ASCII strings (auto-detected JSON when they begin
     *     with '{' and parse cleanly; a failed auto-detect falls back to
     *     raw text so '{' remains usable as a map glyph),
     *   - JSON map documents as objects,
     *   - arrays of row strings.
     * @param {string|string[]|Object} source Map content.
     * @param {Object} [options]
     * @param {string} [options.name] Map identifier.
     * @param {boolean} [options.strict] Override parser default.
     * @param {string} [options.fallbackGlyph] Override parser default.
     * @param {('auto'|'json'|'text')} [options.format='auto']
     *   Force a string source to be treated as JSON or raw text.
     * @returns {GameMap}
     * @throws {MapParseError|TypeError|RangeError} On malformed content.
     */
    parse(source, options = {}) {
        if (typeof source === 'string') {
            const format = options.format ??
                (source.trimStart().startsWith('{') ? 'json' : 'text');
            if (format === 'json') {
                try {
                    return this.parseJSON(source, options);
                } catch (error) {
                    /* Explicit JSON requests must fail loudly; only the
                     * auto-detector may retreat to raw-text parsing. */
                    if (options.format === 'json') throw error;
                }
            }
            return this.parseText(source, options);
        }
        if (Array.isArray(source)) return this.parseLines(source, options);
        if (source !== null && typeof source === 'object') return this.parseJSON(source, options);
        throw new TypeError('[MapParser] parse() expects a string, string[], or JSON object.');
    }

    /**
     * Parses a multi-line ASCII string. Line endings may be \n or \r\n.
     * @param {string} text Raw map text.
     * @param {Object} [options] See parse().
     * @returns {GameMap}
     */
    parseText(text, options = {}) {
        if (typeof text !== 'string') {
            throw new TypeError('[MapParser] parseText requires a string.');
        }
        return this._buildMap(text.split(/\r?\n/), options);
    }

    /**
     * Parses an array of row strings (e.g. pre-split fetch responses or
     * procedurally generated rows).
     * @param {string[]} lines Row strings.
     * @param {Object} [options] See parse().
     * @returns {GameMap}
     */
    parseLines(lines, options = {}) {
        if (!Array.isArray(lines)) {
            throw new TypeError('[MapParser] parseLines requires an array of strings.');
        }
        return this._buildMap(lines, options);
    }

    /**
     * Parses a JSON map document. Accepted shape:
     * {
     *   "name":   "verdant_glade",          // optional
     *   "width":  40, "height": 20,         // optional cross-checks
     *   "rows":   ["####", "#..#"],         // OR "grid": [...],
     *   "tiles":  "####\n#..#",             // OR flat string (chunked by width)
     *   "meta":   { "music": "dream_01" }   // optional, passed through frozen
     * }
     * @param {string|Object} source JSON string or plain object.
     * @param {Object} [options] See parse().
     * @returns {GameMap}
     * @throws {MapParseError} On malformed JSON or schema violations.
     */
    parseJSON(source, options = {}) {
        const mapName = this._resolveName(options);
        let data = source;
        if (typeof source === 'string') {
            try {
                data = JSON.parse(source);
            } catch (error) {
                throw new MapParseError(
                    `[MapParser] map "${mapName}": malformed JSON document: ${error.message}`,
                    { mapName, cause: error }
                );
            }
        }
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
            throw new MapParseError(
                `[MapParser] map "${mapName}": JSON root must be an object.`,
                { mapName }
            );
        }

        /* ---- Extract row data from any supported field --------------- */
        let rows = null;
        if (Array.isArray(data.rows)) rows = data.rows;
        else if (Array.isArray(data.grid)) rows = data.grid;
        else if (typeof data.tiles === 'string') {
            rows = data.tiles.includes('\n')
                ? data.tiles.split(/\r?\n/)
                : this._chunkFlatTiles(data, mapName);
        }
        if (rows === null) {
            throw new MapParseError(
                `[MapParser] map "${mapName}": JSON must contain "rows", "grid", or "tiles".`,
                { mapName }
            );
        }

        /* ---- Cross-check declared dimensions when present ------------- */
        if (Number.isInteger(data.width) && rows.length > 0) {
            const rowStrings = rows.map((r) => String(r ?? ''));
            const mismatch = rowStrings.find((r) => Array.from(r).length !== data.width);
            if (mismatch !== undefined) {
                throw new MapParseError(
                    `[MapParser] map "${mapName}": row content disagrees with declared width ${data.width}.`,
                    { mapName }
                );
            }
        }
        if (Number.isInteger(data.height) && rows.length !== data.height) {
            throw new MapParseError(
                `[MapParser] map "${mapName}": declared height ${data.height} but found ${rows.length} rows.`,
                { mapName }
            );
        }

        return this._buildMap(rows, {
            ...options,
            name: typeof data.name === 'string' && data.name.length > 0 ? data.name : mapName,
            meta: data.meta ?? null
        });
    }

    /**
     * Chunks a newline-free "tiles" string into rows using the declared
     * width: tiles.length must equal width × height exactly.
     * @param {Object} data JSON document.
     * @param {string} mapName Map identifier for errors.
     * @returns {string[]} Row strings.
     * @throws {MapParseError} When dimensions are missing or inconsistent.
     * @private
     */
    _chunkFlatTiles(data, mapName) {
        const width = data.width;
        const height = data.height;
        if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
            throw new MapParseError(
                `[MapParser] map "${mapName}": flat "tiles" strings require integer width and height.`,
                { mapName }
            );
        }
        const tiles = Array.from(String(data.tiles));
        if (tiles.length !== width * height) {
            throw new MapParseError(
                `[MapParser] map "${mapName}": flat tiles contain ${tiles.length} cells; ` +
                `expected ${width * height} (width ${width} × height ${height}).`,
                { mapName }
            );
        }
        const rows = [];
        for (let y = 0; y < height; y += 1) {
            rows.push(tiles.slice(y * width, (y + 1) * width).join(''));
        }
        return rows;
    }

    /* ---- Core parsing pipeline ---------------------------------------- */

    /**
     * Resolves the effective map name for a parse call.
     * @param {Object} options Per-parse options.
     * @returns {string}
     * @private
     */
    _resolveName(options) {
        return typeof options.name === 'string' && options.name.length > 0
            ? options.name
            : this._defaultName;
    }

    /**
     * The heart of the module: converts validated row data into a GameMap.
     *
     * Algorithm:
     *   1. Coerce rows to strings; drop trailing empty rows (the classic
     *      trailing-newline artifact of text-file authoring).
     *   2. Split each row into code points via Array.from so astral-plane
     *      glyphs never desynchronize column indices.
     *   3. Establish the grid width: strict mode demands the first row's
     *      width everywhere; lenient mode adopts the widest row and pads.
     *   4. Validate dimensions against MIN/MAX caps and the cell budget.
     *   5. Single cell pass: registry lookup (strict throw / lenient
     *      substitute), spawn extraction with base-tile replacement, and
     *      flat typed-array writes at index y × cols + x.
     *
     * @param {Array<string|*>} rawRows Candidate row data.
     * @param {Object} [options] Per-parse options (see parse()).
     * @returns {GameMap} Fully validated runtime map.
     * @throws {MapParseError|TypeError|RangeError}
     * @private
     */
    _buildMap(rawRows, options = {}) {
        if (!Array.isArray(rawRows)) {
            throw new TypeError('[MapParser] row source must be an array.');
        }
        const mapName = this._resolveName(options);
        const strict = options.strict === undefined ? this._strict : Boolean(options.strict);
        const fallbackEntry = options.fallbackGlyph === undefined
            ? this._fallbackEntry
            : this._resolveFallbackEntry(options.fallbackGlyph);

        /* ---- 1. Coerce + strip trailing empty rows -------------------- */
        const lines = rawRows.map((row) => (row === null || row === undefined ? '' : String(row)));
        while (lines.length > 0 && lines[lines.length - 1].length === 0) {
            lines.pop();
        }
        if (lines.length === 0) {
            throw new MapParseError(`[MapParser] map "${mapName}" contains no rows.`, { mapName });
        }

        /* ---- 2. Code-point rows --------------------------------------- */
        const rows = lines.map((line) => Array.from(line));

        /* ---- 3. Width resolution --------------------------------------- */
        /** @type {string[]} Lenient-mode repair log. */
        const warnings = [];
        let cols;
        if (strict) {
            cols = rows[0].length;
            if (cols === 0) {
                throw new MapParseError(
                    `[MapParser] map "${mapName}": first row is empty.`,
                    { mapName, line: 0 }
                );
            }
            for (let y = 1; y < rows.length; y += 1) {
                if (rows[y].length !== cols) {
                    throw new MapParseError(
                        `[MapParser] map "${mapName}": row ${y} is ${rows[y].length} cells wide; ` +
                        `expected ${cols} (ragged map).`,
                        { mapName, line: y, column: Math.min(rows[y].length, cols) }
                    );
                }
            }
        } else {
            cols = 0;
            for (const row of rows) cols = Math.max(cols, row.length);
            if (cols === 0) {
                throw new MapParseError(`[MapParser] map "${mapName}" contains only empty rows.`, { mapName });
            }
            for (let y = 0; y < rows.length; y += 1) {
                if (rows[y].length !== cols) {
                    warnings.push(
                        `row ${y} normalized from ${rows[y].length} to ${cols} cells using '${fallbackEntry.char}'`
                    );
                }
            }
        }
        const rowCount = rows.length;

        /* ---- 4. Dimension caps ----------------------------------------- */
        validateMapDimension(cols, 'width', mapName);
        validateMapDimension(rowCount, 'height', mapName);
        const cellCount = cols * rowCount;
        if (cellCount > MAX_MAP_CELL_COUNT) {
            throw new RangeError(
                `[MapParser] map "${mapName}" has ${cellCount} cells; ` +
                `maximum supported is ${MAX_MAP_CELL_COUNT}.`
            );
        }

        /* ---- 5. Cell pass: lookup, spawns, flat writes ------------------ */
        const glyphs = new Uint32Array(cellCount);
        const tileIds = new Uint16Array(cellCount);
        /** @type {Object[]} Extracted entity spawn records. */
        const spawns = [];
        const byCode = this._registry.byCode;

        for (let y = 0; y < rowCount; y += 1) {
            const row = rows[y];
            const rowStart = y * cols;
            for (let x = 0; x < cols; x += 1) {
                /* Lenient padding: cells beyond the short row's real length
                 * inherit the fallback glyph. Strict rows are exact-width,
                 * so this branch is unreachable in strict mode. */
                const char = x < row.length ? row[x] : fallbackEntry.char;
                let entry = byCode.get(char.codePointAt(0));

                if (!entry) {
                    if (strict) {
                        throw new MapParseError(
                            `[MapParser] map "${mapName}": unknown glyph '${char}' ` +
                            `(${formatCodePoint(char.codePointAt(0))}) at row ${y}, column ${x}.`,
                            { mapName, line: y, column: x }
                        );
                    }
                    warnings.push(
                        `unknown glyph '${char}' at (${x}, ${y}) replaced with '${fallbackEntry.char}'`
                    );
                    entry = fallbackEntry;
                }

                const index = rowStart + x;
                if (entry.spawnType !== null) {
                    /* Entity token: record the spawn, lay base terrain. */
                    spawns.push({
                        type: entry.spawnType,
                        x,
                        y,
                        glyph: entry.char,
                        interactionId: entry.interactionId,
                        index: spawns.length
                    });
                    glyphs[index] = entry.baseEntry.codePoint;
                    tileIds[index] = entry.baseEntry.id;
                } else {
                    glyphs[index] = entry.codePoint;
                    tileIds[index] = entry.id;
                }
            }
        }

        /* A map without a player token is legal (save files may position
         * the player), but WorldManager deserves an explicit heads-up. */
        if (!spawns.some((s) => s.type === 'PLAYER')) {
            warnings.push('map defines no PLAYER spawn; use a saved position or the center fallback.');
        }

        return new GameMap({
            name: mapName,
            cols,
            rows: rowCount,
            glyphs,
            tileIds,
            registry: this._registry,
            spawns,
            warnings,
            meta: options.meta ?? null
        });
    }

    /* ---- Fallback generation ------------------------------------------ */

    /**
     * Generates a guaranteed-valid emergency map: a walled room of grass
     * with a centered player spawn. Use when a real map fails to load so
     * the client always reaches a playable state.
     * @param {number} [cols=32] Room width in cells.
     * @param {number} [rows=16] Room height in cells.
     * @param {Object} [options]
     * @param {Object<string, Object>} [options.tileDefinitions] Registry override.
     * @returns {GameMap}
     * @throws {RangeError} If dimensions are invalid.
     */
    static createFallbackMap(cols = 32, rows = 16, options = {}) {
        const width = Math.trunc(cols);
        const height = Math.trunc(rows);
        if (!Number.isInteger(width) || width < 4 || width > MAX_MAP_DIMENSION) {
            throw new RangeError('[MapParser] fallback width must be an integer ≥ 4.');
        }
        if (!Number.isInteger(height) || height < 4 || height > MAX_MAP_DIMENSION) {
            throw new RangeError('[MapParser] fallback height must be an integer ≥ 4.');
        }

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);
        const lines = [];
        for (let y = 0; y < height; y += 1) {
            let line = '';
            for (let x = 0; x < width; x += 1) {
                if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
                    line += '#';
                } else if (x === centerX && y === centerY) {
                    line += 'P';
                } else {
                    line += '.';
                }
            }
            lines.push(line);
        }

        const parser = new MapParser({
            tileDefinitions: options.tileDefinitions,
            defaultName: 'fallback'
        });
        /* Lenient on purpose: the fallback must never itself throw. */
        return parser.parseLines(lines, { name: 'fallback', strict: false });
    }
}

export default MapParser;