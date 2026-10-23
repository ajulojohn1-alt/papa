/**
 * @file src/entities/Player.js
 * @module entities/Player
 * @description
 * The player avatar for "A Stitch in Time".
 * Player extends Entity with input-driven 8-way movement, sprint/dodge
 * maneuvers gated by the orange energy resource, dual-world visual form
 * switching, and a multi-cell ASCII sprite renderer. It is the only
 * entity that reads the InputManager directly; every other actor in the
 * world is server- or AI-driven.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INHERITANCE & EXTENSION CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * Player follows the Entity subclass contract exactly:
 *   1. super(options) first, with collision metrics derived from the
 *      sprite's 3×3 cell footprint.
 *   2. update(dt, input) sets movement intent (velocity, facing, dodge
 *      impulses) BEFORE calling super.update(dt), which integrates the
 *      semi-implicit Euler step, clamps velocity, and advances age.
 *   3. render(buffer, camera, alpha) is a FULL override: the base
 *      single-glyph blit is replaced by the sprite rasterizer below.
 *      Buffer injection still funnels through Entity._writeCell so
 *      clipping and alpha compositing behave identically to all actors.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FORM STATES & ASCII CHARACTER ART MAPPING
 * ───────────────────────────────────────────────────────────────────────────
 * The protagonist wears a different body in each world. Both forms are
 * 3×3 cell sprites centered on the entity anchor; each cell owns its own
 * glyph code point plus packed foreground/background RGBA. A null cell
 * means "skip" — cheaper than writing a space, and it lets terrain show
 * through the sprite's corners.
 *
 * DREAM WORLD — the quilted patchwork poncho + crocheted white net mask:
 *
 *       ( o )      row 0: net mask — dim stitch parens, bright white face
 *       / # \      row 1: shoulders — RED /, BLUE patch, ORANGE \
 *       # # #      row 2: hem — patchwork cycle ORANGE, RED, BLUE
 *
 * Walk frame 2 rotates the hem patch colors (BLUE, ORANGE, RED), which
 * reads as the heavy quilt swaying with the stride.
 *
 * DRAB WORLD — the business suit + pitch-black shadow silhouette face:
 *
 *       ( # )      row 0: shadow face — near-black '#' on a void-gray bg
 *       / | \      row 1: charcoal lapels, pale SHIRT front
 *       # | #      row 2: suit body with dark TIE line
 *
 * Walk frame 2 mirrors the lapels (\ | /) for a restrained arm swing —
 * the Drab World does not allow flamboyance, even in animation.
 *
 * Palette notes: the poncho uses the project's signature orange #FF7700
 * as one of its three quilt colors, so the Dream avatar visually rhymes
 * with the orange energy it spends. The shadow face is the ONLY cell in
 * either sprite with a background color, punched out as a silhouette.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INPUT PIPELINE
 * ───────────────────────────────────────────────────────────────────────────
 * Player queries semantic actions, never key codes: MOVE_* through
 * getMovementVector() (pre-normalized to a unit vector by InputManager),
 * plus SPRINT (held), DODGE (edge), and INTERACT (edge). The manager's
 * update() handshake has already committed edge events by the time
 * WorldManager calls player.update(), so every just-pressed query is
 * observed exactly once per tick.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MOVEMENT MATH
 * ───────────────────────────────────────────────────────────────────────────
 * Velocity approaches the input-derived desired velocity with the same
 * frame-rate-independent exponential smoothing the Camera uses:
 *
 *   alpha = 1 - e^(-k · dt)
 *   v    += (desired - v) · alpha
 *
 * k = 14 (1/s) converges ~95% of the gap in ~0.21 s: responsive enough
 * for bullet-hell dodging, smooth enough that diagonal starts do not
 * snap. Releasing all movement keys sets desired = (0, 0), so the same
 * damping produces the stop — no friction constant is needed, and the
 * stop distance is identical at 60 Hz and 144 Hz.
 *
 * SPRINT multiplies walk speed by 1.7 while Shift is held and drains
 * energy. DODGE overrides velocity entirely with a fixed impulse along
 * the current input direction (or the facing direction when standing
 * still), commits the avatar for DODGE_DURATION, and ignores movement
 * input for that window — a committed maneuver, not a speed buff.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ENERGY CONTRACT, HYSTERESIS & FLICKER
 * ───────────────────────────────────────────────────────────────────────────
 * The EnergySystem is duck-typed:
 *
 *   @typedef {Object} EnergySystem
 *   @property {number} energy     Current orange energy.
 *   @property {number} maxEnergy  Maximum orange energy (> 0).
 *   @property {(amount: number) => number} spend
 *     Attempts to consume `amount`; returns the ACTUAL amount consumed
 *     (which may be less when the reserve runs dry).
 *
 * With no system attached, energy is treated as infinite (menu flight,
 * tests). Sprint drain calls spend(rate·dt) every tick. Exhaustion uses
 * HYSTERESIS: hitting zero locks sprinting out until the reserve
 * recharges past SPRINT_RESUME_FRACTION, so hovering at the boundary can
 * never strobe the speed multiplier. Crossing below LOW_ENERGY_FRACTION
 * dispatches 'energylow' exactly once and starts the presentation
 * flicker: the whole sprite's alpha collapses to 35% for 40% of every
 * 6 Hz cycle, warning the player that the stitch is fraying.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NETWORK SYNC
 * ───────────────────────────────────────────────────────────────────────────
 * getNetworkState() emits exactly the PLAYER_MOVE shape handled by
 * server/index.js: { x, y, world, animationState }. Server corrections
 * land through applyServerCorrection(), which teleports with an
 * interpolation snap so reconciliation never paints a lerp streak.
 *
 * @example
 * const player = new Player({
 *     x: spawn.x,
 *     y: spawn.y,
 *     input,                    // InputManager
 *     energySystem: energy,     // orange reserve
 *     cellWidth: renderer.cellWidth,
 *     cellHeight: renderer.cellHeight
 * });
 * player.addEventListener('interact', (detail) => dialog.tryOpen(detail));
 *
 * // Per fixed tick (WorldManager):
 * player.update(dt, input);
 *
 * // Per presentation frame, in zIndex order:
 * player.render(worldBuffer, camera, loop.getMetrics().interpolationAlpha);
 */

import { Entity, ENTITY_LAYER } from './Entity.js';
import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** World identifiers accepted by setWorld(). @enum {string} */
export const PLAYER_WORLD = Object.freeze({ DREAM: 'DREAM', DRAB: 'DRAB' });

/** Local movement states; getAnimationState() maps these to network names. */
const MOVE_STATE = Object.freeze({
    IDLE: 'IDLE',
    WALK: 'WALK',
    SPRINT: 'SPRINT',
    DODGE: 'DODGE'
});

/** Network-safe animation names (matches server animationState strings). */
const ANIMATION_NAMES = Object.freeze({
    IDLE: 'idle',
    WALK: 'walk',
    SPRINT: 'sprint',
    DODGE: 'dodge'
});

/* ---- Movement tuning (CSS pixels / second unless noted) ------------------ */
/** Base walking speed. */
const WALK_SPEED = 150;
/** Sprint speed multiplier applied to WALK_SPEED. */
const SPRINT_MULTIPLIER = 1.7;
/** Exponential approach rate toward desired velocity (1/s). */
const ACCELERATION_K = 14;
/** Velocity clamp: dodge impulse plus 20% headroom. */
const PLAYER_MAX_SPEED = 560;

/* ---- Dodge tuning -------------------------------------------------------- */
/** Dodge burst velocity, px/s. */
const DODGE_IMPULSE = 460;
/** Committed maneuver duration, seconds. */
const DODGE_DURATION = 0.26;
/** Recovery before the next dodge, seconds. */
const DODGE_COOLDOWN = 0.55;
/** Energy cost of one full dodge. */
const DODGE_ENERGY_COST = 12;
/** Minimum spend fraction for a full dodge; below = exhausted stumble. */
const DODGE_MIN_FUNDING = 0.5;
/** Impulse and duration scale for an exhausted (under-funded) dodge. */
const EXHAUSTED_DODGE_SCALE = 0.55;

/* ---- Energy tuning ------------------------------------------------------- */
/** Sprint drain rate, energy units per second. */
const SPRINT_ENERGY_DRAIN = 18;
/** Sprint unlocks again once the reserve recharges past this fraction. */
const SPRINT_RESUME_FRACTION = 0.15;
/** Below this fraction the sprite flickers and 'energylow' fires. */
const LOW_ENERGY_FRACTION = 0.2;
/** Flicker oscillation frequency, Hz. */
const FLICKER_HZ = 6;
/** Fraction of each flicker cycle spent in the dim state. */
const FLICKER_DUTY = 0.4;
/** Sprite alpha during the dim phase of a flicker. */
const FLICKER_DIM_ALPHA = 0.35;

/* ---- Presentation --------------------------------------------------------- */
/** Sprite alpha while a dodge is in flight (ghosting). */
const DODGE_GHOST_ALPHA = 0.6;
/** Sprint streak trail length in cells. */
const STREAK_CELLS = 2;

/* ══════════════════════════════════════════════════════════════════════════
   SPRITE PALETTE & TABLES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Packs a sprite cell at module load. Colors are resolved ONCE here; the
 * render loop only ever moves packed integers around.
 * @param {string} ch Single glyph.
 * @param {string} fg Foreground color.
 * @param {?string} [bg=null] Background color; null keeps terrain visible.
 * @returns {{code: number, fg: number, bg: ?number}} Frozen cell.
 */
function cell(ch, fg, bg = null) {
    return Object.freeze({
        code: ch.codePointAt(0),
        fg: ASCIIBuffer.packColor(fg),
        bg: bg === null ? null : ASCIIBuffer.packColor(bg)
    });
}

/* ---- Shared palette (see header form tables) ----------------------------- */
const NET_WHITE = '#f4f4f0';
const NET_STITCH = '#c9ced4';
const QUILT_RED = '#e5484d';
const QUILT_BLUE = '#3b6fd4';
const QUILT_ORANGE = '#ff7700';
const SHADOW_FACE = '#050505';
const SHADOW_VOID_BG = '#17181c';
const SUIT_CHARCOAL = '#33363d';
const SUIT_DARK = '#24262b';
const SHIRT_PALE = '#d9d9d4';
const TIE_BLACK = '#101216';
const STREAK_ORANGE = '#ff7700';
const FLASH_WHITE = '#ffffff';

/**
 * The two form sprite sheets. Each form carries exactly two frames:
 * frame 0 is the idle/anchor pose, frame 1 is the walk-cycle alternate.
 * Null entries inside a row are skipped cells (terrain shows through).
 *
 * Layout convention: frames[frameIndex][row][column], 3 rows × 3 columns,
 * rasterized with the center cell on the entity anchor.
 * @type {Object<string, {frames: Array<Array<Array<?Object>>>}>}
 */
const FORM_SPRITES = Object.freeze({
    DREAM: Object.freeze({
        frames: Object.freeze([
            /* Frame 0 — idle. */
            Object.freeze([
                Object.freeze([cell('(', NET_STITCH), cell('o', NET_WHITE), cell(')', NET_STITCH)]),
                Object.freeze([cell('/', QUILT_RED), cell('#', QUILT_BLUE), cell('\\', QUILT_ORANGE)]),
                Object.freeze([cell('#', QUILT_ORANGE), cell('#', QUILT_RED), cell('#', QUILT_BLUE)])
            ]),
            /* Frame 1 — hem patches rotate: the quilt sways mid-stride. */
            Object.freeze([
                Object.freeze([cell('(', NET_STITCH), cell('o', NET_WHITE), cell(')', NET_STITCH)]),
                Object.freeze([cell('/', QUILT_RED), cell('#', QUILT_BLUE), cell('\\', QUILT_ORANGE)]),
                Object.freeze([cell('#', QUILT_BLUE), cell('#', QUILT_ORANGE), cell('#', QUILT_RED)])
            ])
        ])
    }),
    DRAB: Object.freeze({
        frames: Object.freeze([
            /* Frame 0 — idle. The '#' face is the sole background cell. */
            Object.freeze([
                Object.freeze([cell('(', SUIT_DARK), cell('#', SHADOW_FACE, SHADOW_VOID_BG), cell(')', SUIT_DARK)]),
                Object.freeze([cell('/', SUIT_CHARCOAL), cell('|', SHIRT_PALE), cell('\\', SUIT_CHARCOAL)]),
                Object.freeze([cell('#', SUIT_DARK), cell('|', TIE_BLACK), cell('#', SUIT_DARK)])
            ]),
            /* Frame 1 — lapels mirror for a restrained corporate arm swing. */
            Object.freeze([
                Object.freeze([cell('(', SUIT_DARK), cell('#', SHADOW_FACE, SHADOW_VOID_BG), cell(')', SUIT_DARK)]),
                Object.freeze([cell('\\', SUIT_CHARCOAL), cell('|', SHIRT_PALE), cell('/', SUIT_CHARCOAL)]),
                Object.freeze([cell('#', SUIT_DARK), cell('|', TIE_BLACK), cell('#', SUIT_DARK)])
            ])
        ])
    })
});

/* Module-level scratch objects: reused every frame, never retained. */
/** @type {{x: number, y: number}} */
const _renderPoint = { x: 0, y: 0 };

/* ══════════════════════════════════════════════════════════════════════════
   PLAYER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The player avatar: input-driven movement, orange-energy sprint/dodge,
 * dual-world form switching, and a 3×3 sprite renderer.
 */
export class Player extends Entity {
    /**
     * @param {Object} [options] All Entity options are accepted; the
     *   Player-specific additions are listed below.
     * @param {Object} [options.input] InputManager to poll each tick.
     * @param {EnergySystem} [options.energySystem] Orange energy reserve.
     * @param {string} [options.world='DREAM'] Starting dimension form.
     * @param {boolean} [options.controlEnabled=true] Movement gate; the
     *   dialog/UI systems clear this while a cutscene or typewriter owns
     *   the frame.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[Player] options must be an object.');
        }
        /* Collision box matches the 3×3 sprite footprint. Defaults mirror
         * the engine's default cell metrics (9.6 × 20). */
        const cellW = options.cellWidth ?? 9.6;
        const cellH = options.cellHeight ?? 20;
        super({
            name: 'Player',
            char: '@',                      /* fallback glyph; render overrides */
            fgColor: QUILT_ORANGE,
            zIndex: ENTITY_LAYER.PLAYER,
            width: cellW * 3,
            height: cellH * 3,
            maxSpeed: PLAYER_MAX_SPEED,
            friction: 0,                    /* stopping uses input damping   */
            speed: WALK_SPEED,
            tags: ['player'],
            ...options
        });

        /* ---- Input & energy wiring ----------------------------------- */
        /** @type {?Object} InputManager reference (duck-typed). */
        this._input = options.input ?? null;
        /** @type {?EnergySystem} Orange reserve (duck-typed). */
        this._energySystem = null;
        if (options.energySystem !== undefined && options.energySystem !== null) {
            this.attachEnergySystem(options.energySystem);
        }

        /* ---- Form state ---------------------------------------------- */
        /** @type {string} Active world/form identifier. */
        this._world = PLAYER_WORLD.DREAM;
        if (options.world !== undefined) {
            this.setWorld(options.world, { silent: true });
        }

        /* ---- Movement state ------------------------------------------ */
        /** @type {string} Current MOVE_STATE value. */
        this._moveState = MOVE_STATE.IDLE;
        /** @type {boolean} Input gate (dialog/cutscene freeze). */
        this._controlEnabled = options.controlEnabled !== false;
        /** @type {{x: number, y: number}} Last committed input vector. */
        this._moveDir = { x: 0, y: 0 };
        /** @type {boolean} True while any movement key is held. */
        this._moving = false;
        /** @type {number} Walk-cycle phase in steps. */
        this._walkPhase = 0;

        /* ---- Dodge state ---------------------------------------------- */
        /** @type {number} Remaining committed dodge time, seconds. */
        this._dodgeRemaining = 0;
        /** @type {number} Remaining dodge recovery time, seconds. */
        this._dodgeCooldown = 0;

        /* ---- Energy state --------------------------------------------- */
        /** @type {boolean} Sprint lockout after exhaustion (hysteresis). */
        this._sprintLocked = false;
        /** @type {boolean} True while sprinting this tick. */
        this._sprinting = false;
        /** @type {boolean} Low-energy crossing detector for the event. */
        this._wasLowEnergy = false;
    }

    /* ══════════════════════════════════════════════════════════════════
       WIRING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches (or replaces) the InputManager polled each tick.
     * @param {?Object} input InputManager instance, or null to detach.
     * @returns {this}
     */
    attachInput(input) {
        if (input !== null && typeof input.isActionDown !== 'function') {
            throw new TypeError('[Player] input must be an InputManager.');
        }
        this._input = input;
        return this;
    }

    /**
     * Attaches the orange energy reserve. Validated structurally so a
     * misconfigured system fails at wiring time, not mid-sprint.
     * @param {?EnergySystem} system Energy system, or null for infinite.
     * @returns {this}
     */
    attachEnergySystem(system) {
        if (system === null) {
            this._energySystem = null;
            return this;
        }
        if (!Number.isFinite(system.energy) || !Number.isFinite(system.maxEnergy) ||
            system.maxEnergy <= 0 || typeof system.spend !== 'function') {
            throw new TypeError(
                '[Player] energySystem must expose numeric energy/maxEnergy and spend(amount).'
            );
        }
        this._energySystem = system;
        return this;
    }

    /**
     * Enables or disables player control. Disabling does NOT freeze the
     * dodge timers: a committed maneuver always finishes, which prevents
     * an i-frame exploit where pausing mid-dodge banks free invulnerability.
     * @param {boolean} enabled True to accept movement input.
     * @returns {this}
     */
    setControlEnabled(enabled) {
        this._controlEnabled = Boolean(enabled);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       FORM STATE (DUAL-WORLD SWITCHING)
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {string} Active world identifier ('DREAM' | 'DRAB'). */
    get world() {
        return this._world;
    }

    /**
     * Switches the active dimension form. Swaps the sprite table and
     * fires a short flash so the shift reads as a costume swap, not a
     * palette glitch. Idempotent: setting the current world is a no-op.
     * @param {string} world 'DREAM' or 'DRAB'.
     * @param {Object} [opts]
     * @param {boolean} [opts.silent=false] Skip flash/event (constructor).
     * @returns {this}
     */
    setWorld(world, opts = {}) {
        if (world !== PLAYER_WORLD.DREAM && world !== PLAYER_WORLD.DRAB) {
            throw new RangeError(`[Player] Unknown world: ${world}.`);
        }
        if (world === this._world) return this;
        const previous = this._world;
        this._world = world;
        if (!opts.silent) {
            this.flash(0.35, FLASH_WHITE);
            this._dispatch('formchange', { id: this.id, from: previous, to: world });
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       ENERGY HELPERS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attempts to spend energy through the attached system. Without a
     * system, spending always succeeds in full (infinite reserve).
     * @param {number} amount Requested amount (>= 0).
     * @returns {number} Actual amount consumed.
     * @private
     */
    _spendEnergy(amount) {
        if (!this._energySystem) return amount;
        const spent = this._energySystem.spend(amount);
        return Number.isFinite(spent) && spent >= 0 ? spent : 0;
    }

    /**
     * Current reserve as a fraction of maximum, [0, 1]. Infinite when no
     * energy system is attached.
     * @returns {number}
     */
    get energyFraction() {
        if (!this._energySystem) return 1;
        const max = this._energySystem.maxEnergy;
        if (!Number.isFinite(max) || max <= 0) return 1;
        return Math.min(1, Math.max(0, this._energySystem.energy / max));
    }

    /** @returns {boolean} True while sprint is locked out by exhaustion. */
    get isExhausted() {
        return this._sprintLocked;
    }

    /** @returns {boolean} True while a dodge is in flight. */
    get isDodging() {
        return this._dodgeRemaining > 0;
    }

    /**
     * Invulnerability query for the combat system: the avatar is immune
     * for the entire committed dodge window.
     * @returns {boolean}
     */
    get isInvulnerable() {
        return this.isDodging;
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the player by one fixed tick.
     * CONTRACT: called once per simulation tick. The optional second
     * argument lets WorldManager pass the InputManager directly
     * (worlds.update(dt, input) style); attachInput() provides the
     * fallback for systems that wire dependencies up front.
     *
     * Order of operations:
     *   1. Tick maneuver timers (dodge duration and cooldown).
     *   2. Read input and resolve sprint eligibility (energy + hysteresis).
     *   3. Handle the dodge edge trigger (committed impulse).
     *   4. Drive velocity toward the desired vector (exponential damping).
     *   5. Fire the interaction edge event.
     *   6. Advance walk phase, movement state, and low-energy crossing.
     *   7. super.update(dt): integration, clamping, flash timer, age.
     *
     * @param {number} dt Fixed timestep, seconds.
     * @param {Object} [input] InputManager override.
     * @returns {this}
     */
    update(dt, input = this._input) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        if (!this.active) return this;

        const hasInput = input !== null && input !== undefined;
        const controlsLive = this._controlEnabled && hasInput;

        /* ---- 1. Maneuver timers -------------------------------------- */
        if (this._dodgeRemaining > 0) {
            this._dodgeRemaining = Math.max(0, this._dodgeRemaining - dt);
        }
        if (this._dodgeCooldown > 0) {
            this._dodgeCooldown = Math.max(0, this._dodgeCooldown - dt);
        }

        /* ---- 2. Input vector & sprint resolution ---------------------- */
        let vecX = 0;
        let vecY = 0;
        let wantsSprint = false;
        if (controlsLive && !this.isDodging) {
            const vec = input.getMovementVector();
            vecX = vec.x;
            vecY = vec.y;
            wantsSprint = input.isActionDown('SPRINT');
        }
        this._moving = vecX !== 0 || vecY !== 0;
        this._moveDir.x = vecX;
        this._moveDir.y = vecY;

        const fraction = this.energyFraction;

        /* Hysteresis unlock: exhaustion holds until the reserve climbs
         * back past the resume threshold — no boundary strobing. */
        if (this._sprintLocked && fraction >= SPRINT_RESUME_FRACTION) {
            this._sprintLocked = false;
        }

        this._sprinting = wantsSprint && this._moving &&
            !this._sprintLocked && fraction > 0 && !this.isDodging;

        let currentSpeed = WALK_SPEED;
        if (this._sprinting) {
            currentSpeed = WALK_SPEED * SPRINT_MULTIPLIER;
            /* Continuous drain: spend returns the ACTUAL consumed amount,
             * so hitting the floor mid-tick locks sprint immediately. */
            this._spendEnergy(SPRINT_ENERGY_DRAIN * dt);
            if (this.energyFraction <= 0) {
                this._sprinting = false;
                this._sprintLocked = true;
                currentSpeed = WALK_SPEED;
            }
        }

        /* ---- 3. Dodge edge trigger ------------------------------------ */
        if (controlsLive && this._dodgeCooldown <= 0 && !this.isDodging &&
            input.isActionJustPressed('DODGE')) {
            this._beginDodge();
        }

        /* ---- 4. Velocity intent ---------------------------------------- */
        if (this.isDodging) {
            /* A committed maneuver ignores steering input entirely. */
        } else {
            /* desired = normalized input × current speed; InputManager
             * already normalizes diagonals to unit length. */
            const desiredX = vecX * currentSpeed;
            const desiredY = vecY * currentSpeed;
            const alpha = 1 - Math.exp(-ACCELERATION_K * dt);
            this._vx += (desiredX - this._vx) * alpha;
            this._vy += (desiredY - this._vy) * alpha;
            if (this._moving) {
                /* Face the travel direction instantly: players expect
                 * the dodge vector to match the held direction. */
                this._angle = Math.atan2(vecY, vecX);
            }
        }

        /* ---- 5. Interaction edge -------------------------------------- */
        if (controlsLive && input.isActionJustPressed('INTERACT')) {
            this._dispatch('interact', {
                id: this.id,
                x: this.x,
                y: this.y,
                world: this._world
            });
        }

        /* ---- 6. Presentation & state bookkeeping ----------------------- */
        const speedMagnitude = Math.hypot(this._vx, this._vy);
        if (this._moving || this.isDodging) {
            /* Walk phase advances by distance in row-pitch units, so the
             * stride animation is speed-correct (sprint steps faster). */
            this._walkPhase += (speedMagnitude * dt) / Math.max(1, this._cellH);
        }

        if (this.isDodging) {
            this._moveState = MOVE_STATE.DODGE;
        } else if (this._sprinting) {
            this._moveState = MOVE_STATE.SPRINT;
        } else if (this._moving) {
            this._moveState = MOVE_STATE.WALK;
        } else {
            this._moveState = MOVE_STATE.IDLE;
        }

        /* Low-energy crossing detector: fire exactly once per dip. */
        const lowNow = fraction < LOW_ENERGY_FRACTION;
        if (lowNow && !this._wasLowEnergy) {
            this._dispatch('energylow', { id: this.id, fraction });
        }
        this._wasLowEnergy = lowNow;

        /* ---- 7. Physics integration ------------------------------------ */
        super.update(dt);
        return this;
    }

    /**
     * Executes a dodge: funds it from the reserve, picks a direction
     * (held input wins; facing is the fallback), and commits the impulse.
     * An under-funded dodge still fires at reduced power — starving the
     * player of ALL escape options at zero energy would be unfair in a
     * bullet-hell context; making it visibly weaker keeps the economy
     * honest.
     * @returns {void}
     * @private
     */
    _beginDodge() {
        const spent = this._spendEnergy(DODGE_ENERGY_COST);
        const funding = spent / DODGE_ENERGY_COST;

        let dirX = this._moveDir.x;
        let dirY = this._moveDir.y;
        if (dirX === 0 && dirY === 0) {
            /* No input: dodge along the facing direction. */
            dirX = Math.cos(this._angle);
            dirY = Math.sin(this._angle);
        }
        const magnitude = Math.hypot(dirX, dirY);
        if (magnitude <= 1e-6) return;
        dirX /= magnitude;
        dirY /= magnitude;

        let scale = 1;
        if (funding < DODGE_MIN_FUNDING) {
            if (funding <= 0) {
                /* Fully dry: no dodge at all, but report why. */
                this._dispatch('exhausted', { id: this.id, maneuver: 'dodge' });
                return;
            }
            scale = EXHAUSTED_DODGE_SCALE;
            this._dispatch('exhausted', { id: this.id, maneuver: 'dodge-weak' });
        }

        /* Override velocity rather than adding to it: a dodge must feel
         * like a committed lunge regardless of the prior drift. */
        this._vx = dirX * DODGE_IMPULSE * scale;
        this._vy = dirY * DODGE_IMPULSE * scale;
        this._angle = Math.atan2(dirY, dirX);
        this._dodgeRemaining = DODGE_DURATION * (scale === 1 ? 1 : 0.7);
        this._dodgeCooldown = DODGE_COOLDOWN;
        this._dispatch('dodge', {
            id: this.id,
            x: this.x,
            y: this.y,
            dirX,
            dirY,
            weakened: scale < 1
        });
    }

    /* ══════════════════════════════════════════════════════════════════
       BUFFER RENDERING (SPRITE RASTERIZER)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Animation-state name for network sync and the debug HUD.
     * @returns {string} 'idle' | 'walk' | 'sprint' | 'dodge'.
     */
    getAnimationState() {
        switch (this._moveState) {
            case MOVE_STATE.WALK: return ANIMATION_NAMES.WALK;
            case MOVE_STATE.SPRINT: return ANIMATION_NAMES.SPRINT;
            case MOVE_STATE.DODGE: return ANIMATION_NAMES.DODGE;
            default: return ANIMATION_NAMES.IDLE;
        }
    }

    /** @returns {boolean} True while the current tick is sprinting. */
    get isSprinting() {
        return this._sprinting;
    }

    /**
     * Selects the sprite frame for the current motion. Idle anchors on
     * frame 0; any ground motion alternates frames at one step per half
     * walk-phase, so the quilt sway and arm swing are speed-correct.
     * @returns {number} 0 or 1.
     * @private
     */
    _pickFrame() {
        if (this._moveState === MOVE_STATE.IDLE) return 0;
        return Math.floor(this._walkPhase * 2) % 2;
    }

    /**
     * Computes the effective sprite opacity for this presentation frame.
     * Sources stack multiplicatively:
     *   entity alpha × dodge ghost × low-energy flicker.
     * @param {number} phase Interpolation phase (unused by alpha math but
     *   kept for symmetry with the base signature).
     * @returns {number} Opacity in [0, 1].
     * @private
     */
    _computeSpriteAlpha(phase) {
        let alpha = this.alpha;
        if (this.isDodging) {
            alpha *= DODGE_GHOST_ALPHA;
        }
        if (this._wasLowEnergy) {
            /* 6 Hz square-ish flicker: dim for FLICKER_DUTY of each cycle. */
            const cycle = (this.age * FLICKER_HZ) % 1;
            if (cycle < FLICKER_DUTY) {
                alpha *= FLICKER_DIM_ALPHA;
            }
        }
        return Math.min(1, Math.max(0, alpha));
    }

    /**
     * Draws the sprint/dodge streak trail behind the avatar. Streaks are
     * laid along the negative travel direction and fade with distance;
     * they are written BEFORE the sprite so the body overwrites any
     * overlapping streak cell.
     * @param {import('../engine/ASCIIBuffer.js').ASCIIBuffer} buffer
     * @param {number} centerCol Sprite anchor column.
     * @param {number} centerRow Sprite anchor row.
     * @param {number} alpha Sprite opacity (streaks fade further).
     * @returns {number} Cells written.
     * @private
     */
    _drawStreaks(buffer, centerCol, centerRow, alpha) {
        if (!this.isDodging && !this._sprinting) return 0;
        const speedMagnitude = Math.hypot(this._vx, this._vy);
        if (speedMagnitude < 1) return 0;
        const dirX = this._vx / speedMagnitude;
        const dirY = this._vy / speedMagnitude;
        /* Glyph follows the dominant axis: commas for horizontal wind,
         * apostrophes for vertical. */
        const streakCode = Math.abs(dirX) >= Math.abs(dirY) ? 0x2C : 0x27;
        const streakFg = ASCIIBuffer.packColor(STREAK_ORANGE);
        let written = 0;
        for (let i = 1; i <= STREAK_CELLS; i += 1) {
            const col = centerCol - Math.round(dirX * (i + 1));
            const row = centerRow - Math.round(dirY * (i + 1));
            const streakAlpha = alpha * (1 - i / (STREAK_CELLS + 1));
            if (this._writeCell(buffer, col, row, streakCode, streakFg, null, streakAlpha)) {
                written += 1;
            }
        }
        return written;
    }

    /**
     * Draws the full dual-form sprite into the world buffer. Call in
     * WorldManager's zIndex-sorted entity pass, after terrain/water/
     * weather and before buffer.commit().
     *
     * Rasterization layout: the 3×3 frame is centered on the anchor
     * cell, so the top-left cell is (centerCol - 1, centerRow - 1).
     * Null frame cells are skipped, letting terrain show through the
     * sprite's negative space. During a hit-flash every cell is forced
     * to white so damage feedback reads regardless of the active form.
     *
     * @param {ASCIIBuffer} asciiBuffer Destination world buffer.
     * @param {?Object} [camera=null] Camera (x/y, optional cell metrics).
     * @param {number} [alpha=1] GameLoop interpolation phase.
     * @returns {number} Number of cells written.
     */
    render(asciiBuffer, camera = null, alpha = 1) {
        if (!(asciiBuffer instanceof ASCIIBuffer)) {
            throw new TypeError('[Player] render requires an ASCIIBuffer.');
        }
        if (!this.visible || !this.active) return 0;

        const phase = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
        const spriteAlpha = this._computeSpriteAlpha(phase);
        if (spriteAlpha <= 0.02) return 0;

        const camX = camera && Number.isFinite(camera.x) ? camera.x : 0;
        const camY = camera && Number.isFinite(camera.y) ? camera.y : 0;
        const cellW = camera && Number.isFinite(camera.cellWidth) && camera.cellWidth > 0
            ? camera.cellWidth : this._cellW;
        const cellH = camera && Number.isFinite(camera.cellHeight) && camera.cellHeight > 0
            ? camera.cellHeight : this._cellH;

        /* Interpolated anchor, snapped to the nearest cell center — the
         * same convention Entity.render uses for single-glyph actors. */
        const pos = this.getRenderPosition(phase, _renderPoint);
        const centerCol = Math.floor((pos.x - camX) / cellW + 0.5);
        const centerRow = Math.floor((pos.y - camY) / cellH + 0.5);

        let written = this._drawStreaks(asciiBuffer, centerCol, centerRow, spriteAlpha);

        const form = this._world === PLAYER_WORLD.DREAM
            ? FORM_SPRITES.DREAM
            : FORM_SPRITES.DRAB;
        const frame = form.frames[this._pickFrame()];
        const flashing = this.isFlashing;
        const flashFg = ASCIIBuffer.packColor(FLASH_WHITE);

        for (let row = 0; row < frame.length; row += 1) {
            const rowCells = frame[row];
            for (let col = 0; col < rowCells.length; col += 1) {
                const spriteCell = rowCells[col];
                if (spriteCell === null) continue;
                const fg = flashing ? flashFg : spriteCell.fg;
                if (this._writeCell(
                    asciiBuffer,
                    centerCol - 1 + col,
                    centerRow - 1 + row,
                    spriteCell.code,
                    fg,
                    spriteCell.bg,
                    spriteAlpha
                )) {
                    written += 1;
                }
            }
        }
        return written;
    }

    /* ══════════════════════════════════════════════════════════════════
       NETWORK SYNC
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Serializes the outbound movement packet. Field names match the
     * PLAYER_MOVE handler in server/index.js exactly.
     * @returns {{id: number, x: number, y: number, world: string, animationState: string}}
     */
    getNetworkState() {
        return {
            id: this.id,
            x: Math.round(this.x),
            y: Math.round(this.y),
            world: this._world,
            animationState: this.getAnimationState()
        };
    }

    /**
     * Applies an authoritative server correction. Teleports with an
     * interpolation snap and swaps forms when the server disagrees about
     * the active dimension — the client never argues back.
     * @param {Object} state Server state snapshot.
     * @param {number} state.x Authoritative x.
     * @param {number} state.y Authoritative y.
     * @param {string} [state.world] Authoritative dimension.
     * @returns {this}
     */
    applyServerCorrection(state) {
        if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) {
            throw new TypeError('[Player] correction requires finite x and y.');
        }
        if (state.world !== undefined && state.world !== this._world) {
            this.setWorld(state.world);
        }
        this.teleport(state.x, state.y);
        return this;
    }
}

export default Player;