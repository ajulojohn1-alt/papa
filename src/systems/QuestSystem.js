/**
 * @file src/systems/QuestSystem.js
 * @module systems/QuestSystem
 * @description
 * Quest tracking, objective progression, state machines, and reward
 * distribution for "A Stitch in Time". QuestSystem is the single authority
 * on what the player has been asked to do, how far along they are, and what
 * they earn for finishing. It is a pure data + rules system: it owns no
 * entities and draws nothing. It advances objective counters from game
 * events, transitions quests through a strict state machine, and broadcasts
 * structured events that the HUD, quest log, NPC markers, and reward
 * consumers subscribe to.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUEST DATA MODEL
 * ───────────────────────────────────────────────────────────────────────────
 * Two object classes separate authoring from runtime, matching the pattern
 * used by InventorySystem (defs vs. instances):
 *
 *   QUEST DEFINITION (frozen, registered once):
 *     { id, title, giver, description, prerequisites: [questId],
 *       objectives: [ { id, type, targets, count, description } ],
 *       rewards: { experience, currency, items: [{id, quantity}] },
 *       nextQuest }
 *
 *   QUEST RUNTIME (per accepted quest):
 *     { state, offered, acceptedAt, completedAt,
 *       objectives: { [objectiveId]: { progress, required, complete } } }
 *
 * Objective TYPES:
 *   collect  — progress when an item is picked up   (InventorySystem event)
 *   kill     — progress when a flagged enemy dies    (CombatSystem event)
 *   talk     — progress when a dialogue ends          (NPC event / recordTalk)
 *   flag     — progress when a quest flag is set      (setFlag)
 *
 * Targets are normalized to lowercase_underscore keys ("Mender Ira" →
 * "mender_ira") so authored targets match entity names, ids, and tags
 * regardless of capitalization or spacing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STATE MACHINE
 * ───────────────────────────────────────────────────────────────────────────
 * Every quest moves through a strict, one-directional machine:
 *
 *   NOT_STARTED ──acceptQuest──► IN_PROGRESS ──all objectives──► READY_TO_TURN_IN ──completeQuest──► COMPLETED
 *        ▲                            │
 *        └────────abandonQuest────────┘
 *
 *   - acceptQuest requires NOT_STARTED and all prerequisites COMPLETED.
 *   - Each objective update re-runs _refreshReadiness; the moment the last
 *     objective completes the quest flips to READY_TO_TURN_IN and emits
 *     'questready' (this is what turns an NPC's '!' marker into a '?').
 *   - completeQuest pays rewards ONLY from READY_TO_TURN_IN (unless forced)
 *     and then advances the optional nextQuest chain link.
 *   - abandonQuest resets progress and returns the quest to NOT_STARTED.
 *
 * getQuestStatus() projects the internal state onto the NPC contract:
 *   COMPLETED → 'COMPLETED', READY → 'READY', IN_PROGRESS → 'ACTIVE',
 *   NOT_STARTED → 'AVAILABLE' (prerequisites met) or 'LOCKED'.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EVENT-DRIVEN OBJECTIVE TRIGGERS
 * ───────────────────────────────────────────────────────────────────────────
 * QuestSystem both EMITS and CONSUMES events.
 *
 * Consumed (auto-subscribed when a system is attached):
 *   CombatSystem   'death'      → recordKill(entity keys)
 *   InventorySystem 'itemadded' → recordCollect(itemId, quantity)
 *   NPC            'dialogueend' → recordTalk(npc keys)
 *
 * Emitted (for HUD / log / audio / rewards):
 *   'questoffered', 'questaccepted', 'objectiveupdated', 'objectivecompleted',
 *   'questready', 'questcompleted', 'rewardgranted', 'questabandoned',
 *   'flagset'.
 *
 * recordKill/recordCollect/recordTalk/setFlag are also public, so systems
 * that are not attached (e.g. BossDragon's own 'defeated' event) can drive
 * objectives directly.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * REWARD PAYOUT LOGIC
 * ───────────────────────────────────────────────────────────────────────────
 * On completeQuest the reward package is resolved in one pass:
 *   experience & currency → added to the internal ledger and broadcast via
 *     'rewardgranted' for the Player/WorldManager to apply to the real bars.
 *   items → granted through the attached InventorySystem.addItem() when
 *     present; overflow is reported, not silently dropped.
 * Rewards are paid exactly once: the state transition to COMPLETED guards
 * against double-payout, and history records the completion.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * UI / LOG INTEGRATION API
 * ───────────────────────────────────────────────────────────────────────────
 * The HUD never inspects internals. It reads pre-shaped views:
 *   getActiveQuests()     summaries of IN_PROGRESS + READY quests
 *   getTrackerSummary()   compact per-objective lines for the overlay
 *   getQuestLog()         full available/active/ready/completed snapshot
 *   getCompletedHistory() ordered completion record
 *   exportState()/loadState() for save files.
 *
 * @example
 * const quests = new QuestSystem({ inventory, combat });
 *
 * // NPC quest-giver integration (validates this exact contract):
 * ira.attachQuestSystem(quests);
 *
 * // Live objective triggers from systems that are not auto-attached:
 * boss.addEventListener('defeated', () => quests.recordKill('clockwork_dragon'));
 *
 * // HUD / reward wiring:
 * quests.addEventListener('questready',     (d) => hud.markReady(d.questId));
 * quests.addEventListener('rewardgranted',  (d) => player.applyRewards(d));
 * quests.addEventListener('objectiveupdated', (d) => tracker.refresh(d));
 *
 * // Per-frame HUD:
 * const tracker = quests.getTrackerSummary();
 */

/* ══════════════════════════════════════════════════════════════════════════
   ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Internal quest lifecycle states. */
export const QUEST_STATE = Object.freeze({
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    READY_TO_TURN_IN: 'READY_TO_TURN_IN',
    COMPLETED: 'COMPLETED'
});

/** Objective categories that drive automatic progression. */
export const OBJECTIVE_TYPE = Object.freeze({
    COLLECT: 'collect',
    KILL: 'kill',
    TALK: 'talk',
    FLAG: 'flag'
});

/**
 * Status vocabulary projected for external consumers. Matches the strings
 * that NPC.getQuestMarker() and the NPC dialogue engine expect.
 */
export const QUEST_STATUS = Object.freeze({
    LOCKED: 'LOCKED',
    AVAILABLE: 'AVAILABLE',
    ACTIVE: 'ACTIVE',
    READY: 'READY',
    COMPLETED: 'COMPLETED'
});

/* ══════════════════════════════════════════════════════════════════════════
   DEFAULT QUEST CATALOG
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The stock quest chain, themed to the temporal storyline and referencing
 * item ids that exist in InventorySystem's default catalog (temporal_shard,
 * orange_juice, stitch_patch) and NPC keys used by the Mender dialogue.
 * @type {Object<string, Object>}
 */
const DEFAULT_QUESTS = Object.freeze({
    temporal_artifact: Object.freeze({
        id: 'temporal_artifact',
        title: 'The Frayed Hour',
        giver: 'Mender Ira',
        description: 'A temporal artifact has shattered across the grove. Recover its shards and report back before the stillness spreads.',
        prerequisites: Object.freeze([]),
        objectives: Object.freeze([
            Object.freeze({ id: 'collect_shards', type: OBJECTIVE_TYPE.COLLECT, target: 'temporal_shard', count: 3, description: 'Collect 3 Temporal Shards.' }),
            Object.freeze({ id: 'report_ira', type: OBJECTIVE_TYPE.TALK, target: 'mender_ira', count: 1, description: 'Report to Mender Ira.' })
        ]),
        rewards: Object.freeze({ experience: 300, currency: 50, items: Object.freeze([Object.freeze({ id: 'stitch_patch', quantity: 2 })]) }),
        nextQuest: 'seal_temporal_tear'
    }),

    seal_temporal_tear: Object.freeze({
        id: 'seal_temporal_tear',
        title: 'Seal the Temporal Tear',
        giver: 'Mender Ira',
        description: 'A temporal tear weeps where the clockflowers stop blooming. Drive back the wisps that guard it and stitch it shut.',
        prerequisites: Object.freeze(['temporal_artifact']),
        objectives: Object.freeze([
            Object.freeze({ id: 'banish_wisps', type: OBJECTIVE_TYPE.KILL, target: 'time_wisp', count: 3, description: 'Banish 3 Time Wisps.' }),
            Object.freeze({ id: 'gather_thread', type: OBJECTIVE_TYPE.COLLECT, target: 'temporal_shard', count: 5, description: 'Gather 5 Temporal Shards for stitch-thread.' })
        ]),
        rewards: Object.freeze({ experience: 600, currency: 120, items: Object.freeze([Object.freeze({ id: 'orange_juice', quantity: 3 })]) }),
        nextQuest: 'juice_cart_delivery'
    }),

    juice_cart_delivery: Object.freeze({
        id: 'juice_cart_delivery',
        title: 'The Orange Juice Cart',
        giver: 'Mender Ira',
        description: 'Your thread runs thin. Find the Orange Juice Cart by the fountain square and fetch a fresh pour from the keeper.',
        prerequisites: Object.freeze(['seal_temporal_tear']),
        objectives: Object.freeze([
            Object.freeze({ id: 'find_keeper', type: OBJECTIVE_TYPE.TALK, target: 'cart_keeper', count: 1, description: 'Speak with the Cart Keeper.' }),
            Object.freeze({ id: 'fetch_juice', type: OBJECTIVE_TYPE.COLLECT, target: 'orange_juice', count: 1, description: 'Obtain a fresh Orange Juice.' })
        ]),
        rewards: Object.freeze({ experience: 150, currency: 30, items: Object.freeze([]) }),
        nextQuest: null
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Normalizes a target/key into a stable lowercase_underscore token so
 * authored targets match entity names, ids, and tags regardless of case
 * or spacing ("Mender Ira" → "mender_ira").
 * @param {*} value Candidate key.
 * @returns {string} Normalized key ('' for non-stringable input).
 */
function normalizeKey(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/* ══════════════════════════════════════════════════════════════════════════
   QUEST SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Manages quest definitions, per-quest state machines, objective
 * progression, reward payout, and quest-log export. See the file header
 * for the state machine, trigger contract, and reward logic.
 */
export class QuestSystem {
    /**
     * @param {Object} [options]
     * @param {Object<string,Object>} [options.quests] Extra quest defs to
     *   merge over the defaults.
     * @param {Object} [options.inventory] InventorySystem for item rewards
     *   and collect-objective sync (duck-typed).
     * @param {Object} [options.combat] CombatSystem for kill triggers.
     * @param {Object<string,*>} [options.flags] Initial quest flags.
     * @throws {TypeError} If options is malformed.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[QuestSystem] options must be an object.');
        }

        /** @type {Map<string,Object>} id → frozen quest definition. */
        this._defs = new Map();
        /** @type {Map<string,Object>} id → runtime state. */
        this._runtime = new Map();
        /** @type {Map<string,*>} Quest flags (NPC setFlag/hasFlag contract). */
        this._flags = new Map();
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {Array<{system:Object,type:string,handler:Function}>} */
        this._subscriptions = [];
        /** @type {{experience:number,currency:number}} */
        this._ledger = { experience: 0, currency: 0 };
        /** @type {Array<Object>} Ordered completion history. */
        this._history = [];
        /** @type {number} Sim/real timestamp source for history entries. */
        this._clock = 0;

        /* Register the catalog: defaults first, then merges/overrides. */
        for (const def of Object.values(DEFAULT_QUESTS)) this.defineQuest(def);
        if (options.quests && typeof options.quests === 'object') {
            for (const def of Object.values(options.quests)) this.defineQuest(def);
        }

        /* Seed runtime state for every registered quest. */
        for (const id of this._defs.keys()) this._runtime.set(id, this._freshRuntime());

        /* Initial flags. */
        if (options.flags && typeof options.flags === 'object') {
            for (const [name, value] of Object.entries(options.flags)) {
                this._flags.set(name, value);
            }
        }

        /* Optional system wiring. */
        /** @type {?Object} */
        this._inventory = null;
        /** @type {?Object} */
        this._combat = null;
        if (options.inventory) this.attachInventory(options.inventory);
        if (options.combat) this.attachCombatSystem(options.combat);
    }

    /* ══════════════════════════════════════════════════════════════════
       QUEST DEFINITIONS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Validates, normalizes, and freezes a quest definition, then seeds a
     * fresh runtime entry. Re-registering an id replaces the definition and
     * resets that quest's runtime state.
     * @param {Object} def Author quest definition.
     * @returns {this}
     */
    defineQuest(def) {
        if (!def || typeof def.id !== 'string' || def.id.length === 0) {
            throw new TypeError('[QuestSystem] quest def needs a string id.');
        }
        if (!Array.isArray(def.objectives)) {
            throw new RangeError(`[QuestSystem] quest '${def.id}' needs an objectives array.`);
        }

        const objectives = def.objectives.map((obj, i) => {
            if (!Object.values(OBJECTIVE_TYPE).includes(obj.type)) {
                throw new RangeError(`[QuestSystem] quest '${def.id}' objective ${i} has invalid type.`);
            }
            const count = Math.max(1, Math.floor(obj.count ?? 1));
            const rawTargets = Array.isArray(obj.target) ? obj.target : [obj.target];
            const targets = rawTargets.map(normalizeKey).filter((t) => t.length > 0);
            if (targets.length === 0) {
                throw new RangeError(`[QuestSystem] quest '${def.id}' objective ${i} needs a target.`);
            }
            return Object.freeze({
                id: obj.id ?? `obj_${i}`,
                type: obj.type,
                targets: Object.freeze(targets),
                count,
                description: obj.description ?? `${obj.type} ${targets.join('/')} ×${count}`
            });
        });

        const rewards = def.rewards ?? {};
        const items = Array.isArray(rewards.items)
            ? rewards.items
                .filter((it) => it && typeof it.id === 'string')
                .map((it) => Object.freeze({ id: it.id, quantity: Math.max(1, Math.floor(it.quantity ?? 1)) }))
            : [];

        const normalized = Object.freeze({
            id: def.id,
            title: def.title ?? def.id,
            giver: def.giver ?? null,
            description: def.description ?? '',
            prerequisites: Object.freeze((def.prerequisites ?? []).filter((p) => typeof p === 'string')),
            objectives: Object.freeze(objectives),
            rewards: Object.freeze({
                experience: Math.max(0, Math.floor(rewards.experience ?? 0)),
                currency: Math.max(0, Math.floor(rewards.currency ?? 0)),
                items: Object.freeze(items)
            }),
            nextQuest: typeof def.nextQuest === 'string' ? def.nextQuest : null
        });

        this._defs.set(normalized.id, normalized);
        this._runtime.set(normalized.id, this._freshRuntime());
        return this;
    }

    /**
     * Builds a fresh runtime state object for a quest.
     * @returns {Object}
     * @private
     */
    _freshRuntime() {
        return {
            state: QUEST_STATE.NOT_STARTED,
            offered: false,
            acceptedAt: null,
            completedAt: null,
            objectives: {}
        };
    }

    /** @param {string} id @returns {?Object} */
    getQuestDef(id) {
        return this._defs.get(id) ?? null;
    }

    /** @param {string} id @returns {?Object} */
    getQuestState(id) {
        const rt = this._runtime.get(id);
        return rt ? rt.state : null;
    }

    /* ══════════════════════════════════════════════════════════════════
       NPC CONTRACT (status / offer / accept / complete / flags)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Projects internal state onto the NPC status vocabulary. This is the
     * method NPC.getQuestMarker() and the dialogue engine rely on.
     * @param {string} id Quest id.
     * @returns {string} QUEST_STATUS value.
     */
    getQuestStatus(id) {
        const rt = this._runtime.get(id);
        const def = this._defs.get(id);
        if (!rt || !def) return QUEST_STATUS.LOCKED;
        switch (rt.state) {
            case QUEST_STATE.COMPLETED: return QUEST_STATUS.COMPLETED;
            case QUEST_STATE.READY_TO_TURN_IN: return QUEST_STATUS.READY;
            case QUEST_STATE.IN_PROGRESS: return QUEST_STATUS.ACTIVE;
            default:
                return this._prerequisitesMet(def) ? QUEST_STATUS.AVAILABLE : QUEST_STATUS.LOCKED;
        }
    }

    /**
     * Whether every prerequisite quest is COMPLETED.
     * @param {Object} def Quest definition.
     * @returns {boolean}
     * @private
     */
    _prerequisitesMet(def) {
        for (const pre of def.prerequisites) {
            const state = this.getQuestState(pre);
            if (state !== QUEST_STATE.COMPLETED) return false;
        }
        return true;
    }

    /**
     * Marks a quest as offered (for UI ordering/log grouping) and emits
     * 'questoffered'. Idempotent for already-offered quests.
     * @param {string} id Quest id.
     * @returns {boolean} True if the quest became offered.
     */
    offerQuest(id) {
        const rt = this._runtime.get(id);
        if (!rt || rt.state === QUEST_STATE.COMPLETED) return false;
        if (rt.offered) return false;
        rt.offered = true;
        this._dispatch('questoffered', { questId: id, title: this._defs.get(id)?.title ?? id });
        return true;
    }

    /**
     * Accepts a quest: validates NOT_STARTED + prerequisites, initializes
     * objective progress (syncing collect objectives from inventory), and
     * transitions to IN_PROGRESS — or straight to READY if it has no
     * objectives.
     * @param {string} id Quest id.
     * @returns {boolean} True if the quest was accepted.
     */
    acceptQuest(id) {
        const def = this._defs.get(id);
        const rt = this._runtime.get(id);
        if (!def || !rt) return false;
        if (rt.state !== QUEST_STATE.NOT_STARTED) return false;
        if (!this._prerequisitesMet(def)) return false;

        rt.state = QUEST_STATE.IN_PROGRESS;
        rt.acceptedAt = ++this._clock;
        rt.objectives = {};
        for (const obj of def.objectives) {
            rt.objectives[obj.id] = { progress: 0, required: obj.count, complete: false };
        }

        /* Sync collect objectives against what is already carried. */
        if (this._inventory && typeof this._inventory.countItem === 'function') {
            for (const obj of def.objectives) {
                if (obj.type !== OBJECTIVE_TYPE.COLLECT) continue;
                let held = 0;
                for (const target of obj.targets) {
                    held = Math.max(held, this._inventory.countItem(target));
                }
                const prog = rt.objectives[obj.id];
                prog.progress = Math.min(obj.count, held);
                prog.complete = prog.progress >= obj.count;
            }
        }

        this._dispatch('questaccepted', { questId: id, title: def.title });
        this._refreshReadiness(id);
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       OBJECTIVE PROGRESSION (EVENT-DRIVEN TRIGGERS)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances matching objectives across all IN_PROGRESS quests.
     * @param {string} type OBJECTIVE_TYPE value.
     * @param {string|string[]} candidates Candidate target keys.
     * @param {number} [amount=1] Progress to add.
     * @returns {number} Number of objective updates applied.
     * @private
     */
    _advanceObjectives(type, candidates, amount = 1) {
        const keys = (Array.isArray(candidates) ? candidates : [candidates])
            .map(normalizeKey)
            .filter((k) => k.length > 0);
        if (keys.length === 0 || !Number.isFinite(amount) || amount <= 0) return 0;

        let updated = 0;
        for (const [id, rt] of this._runtime) {
            if (rt.state !== QUEST_STATE.IN_PROGRESS) continue;
            const def = this._defs.get(id);
            if (!def) continue;
            let questChanged = false;

            for (const obj of def.objectives) {
                if (obj.type !== type) continue;
                if (!this._targetsIntersect(obj.targets, keys)) continue;
                const prog = rt.objectives[obj.id];
                if (!prog || prog.complete) continue;

                const before = prog.progress;
                prog.progress = Math.min(obj.count, prog.progress + amount);
                if (prog.progress === before) continue;

                questChanged = true;
                updated += 1;
                this._dispatch('objectiveupdated', {
                    questId: id,
                    objectiveId: obj.id,
                    description: obj.description,
                    progress: prog.progress,
                    required: obj.count
                });
                if (prog.progress >= obj.count) {
                    prog.complete = true;
                    this._dispatch('objectivecompleted', { questId: id, objectiveId: obj.id });
                }
            }

            if (questChanged) this._refreshReadiness(id);
        }
        return updated;
    }

    /**
     * Whether any objective target matches any candidate key.
     * @param {ReadonlyArray<string>} targets Normalized objective targets.
     * @param {string[]} keys Normalized candidate keys.
     * @returns {boolean}
     * @private
     */
    _targetsIntersect(targets, keys) {
        for (const t of targets) {
            if (keys.includes(t)) return true;
        }
        return false;
    }

    /**
     * Flips an IN_PROGRESS quest to READY_TO_TURN_IN when every objective
     * is complete, emitting 'questready'.
     * @param {string} id Quest id.
     * @returns {void}
     * @private
     */
    _refreshReadiness(id) {
        const rt = this._runtime.get(id);
        const def = this._defs.get(id);
        if (!rt || !def || rt.state !== QUEST_STATE.IN_PROGRESS) return;
        for (const obj of def.objectives) {
            if (!rt.objectives[obj.id]?.complete) return;
        }
        rt.state = QUEST_STATE.READY_TO_TURN_IN;
        this._dispatch('questready', { questId: id, title: def.title });
    }

    /**
     * Public kill trigger. CombatSystem 'death' calls this automatically;
     * bosses with their own defeat flow can call it directly.
     * @param {string|string[]} target Enemy key(s).
     * @param {number} [count=1] Kills to record.
     * @returns {number} Objective updates applied.
     */
    recordKill(target, count = 1) {
        return this._advanceObjectives(OBJECTIVE_TYPE.KILL, target, count);
    }

    /**
     * Public collect trigger. InventorySystem 'itemadded' calls this
     * automatically.
     * @param {string} itemId Item id.
     * @param {number} [count=1] Quantity collected.
     * @returns {number} Objective updates applied.
     */
    recordCollect(itemId, count = 1) {
        return this._advanceObjectives(OBJECTIVE_TYPE.COLLECT, itemId, count);
    }

    /**
     * Public talk trigger. NPC 'dialogueend' calls this automatically; a
     * dialogue system can also call it with a known NPC key.
     * @param {string|string[]} npcKey NPC key(s).
     * @param {number} [count=1] Conversations to record.
     * @returns {number} Objective updates applied.
     */
    recordTalk(npcKey, count = 1) {
        return this._advanceObjectives(OBJECTIVE_TYPE.TALK, npcKey, count);
    }

    /**
     * Sets a quest flag (NPC setFlag contract) and advances FLAG objectives.
     * @param {string} name Flag name.
     * @param {*} [value=true] Flag value.
     * @returns {void}
     */
    setFlag(name, value = true) {
        if (typeof name !== 'string' || name.length === 0) return;
        this._flags.set(name, value);
        this._dispatch('flagset', { name, value });
        this._advanceObjectives(OBJECTIVE_TYPE.FLAG, name, 1);
    }

    /**
     * Reads a quest flag (NPC hasFlag contract).
     * @param {string} name Flag name.
     * @returns {boolean}
     */
    hasFlag(name) {
        return Boolean(this._flags.get(name));
    }

    /* ══════════════════════════════════════════════════════════════════
       COMPLETION & REWARD PAYOUT
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Completes a READY quest and pays its rewards exactly once. Item
     * rewards are routed through the attached InventorySystem; experience
     * and currency accrue to the ledger and are broadcast for the Player.
     * @param {string} id Quest id.
     * @param {Object} [opts]
     * @param {boolean} [opts.force=false] Bypass the READY requirement.
     * @returns {boolean} True if the quest was completed.
     */
    completeQuest(id, opts = {}) {
        const def = this._defs.get(id);
        const rt = this._runtime.get(id);
        if (!def || !rt) return false;
        if (rt.state === QUEST_STATE.COMPLETED) return false;
        if (rt.state !== QUEST_STATE.READY_TO_TURN_IN && !opts.force) return false;

        rt.state = QUEST_STATE.COMPLETED;
        rt.completedAt = ++this._clock;
        this._history.push({ questId: id, title: def.title, completedAt: rt.completedAt });

        const rewards = this._grantRewards(def);
        this._dispatch('questcompleted', { questId: id, title: def.title, rewards });

        /* Advance the chain link, if any. */
        if (def.nextQuest && this._defs.has(def.nextQuest)) {
            this.offerQuest(def.nextQuest);
        }
        return true;
    }

    /**
     * Resolves a reward package. Item grants go through the attached
     * InventorySystem.addItem() and report overflow; currency/experience
     * accumulate in the internal ledger.
     * @param {Object} def Quest definition.
     * @returns {{experience:number,currency:number,items:Array}}
     * @private
     */
    _grantRewards(def) {
        const { experience, currency, items } = def.rewards;
        this._ledger.experience += experience;
        this._ledger.currency += currency;

        const granted = [];
        for (const item of items) {
            let added = 0;
            let remaining = item.quantity;
            if (this._inventory && typeof this._inventory.addItem === 'function') {
                const result = this._inventory.addItem(item.id, item.quantity);
                added = result.added;
                remaining = result.remaining;
            }
            granted.push({ id: item.id, quantity: item.quantity, added, remaining });
        }

        const payload = { experience, currency, items: granted, questId: def.id };
        this._dispatch('rewardgranted', payload);
        return payload;
    }

    /**
     * Abandons an IN_PROGRESS quest, resetting progress.
     * @param {string} id Quest id.
     * @returns {boolean} True if the quest was abandoned.
     */
    abandonQuest(id) {
        const rt = this._runtime.get(id);
        if (!rt || rt.state !== QUEST_STATE.IN_PROGRESS) return false;
        rt.state = QUEST_STATE.NOT_STARTED;
        rt.acceptedAt = null;
        rt.objectives = {};
        this._dispatch('questabandoned', { questId: id });
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       SYSTEM ATTACHMENT (AUTO TRIGGERS)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a system event and records the subscription for
     * teardown.
     * @param {Object} system Event source with addEventListener.
     * @param {string} type Event name.
     * @param {Function} handler Callback.
     * @returns {void}
     * @private
     */
    _subscribe(system, type, handler) {
        if (!system || typeof system.addEventListener !== 'function') return;
        system.addEventListener(type, handler);
        this._subscriptions.push({ system, type, handler });
    }

    /**
     * Attaches an InventorySystem so item pickups automatically advance
     * collect objectives.
     * @param {?Object} inventory InventorySystem.
     * @returns {this}
     */
    attachInventory(inventory) {
        if (inventory === null) { this._inventory = null; return this; }
        this._inventory = inventory;
        this._subscribe(inventory, 'itemadded', (detail) => {
            if (detail && typeof detail.id === 'string') {
                this.recordCollect(detail.id, detail.quantity ?? 1);
            }
        });
        return this;
    }

    /**
     * Attaches a CombatSystem so enemy deaths automatically advance kill
     * objectives. Uses the defeated entity's name/tags/id as candidate keys.
     * @param {?Object} combat CombatSystem.
     * @returns {this}
     */
    attachCombatSystem(combat) {
        if (combat === null) { this._combat = null; return this; }
        this._combat = combat;
        this._subscribe(combat, 'death', (detail) => {
            if (!detail || !detail.entity) return;
            this.recordKill(this._entityKeys(detail.entity), 1);
        });
        return this;
    }

    /**
     * Attaches a single NPC so finishing a dialogue advances talk objectives.
     * @param {Object} npc NPC instance.
     * @returns {this}
     */
    attachNPC(npc) {
        this._subscribe(npc, 'dialogueend', () => {
            this.recordTalk(this._entityKeys(npc), 1);
        });
        return this;
    }

    /**
     * Collects the normalized identity keys of an entity (questKey, name,
     * tags, id) for objective matching.
     * @param {Object} entity Any entity.
     * @returns {string[]} Normalized candidate keys.
     * @private
     */
    _entityKeys(entity) {
        const keys = [];
        if (entity.questKey) keys.push(normalizeKey(entity.questKey));
        if (entity.name) keys.push(normalizeKey(entity.name));
        if (Array.isArray(entity.tags)) {
            for (const tag of entity.tags) keys.push(normalizeKey(tag));
        }
        if (entity.id !== undefined && entity.id !== null) keys.push(normalizeKey(entity.id));
        return keys.filter((k) => k.length > 0);
    }

    /* ══════════════════════════════════════════════════════════════════
       UI / LOG INTEGRATION API
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds a summary of one quest for the log/HUD.
     * @param {string} id Quest id.
     * @returns {?Object} Summary, or null when unknown.
     */
    getQuestSummary(id) {
        const def = this._defs.get(id);
        const rt = this._runtime.get(id);
        if (!def || !rt) return null;
        return {
            id,
            title: def.title,
            giver: def.giver,
            description: def.description,
            state: rt.state,
            status: this.getQuestStatus(id),
            offered: rt.offered,
            objectives: def.objectives.map((obj) => {
                const prog = rt.objectives[obj.id] ?? { progress: 0, required: obj.count, complete: false };
                return {
                    id: obj.id,
                    type: obj.type,
                    description: obj.description,
                    progress: prog.progress,
                    required: obj.count,
                    complete: prog.complete
                };
            }),
            rewards: def.rewards
        };
    }

    /**
     * Summaries of all IN_PROGRESS and READY quests, in accept order.
     * @returns {Object[]}
     */
    getActiveQuests() {
        const active = [];
        for (const [id, rt] of this._runtime) {
            if (rt.state === QUEST_STATE.IN_PROGRESS || rt.state === QUEST_STATE.READY_TO_TURN_IN) {
                active.push(this.getQuestSummary(id));
            }
        }
        active.sort((a, b) => (this._runtime.get(a.id).acceptedAt ?? 0) - (this._runtime.get(b.id).acceptedAt ?? 0));
        return active;
    }

    /**
     * Compact tracker lines for the HUD overlay: one entry per active quest
     * with per-objective "progress/required" text and a READY badge.
     * @returns {Array<{questId:string,title:string,ready:boolean,lines:string[]}>}
     */
    getTrackerSummary() {
        const tracker = [];
        for (const summary of this.getActiveQuests()) {
            const lines = summary.objectives.map((obj) => (
                `${obj.description} (${obj.progress}/${obj.required})`
            ));
            tracker.push({
                questId: summary.id,
                title: summary.title,
                ready: summary.state === QUEST_STATE.READY_TO_TURN_IN,
                lines
            });
        }
        return tracker;
    }

    /**
     * Full quest-log snapshot grouped by availability, for the log panel.
     * @returns {{available:Object[],active:Object[],ready:Object[],completed:Object[]}}
     */
    getQuestLog() {
        const available = [];
        const active = [];
        const ready = [];
        for (const id of this._defs.keys()) {
            const summary = this.getQuestSummary(id);
            if (summary.state === QUEST_STATE.NOT_STARTED) {
                if (this.getQuestStatus(id) === QUEST_STATUS.AVAILABLE) available.push(summary);
            } else if (summary.state === QUEST_STATE.IN_PROGRESS) {
                active.push(summary);
            } else if (summary.state === QUEST_STATE.READY_TO_TURN_IN) {
                ready.push(summary);
            }
        }
        return { available, active, ready, completed: this.getCompletedHistory() };
    }

    /**
     * Ordered completion history (oldest → newest).
     * @returns {Array<{questId:string,title:string,completedAt:number}>}
     */
    getCompletedHistory() {
        return [...this._history];
    }

    /** @returns {number} Accumulated reward experience. */
    getExperience() {
        return this._ledger.experience;
    }

    /** @returns {number} Accumulated reward currency. */
    getCurrency() {
        return this._ledger.currency;
    }

    /* ══════════════════════════════════════════════════════════════════
       SERIALIZATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Serializes quest states, flags, ledger, and history for save files.
     * @returns {Object}
     */
    exportState() {
        const quests = {};
        for (const [id, rt] of this._runtime) {
            quests[id] = {
                state: rt.state,
                offered: rt.offered,
                acceptedAt: rt.acceptedAt,
                completedAt: rt.completedAt,
                objectives: JSON.parse(JSON.stringify(rt.objectives))
            };
        }
        return {
            quests,
            flags: Object.fromEntries(this._flags),
            ledger: { ...this._ledger },
            history: [...this._history],
            clock: this._clock
        };
    }

    /**
     * Restores state from a prior exportState(). Unknown quest ids are
     * ignored so a stale save cannot corrupt a changed catalog.
     * @param {Object} state Serialized state.
     * @returns {this}
     */
    loadState(state) {
        if (!state || typeof state !== 'object') return this;
        if (state.quests && typeof state.quests === 'object') {
            for (const [id, saved] of Object.entries(state.quests)) {
                const rt = this._runtime.get(id);
                if (!rt || !saved) continue;
                rt.state = Object.values(QUEST_STATE).includes(saved.state)
                    ? saved.state
                    : QUEST_STATE.NOT_STARTED;
                rt.offered = Boolean(saved.offered);
                rt.acceptedAt = saved.acceptedAt ?? null;
                rt.completedAt = saved.completedAt ?? null;
                rt.objectives = saved.objectives && typeof saved.objectives === 'object'
                    ? JSON.parse(JSON.stringify(saved.objectives))
                    : {};
            }
        }
        if (state.flags && typeof state.flags === 'object') {
            this._flags.clear();
            for (const [name, value] of Object.entries(state.flags)) this._flags.set(name, value);
        }
        if (state.ledger && typeof state.ledger === 'object') {
            this._ledger.experience = Number(state.ledger.experience) || 0;
            this._ledger.currency = Number(state.ledger.currency) || 0;
        }
        if (Array.isArray(state.history)) this._history = [...state.history];
        if (Number.isFinite(state.clock)) this._clock = state.clock;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS & DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a quest event.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {this}
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[QuestSystem] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[QuestSystem] listener must be a function.');
        }
        let set = this._listeners.get(type);
        if (!set) { set = new Set(); this._listeners.set(type, set); }
        set.add(listener);
        return this;
    }

    /**
     * Unsubscribes a listener.
     * @param {string} type Event name.
     * @param {Function} listener Callback to remove.
     * @returns {this}
     */
    removeEventListener(type, listener) {
        const set = this._listeners.get(type);
        if (set) {
            set.delete(listener);
            if (set.size === 0) this._listeners.delete(type);
        }
        return this;
    }

    /**
     * Broadcasts an event. Listener exceptions are caught and logged so a
     * broken subscriber can never break quest progression.
     * @param {string} type Event name.
     * @param {Object} detail Payload.
     * @returns {void}
     * @private
     */
    _dispatch(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[QuestSystem] '${type}' listener failed:`, error);
            }
        }
    }

    /**
     * Diagnostic snapshot for the debug HUD. Allocates; poll at HUD rate.
     * @returns {Object}
     */
    getMetrics() {
        const byState = {
            NOT_STARTED: 0,
            IN_PROGRESS: 0,
            READY_TO_TURN_IN: 0,
            COMPLETED: 0
        };
        for (const rt of this._runtime.values()) {
            byState[rt.state] = (byState[rt.state] || 0) + 1;
        }
        return {
            totalQuests: this._defs.size,
            byState,
            completed: this._history.length,
            experience: this._ledger.experience,
            currency: this._ledger.currency,
            flags: this._flags.size,
            subscriptions: this._subscriptions.length
        };
    }

    /**
     * Detaches all external subscriptions and clears listeners. Do not
     * reuse after destroy().
     * @returns {void}
     */
    destroy() {
        for (const sub of this._subscriptions) {
            if (sub.system && typeof sub.system.removeEventListener === 'function') {
                sub.system.removeEventListener(sub.type, sub.handler);
            }
        }
        this._subscriptions.length = 0;
        this._listeners.clear();
    }
}

export default QuestSystem;