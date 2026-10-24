/**
 * @file src/entities/BossDragon.js
 * @module entities/BossDragon
 * @description
 * The Temporal / Clockwork Dragon — the endgame bullet-hell boss of
 * "YUCCA". A large multi-cell ASCII dragon whose palette and
 * accent colors shift as it descends through three HP-gated phases, each
 * with its own attack schedule built entirely from trigonometric pattern
 * generators:
 *
 *   PHASE 1 — GROUNDED TEMPORAL BARRAGE. The dragon holds the arena
 *             floor and fires aimed fans, expanding rings, and a slow
 *             two-arm spiral, punctuated by a telegraphed clock-hand beam.
 *   PHASE 2 — AERIAL BULLET-HELL STORM. The dragon takes wing, orbits the
 *             arena, and layers a dense four-arm spiral over rings, fans,
 *             clock hands, and homing DIMENSION RIFT shots that interact
 *             with the active world state.
 *   PHASE 3 — CLOCKWORK UNRAVELING. Enraged: a five-arm spiral, rapid
 *             clock hands, converging laser grids, and frequent rifts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INHERITANCE & LARGE SPRITE
 * ───────────────────────────────────────────────────────────────────────────
 * BossDragon extends Entity. The collision box is sized to the sprite's
 * cell footprint (spriteCols × cellWidth, spriteRows × cellHeight) with a
 * CENTER anchor, so the trigonometric emitters radiate from the visual
 * middle of the beast. Rendering is a full override that rasterizes the
 * sprite row-by-row through Entity._writeCell, picking each cell's color
 * from the ACTIVE PHASE PALETTE. Phase transitions swap palettes, so the
 * same glyph art reads bronze on the ground, storm-blue in the air, and
 * red-hot while unraveling. A compact ASCII HP bar is drawn above the head.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TRIGONOMETRIC BULLET-HELL MATH
 * ───────────────────────────────────────────────────────────────────────────
 * Every pattern is expressed in polar coordinates and converted to world
 * velocity with (cos θ, sin θ). Angles are radians; +y is down, so a
 * positive θ sweeps visually clockwise.
 *
 * SPIRAL. A arms, angular advance Δθ = rotSpeed · interval per emission:
 *     θ(a, n) = θ₀ + a·(2π/A) + n·Δθ
 *     velocity = speed · (cos θ, sin θ)
 *   Each emission rotates every arm by Δθ, so successive shots trace an
 *   Archimedean spiral. Larger rotSpeed → tighter, faster winding.
 *
 * EXPANDING RING. M shots on one emission, plus a per-ring precession:
 *     θᵢ = θ₀ + i·(2π/M) + precession · ringIndex
 *   All M share one speed, so they expand as a circle; precession rotates
 *   each successive ring so gaps never line up into a safe lane.
 *
 * AIMED FAN. Base bearing β = atan2(player.y - y, player.x - x); C shots
 *   spread across ±spread/2 around β. Leads the player's current position.
 *
 * CLOCK-HAND BEAM (sweeping laser). A BEAM anchored at the boss center
 *   rotates:  φ(t) = φ₀ + ω·t.  The minute hand uses a large |ω|, the hour
 *   hand a small |ω| in the opposite direction — two sweeping spokes.
 *   Beams telegraph for the first TELEGRAPH_FRACTION of their life (dim,
 *   no damage), then become lethal.
 *
 * CONVERGING LASER GRID. K beams anchored on the arena perimeter, each
 *   aimed at the player via β = atan2(player - anchor), so they converge on
 *   the player's position at fire time.
 *
 * DIMENSION RIFT. Slow homing shots: each tick the shot's velocity angle is
 *   rotated toward the player by at most HOMING_TURN·dt (shortest arc),
 *   preserving speed. Tagged with the boss's current world; on contact they
 *   broadcast 'dimensionshift' when the player is in the other world.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BULLET POOL OPTIMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 * Projectiles live in fixed-capacity STRUCTURE-OF-ARRAYS typed arrays —
 * no per-bullet objects, zero allocation in the hot loop:
 *
 *   px, py        Float32Array   world position
 *   vx, vy        Float32Array   velocity (px/s)
 *   life, maxLife Float32Array   countdown / telegraph denominator
 *   radius        Float32Array   collision radius (bullets) / half-width (beams)
 *   angle, angVel Float32Array   beam direction & sweep rate (beams)
 *   length        Float32Array   beam length
 *   color         Uint32Array    packed RGBA
 *   kind          Uint8Array     BULLET | BEAM | RIFT
 *   worldFlag     Uint8Array     0 = DREAM, 1 = DRAB (rift shots)
 *
 * Live shots occupy the dense prefix [0, count). Removal is O(1)
 * swap-remove: copy the tail slot over the dead slot, decrement count.
 * The collision/update loop iterates BACKWARD so the swapped-in element
 * (originally at the tail, already processed this frame) is never
 * re-examined. The pool never resizes; when saturated, new spawns are
 * dropped (the capacity is sized well above any real pattern density).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DAMAGE, PHASE TRANSITIONS & DIMENSION COUPLING
 * ───────────────────────────────────────────────────────────────────────────
 * takeDamage(amount) is the single HP entry point (the combat system calls
 * it). During a phase-transition stall the boss is briefly invulnerable.
 * From PHASE 2 onward the dragon PHASE-SHIFTS between worlds on a timer;
 * while its world differs from the player's, incoming damage is reduced to
 * DIMENSION_DAMAGE_REDUCTION — rewarding players who shift dimensions to
 * match the dragon. The boss never touches player HP directly: bullet and
 * beam contact broadcast 'playerhit', and rift contact broadcasts
 * 'dimensionshift'; the WorldManager applies the consequences.
 *
 * @example
 * const boss = new BossDragon({
 *     x: arena.cx, y: arena.cy,
 *     questSystem: quests
 * });
 * boss.attachPlayer(player);
 * boss.setArena(arena.x, arena.y, arena.width, arena.height);
 * boss.addEventListener('playerhit', (d) => playerHP.apply(d.damage));
 * boss.addEventListener('dimensionshift', () => world.toggleDimension());
 * boss.addEventListener('defeated', () => quests.complete('slay_clockwork_dragon'));
 *
 * // Combat system on a successful player attack:
 * boss.takeDamage(weaponDamage);
 *
 * // Per fixed tick:
 * boss.update(dt);
 * // Per presentation frame:
 * boss.render(worldBuffer, camera, loop.getMetrics().interpolationAlpha);
 */

import { Entity, ENTITY_LAYER } from './Entity.js';
import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS & ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Two pi, precomputed for polar pattern math. */
const TWO_PI = Math.PI * 2;

/** Boss phases. @enum {number} */
export const BOSS_PHASE = Object.freeze({
    GROUNDED: 1,
    AERIAL: 2,
    UNRAVELING: 3
});

/** Projectile kinds stored in the pool. @enum {number} */
export const PROJ_KIND = Object.freeze({
    BULLET: 0,
    BEAM: 1,
    RIFT: 2
});

/* ---- HP & phase thresholds ---------------------------------------------- */
const DEFAULT_MAX_HP = 6000;
/** Enter AERIAL when HP falls to/below this fraction. */
const PHASE_2_THRESHOLD = 0.66;
/** Enter UNRAVELING when HP falls to/below this fraction. */
const PHASE_3_THRESHOLD = 0.33;
/** Invulnerability + bullet-wipe window on phase entry, seconds. */
const PHASE_TRANSITION_STALL = 1.6;

/* ---- Pool & collision ---------------------------------------------------- */
const POOL_CAPACITY = 2048;
const PLAYER_HIT_GRACE = 0.12;     // seconds between boss→player damage ticks
const BEAM_HALF_WIDTH = 6;         // px
const BEAM_TELEGRAPH_FRACTION = 0.3;
const CULL_MARGIN_PX = 96;

/* ---- Damage values ------------------------------------------------------- */
const DAMAGE_BULLET = 40;
const DAMAGE_RIFT = 55;
const DAMAGE_BEAM = 70;
/** Incoming damage multiplier while the dragon is phase-shifted away. */
const DIMENSION_DAMAGE_REDUCTION = 0.3;
/** Phase 2/3 world-toggle period, seconds. */
const WORLD_TOGGLE_INTERVAL = 6;

/* ---- Pattern tuning ------------------------------------------------------ */
const HOMING_TURN = 1.5;           // rad/s steering rate for rift shots
const CLOCK_MINUTE_SPEED = 1.6;    // rad/s
const CLOCK_HOUR_SPEED = 0.55;     // rad/s (opposite direction)
const BEAM_LIFE = 3.4;             // seconds
const GRID_BEAM_LIFE = 1.6;        // seconds
const ORBIT_SPEED = 0.5;           // rad/s (phase 2/3 arena orbit)

/* ---- Presentation --------------------------------------------------------- */
const HP_BAR_ROW_OFFSET = 2;       // cells above sprite top
const AERIAL_BOB_HZ = 0.9;
const AERIAL_BOB_CELLS = 1;

/** Beam palette. */
const BEAM_TELEGRAPH_FG = ASCIIBuffer.packColor('#ffd24a');
const BEAM_ACTIVE_FG = ASCIIBuffer.packColor('#ff4d4d');
const HP_BAR_FULL_FG = ASCIIBuffer.packColor('#7dff8a');
const HP_BAR_EMPTY_FG = ASCIIBuffer.packColor('#3a3f47');
const RIFT_FG = ASCIIBuffer.packColor('#ff7700');

/* ══════════════════════════════════════════════════════════════════════════
   SPRITE & PHASE PALETTES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The clockwork dragon glyph art. Spaces are skipped; every other character
 * is colored by the active phase palette. Rows are padded to equal width
 * during normalization.
 * @type {ReadonlyArray<string>}
 */
const DRAGON_SPRITE = Object.freeze([
    "    /\\_____/\\    ",
    "   (  O   O  )   ",
    "    \\ |===| /    ",
    " <==|  ( )  |==> ",
    "    |=======|    ",
    "    |_______|    ",
    "    d       b    "
]);

/**
 * Packs a { char: cssColor } map into { codePoint: packedColor }.
 * @param {Object<string, string>} defs Character → CSS color.
 * @returns {Object<number, number>} Frozen codePoint → packed RGBA.
 */
function packPalette(defs) {
    const pal = {};
    for (const [ch, css] of Object.entries(defs)) {
        pal[ch.codePointAt(0)] = ASCIIBuffer.packColor(css, 0xFFFFFFFF);
    }
    return Object.freeze(pal);
}

/**
 * Per-phase palettes. The same sprite reads bronze when grounded, storm
 * blue in the air, and red-hot while unraveling. '=' is the body plate,
 * 'O' the eyes, '( )' the clockwork core, '< >' the wings.
 * @type {Object<number, Object<number, number>>}
 */
const PHASE_PALETTES = Object.freeze({
    1: packPalette({
        '/': '#8a7a55', '\\': '#8a7a55', '_': '#6e6045', 'O': '#ffd24a',
        '|': '#a89870', '=': '#b3a077', '(': '#8a7a55', ')': '#8a7a55',
        '<': '#c9a86a', '>': '#c9a86a', 'd': '#8a7a55', 'b': '#8a7a55', '-': '#9c8c66'
    }),
    2: packPalette({
        '/': '#2f4a7a', '\\': '#2f4a7a', '_': '#24344f', 'O': '#ff7700',
        '|': '#3b6fd4', '=': '#4a80e0', '(': '#2f4a7a', ')': '#2f4a7a',
        '<': '#7fe3ff', '>': '#7fe3ff', 'd': '#2f4a7a', 'b': '#2f4a7a', '-': '#3a5f9e'
    }),
    3: packPalette({
        '/': '#8a2f2f', '\\': '#8a2f2f', '_': '#5f1f1f', 'O': '#ffffff',
        '|': '#e5484d', '=': '#ff5a5f', '(': '#8a2f2f', ')': '#8a2f2f',
        '<': '#ff7700', '>': '#ff7700', 'd': '#8a2f2f', 'b': '#8a2f2f', '-': '#c23a3f'
    })
});

/* Sprite normalization: pad rows to equal width, precompute dimensions. */
const SPRITE_COLS = DRAGON_SPRITE.reduce((m, r) => Math.max(m, r.length), 0);
const SPRITE_ROWS = DRAGON_SPRITE.length;
const SPRITE_PADDED = Object.freeze(
    DRAGON_SPRITE.map((row) => row.padEnd(SPRITE_COLS, ' '))
);

/* Module-level scratch objects; never retained across frames. */
/** @type {{x: number, y: number}} */
const _renderPoint = { x: 0, y: 0 };
/** @type {{x: number, y: number, width: number, height: number}} */
const _playerBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Normalizes an angle into [-π, π) with a double-modulo that is correct
 * for negative inputs (a single JS % preserves sign).
 * @param {number} angle Radians.
 * @returns {number}
 */
function normalizeAngle(angle) {
    return ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

/* ══════════════════════════════════════════════════════════════════════════
   BOSS DRAGON
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The Temporal / Clockwork Dragon endgame boss. See the file header for
 * the pattern math, pooling layout, and phase/dimension rules.
 */
export class BossDragon extends Entity {
    /**
     * @param {Object} [options] All Entity options are accepted; the
     *   boss-specific additions are listed below.
     * @param {number} [options.maxHp=6000] Total hit points.
     * @param {Object} [options.player] Player reference for aiming/collisions.
     * @param {Object} [options.questSystem] Optional quest bridge for defeat.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[BossDragon] options must be an object.');
        }
        const cellW = options.cellWidth ?? 9.6;
        const cellH = options.cellHeight ?? 20;
        super({
            name: 'Clockwork Dragon',
            char: 'D',                     // fallback glyph; render overrides
            fgColor: '#ff7700',
            zIndex: ENTITY_LAYER.PROJECTILE + 50,
            width: SPRITE_COLS * cellW,
            height: SPRITE_ROWS * cellH,
            maxSpeed: 260,
            friction: 4,
            speed: 120,
            tags: ['boss', 'dragon', 'clockwork'],
            ...options
        });

        /* ---- HP & phase ------------------------------------------------ */
        const maxHp = options.maxHp ?? DEFAULT_MAX_HP;
        if (!Number.isFinite(maxHp) || maxHp <= 0) {
            throw new RangeError('[BossDragon] maxHp must be positive.');
        }
        /** @type {number} */
        this._maxHp = maxHp;
        /** @type {number} */
        this._hp = maxHp;
        /** @type {number} */
        this._phase = BOSS_PHASE.GROUNDED;
        /** @type {boolean} */
        this._defeated = false;
        /** @type {number} Invulnerability window on phase entry. */
        this._stallRemaining = 0;

        /* ---- Dimension coupling ---------------------------------------- */
        /** @type {string} The world the dragon is currently phased into. */
        this._bossWorld = 'DREAM';
        /** @type {number} Countdown to the next automatic phase-shift. */
        this._worldToggleIn = WORLD_TOGGLE_INTERVAL;

        /* ---- References ------------------------------------------------ */
        /** @type {?Object} */
        this._player = options.player ?? null;
        /** @type {?Object} */
        this._questSystem = options.questSystem ?? null;

        /* ---- Arena ------------------------------------------------------ */
        /** @type {{x:number,y:number,width:number,height:number}} */
        this._arena = { x: this.x - 400, y: this.y - 300, width: 800, height: 600 };
        /** @type {number} Arena orbit angle for aerial movement. */
        this._orbitAngle = 0;

        /* ---- Projectile pool (structure-of-arrays) --------------------- */
        /** @type {number} Dense live-projectile prefix length. */
        this._projCount = 0;
        /** @type {Float32Array} */ this._px = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._py = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._vx = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._vy = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._life = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._maxLife = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._radius = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._angle = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._angVel = new Float32Array(POOL_CAPACITY);
        /** @type {Float32Array} */ this._length = new Float32Array(POOL_CAPACITY);
        /** @type {Uint32Array}  */ this._color = new Uint32Array(POOL_CAPACITY);
        /** @type {Uint8Array}   */ this._kind = new Uint8Array(POOL_CAPACITY);
        /** @type {Uint8Array}   */ this._worldFlag = new Uint8Array(POOL_CAPACITY);

        /* ---- Attack scheduling ----------------------------------------- */
        /** @type {Array<Object>} Active phase emitters. */
        this._emitters = [];
        /** @type {number} Packed bullet color for the current phase. */
        this._bulletColor = ASCIIBuffer.packColor('#ffd24a');

        /* ---- Collision grace ------------------------------------------- */
        /** @type {number} Sim time of the last boss→player damage tick. */
        this._lastHitAt = -Infinity;

        /* Arm the opening phase. */
        this._enterPhase(BOSS_PHASE.GROUNDED, { silent: true });
    }

    /* ══════════════════════════════════════════════════════════════════
       WIRING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the player used for aiming, homing, and collisions.
     * @param {?Object} player Player entity, or null to detach.
     * @returns {this}
     */
    attachPlayer(player) {
        if (player !== null &&
            (!Number.isFinite(player.x) || !Number.isFinite(player.y))) {
            throw new TypeError('[BossDragon] player must expose numeric x and y.');
        }
        this._player = player;
        return this;
    }

    /**
     * Defines the arena rectangle used for orbit movement and culling.
     * @param {number} x Left edge, world px.
     * @param {number} y Top edge, world px.
     * @param {number} width Arena width, px.
     * @param {number} height Arena height, px.
     * @returns {this}
     */
    setArena(x, y, width, height) {
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
            throw new RangeError('[BossDragon] arena must be a finite positive rectangle.');
        }
        this._arena = { x, y, width, height };
        return this;
    }

    /**
     * Externally forces the dragon's phase-shifted world (e.g. when the
     * player triggers a manual dimension shift mid-fight).
     * @param {string} world 'DREAM' or 'DRAB'.
     * @returns {this}
     */
    setActiveWorld(world) {
        if (world !== 'DREAM' && world !== 'DRAB') {
            throw new RangeError('[BossDragon] world must be DREAM or DRAB.');
        }
        if (world !== this._bossWorld) {
            this._bossWorld = world;
            this._worldToggleIn = WORLD_TOGGLE_INTERVAL;
            this._dispatch('dimensionphase', { id: this.id, world });
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       STATE ACCESSORS
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {number} Current hit points. */
    get hp() { return this._hp; }
    /** @returns {number} Maximum hit points. */
    get maxHp() { return this._maxHp; }
    /** @returns {number} Current BOSS_PHASE. */
    get phase() { return this._phase; }
    /** @returns {string} World the dragon is phased into. */
    get bossWorld() { return this._bossWorld; }
    /** @returns {boolean} True once HP reaches zero. */
    get isDefeated() { return this._defeated; }
    /** @returns {number} Live projectile count. */
    get activeProjectileCount() { return this._projCount; }
    /** @returns {number} HP fraction in [0, 1]. */
    get hpFraction() { return this._hp / this._maxHp; }

    /* ══════════════════════════════════════════════════════════════════
       DAMAGE & PHASE TRANSITIONS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Applies damage to the boss. The ONLY HP entry point. Ignored while
     * defeated or during a phase-transition stall. From PHASE 2 onward,
     * damage is reduced while the dragon is phased into a different world
     * than the player — the core dimension mechanic of the fight.
     * @param {number} amount Incoming damage (> 0).
     * @param {Object} [source] Optional damage source for listeners.
     * @returns {boolean} True if damage was applied.
     */
    takeDamage(amount, source = null) {
        if (!Number.isFinite(amount) || amount <= 0) return false;
        if (!this.active || this._defeated) return false;
        if (this._stallRemaining > 0) return false;

        let damage = amount;
        if (this._phase >= BOSS_PHASE.AERIAL &&
            this._player && typeof this._player.world === 'string' &&
            this._player.world !== this._bossWorld) {
            damage *= DIMENSION_DAMAGE_REDUCTION;
        }

        this._hp = Math.max(0, this._hp - damage);
        this.flash(0.15, '#ffffff');
        this._dispatch('damaged', {
            id: this.id, damage, hp: this._hp, maxHp: this._maxHp, source
        });

        this._maybeTransitionPhase();
        if (this._hp <= 0) this._die();
        return true;
    }

    /**
     * Steps the phase forward when the HP fraction crosses a threshold.
     * Phases only ever advance, never retreat.
     * @returns {void}
     * @private
     */
    _maybeTransitionPhase() {
        const fraction = this.hpFraction;
        if (this._phase < BOSS_PHASE.UNRAVELING && fraction <= PHASE_3_THRESHOLD) {
            this._enterPhase(BOSS_PHASE.UNRAVELING);
        } else if (this._phase < BOSS_PHASE.AERIAL && fraction <= PHASE_2_THRESHOLD) {
            this._enterPhase(BOSS_PHASE.AERIAL);
        }
    }

    /**
     * Enters a phase: swaps the palette, rebuilds the attack schedule,
     * mercy-wipes all live projectiles, grants a short invulnerability
     * stall, and announces the change.
     * @param {number} phase Target BOSS_PHASE.
     * @param {Object} [opts]
     * @param {boolean} [opts.silent=false] Skip events (constructor).
     * @returns {void}
     * @private
     */
    _enterPhase(phase, opts = {}) {
        this._phase = phase;
        this._emitters = this._emittersForPhase(phase);
        this._projCount = 0;                 // mercy wipe
        this._stallRemaining = PHASE_TRANSITION_STALL;

        /* Phase bullet accent follows the palette mood. */
        this._bulletColor = phase === BOSS_PHASE.GROUNDED
            ? ASCIIBuffer.packColor('#ffd24a')
            : phase === BOSS_PHASE.AERIAL
                ? ASCIIBuffer.packColor('#7fe3ff')
                : ASCIIBuffer.packColor('#ff5a5f');

        if (!opts.silent) {
            this.flash(0.5, '#ffffff');
            this._dispatch('phasechange', { id: this.id, phase, hp: this._hp });
        }
    }

    /**
     * Handles death: stops all attacks, clears the field, and broadcasts
     * the defeat so the WorldManager can run the victory beat and the
     * quest system can complete the slay objective.
     * @returns {void}
     * @private
     */
    _die() {
        if (this._defeated) return;
        this._defeated = true;
        this._emitters = [];
        this._projCount = 0;
        this.stop();
        this.flash(1.2, '#ffffff');
        this._dispatch('defeated', { id: this.id, x: this.x, y: this.y });
    }

    /* ══════════════════════════════════════════════════════════════════
       ATTACK SCHEDULING (EMITTERS)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds the phase's emitter list. Each emitter carries its own timer
     * and pattern parameters; _runEmitters ticks them every frame.
     * @param {number} phase BOSS_PHASE.
     * @returns {Array<Object>} Fresh emitter objects.
     * @private
     */
    _emittersForPhase(phase) {
        switch (phase) {
            case BOSS_PHASE.GROUNDED:
                return [
                    { kind: 'fan', interval: 1.2, timer: 0.6, count: 5, spread: 0.5, speed: 200 },
                    { kind: 'ring', interval: 2.2, timer: 1.1, count: 18, speed: 120, precession: 0.15, angle: 0 },
                    { kind: 'spiral', interval: 0.5, timer: 0.25, arms: 2, rotSpeed: 1.2, speed: 140, angle: 0 },
                    { kind: 'beam', interval: 6, timer: 3, hands: 2 }
                ];
            case BOSS_PHASE.AERIAL:
                return [
                    { kind: 'spiral', interval: 0.09, timer: 0, arms: 4, rotSpeed: 2.2, speed: 170, angle: 0 },
                    { kind: 'ring', interval: 1.4, timer: 0.7, count: 26, speed: 150, precession: 0.2, angle: 0 },
                    { kind: 'fan', interval: 1.0, timer: 0.5, count: 7, spread: 0.7, speed: 240 },
                    { kind: 'beam', interval: 5, timer: 2.5, hands: 2 },
                    { kind: 'rift', interval: 2.5, timer: 1.2, count: 3, speed: 110 }
                ];
            case BOSS_PHASE.UNRAVELING:
            default:
                return [
                    { kind: 'spiral', interval: 0.07, timer: 0, arms: 5, rotSpeed: 3.0, speed: 200, angle: 0 },
                    { kind: 'ring', interval: 1.0, timer: 0.5, count: 30, speed: 180, precession: 0.25, angle: 0 },
                    { kind: 'grid', interval: 4, timer: 2, beams: 4 },
                    { kind: 'beam', interval: 3, timer: 1.5, hands: 2 },
                    { kind: 'rift', interval: 1.8, timer: 0.9, count: 4, speed: 130 }
                ];
        }
    }

    /**
     * Advances every emitter timer and fires any that elapse. Emission is
     * clamped to a few shots per emitter per tick so a stalled frame can
     * not dump an entire pattern at once.
     * @param {number} dt Tick seconds.
     * @returns {void}
     * @private
     */
    _runEmitters(dt) {
        for (let i = 0; i < this._emitters.length; i += 1) {
            const em = this._emitters[i];
            em.timer -= dt;
            let guard = 0;
            while (em.timer <= 0 && guard < 4) {
                this._fireEmitter(em);
                em.timer += em.interval;
                guard += 1;
            }
        }
    }

    /**
     * Dispatches one emitter fire to its pattern generator.
     * @param {Object} em Emitter record.
     * @returns {void}
     * @private
     */
    _fireEmitter(em) {
        switch (em.kind) {
            case 'spiral': this._emitSpiral(em); break;
            case 'ring': this._emitRing(em); break;
            case 'fan': this._emitAimedFan(em); break;
            case 'beam': this._emitClockHands(em); break;
            case 'grid': this._emitConvergingGrid(em); break;
            case 'rift': this._emitRift(em); break;
            default: break;
        }
    }

    /**
     * SPIRAL. Fires one bullet per arm, then advances the arm angle by
     * rotSpeed · interval so successive emissions wind into a spiral.
     * θ(a) = angle + a·(2π/arms).
     * @param {Object} em Spiral emitter.
     * @returns {void}
     * @private
     */
    _emitSpiral(em) {
        const step = TWO_PI / em.arms;
        for (let a = 0; a < em.arms; a += 1) {
            const theta = em.angle + a * step;
            this._spawnBullet(this.x, this.y, theta, em.speed, 6, 5, this._bulletColor, PROJ_KIND.BULLET);
        }
        em.angle = normalizeAngle(em.angle + em.rotSpeed * em.interval);
    }

    /**
     * EXPANDING RING. Fires count bullets uniformly around a circle and
     * precesses the base angle so successive rings never align.
     * θᵢ = angle + i·(2π/count).
     * @param {Object} em Ring emitter.
     * @returns {void}
     * @private
     */
    _emitRing(em) {
        const step = TWO_PI / em.count;
        for (let i = 0; i < em.count; i += 1) {
            const theta = em.angle + i * step;
            this._spawnBullet(this.x, this.y, theta, em.speed, 7, 5, this._bulletColor, PROJ_KIND.BULLET);
        }
        em.angle = normalizeAngle(em.angle + em.precession);
    }

    /**
     * AIMED FAN. Centers a spread of count bullets on the bearing to the
     * player: β = atan2(player - boss). Falls back to the facing angle
     * when no player is attached.
     * @param {Object} em Fan emitter.
     * @returns {void}
     * @private
     */
    _emitAimedFan(em) {
        const bearing = this._player
            ? Math.atan2(this._player.y - this.y, this._player.x - this.x)
            : this.angle;
        const half = em.spread / 2;
        for (let i = 0; i < em.count; i += 1) {
            const t = em.count === 1 ? 0 : i / (em.count - 1);
            const theta = bearing - half + t * em.spread;
            this._spawnBullet(this.x, this.y, theta, em.speed, 5, 5, this._bulletColor, PROJ_KIND.BULLET);
        }
    }

    /**
     * CLOCK-HAND BEAMS. Spawns sweeping laser spokes anchored at the
     * dragon: a fast minute hand and a slow hour hand turning opposite
     * directions, φ(t) = φ₀ + ω·t.
     * @param {Object} em Beam emitter.
     * @returns {void}
     * @private
     */
    _emitClockHands(em) {
        const arenaRadius = Math.min(this._arena.width, this._arena.height) * 0.5;
        const start = this._player
            ? Math.atan2(this._player.y - this.y, this._player.x - this.x)
            : Math.random() * TWO_PI;
        /* Minute hand sweeps one way, hour hand the other. */
        this._spawnBeam(this.x, this.y, start, CLOCK_MINUTE_SPEED, arenaRadius, BEAM_LIFE, BEAM_ACTIVE_FG);
        this._spawnBeam(this.x, this.y, start + Math.PI, -CLOCK_HOUR_SPEED, arenaRadius, BEAM_LIFE, BEAM_ACTIVE_FG);
    }

    /**
     * CONVERGING LASER GRID. Anchors beams on the arena perimeter and
     * aims each at the player, so they converge on the player's position
     * at fire time. Static (angularVel 0) — the danger is the convergence.
     * @param {Object} em Grid emitter.
     * @returns {void}
     * @private
     */
    _emitConvergingGrid(em) {
        const cx = this._arena.x + this._arena.width / 2;
        const cy = this._arena.y + this._arena.height / 2;
        const radius = Math.min(this._arena.width, this._arena.height) * 0.5;
        for (let k = 0; k < em.beams; k += 1) {
            const anchorAngle = (TWO_PI * k) / em.beams;
            const ax = cx + Math.cos(anchorAngle) * radius;
            const ay = cy + Math.sin(anchorAngle) * radius;
            const targetX = this._player ? this._player.x : this.x;
            const targetY = this._player ? this._player.y : this.y;
            const aim = Math.atan2(targetY - ay, targetX - ax);
            const dist = Math.hypot(targetX - ax, targetY - ay) + 40;
            this._spawnBeam(ax, ay, aim, 0, dist, GRID_BEAM_LIFE, BEAM_ACTIVE_FG);
        }
    }

    /**
     * DIMENSION RIFT. Fires slow homing shots tagged with the dragon's
     * current world; contact with a player in the other world triggers a
     * dimension shift.
     * @param {Object} em Rift emitter.
     * @returns {void}
     * @private
     */
    _emitRift(em) {
        const base = this._player
            ? Math.atan2(this._player.y - this.y, this._player.x - this.x)
            : Math.random() * TWO_PI;
        const worldFlag = this._bossWorld === 'DRAB' ? 1 : 0;
        for (let i = 0; i < em.count; i += 1) {
            const theta = base + (i - (em.count - 1) / 2) * 0.3;
            this._spawnBullet(this.x, this.y, theta, em.speed, 9, 7, RIFT_FG, PROJ_KIND.RIFT, worldFlag);
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       PROJECTILE POOL SPAWN / REMOVE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Spawns a moving bullet (or rift) into the pool. Drops the shot when
     * the pool is saturated rather than allocating — capacity is sized
     * above any real pattern density.
     * @param {number} x Spawn x.
     * @param {number} y Spawn y.
     * @param {number} angle Direction, radians.
     * @param {number} speed Magnitude, px/s.
     * @param {number} life Seconds.
     * @param {number} radius Collision radius, px.
     * @param {number} color Packed RGBA.
     * @param {number} kind PROJ_KIND value.
     * @param {number} [worldFlag=0] 0 = DREAM, 1 = DRAB (rift only).
     * @returns {number} Slot index, or -1 if dropped.
     * @private
     */
    _spawnBullet(x, y, angle, speed, life, radius, color, kind, worldFlag = 0) {
        if (this._projCount >= POOL_CAPACITY) return -1;
        const i = this._projCount;
        this._px[i] = x;
        this._py[i] = y;
        this._vx[i] = Math.cos(angle) * speed;
        this._vy[i] = Math.sin(angle) * speed;
        this._life[i] = life;
        this._maxLife[i] = life;
        this._radius[i] = radius;
        this._angle[i] = angle;
        this._angVel[i] = 0;
        this._length[i] = 0;
        this._color[i] = color;
        this._kind[i] = kind;
        this._worldFlag[i] = worldFlag;
        this._projCount += 1;
        return i;
    }

    /**
     * Spawns a sweeping laser beam anchored at (x, y). Reuses the velocity
     * slots as unused; direction lives in _angle / _angVel / _length.
     * @param {number} x Anchor x.
     * @param {number} y Anchor y.
     * @param {number} angle Initial direction, radians.
     * @param {number} angularVel Sweep rate, rad/s.
     * @param {number} length Beam length, px.
     * @param {number} life Seconds.
     * @param {number} color Packed RGBA (active color).
     * @returns {number} Slot index, or -1 if dropped.
     * @private
     */
    _spawnBeam(x, y, angle, angularVel, length, life, color) {
        if (this._projCount >= POOL_CAPACITY) return -1;
        const i = this._projCount;
        this._px[i] = x;
        this._py[i] = y;
        this._vx[i] = 0;
        this._vy[i] = 0;
        this._life[i] = life;
        this._maxLife[i] = life;
        this._radius[i] = BEAM_HALF_WIDTH;
        this._angle[i] = angle;
        this._angVel[i] = angularVel;
        this._length[i] = length;
        this._color[i] = color;
        this._kind[i] = PROJ_KIND.BEAM;
        this._worldFlag[i] = 0;
        this._projCount += 1;
        return i;
    }

    /**
     * O(1) swap-remove: copies the tail slot over slot i and shrinks the
     * dense prefix. Safe under backward iteration.
     * @param {number} i Slot to remove, i < count.
     * @returns {void}
     * @private
     */
    _swapRemoveProjectile(i) {
        const last = this._projCount - 1;
        if (i !== last) {
            this._px[i] = this._px[last];
            this._py[i] = this._py[last];
            this._vx[i] = this._vx[last];
            this._vy[i] = this._vy[last];
            this._life[i] = this._life[last];
            this._maxLife[i] = this._maxLife[last];
            this._radius[i] = this._radius[last];
            this._angle[i] = this._angle[last];
            this._angVel[i] = this._angVel[last];
            this._length[i] = this._length[last];
            this._color[i] = this._color[last];
            this._kind[i] = this._kind[last];
            this._worldFlag[i] = this._worldFlag[last];
        }
        this._projCount = last;
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the boss by one fixed tick: phase stall, dimension toggle,
     * movement, attack emission, projectile integration + culling, and
     * player collision. Delegates base physics to Entity last.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        if (!this.active || this._defeated) {
            super.update(dt);
            return this;
        }

        /* Phase-transition invulnerability countdown. */
        if (this._stallRemaining > 0) {
            this._stallRemaining = Math.max(0, this._stallRemaining - dt);
        }

        /* Automatic dimension phase-shift (phase 2+). */
        if (this._phase >= BOSS_PHASE.AERIAL) {
            this._worldToggleIn -= dt;
            if (this._worldToggleIn <= 0) {
                this.setActiveWorld(this._bossWorld === 'DREAM' ? 'DRAB' : 'DREAM');
            }
        }

        this._updateMovement(dt);

        /* Emit attacks only once the entry stall has elapsed. */
        if (this._stallRemaining <= 0) {
            this._runEmitters(dt);
        }

        this._updateProjectiles(dt);
        this._checkCollisions();

        super.update(dt);
        return this;
    }

    /**
     * Phase-specific movement. Grounded holds position; aerial and
     * unraveling orbit the arena center at increasing speed, giving the
     * bullet-hell its sweeping origin.
     * @param {number} dt Tick seconds.
     * @returns {void}
     * @private
     */
    _updateMovement(dt) {
        if (this._phase === BOSS_PHASE.GROUNDED) {
            this.stop();
            return;
        }
        const cx = this._arena.x + this._arena.width / 2;
        const cy = this._arena.y + this._arena.height / 2;
        const radius = Math.min(this._arena.width, this._arena.height) * 0.28;
        const speed = this._phase === BOSS_PHASE.UNRAVELING ? ORBIT_SPEED * 1.5 : ORBIT_SPEED;
        this._orbitAngle = normalizeAngle(this._orbitAngle + speed * dt);
        const targetX = cx + Math.cos(this._orbitAngle) * radius;
        const targetY = cy + Math.sin(this._orbitAngle) * radius;
        this.moveTowards(targetX, targetY, dt, { arrivalRadius: 4 });
    }

    /**
     * Integrates every live projectile, applies rift homing, and culls
     * expired or out-of-arena shots. Iterates the dense prefix backward
     * so swap-remove never skips an element.
     * @param {number} dt Tick seconds.
     * @returns {void}
     * @private
     */
    _updateProjectiles(dt) {
        const arena = this._arena;
        const minX = arena.x - CULL_MARGIN_PX;
        const minY = arena.y - CULL_MARGIN_PX;
        const maxX = arena.x + arena.width + CULL_MARGIN_PX;
        const maxY = arena.y + arena.height + CULL_MARGIN_PX;

        for (let i = this._projCount - 1; i >= 0; i -= 1) {
            this._life[i] -= dt;
            const kind = this._kind[i];

            if (kind === PROJ_KIND.BEAM) {
                /* Sweeping laser: rotate, do not translate. */
                this._angle[i] = normalizeAngle(this._angle[i] + this._angVel[i] * dt);
            } else {
                /* Homing rift shots steer toward the player, preserving speed. */
                if (kind === PROJ_KIND.RIFT && this._player && this._player.active) {
                    const speed = Math.hypot(this._vx[i], this._vy[i]);
                    if (speed > 1) {
                        const current = Math.atan2(this._vy[i], this._vx[i]);
                        const desired = Math.atan2(this._player.y - this._py[i], this._player.x - this._px[i]);
                        const delta = normalizeAngle(desired - current);
                        const maxTurn = HOMING_TURN * dt;
                        const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
                        const next = current + turn;
                        this._vx[i] = Math.cos(next) * speed;
                        this._vy[i] = Math.sin(next) * speed;
                    }
                }
                this._px[i] += this._vx[i] * dt;
                this._py[i] += this._vy[i] * dt;
            }

            const dead = this._life[i] <= 0 ||
                this._px[i] < minX || this._px[i] > maxX ||
                this._py[i] < minY || this._py[i] > maxY;
            if (dead) {
                this._swapRemoveProjectile(i);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       COLLISION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Fills the scratch box with the player's current bounds.
     * @returns {?Object} The scratch box, or null when unavailable.
     * @private
     */
    _getPlayerBox() {
        const player = this._player;
        if (!player || !player.active) return null;
        if (typeof player.getBoundsInto === 'function') {
            return player.getBoundsInto(_playerBox);
        }
        const b = player.bounds;
        if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
            _playerBox.x = b.x;
            _playerBox.y = b.y;
            _playerBox.width = b.width;
            _playerBox.height = b.height;
            return _playerBox;
        }
        return null;
    }

    /**
     * Circle-vs-AABB test: clamps the circle center to the box, then
     * compares squared distance to the radius. No sqrt on the hot path.
     * @param {number} cx Circle center x.
     * @param {number} cy Circle center y.
     * @param {number} r Circle radius.
     * @param {Object} box AABB with min-corner origin.
     * @returns {boolean}
     * @private
     */
    _circleHitsBox(cx, cy, r, box) {
        const nx = Math.max(box.x, Math.min(cx, box.x + box.width));
        const ny = Math.max(box.y, Math.min(cy, box.y + box.height));
        const dx = cx - nx;
        const dy = cy - ny;
        return dx * dx + dy * dy <= r * r;
    }

    /**
     * Squared distance from a point to a segment via clamped projection.
     * @param {number} px Point x.
     * @param {number} py Point y.
     * @param {number} ax Segment start x.
     * @param {number} ay Segment start y.
     * @param {number} bx Segment end x.
     * @param {number} by Segment end y.
     * @returns {number}
     * @private
     */
    _segmentDistSq(px, py, ax, ay, bx, by) {
        const abx = bx - ax;
        const aby = by - ay;
        const lenSq = abx * abx + aby * aby;
        let t = lenSq > 0 ? ((px - ax) * abx + (py - ay) * aby) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t;
        const cy = ay + aby * t;
        const dx = px - cx;
        const dy = py - cy;
        return dx * dx + dy * dy;
    }

    /**
     * Checks every projectile against the player. Bullets and rifts are
     * consumed on contact; beams tick while their active body overlaps.
     * Player dodge i-frames (isInvulnerable) skip all contact, letting a
     * well-timed dodge phase straight through the storm.
     * @returns {void}
     * @private
     */
    _checkCollisions() {
        const player = this._player;
        if (!player || !player.active) return;
        if (player.isInvulnerable) return;
        const box = this._getPlayerBox();
        if (!box) return;

        const playerCx = box.x + box.width / 2;
        const playerCy = box.y + box.height / 2;
        const playerReach = Math.max(box.width, box.height) / 2;

        for (let i = this._projCount - 1; i >= 0; i -= 1) {
            const kind = this._kind[i];

            if (kind === PROJ_KIND.BEAM) {
                /* Damage only after the telegraph window. */
                const elapsed = 1 - this._life[i] / this._maxLife[i];
                if (elapsed <= BEAM_TELEGRAPH_FRACTION) continue;
                const ex = this._px[i] + Math.cos(this._angle[i]) * this._length[i];
                const ey = this._py[i] + Math.sin(this._angle[i]) * this._length[i];
                const distSq = this._segmentDistSq(
                    playerCx, playerCy, this._px[i], this._py[i], ex, ey
                );
                const reach = this._radius[i] + playerReach;
                if (distSq <= reach * reach) {
                    this._damagePlayer(DAMAGE_BEAM, playerCx, playerCy, 'beam');
                }
                continue;
            }

            /* Bullet or rift: circle-vs-AABB, consumed on contact. */
            if (this._circleHitsBox(this._px[i], this._py[i], this._radius[i], box)) {
                if (kind === PROJ_KIND.RIFT) {
                    const bulletWorld = this._worldFlag[i] === 1 ? 'DRAB' : 'DREAM';
                    if (typeof player.world === 'string' && player.world !== bulletWorld) {
                        this._dispatch('dimensionshift', {
                            id: this.id, from: player.world, to: bulletWorld,
                            x: this._px[i], y: this._py[i]
                        });
                    }
                    this._damagePlayer(DAMAGE_RIFT, this._px[i], this._py[i], 'rift');
                } else {
                    this._damagePlayer(DAMAGE_BULLET, this._px[i], this._py[i], 'bullet');
                }
                this._swapRemoveProjectile(i);
            }
        }
    }

    /**
     * Routes boss→player damage through a short grace window so overlapping
     * patterns cannot one-shot, then broadcasts 'playerhit'. The boss never
     * mutates player HP; the WorldManager applies the consequence.
     * @param {number} amount Damage value.
     * @param {number} x Contact x.
     * @param {number} y Contact y.
     * @param {string} kind 'bullet' | 'beam' | 'rift'.
     * @returns {boolean} True if damage was applied this tick.
     * @private
     */
    _damagePlayer(amount, x, y, kind) {
        const now = this.age;
        if (now - this._lastHitAt < PLAYER_HIT_GRACE) return false;
        this._lastHitAt = now;
        this._dispatch('playerhit', {
            id: this.id, damage: amount, x, y, kind, bossWorld: this._bossWorld
        });
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       BUFFER RENDERING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Chooses a beam glyph from its direction: '-' near-horizontal, '|'
     * near-vertical, '/' or '\' on the diagonals.
     * @param {number} angle Beam direction, radians.
     * @returns {number} Glyph code point.
     * @private
     */
    _beamGlyph(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        if (Math.abs(c) > Math.abs(s) * 1.4) return 0x2D;        // '-'
        if (Math.abs(s) > Math.abs(c) * 1.4) return 0x7C;        // '|'
        return (c * s > 0) ? 0x5C : 0x2F;                        // '\' or '/'
    }

    /**
     * Draws the dragon sprite, HP bar, and every projectile. Projectiles
     * are drawn after the body so bullets read on top of the wings.
     * @param {ASCIIBuffer} asciiBuffer Destination world buffer.
     * @param {?Object} [camera=null] Camera (x/y, optional cell metrics).
     * @param {number} [alpha=1] GameLoop interpolation phase.
     * @returns {number} Cells written.
     */
    render(asciiBuffer, camera = null, alpha = 1) {
        if (!(asciiBuffer instanceof ASCIIBuffer)) {
            throw new TypeError('[BossDragon] render requires an ASCIIBuffer.');
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
        const centerCol = Math.floor((pos.x - camX) / cellW + 0.5);
        const centerRow = Math.floor((pos.y - camY) / cellH + 0.5);

        let written = 0;
        written += this._renderBody(asciiBuffer, centerCol, centerRow);
        written += this._renderHpBar(asciiBuffer, centerCol, centerRow);
        written += this._renderProjectiles(asciiBuffer, camX, camY, cellW, cellH);
        return written;
    }

    /**
     * Rasterizes the sprite row-by-row with the active phase palette.
     * Aerial phases add a one-cell cosmetic bob. A hit-flash forces every
     * cell white for the flash duration.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {number} centerCol Anchor cell column.
     * @param {number} centerRow Anchor cell row.
     * @returns {number} Cells written.
     * @private
     */
    _renderBody(buffer, centerCol, centerRow) {
        const palette = PHASE_PALETTES[this._phase] ?? PHASE_PALETTES[1];
        const col0 = centerCol - Math.floor(SPRITE_COLS / 2);
        let row0 = centerRow - Math.floor(SPRITE_ROWS / 2);

        /* Cosmetic hover bob while airborne. */
        if (this._phase >= BOSS_PHASE.AERIAL && !this._defeated) {
            const bob = Math.sin(TWO_PI * AERIAL_BOB_HZ * this.age);
            row0 += Math.round(bob * AERIAL_BOB_CELLS);
        }

        const flashing = this.isFlashing;
        const flashFg = ASCIIBuffer.packColor('#ffffff');
        let written = 0;

        for (let r = 0; r < SPRITE_ROWS; r += 1) {
            const rowStr = SPRITE_PADDED[r];
            for (let c = 0; c < SPRITE_COLS; c += 1) {
                const code = rowStr.codePointAt(c);
                if (code === 0x20) continue;                      // space
                const fg = flashing ? flashFg : palette[code];
                if (fg === undefined) continue;                   // unmapped char
                if (this._writeCell(buffer, col0 + c, row0 + r, code, fg, null, 1)) {
                    written += 1;
                }
            }
        }
        return written;
    }

    /**
     * Draws a compact ASCII HP bar above the head: '=' filled, '-' spent.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {number} centerCol Anchor cell column.
     * @param {number} centerRow Anchor cell row.
     * @returns {number} Cells written.
     * @private
     */
    _renderHpBar(buffer, centerCol, centerRow) {
        const width = SPRITE_COLS;
        const row = centerRow - Math.floor(SPRITE_ROWS / 2) - HP_BAR_ROW_OFFSET;
        const col0 = centerCol - Math.floor(width / 2);
        const filled = Math.round(this.hpFraction * width);
        let written = 0;
        for (let c = 0; c < width; c += 1) {
            const isFull = c < filled;
            const code = isFull ? 0x3D : 0x2D;                   // '=' or '-'
            const fg = isFull ? HP_BAR_FULL_FG : HP_BAR_EMPTY_FG;
            if (this._writeCell(buffer, col0 + c, row, code, fg, null, 1)) {
                written += 1;
            }
        }
        return written;
    }

    /**
     * Draws every live projectile. Bullets and rifts are single glyphs;
     * beams are rasterized as a run of oriented glyphs along their length,
     * dimmed during the telegraph window.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {number} camX Camera x.
     * @param {number} camY Camera y.
     * @param {number} cellW Cell width.
     * @param {number} cellH Cell height.
     * @returns {number} Cells written.
     * @private
     */
    _renderProjectiles(buffer, camX, camY, cellW, cellH) {
        let written = 0;
        for (let i = 0; i < this._projCount; i += 1) {
            const kind = this._kind[i];

            if (kind === PROJ_KIND.BEAM) {
                written += this._renderBeam(buffer, i, camX, camY, cellW, cellH);
                continue;
            }

            const col = Math.floor((this._px[i] - camX) / cellW);
            const row = Math.floor((this._py[i] - camY) / cellH);
            const code = kind === PROJ_KIND.RIFT ? 0x6F : 0x2A;   // 'o' or '*'
            if (this._writeCell(buffer, col, row, code, this._color[i], null, 1)) {
                written += 1;
            }
        }
        return written;
    }

    /**
     * Rasterizes one beam by stepping along its length in cell-sized
     * increments. Telegraphed beams render in the warning color at reduced
     * opacity; active beams render in their stored color.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {number} i Projectile slot.
     * @param {number} camX Camera x.
     * @param {number} camY Camera y.
     * @param {number} cellW Cell width.
     * @param {number} cellH Cell height.
     * @returns {number} Cells written.
     * @private
     */
    _renderBeam(buffer, i, camX, camY, cellW, cellH) {
        const elapsed = 1 - this._life[i] / this._maxLife[i];
        const telegraphing = elapsed <= BEAM_TELEGRAPH_FRACTION;
        const fg = telegraphing ? BEAM_TELEGRAPH_FG : this._color[i];
        const opacity = telegraphing ? 0.45 : 1;
        const glyph = this._beamGlyph(this._angle[i]);
        const dirX = Math.cos(this._angle[i]);
        const dirY = Math.sin(this._angle[i]);
        const step = Math.min(cellW, cellH);
        let written = 0;
        for (let t = 0; t <= this._length[i]; t += step) {
            const wx = this._px[i] + dirX * t;
            const wy = this._py[i] + dirY * t;
            const col = Math.floor((wx - camX) / cellW);
            const row = Math.floor((wy - camY) / cellH);
            if (this._writeCell(buffer, col, row, glyph, fg, null, opacity)) {
                written += 1;
            }
        }
        return written;
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Extended diagnostics: Entity metrics plus boss fight state.
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...super.getMetrics(),
            hp: this._hp,
            maxHp: this._maxHp,
            hpFraction: this.hpFraction,
            phase: this._phase,
            bossWorld: this._bossWorld,
            defeated: this._defeated,
            activeProjectiles: this._projCount,
            poolCapacity: POOL_CAPACITY,
            emitters: this._emitters.length
        };
    }
}

export default BossDragon;