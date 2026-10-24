/**
 * @file src/entities/NPC.js
 * @module entities/NPC
 * @description
 * Non-player characters for "YUCCA".
 * NPC extends Entity with three responsibilities: a proximity interaction
 * loop that detects the player and advertises itself, a stateful dialogue
 * tree engine with typewriter pacing, branching choices, and conditional
 * lines, and a quest-giver bridge that offers, accepts, and completes
 * missions through the QuestSystem.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INHERITANCE & VISUAL IDENTITY
 * ───────────────────────────────────────────────────────────────────────────
 * NPCs read as conversation, not as obstacles. Each NPC carries:
 *   - a single signature glyph (default 'N', factories use distinct
 *     characters) with a slow alpha glow pulse applied in
 *     prepareAppearance so quest-givers visibly hum against static decor;
 *   - a floating indicator cell above the head: a bobbing '[E]' prompt
 *     when the player is in range, a gold '!' when a quest can be picked
 *     up, a green '?' when one can be turned in, and a '"' speech mark
 *     while a conversation is open;
 *   - ENTITY_LAYER.ENTITY zIndex by default; factories raise it so NPC
 *     indicators survive overlapping terrain.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROXIMITY & INTERACTION LOOP
 * ───────────────────────────────────────────────────────────────────────────
 * The loop runs across three systems and the player's own 'interact'
 * event (fired on the INTERACT key edge by Player):
 *
 *   1. NPC.update(dt, player) tracks proximity each tick using squared
 *      distance (no sqrt) and broadcasts 'rangeenter' / 'rangeexit'.
 *   2. WorldManager listens to player's 'interact', finds the nearest
 *      NPC with canInteract() === true, and calls beginDialogue(player).
 *      It then clears Player.setControlEnabled(false) and routes input
 *      through npc.handleInput(input) every tick.
 *   3. On 'dialogueend' the WorldManager restores player control.
 *
 * Walking away past BREAK_RADIUS_MULTIPLIER × interactionRadius while a
 * conversation is open ends it automatically with reason 'walkedaway', so
 * a dialogue can never hold the player hostage from across the map.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIALOGUE STATE MACHINE ARCHITECTURE
 * ───────────────────────────────────────────────────────────────────────────
 * Dialogue content is a validated node graph:
 *
 *   {
 *     start: 'greeting',
 *     startRules: [{ node: 'tear_ready', condition: ctx => ... }, ...],
 *     nodes: {
 *       greeting: {
 *         text: ['Line one.', 'Line two.'],      // typewriter, multi-line
 *         choices: [                              // optional branching
 *           { label: 'Tell me more.', next: 'brief',
 *             condition: ctx => ctx.questStatus('x') === 'AVAILABLE',
 *             quest: { op: 'offer', id: 'x' } },
 *           ...
 *         ],
 *         next: 'farewell' | null,                // linear fallback
 *         flags: [{ name: 'met_ira', value: true }],
 *         quest: { op: 'offer', id: '...' },      // runs on node entry
 *         onEnter: (npc, ctx) => { ... }
 *       }, ...
 *     }
 *   }
 *
 * Runtime states:
 *
 *   CLOSED ──beginDialogue──► TYPING ──chars revealed──► LINE_READY
 *      ▲                         ▲                           │
 *      │                         └─── advanceDialogue ───────┤ (more lines)
 *      │                                                     ▼
 *      └── terminal ◄── advance ◄── CHOICES ◄────── last line finished
 *                                    │   ▲
 *                                    └───┘ moveChoiceSelection (up/down)
 *
 * Node entry order is contractual: flags → quest action → onEnter hook.
 * Choice conditions are evaluated at the moment the CHOICES state is
 * entered, so lines can react to quest completions performed by earlier
 * nodes in the same conversation. Author content (conditions, onEnter)
 * is try/caught: a broken quest hook logs loudly but can never kill the
 * simulation tick — the same fail-soft policy Entity uses for listeners.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIALOGUE CONTEXT (CONDITIONS)
 * ───────────────────────────────────────────────────────────────────────────
 * Every condition and hook receives one context object:
 *
 *   ctx.npc             this NPC
 *   ctx.player          the player in conversation (may be null)
 *   ctx.orangeFraction  player energy reserve 0..1 (1 when unknown)
 *   ctx.world           player's current dimension ('DREAM' | 'DRAB')
 *   ctx.hasFlag(name)   quest-flag reader (false with no QuestSystem)
 *   ctx.questStatus(id) quest status string (LOCKED with no QuestSystem)
 *
 * This is how an NPC notices the orange tank: lines can branch on
 * ctx.orangeFraction < 0.25 and send a thirsty player toward the Orange
 * Juice Cart before anything else.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUEST GIVER INTEGRATION
 * ───────────────────────────────────────────────────────────────────────────
 * The QuestSystem is duck-typed (validated once at attach time):
 *
 *   getQuestStatus(id) → QUEST_STATUS string
 *   offerQuest(id) / acceptQuest(id) / completeQuest(id) → boolean
 *   hasFlag(name) → boolean,   setFlag(name, value) → void
 *
 * Nodes trigger quests declaratively via { op, id } records; the NPC
 * executes them on entry and rebroadcasts 'questaction' so HUDs and the
 * server bridge can mirror progress. getQuestMarker() maps quest states
 * onto the head indicator: any READY quest wins ('?'), else any
 * AVAILABLE quest ('!'), else null.
 *
 * @example
 * const ira = NPC.createTemporalMender({
 *     x: spawn.x,
 *     y: spawn.y,
 *     questSystem: quests
 * });
 * world.addEntity(ira);
 *
 * player.addEventListener('interact', () => {
 *     if (ira.canInteract()) {
 *         ira.beginDialogue(player);
 *         player.setControlEnabled(false);
 *     }
 * });
 * ira.addEventListener('dialogueend', () => player.setControlEnabled(true));
 *
 * // Per fixed tick while a conversation is open:
 * if (ira.inDialogue) npcConsumed = ira.handleInput(input);
 *
 * // Presentation pass (HUD):
 * const view = ira.getDialogueView();   // feeds the typewriter panel
 * ira.render(worldBuffer, camera, alpha);
 */

import { Entity, ENTITY_LAYER } from './Entity.js';
import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS & ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Two pi, precomputed for pulse/bob oscillators. */
const TWO_PI = Math.PI * 2;

/** Dialogue state machine states (see header diagram). @enum {string} */
export const DIALOGUE_STATE = Object.freeze({
    CLOSED: 'CLOSED',
    TYPING: 'TYPING',
    LINE_READY: 'LINE_READY',
    CHOICES: 'CHOICES'
});

/** Quest lifecycle states returned by QuestSystem.getQuestStatus(). */
export const QUEST_STATUS = Object.freeze({
    LOCKED: 'LOCKED',
    AVAILABLE: 'AVAILABLE',
    ACTIVE: 'ACTIVE',
    READY: 'READY',
    COMPLETED: 'COMPLETED'
});

/** Legal declarative quest operations on dialogue nodes/choices. */
export const QUEST_OP = Object.freeze({
    OFFER: 'offer',
    ACCEPT: 'accept',
    COMPLETE: 'complete'
});

/** Default interaction radius, CSS pixels (~5 cells wide at 9.6 px). */
const DEFAULT_INTERACTION_RADIUS = 44;
/** Walking away past radius × this multiplier aborts an open dialogue. */
const BREAK_RADIUS_MULTIPLIER = 1.6;
/** Default typewriter speed, characters per second. */
const DEFAULT_CHARS_PER_SECOND = 45;
/** Glow pulse frequency, Hz (slow quest-giver hum). */
const GLOW_HZ = 0.5;
/** Minimum glow alpha at the trough of the pulse. */
const GLOW_MIN_ALPHA = 0.8;
/** Indicator bob frequency, Hz. */
const BOB_HZ = 1.4;

/* Indicator palette (packed once at module load). */
const PROMPT_LEFT = 0x5B;    // '['
const PROMPT_KEY = 0x45;     // 'E'
const PROMPT_RIGHT = 0x5D;   // ']'
const MARKER_AVAILABLE = 0x21; // '!'
const MARKER_READY = 0x3F;     // '?'
const SPEECH_MARK = 0x22;      // '"'

const PROMPT_FG = ASCIIBuffer.packColor('#9ad7ff');
const MARKER_AVAILABLE_FG = ASCIIBuffer.packColor('#ffd24a');
const MARKER_READY_FG = ASCIIBuffer.packColor('#7dff8a');
const SPEECH_FG = ASCIIBuffer.packColor('#ff7700');

/* Module-level render scratch; never retained across frames. */
/** @type {{x: number, y: number}} */
const _renderPoint = { x: 0, y: 0 };

/* ══════════════════════════════════════════════════════════════════════════
   DEFAULT & FACTORY DIALOGUE TREES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fallback conversation for NPCs constructed without custom dialogue.
 * Small but complete: multi-line greeting, one branch, terminal farewell.
 * @type {Object}
 */
export const DEFAULT_NPC_DIALOGUE = Object.freeze({
    start: 'greeting',
    nodes: Object.freeze({
        greeting: Object.freeze({
            text: Object.freeze([
                'You walk a frayed hour, traveler.',
                'Mind the loose stitches between the minutes.'
            ]),
            choices: Object.freeze([
                Object.freeze({ label: 'What do you mean?', next: 'explain' }),
                Object.freeze({ label: 'Just passing through.', next: 'farewell' })
            ])
        }),
        explain: Object.freeze({
            text: Object.freeze([
                'Time is quilted here, not woven.',
                'Where a patch comes loose, the stillness leaks through.'
            ]),
            next: 'farewell'
        }),
        farewell: Object.freeze({
            text: Object.freeze(['Walk softly. The hour is thin.'])
        })
    })
});

/**
 * Full quest-giver conversation for the temporal mender factory.
 * Demonstrates every engine feature: dynamic start rules keyed off live
 * quest status, a declarative quest offer/accept/complete chain, flag
 * writes, and an orange-reserve conditional branch that routes thirsty
 * players to the Orange Juice Cart.
 * @type {Object}
 */
const MENDER_DIALOGUE = Object.freeze({
    start: 'greeting',
    startRules: Object.freeze([
        Object.freeze({
            node: 'tear_ready',
            condition: (ctx) => ctx.questStatus('seal_temporal_tear') === QUEST_STATUS.READY
        }),
        Object.freeze({
            node: 'tear_progress',
            condition: (ctx) => ctx.questStatus('seal_temporal_tear') === QUEST_STATUS.ACTIVE
        })
    ]),
    nodes: Object.freeze({
        greeting: Object.freeze({
            text: Object.freeze([
                'Hold a moment, traveler. The stitches of this hour are loose.',
                'I am Ira, mender of the Loom. You carry a live thread — that is rare.'
            ]),
            flags: Object.freeze([{ name: 'met_mender_ira', value: true }]),
            choices: Object.freeze([
                Object.freeze({ label: "What's wrong with time here?", next: 'anomaly_brief' }),
                Object.freeze({ label: 'Where can I refill my energy?', next: 'juice_hint' }),
                Object.freeze({ label: 'Just passing through.', next: 'farewell' })
            ])
        }),

        anomaly_brief: Object.freeze({
            text: Object.freeze([
                'A temporal tear has opened past the grove, where the clockflowers grow.',
                'Left unsealed it spreads a time-stop: a stillness that swallows everything it touches.',
                'Take stitch-thread and close it. The Loom will owe you a patch.'
            ]),
            quest: Object.freeze({ op: QUEST_OP.OFFER, id: 'seal_temporal_tear' }),
            choices: Object.freeze([
                Object.freeze({
                    label: "I'll seal the tear.",
                    next: 'tear_accepted',
                    quest: Object.freeze({ op: QUEST_OP.ACCEPT, id: 'seal_temporal_tear' })
                }),
                Object.freeze({ label: 'Not yet.', next: 'farewell' })
            ])
        }),

        tear_accepted: Object.freeze({
            text: Object.freeze([
                'Take this stitch-thread. It remembers the shape of whole hours.',
                'Follow the wilted clockflowers north-east; the tear weeps where they stop blooming.'
            ]),
            flags: Object.freeze([{ name: 'tear_briefed', value: true }])
        }),

        tear_progress: Object.freeze({
            text: Object.freeze([
                'The tear still weeps — I can hear it from here.',
                'North-east, where the clockflowers stop blooming. Stitch it shut.'
            ]),
            choices: Object.freeze([
                Object.freeze({ label: "I'm on my way.", next: 'farewell' }),
                Object.freeze({ label: 'Where can I refill my energy first?', next: 'juice_hint' })
            ])
        }),

        tear_ready: Object.freeze({
            text: Object.freeze([
                'The thread sings — you sealed it! The hour breathes whole again.',
                'The Loom records your patch, traveler. Few hands can hold time together.'
            ]),
            quest: Object.freeze({ op: QUEST_OP.COMPLETE, id: 'seal_temporal_tear' }),
            choices: Object.freeze([
                Object.freeze({ label: 'Anything else needs mending?', next: 'juice_hint' }),
                Object.freeze({ label: 'Glad to help.', next: 'farewell' })
            ])
        }),

        juice_hint: Object.freeze({
            text: Object.freeze([
                'The Orange Juice Cart parks by the fountain square, east of the Loom.',
                'Its keeper fills a glass for anyone whose thread runs thin.',
                'Fresh orange steadies a fraying reserve better than any charm I can stitch.'
            ]),
            choices: Object.freeze([
                Object.freeze({
                    label: 'My reserve really is running low...',
                    next: 'juice_low',
                    condition: (ctx) => ctx.orangeFraction < 0.25
                }),
                Object.freeze({ label: 'Thanks. I\'ll find the cart.', next: 'farewell' })
            ])
        }),

        juice_low: Object.freeze({
            text: Object.freeze([
                'Then go straight to the cart — do not chase tears on a thin thread.',
                'Tell the keeper Ira sent you. The first pour is on the Loom.'
            ]),
            flags: Object.freeze([{ name: 'juice_cart_referred', value: true }]),
            quest: Object.freeze({ op: QUEST_OP.OFFER, id: 'juice_cart_delivery' })
        }),

        farewell: Object.freeze({
            text: Object.freeze(['Walk softly. The hour is thinner than it looks.'])
        })
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   NPC
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A non-player character: proximity detection, dialogue state machine,
 * and quest-giver bridge in one Entity subclass.
 */
export class NPC extends Entity {
    /**
     * @param {Object} [options] All Entity options are accepted; the
     *   NPC-specific additions are listed below.
     * @param {Object} [options.dialogue] Dialogue tree (see header
     *   grammar). Defaults to DEFAULT_NPC_DIALOGUE.
     * @param {number} [options.interactionRadius=44] CSS-pixel range.
     * @param {number} [options.charsPerSecond=45] Typewriter speed.
     * @param {string[]} [options.quests=[]] Quest ids this NPC owns,
     *   used for the head marker.
     * @param {Object} [options.questSystem] QuestSystem to attach.
     * @param {Object} [options.player] Player reference for proximity.
     * @param {boolean} [options.facePlayer=true] Turn toward the player
     *   while they are in range.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[NPC] options must be an object.');
        }
        super({
            name: 'NPC',
            char: 'N',
            fgColor: '#7fd4ff',
            zIndex: ENTITY_LAYER.ENTITY,
            width: 12,
            height: 20,
            friction: 8,
            tags: ['npc'],
            ...options
        });

        /* ---- Interaction geometry ------------------------------------ */
        const radius = options.interactionRadius ?? DEFAULT_INTERACTION_RADIUS;
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new RangeError('[NPC] interactionRadius must be positive.');
        }
        /** @type {number} Interaction radius, CSS pixels. */
        this._interactionRadius = radius;

        const cps = options.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND;
        if (!Number.isFinite(cps) || cps <= 0) {
            throw new RangeError('[NPC] charsPerSecond must be positive.');
        }
        /** @type {number} Typewriter reveal speed, chars/second. */
        this._charsPerSecond = cps;

        /** @type {boolean} Turn to face the player in range. */
        this._facePlayer = options.facePlayer !== false;

        /* ---- Quest wiring --------------------------------------------- */
        /** @type {string[]} Quest ids owned by this NPC. */
        this._questIds = [];
        if (options.quests !== undefined) {
            this.setQuestIds(options.quests);
        }
        /** @type {?Object} Attached QuestSystem (duck-typed). */
        this._questSystem = null;
        if (options.questSystem !== undefined && options.questSystem !== null) {
            this.attachQuestSystem(options.questSystem);
        }

        /* ---- Dialogue engine ------------------------------------------- */
        const dialogue = this._normalizeDialogue(options.dialogue ?? DEFAULT_NPC_DIALOGUE);
        /** @type {{nodes: Map<string, Object>, start: string, startRules: Array}} */
        this._dialogue = dialogue;
        /** @type {string} Current state machine state. */
        this._dialogueState = DIALOGUE_STATE.CLOSED;
        /** @type {?string} Active node id. */
        this._activeNodeId = null;
        /** @type {number} Current line index within the node. */
        this._lineIndex = 0;
        /** @type {number} Characters revealed on the current line. */
        this._revealedChars = 0;
        /** @type {Array<Object>} Condition-filtered choices on display. */
        this._visibleChoices = [];
        /** @type {number} Highlighted choice index. */
        this._selectedChoice = 0;
        /** @type {?Object} Player currently in conversation. */
        this._dialoguePlayer = null;

        /* ---- Proximity state -------------------------------------------- */
        /** @type {?Object} Player reference for proximity tracking. */
        this._player = options.player ?? null;
        /** @type {boolean} Player inside the interaction radius. */
        this._playerInProximity = false;
    }

    /* ══════════════════════════════════════════════════════════════════
       WIRING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the player used for proximity checks and facing.
     * @param {?Object} player Player instance, or null to detach.
     * @returns {this}
     */
    attachPlayer(player) {
        if (player !== null &&
            (!Number.isFinite(player.x) || !Number.isFinite(player.y))) {
            throw new TypeError('[NPC] player must expose numeric x and y.');
        }
        this._player = player;
        return this;
    }

    /**
     * Attaches the quest engine after validating its full structural
     * contract, so a misconfigured system fails at wiring time instead
     * of mid-conversation.
     * @param {?Object} system QuestSystem, or null to detach.
     * @returns {this}
     */
    attachQuestSystem(system) {
        if (system === null) {
            this._questSystem = null;
            return this;
        }
        const required = [
            'getQuestStatus', 'offerQuest', 'acceptQuest',
            'completeQuest', 'hasFlag', 'setFlag'
        ];
        const missing = required.filter((m) => typeof system[m] !== 'function');
        if (missing.length > 0) {
            throw new TypeError(
                `[NPC] questSystem is missing required methods: ${missing.join(', ')}.`
            );
        }
        this._questSystem = system;
        return this;
    }

    /**
     * Sets the quest ids this NPC owns (used for the head marker).
     * @param {string[]} ids Quest identifiers.
     * @returns {this}
     */
    setQuestIds(ids) {
        if (!Array.isArray(ids)) {
            throw new TypeError('[NPC] quests must be an array of strings.');
        }
        this._questIds = ids.map((id) => {
            if (typeof id !== 'string' || id.length === 0) {
                throw new TypeError('[NPC] quest ids must be non-empty strings.');
            }
            return id;
        });
        return this;
    }

    /**
     * Resizes the interaction radius at runtime (boss arenas widen it,
     * stealth sections shrink it).
     * @param {number} radius Positive CSS-pixel radius.
     * @returns {this}
     */
    setInteractionRadius(radius) {
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new RangeError('[NPC] interactionRadius must be positive.');
        }
        this._interactionRadius = radius;
        return this;
    }

    /** @returns {number} Interaction radius, CSS pixels. */
    get interactionRadius() {
        return this._interactionRadius;
    }

    /* ══════════════════════════════════════════════════════════════════
       PROXIMITY & INTERACTION TRIGGERS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Distance check between this NPC and a player. Uses squared
     * distance so a full-room sweep never pays for square roots.
     * @param {Object} player Player (or any entity with bounds).
     * @returns {boolean} True when close enough to interact.
     */
    checkInteractionRange(player) {
        if (!player) return false;
        const radiusSquared = this._interactionRadius * this._interactionRadius;
        return this.distanceSquaredTo(player) <= radiusSquared;
    }

    /**
     * Full interaction gate: alive, visible, not already conversing, and
     * a tracked player standing in range. WorldManager uses this to pick
     * the interaction target when the player presses INTERACT.
     * @returns {boolean}
     */
    canInteract() {
        return this.active && this.visible &&
            this._dialogueState === DIALOGUE_STATE.CLOSED &&
            this._playerInProximity;
    }

    /** @returns {boolean} Player currently inside the radius. */
    get isPlayerInRange() {
        return this._playerInProximity;
    }

    /**
     * Head indicator derived from live quest states. A completable quest
     * always outranks an offerable one — turning in is the priority beat.
     * @returns {?string} '?' (ready), '!' (available), or null.
     */
    getQuestMarker() {
        if (!this._questSystem || this._questIds.length === 0) return null;
        let available = false;
        for (let i = 0; i < this._questIds.length; i += 1) {
            const status = this._safeQuestStatus(this._questIds[i]);
            if (status === QUEST_STATUS.READY) return '?';
            if (status === QUEST_STATUS.AVAILABLE) available = true;
        }
        return available ? '!' : null;
    }

    /**
     * Quest status read guarded against hostile or unattached systems.
     * @param {string} questId Quest identifier.
     * @returns {string} QUEST_STATUS value.
     * @private
     */
    _safeQuestStatus(questId) {
        try {
            const status = this._questSystem.getQuestStatus(questId);
            return typeof status === 'string' ? status : QUEST_STATUS.LOCKED;
        } catch (error) {
            console.error(`[NPC #${this.id}] getQuestStatus('${questId}') failed:`, error);
            return QUEST_STATUS.LOCKED;
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DIALOGUE TREE NORMALIZATION & VALIDATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Validates and normalizes an author dialogue tree into the runtime
     * shape: a Map of frozen nodes, a start id, and ordered start rules.
     * Every structural error throws with the offending node path, so
     * content bugs surface at construction time, never mid-conversation.
     * @param {Object} tree Author tree (see header grammar).
     * @returns {{nodes: Map<string, Object>, start: string, startRules: Array}}
     * @private
     */
    _normalizeDialogue(tree) {
        if (tree === null || typeof tree !== 'object') {
            throw new TypeError('[NPC] dialogue must be an object.');
        }
        if (typeof tree.start !== 'string' || tree.start.length === 0) {
            throw new TypeError('[NPC] dialogue.start must be a node id.');
        }
        if (tree.nodes === null || typeof tree.nodes !== 'object') {
            throw new TypeError('[NPC] dialogue.nodes must be an object.');
        }

        /** @type {Map<string, Object>} */
        const nodes = new Map();

        /* Pass 1: normalize each node individually. */
        for (const [id, raw] of Object.entries(tree.nodes)) {
            nodes.set(id, this._normalizeNode(id, raw));
        }
        if (nodes.size === 0) {
            throw new TypeError('[NPC] dialogue must contain at least one node.');
        }
        if (!nodes.has(tree.start)) {
            throw new TypeError(`[NPC] dialogue.start '${tree.start}' is not a defined node.`);
        }

        /* Pass 2: verify every transition target exists. */
        for (const [id, node] of nodes) {
            if (node.next !== null && !nodes.has(node.next)) {
                throw new TypeError(
                    `[NPC] node '${id}' transitions to unknown node '${node.next}'.`
                );
            }
            for (let i = 0; i < node.choices.length; i += 1) {
                const choice = node.choices[i];
                if (choice.next !== null && !nodes.has(choice.next)) {
                    throw new TypeError(
                        `[NPC] node '${id}' choice ${i} targets unknown node '${choice.next}'.`
                    );
                }
            }
        }

        /* Start rules: dynamic entry points evaluated in order. */
        const startRules = [];
        if (tree.startRules !== undefined) {
            if (!Array.isArray(tree.startRules)) {
                throw new TypeError('[NPC] dialogue.startRules must be an array.');
            }
            for (let i = 0; i < tree.startRules.length; i += 1) {
                const rule = tree.startRules[i];
                if (!rule || typeof rule.node !== 'string' || !nodes.has(rule.node)) {
                    throw new TypeError(
                        `[NPC] startRules[${i}].node must reference a defined node.`
                    );
                }
                if (typeof rule.condition !== 'function') {
                    throw new TypeError(`[NPC] startRules[${i}].condition must be a function.`);
                }
                startRules.push(Object.freeze({ node: rule.node, condition: rule.condition }));
            }
        }

        return { nodes, start: tree.start, startRules: Object.freeze(startRules) };
    }

    /**
     * Normalizes one author node into its frozen runtime shape.
     * @param {string} id Node id (for error paths).
     * @param {Object} raw Author node.
     * @returns {Object} Frozen normalized node.
     * @private
     */
    _normalizeNode(id, raw) {
        if (raw === null || typeof raw !== 'object') {
            throw new TypeError(`[NPC] node '${id}' must be an object.`);
        }

        /* text: string or string[] → non-empty string[]. */
        let text = raw.text;
        if (typeof text === 'string') text = [text];
        if (!Array.isArray(text) || text.length === 0 ||
            !text.every((line) => typeof line === 'string' && line.length > 0)) {
            throw new TypeError(
                `[NPC] node '${id}' needs non-empty string text lines.`
            );
        }

        /* choices: optional branch list. */
        const choices = [];
        if (raw.choices !== undefined) {
            if (!Array.isArray(raw.choices)) {
                throw new TypeError(`[NPC] node '${id}'.choices must be an array.`);
            }
            for (let i = 0; i < raw.choices.length; i += 1) {
                choices.push(this._normalizeChoice(id, i, raw.choices[i]));
            }
        }

        /* next: linear continuation when there are no choices. */
        let next = null;
        if (raw.next !== undefined && raw.next !== null) {
            if (typeof raw.next !== 'string') {
                throw new TypeError(`[NPC] node '${id}'.next must be a string or null.`);
            }
            next = raw.next;
        }

        /* Declarative quest action on node entry. */
        const quest = this._normalizeQuestAction(id, raw.quest);

        /* Flag writes on node entry. */
        const flags = [];
        if (raw.flags !== undefined) {
            if (!Array.isArray(raw.flags)) {
                throw new TypeError(`[NPC] node '${id}'.flags must be an array.`);
            }
            for (const flag of raw.flags) {
                if (!flag || typeof flag.name !== 'string') {
                    throw new TypeError(`[NPC] node '${id}'.flags entries need string names.`);
                }
                flags.push(Object.freeze({ name: flag.name, value: flag.value ?? true }));
            }
        }

        if (raw.onEnter !== undefined && typeof raw.onEnter !== 'function') {
            throw new TypeError(`[NPC] node '${id}'.onEnter must be a function.`);
        }

        return Object.freeze({
            id,
            text: Object.freeze([...text]),
            choices: Object.freeze(choices),
            next,
            quest,
            flags: Object.freeze(flags),
            onEnter: raw.onEnter ?? null
        });
    }

    /**
     * Normalizes one authored choice.
     * @param {string} nodeId Owning node id (for error paths).
     * @param {number} index Choice index (for error paths).
     * @param {Object} raw Author choice.
     * @returns {Object} Frozen normalized choice.
     * @private
     */
    _normalizeChoice(nodeId, index, raw) {
        const path = `node '${nodeId}' choice ${index}`;
        if (raw === null || typeof raw !== 'object') {
            throw new TypeError(`[NPC] ${path} must be an object.`);
        }
        if (typeof raw.label !== 'string' || raw.label.length === 0) {
            throw new TypeError(`[NPC] ${path} needs a non-empty label.`);
        }
        if (raw.condition !== undefined && typeof raw.condition !== 'function') {
            throw new TypeError(`[NPC] ${path}.condition must be a function.`);
        }
        let next = null;
        if (raw.next !== undefined && raw.next !== null) {
            if (typeof raw.next !== 'string') {
                throw new TypeError(`[NPC] ${path}.next must be a string or null.`);
            }
            next = raw.next;
        }
        return Object.freeze({
            label: raw.label,
            next,
            condition: raw.condition ?? null,
            quest: this._normalizeQuestAction(path, raw.quest)
        });
    }

    /**
     * Validates a declarative { op, id } quest record.
     * @param {string} path Error-path label.
     * @param {*} raw Author value.
     * @returns {?Object} Frozen quest record, or null.
     * @private
     */
    _normalizeQuestAction(path, raw) {
        if (raw === undefined || raw === null) return null;
        const ops = Object.values(QUEST_OP);
        if (typeof raw !== 'object' || !ops.includes(raw.op) ||
            typeof raw.id !== 'string' || raw.id.length === 0) {
            throw new TypeError(
                `[NPC] ${path} quest must be { op: ${ops.join('|')}, id: string }.`
            );
        }
        return Object.freeze({ op: raw.op, id: raw.id });
    }

    /* ══════════════════════════════════════════════════════════════════
       DIALOGUE STATE MACHINE
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {boolean} True while any conversation state is open. */
    get inDialogue() {
        return this._dialogueState !== DIALOGUE_STATE.CLOSED;
    }

    /** @returns {string} Current DIALOGUE_STATE value. */
    get dialogueState() {
        return this._dialogueState;
    }

    /**
     * Builds the condition/hook context (see header table).
     * @returns {Object} Fresh context object.
     * @private
     */
    _buildContext() {
        const player = this._dialoguePlayer ?? this._player;
        const questSystem = this._questSystem;
        return {
            npc: this,
            player,
            orangeFraction: player && Number.isFinite(player.energyFraction)
                ? player.energyFraction
                : 1,
            world: player && typeof player.world === 'string' ? player.world : 'DREAM',
            hasFlag: (name) => (questSystem ? questSystem.hasFlag(name) : false),
            questStatus: (questId) => (questSystem
                ? questSystem.getQuestStatus(questId)
                : QUEST_STATUS.LOCKED)
        };
    }

    /**
     * Evaluates an author condition, fail-soft: a throwing hook logs and
     * evaluates to false so broken content can never kill the tick.
     * @param {Function} condition Author condition.
     * @param {Object} context Dialogue context.
     * @returns {boolean}
     * @private
     */
    _evaluateCondition(condition, context) {
        try {
            return Boolean(condition(context));
        } catch (error) {
            console.error(`[NPC #${this.id}] dialogue condition failed:`, error);
            return false;
        }
    }

    /**
     * Resolves the entry node for a new conversation. Start rules run in
     * order and the first passing condition wins; otherwise the tree's
     * static start node is used.
     * @returns {string} Node id.
     * @private
     */
    _resolveStartNode() {
        const context = this._buildContext();
        for (let i = 0; i < this._dialogue.startRules.length; i += 1) {
            const rule = this._dialogue.startRules[i];
            if (this._evaluateCondition(rule.condition, context)) {
                return rule.node;
            }
        }
        return this._dialogue.start;
    }

    /**
     * Opens a conversation with the player. Idempotent while open.
     * @param {Object} player Player entering the conversation.
     * @param {Object} [opts]
     * @param {boolean} [opts.force=false] Skip the proximity requirement
     *   (scripted cutscenes).
     * @returns {boolean} True if the dialogue actually opened.
     */
    beginDialogue(player, opts = {}) {
        if (this.inDialogue || !this.active) return false;
        if (!opts.force) {
            this._player = player ?? this._player;
            if (!this.checkInteractionRange(player)) return false;
        }
        this._dialoguePlayer = player ?? this._player;
        this._enterNode(this._resolveStartNode());
        this._dispatch('dialoguestart', { id: this.id, nodeId: this._activeNodeId });
        return true;
    }

    /**
     * Enters a node: resets line state, applies entry effects in the
     * contractual order (flags → quest → onEnter), and starts the
     * typewriter. Entry effects are fail-soft; author content must not
     * be able to crash the simulation.
     * @param {string} nodeId Node to enter.
     * @private
     */
    _enterNode(nodeId) {
        const node = this._dialogue.nodes.get(nodeId);
        if (!node) {
            throw new RangeError(`[NPC] Unknown dialogue node: ${nodeId}.`);
        }
        this._activeNodeId = nodeId;
        this._lineIndex = 0;
        this._revealedChars = 0;
        this._selectedChoice = 0;
        this._dialogueState = DIALOGUE_STATE.TYPING;

        const context = this._buildContext();

        /* 1. Flag writes. */
        if (this._questSystem && node.flags.length > 0) {
            for (const flag of node.flags) {
                try {
                    this._questSystem.setFlag(flag.name, flag.value);
                } catch (error) {
                    console.error(`[NPC #${this.id}] setFlag('${flag.name}') failed:`, error);
                }
            }
        }

        /* 2. Declarative quest action. */
        if (node.quest) {
            this._executeQuestAction(node.quest);
        }

        /* 3. Author hook. */
        if (node.onEnter) {
            try {
                node.onEnter(this, context);
            } catch (error) {
                console.error(`[NPC #${this.id}] onEnter('${nodeId}') failed:`, error);
            }
        }

        this._dispatch('nodeenter', { id: this.id, nodeId });
    }

    /**
     * Executes a declarative quest record against the QuestSystem and
     * rebroadcasts it for HUD/server mirrors.
     * @param {{op: string, id: string}} quest Quest record.
     * @private
     */
    _executeQuestAction(quest) {
        if (!this._questSystem) return;
        try {
            switch (quest.op) {
                case QUEST_OP.OFFER:
                    this._questSystem.offerQuest(quest.id);
                    break;
                case QUEST_OP.ACCEPT:
                    this._questSystem.acceptQuest(quest.id);
                    break;
                case QUEST_OP.COMPLETE:
                    this._questSystem.completeQuest(quest.id);
                    break;
                default:
                    break;
            }
            this._dispatch('questaction', { id: this.id, op: quest.op, questId: quest.id });
        } catch (error) {
            console.error(
                `[NPC #${this.id}] quest ${quest.op}('${quest.id}') failed:`, error
            );
        }
    }

    /**
     * Advances the conversation. This is the single ACTION-key entry
     * point, covering all three open states:
     *   TYPING     → fast-forward the typewriter to the full line;
     *   LINE_READY → next line, choice list, continuation, or close;
     *   CHOICES    → confirm the highlighted choice.
     * @returns {boolean} True if the call changed dialogue state.
     */
    advanceDialogue() {
        if (!this.inDialogue) return false;

        if (this._dialogueState === DIALOGUE_STATE.TYPING) {
            /* Skip-to-end: impatient players never wait out the type. */
            this._revealedChars = this._currentLine().length;
            this._dialogueState = DIALOGUE_STATE.LINE_READY;
            return true;
        }

        if (this._dialogueState === DIALOGUE_STATE.LINE_READY) {
            const node = this._activeNode();

            /* More lines on this node? Keep typing. */
            if (this._lineIndex + 1 < node.text.length) {
                this._lineIndex += 1;
                this._revealedChars = 0;
                this._dialogueState = DIALOGUE_STATE.TYPING;
                return true;
            }

            /* Lines exhausted: evaluate choice conditions NOW so this
             * conversation's own quest completions can unlock branches. */
            if (node.choices.length > 0) {
                const context = this._buildContext();
                this._visibleChoices = node.choices.filter(
                    (choice) => choice.condition === null ||
                        this._evaluateCondition(choice.condition, context)
                );
                if (this._visibleChoices.length > 0) {
                    this._selectedChoice = 0;
                    this._dialogueState = DIALOGUE_STATE.CHOICES;
                    return true;
                }
            }

            /* No visible choices: follow linear continuation or close. */
            if (node.next !== null) {
                this._enterNode(node.next);
            } else {
                this.endDialogue('terminal');
            }
            return true;
        }

        if (this._dialogueState === DIALOGUE_STATE.CHOICES) {
            return this._confirmChoice();
        }
        return false;
    }

    /**
     * Moves the choice highlight with wrap-around (up from the first
     * option lands on the last — standard menu feel).
     * @param {number} delta -1 or +1 (any integer is clamped to a step).
     * @returns {this}
     */
    moveChoiceSelection(delta) {
        if (this._dialogueState !== DIALOGUE_STATE.CHOICES) return this;
        if (this._visibleChoices.length === 0) return this;
        const step = delta < 0 ? -1 : 1;
        const count = this._visibleChoices.length;
        this._selectedChoice = ((this._selectedChoice + step) % count + count) % count;
        return this;
    }

    /**
     * Confirms the highlighted choice: runs its quest record and either
     * transitions to its target node or closes the conversation.
     * @returns {boolean} True if a choice was confirmed.
     * @private
     */
    _confirmChoice() {
        const choice = this._visibleChoices[this._selectedChoice];
        if (!choice) return false;
        if (choice.quest) {
            this._executeQuestAction(choice.quest);
        }
        this._dispatch('choice', {
            id: this.id,
            nodeId: this._activeNodeId,
            label: choice.label
        });
        if (choice.next !== null) {
            this._enterNode(choice.next);
        } else {
            this.endDialogue('terminal');
        }
        return true;
    }

    /**
     * Ends the conversation and releases all dialogue state.
     * @param {string} [reason='closed'] Close cause for listeners:
     *   'closed' (player exit), 'terminal' (tree exhausted),
     *   'walkedaway' (break radius), 'destroyed'.
     * @returns {boolean} True if a dialogue was actually open.
     */
    endDialogue(reason = 'closed') {
        if (!this.inDialogue) return false;
        const nodeId = this._activeNodeId;
        this._dialogueState = DIALOGUE_STATE.CLOSED;
        this._activeNodeId = null;
        this._lineIndex = 0;
        this._revealedChars = 0;
        this._visibleChoices = [];
        this._selectedChoice = 0;
        this._dialoguePlayer = null;
        this._dispatch('dialogueend', { id: this.id, nodeId, reason });
        return true;
    }

    /** @returns {?Object} Active node record. @private */
    _activeNode() {
        return this._activeNodeId ? this._dialogue.nodes.get(this._activeNodeId) : null;
    }

    /** @returns {string} Current line's full text. @private */
    _currentLine() {
        const node = this._activeNode();
        if (!node) return '';
        return node.text[Math.min(this._lineIndex, node.text.length - 1)];
    }

    /**
     * Routes InputManager queries into the dialogue machine. WorldManager
     * calls this each tick while a conversation is open; the return value
     * tells the caller whether gameplay input should stay suppressed.
     *
     *   ACTION      advance / confirm
     *   MOVE_UP/DN  choice navigation (CHOICES state only)
     *   PAUSE       exit the conversation
     *
     * @param {Object} input InputManager (already tick-updated).
     * @returns {boolean} True if input was consumed by the dialogue.
     */
    handleInput(input) {
        if (!this.inDialogue || !input || typeof input.isActionJustPressed !== 'function') {
            return false;
        }
        if (input.isActionJustPressed('PAUSE')) {
            this.endDialogue('closed');
            return true;
        }
        if (this._dialogueState === DIALOGUE_STATE.CHOICES) {
            if (input.isActionJustPressed('MOVE_UP')) {
                this.moveChoiceSelection(-1);
                return true;
            }
            if (input.isActionJustPressed('MOVE_DOWN')) {
                this.moveChoiceSelection(1);
                return true;
            }
        }
        if (input.isActionJustPressed('ACTION')) {
            this.advanceDialogue();
            return true;
        }
        return false;
    }

    /**
     * Presentation snapshot for the HUD typewriter panel. Allocates one
     * object; poll at HUD rate, not per tick.
     * @returns {{
     *   active: boolean, state: string, nodeId: ?string, speaker: string,
     *   lineIndex: number, lineCount: number, visibleText: string,
     *   fullLine: string, lineComplete: boolean,
     *   choices: Array<{label: string, selected: boolean}>
     * }}
     */
    getDialogueView() {
        if (!this.inDialogue) {
            return {
                active: false,
                state: this._dialogueState,
                nodeId: null,
                speaker: this.name,
                lineIndex: 0,
                lineCount: 0,
                visibleText: '',
                fullLine: '',
                lineComplete: false,
                choices: []
            };
        }
        const fullLine = this._currentLine();
        const revealed = Math.min(fullLine.length, Math.floor(this._revealedChars));
        return {
            active: true,
            state: this._dialogueState,
            nodeId: this._activeNodeId,
            speaker: this.name,
            lineIndex: this._lineIndex,
            lineCount: this._activeNode().text.length,
            visibleText: fullLine.slice(0, revealed),
            fullLine,
            lineComplete: this._dialogueState !== DIALOGUE_STATE.TYPING,
            choices: this._dialogueState === DIALOGUE_STATE.CHOICES
                ? this._visibleChoices.map((choice, i) => ({
                    label: choice.label,
                    selected: i === this._selectedChoice
                }))
                : []
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances proximity tracking, the typewriter, break-away detection,
     * and facing by one fixed tick, then delegates physics to Entity.
     * @param {number} dt Fixed timestep, seconds.
     * @param {Object} [player] Player override (WorldManager passes it
     *   through the worlds.update(dt, input, player) chain).
     * @returns {this}
     */
    update(dt, player = this._player) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        if (!this.active) return this;

        if (player) {
            this._player = player;
        }

        /* ---- Proximity tracking with edge events ---------------------- */
        const inRange = this.checkInteractionRange(this._player);
        if (inRange !== this._playerInProximity) {
            this._playerInProximity = inRange;
            this._dispatch(inRange ? 'rangeenter' : 'rangeexit', {
                id: this.id,
                playerId: this._player?.id ?? null
            });
        }

        /* ---- Dialogue bookkeeping -------------------------------------- */
        if (this.inDialogue) {
            /* Typewriter advance lives in the simulation, not the HUD,
             * so reveal speed is tick-deterministic on every display. */
            if (this._dialogueState === DIALOGUE_STATE.TYPING) {
                this._revealedChars += this._charsPerSecond * dt;
                if (this._revealedChars >= this._currentLine().length) {
                    this._revealedChars = this._currentLine().length;
                    this._dialogueState = DIALOGUE_STATE.LINE_READY;
                }
            }

            /* Break-away: walking out of an extended radius while talking
             * closes the conversation instead of leashing the player. */
            if (this._dialoguePlayer) {
                const breakRadius = this._interactionRadius * BREAK_RADIUS_MULTIPLIER;
                if (this.distanceSquaredTo(this._dialoguePlayer) > breakRadius * breakRadius) {
                    this.endDialogue('walkedaway');
                }
            }
        }

        /* ---- Face the visitor ------------------------------------------ */
        if (this._facePlayer && this._playerInProximity && this._player) {
            const heading = Math.atan2(
                this._player.y - this.y,
                this._player.x - this.x
            );
            this.turnTowards(heading, dt);
        }

        super.update(dt);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       APPEARANCE & RENDERING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Applies the NPC glow pulse on top of the base appearance. The
     * pulse is suppressed during a hit-flash so damage feedback stays
     * pure white for its full duration.
     * @param {{char:number,fg:number,bg:number,alpha:number}} appearance
     * @param {number} alpha Presentation interpolation phase.
     * @returns {void}
     */
    prepareAppearance(appearance, alpha) {
        super.prepareAppearance(appearance, alpha);
        if (!this.isFlashing) {
            /* Slow breathing glow: alpha oscillates in [GLOW_MIN, 1]. */
            const pulse = 0.5 + 0.5 * Math.sin(TWO_PI * GLOW_HZ * this.age);
            const glow = GLOW_MIN_ALPHA + (1 - GLOW_MIN_ALPHA) * pulse;
            appearance.alpha *= glow;
        }
    }

    /**
     * Draws the floating indicator above the NPC's head:
     *   dialogue open      → '"' speech mark
     *   quest turn-in      → bobbing green '?'
     *   quest available    → bobbing gold '!'
     *   otherwise in range → bobbing '[E]' interact prompt
     * The bob toggles between the two cells directly above the head,
     * which reads as hover in ASCII without sub-cell rendering.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {number} col Anchor cell column.
     * @param {number} row Anchor cell row.
     * @returns {number} Cells written.
     * @private
     */
    _drawIndicator(buffer, col, row) {
        let written = 0;

        if (this.inDialogue) {
            if (this._writeCell(buffer, col, row - 1, SPEECH_MARK, SPEECH_FG, null, 1)) {
                written += 1;
            }
            return written;
        }
        if (!this._playerInProximity) return written;

        const bobRow = row - (Math.sin(TWO_PI * BOB_HZ * this.age) > 0 ? 2 : 1);
        const marker = this.getQuestMarker();

        if (marker === '?') {
            if (this._writeCell(buffer, col, bobRow, MARKER_READY, MARKER_READY_FG, null, 1)) {
                written += 1;
            }
            return written;
        }
        if (marker === '!') {
            if (this._writeCell(buffer, col, bobRow, MARKER_AVAILABLE, MARKER_AVAILABLE_FG, null, 1)) {
                written += 1;
            }
            return written;
        }

        /* Plain interact prompt: [E] centered above the head. */
        if (this._writeCell(buffer, col - 1, bobRow, PROMPT_LEFT, PROMPT_FG, null, 1)) written += 1;
        if (this._writeCell(buffer, col, bobRow, PROMPT_KEY, PROMPT_FG, null, 1)) written += 1;
        if (this._writeCell(buffer, col + 1, bobRow, PROMPT_RIGHT, PROMPT_FG, null, 1)) written += 1;
        return written;
    }

    /**
     * Draws the NPC glyph plus its indicator. Indicator first so the
     * body glyph wins any accidental overlap.
     * @param {ASCIIBuffer} asciiBuffer Destination world buffer.
     * @param {?Object} [camera=null] Camera (x/y, optional cell metrics).
     * @param {number} [alpha=1] GameLoop interpolation phase.
     * @returns {number} Cells written.
     */
    render(asciiBuffer, camera = null, alpha = 1) {
        if (!(asciiBuffer instanceof ASCIIBuffer)) {
            throw new TypeError('[NPC] render requires an ASCIIBuffer.');
        }
        if (!this.visible || !this.active) return 0;

        const phase = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
        const camX = camera && Number.isFinite(camera.x) ? camera.x : 0;
        const camY = camera && Number.isFinite(camera.y) ? camera.y : 0;
        const cellW = camera && Number.isFinite(camera.cellWidth) && camera.cellWidth > 0
            ? camera.cellWidth : this._cellW;
        const cellH = camera && Number.isFinite(camera.cellHeight) && camera.cellHeight > 0
            ? camera.cellHeight : this._cellH;

        const pos = this.getRenderPosition(phase, _renderPoint);
        const col = Math.floor((pos.x - camX) / cellW + 0.5);
        const row = Math.floor((pos.y - camY) / cellH + 0.5);

        let written = this._drawIndicator(asciiBuffer, col, row);

        const appearance = this._appearance;
        this.prepareAppearance(appearance, phase);
        if (appearance.alpha > 0.02) {
            if (this._writeCell(
                asciiBuffer, col, row, appearance.char,
                appearance.fg, appearance.bg, appearance.alpha
            )) {
                written += 1;
            }
        }
        return written;
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Extended diagnostics: Entity metrics plus dialogue/proximity state.
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...super.getMetrics(),
            dialogueState: this._dialogueState,
            activeNode: this._activeNodeId,
            playerInRange: this._playerInProximity,
            questMarker: this.getQuestMarker(),
            questIds: [...this._questIds],
            interactionRadius: this._interactionRadius
        };
    }

    /**
     * Destroy override: an open conversation must not survive its NPC.
     * Ends the dialogue first so listeners see a clean 'dialogueend'
     * before the Entity 'destroy' event clears the listener registry.
     * @returns {boolean} True if this call caused the transition.
     */
    destroy() {
        if (this.inDialogue) {
            this.endDialogue('destroyed');
        }
        return super.destroy();
    }

    /* ══════════════════════════════════════════════════════════════════
       CONTENT FACTORIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds the temporal mender quest-giver: briefs the player on
     * temporal anomalies, drives the seal-the-tear quest chain end to
     * end, and routes low-orange players toward the Orange Juice Cart.
     * Demonstrates start rules, declarative quest ops, flags, and
     * orange-fraction branching — use it as the template for new givers.
     * @param {Object} [options] NPC options (position, questSystem...).
     * @returns {NPC}
     */
    static createTemporalMender(options = {}) {
        return new NPC({
            name: 'Mender Ira',
            char: 'M',
            fgColor: '#7fe0d4',
            dialogue: MENDER_DIALOGUE,
            quests: ['seal_temporal_tear', 'juice_cart_delivery'],
            interactionRadius: 52,
            tags: ['npc', 'quest-giver', 'loom'],
            ...options
        });
    }

    /**
     * Builds a generic ambient villager with the default small talk tree.
     * @param {Object} [options] NPC options.
     * @returns {NPC}
     */
    static createVillager(options = {}) {
        return new NPC({
            dialogue: DEFAULT_NPC_DIALOGUE,
            ...options
        });
    }
}

export default NPC;