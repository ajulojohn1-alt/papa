/**
 * @file src/systems/CombatSystem.js
 * @module systems/CombatSystem
 * @description
 * The combat arbiter for "A Stitch in Time". CombatSystem owns every rule
 * of engagement: who can hit whom, how hard, how often, and what happens
 * on contact. It is a pure authority — it holds no entity classes, draws
 * nothing itself, and mutates nothing it does not own. Instead it computes
 * outcomes and broadcasts structured events that rendering, audio, the
 * HUD, and the quest log all subscribe to.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMBATANT MODEL (COMPONENT SIDE-TABLE)
 * ───────────────────────────────────────────────────────────────────────────
 * Combat stats live in a Map keyed by entity id, NOT on the entities
 * themselves. This keeps Entity/Player/NPC/BossDragon clean and lets the
 * combat rules evolve without touching the class hierarchy. A component:
 *
 *   { id, entity, faction,
 *     maxHp, hp, dead,
 *     baseAttack, weaponMultiplier, armor, temporalResistance,
 *     critChance, critMultiplier,
 *     gcdReadyAt, cooldowns: Map, iframeUntil,
 *     statuses: [] }
 *
 * Entities that already own their HP (BossDragon.takeDamage) are respected:
 * CombatSystem computes the number, then ROUTES the deduction through
 * target.takeDamage() when present and only falls back to component HP
 * otherwise. Players usually register a component or provide takeDamage.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HIT-TESTING ALGORITHMS
 * ───────────────────────────────────────────────────────────────────────────
 * Three spatial queries cover the three attack shapes:
 *
 *   RAYCAST (projectiles). Reuses Entity.segmentIntersectsBox, the exact
 *     slab method. The ray origin/direction form a segment; each hostile
 *     AABB contributes an [entry, exit] interval per axis; the latest entry
 *     and earliest exit yield the nearest hit time t ∈ [0,1] and a contact
 *     normal. O(combatants), no sqrt, no allocation in the loop.
 *
 *   RADIAL (AoE). Circle-vs-AABB: clamp the circle center to the box, then
 *     compare squared distance to r². Returns every intersecting combatant
 *     sorted by distance so the closest are processed first.
 *
 *   MELEE (swings). The swing is a radius around the attacker tested
 *     against each target's AABB (circle-vs-AABB), then gated by an arc:
 *     the bearing to the target's center must lie within ±arc/2 of the
 *     attacker's facing angle. This is bounding-box intersection plus a
 *     directional cone, which is what a swing actually is.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DAMAGE & MITIGATION FORMULA
 * ───────────────────────────────────────────────────────────────────────────
 * Every hit resolves through one pipeline, each stage documented:
 *
 *   raw        = baseAttack × weaponMultiplier × abilityMultiplier
 *   crit?      if roll() < critChance:  raw ×= critMultiplier
 *   armor      if physical:             raw ×= (1 − clamp(armor, 0, cap))
 *   temporal   if temporal:             raw ×= (1 − temporalResistance)
 *   vulnerable if VULNERABLE status:    raw ×= (1 + magnitude)
 *   final      = max(1, round(raw))            // always chip at least 1
 *
 * Armor is stored as a mitigation fraction (0.3 = 30%) and capped so heavy
 * stacking can never reach 100%. Crit rolls use a seeded PRNG so tests and
 * server parity can pin outcomes. Dimension-specific modifiers (BossDragon
 * reducing damage while phase-shifted) are applied inside takeDamage, where
 * they belong.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TIMING MODEL: COOLDOWNS, GCD, I-FRAMES (ABSOLUTE TIME)
 * ───────────────────────────────────────────────────────────────────────────
 * CombatSystem advances a single clock in update(dt). All timers are stored
 * as ABSOLUTE ready-times (this._time + duration), never decremented
 * counters, so a stall or a variable tick rate can never desync them:
 *
 *   GCD        gcdReadyAt      — one global lock shared by all abilities
 *   per-ability cooldowns      — cooldowns.get(id) → readyAt
 *   i-frames   iframeUntil     — granted on taking damage; further hits
 *                                 are evaded until it elapses
 *
 * Player dodge i-frames (entity.isInvulnerable) are honored on top of the
 * component i-frames, so a well-timed dodge beats the combat system too.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STATUS EFFECTS
 * ───────────────────────────────────────────────────────────────────────────
 *   SLOW          reduces getSpeedMultiplier / attack speed by magnitude
 *   STUN          canAct() returns false; blocks ability use
 *   ENERGY_DRAIN  emits 'energydrain' { entity, amount } each tick for the
 *                 WorldManager/Player to deduct from the orange reserve
 *   DOT           damage-per-tick on a fixed interval, bypassing i-frames
 *   VULNERABLE    amplifies damage taken (inverse mitigation)
 *
 * Applying an existing status refreshes its duration and takes the larger
 * magnitude (no unbounded stacking). Expiry dispatches 'statusexpired'.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FEEDBACK & EVENT CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * CombatSystem never renders or plays audio. It broadcasts:
 *   'damagenumber'   {x, y, value, isCrit, element, color}   → floating text
 *   'screenshake'    {intensity, duration, frequency}        → camera.shake
 *   'combatlog'      structured kill/hit line                → log panel
 *   'damage','evaded','death','statusapplied','statusexpired',
 *   'energydrain','abilityused','projectilefired'
 * The WorldManager wires these to the Renderer, the procedural audio synth,
 * and the HUD.
 *
 * @example
 * const combat = new CombatSystem({ seed: 1337 });
 * combat.registerCombatant(player, { faction: 'player', maxHp: 120, baseAttack: 14 });
 * combat.registerCombatant(boss,   { faction: 'enemy',  maxHp: 6000, baseAttack: 22 });
 *
 * combat.addEventListener('damagenumber', (d) => floatingText.spawn(d));
 * combat.addEventListener('screenshake',  (d) => camera.shake(d.duration, d.intensity, d.frequency));
 * combat.addEventListener('combatlog',    (d) => log.push(d));
 * combat.addEventListener('energydrain',  (d) => player.drainEnergy(d.amount));
 *
 * // Per fixed tick:
 * combat.update(dt);
 *
 * // Player pressed attack, aiming at the cursor's world position:
 * const result = combat.useAbility(player, 'melee', { aim: cursorWorld });
 *
 * // Boss fires a temporal bolt at the player:
 * combat.useAbility(boss, 'temporal_bolt', { aim: { x: player.x, y: player.y } });
 */

import { Entity } from '../entities/Entity.js';
import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Damage elements. Armor mitigates physical; resistance mitigates temporal. */
export const DAMAGE_ELEMENT = Object.freeze({
    PHYSICAL: 'physical',
    TEMPORAL: 'temporal'
});

/** Status effect categories. */
export const STATUS_TYPE = Object.freeze({
    SLOW: 'slow',
    STUN: 'stun',
    ENERGY_DRAIN: 'energy_drain',
    DOT: 'dot',
    VULNERABLE: 'vulnerable'
});

/** How an ability finds its targets. */
export const HIT_MODE = Object.freeze({
    MELEE: 'melee',
    RAY: 'ray',
    RADIUS: 'radius'
});

/** Factions drive friendly-fire resolution. */
export const FACTION = Object.freeze({
    PLAYER: 'player',
    ENEMY: 'enemy',
    NEUTRAL: 'neutral'
});

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_GCD = 0.6;
const DEFAULT_IFRAME_DURATION = 0.4;
const ARMOR_CAP = 0.85;
const DEFAULT_BASE_ATTACK = 10;
const DEFAULT_CRIT_CHANCE = 0.05;
const DEFAULT_CRIT_MULTIPLIER = 2.0;
const DEFAULT_MAX_HP = 100;
const HEAVY_HIT_THRESHOLD = 60;
const DOT_TICK_INTERVAL = 0.5;
const DOT_TICK_CAP = 8;
const MIN_SPEED_MULTIPLIER = 0.1;

/* Floating damage number palette (packed once at module load). */
const COLOR_NORMAL = ASCIIBuffer.packColor('#e0e0e0');
const COLOR_CRIT = ASCIIBuffer.packColor('#ffd24a');
const COLOR_TEMPORAL = ASCIIBuffer.packColor('#7fe3ff');
const COLOR_DOT = ASCIIBuffer.packColor('#c9a86a');

/* Module-level scratch objects; reused, never retained across calls. */
/** @type {{x:number,y:number,width:number,height:number}} */
const _scratchBox = { x: 0, y: 0, width: 0, height: 0 };
/** @type {{time:number,normalX:number,normalY:number}} */
const _scratchContact = { time: 0, normalX: 0, normalY: 0 };

/* ══════════════════════════════════════════════════════════════════════════
   MATH HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clamps a value into an inclusive range.
 * @param {number} v Input.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number}
 */
function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

/**
 * Normalizes an angle into [-π, π) with a double-modulo that is correct
 * for negative inputs (a single JS % preserves sign).
 * @param {number} angle Radians.
 * @returns {number}
 */
function normalizeAngle(angle) {
    return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/**
 * mulberry32: tiny seedable PRNG. Used for crit rolls so tests and server
 * parity can reproduce outcomes exactly.
 * @param {number} seed Unsigned 32-bit seed.
 * @returns {() => number} Uniform float in [0, 1).
 */
function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Validates a finite number or throws a prefixed RangeError.
 * @param {number} value Candidate.
 * @param {string} label Field name for diagnostics.
 * @returns {number}
 */
function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new RangeError(`[CombatSystem] ${label} must be a finite number.`);
    }
    return value;
}

/* ══════════════════════════════════════════════════════════════════════════
   DEFAULT ABILITIES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The stock ability set. gcd and cooldown are absolute seconds; multiplier
 * scales baseAttack; statusOnHit applies a status to every damaged target.
 * @type {Object<string, Object>}
 */
const DEFAULT_ABILITIES = Object.freeze({
    melee: Object.freeze({
        id: 'melee', name: 'Thread Slash', hitMode: HIT_MODE.MELEE,
        range: 52, arcDeg: 110, gcd: 0.5, cooldown: 0.6,
        multiplier: 1.0, element: DAMAGE_ELEMENT.PHYSICAL, statusOnHit: null
    }),
    shoot: Object.freeze({
        id: 'shoot', name: 'Needle Bolt', hitMode: HIT_MODE.RAY,
        range: 340, gcd: 0.5, cooldown: 0.35,
        multiplier: 0.8, element: DAMAGE_ELEMENT.PHYSICAL, statusOnHit: null
    }),
    nova: Object.freeze({
        id: 'nova', name: 'Unraveling Nova', hitMode: HIT_MODE.RADIUS,
        radius: 130, gcd: 1.2, cooldown: 6.0,
        multiplier: 1.4, element: DAMAGE_ELEMENT.TEMPORAL,
        statusOnHit: Object.freeze({ type: STATUS_TYPE.SLOW, duration: 2.0, magnitude: 0.35 })
    }),
    temporal_bolt: Object.freeze({
        id: 'temporal_bolt', name: 'Temporal Bolt', hitMode: HIT_MODE.RAY,
        range: 300, gcd: 0.9, cooldown: 2.5,
        multiplier: 1.2, element: DAMAGE_ELEMENT.TEMPORAL,
        statusOnHit: Object.freeze({ type: STATUS_TYPE.SLOW, duration: 1.5, magnitude: 0.3 })
    })
});

/* ══════════════════════════════════════════════════════════════════════════
   COMBAT SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Computes and arbitrates all real-time combat: hit detection, damage
 * formulas, cooldowns, i-frames, status effects, and feedback events.
 */
export class CombatSystem {
    /**
     * @param {Object} [options]
     * @param {number} [options.gcd=0.6] Default global cooldown, seconds.
     * @param {number} [options.iframeDuration=0.4] I-frames granted on hit.
     * @param {number} [options.armorCap=0.85] Max mitigation fraction.
     * @param {number} [options.heavyHitThreshold=60] Damage that shakes.
     * @param {number} [options.seed] PRNG seed for crit rolls.
     * @param {Object<string,Object>} [options.abilities] Extra/custom abilities.
     * @throws {TypeError|RangeError} If options are malformed.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[CombatSystem] options must be an object.');
        }

        /** @type {number} Simulation clock, seconds. */
        this._time = 0;
        /** @type {number} */
        this._gcd = requireFinite(options.gcd ?? DEFAULT_GCD, 'gcd');
        /** @type {number} */
        this._iframeDuration = requireFinite(options.iframeDuration ?? DEFAULT_IFRAME_DURATION, 'iframeDuration');
        /** @type {number} */
        this._armorCap = clamp(requireFinite(options.armorCap ?? ARMOR_CAP, 'armorCap'), 0, 1);
        /** @type {number} */
        this._heavyHitThreshold = requireFinite(options.heavyHitThreshold ?? HEAVY_HIT_THRESHOLD, 'heavyHitThreshold');

        const seed = Number.isInteger(options.seed)
            ? options.seed
            : ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
        /** @type {() => number} */
        this._rng = mulberry32(seed);
        /** @type {number} */
        this._seed = seed;

        /** @type {Map<number, Object>} id → combat component. */
        this._combatants = new Map();
        /** @type {Map<string, Object>} abilityId → ability def. */
        this._abilities = new Map();
        for (const def of Object.values(DEFAULT_ABILITIES)) {
            this.defineAbility(def);
        }
        if (options.abilities && typeof options.abilities === 'object') {
            for (const def of Object.values(options.abilities)) {
                this.defineAbility(def);
            }
        }

        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /** @type {Object} Lifetime diagnostics. */
        this._metrics = {
            damageDealt: 0,
            hits: 0,
            crits: 0,
            evades: 0,
            deaths: 0,
            abilitiesUsed: 0
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       REGISTRATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers an entity as a combatant, building its component from the
     * supplied stats merged over defaults. Idempotent: re-registering an
     * already-registered entity refreshes its stats in place.
     * @param {Object} entity Any entity with id, x, y.
     * @param {Object} [stats] Combat stats (see header component shape).
     * @returns {Object} The combat component.
     */
    registerCombatant(entity, stats = {}) {
        if (!entity || !Number.isFinite(entity.id)) {
            throw new TypeError('[CombatSystem] entity must expose a numeric id.');
        }
        const existing = this._combatants.get(entity.id);
        if (existing) {
            this._applyStats(existing, stats);
            existing.entity = entity;
            return existing;
        }

        /** @type {Object} */
        const comp = {
            id: entity.id,
            entity,
            faction: stats.faction ?? FACTION.NEUTRAL,
            maxHp: DEFAULT_MAX_HP,
            hp: DEFAULT_MAX_HP,
            dead: false,
            baseAttack: DEFAULT_BASE_ATTACK,
            weaponMultiplier: 1,
            armor: 0,
            temporalResistance: 0,
            critChance: DEFAULT_CRIT_CHANCE,
            critMultiplier: DEFAULT_CRIT_MULTIPLIER,
            gcdReadyAt: 0,
            cooldowns: new Map(),
            iframeUntil: 0,
            statuses: []
        };
        this._applyStats(comp, stats);
        comp.hp = Math.min(comp.hp, comp.maxHp);
        this._combatants.set(entity.id, comp);

        /* Auto-unregister when the entity is destroyed. */
        if (typeof entity.addEventListener === 'function') {
            const onDestroy = () => this.unregister(entity.id);
            comp._onDestroy = onDestroy;
            entity.addEventListener('destroy', onDestroy);
        }

        this._dispatch('combatantregistered', { id: entity.id, faction: comp.faction });
        return comp;
    }

    /**
     * Writes validated stats onto a component, clamping probabilities.
     * @param {Object} comp Combat component.
     * @param {Object} stats Author stats.
     * @returns {void}
     * @private
     */
    _applyStats(comp, stats) {
        if (stats.maxHp !== undefined) comp.maxHp = Math.max(1, requireFinite(stats.maxHp, 'maxHp'));
        if (stats.hp !== undefined) comp.hp = clamp(requireFinite(stats.hp, 'hp'), 0, comp.maxHp);
        if (stats.faction !== undefined) comp.faction = stats.faction;
        if (stats.baseAttack !== undefined) comp.baseAttack = Math.max(0, requireFinite(stats.baseAttack, 'baseAttack'));
        if (stats.weaponMultiplier !== undefined) comp.weaponMultiplier = Math.max(0, requireFinite(stats.weaponMultiplier, 'weaponMultiplier'));
        if (stats.armor !== undefined) comp.armor = clamp(requireFinite(stats.armor, 'armor'), 0, 1);
        if (stats.temporalResistance !== undefined) comp.temporalResistance = clamp(requireFinite(stats.temporalResistance, 'temporalResistance'), 0, 1);
        if (stats.critChance !== undefined) comp.critChance = clamp(requireFinite(stats.critChance, 'critChance'), 0, 1);
        if (stats.critMultiplier !== undefined) comp.critMultiplier = Math.max(1, requireFinite(stats.critMultiplier, 'critMultiplier'));
    }

    /**
     * Removes a combatant and detaches its destroy listener.
     * @param {Object|number} entityOrId Entity or entity id.
     * @returns {boolean} True if something was removed.
     */
    unregister(entityOrId) {
        const id = this._resolveId(entityOrId);
        const comp = this._combatants.get(id);
        if (!comp) return false;
        if (comp._onDestroy && comp.entity && typeof comp.entity.removeEventListener === 'function') {
            comp.entity.removeEventListener('destroy', comp._onDestroy);
        }
        this._combatants.delete(id);
        this._dispatch('combatantunregistered', { id });
        return true;
    }

    /**
     * Resolves an entity or id to a component.
     * @param {Object|number} entityOrId Entity or id.
     * @returns {?Object}
     */
    getComponent(entityOrId) {
        return this._combatants.get(this._resolveId(entityOrId)) ?? null;
    }

    /** @param {Object|number} entityOrId @returns {number} @private */
    _resolveId(entityOrId) {
        if (entityOrId && typeof entityOrId === 'object') return entityOrId.id;
        return entityOrId;
    }

    /**
     * Faction hostility: different non-neutral factions are hostile.
     * @param {Object} a First entity.
     * @param {Object} b Second entity.
     * @returns {boolean}
     */
    areHostile(a, b) {
        const ca = this.getComponent(a);
        const cb = this.getComponent(b);
        if (!ca || !cb) return false;
        if (ca.faction === FACTION.NEUTRAL || cb.faction === FACTION.NEUTRAL) return false;
        return ca.faction !== cb.faction;
    }

    /* ══════════════════════════════════════════════════════════════════
       ABILITIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Validates and stores an ability definition (frozen).
     * @param {Object} ability Ability def.
     * @returns {this}
     */
    defineAbility(ability) {
        if (!ability || typeof ability.id !== 'string' || ability.id.length === 0) {
            throw new TypeError('[CombatSystem] ability needs a string id.');
        }
        if (!Object.values(HIT_MODE).includes(ability.hitMode)) {
            throw new RangeError(`[CombatSystem] ability '${ability.id}' has invalid hitMode.`);
        }
        if (ability.hitMode === HIT_MODE.MELEE && !(ability.range > 0)) {
            throw new RangeError(`[CombatSystem] melee ability '${ability.id}' needs range > 0.`);
        }
        if (ability.hitMode === HIT_MODE.RAY && !(ability.range > 0)) {
            throw new RangeError(`[CombatSystem] ray ability '${ability.id}' needs range > 0.`);
        }
        if (ability.hitMode === HIT_MODE.RADIUS && !(ability.radius > 0)) {
            throw new RangeError(`[CombatSystem] radius ability '${ability.id}' needs radius > 0.`);
        }
        this._abilities.set(ability.id, Object.freeze({
            id: ability.id,
            name: ability.name ?? ability.id,
            hitMode: ability.hitMode,
            range: ability.range ?? 0,
            radius: ability.radius ?? 0,
            arcDeg: ability.arcDeg ?? 90,
            gcd: ability.gcd ?? this._gcd,
            cooldown: ability.cooldown ?? 0,
            multiplier: ability.multiplier ?? 1,
            element: ability.element ?? DAMAGE_ELEMENT.PHYSICAL,
            statusOnHit: ability.statusOnHit ?? null
        }));
        return this;
    }

    /**
     * Attempts to use an ability. Enforces incapacitation, the GCD, and
     * the per-ability cooldown, then resolves hits by the ability's hit
     * mode and applies damage to every target struck.
     * @param {Object} entity The acting combatant.
     * @param {string} abilityId Ability to use.
     * @param {Object} [options]
     * @param {{x:number,y:number}} [options.aim] World aim point; falls
     *   back to the entity's facing angle.
     * @returns {{ok:boolean, reason?:string, remaining?:number, hits:Array, hitCount:number}}
     */
    useAbility(entity, abilityId, options = {}) {
        const comp = this.getComponent(entity);
        if (!comp || comp.dead) return { ok: false, reason: 'dead', hits: [], hitCount: 0 };
        const ability = this._abilities.get(abilityId);
        if (!ability) throw new RangeError(`[CombatSystem] Unknown ability: ${abilityId}.`);
        if (!this.canAct(entity)) return { ok: false, reason: 'incapacitated', hits: [], hitCount: 0 };
        if (this._time < comp.gcdReadyAt) {
            return { ok: false, reason: 'gcd', remaining: comp.gcdReadyAt - this._time, hits: [], hitCount: 0 };
        }
        const readyAt = comp.cooldowns.get(abilityId) || 0;
        if (this._time < readyAt) {
            return { ok: false, reason: 'cooldown', remaining: readyAt - this._time, hits: [], hitCount: 0 };
        }

        /* Resolve aim direction: explicit point wins, else facing angle. */
        let dirX, dirY;
        if (options.aim && Number.isFinite(options.aim.x) && Number.isFinite(options.aim.y)) {
            const dx = options.aim.x - entity.x;
            const dy = options.aim.y - entity.y;
            const len = Math.hypot(dx, dy);
            if (len > 1e-6) { dirX = dx / len; dirY = dy / len; }
            else { dirX = Math.cos(entity.angle ?? 0); dirY = Math.sin(entity.angle ?? 0); }
        } else {
            dirX = Math.cos(entity.angle ?? 0);
            dirY = Math.sin(entity.angle ?? 0);
        }

        const filter = this._targetFilter(entity);
        const hits = [];

        if (ability.hitMode === HIT_MODE.MELEE) {
            for (const { entity: target } of this.meleeTargets(entity, ability.range, ability.arcDeg, filter)) {
                const result = this.applyDamage(entity, target, ability);
                if (result.applied) hits.push({ target, result });
            }
        } else if (ability.hitMode === HIT_MODE.RAY) {
            this._dispatch('projectilefired', {
                source: entity, originX: entity.x, originY: entity.y,
                dirX, dirY, range: ability.range, element: ability.element
            });
            const hit = this.raycast(entity.x, entity.y, dirX, dirY, ability.range, filter);
            if (hit) {
                const result = this.applyDamage(entity, hit.entity, ability);
                if (result.applied) hits.push({ target: hit.entity, result });
            }
        } else if (ability.hitMode === HIT_MODE.RADIUS) {
            for (const { entity: target } of this.queryRadius(entity.x, entity.y, ability.radius, filter)) {
                const result = this.applyDamage(entity, target, ability);
                if (result.applied) hits.push({ target, result });
            }
        }

        /* Commit GCD + cooldown only after a successful cast. */
        comp.gcdReadyAt = this._time + ability.gcd;
        if (ability.cooldown > 0) comp.cooldowns.set(abilityId, this._time + ability.cooldown);
        this._metrics.abilitiesUsed += 1;
        this._dispatch('abilityused', { source: entity, abilityId, hitCount: hits.length });
        return { ok: true, hits, hitCount: hits.length };
    }

    /** @param {Object} entity @returns {boolean} */
    isOnGcd(entity) {
        const comp = this.getComponent(entity);
        return comp ? this._time < comp.gcdReadyAt : false;
    }

    /** @param {Object} entity @returns {number} */
    getGcdRemaining(entity) {
        const comp = this.getComponent(entity);
        return comp ? Math.max(0, comp.gcdReadyAt - this._time) : 0;
    }

    /** @param {Object} entity @param {string} abilityId @returns {number} */
    getCooldownRemaining(entity, abilityId) {
        const comp = this.getComponent(entity);
        if (!comp) return 0;
        return Math.max(0, (comp.cooldowns.get(abilityId) || 0) - this._time);
    }

    /**
     * Whether an entity can currently act: alive, active, and not stunned.
     * @param {Object} entity Entity to test.
     * @returns {boolean}
     */
    canAct(entity) {
        const comp = this.getComponent(entity);
        if (comp && comp.dead) return false;
        if (entity.active === false) return false;
        if (this.hasStatus(entity, STATUS_TYPE.STUN)) return false;
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       HIT DETECTION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Predicate factory: live, active, registered hostiles of `attacker`.
     * @param {Object} attacker Source entity.
     * @returns {(entity:Object)=>boolean}
     * @private
     */
    _targetFilter(attacker) {
        return (entity) => {
            if (entity === attacker) return false;
            if (entity.active === false) return false;
            const comp = this.getComponent(entity);
            if (!comp || comp.dead) return false;
            return this.areHostile(attacker, entity);
        };
    }

    /**
     * Raycast against combatant AABBs using the exact slab method.
     * Returns the nearest hit with its time, world point, and normal.
     * @param {number} ox Origin x.
     * @param {number} oy Origin y.
     * @param {number} dx Direction x (need not be normalized).
     * @param {number} dy Direction y.
     * @param {number} maxDist Maximum ray length, px.
     * @param {?Function} [filter] Optional (entity)=>boolean gate.
     * @returns {?{entity:Object,time:number,x:number,y:number,normalX:number,normalY:number}}
     */
    raycast(ox, oy, dx, dy, maxDist, filter = null) {
        const len = Math.hypot(dx, dy);
        if (len < 1e-6 || maxDist <= 0) return null;
        const nx = dx / len;
        const ny = dy / len;
        const ex = ox + nx * maxDist;
        const ey = oy + ny * maxDist;
        let best = null;
        for (const comp of this._combatants.values()) {
            const entity = comp.entity;
            if (comp.dead || entity.active === false) continue;
            if (filter && !filter(entity)) continue;
            const box = entity.getBoundsInto(_scratchBox);
            const hit = Entity.segmentIntersectsBox(ox, oy, ex, ey, box, _scratchContact);
            if (hit && (!best || hit.time < best.time)) {
                best = {
                    entity,
                    time: hit.time,
                    x: ox + nx * maxDist * hit.time,
                    y: oy + ny * maxDist * hit.time,
                    normalX: hit.normalX,
                    normalY: hit.normalY
                };
            }
        }
        return best;
    }

    /**
     * Radial (AoE) query: circle-vs-AABB against every combatant.
     * @param {number} x Circle center x.
     * @param {number} y Circle center y.
     * @param {number} radius Circle radius, px.
     * @param {?Function} [filter] Optional gate.
     * @returns {Array<{entity:Object,distance:number}>} Sorted by distance.
     */
    queryRadius(x, y, radius, filter = null) {
        const results = [];
        const r2 = radius * radius;
        for (const comp of this._combatants.values()) {
            const entity = comp.entity;
            if (comp.dead || entity.active === false) continue;
            if (filter && !filter(entity)) continue;
            const box = entity.getBoundsInto(_scratchBox);
            const cx = clamp(x, box.x, box.x + box.width);
            const cy = clamp(y, box.y, box.y + box.height);
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r2) results.push({ entity, distance: Math.sqrt(d2) });
        }
        results.sort((a, b) => a.distance - b.distance);
        return results;
    }

    /**
     * Axis-aligned box query for trigger volumes and telegraphs.
     * @param {{x:number,y:number,width:number,height:number}} box Query AABB.
     * @param {?Function} [filter] Optional gate.
     * @returns {Array<Object>} Intersecting entities.
     */
    queryBox(box, filter = null) {
        const results = [];
        for (const comp of this._combatants.values()) {
            const entity = comp.entity;
            if (comp.dead || entity.active === false) continue;
            if (filter && !filter(entity)) continue;
            const b = entity.getBoundsInto(_scratchBox);
            if (b.x < box.x + box.width && b.x + b.width > box.x &&
                b.y < box.y + box.height && b.y + b.height > box.y) {
                results.push(entity);
            }
        }
        return results;
    }

    /**
     * Melee swing query: circle-vs-AABB reach check plus a facing arc gate.
     * @param {Object} attacker The swinging entity.
     * @param {number} range Swing radius, px.
     * @param {number} arcDeg Swing cone width, degrees.
     * @param {?Function} [filter] Optional gate.
     * @returns {Array<{entity:Object,distance:number}>} Sorted by distance.
     */
    meleeTargets(attacker, range, arcDeg, filter = null) {
        const results = [];
        const facing = attacker.angle ?? 0;
        const halfArc = (arcDeg * Math.PI / 180) / 2;
        for (const comp of this._combatants.values()) {
            const entity = comp.entity;
            if (comp.dead || entity.active === false) continue;
            if (filter && !filter(entity)) continue;
            const box = entity.getBoundsInto(_scratchBox);
            /* Reach: attacker center vs target AABB (bounding-box hit). */
            const cx = clamp(attacker.x, box.x, box.x + box.width);
            const cy = clamp(attacker.y, box.y, box.y + box.height);
            const dx = attacker.x - cx;
            const dy = attacker.y - cy;
            if (dx * dx + dy * dy > range * range) continue;
            /* Arc: bearing to target center must sit inside the cone. */
            const tcx = box.x + box.width / 2;
            const tcy = box.y + box.height / 2;
            const bearing = Math.atan2(tcy - attacker.y, tcx - attacker.x);
            if (Math.abs(normalizeAngle(bearing - facing)) <= halfArc) {
                results.push({ entity, distance: Math.hypot(tcx - attacker.x, tcy - attacker.y) });
            }
        }
        results.sort((a, b) => a.distance - b.distance);
        return results;
    }

    /* ══════════════════════════════════════════════════════════════════
       DAMAGE COMPUTATION & APPLICATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Computes a full damage breakdown WITHOUT applying it. See the header
     * formula for the stage-by-stage derivation.
     * @param {Object} attacker Source entity.
     * @param {Object} target Target entity.
     * @param {Object} [attack] { multiplier, element }.
     * @returns {{raw:number,final:number,isCrit:boolean,element:string}}
     */
    computeDamage(attacker, target, attack = {}) {
        const a = this.getComponent(attacker);
        const t = this.getComponent(target);
        const element = attack.element ?? DAMAGE_ELEMENT.PHYSICAL;
        const baseAttack = a ? a.baseAttack : DEFAULT_BASE_ATTACK;
        const weaponMult = a ? a.weaponMultiplier : 1;

        let raw = baseAttack * weaponMult * (attack.multiplier ?? 1);

        /* Critical strike. */
        const critChance = a ? clamp(a.critChance, 0, 1) : 0;
        const isCrit = this._rng() < critChance;
        if (isCrit) raw *= (a ? a.critMultiplier : DEFAULT_CRIT_MULTIPLIER);

        /* Armor mitigation (physical only), capped. */
        if (element === DAMAGE_ELEMENT.PHYSICAL && t) {
            raw *= (1 - clamp(t.armor, 0, this._armorCap));
        }

        /* Temporal resistance (temporal only). */
        if (element === DAMAGE_ELEMENT.TEMPORAL && t) {
            raw *= (1 - clamp(t.temporalResistance, 0, 1));
        }

        /* Vulnerable status amplifies damage taken. */
        if (t && this.hasStatus(target, STATUS_TYPE.VULNERABLE)) {
            const vuln = this.getStatus(target, STATUS_TYPE.VULNERABLE);
            raw *= (1 + clamp(vuln.magnitude, 0, 5));
        }

        const final = Math.max(1, Math.round(raw));
        return { raw, final, isCrit, element };
    }

    /**
     * Applies a computed hit to a target: routes HP loss, grants i-frames,
     * applies on-hit statuses, and emits all feedback events. Returns the
     * breakdown with an `applied` flag (false on evade or a no-op target).
     * @param {Object} attacker Source entity.
     * @param {Object} target Target entity.
     * @param {Object} [attack] Ability or { multiplier, element, statusOnHit }.
     * @returns {Object} Breakdown plus applied/evaded flags.
     */
    applyDamage(attacker, target, attack = {}) {
        if (this.isInvulnerable(target)) {
            this._metrics.evades += 1;
            this._dispatch('evaded', { attacker, target });
            return { final: 0, evaded: true, applied: false };
        }

        const breakdown = this.computeDamage(attacker, target, attack);
        const applied = this._reduceHp(target, breakdown.final, attacker);
        if (!applied) return { ...breakdown, applied: false };

        this._grantIframe(target);
        if (typeof target.flash === 'function') {
            target.flash(0.12, breakdown.isCrit ? '#ffffff' : '#ff8a8a');
        }
        if (attack.statusOnHit) {
            this.applyStatus(
                target, attack.statusOnHit.type,
                attack.statusOnHit.duration, attack.statusOnHit.magnitude, attacker
            );
        }

        /* Bookkeeping. */
        this._metrics.damageDealt += breakdown.final;
        this._metrics.hits += 1;
        if (breakdown.isCrit) this._metrics.crits += 1;

        /* Feedback: floating number, damage event, log, screen shake. */
        const color = breakdown.element === DAMAGE_ELEMENT.TEMPORAL
            ? COLOR_TEMPORAL
            : breakdown.isCrit ? COLOR_CRIT : COLOR_NORMAL;
        this._dispatch('damagenumber', {
            x: target.x, y: target.y, value: breakdown.final,
            isCrit: breakdown.isCrit, element: breakdown.element, color
        });
        this._dispatch('damage', {
            attacker, target, ...breakdown, abilityId: attack.id ?? null
        });
        this._dispatch('combatlog', {
            time: this._time,
            attackerName: attacker.name ?? `#${attacker.id}`,
            targetName: target.name ?? `#${target.id}`,
            abilityId: attack.id ?? null,
            final: breakdown.final, isCrit: breakdown.isCrit, element: breakdown.element
        });
        if (breakdown.isCrit || breakdown.final >= this._heavyHitThreshold) {
            const intensity = clamp((breakdown.final / this._heavyHitThreshold) * 6, 4, 18);
            this._dispatch('screenshake', { intensity, duration: 0.3, frequency: 24 });
        }
        return { ...breakdown, applied: true };
    }

    /**
     * Routes an HP deduction. Prefers target.takeDamage() (BossDragon owns
     * its own HP/phases), else reduces the component. Dispatches 'death'
     * once for component-managed deaths.
     * @param {Object} target Target entity.
     * @param {number} amount Damage to apply.
     * @param {Object} [source] Damage source.
     * @returns {boolean} True if damage was actually applied.
     * @private
     */
    _reduceHp(target, amount, source = null) {
        if (typeof target.takeDamage === 'function') {
            return target.takeDamage(amount, source) !== false;
        }
        const comp = this.getComponent(target);
        if (!comp || comp.dead) return false;
        comp.hp = Math.max(0, comp.hp - amount);
        if (comp.hp <= 0) {
            comp.dead = true;
            this._metrics.deaths += 1;
            this._dispatch('death', { entity: target, killer: source });
        }
        return true;
    }

    /**
     * Grants post-hit invulnerability frames to a component-managed target.
     * @param {Object} target Target entity.
     * @returns {void}
     * @private
     */
    _grantIframe(target) {
        const comp = this.getComponent(target);
        if (comp) comp.iframeUntil = this._time + this._iframeDuration;
    }

    /**
     * Invulnerability check: honors the entity's own dodge i-frames
     * (Player.isInvulnerable) on top of component post-hit i-frames.
     * @param {Object} entity Entity to test.
     * @returns {boolean}
     */
    isInvulnerable(entity) {
        if (entity.isInvulnerable === true) return true;
        if (typeof entity.isInvulnerable === 'function' && entity.isInvulnerable()) return true;
        const comp = this.getComponent(entity);
        if (comp && this._time < comp.iframeUntil) return true;
        return false;
    }

    /* ══════════════════════════════════════════════════════════════════
       STATUS EFFECTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Applies or refreshes a status effect. Re-applying the same type
     * refreshes duration and keeps the larger magnitude (no stacking).
     * @param {Object} entity Target entity.
     * @param {string} type STATUS_TYPE value.
     * @param {number} duration Seconds.
     * @param {number} [magnitude=0] Effect strength.
     * @param {Object} [source=null] Applying entity.
     * @returns {?Object} The status, or null if the entity is unregistered.
     */
    applyStatus(entity, type, duration, magnitude = 0, source = null) {
        if (!Object.values(STATUS_TYPE).includes(type)) {
            throw new RangeError(`[CombatSystem] Unknown status type: ${type}.`);
        }
        const comp = this.getComponent(entity);
        if (!comp) return null;
        const existing = comp.statuses.find((s) => s.type === type);
        if (existing) {
            existing.remaining = Math.max(existing.remaining, duration);
            existing.magnitude = Math.max(existing.magnitude, magnitude);
            existing.source = source ?? existing.source;
            this._dispatch('statusapplied', { entity, type, refreshed: true });
            return existing;
        }
        const status = {
            type, duration, remaining: duration,
            magnitude, source, tick: 0
        };
        comp.statuses.push(status);
        this._dispatch('statusapplied', { entity, type, refreshed: false });
        return status;
    }

    /** @param {Object} entity @param {string} type @returns {boolean} */
    hasStatus(entity, type) {
        const comp = this.getComponent(entity);
        return comp ? comp.statuses.some((s) => s.type === type) : false;
    }

    /** @param {Object} entity @param {string} type @returns {?Object} */
    getStatus(entity, type) {
        const comp = this.getComponent(entity);
        return comp ? comp.statuses.find((s) => s.type === type) ?? null : null;
    }

    /**
     * Removes a status early.
     * @param {Object} entity Target entity.
     * @param {string} type STATUS_TYPE value.
     * @returns {boolean} True if a status was removed.
     */
    removeStatus(entity, type) {
        const comp = this.getComponent(entity);
        if (!comp) return false;
        const index = comp.statuses.findIndex((s) => s.type === type);
        if (index === -1) return false;
        comp.statuses.splice(index, 1);
        this._dispatch('statusexpired', { entity, type, manual: true });
        return true;
    }

    /**
     * Cumulative movement/attack speed multiplier after SLOW effects.
     * Movement systems multiply this into their velocity each tick.
     * @param {Object} entity Entity to query.
     * @returns {number} Multiplier in [MIN_SPEED_MULTIPLIER, 1].
     */
    getSpeedMultiplier(entity) {
        const comp = this.getComponent(entity);
        if (!comp) return 1;
        let mult = 1;
        for (const status of comp.statuses) {
            if (status.type === STATUS_TYPE.SLOW) {
                mult *= (1 - clamp(status.magnitude, 0, 0.95));
            }
        }
        return Math.max(MIN_SPEED_MULTIPLIER, mult);
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the combat clock and ticks status effects. Cooldowns, the
     * GCD, and i-frames are absolute-time and need no ticking.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;

        for (const comp of this._combatants.values()) {
            if (comp.statuses.length === 0) continue;
            for (let i = comp.statuses.length - 1; i >= 0; i -= 1) {
                const status = comp.statuses[i];
                status.remaining -= dt;

                /* Damage over time on a fixed interval, capped per tick. */
                if (status.type === STATUS_TYPE.DOT) {
                    status.tick += dt;
                    let ticks = 0;
                    while (status.tick >= DOT_TICK_INTERVAL && ticks < DOT_TICK_CAP) {
                        status.tick -= DOT_TICK_INTERVAL;
                        ticks += 1;
                        const dmg = Math.max(1, Math.round(status.magnitude));
                        if (this._reduceHp(comp.entity, dmg, status.source)) {
                            this._dispatch('damagenumber', {
                                x: comp.entity.x, y: comp.entity.y, value: dmg,
                                isCrit: false, element: 'dot', color: COLOR_DOT
                            });
                        }
                    }
                }

                /* Energy drain: hand the deduction to whoever owns energy. */
                if (status.type === STATUS_TYPE.ENERGY_DRAIN) {
                    this._dispatch('energydrain', {
                        entity: comp.entity, amount: status.magnitude * dt, source: status.source
                    });
                }

                if (status.remaining <= 0) {
                    comp.statuses.splice(i, 1);
                    this._dispatch('statusexpired', { entity: comp.entity, type: status.type, manual: false });
                }
            }
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a combat event.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {this}
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[CombatSystem] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[CombatSystem] listener must be a function.');
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
     * broken subscriber can never kill the combat tick.
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
                console.error(`[CombatSystem] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates; poll at HUD rate.
     * @returns {Object}
     */
    getMetrics() {
        return {
            time: this._time,
            combatants: this._combatants.size,
            abilities: this._abilities.size,
            seed: this._seed,
            ...this._metrics
        };
    }

    /**
     * Clears all combatants, statuses, timers, and listeners. The system
     * must not be reused after destroy().
     * @returns {void}
     */
    destroy() {
        for (const id of [...this._combatants.keys()]) {
            this.unregister(id);
        }
        this._listeners.clear();
    }
}

export default CombatSystem;