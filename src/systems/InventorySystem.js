/**
 * @file src/systems/InventorySystem.js
 * @module systems/InventorySystem
 * @description
 * Item storage, equipment, and usage arbitration for "YUCCA".
 * InventorySystem is the single authority on what the player carries, what
 * they wear, and what those things do. It is a pure data + rules system:
 * it owns no entities, draws nothing, and never mutates the player. It
 * computes outcomes (stat modifiers, use-effects, durability wear) and
 * broadcasts structured events that the HUD, tooltip renderer, Player, and
 * CombatSystem subscribe to.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DATA MODEL: ITEM DEFINITIONS VS. ITEM INSTANCES
 * ───────────────────────────────────────────────────────────────────────────
 * Two distinct object classes keep the catalog authorable and the carried
 * items stateful without conflating them:
 *
 *   ITEM DEFINITION (ItemDef) — static, registered once, frozen:
 *     { id, name, glyph, fg, color, description, type, stackable, maxStack,
 *       rarity, equipSlot, stats, effects, durability }
 *
 *   ITEM INSTANCE — dynamic, lives in a slot or equipment slot:
 *     { id, quantity, instanceId, durability, maxDurability, stats }
 *
 * Definitions describe WHAT an item is (a Temporal Shard, a Stitch Needle).
 * Instances describe a SPECIFIC one the player holds (this shard, count 12;
 * this needle at 73/100 durability). Stackables differ only by quantity;
 * equipment carries per-instance durability and optional rolled stats.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STORAGE LAYOUT & STACKING RULES
 * ───────────────────────────────────────────────────────────────────────────
 * The bag is a fixed-capacity array of slots; each slot is null (empty) or
 * one item instance. Stacking is governed by three checks, evaluated in
 * order before any merge:
 *
 *   1. SAME ID         both instances reference the same definition
 *   2. STACKABLE       the definition's stackable flag is true
 *   3. HEADROOM        current quantity < definition.maxStack
 *
 * addItem() for a stackable first tops up every existing stack of that id
 * that still has headroom, then spills the remainder into empty slots. If
 * capacity is exhausted it reports the overflow instead of dropping items:
 * the return value is { added, remaining }. Equipment and other unique
 * items never stack — each occupies its own slot at quantity 1.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EQUIPMENT & STAT MODIFIER PIPELINE
 * ───────────────────────────────────────────────────────────────────────────
 * Four equipment slots mirror the dual-world silhouette:
 *
 *   HEAD       Mask (Dream net mask) / Veil (Drab shadow veil)
 *   BODY       Poncho (Dream patchwork) / Suit (Drab business suit)
 *   WEAPON     the active tool (Stitch Needle, ...)
 *   ACCESSORY  a charm or trinket
 *
 * equipItem() swaps: the incoming item moves to its slot and whatever was
 * there returns to the slot the incoming item just vacated, so equipping
 * never needs a spare slot. unequipItem() DOES need a free bag slot.
 *
 * Stat modifiers are derived, not stored: getStatModifiers() sums the stats
 * of every equipped, still-functional item on demand. An item whose
 * durability has reached zero is "broken" and contributes nothing until it
 * is repaired. Whenever equipment changes, an 'equipmentchanged' event
 * carries the fresh totals so CombatSystem and Player can re-read them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OPERATION INVARIANTS
 * ───────────────────────────────────────────────────────────────────────────
 * Every public mutation validates before touching state, and fails fast on
 * malformed input (bad slot, unknown item, non-positive quantity). Capacity
 * exhaustion is NOT an error — it is a normal, reported outcome (remaining
 * > 0, or a false return) so the UI can show "inventory full".
 *
 * ───────────────────────────────────────────────────────────────────────────
 * UI INTEGRATION & EVENT CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * The render/HUD layer never inspects internals. It reads views and listens:
 *   getSlotView(i) / getEquipmentView(slot)  pre-joined def+instance rows
 *   getTooltip(i)                            view + pre-formatted text lines
 *   getGridRows(columns)                     slots chunked into draw rows
 *   exportState()                            full serializable snapshot
 * Events: 'itemadded', 'itemremoved', 'itemmoved', 'itemequipped',
 *   'itemunequipped', 'itemused', 'itemdamaged', 'itembroken',
 *   'equipmentchanged', 'inventorychanged'.
 *
 * @example
 * const inventory = new InventorySystem({ capacity: 24 });
 * inventory.addItem('orange_juice', 5);
 * inventory.addItem('stitch_needle');          // unique equipment
 *
 * inventory.addEventListener('equipmentchanged', (d) => combat.refreshStats(d.stats));
 * inventory.addEventListener('itemused', (d) => player.applyEffects(d.effects));
 *
 * inventory.equipItem(inventory.findSlot('stitch_needle'));
 * inventory.useItem(inventory.findSlot('orange_juice'));   // +30 energy event
 *
 * // HUD render pass:
 * const rows = inventory.getGridRows(6);
 * const tip  = inventory.getTooltip(hoveredSlot);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Broad behavioral category of an item. */
export const ITEM_TYPE = Object.freeze({
    CONSUMABLE: 'consumable',
    EQUIPMENT: 'equipment',
    MATERIAL: 'material',
    QUEST: 'quest'
});

/** Equipment slots. Names match the dual-world costume language. */
export const EQUIP_SLOT = Object.freeze({
    HEAD: 'HEAD',           // Mask / Veil
    BODY: 'BODY',           // Poncho / Suit
    WEAPON: 'WEAPON',
    ACCESSORY: 'ACCESSORY'
});

/** Rarity tiers, ordered lowest → highest for sorting and color coding. */
export const RARITY = Object.freeze({
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary'
});

/**
 * Canonical stat keys. These intentionally align with CombatSystem stats
 * (baseAttack, armor, critChance, critMultiplier, temporalResistance) and
 * Player movement/energy (speed, energyRegen, energyMax) so equipped totals
 * can be fed straight into those systems.
 */
export const STAT_KEY = Object.freeze({
    SPEED: 'speed',
    ARMOR: 'armor',
    BASE_ATTACK: 'baseAttack',
    CRIT_CHANCE: 'critChance',
    CRIT_MULTIPLIER: 'critMultiplier',
    ENERGY_REGEN: 'energyRegen',
    ENERGY_MAX: 'energyMax',
    TEMPORAL_RESISTANCE: 'temporalResistance'
});

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Default bag size in slots. */
const DEFAULT_CAPACITY = 24;
/** Hard ceiling on bag size (sanity guard). */
const MAX_CAPACITY = 256;
/** Default stack limit for stackable items. */
const DEFAULT_MAX_STACK = 99;

/** Sort weight per rarity (higher sorts first). */
const RARITY_RANK = Object.freeze({
    [RARITY.COMMON]: 0,
    [RARITY.UNCOMMON]: 1,
    [RARITY.RARE]: 2,
    [RARITY.EPIC]: 3,
    [RARITY.LEGENDARY]: 4
});

/** UI tint per rarity, packed once at module load. */
const RARITY_COLORS = Object.freeze({
    [RARITY.COMMON]: ASCIIBuffer.packColor('#c8c8c8'),
    [RARITY.UNCOMMON]: ASCIIBuffer.packColor('#7dff8a'),
    [RARITY.RARE]: ASCIIBuffer.packColor('#7fe3ff'),
    [RARITY.EPIC]: ASCIIBuffer.packColor('#c48fff'),
    [RARITY.LEGENDARY]: ASCIIBuffer.packColor('#ffd24a')
});

/**
 * The stock item catalog, themed to the Dream/Drab split. Custom items can
 * be merged over these via the constructor `items` option or defineItem().
 * @type {Object<string, Object>}
 */
const DEFAULT_ITEM_DEFS = Object.freeze({
    temporal_shard: Object.freeze({
        id: 'temporal_shard', name: 'Temporal Shard', glyph: '%', color: '#7fe3ff',
        type: ITEM_TYPE.MATERIAL, stackable: true, maxStack: 99, rarity: RARITY.COMMON,
        description: 'A crystallized sliver of frozen time. Used to mend temporal tears.'
    }),
    orange_juice: Object.freeze({
        id: 'orange_juice', name: 'Orange Juice', glyph: '!', color: '#ff7700',
        type: ITEM_TYPE.CONSUMABLE, stackable: true, maxStack: 20, rarity: RARITY.COMMON,
        effects: Object.freeze({ energy: 30 }),
        description: 'Fresh-squeezed. Restores 30 orange energy.'
    }),
    stitch_patch: Object.freeze({
        id: 'stitch_patch', name: 'Stitch Patch', glyph: '+', color: '#7dff8a',
        type: ITEM_TYPE.CONSUMABLE, stackable: true, maxStack: 20, rarity: RARITY.COMMON,
        effects: Object.freeze({ heal: 25 }),
        description: 'A woven patch that closes wounds. Restores 25 HP.'
    }),
    net_mask: Object.freeze({
        id: 'net_mask', name: 'Crocheted Net Mask', glyph: '&', color: '#f4f4f0',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.HEAD,
        rarity: RARITY.UNCOMMON, durability: 60,
        stats: Object.freeze({ temporalResistance: 0.05, energyRegen: 1 }),
        description: 'A hand-crocheted white net mask from the Dream World.'
    }),
    shadow_veil: Object.freeze({
        id: 'shadow_veil', name: 'Shadow Veil', glyph: '&', color: '#8a8f98',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.HEAD,
        rarity: RARITY.UNCOMMON, durability: 60,
        stats: Object.freeze({ armor: 0.05, critChance: 0.03 }),
        description: 'A pitch-black silhouette veil from the Drab World.'
    }),
    patchwork_poncho: Object.freeze({
        id: 'patchwork_poncho', name: 'Patchwork Poncho', glyph: '#', color: '#e5484d',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.BODY,
        rarity: RARITY.RARE, durability: 120,
        stats: Object.freeze({ armor: 0.10, energyMax: 20 }),
        description: 'A quilted poncho of red, blue, and orange patches.'
    }),
    business_suit: Object.freeze({
        id: 'business_suit', name: 'Business Suit', glyph: '=', color: '#33363d',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.BODY,
        rarity: RARITY.RARE, durability: 120,
        stats: Object.freeze({ armor: 0.12, speed: -10 }),
        description: 'Formal Drab attire. Protective, but restrictive.'
    }),
    stitch_needle: Object.freeze({
        id: 'stitch_needle', name: 'Stitch Needle', glyph: '/', color: '#ffd24a',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.WEAPON,
        rarity: RARITY.RARE, durability: 100,
        stats: Object.freeze({ baseAttack: 12, critChance: 0.05 }),
        description: 'A needle that sews reality shut.'
    }),
    thread_charm: Object.freeze({
        id: 'thread_charm', name: 'Thread Charm', glyph: 'o', color: '#c48fff',
        type: ITEM_TYPE.EQUIPMENT, stackable: false, equipSlot: EQUIP_SLOT.ACCESSORY,
        rarity: RARITY.EPIC, durability: 80,
        stats: Object.freeze({ critMultiplier: 0.5, energyRegen: 2 }),
        description: 'A charm spun from living thread.'
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Validates a finite number or throws a prefixed RangeError.
 * @param {number} value Candidate.
 * @param {string} label Field name for diagnostics.
 * @returns {number}
 */
function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new RangeError(`[InventorySystem] ${label} must be a finite number.`);
    }
    return value;
}

/* ══════════════════════════════════════════════════════════════════════════
   INVENTORY SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Slot-based inventory with stacking, equipment slots, stat aggregation,
 * durability, usage, and UI export. See the file header for the model.
 */
export class InventorySystem {
    /**
     * @param {Object} [options]
     * @param {number} [options.capacity=24] Number of bag slots.
     * @param {Object<string,Object>} [options.items] Extra item defs to merge.
     * @param {Array<{id:string,quantity?:number}>} [options.startingItems]
     *   Items granted on construction (starter kit).
     * @throws {TypeError|RangeError} If options are malformed.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[InventorySystem] options must be an object.');
        }
        const capacity = options.capacity ?? DEFAULT_CAPACITY;
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
            throw new RangeError(
                `[InventorySystem] capacity must be an integer in [1, ${MAX_CAPACITY}].`
            );
        }

        /** @type {number} Total bag slots. */
        this._capacity = capacity;
        /** @type {Array<?Object>} Slot array; null = empty. */
        this._slots = new Array(capacity).fill(null);
        /** @type {Map<string,Object>} id → frozen ItemDef. */
        this._registry = new Map();
        /** @type {Object<string,?Object>} EQUIP_SLOT → instance or null. */
        this._equipment = {};
        for (const slot of Object.values(EQUIP_SLOT)) this._equipment[slot] = null;

        /** @type {number} Monotonic instance id counter. */
        this._nextInstanceId = 1;
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {?Function} Optional direct use-effect handler. */
        this._useHandler = null;

        /* Build the catalog: defaults first, then any overrides/merges. */
        for (const def of Object.values(DEFAULT_ITEM_DEFS)) this.defineItem(def);
        if (options.items && typeof options.items === 'object') {
            for (const def of Object.values(options.items)) this.defineItem(def);
        }

        /* Grant the starter kit, if any. */
        if (Array.isArray(options.startingItems)) {
            for (const entry of options.startingItems) {
                if (entry && typeof entry.id === 'string') {
                    this.addItem(entry.id, entry.quantity ?? 1);
                }
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       ITEM REGISTRY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Validates, normalizes, and freezes an item definition, packing its
     * display color. Re-registering an id replaces the previous definition.
     * @param {Object} def Author item definition.
     * @returns {this}
     */
    defineItem(def) {
        if (!def || typeof def.id !== 'string' || def.id.length === 0) {
            throw new TypeError('[InventorySystem] item def needs a string id.');
        }
        if (!Object.values(ITEM_TYPE).includes(def.type)) {
            throw new RangeError(`[InventorySystem] item '${def.id}' has invalid type.`);
        }
        const equipSlot = def.equipSlot ?? null;
        if (def.type === ITEM_TYPE.EQUIPMENT && !equipSlot) {
            throw new RangeError(`[InventorySystem] equipment '${def.id}' needs an equipSlot.`);
        }
        if (equipSlot && !Object.values(EQUIP_SLOT).includes(equipSlot)) {
            throw new RangeError(`[InventorySystem] item '${def.id}' has invalid equipSlot.`);
        }
        const stackable = Boolean(def.stackable);
        const normalized = Object.freeze({
            id: def.id,
            name: def.name ?? def.id,
            glyph: def.glyph ?? '?',
            color: def.color ?? '#e0e0e0',
            fg: ASCIIBuffer.packColor(def.color ?? '#e0e0e0', 0xE0E0E0FF),
            description: def.description ?? '',
            type: def.type,
            stackable,
            maxStack: stackable ? Math.max(1, def.maxStack ?? DEFAULT_MAX_STACK) : 1,
            rarity: def.rarity ?? RARITY.COMMON,
            equipSlot,
            stats: def.stats && typeof def.stats === 'object' ? Object.freeze({ ...def.stats }) : null,
            effects: def.effects && typeof def.effects === 'object' ? Object.freeze({ ...def.effects }) : null,
            durability: Number.isFinite(def.durability) ? Math.max(0, def.durability) : 0
        });
        this._registry.set(normalized.id, normalized);
        return this;
    }

    /**
     * Returns the frozen definition for an id.
     * @param {string} id Item id.
     * @returns {?Object} ItemDef or null.
     */
    getItemDef(id) {
        return this._registry.get(id) ?? null;
    }

    /** @param {string} id @returns {boolean} */
    hasItemDef(id) {
        return this._registry.has(id);
    }

    /**
     * Snapshot list of every registered definition (debug/settings UI).
     * @returns {Object[]}
     */
    getRegistry() {
        return [...this._registry.values()];
    }

    /* ══════════════════════════════════════════════════════════════════
       INSTANCE FACTORY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Creates a fresh item instance from a definition, optionally seeding
     * per-instance metadata (rolled stats, preset durability/quantity).
     * @param {Object} def ItemDef.
     * @param {?Object} [source] Optional seed metadata.
     * @returns {Object} New instance.
     * @private
     */
    _createInstance(def, source = null) {
        const inst = {
            id: def.id,
            quantity: 1,
            instanceId: this._nextInstanceId++,
            durability: def.durability,
            maxDurability: def.durability,
            stats: null
        };
        if (source && typeof source === 'object') {
            if (Number.isFinite(source.quantity) && source.quantity > 0) {
                inst.quantity = Math.floor(source.quantity);
            }
            if (Number.isFinite(source.durability)) inst.durability = source.durability;
            if (source.stats && typeof source.stats === 'object') {
                inst.stats = { ...source.stats };
            }
        }
        return inst;
    }

    /* ══════════════════════════════════════════════════════════════════
       VALIDATION & QUERIES
       ══════════════════════════════════════════════════════════════════ */

    /** @param {number} index @private */
    _assertSlot(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this._capacity) {
            throw new RangeError(
                `[InventorySystem] slot index ${index} out of range [0, ${this._capacity}).`
            );
        }
    }

    /** @param {string} slot @returns {boolean} */
    _isEquipmentSlot(slot) {
        return Object.values(EQUIP_SLOT).includes(slot);
    }

    /** @returns {number} Bag capacity in slots. */
    getCapacity() {
        return this._capacity;
    }

    /** @returns {number} Number of occupied bag slots. */
    getUsedSlots() {
        let used = 0;
        for (let i = 0; i < this._capacity; i += 1) {
            if (this._slots[i] !== null) used += 1;
        }
        return used;
    }

    /** @returns {boolean} True when no bag slot is empty. */
    isFull() {
        return this.firstEmptySlot() === -1;
    }

    /**
     * Finds the first empty bag slot.
     * @returns {number} Slot index, or -1 when full.
     */
    firstEmptySlot() {
        for (let i = 0; i < this._capacity; i += 1) {
            if (this._slots[i] === null) return i;
        }
        return -1;
    }

    /**
     * Returns the raw instance in a bag slot (or null).
     * @param {number} index Slot index.
     * @returns {?Object}
     */
    getSlot(index) {
        this._assertSlot(index);
        return this._slots[index];
    }

    /**
     * Finds the first bag slot holding a given item id.
     * @param {string} id Item id.
     * @returns {number} Slot index, or -1.
     */
    findSlot(id) {
        for (let i = 0; i < this._capacity; i += 1) {
            if (this._slots[i] && this._slots[i].id === id) return i;
        }
        return -1;
    }

    /**
     * Total quantity of an item id across all stacks.
     * @param {string} id Item id.
     * @returns {number}
     */
    countItem(id) {
        let total = 0;
        for (let i = 0; i < this._capacity; i += 1) {
            const inst = this._slots[i];
            if (inst && inst.id === id) total += inst.quantity;
        }
        return total;
    }

    /**
     * Whether the bag holds at least `quantity` of an id (crafting/quest gate).
     * @param {string} id Item id.
     * @param {number} [quantity=1] Required count.
     * @returns {boolean}
     */
    hasItem(id, quantity = 1) {
        return this.countItem(id) >= quantity;
    }

    /**
     * Returns the instance currently in an equipment slot (or null).
     * @param {string} slot EQUIP_SLOT value.
     * @returns {?Object}
     */
    getEquipmentSlot(slot) {
        if (!this._isEquipmentSlot(slot)) {
            throw new RangeError(`[InventorySystem] Unknown equipment slot: ${slot}.`);
        }
        return this._equipment[slot];
    }

    /* ══════════════════════════════════════════════════════════════════
       CORE OPERATIONS: ADD / REMOVE / MOVE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Adds items to the bag. Stackables top up existing stacks first, then
     * fill empty slots; uniques each take their own slot. Overflow is
     * reported, not dropped.
     * @param {string|Object} item Item id, or an instance-like object with
     *   an id plus optional seed metadata (quantity/durability/stats).
     * @param {number} [quantity=1] How many to add.
     * @returns {{added:number, remaining:number}} Counts.
     */
    addItem(item, quantity = 1) {
        const count = Math.floor(quantity);
        if (!Number.isFinite(count) || count <= 0) {
            throw new RangeError('[InventorySystem] addItem quantity must be a positive integer.');
        }
        const id = typeof item === 'string' ? item : (item && typeof item === 'object' ? item.id : null);
        if (!id) throw new TypeError('[InventorySystem] addItem requires an id or item object.');
        const def = this._registry.get(id);
        if (!def) throw new RangeError(`[InventorySystem] Unknown item id: ${id}.`);

        const source = typeof item === 'object' ? item : null;
        const added = def.stackable
            ? this._addStackable(def, count)
            : this._addUnique(def, source, count);

        if (added > 0) {
            this._dispatch('itemadded', { id, quantity: added });
            this._notifyChanged();
        }
        return { added, remaining: count - added };
    }

    /**
     * Stackable add: merge into existing stacks with headroom, then spill
     * into empty slots.
     * @param {Object} def ItemDef.
     * @param {number} quantity Requested count.
     * @returns {number} Count actually added.
     * @private
     */
    _addStackable(def, quantity) {
        let remaining = quantity;
        /* Pass 1 — top up existing stacks of the same id. */
        for (let i = 0; i < this._capacity && remaining > 0; i += 1) {
            const inst = this._slots[i];
            if (inst && inst.id === def.id && inst.quantity < def.maxStack) {
                const room = def.maxStack - inst.quantity;
                const move = Math.min(room, remaining);
                inst.quantity += move;
                remaining -= move;
            }
        }
        /* Pass 2 — spill the remainder into empty slots. */
        while (remaining > 0) {
            const idx = this.firstEmptySlot();
            if (idx === -1) break;
            const move = Math.min(def.maxStack, remaining);
            const inst = this._createInstance(def);
            inst.quantity = move;
            this._slots[idx] = inst;
            remaining -= move;
        }
        return quantity - remaining;
    }

    /**
     * Unique add: one slot per item, never stacked.
     * @param {Object} def ItemDef.
     * @param {?Object} source Seed metadata.
     * @param {number} count Requested count.
     * @returns {number} Count actually added.
     * @private
     */
    _addUnique(def, source, count) {
        let remaining = count;
        while (remaining > 0) {
            const idx = this.firstEmptySlot();
            if (idx === -1) break;
            this._slots[idx] = this._createInstance(def, source);
            remaining -= 1;
        }
        return count - remaining;
    }

    /**
     * Removes quantity from a specific bag slot; clears the slot when the
     * stack is exhausted. Omit quantity to remove the whole stack.
     * @param {number} slotId Bag slot index.
     * @param {number} [quantity=Infinity] Amount to remove.
     * @returns {number} Quantity actually removed.
     */
    removeItem(slotId, quantity = Infinity) {
        this._assertSlot(slotId);
        const inst = this._slots[slotId];
        if (!inst) return 0;
        const amount = quantity === Infinity ? inst.quantity : Math.floor(quantity);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new RangeError('[InventorySystem] removeItem quantity must be positive.');
        }
        const removed = Math.min(amount, inst.quantity);
        inst.quantity -= removed;
        if (inst.quantity <= 0) this._slots[slotId] = null;
        this._dispatch('itemremoved', { id: inst.id, quantity: removed, slot: slotId });
        this._notifyChanged();
        return removed;
    }

    /**
     * Moves or merges or swaps between two bag slots:
     *   empty target       → move
     *   same-id stackable  → merge (respecting maxStack)
     *   anything else      → swap
     * @param {number} fromIndex Source slot.
     * @param {number} toIndex Destination slot.
     * @returns {boolean} True if a change occurred.
     */
    moveItem(fromIndex, toIndex) {
        this._assertSlot(fromIndex);
        this._assertSlot(toIndex);
        if (fromIndex === toIndex) return true;
        const src = this._slots[fromIndex];
        if (!src) return false;
        const dst = this._slots[toIndex];
        const srcDef = this._registry.get(src.id);

        if (dst === null) {
            this._slots[toIndex] = src;
            this._slots[fromIndex] = null;
        } else if (dst.id === src.id && srcDef.stackable && dst.quantity < srcDef.maxStack) {
            const room = srcDef.maxStack - dst.quantity;
            const move = Math.min(room, src.quantity);
            dst.quantity += move;
            src.quantity -= move;
            if (src.quantity <= 0) this._slots[fromIndex] = null;
        } else {
            this._slots[toIndex] = src;
            this._slots[fromIndex] = dst;
        }
        this._dispatch('itemmoved', { from: fromIndex, to: toIndex });
        this._notifyChanged();
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       EQUIPMENT
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Equips the item in a bag slot into its defined equipment slot. The
     * previously equipped item (if any) swaps back into the vacated bag
     * slot, so equipping never requires a spare slot.
     * @param {number} slotId Bag slot holding the equipment.
     * @returns {boolean} True if the item was equipped.
     */
    equipItem(slotId) {
        this._assertSlot(slotId);
        const inst = this._slots[slotId];
        if (!inst) return false;
        const def = this._registry.get(inst.id);
        if (!def || def.type !== ITEM_TYPE.EQUIPMENT || !def.equipSlot) return false;
        const target = def.equipSlot;
        const previous = this._equipment[target];
        this._equipment[target] = inst;
        this._slots[slotId] = previous;   // may be null
        this._dispatch('itemequipped', { id: inst.id, slot: target });
        this._dispatch('equipmentchanged', { stats: this.getStatModifiers() });
        this._notifyChanged();
        return true;
    }

    /**
     * Unequips an item back into the bag. Requires a free bag slot.
     * @param {string} equipSlot EQUIP_SLOT value.
     * @returns {boolean} True if the item was unequipped.
     */
    unequipItem(equipSlot) {
        if (!this._isEquipmentSlot(equipSlot)) {
            throw new RangeError(`[InventorySystem] Unknown equipment slot: ${equipSlot}.`);
        }
        const inst = this._equipment[equipSlot];
        if (!inst) return false;
        const idx = this.firstEmptySlot();
        if (idx === -1) return false;    // no room in the bag
        this._equipment[equipSlot] = null;
        this._slots[idx] = inst;
        this._dispatch('itemunequipped', { id: inst.id, slot: equipSlot });
        this._dispatch('equipmentchanged', { stats: this.getStatModifiers() });
        this._notifyChanged();
        return true;
    }

    /**
     * Whether an instance still functions. Broken equipment (durability 0)
     * contributes no stats until repaired.
     * @param {Object} inst Item instance.
     * @returns {boolean}
     * @private
     */
    _isFunctional(inst) {
        return !(inst.maxDurability > 0 && inst.durability <= 0);
    }

    /**
     * Aggregates the stat modifiers of all equipped, functional items.
     * Computed on demand over four slots — cheap and always consistent.
     * @returns {Object<string,number>} Stat key → total bonus.
     */
    getStatModifiers() {
        const totals = {};
        for (const slot of Object.values(EQUIP_SLOT)) {
            const inst = this._equipment[slot];
            if (!inst) continue;
            const def = this._registry.get(inst.id);
            if (!def || !this._isFunctional(inst)) continue;
            const stats = inst.stats ?? def.stats;
            if (!stats) continue;
            for (const [key, value] of Object.entries(stats)) {
                totals[key] = (totals[key] || 0) + value;
            }
        }
        return totals;
    }

    /**
     * Reads one aggregated stat bonus.
     * @param {string} stat STAT_KEY value.
     * @returns {number} Total bonus, 0 when absent.
     */
    getStatBonus(stat) {
        return this.getStatModifiers()[stat] ?? 0;
    }

    /* ══════════════════════════════════════════════════════════════════
       USAGE & DURABILITY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers a direct handler invoked when a consumable is used, in
     * addition to the 'itemused' event. The handler receives
     * { id, def, instance, effects }.
     * @param {?Function} handler Callback, or null to clear.
     * @returns {this}
     */
    setUseHandler(handler) {
        if (handler !== null && typeof handler !== 'function') {
            throw new TypeError('[InventorySystem] use handler must be a function or null.');
        }
        this._useHandler = handler;
        return this;
    }

    /**
     * Uses the item in a bag slot. Equipment routes to equipItem().
     * Consumables resolve their declarative effects into a payload, invoke
     * the use handler, broadcast 'itemused', and decrement the stack. The
     * Player/WorldManager applies the effect from the event — this system
     * never mutates HP or energy itself.
     * @param {number} slotId Bag slot index.
     * @returns {boolean} True if the item was used/equipped.
     */
    useItem(slotId) {
        this._assertSlot(slotId);
        const inst = this._slots[slotId];
        if (!inst) return false;
        const def = this._registry.get(inst.id);
        if (!def) return false;

        if (def.type === ITEM_TYPE.EQUIPMENT) {
            return this.equipItem(slotId);
        }
        if (def.type === ITEM_TYPE.CONSUMABLE) {
            const effects = def.effects ?? {};
            if (typeof this._useHandler === 'function') {
                try {
                    this._useHandler({ id: def.id, def, instance: inst, effects });
                } catch (error) {
                    console.error(`[InventorySystem] use handler failed for '${def.id}':`, error);
                }
            }
            this._dispatch('itemused', { id: def.id, effects, slot: slotId });
            inst.quantity -= 1;
            if (inst.quantity <= 0) this._slots[slotId] = null;
            this._notifyChanged();
            return true;
        }
        /* Materials and quest items are not directly usable. */
        return false;
    }

    /**
     * Removes quantity of an item id from across all stacks (crafting and
     * quest turn-ins), regardless of which slots hold it.
     * @param {string} id Item id.
     * @param {number} [quantity=1] Amount to consume.
     * @returns {number} Quantity actually consumed.
     */
    consumeById(id, quantity = 1) {
        let remaining = Math.floor(quantity);
        if (!Number.isFinite(remaining) || remaining <= 0) return 0;
        let consumed = 0;
        for (let i = 0; i < this._capacity && remaining > 0; i += 1) {
            const inst = this._slots[i];
            if (inst && inst.id === id) {
                const take = Math.min(inst.quantity, remaining);
                inst.quantity -= take;
                remaining -= take;
                consumed += take;
                if (inst.quantity <= 0) this._slots[i] = null;
            }
        }
        if (consumed > 0) {
            this._dispatch('itemremoved', { id, quantity: consumed });
            this._notifyChanged();
        }
        return consumed;
    }

    /**
     * Reduces an equipped item's durability (weapon swings, taking hits).
     * Broadcasts 'itemdamaged', and 'itembroken' when it reaches zero —
     * at which point the item stops contributing stats.
     * @param {string} equipSlot EQUIP_SLOT value.
     * @param {number} amount Durability to remove (> 0).
     * @returns {boolean} True if durability changed.
     */
    damageEquipment(equipSlot, amount) {
        if (!this._isEquipmentSlot(equipSlot)) {
            throw new RangeError(`[InventorySystem] Unknown equipment slot: ${equipSlot}.`);
        }
        const inst = this._equipment[equipSlot];
        if (!inst || inst.maxDurability <= 0) return false;
        const before = inst.durability;
        inst.durability = Math.max(0, inst.durability - Math.abs(amount));
        if (inst.durability === before) return false;
        this._dispatch('itemdamaged', {
            slot: equipSlot, id: inst.id,
            durability: inst.durability, maxDurability: inst.maxDurability
        });
        if (inst.durability <= 0) {
            this._dispatch('itembroken', { slot: equipSlot, id: inst.id });
            this._dispatch('equipmentchanged', { stats: this.getStatModifiers() });
        }
        return true;
    }

    /**
     * Restores an equipped item's durability up to its maximum.
     * @param {string} equipSlot EQUIP_SLOT value.
     * @param {number} amount Durability to restore (> 0).
     * @returns {boolean} True if durability changed.
     */
    repairEquipment(equipSlot, amount) {
        if (!this._isEquipmentSlot(equipSlot)) {
            throw new RangeError(`[InventorySystem] Unknown equipment slot: ${equipSlot}.`);
        }
        const inst = this._equipment[equipSlot];
        if (!inst || inst.maxDurability <= 0) return false;
        const before = inst.durability;
        inst.durability = Math.min(inst.maxDurability, inst.durability + Math.abs(amount));
        if (inst.durability === before) return false;
        this._dispatch('equipmentchanged', { stats: this.getStatModifiers() });
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       UI INTEGRATION & EXPORT
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds a pre-joined def+instance view for one bag slot, ready for the
     * grid renderer. Empty slots return { index, empty: true }.
     * @param {number} index Bag slot index.
     * @returns {Object} Slot view.
     */
    getSlotView(index) {
        this._assertSlot(index);
        const inst = this._slots[index];
        if (!inst) return { index, empty: true };
        const def = this._registry.get(inst.id);
        return {
            index,
            empty: false,
            id: inst.id,
            name: def.name,
            glyph: def.glyph,
            fg: def.fg,
            color: def.color,
            rarity: def.rarity,
            rarityFg: RARITY_COLORS[def.rarity] ?? RARITY_COLORS[RARITY.COMMON],
            type: def.type,
            stackable: def.stackable,
            maxStack: def.maxStack,
            quantity: inst.quantity,
            durability: inst.durability,
            maxDurability: inst.maxDurability,
            stats: inst.stats ?? def.stats,
            equipSlot: def.equipSlot,
            description: def.description
        };
    }

    /**
     * Builds a view for one equipment slot (same shape as a bag slot view,
     * plus the slot name).
     * @param {string} slot EQUIP_SLOT value.
     * @returns {Object}
     */
    getEquipmentView(slot) {
        if (!this._isEquipmentSlot(slot)) {
            throw new RangeError(`[InventorySystem] Unknown equipment slot: ${slot}.`);
        }
        const inst = this._equipment[slot];
        if (!inst) return { slot, empty: true };
        const def = this._registry.get(inst.id);
        return {
            slot,
            empty: false,
            id: inst.id,
            name: def.name,
            glyph: def.glyph,
            fg: def.fg,
            color: def.color,
            rarity: def.rarity,
            rarityFg: RARITY_COLORS[def.rarity] ?? RARITY_COLORS[RARITY.COMMON],
            type: def.type,
            quantity: inst.quantity,
            durability: inst.durability,
            maxDurability: inst.maxDurability,
            stats: inst.stats ?? def.stats,
            description: def.description
        };
    }

    /**
     * Produces tooltip content for a bag slot: the slot view plus
     * pre-formatted display lines (name, rarity/type, description, stats,
     * durability, quantity). Returns null for an empty slot.
     * @param {number} index Bag slot index.
     * @returns {?{view:Object, lines:Array<{text:string,color:string}>}}
     */
    getTooltip(index) {
        const view = this.getSlotView(index);
        if (view.empty) return null;
        const lines = [];
        lines.push({ text: view.name, color: view.color });
        lines.push({ text: `${view.rarity} ${view.type}`, color: ASCIIBuffer.colorToCSS(view.rarityFg) });
        if (view.description) lines.push({ text: view.description, color: '#c8c8c8' });
        if (view.stats) {
            for (const [key, value] of Object.entries(view.stats)) {
                const sign = value >= 0 ? '+' : '';
                lines.push({ text: `${sign}${value} ${key}`, color: '#7dff8a' });
            }
        }
        if (view.maxDurability > 0) {
            lines.push({ text: `Durability ${view.durability}/${view.maxDurability}`, color: '#e0e0e0' });
        }
        if (view.quantity > 1) {
            lines.push({ text: `Quantity ${view.quantity}`, color: '#e0e0e0' });
        }
        return { view, lines };
    }

    /**
     * Chunks the bag into rows of `columns` slot views, ready for the grid
     * renderer to draw top-to-bottom.
     * @param {number} [columns=6] Slots per row.
     * @returns {Array<Array<Object>>} Rows of slot views.
     */
    getGridRows(columns = 6) {
        if (!Number.isInteger(columns) || columns < 1) {
            throw new RangeError('[InventorySystem] columns must be a positive integer.');
        }
        const rows = [];
        let current = [];
        for (let i = 0; i < this._capacity; i += 1) {
            current.push(this.getSlotView(i));
            if (current.length === columns) {
                rows.push(current);
                current = [];
            }
        }
        if (current.length > 0) rows.push(current);
        return rows;
    }

    /**
     * Full serializable snapshot of bag + equipment + derived stats, for
     * save files, the network authority, or a remote HUD.
     * @returns {Object}
     */
    exportState() {
        const slots = [];
        for (let i = 0; i < this._capacity; i += 1) {
            const inst = this._slots[i];
            slots.push(inst ? { ...inst, stats: inst.stats ? { ...inst.stats } : null } : null);
        }
        const equipment = {};
        for (const slot of Object.values(EQUIP_SLOT)) {
            const inst = this._equipment[slot];
            equipment[slot] = inst ? { ...inst, stats: inst.stats ? { ...inst.stats } : null } : null;
        }
        return {
            capacity: this._capacity,
            usedSlots: this.getUsedSlots(),
            isFull: this.isFull(),
            slots,
            equipment,
            stats: this.getStatModifiers()
        };
    }

    /**
     * Sorts the bag in place: rarer items first, then by name. Stacks are
     * preserved; empty slots are pushed to the end.
     * @returns {this}
     */
    sort() {
        const items = this._slots.filter((inst) => inst !== null);
        items.sort((a, b) => {
            const defA = this._registry.get(a.id);
            const defB = this._registry.get(b.id);
            const rankDiff = (RARITY_RANK[defB.rarity] ?? 0) - (RARITY_RANK[defA.rarity] ?? 0);
            if (rankDiff !== 0) return rankDiff;
            return defA.name.localeCompare(defB.name);
        });
        for (let i = 0; i < this._capacity; i += 1) {
            this._slots[i] = i < items.length ? items[i] : null;
        }
        this._dispatch('inventorysorted', {});
        this._notifyChanged();
        return this;
    }

    /**
     * Empties the bag and all equipment slots.
     * @returns {this}
     */
    clear() {
        for (let i = 0; i < this._capacity; i += 1) this._slots[i] = null;
        for (const slot of Object.values(EQUIP_SLOT)) this._equipment[slot] = null;
        this._dispatch('inventorycleared', {});
        this._notifyChanged();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS & DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /** @private */
    _notifyChanged() {
        this._dispatch('inventorychanged', { usedSlots: this.getUsedSlots(), isFull: this.isFull() });
    }

    /**
     * Subscribes to an inventory event.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {this}
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[InventorySystem] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[InventorySystem] listener must be a function.');
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
     * broken subscriber can never break inventory mutations.
     * @param {string} type Event name.
     * @param {Object} detail Payload.
     * @private
     */
    _dispatch(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[InventorySystem] '${type}' listener failed:`, error);
            }
        }
    }

    /**
     * Diagnostic snapshot for the debug HUD. Allocates; poll at HUD rate.
     * @returns {Object}
     */
    getMetrics() {
        let totalItems = 0;
        let stacks = 0;
        const byType = {};
        for (let i = 0; i < this._capacity; i += 1) {
            const inst = this._slots[i];
            if (inst) {
                const def = this._registry.get(inst.id);
                totalItems += inst.quantity;
                stacks += 1;
                if (def) byType[def.type] = (byType[def.type] || 0) + inst.quantity;
            }
        }
        let equipped = 0;
        for (const slot of Object.values(EQUIP_SLOT)) {
            if (this._equipment[slot]) equipped += 1;
        }
        return {
            capacity: this._capacity,
            usedSlots: this.getUsedSlots(),
            totalItems,
            stacks,
            equipped,
            isFull: this.isFull(),
            registeredItems: this._registry.size,
            byType
        };
    }

    /**
     * Clears listeners and state. Do not reuse after destroy().
     * @returns {void}
     */
    destroy() {
        this._listeners.clear();
        this.clear();
        this._useHandler = null;
    }
}

export default InventorySystem;