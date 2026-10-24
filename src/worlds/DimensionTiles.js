/**
 * @file src/worlds/DimensionTiles.js
 * @module worlds/DimensionTiles
 * @description
 * Shared tile registry for YUCCA's two dimensions — imported by BOTH the
 * browser client (DimensionContent) and the authoritative server
 * (server.js), which is why it must stay free of any Vite-only asset
 * imports (`?raw`) and DOM references. Whatever glyphs and walkability
 * rules live here define collision identically on both sides of the wire.
 *
 * Layered over MapParser's DEFAULT_TILE_DEFINITIONS (grass, path, water,
 * spawns, …); this module adds the dimension-specific architecture
 * glyphs. Blueprint §3.1 density mapping: tree trunks and rock faces are
 * high-density, unwalkable, opaque; the Juice Cart is a solid landmark.
 *
 * @example
 * import { MapParser } from './MapParser.js';
 * import { DIMENSION_TILES } from './DimensionTiles.js';
 * const parser = new MapParser({ strict: true });
 * parser.registerTiles(DIMENSION_TILES);
 */

/**
 * Dimension-specific glyphs merged over the default registry.
 * @type {Object<string, Object>}
 */
export const DIMENSION_TILES = Object.freeze({
    T: Object.freeze({
        name: 'Grove Tree',
        isWalkable: false,
        isTransparent: false,
        renderColor: '#3e8e46',
        backgroundHighlight: '#0a1a0c',
        interactionId: null
    }),
    M: Object.freeze({
        name: 'Mossy Rock',
        isWalkable: false,
        isTransparent: false,
        renderColor: '#8a8f7a',
        backgroundHighlight: '#101208',
        interactionId: null
    }),
    '#': Object.freeze({
        name: 'Concrete Wall',
        isWalkable: false,
        isTransparent: false,
        renderColor: '#9aa3ad',
        backgroundHighlight: '#14161a',
        interactionId: null
    }),
    J: Object.freeze({
        name: 'Orange Juice Cart',
        isWalkable: false,
        isTransparent: true,
        renderColor: '#ff7700',
        backgroundHighlight: '#241505',
        interactionId: 'JUICE_CART'
    })
});

/**
 * Terrain acoustic classes used by the footstep audio layer: soft grove
 * ground, hard city asphalt, and hollow boards. Tiles not listed fall
 * back to SOFT. Shared so the server could validate footstep terrain
 * claims if ever needed; today only the client consumes it.
 * @enum {string}
 */
export const TERRAIN_ACOUSTIC = Object.freeze({
    SOFT: 'SOFT',
    HARD: 'HARD',
    HOLLOW: 'HOLLOW'
});

/**
 * Maps a tile name (GameMap.getTileAt(x, y).name) to its acoustic class.
 * @param {string} tileName Tile name from the registry.
 * @returns {string} TERRAIN_ACOUSTIC value.
 */
export function acousticClassForTile(tileName) {
    switch (tileName) {
        case 'Verdant Grass':
        case 'Dream Blossom':
        case 'Dirt Path':
        case 'Player Spawn':
        case 'NPC Spawn':
        case 'Enemy Spawn':
        case 'Dream Portal':
            return TERRAIN_ACOUSTIC.SOFT;
        case 'Void':
        case 'Water':
            return TERRAIN_ACOUSTIC.HOLLOW;
        default:
            // City asphalt, concrete lips, thresholds — everything urban.
            return TERRAIN_ACOUSTIC.HARD;
    }
}
