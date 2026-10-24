/**
 * @file src/worlds/MapParser_2.js
 * @module worlds/MapParser_2
 * @description
 * Second-generation map ingestion layer for YUCCA: a schema-hardening,
 * invariant-verification, and fallback-generation shell wrapped around
 * the core MapParser pipeline (which remains fully intact — strict and
 * lenient recovery modes, spawn extraction, JSON/text/array sources).
 *
 * Guarantees this layer adds over raw MapParser usage:
 *
 *   1. NO DATA DROP. Every parse passes through verifyMapInvariants():
 *      rectangular grid alignment, spawn records in bounds and unique,
 *      a player spawn present, registry lookups total. Any violation is
 *      reported, never swallowed.
 *   2. NEVER UNPLAYABLE. loadDimensionMaps() falls back to
 *      generateFallbackMap() — a deterministic procedural dimension
 *      (grove island or city grid) with a guaranteed player spawn — so
 *      a corrupted map document degrades to a playable world instead of
 *      a dead engine.
 *   3. ONE-STOP IMPORT. Re-exports MapParser, GameMap, MapParseError,
 *      and DEFAULT_TILE_DEFINITIONS so client and server both import
 *      map handling from a single module.
 *
 * @example
 * import { loadDimensionMaps, verifyMapInvariants } from './MapParser_2.js';
 * const { maps, warnings } = loadDimensionMaps({
 *     sources: { DREAM: dreamText, DRAB: drabText }
 * });
 * for (const map of Object.values(maps)) {
 *     console.log(map.name, verifyMapInvariants(map).ok);
 * }
 */

import {
    MapParser,
    GameMap,
    MapParseError,
    DEFAULT_TILE_DEFINITIONS
} from './MapParser.js';
import { DIMENSION_TILES } from './DimensionTiles.js';

/* Re-export the complete first-generation surface. */
export { MapParser, GameMap, MapParseError, DEFAULT_TILE_DEFINITIONS };

/* ══════════════════════════════════════════════════════════════════════════
   DETERMINISTIC PRNG (fallback generation only)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * mulberry32 — same tiny seeded PRNG family used by WeatherSystem, so
 * fallback maps regenerate identically on every client and the server.
 * @param {number} seed 32-bit integer seed.
 * @returns {() => number} Function returning floats in [0, 1).
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT VERIFICATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Verifies the structural invariants every runtime GameMap must hold.
 *
 * Checks:
 *   - geometry: cols/rows are positive integers and cols×rows equals the
 *     glyph/tileId array lengths (grid alignment never drifts),
 *   - registry: every tileId resolves to a registry entry,
 *   - spawns: every spawn record lies in bounds, at a unique cell, and
 *     at least one PLAYER spawn exists,
 *   - walkability: at least one walkable cell surrounds each PLAYER
 *     spawn so the avatar can never spawn entombed.
 *
 * @param {GameMap} map Parsed map to audit.
 * @returns {{ok: boolean, violations: string[], spawnTypes: Object<string, number>}}
 */
export function verifyMapInvariants(map) {
    const violations = [];
    const spawnTypes = {};

    if (!(map instanceof GameMap)) {
        return { ok: false, violations: ['not a GameMap instance'], spawnTypes };
    }
    if (!Number.isInteger(map.cols) || map.cols <= 0 ||
        !Number.isInteger(map.rows) || map.rows <= 0) {
        violations.push(`degenerate dimensions ${map.cols}x${map.rows}`);
    }

    const cells = map.cols * map.rows;
    if (cells !== map.cellCount) {
        violations.push(`cellCount ${map.cellCount} != cols*rows ${cells}`);
    }

    /* Registry totality + glyph sanity via the public iteration API. */
    let unknownTileRefs = 0;
    map.forEachCell((x, y, codePoint, tile) => {
        if (!tile) unknownTileRefs += 1;
        if (codePoint < 0 || codePoint > 0x10FFFF) {
            violations.push(`invalid code point ${codePoint} at (${x},${y})`);
        }
    });
    if (unknownTileRefs > 0) {
        violations.push(`${unknownTileRefs} cells reference missing registry tiles`);
    }

    /* Spawn records: typed, in bounds, unique cells. */
    const seenCells = new Set();
    let playerSpawns = 0;
    for (const spawn of map.spawns) {
        spawnTypes[spawn.type] = (spawnTypes[spawn.type] ?? 0) + 1;
        if (spawn.x < 0 || spawn.y < 0 || spawn.x >= map.cols || spawn.y >= map.rows) {
            violations.push(`spawn ${spawn.type} out of bounds at (${spawn.x},${spawn.y})`);
        }
        const key = `${spawn.x},${spawn.y}`;
        if (seenCells.has(key)) {
            violations.push(`duplicate spawn at (${spawn.x},${spawn.y})`);
        }
        seenCells.add(key);
        if (spawn.type === 'PLAYER') playerSpawns += 1;
    }
    if (playerSpawns === 0) {
        violations.push('no PLAYER spawn present');
    }

    /* Spawn-adjacent walkability: a player must be able to take a step. */
    const playerSpawn = map.getPlayerSpawn();
    if (playerSpawn) {
        const neighbors = [
            [playerSpawn.x - 1, playerSpawn.y],
            [playerSpawn.x + 1, playerSpawn.y],
            [playerSpawn.x, playerSpawn.y - 1],
            [playerSpawn.x, playerSpawn.y + 1]
        ];
        const free = neighbors.some(([x, y]) => map.isInBounds(x, y) && map.isWalkableAt(x, y));
        if (!free) {
            violations.push('PLAYER spawn is fully enclosed by solid tiles');
        }
    }

    return { ok: violations.length === 0, violations, spawnTypes };
}

/* ══════════════════════════════════════════════════════════════════════════
   FALLBACK MAP GENERATION (DETERMINISTIC, ALWAYS PLAYABLE)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Default fallback dimensions — comfortably larger than the viewport so
 * the camera has room to pan even in degraded mode.
 */
export const FALLBACK_COLS = 72;
export const FALLBACK_ROWS = 32;

/**
 * Builds a fallback dimension through the REAL parse pipeline (never by
 * fabricating GameMap internals), guaranteeing the same validation and
 * spawn extraction as authored content. Deterministic per (world, seed).
 *
 * DREAM: a grove island — tree border, meadow, a mirror pond, and a
 *        central player spawn on a dirt cross-path.
 * DRAB:  a city block grid — concrete walls, asphalt lanes, door-lined
 *        blocks, and a central spawn on the main crossing.
 *
 * @param {string} worldId 'DREAM' or 'DRAB' (flavor selector).
 * @param {Object} [options]
 * @param {number} [options.cols=72] Grid width.
 * @param {number} [options.rows=32] Grid height.
 * @param {number} [options.seed=1337] Deterministic generation seed.
 * @returns {GameMap} Verified, playable fallback map.
 */
export function generateFallbackMap(worldId, options = {}) {
    const cols = Number.isInteger(options.cols) && options.cols >= 24 ? options.cols : FALLBACK_COLS;
    const rows = Number.isInteger(options.rows) && options.rows >= 16 ? options.rows : FALLBACK_ROWS;
    const rng = mulberry32(Number.isInteger(options.seed) ? options.seed : 1337);
    const isDream = worldId !== 'DRAB';

    /* Row builders write into mutable string arrays. */
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(isDream ? '.' : '#'));
    const put = (x, y, ch) => {
        if (x >= 0 && y >= 0 && x < cols && y < rows) grid[y][x] = ch;
    };

    if (isDream) {
        /* Border grove. */
        for (let x = 0; x < cols; x += 1) {
            put(x, 0, 'T');
            put(x, rows - 1, 'T');
        }
        for (let y = 0; y < rows; y += 1) {
            put(0, y, 'T');
            put(cols - 1, 'T');
        }
        /* Mirror pond, south-east quadrant. */
        const pondX0 = Math.floor(cols * 0.55);
        const pondY0 = Math.floor(rows * 0.55);
        for (let y = pondY0; y < pondY0 + 5 && y < rows - 1; y += 1) {
            for (let x = pondX0; x < pondX0 + 9 && x < cols - 1; x += 1) {
                put(x, y, '~');
            }
        }
        /* Dirt cross-path through the center + scattered trees/blossoms. */
        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let x = 1; x < cols - 1; x += 1) put(x, cy, ',');
        for (let y = 1; y < rows - 1; y += 1) put(cx, y, ',');
        for (let i = 0; i < Math.floor(cols * rows * 0.05); i += 1) {
            const x = 1 + Math.floor(rng() * (cols - 2));
            const y = 1 + Math.floor(rng() * (rows - 2));
            const cellChar = grid[y][x];
            if (cellChar === '.' || cellChar === ',') put(x, y, rng() < 0.5 ? 'T' : '*');
        }
        /* Spawns on the crossing. */
        put(cx, cy, 'P');
        put(cx + 2, cy - 1, 'N');
        put(cx - 3, cy + 1, 'E');
    } else {
        /* Asphalt lanes: two horizontals, three verticals. */
        const laneY1 = Math.floor(rows * 0.33);
        const laneY2 = Math.floor(rows * 0.66);
        for (let x = 1; x < cols - 1; x += 1) {
            put(x, laneY1, ',');
            put(x, laneY2, ',');
        }
        for (const fx of [0.25, 0.5, 0.75]) {
            const laneX = Math.floor(cols * fx);
            for (let y = 1; y < rows - 1; y += 1) put(laneX, y, ',');
        }
        /* Doors punched into street-facing walls + one hazard + a cache. */
        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let i = 0; i < Math.floor(cols * 0.2); i += 1) {
            const x = 2 + Math.floor(rng() * (cols - 4));
            const y = 2 + Math.floor(rng() * (rows - 4));
            if (grid[y][x] === '#') put(x, y, '+');
        }
        put(cx + 3, laneY2 - 2, 'C');
        put(cx - 4, laneY1 + 2, '^');
        put(cx, cy, 'J');
        /* Spawn on the central crossing. */
        put(cx, cy, 'P');
    }

    /* Route through the real parser so validation + spawn extraction run. */
    const parser = new MapParser({ strict: true });
    parser.registerTiles(DIMENSION_TILES);
    const lines = grid.map((row) => row.join(''));
    const map = parser.parseLines(lines, {
        name: `fallback_${isDream ? 'grove' : 'city'}`,
        strict: true
    });

    const audit = verifyMapInvariants(map);
    if (!audit.ok) {
        throw new Error(
            `[MapParser_2] Fallback generation produced invalid map: ${audit.violations.join('; ')}`
        );
    }
    return map;
}

/* ══════════════════════════════════════════════════════════════════════════
   DIMENSION MAP LOADING (PARSER OF RECORD FOR CLIENT + SERVER)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Parses every dimension source through the hardened pipeline:
 * dimension tiles registered → parse (strict by default, lenient repair
 * allowed) → invariant verification → procedural fallback when a source
 * is missing or broken. The returned maps object ALWAYS contains one
 * verified, playable GameMap per WORLD key.
 *
 * @param {Object} spec
 * @param {Object<string, string>} spec.sources World id → map text.
 * @param {Object<string, string>} [spec.names] World id → display name.
 * @param {boolean} [spec.strict=true] Default parse strictness.
 * @param {boolean} [spec.allowFallback=true] Generate fallbacks on failure.
 * @returns {{maps: Object<string, GameMap>, warnings: string[], usedFallback: string[]}}
 */
export function loadDimensionMaps({
    sources,
    names = {},
    strict = true,
    allowFallback = true
}) {
    const parser = new MapParser({ strict });
    parser.registerTiles(DIMENSION_TILES);

    const maps = {};
    const warnings = [];
    const usedFallback = [];
    const worlds = Object.keys(sources);

    for (const worldId of worlds) {
        let map = null;
        try {
            map = parser.parse(sources[worldId], {
                name: names[worldId] ?? `${worldId}_map`,
                strict
            });
        } catch (error) {
            warnings.push(`[${worldId}] parse failed: ${error.message}`);
        }

        if (map) {
            const audit = verifyMapInvariants(map);
            if (!audit.ok) {
                warnings.push(`[${worldId}] ${audit.violations.join('; ')}`);
                map = null;
            }
        }

        if (!map) {
            if (!allowFallback) {
                throw new MapParseError(
                    `[MapParser_2] ${worldId} failed and fallbacks are disabled`,
                    { worldId }
                );
            }
            map = generateFallbackMap(worldId, { seed: hashString(worldId) });
            usedFallback.push(worldId);
            warnings.push(`[${worldId}] using deterministic fallback map`);
        }

        maps[worldId] = map;
    }

    return { maps, warnings, usedFallback };
}

/**
 * Tiny FNV-1a string hash → 32-bit seed for per-world fallback determinism.
 * @param {string} text Input text.
 * @returns {number} Unsigned 32-bit hash.
 */
function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export default loadDimensionMaps;
