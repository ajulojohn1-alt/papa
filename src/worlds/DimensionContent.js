/**
 * @file src/worlds/DimensionContent.js
 * @module worlds/DimensionContent
 * @description
 * Composition wiring for the two shipped dimensions: parses the ASCII
 * map documents, installs their buffers and per-frame terrain stampers,
 * constructs the Player at the shared-coordinate spawn, owns the orange
 * EnergySystem, attaches the WaterShader, and registers the interactable
 * NPCs (the grove mender and the Juice Cart vendor).
 *
 * This module is the MapParser integration point the engine exposes:
 *   WorldManager.setWorldBuffer()  — installs each parsed grid,
 *   Game.setTerrainStamper()       — re-stamps terrain every frame,
 *   Game.attachPlayer / attachEnergySystem / attachWaterShader /
 *   Game.registerInteractableNPC() — gameplay seams.
 *
 * Called once from src/index.js after the Game orchestrator exists.
 * Everything degrades gracefully: if a map fails to parse, the engine
 * keeps running on WorldManager's presentable void grids and the failure
 * is logged, never fatal.
 *
 * @example
 * import { loadDimensionContent } from './worlds/DimensionContent.js';
 * const game = new Game(canvas, options);
 * loadDimensionContent(game);
 * await game.start();
 */

import { WORLD, SHIFT_REASON } from './WorldManager.js';
import { MapParser } from './MapParser.js';
import { WaterShader } from './WaterShader.js';
import { EnergySystem } from '../systems/EnergySystem.js';
import { Player } from '../entities/Player.js';
import { NPC } from '../entities/NPC.js';
import dreamMapSource from '../../assets/data/dream-grove.txt?raw';
import drabMapSource from '../../assets/data/drab-streets.txt?raw';

/* ══════════════════════════════════════════════════════════════════════════
   EXTENDED TILE REGISTRY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dimension-specific glyphs layered over MapParser's default registry
 * via parser.registerTiles() (blueprint §3.1 density mapping: tree
 * trunks and rock are high-density, unwalkable, opaque).
 * @type {Object<string, Object>}
 */
const EXTENDED_TILES = Object.freeze({
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

/* ══════════════════════════════════════════════════════════════════════════
   NPC DIALOGUE (schema: {start, nodes: {id: {text[], next?, choices?[]}}})
   ══════════════════════════════════════════════════════════════════════════ */

/** Ira, mender of the Loom — grove keeper in the Dream World. */
const IRA_DIALOGUE = Object.freeze({
    start: 'greeting',
    nodes: Object.freeze({
        greeting: Object.freeze({
            text: Object.freeze([
                'Hold a moment, traveler. The stitches of this hour are loose.',
                'I am Ira, mender of the Loom. You carry a live thread — rare, these days.'
            ]),
            choices: Object.freeze([
                Object.freeze({ label: "What's wrong with time?", next: 'anomaly_brief' }),
                Object.freeze({ label: 'How do I keep my energy up?', next: 'energy_hint' }),
                Object.freeze({ label: 'Just passing through.', next: 'farewell' })
            ])
        }),
        anomaly_brief: Object.freeze({
            text: Object.freeze([
                'Where a patch comes loose, the stillness leaks through.',
                'Mind the lake road east — the reflection there shows what the hour used to be.'
            ]),
            next: 'farewell'
        }),
        energy_hint: Object.freeze({
            text: Object.freeze([
                'Your oranges are the thread that keeps the Dream sewn to you.',
                'Spend them and the world turns gray and drab. Find the Juice Cart',
                'in that gray city, drink deep, and the color comes home.'
            ]),
            next: 'farewell'
        }),
        farewell: Object.freeze({
            text: Object.freeze(['Walk softly. The hour is thin.'])
        })
    })
});

/** The Juice Cart vendor — the recovery loop anchor in the Drab World. */
const VENDOR_DIALOGUE = Object.freeze({
    start: 'greeting',
    nodes: Object.freeze({
        greeting: Object.freeze({
            text: Object.freeze([
                'Cold pressed, corner of 4th and Always. One cup on the house —',
                'you look like the color drained right out of you.'
            ]),
            choices: Object.freeze([
                Object.freeze({ label: '[Drink the juice]', next: 'served' }),
                Object.freeze({ label: 'Maybe later.', next: 'farewell' })
            ])
        }),
        served: Object.freeze({
            text: Object.freeze([
                'There it is. Back to the grove with you — and mind the rain,',
                'it gets in the stitches.'
            ]),
            next: 'farewell'
        }),
        farewell: Object.freeze({
            text: Object.freeze(['Cart\'s here every gray morning.'])
        })
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   CONTENT LOADING
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Parses, installs, and wires all shipped dimension content onto a live
 * Game orchestrator. Safe to call exactly once, after the Game exists
 * and before game.start().
 *
 * @param {import('../core/Game.js').Game} game Live orchestrator.
 * @returns {?Object} Content handles ({player, energy, water, npcs}) or
 *   null when the maps could not be parsed (engine continues on void grids).
 */
export function loadDimensionContent(game) {
    /* ---- Parse both dimension documents ------------------------------ */
    const parser = new MapParser({ strict: true });
    parser.registerTiles(EXTENDED_TILES);

    let dreamMap;
    let drabMap;
    try {
        dreamMap = parser.parse(dreamMapSource, { name: 'dream_grove' });
        drabMap = parser.parse(drabMapSource, { name: 'drab_streets' });
    } catch (error) {
        console.error('[DimensionContent] Map parse failed; running on void grids:', error);
        return null;
    }
    for (const warning of [...dreamMap.warnings, ...drabMap.warnings]) {
        console.warn('[DimensionContent]', warning);
    }

    const worlds = game._worlds;
    const renderer = game._renderer;
    const input = game._input;
    const cellW = renderer.cellWidth;
    const cellH = renderer.cellHeight;
    const initialWorld = worlds.getActiveWorldId();

    /* ---- Install parsed grids + per-frame terrain restampers --------- */
    worlds.setWorldBuffer(WORLD.DREAM, dreamMap.createASCIIBuffer(), { silent: true });
    worlds.setWorldBuffer(WORLD.DRAB, drabMap.createASCIIBuffer(), { silent: true });
    game.setTerrainStamper(WORLD.DREAM, (buffer) => dreamMap.stampInto(buffer));
    game.setTerrainStamper(WORLD.DRAB, (buffer) => drabMap.stampInto(buffer));

    /* ---- Water shader: mirror-math + dual-harmonic ripples ----------- */
    const water = new WaterShader({
        waterGlyphs: ['~'],
        frequency: 0.55,
        speed: 2.2,
        amplitude: 1.4,
        secondaryWave: { frequency: 1.9, speed: 3.1, amplitude: 0.6, phase: 1.3 },
        opacity: 0.85,
        depthFade: 0.06
    });
    game.attachWaterShader(water);

    /* ---- Orange energy: the reality anchor --------------------------- */
    const energy = new EnergySystem({ maxEnergy: 20, world: initialWorld });
    energy.attachWorldManager(worlds);
    game.attachEnergySystem(energy);

    /* ---- Player at the shared-coordinate spawn ----------------------- */
    const sourceMap = initialWorld === WORLD.DREAM ? dreamMap : drabMap;
    const spawn = sourceMap.getPlayerSpawn() ?? { x: 1, y: 1 };
    const player = new Player({
        x: (spawn.x + 0.5) * cellW,
        y: (spawn.y + 0.5) * cellH,
        input,
        energySystem: energy,
        cellWidth: cellW,
        cellHeight: cellH,
        world: initialWorld
    });
    game.attachPlayer(player);

    /* ---- Interactable NPCs (gated per dimension) ---------------------- */
    const centerOf = (col, row) => ({ x: (col + 0.5) * cellW, y: (row + 0.5) * cellH });
    const groveSpot = centerOf(22, 12);
    const vendorSpot = centerOf(47, 18);

    const ira = new NPC({
        ...groveSpot,
        name: 'Ira',
        char: 'I',
        fgColor: '#ffd27f',
        interactionRadius: 56,
        dialogue: IRA_DIALOGUE
    });
    const vendor = new NPC({
        ...vendorSpot,
        name: 'Juice Vendor',
        char: 'V',
        fgColor: '#ff7700',
        interactionRadius: 64,
        dialogue: VENDOR_DIALOGUE
    });
    game.registerInteractableNPC(ira);
    game.registerInteractableNPC(vendor);

    /**
     * Entity presenter adapter. The Player is NOT updated here — Game's
     * _updatePlaying owns player.handleInput/update directly — this seam
     * only advances and presents the NPCs of the ACTIVE dimension, so the
     * mender never flickers into the gray city and the vendor never
     * haunts the grove.
     */
    const npcsByWorld = {
        [WORLD.DREAM]: [ira],
        [WORLD.DRAB]: [vendor]
    };
    game.attachEntityManager({
        update(dt, playerArg) {
            for (const npc of npcsByWorld[worlds.getActiveWorldId()] ?? []) {
                npc.update(dt, playerArg);
            }
        },
        render(buffer, camera, alpha) {
            player.render(buffer, camera, alpha);
            for (const npc of npcsByWorld[worlds.getActiveWorldId()] ?? []) {
                npc.render(buffer, camera, alpha);
            }
        }
    });

    /* ---- Juice Cart transaction: close the vendor's conversation in the
     * Drab World while depleted → refill → 'restored' → Game fades the
     * player back into the Dream World (blueprint recovery loop). ------- */
    game.on('dialogueclose', ({ npcId }) => {
        if (npcId !== vendor.id) return;
        if (worlds.isDrab() && energy.isDepleted) {
            energy.consumeJuice();
        }
    });

    /* ---- Softlock guard: a juice purchase that lands while a transition
     * is still settling gets its 'restored' shift rejected by
     * WorldManager's in-flight guard (a deliberate engine rule). Re-issue
     * the request once the world settles so a refilled player is never
     * stranded in the Drab World with a full orange reserve. ------------ */
    worlds.on('transitioncomplete', () => {
        if (worlds.isDrab() && !energy.isDepleted) {
            game.requestDimensionShift(WORLD.DREAM, SHIFT_REASON.JUICE_CONSUMED);
        }
    });

    console.info(
        `[DimensionContent] Loaded ${dreamMap.name} (${dreamMap.cols}x${dreamMap.rows}) ` +
        `and ${drabMap.name} (${drabMap.cols}x${drabMap.rows}); ` +
        `player at (${spawn.x},${spawn.y}) in ${initialWorld}.`
    );

    return { player, energy, water, npcs: { ira, vendor }, maps: { dreamMap, drabMap } };
}

export default loadDimensionContent;
