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
import { loadDimensionMaps } from './MapParser_2.js';
import { acousticClassForTile, TERRAIN_ACOUSTIC } from './DimensionTiles.js';
import { WaterShader } from './WaterShader.js';
import { EnergySystem } from '../systems/EnergySystem.js';
import { Player } from '../entities/Player.js';
import { NPC } from '../entities/NPC.js';
import { SFX_NAME } from '../audio/SoundEffects.js';
import dreamMapSource from '../../assets/data/dream-grove.txt?raw';
import drabMapSource from '../../assets/data/drab-streets.txt?raw';

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
 * Map ingestion runs through MapParser_2 (schema verification + deterministic
 * fallback generation), so this NEVER returns null for map reasons — a
 * corrupted document degrades to a playable procedural dimension.
 *
 * @param {import('../core/Game.js').Game} game Live orchestrator.
 * @returns {?Object} Content handles ({player, energy, water, npcs, maps}).
 */
export function loadDimensionContent(game) {
    /* ---- Parse both dimension documents (hardened pipeline) ----------- */
    const { maps, warnings, usedFallback } = loadDimensionMaps({
        sources: {
            [WORLD.DREAM]: dreamMapSource,
            [WORLD.DRAB]: drabMapSource
        },
        names: {
            [WORLD.DREAM]: 'dream_grove',
            [WORLD.DRAB]: 'drab_streets'
        }
    });
    for (const warning of warnings) {
        console.warn('[DimensionContent]', warning);
    }
    const dreamMap = maps[WORLD.DREAM];
    const drabMap = maps[WORLD.DRAB];

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

    /* ---- Interactable NPCs (spots derived from map data, fallback-safe) */
    const centerOf = (col, row) => ({ x: (col + 0.5) * cellW, y: (row + 0.5) * cellH });

    /** Grove keeper at the map's NPC spawn, or beside the player spawn. */
    const groveNpcSpawn = dreamMap.getSpawnsByType('NPC')[0]
        ?? { x: Math.min(dreamMap.cols - 2, spawn.x + 2), y: spawn.y };

    /**
     * Vendor stands beside the Juice Cart tile when the map ships one;
     * otherwise next to the player spawn. Always verified walkable so a
     * deterministic fallback map never embeds her in a wall.
     */
    const vendorSpotCell = (() => {
        const cartCell = drabMap.findInteractionCells('JUICE_CART')[0];
        const anchors = [];
        if (cartCell) {
            anchors.push(
                { x: cartCell.x + 1, y: cartCell.y },
                { x: cartCell.x - 1, y: cartCell.y },
                { x: cartCell.x, y: cartCell.y + 1 },
                { x: cartCell.x, y: cartCell.y - 1 }
            );
        }
        const drabSpawn = drabMap.getPlayerSpawn() ?? { x: 1, y: 1 };
        anchors.push(
            { x: drabSpawn.x + 1, y: drabSpawn.y },
            { x: drabSpawn.x, y: drabSpawn.y + 1 },
            { x: drabSpawn.x, y: drabSpawn.y }
        );
        return anchors.find((c) => drabMap.isWalkableAt(c.x, c.y)) ?? drabSpawn;
    })();

    const ira = new NPC({
        ...centerOf(groveNpcSpawn.x, groveNpcSpawn.y),
        name: 'Ira',
        char: 'I',
        fgColor: '#ffd27f',
        interactionRadius: 56,
        dialogue: IRA_DIALOGUE
    });
    const vendor = new NPC({
        ...centerOf(vendorSpotCell.x, vendorSpotCell.y),
        name: 'Juice Vendor',
        char: 'V',
        fgColor: '#ff7700',
        interactionRadius: 64,
        dialogue: VENDOR_DIALOGUE
    });
    game.registerInteractableNPC(ira);
    game.registerInteractableNPC(vendor);

    /* ---- GPU radial lights (hybrid presenter) --------------------------
     * Static warm sources layered under the automatic player aura each
     * frame: the grove keeper's hearth in the Dream, the mobile juice
     * cart's orange glow in the Drab. Game filters them by the ACTIVE
     * dimension, so the hearth never bleeds into the city. The fragment
     * shader renders them as squared-falloff radial gradients in world
     * pixel space (engine/Engine.js). --------------------------------- */
    game.registerWorldLight({
        world: WORLD.DREAM,
        x: ira.x,
        y: ira.y,
        radius: 175,
        color: '#ffcf7d',
        intensity: 0.55
    });
    game.registerWorldLight({
        world: WORLD.DRAB,
        x: vendor.x,
        y: vendor.y,
        radius: 150,
        color: '#ff7700',
        intensity: 0.6
    });

    /**
     * Entity presenter adapter. The Player is NOT updated here — Game's
     * _updatePlaying owns player.handleInput/update directly — this seam
     * only advances and presents the NPCs of the ACTIVE dimension plus
     * the network's same-dimension remote ghosts, so the mender never
     * flickers into the gray city and the vendor never haunts the grove.
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
            /* Remote players, interpolated by the NetworkManager. */
            const network = game._network;
            if (network && typeof network.getGhosts === 'function') {
                for (const ghost of network.getGhosts()) {
                    ghost.render(buffer, camera, alpha);
                }
            }
        }
    });

    /* ---- Terrain-aware footsteps: every stride event maps through the
     * active map's tile registry into an acoustically tuned SFX voice
     * (soft grove ground vs. hard city asphalt; sprint pushes gain). ---- */
    player.addEventListener('footstep', (detail) => {
        const map = worlds.isDrab() ? drabMap : dreamMap;
        const col = Math.floor(detail.x / cellW);
        const row = Math.floor(detail.y / cellH);
        const snap = map.isInBounds(col, row) ? map.getTileAt(col, row) : null;
        const acoustic = acousticClassForTile(snap?.tile?.name ?? 'Concrete Wall');

        game._sfx.play(SFX_NAME.FOOTSTEP, {
            gainScale: detail.sprint ? 1.15 : (acoustic === TERRAIN_ACOUSTIC.SOFT ? 0.7 : 0.95),
            filter: acoustic === TERRAIN_ACOUSTIC.SOFT
                ? { type: 'lowpass', frequency: 900 }
                : (acoustic === TERRAIN_ACOUSTIC.HOLLOW
                    ? { type: 'highpass', frequency: 500 }
                    : null),
            pan: null
        });
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
     * is still settling gets its 'restored' fade-home REJECTED by
     * WorldManager's in-flight guard (a deliberate engine rule). The
     * guard arms ONLY in that case — when the fade-home actually started,
     * or no shift was needed, it stays disarmed so intentional visits to
     * the Drab World (DIMENSION_FOCUS toggle) are never yanked back. --- */
    let restoreShiftPending = false;
    energy.addEventListener('restored', () => {
        const status = worlds.getTransitionStatus();
        restoreShiftPending = !(status.active && status.to === WORLD.DREAM);
    });
    worlds.on('transitioncomplete', () => {
        if (worlds.isDream()) {
            restoreShiftPending = false;
            return;
        }
        if (restoreShiftPending && worlds.isDrab() && !energy.isDepleted) {
            restoreShiftPending = false;
            game.requestDimensionShift(WORLD.DREAM, SHIFT_REASON.JUICE_CONSUMED);
        }
    });

    console.info(
        `[DimensionContent] Loaded ${dreamMap.name} (${dreamMap.cols}x${dreamMap.rows}) ` +
        `and ${drabMap.name} (${drabMap.cols}x${drabMap.rows}); ` +
        `player at (${spawn.x},${spawn.y}) in ${initialWorld}` +
        `${usedFallback.length ? ` [fallback: ${usedFallback.join(', ')}]` : ''}.`
    );

    return {
        player,
        energy,
        water,
        npcs: { ira, vendor },
        maps: { dreamMap, drabMap },
        usedFallback
    };
}

export default loadDimensionContent;
