/**
 * @file src/core/Game.js
 * @module core/Game
 * @description
 * Master engine orchestrator and application entry point for
 * "YUCCA".
 *
 * Game owns the canvas, constructs every subsystem in dependency order,
 * binds the fixed-timestep loop, runs the global application state
 * machine, and fans dimension-shift events out to world, audio, weather,
 * entity, and UI layers. It is the single object `src/index.js` instantiates.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SUBSYSTEM INITIALIZATION ORDER (DEPENDENCY-DRIVEN)
 * ───────────────────────────────────────────────────────────────────────────
 * Construction proceeds strictly bottom-up so every consumer finds its
 * dependencies already wired:
 *
 *     1. Renderer            — owns the CanvasRenderingContext2D.
 *     2. InputManager        — DOM capture; no deps beyond the canvas.
 *     3. GameLoop            — fixed-timestep pump; callbacks bound last.
 *     4. WorldManager        — owns the Camera + per-world buffers; needs Renderer.
 *     5. WeatherSystem       — needs cell metrics + the Camera.
 *     6. AudioEngine         — Web Audio graph; attaches to World + Weather.
 *     7. SoundEffects        — SFX library layered on AudioEngine.
 *     8. UIManager           — panels/toasts; needs Renderer + World + Camera.
 *     9. HUD                 — status bars/radar; needs Renderer + World + Camera.
 *    10. DialogueBox         — typewriter; needs Renderer.
 *
 * Game systems whose modules land incrementally (Player, EnergySystem,
 * CombatSystem, QuestSystem, EntityManager, InventorySystem, NetworkManager,
 * WaterShader) are integrated through typed attach() seams. This mirrors the
 * project's duck-typing convention (NPC duck-types QuestSystem, HUD
 * duck-types providers, WeatherSystem duck-types Camera) and keeps Game.js
 * fully bootable before every module exists — the same "always presentable"
 * guarantee WorldManager applies to maps.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FIXED TIMESTEP INTEGRATION
 * ───────────────────────────────────────────────────────────────────────────
 * Game delegates accumulator math to GameLoop (see engine/GameLoop.js). The
 * loop invokes two callbacks:
 *
 *     update(dt)     — called 0..N times per frame at a FIXED dt. Game
 *                      advances simulation subsystems in dependency order.
 *     render(alpha)  — called once per displayed frame. alpha is the
 *                      un-simulated tick fraction used for interpolation.
 *
 * Input edges are committed EXACTLY once per tick. WorldManager.update
 * normally owns InputManager.update(), but because Game must commit input
 * even in states where the world simulation is frozen (menus, pause), Game
 * commits the edges itself and passes a null input handle into
 * WorldManager.update to avoid a double-commit that would swallow edges.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * GLOBAL STATE MACHINE
 * ───────────────────────────────────────────────────────────────────────────
 *     LOADING ──► MAIN_MENU ──► PLAYING ⇄ PAUSED
 *                                  │  ▲
 *                                  ▼  │
 *                           DIALOGUE_ACTIVE
 *                                  │
 *                                  ▼
 *                              GAME_OVER ──► MAIN_MENU
 *
 * Each state gates WHICH subsystems advance. Simulation (player, entities,
 * energy, combat, quest) runs only in PLAYING and DIALOGUE_ACTIVE. Weather
 * ambience additionally runs in MAIN_MENU. Rendering always runs so pause
 * and game-over overlays stay live. In-game pause freezes simulation via
 * the state machine rather than GameLoop.pause(), so the pause overlay can
 * keep rendering; GameLoop.pause/stop are reserved for app-level suspend
 * (tab hidden) and shutdown.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DUAL-WORLD / DIMENSION DISPATCH
 * ───────────────────────────────────────────────────────────────────────────
 * Dimension shifts are coordinated centrally. Triggers:
 *   • EnergySystem 'depleted'   → requestShift(DRAB, ENERGY_DEPLETED)
 *   • EnergySystem 'restored'   → requestShift(DREAM, JUICE_CONSUMED)
 *   • DIMENSION_FOCUS key       → scripted toggle to the other world
 *   • public requestDimensionShift(target, reason)
 *
 * WorldManager emits 'worldchanged' at the mid-transition commit; Game fans
 * that out to WeatherSystem.setWorld, the player's form swap (poncho↔suit),
 * a dimension SFX cue, and a UI banner. AudioEngine crossfades its own BGM
 * because it subscribes to WorldManager directly via attachWorldManager.
 *
 * @example
 * import Game from './core/Game.js';
 * const canvas = document.getElementById('gameCanvas');
 * const game = new Game(canvas, { fixedTimeStep: 1 / 60 });
 *
 * // Wire gameplay modules as they come online:
 * game.attachPlayer(player);
 * game.attachEnergySystem(energy);
 * game.attachCombatSystem(combat);
 * game.attachQuestSystem(quests);
 * game.attachEntityManager(entities);
 * game.registerInteractableNPC(ira);
 *
 * await game.start();      // LOADING → MAIN_MENU
 * game.startGame();        // MAIN_MENU → PLAYING
 */

import { GameLoop } from '../engine/GameLoop.js';
import { Renderer } from '../engine/Renderer.js';
import { Engine } from '../engine/Engine.js';
import { InputManager } from '../engine/InputManager.js';
import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';
import { WorldManager, WORLD, SHIFT_REASON } from '../worlds/WorldManager.js';
import { WeatherSystem } from '../worlds/WeatherSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { HUD } from '../ui/HUD.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { LoadingScreen } from '../ui/LoadingScreen.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { SoundEffects, SFX_NAME } from '../audio/SoundEffects.js';

/* ══════════════════════════════════════════════════════════════════════════
   ENUMERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Global application states.
 * @enum {string}
 */
export const GAME_STATE = Object.freeze({
    LOADING: 'LOADING',
    MAIN_MENU: 'MAIN_MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    DIALOGUE_ACTIVE: 'DIALOGUE_ACTIVE',
    GAME_OVER: 'GAME_OVER'
});

/* ══════════════════════════════════════════════════════════════════════════
   PURE HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clamps a value into [0, 1].
 * @param {number} v Candidate.
 * @returns {number}
 */
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Cubic ease-out: fast start, decelerating finish. f(p) = 1 − (1 − p)³.
 * Matches WorldManager's transition easing.
 * @param {number} p Progress [0, 1].
 * @returns {number}
 */
function easeOutCubic(p) {
    return 1 - Math.pow(1 - clamp01(p), 3);
}

/**
 * Deterministic three-sine beat-interference noise in [0, 1]. Identical to
 * WorldManager.flickerNoise and the energy-flicker aesthetic, so the shift
 * overlay glitches in sympathy with the reality-collapse signal.
 * @param {number} t Simulation seconds.
 * @returns {number}
 */
function flickerNoise(t) {
    const interference = Math.sin(t * 31.7) * Math.sin(t * 17.3) + Math.sin(t * 7.9);
    return Math.min(1, Math.abs(interference) / 2);
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS (INTEGRATION CONTRACTS)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Duck-typed Player contract consumed by Game. Satisfied by entities/Player.
 * @typedef {Object} GamePlayer
 * @property {number} x World x, CSS px.
 * @property {number} y World y, CSS px.
 * @property {Function} [handleInput] (input) => void.
 * @property {Function} [update] (dt) => void.
 * @property {Function} [setControlEnabled] (bool) => void.
 * @property {Function} [setDimension] (worldId) => void — poncho/suit swap.
 * @property {Function} [addEventListener] Entity event bus.
 */

/**
 * Duck-typed EnergySystem contract. Emits 'depleted' at zero oranges and
 * 'restored' after juice consumption — the two dimension-shift triggers.
 * @typedef {Object} GameEnergySystem
 * @property {Function} update (dt, input) => void.
 * @property {Function} addEventListener (type, listener) => this.
 */

/**
 * Duck-typed EntityManager contract: advances and presents all entities.
 * @typedef {Object} GameEntityManager
 * @property {Function} update (dt, player) => void.
 * @property {Function} render (buffer, camera, alpha) => number.
 */

/* ══════════════════════════════════════════════════════════════════════════
   GAME
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Central engine orchestrator: builds every subsystem, runs the fixed-step
 * loop, drives the application state machine, and coordinates dual-world
 * transitions.
 */
export class Game {
    /**
     * @param {HTMLCanvasElement} canvas The #gameCanvas element.
     * @param {Object} [options]
     * @param {number} [options.fixedTimeStep=1/60] Simulation tick, seconds.
     * @param {number} [options.maxFrameSkips=5] Catch-up tick budget per frame.
     * @param {string} [options.initialWorld='DREAM'] Starting dimension.
     * @param {number} [options.seed] Shared PRNG seed for weather/audio.
     * @param {Object} [options.audio] AudioEngine option overrides.
     * @param {Object} [options.worlds] WorldManager option overrides.
     * @throws {TypeError|RangeError} If the canvas or options are invalid.
     */
    constructor(canvas, options = {}) {
        if (!canvas || typeof canvas.getContext !== 'function') {
            throw new TypeError('[Game] A canvas element is required.');
        }
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[Game] options must be an object.');
        }

        /** @type {HTMLCanvasElement} */
        this._canvas = canvas;
        /** @type {CanvasRenderingContext2D} */
        this._ctx = canvas.getContext('2d');
        if (!this._ctx) {
            throw new TypeError('[Game] Unable to acquire a 2D context.');
        }
        /** @type {Object} */
        this._options = options;

        /* ---- Application state ---------------------------------------- */
        /** @type {string} Current GAME_STATE value. */
        this._state = GAME_STATE.LOADING;
        /** @type {boolean} start() latch. */
        this._started = false;
        /** @type {number} Accumulated simulation clock, seconds. */
        this._simTime = 0;

        /* ---- Event bus ------------------------------------------------ */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /* ────────────────────────────────────────────────────────────────
           SUBSYSTEM CONSTRUCTION (dependency order — see header)
           ──────────────────────────────────────────────────────────────── */

        /* 1. Renderer. */
        const display = this._measureDisplay();
        /** @type {Renderer} */
        this._renderer = new Renderer(this._ctx, display);

        /* 1b. Hybrid GPU presenter (engine/Engine.js): a Three.js
         * full-screen quad composites the grid — zoom/pan, radial lights,
         * water ripples, rain sheen, X-ray inversion, depletion glitch —
         * in one draw call. WebGL is an ACCELERATOR, never a dependency:
         * a missing #glCanvas or a failed probe leaves the battle-tested
         * Canvas 2D presenter owning every pixel. */
        /** @type {?Engine} */
        this._gl = null;
        const glCanvas = options.glCanvas ?? null;
        if (glCanvas) {
            try {
                const engine = new Engine(glCanvas, {
                    cellWidth: this._renderer.cellWidth,
                    cellHeight: this._renderer.cellHeight
                });
                if (engine.isSupported) {
                    engine.handleResize(display);
                    this._gl = engine;
                    this._renderer.setGLDelegate(engine);
                    console.info(
                        '%cYUCCA%c hybrid GPU presenter online (%s)',
                        'color:#ff7700;font-weight:bold;',
                        'color:#d7e3ee;',
                        engine.backend
                    );
                } else {
                    engine.destroy();
                    console.info('[Game] WebGL unavailable — Canvas 2D presenter active.');
                }
            } catch (error) {
                console.warn('[Game] GPU presenter failed to boot — Canvas 2D fallback:', error);
                this._gl = null;
            }
        }

        /* 2. Input. */
        /** @type {InputManager} */
        this._input = new InputManager(window, canvas, options.input ?? {});

        /* 3. World manager (owns the Camera + buffers). */
        /** @type {WorldManager} */
        this._worlds = new WorldManager(this._renderer, {
            initialWorld: options.initialWorld ?? WORLD.DREAM,
            ...(options.worlds ?? {})
        });
        /** @type {import('../engine/Camera.js').Camera} */
        this._camera = this._worlds.getCamera();

        /* 4. Weather. */
        /** @type {WeatherSystem} */
        this._weather = new WeatherSystem({
            cellWidth: this._renderer.cellWidth,
            cellHeight: this._renderer.cellHeight,
            seed: options.seed,
            world: this._worlds.getActiveWorldId()
        });
        this._weather.attachCamera(this._camera);

        /* 5. Audio. */
        /** @type {AudioEngine} */
        this._audio = new AudioEngine({
            seed: options.seed,
            world: this._worlds.getActiveWorldId(),
            ...(options.audio ?? {})
        });
        this._audio.attachWorldManager(this._worlds);
        this._audio.attachWeather(this._weather);

        /* 6. SFX library. */
        /** @type {SoundEffects} */
        this._sfx = new SoundEffects(this._audio, { seed: options.seed });
        this._sfx.attachListener(this._camera);

        /* 7. UI. */
        /** @type {UIManager} */
        this._ui = new UIManager(this._renderer);
        this._ui.attachWorldManager(this._worlds);
        this._ui.attachCamera(this._camera);

        /** @type {HUD} */
        this._hud = new HUD(this._renderer);
        this._hud.attachWorldManager(this._worlds);
        this._hud.attachCamera(this._camera);
        this._hud.attachInputManager(this._input);

        /** @type {DialogueBox} */
        this._dialogue = new DialogueBox(this._renderer, {
            charsPerSecond: 55
        });

        /* 11. Boot portrait: the vibrant YUCCA loading screen (ambient
         * spore drift + embroidered poncho) presented during LOADING and
         * MAIN_MENU. Interactive entry: SPACE once the session is ready. */
        /** @type {LoadingScreen} */
        this._loadingScreen = new LoadingScreen(this._renderer, {
            seed: options.seed
        });

        /* ---- Injectable gameplay subsystem slots (attach seams) -------- */
        /** @type {?GamePlayer} */ this._player = null;
        /** @type {?GameEnergySystem} */ this._energy = null;
        /** @type {?Object} */ this._combat = null;
        /** @type {?Object} */ this._quest = null;
        /** @type {?GameEntityManager} */ this._entities = null;
        /** @type {?Object} */ this._inventory = null;
        /** @type {?Object} */ this._network = null;
        /** @type {?Object} */ this._waterShader = null;

        /* ---- Terrain restamp registry (MapParser integration point) ---- */
        /** @type {Map<string, (buffer: ASCIIBuffer, camera: Object) => void>} */
        this._terrainStampers = new Map();

        /* ---- GPU world-light registry ----------------------------------
         * Static/registered radial lights (grove heart, juice-cart glow)
         * layered under the automatic player aura each frame. Filtered by
         * the active dimension during GL frame-state sync. */
        /** @type {Array<{world: ?string, x: number, y: number, radius: number, color: string, intensity: number}>} */
        this._worldLights = [];

        /* ---- Dialogue orchestration state ------------------------------ */
        /** @type {?Object} NPC currently in conversation. */
        this._activeNPC = null;
        /** @type {Set<Object>} Interactable NPCs. */
        this._interactableNPCs = new Set();

        /* ---- World / dimension event wiring ---------------------------- */
        this._worldUnsubs = [
            this._worlds.on('worldchanged', (d) => this._onWorldChanged(d)),
            this._worlds.on('transitionstart', (s) => this._onTransitionStart(s)),
            this._worlds.on('transitioncomplete', (s) => this._onTransitionComplete(s))
        ];

        /* ---- Dialogue box intent wiring -------------------------------- */
        this._dialogue.addEventListener('advance', () => {
            if (this._activeNPC) this._activeNPC.advanceDialogue();
        });
        this._dialogue.addEventListener('optionselected', ({ index }) => {
            if (this._activeNPC) {
                DialogueBox.syncChoiceCursor(this._activeNPC, index);
                this._activeNPC.advanceDialogue();
            }
        });
        this._dialogue.addEventListener('abort', () => {
            if (this._activeNPC) this._activeNPC.endDialogue('closed');
        });

        /* ---- HUD low-energy cue ---------------------------------------- */
        this._hud.addEventListener('energycritical', ({ critical }) => {
            if (critical) this._sfx.play(SFX_NAME.REALITY_FLICKER, { duration: 1.2 });
        });

        /* ---- Game loop (callbacks bound to this instance) -------------- */
        /** @type {GameLoop} */
        this._loop = new GameLoop({
            fixedTimeStep: options.fixedTimeStep ?? 1 / 60,
            maxFrameSkips: options.maxFrameSkips ?? 5,
            update: (dt) => this._update(dt),
            render: (alpha) => this._render(alpha)
        });
    }

    /* ══════════════════════════════════════════════════════════════════
       SUBSYSTEM ATTACH SEAMS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the Player entity. Wires camera pursuit, HUD/UI providers,
     * spatial audio listening, and the hurt SFX cue.
     * @param {?GamePlayer} player Player instance or null.
     * @returns {this}
     */
    attachPlayer(player) {
        this._player = player;
        if (!player) return this;
        this._worlds.setPlayerTarget(player);
        this._hud.attachPlayer(player);
        this._ui.attachPlayer(player);
        this._sfx.attachListener(player);
        if (typeof player.addEventListener === 'function') {
            player.addEventListener('hurt', () => this._sfx.play(SFX_NAME.PLAYER_HURT));
        }
        this._dialogue.setPlayerName(typeof player.name === 'string' ? player.name : null);
        return this;
    }

    /**
     * Attaches the EnergySystem and binds the two dimension-shift triggers:
     * 'depleted' collapses reality into the Drab World, 'restored' returns
     * to the Dream World.
     * @param {?GameEnergySystem} energy EnergySystem or null.
     * @returns {this}
     */
    attachEnergySystem(energy) {
        this._energy = energy;
        if (energy && typeof energy.addEventListener === 'function') {
            energy.addEventListener('depleted', () =>
                this.requestDimensionShift(WORLD.DRAB, SHIFT_REASON.ENERGY_DEPLETED));
            energy.addEventListener('restored', () =>
                this.requestDimensionShift(WORLD.DREAM, SHIFT_REASON.JUICE_CONSUMED));
        }
        return this;
    }

    /**
     * Attaches the CombatSystem (projectile collision, damage, floating text).
     * @param {?Object} combat CombatSystem or null.
     * @returns {this}
     */
    attachCombatSystem(combat) {
        this._combat = combat;
        return this;
    }

    /**
     * Attaches the QuestSystem and forwards it to UI + dialogue consumers.
     * @param {?Object} quest QuestSystem or null.
     * @returns {this}
     */
    attachQuestSystem(quest) {
        this._quest = quest;
        if (quest) this._ui.attachQuestSystem(quest);
        return this;
    }

    /**
     * Attaches the EntityManager that advances and renders all world entities.
     * @param {?GameEntityManager} entities EntityManager or null.
     * @returns {this}
     */
    attachEntityManager(entities) {
        this._entities = entities;
        return this;
    }

    /**
     * Attaches the InventorySystem and exposes it to the UI layer.
     * @param {?Object} inventory InventorySystem or null.
     * @returns {this}
     */
    attachInventorySystem(inventory) {
        this._inventory = inventory;
        if (inventory) this._ui.attachInventory(inventory);
        return this;
    }

    /**
     * Attaches the NetworkManager for WebSocket state sync.
     * @param {?Object} network NetworkManager or null.
     * @returns {this}
     */
    attachNetworkManager(network) {
        this._network = network;
        return this;
    }

    /**
     * Attaches the WaterShader (reflection inversion + sine distortion)
     * and snapshots its water-glyph vocabulary into the GPU presenter so
     * the shader-side ripple pass can flag water cells.
     * @param {?Object} shader WaterShader or null.
     * @returns {this}
     */
    attachWaterShader(shader) {
        this._waterShader = shader;
        if (shader && this._gl && typeof shader.getMetrics === 'function') {
            const { waterGlyphs } = shader.getMetrics();
            this._gl.setWaterGlyphs(waterGlyphs ?? []);
        }
        return this;
    }

    /**
     * Registers a static radial light for the GPU presenter (grove heart,
     * juice-cart glow, boss cores). Lights are world-scoped: they only
     * present while their dimension is active. The player aura is added
     * automatically and never needs registering.
     *
     * @param {Object} light Light descriptor.
     * @param {number} light.x World x, CSS px.
     * @param {number} light.y World y, CSS px.
     * @param {number} [light.radius=140] Falloff radius, CSS px.
     * @param {string} [light.color='#ffb46b'] CSS color.
     * @param {number} [light.intensity=0.5] Peak intensity 0..1.
     * @param {?string} [light.world=null] WORLD id, or null for all worlds.
     * @returns {this}
     */
    registerWorldLight(light) {
        if (!light || !Number.isFinite(light.x) || !Number.isFinite(light.y)) {
            throw new TypeError('[Game] world light requires numeric x and y.');
        }
        this._worldLights.push({
            world: light.world ?? null,
            x: light.x,
            y: light.y,
            radius: Number.isFinite(light.radius) && light.radius > 0 ? light.radius : 140,
            color: typeof light.color === 'string' ? light.color : '#ffb46b',
            intensity: Number.isFinite(light.intensity) ? light.intensity : 0.5
        });
        return this;
    }

    /**
     * Registers the terrain restamp routine for a world. This is the
     * MapParser integration point: after parsing a map, register a stamper
     * that redraws it into the cleared buffer each frame.
     * @param {string} worldId World identifier.
     * @param {(buffer: ASCIIBuffer, camera: Object) => void} stamper
     * @returns {this}
     */
    setTerrainStamper(worldId, stamper) {
        if (typeof worldId !== 'string' || typeof stamper !== 'function') {
            throw new TypeError('[Game] stamper must be a function.');
        }
        this._terrainStampers.set(worldId, stamper);
        return this;
    }

    /**
     * Registers an interactable NPC: subscribes proximity hints and the
     * dialogue-end handler, and adds it to the interaction candidate set.
     * @param {Object} npc NPC instance.
     * @returns {this}
     */
    registerInteractableNPC(npc) {
        if (!npc || typeof npc.addEventListener !== 'function') {
            throw new TypeError('[Game] npc must expose addEventListener.');
        }
        npc.addEventListener('rangeenter', () => {
            this._ui.setHint(`[E] Speak with ${npc.name}`);
        });
        npc.addEventListener('rangeexit', () => {
            this._ui.setHint(null);
        });
        npc.addEventListener('dialogueend', () => {
            this._handleDialogueEnd(npc);
        });
        if (this._quest && typeof npc.attachQuestSystem === 'function') {
            npc.attachQuestSystem(this._quest);
        }
        this._interactableNPCs.add(npc);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Boots the engine: starts the loop, preloads both world buffers, and
     * transitions LOADING → MAIN_MENU. Idempotent.
     * @returns {Promise<this>}
     */
    async start() {
        if (this._started) return this;
        this._started = true;
        this.setState(GAME_STATE.LOADING);
        this._loop.start();
        try {
            await Promise.all([
                this._worlds.loadWorldBuffer(WORLD.DREAM),
                this._worlds.loadWorldBuffer(WORLD.DRAB)
            ]);
        } catch (error) {
            console.error('[Game] world preload failed:', error);
        }
        this.setState(GAME_STATE.MAIN_MENU);
        return this;
    }

    /**
     * Begins a play session: MAIN_MENU → PLAYING. Re-enables player control
     * and confirms the starting dimension is resident.
     * @returns {this}
     */
    startGame() {
        if (this._state !== GAME_STATE.MAIN_MENU &&
            this._state !== GAME_STATE.GAME_OVER &&
            this._state !== GAME_STATE.LOADING) {
            return this;
        }
        if (this._player && typeof this._player.setControlEnabled === 'function') {
            this._player.setControlEnabled(true);
        }
        this.setState(GAME_STATE.PLAYING);
        this.emit('gamestart', { world: this._worlds.getActiveWorldId() });
        return this;
    }

    /**
     * Halts the engine and tears down every subsystem. The instance must
     * not be reused after destroy().
     * @returns {void}
     */
    destroy() {
        this._loop.stop();
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.warn('[Game] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];
        this._input.destroy();
        this._sfx.destroy();
        this._audio.destroy();
        this._ui.destroy();
        this._hud.destroy();
        this._dialogue.destroy();
        this._weather.destroy();
        this._loadingScreen.destroy();
        /* GPU teardown BEFORE releasing the delegate: the Renderer's
         * setGLDelegate(null) repaints opaque 2D, which must never race a
         * live GL context on the same composite. */
        if (this._gl) {
            this._gl.destroy();
            this._gl = null;
        }
        this._renderer.setGLDelegate(null);
        this._interactableNPCs.clear();
        this._terrainStampers.clear();
        this._worldLights.length = 0;
        this._listeners.clear();
    }

    /* ══════════════════════════════════════════════════════════════════
       GLOBAL STATE MACHINE
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {string} Current GAME_STATE value. */
    get state() {
        return this._state;
    }

    /**
     * Transitions the application state machine, running exit/enter hooks
     * that freeze or resume subsystem groups.
     * @param {string} next Target GAME_STATE value.
     * @returns {this}
     */
    setState(next) {
        if (!Object.values(GAME_STATE).includes(next)) {
            throw new RangeError(`[Game] Unknown state: ${next}.`);
        }
        if (next === this._state) return this;
        const prev = this._state;
        this._exitState(prev);
        this._state = next;
        this._enterState(next);
        this.emit('statechange', { from: prev, to: next });
        return this;
    }

    /**
     * Per-state teardown hook.
     * @param {string} state State being exited.
     * @private
     */
    _exitState(state) {
        if (state === GAME_STATE.PAUSED) {
            void this._audio.resume();
        }
    }

    /**
     * Per-state setup hook.
     * @param {string} state State being entered.
     * @private
     */
    _enterState(state) {
        switch (state) {
            case GAME_STATE.PAUSED:
                void this._audio.suspend();
                break;
            case GAME_STATE.DIALOGUE_ACTIVE:
                if (this._player && typeof this._player.setControlEnabled === 'function') {
                    this._player.setControlEnabled(false);
                }
                break;
            case GAME_STATE.PLAYING:
                if (this._player && typeof this._player.setControlEnabled === 'function') {
                    this._player.setControlEnabled(true);
                }
                break;
            default:
                break;
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       FIXED-STEP UPDATE DISPATCH
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the simulation by one fixed tick. Called by GameLoop 0..N
     * times per frame at a constant dt. Commits input edges exactly once,
     * advances world/audio when the world is active, then dispatches to the
     * per-state handler.
     * @param {number} dt Fixed timestep, seconds.
     * @private
     */
    _update(dt) {
        this._simTime += dt;
        this._audio.update(dt);

        /* Commit input edges exactly once per tick. World simulation runs
         * with a null input handle so it does not double-commit. */
        this._input.update();
        const worldActive =
            this._state === GAME_STATE.PLAYING ||
            this._state === GAME_STATE.DIALOGUE_ACTIVE;
        if (worldActive) {
            this._worlds.update(dt, null);
        }

        /* Fluid zoom (wheel + keys) is a presentation-layer control and
         * stays live in every state that renders the world. */
        if (worldActive || this._state === GAME_STATE.MAIN_MENU) {
            this._handleZoomInput();
        }

        switch (this._state) {
            case GAME_STATE.LOADING:
                this._updateLoadingScreen(dt);
                break;
            case GAME_STATE.MAIN_MENU:
                this._updateLoadingScreen(dt);
                this._updateMainMenu();
                break;
            case GAME_STATE.PLAYING:
                this._updatePlaying(dt);
                break;
            case GAME_STATE.PAUSED:
                this._updatePaused();
                break;
            case GAME_STATE.DIALOGUE_ACTIVE:
                this._updateDialogue(dt);
                break;
            case GAME_STATE.GAME_OVER:
                this._updateGameOver();
                break;
            default:
                break;
        }

        /* Ambient weather + water shader advance AFTER entity updates so a
         * tick's entity motion is already committed when reflections and
         * particle emission run. Order is contractual: entities → weather
         * → water. */
        if (worldActive || this._state === GAME_STATE.MAIN_MENU) {
            this._weather.update(dt);
            if (this._waterShader && typeof this._waterShader.update === 'function') {
                this._waterShader.update(dt);
            }
        }
    }

    /**
     * Boot-portrait tick: advances the loading screen's ambient spore
     * drift and lets a ready session enter the world on ACTION.
     * @param {number} dt Fixed timestep, seconds.
     * @private
     */
    _updateLoadingScreen(dt) {
        this._loadingScreen.update(dt);
        if (this._loadingScreen.isReady &&
            (this._input.isActionJustPressed('ACTION') ||
             this._input.isActionJustPressed('INTERACT'))) {
            this.startGame();
        }
    }

    /**
     * Main-menu input: confirm begins the game.
     * @private
     */
    _updateMainMenu() {
        if (this._input.isActionJustPressed('ACTION') ||
            this._input.isActionJustPressed('INTERACT')) {
            this.startGame();
        }
    }

    /**
     * Core gameplay tick: advances every gameplay subsystem in dependency
     * order after input edges are committed.
     * @param {number} dt Fixed timestep, seconds.
     * @private
     */
    _updatePlaying(dt) {
        this._handleGlobalInput();

        /* UI window keys + toast envelopes. */
        this._ui.update(dt, this._input);

        /* Player intent + physics, gated by UI focus. */
        if (this._player && !this._ui.isGameplayInputBlocked()) {
            if (typeof this._player.handleInput === 'function') {
                this._player.handleInput(this._input);
            }
            if (typeof this._player.update === 'function') {
                this._player.update(dt);
            }
        }

        if (this._entities && typeof this._entities.update === 'function') {
            this._entities.update(dt, this._player);
        }
        if (this._energy && typeof this._energy.update === 'function') {
            this._energy.update(dt, this._input);
        }
        if (this._combat && typeof this._combat.update === 'function') {
            this._combat.update(dt);
        }
        if (this._quest && typeof this._quest.update === 'function') {
            this._quest.update(dt);
        }
        this._hud.update(dt);
        this._sfx.update(dt);
        if (this._network && typeof this._network.update === 'function') {
            this._network.update(dt);
        }
    }

    /**
     * Pause input: confirm or pause key resumes.
     * @private
     */
    _updatePaused() {
        if (this._input.isActionJustPressed('PAUSE') ||
            this._input.isActionJustPressed('ACTION')) {
            this.setState(GAME_STATE.PLAYING);
        }
    }

    /**
     * Dialogue tick: routes input to the NPC, refreshes the typewriter view,
     * and keeps ambience + HUD alive behind the conversation.
     * @param {number} dt Fixed timestep, seconds.
     * @private
     */
    _updateDialogue(dt) {
        const npc = this._activeNPC;
        if (!npc) {
            this.setState(GAME_STATE.PLAYING);
            return;
        }
        if (typeof npc.handleInput === 'function') {
            npc.handleInput(this._input);
        }
        if (typeof npc.update === 'function') {
            npc.update(dt, this._player);
        }
        if (typeof npc.getDialogueView === 'function') {
            this._dialogue.present(npc.getDialogueView());
        }
        this._dialogue.update(dt, this._input);
        this._hud.update(dt);
        this._sfx.update(dt);
    }

    /**
     * Game-over input: confirm returns to the menu.
     * @private
     */
    _updateGameOver() {
        if (this._input.isActionJustPressed('ACTION')) {
            this.setState(GAME_STATE.MAIN_MENU);
        }
    }

    /**
     * Global gameplay input: pause, dimension toggle, and interaction.
     * Runs only in PLAYING.
     * @private
     */
    _handleGlobalInput() {
        if (this._input.isActionJustPressed('PAUSE') && !this._ui.hasBlockingPanel()) {
            this.setState(GAME_STATE.PAUSED);
            return;
        }
        if (this._input.isActionJustPressed('DIMENSION_FOCUS')) {
            const target = this._worlds.isDream() ? WORLD.DRAB : WORLD.DREAM;
            this.requestDimensionShift(target, SHIFT_REASON.SCRIPTED);
        }
        if (this._input.isActionJustPressed('INTERACT')) {
            this._tryInteract();
        }
    }

    /**
     * Fluid zoom input: mouse wheel (cursor-anchored) plus keyboard
     * fallbacks (centered). Wheel notches map through exp() so equal
     * notches feel equal in BOTH directions — a linear ±0.25 would make
     * zoom-in steps visually larger than zoom-out steps after rounding.
     *
     * Trackpads deliver many small deltas per gesture; exp(-δy·k) compounds
     * them into one continuous glide, and the Camera's exponential damping
     * animates the level change fluidly.
     * @private
     */
    _handleZoomInput() {
        if (!this._camera) return;

        const wheel = this._input.consumeWheelDelta();
        if (wheel && wheel.deltaY !== 0) {
            const factor = Math.exp(-wheel.deltaY * 0.0016);
            this._camera.zoomAt(factor, wheel.anchorX, wheel.anchorY);
        }

        const cx = this._camera.physicalWidth / 2;
        const cy = this._camera.physicalHeight / 2;

        if (this._input.isActionJustPressed('ZOOM_IN')) {
            this._camera.zoomAt(1.25, cx, cy);
        }
        if (this._input.isActionJustPressed('ZOOM_OUT')) {
            this._camera.zoomAt(0.8, cx, cy);
        }
        if (this._input.isActionJustPressed('ZOOM_RESET')) {
            this._camera.setZoom(1, cx, cy);
        }
    }

    /**
     * Assembles and pushes the per-frame uniform state into the GPU
     * presenter: weather (flash inversion, rain sheen, gloom), the orange
     * economy (depletion glitch), dimension presentation (grayscale,
     * ambient tint), the water ripple configuration, and the world-light
     * stack (player aura + registered lights, dimension-filtered).
     *
     * Runs once per PRESENTED frame (not per tick) immediately before any
     * world render so the shader state always matches this frame's
     * simulation snapshot.
     * @private
     */
    _syncGLFrameState() {
        if (!this._gl) return;

        const weatherMetrics = this._weather.getMetrics();
        const rain = weatherMetrics.poolCapacity > 0
            ? weatherMetrics.liveParticles / weatherMetrics.poolCapacity
            : 0;

        /* Orange depletion: the tear intensifies through the final quarter
         * of the pool and saturates at zero — the collapse warning. */
        const fraction = this._energy && Number.isFinite(this._energy.fraction)
            ? this._energy.fraction
            : 1;
        const glitch = fraction <= 0.25 ? (0.25 - fraction) / 0.25 : 0;

        const isDrab = this._worlds.isDrab();

        /* World-light stack: aura first (always present), then registered
         * lights for the ACTIVE dimension, capped by the engine at 8. */
        const lights = [];
        if (this._player && Number.isFinite(this._player.x)) {
            lights.push({
                x: this._player.x,
                y: this._player.y,
                radius: 150,
                intensity: 0.34,
                color: isDrab ? '#9ad7ff' : '#ffb46b'
            });
        }
        const activeWorld = this._worlds.getActiveWorldId();
        for (const light of this._worldLights) {
            if (light.world !== null && light.world !== activeWorld) continue;
            lights.push(light);
        }

        /* Water ripple configuration mirrors the CPU WaterShader so the
         * GPU displacement breathes in phase with the CPU mirror rows. */
        let water = null;
        if (this._waterShader && typeof this._waterShader.getMetrics === 'function') {
            const wm = this._waterShader.getMetrics();
            water = {
                frequency: wm.frequency,
                amplitude: wm.amplitude,
                speed: wm.speed
            };
        }

        this._gl.setFrameState({
            flash: this._weather.flashIntensity,
            rain,
            gloom: weatherMetrics.gloom,
            glitch,
            grayscale: this._renderer.grayscale ? 1 : 0,
            tint: isDrab ? '#a9b8c6' : '#ffb46b',
            tintStrength: isDrab ? 0.16 : 0.10,
            water,
            lights
        });
    }

    /**
     * Searches registered NPCs for one that can be spoken to and opens a
     * conversation with the first match.
     * @private
     */
    _tryInteract() {
        if (this._state !== GAME_STATE.PLAYING) return;
        for (const npc of this._interactableNPCs) {
            if (typeof npc.canInteract === 'function' && npc.canInteract()) {
                this._beginDialogue(npc);
                return;
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DIALOGUE ORCHESTRATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Opens a conversation with an NPC and enters DIALOGUE_ACTIVE.
     * @param {Object} npc NPC to speak with.
     * @private
     */
    _beginDialogue(npc) {
        if (this._state !== GAME_STATE.PLAYING) return;
        if (typeof npc.beginDialogue !== 'function') return;
        npc.beginDialogue(this._player);
        if (!npc.inDialogue) return;
        this._activeNPC = npc;
        if (this._player && typeof this._player.setControlEnabled === 'function') {
            this._player.setControlEnabled(false);
        }
        if (typeof npc.getDialogueView === 'function') {
            this._dialogue.present(npc.getDialogueView());
        }
        this._ui.setHint(null);
        this.setState(GAME_STATE.DIALOGUE_ACTIVE);
        this.emit('dialogueopen', { npcId: npc.id ?? null });
    }

    /**
     * Cleans up after a conversation ends and returns to PLAYING.
     * @param {Object} npc NPC whose dialogue ended.
     * @private
     */
    _handleDialogueEnd(npc) {
        if (this._activeNPC !== npc) return;
        this._activeNPC = null;
        if (this._player && typeof this._player.setControlEnabled === 'function') {
            this._player.setControlEnabled(true);
        }
        if (this._state === GAME_STATE.DIALOGUE_ACTIVE) {
            this.setState(GAME_STATE.PLAYING);
        }
        this.emit('dialogueclose', { npcId: npc.id ?? null });
    }

    /* ══════════════════════════════════════════════════════════════════
       DUAL-WORLD / DIMENSION DISPATCH
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Requests a dimension shift and broadcasts the intent. Audio crossfade
     * and weather regime changes are triggered by the WorldManager events
     * this class already subscribes to.
     * @param {string} target WORLD.DREAM or WORLD.DRAB.
     * @param {string} [reason] SHIFT_REASON value.
     * @returns {boolean} True if the shift was accepted.
     */
    requestDimensionShift(target, reason = SHIFT_REASON.SCRIPTED) {
        if (this._worlds.getActiveWorldId() === target && !this._worlds.isTransitioning()) {
            return false;
        }
        const accepted = this._worlds.requestShift(target, reason);
        if (accepted) {
            this.emit('dimensionrequest', { target, reason });
        }
        return accepted;
    }

    /**
     * WorldManager 'worldchanged' fan-out: weather regime, player form,
     * dimension SFX, and a UI banner. Audio crossfades itself.
     * @param {Object} detail World-change payload.
     * @private
     */
    _onWorldChanged(detail) {
        const to = detail.to;
        this._weather.setWorld(to);
        if (this._player) {
            if (typeof this._player.setDimension === 'function') {
                this._player.setDimension(to);
            } else if (typeof this._player.setForm === 'function') {
                this._player.setForm(to === WORLD.DRAB ? 'SUIT' : 'PONCHO');
            }
        }
        this._sfx.play(SFX_NAME.DIMENSION_SHIFT, { direction: to });
        this._ui.announce(to === WORLD.DRAB ? 'THE DRAB WORLD' : 'THE DREAM WORLD');
        this.emit('dimensionshift', detail);
    }

    /**
     * WorldManager 'transitionstart' hook.
     * @param {Object} status Transition status snapshot.
     * @private
     */
    _onTransitionStart(status) {
        this.emit('transitionstart', status);
    }

    /**
     * WorldManager 'transitioncomplete' hook.
     * @param {Object} status Transition status snapshot.
     * @private
     */
    _onTransitionComplete(status) {
        this.emit('transitioncomplete', status);
    }

    /* ══════════════════════════════════════════════════════════════════
       PRESENTATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents one frame. Renders the world into the active buffer, blits
     * it, then layers screen-space overlays. Called once per displayed frame.
     * @param {number} alpha Interpolation phase [0, 1].
     * @private
     */
    _render(alpha) {
        const r = this._renderer;
        r.beginFrame();
        /* GPU uniform state must land BEFORE any world/loading present so
         * the shader reads this frame's simulation snapshot. */
        this._syncGLFrameState();
        if (this._state === GAME_STATE.LOADING ||
            this._state === GAME_STATE.MAIN_MENU) {
            /* The vibrant boot portrait is the interactive entry point:
             * ambient spore drift, embroidered poncho, session status. */
            this._loadingScreen.render(r);
        } else {
            this._presentWorld(r, alpha);
            this._hud.render(alpha);
            this._dialogue.render(alpha);
            this._ui.render(alpha);
            this._renderTransitionOverlay(r);
            if (this._state === GAME_STATE.PAUSED) this._renderPauseOverlay(r);
            if (this._state === GAME_STATE.GAME_OVER) this._renderGameOverOverlay(r);
        }
        r.endFrame();
    }

    /**
     * Immediate-mode world presentation: clears the active buffer, restamps
     * terrain, draws entities/water/weather, then blits via WorldManager
     * (which commits the buffer and applies the camera). Matches the
     * WeatherSystem pipeline contract.
     * @param {Renderer} renderer Engine renderer.
     * @param {number} alpha Interpolation phase.
     * @private
     */
    _presentWorld(renderer, alpha) {
        const buffer = this._worlds.getActiveBuffer();
        const camera = this._worlds.getCamera();
        if (!buffer || !camera) return;

        buffer.clear();
        const worldId = this._worlds.getActiveWorldId();
        const stamper = this._terrainStampers.get(worldId);
        if (stamper) stamper(buffer, camera);

        if (this._entities && typeof this._entities.render === 'function') {
            this._entities.render(buffer, camera, alpha);
        }
        this._weather.render(buffer, camera);

        /* Water runs last, AFTER weather: the shader is a full-buffer
         * post-processor in integer grid cells (NOT camera space), and its
         * mirror sources include every glyph stamped above the surface —
         * terrain, entities, and weather alike. Its clock is owned by
         * update(dt), not by render arguments. */
        if (this._waterShader && typeof this._waterShader.render === 'function') {
            this._waterShader.render(buffer);
        }

        this._worlds.render(renderer, alpha);
    }

    /**
     * Draws the dimension-shift overlay (flicker or fade) above the world.
     * @param {Renderer} r Engine renderer.
     * @private
     */
    _renderTransitionOverlay(r) {
        const status = this._worlds.getTransitionStatus();
        if (!status || !status.active) return;
        const grid = r.getViewportGridSize();
        const viewW = grid.columns * r.cellWidth;
        const viewH = grid.rows * r.cellHeight;

        if (status.fade > 0.001) {
            r.drawRect(0, 0, viewW, viewH, `rgba(0,0,0,${clamp01(status.fade) * 0.97})`);
        }
        if (status.flicker > 0.001) {
            const intensity = clamp01(status.flicker);
            const bands = Math.floor(intensity * 8);
            for (let b = 0; b < bands; b += 1) {
                const rowNoise = flickerNoise(this._simTime * 1.7 + b * 13.7);
                const bandY = Math.floor(rowNoise * grid.rows) * r.cellHeight;
                const jitter = (flickerNoise(this._simTime * 2.9 + b * 5.1) - 0.5) * 8 * r.cellWidth;
                r.drawRect(jitter, bandY, viewW, r.cellHeight * 0.6,
                    `rgba(154,215,255,${intensity * 0.16})`);
            }
        }
    }

    /**
     * Draws a centered text line at a vertical fraction of the viewport.
     * @param {Renderer} r Engine renderer.
     * @param {string} text Line to draw.
     * @param {number} rowFraction Vertical position 0..1.
     * @param {string} color CSS color.
     * @private
     */
    _centeredLine(r, text, rowFraction, color) {
        const size = r.measureString(text);
        const x = Math.max(0, (r.viewportWidth - size.width) / 2);
        const y = r.viewportHeight * clamp01(rowFraction);
        r.drawString(x, y, text, color);
    }

    /**
     * Pause overlay.
     * @param {Renderer} r Engine renderer.
     * @private
     */
    _renderPauseOverlay(r) {
        r.drawRect(0, 0, r.viewportWidth, r.viewportHeight, 'rgba(0,0,0,0.5)');
        this._centeredLine(r, 'PAUSED', 0.42, '#ffe9c4');
        this._centeredLine(r, '[ ESC ] resume', 0.52, '#d7e3ee');
    }

    /**
     * Game-over overlay.
     * @param {Renderer} r Engine renderer.
     * @private
     */
    _renderGameOverOverlay(r) {
        r.drawRect(0, 0, r.viewportWidth, r.viewportHeight, 'rgba(0,0,0,0.6)');
        this._centeredLine(r, 'THE THREAD SNAPS', 0.4, '#ff5a5a');
        this._centeredLine(r, '[ SPACE ] return', 0.52, '#d7e3ee');
    }

    /* ══════════════════════════════════════════════════════════════════
       RESIZE & DISPLAY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Measures the canvas for CSS size and device pixel ratio.
     * @returns {{cssWidth: number, cssHeight: number, dpr: number}}
     * @private
     */
    _measureDisplay() {
        const rect = this._canvas.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.floor(rect.width));
        const cssHeight = Math.max(1, Math.floor(rect.height));
        const dpr = this._canvas.width > 0 && rect.width > 0
            ? this._canvas.width / rect.width
            : (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
        return { cssWidth, cssHeight, dpr };
    }

    /**
     * Propagates a resize / DPR change through renderer, camera, and weather.
     * Called by src/index.js from its coalesced resize handler.
     * @param {{cssWidth: number, cssHeight: number, dpr: number}} [displayInfo]
     * @returns {this}
     */
    handleResize(displayInfo = this._measureDisplay()) {
        this._renderer.handleResize(displayInfo);
        this._camera.setViewport(displayInfo.cssWidth, displayInfo.cssHeight);
        this._camera.setCellMetrics(this._renderer.cellWidth, this._renderer.cellHeight);
        this._weather.setCellMetrics(this._renderer.cellWidth, this._renderer.cellHeight);
        this._loadingScreen.handleResize(displayInfo);
        if (this._gl) {
            this._gl.handleResize(displayInfo);
            this._gl.setCellMetrics(this._renderer.cellWidth, this._renderer.cellHeight);
        }
        this._renderer.invalidate();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS & DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a game event: 'statechange', 'gamestart',
     * 'dimensionrequest', 'dimensionshift', 'transitionstart',
     * 'transitioncomplete', 'dialogueopen', 'dialogueclose'.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {Function} Unsubscribe function.
     */
    on(type, listener) {
        if (typeof type !== 'string' || typeof listener !== 'function') {
            throw new TypeError('[Game] on() requires a type and listener.');
        }
        let set = this._listeners.get(type);
        if (!set) {
            set = new Set();
            this._listeners.set(type, set);
        }
        set.add(listener);
        return () => this.off(type, listener);
    }

    /**
     * Unsubscribes a listener.
     * @param {string} type Event name.
     * @param {Function} listener Callback to remove.
     * @returns {this}
     */
    off(type, listener) {
        const set = this._listeners.get(type);
        if (set) {
            set.delete(listener);
            if (set.size === 0) this._listeners.delete(type);
        }
        return this;
    }

    /**
     * Broadcasts a game event with error isolation.
     * @param {string} type Event name.
     * @param {Object} detail Payload.
     * @private
     */
    emit(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[Game] '${type}' listener failed:`, error);
            }
        }
    }

    /**
     * Aggregated diagnostics snapshot for the debug HUD. Allocates one
     * object; poll at HUD rate, not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            state: this._state,
            simTime: this._simTime,
            world: this._worlds.getActiveWorldId(),
            transitioning: this._worlds.isTransitioning(),
            zoom: this._camera.zoom,
            presenter: this._gl ? 'webgl' : 'canvas2d',
            gl: this._gl ? this._gl.getMetrics() : null,
            loop: this._loop.getMetrics(),
            renderer: this._renderer.getStats(),
            weather: this._weather.getMetrics(),
            audio: this._audio.getMetrics(),
            hud: this._hud.getMetrics(),
            dialogue: this._dialogue.getMetrics(),
            npcCount: this._interactableNPCs.size,
            activeNPC: this._activeNPC ? (this._activeNPC.id ?? null) : null
        };
    }
}

export default Game;