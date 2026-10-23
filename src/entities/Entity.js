/**
 * @file src/entities/Entity.js
 * @module entities/Entity
 * @description
 * Foundational physical entity for "A Stitch in Time".
 * Entity is the concrete base class for every object that occupies world
 * space: players, NPCs, monsters, projectiles, pickups, doors, and quest
 * markers. It is deliberately NOT a stub: an out-of-the-box Entity is a
 * fully functional inert actor with position, velocity, collision bounds,
 * ASCII appearance, lifetime expiry, events, and buffer rendering. All
 * specialized behavior is added by overriding the documented extension
 * points and calling super — never by filling in empty methods.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INHERITANCE STRUCTURE
 * ───────────────────────────────────────────────────────────────────────────
 *   Entity                       position, velocity, bounds, appearance,
 *     │                          lifetime, events, interpolation, rendering
 *     ├── Player                 input intent, stamina, inventory hooks
 *     ├── NPC                    dialogue state machine, quest triggers
 *     ├── Monster                AI steering, boss phase machines
 *     ├── Projectile             bullet-hell trajectories, TTL, pierce
 *     └── Interactable           doors, chests, portals, spawners
 *
 * Subclass contract:
 *   1. constructor(options) MUST call super(options) before touching `this`.
 *   2. update(dt) SHOULD call super.update(dt) to advance physics, age,
 *      lifetime, flash timers, and world-bounds clamping. Call your
 *      intent-setting helpers (moveTowards, applyImpulse) BEFORE super so
 *      the new velocity integrates on the same tick.
 *   3. render(buffer, camera, alpha) SHOULD be inherited unchanged; override
 *      prepareAppearance(appearance, alpha) to animate glyphs/colors. The
 *      base render pipeline handles clipping, compositing, and debug boxes
 *      so subclasses never reimplement buffer plumbing.
 *   4. onCollision(other, contact) MAY be overridden; call super to keep
 *      the 'collision' event stream alive for quests and audio.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COORDINATE SYSTEM & UPDATE MATH
 * ───────────────────────────────────────────────────────────────────────────
 * All positions and velocities are WORLD-SPACE CSS PIXELS, not cells.
 * The origin is the map's top-left; +x is right, +y is DOWN (canvas
 * convention), so a facing angle of +π/2 points downward. Angles are
 * radians, counter-clockwise positive in math convention but visually
 * clockwise on screen because the y axis is flipped.
 *
 * Base integration is SEMI-IMPLICIT (symplectic) EULER at a fixed tick:
 *
 *   v' = v · e^(-friction·dt)                 exponential drag
 *   v' = clampMagnitude(v', maxSpeed)        stability / tunneling guard
 *   x' = x + v'x·dt
 *   y' = y + v'y·dt
 *
 * Updating velocity before position is what makes the damped motion
 * energy-stable at large ticks; explicit Euler would overshoot and jitter.
 * The exponential drag factor is frame-rate independent, matching the
 * Camera's pursuit damping and the WeatherSystem's wind relaxation.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ANCHORS & BOUNDING BOXES
 * ───────────────────────────────────────────────────────────────────────────
 * (x, y) is the entity's ANCHOR POINT. The collision box is derived from
 * the anchor and the anchor mode, so tall sprites can stand on a tile
 * without their feet drifting out of their hitbox:
 *
 *   CENTER         origin = (x - w/2, y - h/2)   default for actors
 *   BOTTOM_CENTER  origin = (x - w/2, y - h)     feet-anchored NPCs
 *   TOP_LEFT       origin = (x,      y)          UI-like objects / markers
 *
 * The AABB is { x: originX, y: originY, width: w, height: h } where x/y
 * are the MIN corner. Distance and range queries use the box CENTER,
 * which for CENTER anchors is exactly (x, y).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INTERPOLATION (GameLoop INTEGRATION)
 * ───────────────────────────────────────────────────────────────────────────
 * Every update() snapshots the pre-tick transform into previousX/Y/Angle.
 * The presentation layer passes the loop's interpolation alpha:
 *
 *   drawPos = lerp(previous, current, alpha)
 *   drawAngle = previousAngle + shortestAngleDelta(current - previous)·alpha
 *
 * This is INTERPOLATION, never extrapolation: the renderer only draws
 * positions the collision system actually validated. Teleports call
 * snapInterpolation() so a teleport never paints a streak across the map.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BUFFER INJECTION HOOK
 * ───────────────────────────────────────────────────────────────────────────
 * render(buffer, camera, alpha) converts the interpolated anchor from
 * world pixels to a buffer cell:
 *
 *   col = floor((renderX - camera.x) / cellWidth  + 0.5)
 *   row = floor((renderY - camera.y) / cellHeight + 0.5)
 *
 * The +0.5 snaps the anchor to the NEAREST cell center, since the anchor
 * denotes the middle of the glyph's logical footprint. Camera shake is
 * deliberately NOT added here: the Renderer applies shake as a transient
 * canvas translation, and adding it in two places would double-shake.
 *
 * Writes go through ASCIIBuffer.setChar so dirty tracking stays intact.
 * At partial opacity the entity color is composited source-over the
 * existing cell (dream phasing, fading corpses, ghost NPCs). zIndex is a
 * PAINTER-ORDER key consumed by WorldManager's entity sort; the ASCII
 * buffer itself has no depth channel, so render() never reorders cells.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLLISION MATH
 * ───────────────────────────────────────────────────────────────────────────
 * Discrete overlap uses strict AABB intersection (touching edges do NOT
 * collide). For fast projectiles, sweepsInto() performs an EXACT
 * continuous translating-AABB test via the Minkowski sum + slab method:
 *
 *   Expand the static box by the mover's size, then treat the mover's
 *   MIN corner as a point traveling with RELATIVE velocity:
 *
 *     expanded = { x: other.x - w, y: other.y - h,
 *                  width: other.w + w, height: other.h + h }
 *     p(t) = previousMin + (v_mover - v_other)·t·dt,  t ∈ [0, 1]
 *
 *   Slab intersection on each axis yields entry/exit intervals; the
 *   latest entry and earliest exit give the hit time and contact normal.
 *   This eliminates tunneling for bullets faster than a cell per tick.
 *
 * @example
 * class Scholar extends Entity {
 *     constructor(options) {
 *         super({ ...options, char: 'N', fgColor: '#66ccff', anchor: 'BOTTOM_CENTER' });
 *     }
 *     update(dt) {
 *         this.moveTowards(this.questTarget.x, this.questTarget.y, dt);
 *         super.update(dt); // integrates the intent set above
 *     }
 *     prepareAppearance(appearance, alpha) {
 *         super.prepareAppearance(appearance, alpha);
 *         if (Math.floor(this.age * 2) % 2 === 0) appearance.char = 0x6E; // 'n'
 *     }
 * }
 *
 * // WorldManager presentation pass:
 * entity.setCellMetrics(renderer.cellWidth, renderer.cellHeight);
 * entity.render(worldBuffer, camera, loop.getMetrics().interpolationAlpha);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS & ENUMS
   ══════════════════════════════════════════════════════════════════════════ */

/** Floating-point comparison epsilon for degenerate segments. */
const EPSILON = 1e-9;

/** Two pi, precomputed for angle normalization. */
const TWO_PI = Math.PI * 2;

/** Sanity ceiling for a single bounding-box dimension, CSS pixels. */
const MAX_ENTITY_DIMENSION = 65536;

/** Hard velocity magnitude clamp, CSS px/s (tunneling / blowup guard). */
const DEFAULT_MAX_SPEED = 4096;

/** Default turning rate for turnTowards(), radians/second. */
const DEFAULT_TURN_RATE = 8;

/** Default glyph metrics; Renderer font calibration overrides these. */
const DEFAULT_CELL_WIDTH = 9.6;
const DEFAULT_CELL_HEIGHT = 20;

/** Fallback packed colors used when an author supplies null. */
const DEFAULT_FG = 0xE0E0E0FF;
const TRANSPARENT_BG = 0x00000000;
const FLASH_FG = 0xFFFFFFFF;
const DEBUG_BOUNDS_FG = 0xFFC832FF;

/**
 * Painter-order layers consumed by WorldManager's entity sort.
 * The ASCII buffer has no depth channel; these values ONLY determine the
 * order in which systems call render(), never buffer storage.
 * @enum {number}
 */
export const ENTITY_LAYER = Object.freeze({
    BELOW_TERRAIN: -100,
    TERRAIN: 0,
    DECORATION: 10,
    ENTITY: 100,
    PLAYER: 200,
    PROJECTILE: 300,
    EFFECTS: 400,
    UI: 1000
});

/**
 * Anchor modes defining how the collision box attaches to (x, y).
 * @enum {string}
 */
export const ENTITY_ANCHOR = Object.freeze({
    CENTER: 'CENTER',
    BOTTOM_CENTER: 'BOTTOM_CENTER',
    TOP_LEFT: 'TOP_LEFT'
});

/**
 * Lifecycle states. Only ACTIVE entities participate in update/render;
 * EXPIRED entities remain queryable (corpses, spent pickups) until the
 * manager removes them; DESTROYED entities have released their listeners.
 * @enum {string}
 */
export const ENTITY_STATE = Object.freeze({
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    DESTROYED: 'DESTROYED'
});

/* ══════════════════════════════════════════════════════════════════════════
   MATH HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clamps a value into an inclusive range.
 * @param {number} value Input.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number}
 */
function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation. At t=0 returns a; at t=1 returns b.
 * @param {number} a Start.
 * @param {number} b End.
 * @param {number} t Phase [0, 1].
 * @returns {number}
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Normalizes an angle into [-π, π) using a double-modulo that is correct
 * for negative inputs (unlike a single JS % which preserves sign).
 * @param {number} angle Radians.
 * @returns {number} Equivalent angle in [-π, π).
 */
function normalizeAngle(angle) {
    return ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

/**
 * Interpolates along the SHORTEST arc between two angles. Taking the
 * raw lerp of, say, -3.0 and +3.0 radians would spin the entity through
 * nearly a full turn; the shortest-delta form rotates 0.28 radians the
 * other way, which is what the player expects.
 * @param {number} a Start angle, radians.
 * @param {number} b End angle, radians.
 * @param {number} t Phase [0, 1].
 * @returns {number} Interpolated, normalized angle.
 */
function lerpAngle(a, b, t) {
    return normalizeAngle(a + normalizeAngle(b - a) * t);
}

/**
 * Validates a finite numeric option, throwing a prefixed RangeError.
 * @param {number} value Candidate value.
 * @param {string} label Field name for diagnostics.
 * @returns {number} The validated value.
 */
function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new RangeError(`[Entity] ${label} must be a finite number; received ${value}.`);
    }
    return value;
}

/**
 * Reads an AABB from any duck-typed entity into a caller-provided box.
 * Prefers the allocation-free getBoundsInto protocol, falling back to a
 * plain `bounds` object for lightweight mock entities in tests.
 * LEAF FUNCTION: never calls other scratch-buffer helpers.
 * @param {Object} entity Candidate entity.
 * @param {{x:number,y:number,width:number,height:number}} out Destination.
 * @returns {?Object} The filled box, or null if the entity has no bounds.
 */
function readEntityBounds(entity, out) {
    if (!entity || typeof entity !== 'object') return null;
    if (typeof entity.getBoundsInto === 'function') {
        entity.getBoundsInto(out);
        return out;
    }
    const b = entity.bounds;
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y) &&
        Number.isFinite(b.width) && Number.isFinite(b.height)) {
        out.x = b.x;
        out.y = b.y;
        out.width = b.width;
        out.height = b.height;
        return out;
    }
    return null;
}

/* Module-level scratch boxes for leaf collision queries. These are safe
 * because readEntityBounds / getBoundsInto never call back into helpers
 * that reuse them. Never retain a reference to a scratch box. */
/** @type {{x:number,y:number,width:number,height:number}} */
const _boxA = { x: 0, y: 0, width: 0, height: 0 };
/** @type {{x:number,y:number,width:number,height:number}} */
const _boxB = { x: 0, y: 0, width: 0, height: 0 };
/** @type {{x:number,y:number}} */
const _renderPoint = { x: 0, y: 0 };
/** @type {{x:number,y:number,width:number,height:number}} */
const _sweepBox = { x: 0, y: 0, width: 0, height: 0 };
/** @type {{time:number,normalX:number,normalY:number}} */
const _sweepResult = { time: 0, normalX: 0, normalY: 0 };

/** Monotonic session-local entity id counter (network ids are separate). */
let NEXT_ENTITY_ID = 1;

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Minimal camera contract. The engine Camera satisfies this directly;
 * no import is required, which keeps the entity layer dependency-free.
 * @typedef {Object} EntityCamera
 * @property {number} x Camera top-left x, world CSS pixels.
 * @property {number} y Camera top-left y, world CSS pixels.
 * @property {number} [cellWidth] Glyph advance; overrides entity metrics.
 * @property {number} [cellHeight] Row pitch; overrides entity metrics.
 */

/**
 * Axis-aligned bounding box with a MIN-corner origin.
 * @typedef {Object} AABB
 * @property {number} x Left edge, world CSS pixels.
 * @property {number} y Top edge, world CSS pixels.
 * @property {number} width Box width, CSS pixels.
 * @property {number} height Box height, CSS pixels.
 */

/**
 * Continuous collision contact report.
 * @typedef {Object} SweepContact
 * @property {number} time Fraction of the tick at first contact [0, 1].
 * @property {number} normalX Contact normal x (-1, 0, or 1).
 * @property {number} normalY Contact normal y (-1, 0, or 1).
 */

/* ══════════════════════════════════════════════════════════════════════════
   ENTITY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Concrete base class for all physical world entities. See the file
 * header for the inheritance contract and the math behind integration,
 * anchoring, interpolation, and swept collision.
 */
export class Entity {
    /**
     * @param {Object} [options]
     * @param {number} [options.x=0] Anchor x, world CSS pixels.
     * @param {number} [options.y=0] Anchor y, world CSS pixels.
     * @param {number} [options.vx=0] Velocity x, CSS px/s.
     * @param {number} [options.vy=0] Velocity y, CSS px/s.
     * @param {number} [options.speed=0] Authored movement speed, CSS px/s.
     * @param {number} [options.maxSpeed=4096] Hard velocity magnitude cap.
     * @param {number} [options.friction=0] Exponential drag coefficient (1/s).
     * @param {number} [options.width=16] Collision box width, CSS pixels.
     * @param {number} [options.height=16] Collision box height, CSS pixels.
     * @param {number} [options.angle=0] Facing angle, radians.
     * @param {number} [options.angularVelocity=0] Spin, radians/s.
     * @param {number} [options.turnRate=8] turnTowards max rate, radians/s.
     * @param {string|number} [options.char='@'] Glyph string or code point.
     * @param {string|number|null} [options.fgColor] Foreground color.
     * @param {string|number|null} [options.bgColor] Background color.
     * @param {number} [options.zIndex=100] Painter-order layer.
     * @param {number} [options.alpha=1] Entity opacity [0, 1].
     * @param {string} [options.anchor='CENTER'] ENTITY_ANCHOR mode.
     * @param {number} [options.lifetime=Infinity] Seconds until expiry.
     * @param {boolean} [options.visible=true] Render gate.
     * @param {string[]} [options.tags=[]] Query tags.
     * @param {string} [options.name='entity'] Human-readable name.
     * @param {Object} [options.meta={}] Author/quest metadata.
     * @param {AABB} [options.worldBounds] Optional clamping region.
     * @param {number} [options.cellWidth=9.6] Glyph advance, CSS pixels.
     * @param {number} [options.cellHeight=20] Row pitch, CSS pixels.
     * @throws {TypeError|RangeError} If any option is malformed.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[Entity] options must be an object.');
        }

        /* ---- Identity ------------------------------------------------ */
        /** @type {number} Session-local unique id. */
        this._id = NEXT_ENTITY_ID++;
        /** @type {string} */
        this._name = typeof options.name === 'string' ? options.name : 'entity';
        /** @type {Object} Mutable quest/component metadata. */
        this._meta = options.meta && typeof options.meta === 'object' ? { ...options.meta } : {};
        /** @type {Set<string>} */
        this._tags = new Set();
        if (options.tags !== undefined) {
            if (!Array.isArray(options.tags)) {
                throw new TypeError('[Entity] tags must be an array of strings.');
            }
            for (const tag of options.tags) {
                if (typeof tag !== 'string') throw new TypeError('[Entity] tags must be strings.');
                this._tags.add(tag);
            }
        }

        /* ---- Transform ----------------------------------------------- */
        this._x = requireFinite(options.x ?? 0, 'x');
        this._y = requireFinite(options.y ?? 0, 'y');
        this._vx = requireFinite(options.vx ?? 0, 'vx');
        this._vy = requireFinite(options.vy ?? 0, 'vy');
        this._speed = requireFinite(options.speed ?? 0, 'speed');
        if (this._speed < 0) throw new RangeError('[Entity] speed must be >= 0.');
        this._maxSpeed = requireFinite(options.maxSpeed ?? DEFAULT_MAX_SPEED, 'maxSpeed');
        if (this._maxSpeed <= 0) throw new RangeError('[Entity] maxSpeed must be > 0.');
        this._friction = requireFinite(options.friction ?? 0, 'friction');
        if (this._friction < 0) throw new RangeError('[Entity] friction must be >= 0.');

        this._width = requireFinite(options.width ?? 16, 'width');
        this._height = requireFinite(options.height ?? 16, 'height');
        if (this._width <= 0 || this._height <= 0 ||
            this._width > MAX_ENTITY_DIMENSION || this._height > MAX_ENTITY_DIMENSION) {
            throw new RangeError(
                `[Entity] width/height must be in (0, ${MAX_ENTITY_DIMENSION}]; ` +
                `received ${this._width}×${this._height}.`
            );
        }

        const anchor = options.anchor ?? ENTITY_ANCHOR.CENTER;
        if (!Object.values(ENTITY_ANCHOR).includes(anchor)) {
            throw new RangeError(`[Entity] Unknown anchor mode: ${anchor}.`);
        }
        /** @type {string} */
        this._anchor = anchor;

        this._angle = normalizeAngle(requireFinite(options.angle ?? 0, 'angle'));
        this._angularVelocity = requireFinite(options.angularVelocity ?? 0, 'angularVelocity');
        this._turnRate = requireFinite(options.turnRate ?? DEFAULT_TURN_RATE, 'turnRate');
        if (this._turnRate < 0) throw new RangeError('[Entity] turnRate must be >= 0.');

        /* Previous transform for GameLoop interpolation. */
        /** @type {number} */ this._previousX = this._x;
        /** @type {number} */ this._previousY = this._y;
        /** @type {number} */ this._previousAngle = this._angle;

        /* ---- Appearance ---------------------------------------------- */
        this._charCode = this._coerceCharCode(options.char ?? '@');
        /** @type {number} Packed RGBA; null foreground → engine default. */
        this._fgPacked = ASCIIBuffer.packColor(options.fgColor ?? null, DEFAULT_FG);
        /** @type {number} Packed RGBA; null background → transparent. */
        this._bgPacked = ASCIIBuffer.packColor(options.bgColor ?? null, TRANSPARENT_BG);
        this._zIndex = requireFinite(options.zIndex ?? ENTITY_LAYER.ENTITY, 'zIndex');
        this._alpha = clamp(options.alpha ?? 1, 0, 1);
        this._visible = Boolean(options.visible ?? true);

        /* Hit-flash transient (advanced in update, read in render). */
        /** @type {number} */ this._flashRemaining = 0;
        /** @type {number} */ this._flashDuration = 0;
        /** @type {number} */ this._flashFg = FLASH_FG;
        /** @type {boolean} */ this._showBounds = false;
        /** @type {number} */ this._debugFg = DEBUG_BOUNDS_FG;

        /* Reusable appearance record filled by prepareAppearance. */
        /** @type {{char:number,fg:number,bg:number,alpha:number}} */
        this._appearance = { char: this._charCode, fg: this._fgPacked, bg: this._bgPacked, alpha: 1 };

        /* ---- Metrics & bounds ---------------------------------------- */
        this.setCellMetrics(
            options.cellWidth ?? DEFAULT_CELL_WIDTH,
            options.cellHeight ?? DEFAULT_CELL_HEIGHT
        );
        /** @type {?AABB} */
        this._worldBounds = null;
        if (options.worldBounds !== undefined && options.worldBounds !== null) {
            this.setWorldBounds(options.worldBounds);
        }

        /* ---- Lifecycle ----------------------------------------------- */
        /** @type {string} */
        this._state = ENTITY_STATE.ACTIVE;
        /** @type {number} */
        this._age = 0;
        const lifetime = options.lifetime ?? Infinity;
        if (lifetime !== Infinity && (!Number.isFinite(lifetime) || lifetime <= 0)) {
            throw new RangeError('[Entity] lifetime must be positive or Infinity.');
        }
        /** @type {number} */
        this._lifetime = lifetime;

        /* ---- Events --------------------------------------------------- */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /* ══════════════════════════════════════════════════════════════════
       IDENTITY & METADATA
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {number} Session-local entity id. */
    get id() { return this._id; }
    /** @returns {string} Human-readable name. */
    get name() { return this._name; }
    /** @returns {Object} Mutable metadata bag for quests/components. */
    get meta() { return this._meta; }

    /**
     * Stores a metadata value (quest flags, dialogue ids, spawn source).
     * @param {string} key Metadata key.
     * @param {*} value Any JSON-serializable value.
     * @returns {this}
     */
    setData(key, value) {
        if (typeof key !== 'string') throw new TypeError('[Entity] metadata key must be a string.');
        this._meta[key] = value;
        return this;
    }

    /**
     * Reads a metadata value.
     * @param {string} key Metadata key.
     * @param {*} [fallback=null] Value returned when the key is absent.
     * @returns {*}
     */
    getData(key, fallback = null) {
        return Object.prototype.hasOwnProperty.call(this._meta, key) ? this._meta[key] : fallback;
    }

    /** @returns {string[]} Snapshot of query tags (allocates). */
    get tags() { return [...this._tags]; }
    /** @param {string} tag Tag to add. @returns {this} */
    addTag(tag) { this._tags.add(tag); return this; }
    /** @param {string} tag Tag to remove. @returns {this} */
    removeTag(tag) { this._tags.delete(tag); return this; }
    /** @param {string} tag Tag to test. @returns {boolean} */
    hasTag(tag) { return this._tags.has(tag); }

    /**
     * Resets the session id counter. TEST-ONLY: lets unit suites assert
     * stable ids. Never call in a live world — ids must stay unique.
     * @param {number} [start=1] Positive integer starting id.
     * @returns {void}
     */
    static resetIdCounter(start = 1) {
        if (!Number.isInteger(start) || start < 1) {
            throw new RangeError('[Entity] id counter start must be a positive integer.');
        }
        NEXT_ENTITY_ID = start;
    }

    /* ══════════════════════════════════════════════════════════════════
       TRANSFORM & INTERPOLATION
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {number} Anchor x, world CSS pixels. */
    get x() { return this._x; }
    /** @returns {number} Anchor y, world CSS pixels. */
    get y() { return this._y; }
    /** @returns {number} Velocity x, CSS px/s. */
    get vx() { return this._vx; }
    /** @returns {number} Velocity y, CSS px/s. */
    get vy() { return this._vy; }
    /** @returns {number} Authored movement speed, CSS px/s. */
    get speed() { return this._speed; }
    /** @returns {number} Facing angle, radians. */
    get angle() { return this._angle; }
    /** @returns {number} Pre-tick anchor x (interpolation source). */
    get previousX() { return this._previousX; }
    /** @returns {number} Pre-tick anchor y (interpolation source). */
    get previousY() { return this._previousY; }

    /**
     * Sets the anchor position. Does NOT dispatch an event: use teleport()
     * for authoritative repositioning that systems should observe.
     * @param {number} x New anchor x.
     * @param {number} y New anchor y.
     * @param {boolean} [snap=true] Reset interpolation to avoid streaks.
     * @returns {this}
     */
    setPosition(x, y, snap = true) {
        requireFinite(x, 'x');
        requireFinite(y, 'y');
        this._x = x;
        this._y = y;
        if (snap) this.snapInterpolation();
        return this;
    }

    /**
     * Teleports and notifies listeners. Used for Dream↔Drab shifts,
     * respawns, and server reconciliation corrections.
     * @param {number} x Destination x.
     * @param {number} y Destination y.
     * @returns {this}
     */
    teleport(x, y) {
        const previousX = this._x;
        const previousY = this._y;
        this.setPosition(x, y, true);
        this._dispatch('teleport', { x, y, previousX, previousY, id: this._id });
        return this;
    }

    /**
     * Aligns the previous transform with the current one. Call after any
     * direct position mutation (authoritative correction, map load) so
     * the next interpolated frame does not lerp across the world.
     * @returns {this}
     */
    snapInterpolation() {
        this._previousX = this._x;
        this._previousY = this._y;
        this._previousAngle = this._angle;
        return this;
    }

    /**
     * Interpolated render position. Pure: never mutates entity state, so
     * it is safe to call from debug overlays and multiple render passes.
     * @param {number} [alpha=1] GameLoop interpolation phase [0, 1].
     * @param {{x:number,y:number}} [out] Optional scratch destination.
     * @returns {{x:number,y:number}} Interpolated world position.
     */
    getRenderPosition(alpha = 1, out = null) {
        const t = Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1;
        const target = out ?? { x: 0, y: 0 };
        target.x = lerp(this._previousX, this._x, t);
        target.y = lerp(this._previousY, this._y, t);
        return target;
    }

    /**
     * Interpolated facing angle along the shortest arc.
     * @param {number} [alpha=1] Interpolation phase.
     * @returns {number} Radians in [-π, π).
     */
    getRenderAngle(alpha = 1) {
        const t = Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1;
        return lerpAngle(this._previousAngle, this._angle, t);
    }

    /**
     * Sets the authored movement speed and rescales any existing velocity
     * to match, so walking-speed changes feel continuous rather than
     * snapping the actor to a new magnitude on the next input.
     * @param {number} speed Non-negative CSS px/s.
     * @returns {this}
     */
    setSpeed(speed) {
        requireFinite(speed, 'speed');
        if (speed < 0) throw new RangeError('[Entity] speed must be >= 0.');
        const magnitude = Math.hypot(this._vx, this._vy);
        this._speed = speed;
        if (magnitude > EPSILON) {
            const scale = speed / magnitude;
            this._vx *= scale;
            this._vy *= scale;
        } else {
            this._vx = 0;
            this._vy = 0;
        }
        return this;
    }

    /**
     * Sets velocity from a polar intent: angle in radians, speed in
     * CSS px/s. Defaults to the authored speed. +y is down, so π/2 aims
     * the entity toward the bottom of the screen.
     * @param {number} angle Radians.
     * @param {number} [speed=this._speed] Magnitude, CSS px/s.
     * @returns {this}
     */
    setVelocityFromAngle(angle, speed = this._speed) {
        requireFinite(angle, 'angle');
        requireFinite(speed, 'speed');
        this._vx = Math.cos(angle) * speed;
        this._vy = Math.sin(angle) * speed;
        return this;
    }

    /**
     * Adds an instantaneous velocity change (knockback, dash, explosion).
     * Massless convention: impulse is expressed directly in px/s. Subclasses
     * with mass should divide by mass before calling. The maxSpeed clamp in
     * update() bounds the result on the following tick.
     * @param {number} ix Velocity delta x, CSS px/s.
     * @param {number} iy Velocity delta y, CSS px/s.
     * @returns {this}
     */
    applyImpulse(ix, iy) {
        requireFinite(ix, 'impulse x');
        requireFinite(iy, 'impulse y');
        this._vx += ix;
        this._vy += iy;
        return this;
    }

    /**
     * Zeroes linear velocity. Does not clear authored speed or facing.
     * @returns {this}
     */
    stop() {
        this._vx = 0;
        this._vy = 0;
        return this;
    }

    /**
     * Seek-with-arrival steering. Sets velocity intent toward a world
     * point, decelerating inside the arrival radius so the actor settles
     * instead of orbiting the target. Call BEFORE super.update(dt).
     *
     * Arrival cap: desiredSpeed = min(speed, distance / dt). Dividing the
     * remaining distance by the tick length guarantees the actor cannot
     * overshoot the target in a single integration step.
     *
     * @param {number} targetX Target world x.
     * @param {number} targetY Target world y.
     * @param {number} dt Tick seconds (must be > 0).
     * @param {Object} [options]
     * @param {number} [options.arrivalRadius=1] Stop distance, CSS px.
     * @param {boolean} [options.instantFacing=true] Snap facing to travel.
     * @returns {boolean} True when already within the arrival radius.
     */
    moveTowards(targetX, targetY, dt, options = {}) {
        requireFinite(targetX, 'targetX');
        requireFinite(targetY, 'targetY');
        if (!Number.isFinite(dt) || dt <= 0) return false;
        const radius = options.arrivalRadius ?? 1;
        const dx = targetX - this._x;
        const dy = targetY - this._y;
        const distance = Math.hypot(dx, dy);
        if (distance <= radius) {
            this.stop();
            return true;
        }
        if (this._speed <= 0) return false;
        const desired = Math.min(this._speed, distance / dt);
        this._vx = (dx / distance) * desired;
        this._vy = (dy / distance) * desired;
        const heading = Math.atan2(dy, dx);
        if (options.instantFacing !== false) {
            this._angle = normalizeAngle(heading);
        } else {
            this.turnTowards(heading, dt);
        }
        return false;
    }

    /**
     * Snaps facing toward a world point.
     * @param {number} targetX World x.
     * @param {number} targetY World y.
     * @returns {this}
     */
    facePoint(targetX, targetY) {
        this._angle = normalizeAngle(Math.atan2(targetY - this._y, targetX - this._x));
        return this;
    }

    /**
     * Rotates toward a target angle at a bounded rate along the shortest
     * arc. Used for turning monsters and wind-up boss telegraphs.
     * @param {number} targetAngle Target radians.
     * @param {number} dt Tick seconds.
     * @param {number} [turnRate=this._turnRate] Max radians/second.
     * @returns {this}
     */
    turnTowards(targetAngle, dt, turnRate = this._turnRate) {
        if (!Number.isFinite(dt) || dt <= 0 || turnRate < 0) return this;
        const delta = normalizeAngle(targetAngle - this._angle);
        const maxStep = turnRate * dt;
        this._angle = Math.abs(delta) <= maxStep
            ? normalizeAngle(targetAngle)
            : normalizeAngle(this._angle + Math.sign(delta) * maxStep);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       BOUNDING BOX & ANCHOR MATH
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {number} Collision width, CSS px. */
    get width() { return this._width; }
    /** @returns {number} Collision height, CSS px. */
    get height() { return this._height; }
    /** @returns {string} Anchor mode. */
    get anchor() { return this._anchor; }

    /**
     * Horizontal offset from anchor to box MIN corner.
     * CENTER/BOTTOM_CENTER center the box on x; TOP_LEFT aligns it.
     * @returns {number}
     * @private
     */
    _anchorOffsetX() {
        return this._anchor === ENTITY_ANCHOR.TOP_LEFT ? 0 : -this._width / 2;
    }

    /**
     * Vertical offset from anchor to box MIN corner.
     * CENTER centers vertically; BOTTOM_CENTER puts the anchor at the feet.
     * @returns {number}
     * @private
     */
    _anchorOffsetY() {
        if (this._anchor === ENTITY_ANCHOR.TOP_LEFT) return 0;
        return this._anchor === ENTITY_ANCHOR.BOTTOM_CENTER ? -this._height : -this._height / 2;
    }

    /** @returns {number} Box center x (distance-query reference). */
    get centerX() { return this._x + this._anchorOffsetX() + this._width / 2; }
    /** @returns {number} Box center y. */
    get centerY() { return this._y + this._anchorOffsetY() + this._height / 2; }
    /** @returns {number} Left edge. */
    get left() { return this._x + this._anchorOffsetX(); }
    /** @returns {number} Top edge. */
    get top() { return this._y + this._anchorOffsetY(); }
    /** @returns {number} Right edge (exclusive). */
    get right() { return this.left + this._width; }
    /** @returns {number} Bottom edge (exclusive). */
    get bottom() { return this.top + this._height; }

    /**
     * Fills a caller-provided AABB. ALLOCATION-FREE: the preferred form
     * for collision sweeps and spatial-index queries.
     * @param {{x:number,y:number,width:number,height:number}} out Destination.
     * @returns {Object} The same out object, filled.
     */
    getBoundsInto(out) {
        out.x = this._x + this._anchorOffsetX();
        out.y = this._y + this._anchorOffsetY();
        out.width = this._width;
        out.height = this._height;
        return out;
    }

    /**
     * Allocating AABB snapshot for debug tooling and event payloads.
     * Prefer getBoundsInto in hot loops.
     * @returns {AABB}
     */
    getBounds() {
        return {
            x: this._x + this._anchorOffsetX(),
            y: this._y + this._anchorOffsetY(),
            width: this._width,
            height: this._height
        };
    }

    /**
     * Interpolated bounding box for presentation-side hit overlays.
     * @param {number} [alpha=1] Interpolation phase.
     * @param {AABB} [out] Optional scratch destination.
     * @returns {AABB}
     */
    getRenderBounds(alpha = 1, out = null) {
        const pos = this.getRenderPosition(alpha, _renderPoint);
        const target = out ?? { x: 0, y: 0, width: 0, height: 0 };
        target.x = pos.x + this._anchorOffsetX();
        target.y = pos.y + this._anchorOffsetY();
        target.width = this._width;
        target.height = this._height;
        return target;
    }

    /**
     * Sets the world clamping region. Accepts a min-corner AABB or a
     * {minX,minY,maxX,maxY} rectangle. Pass null to disable clamping.
     * @param {?Object} bounds Region, or null.
     * @returns {this}
     */
    setWorldBounds(bounds) {
        if (bounds === null || bounds === undefined) {
            this._worldBounds = null;
            return this;
        }
        let x, y, width, height;
        if (Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
            x = bounds.x; y = bounds.y; width = bounds.width; height = bounds.height;
        } else if (Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
            x = bounds.minX; y = bounds.minY;
            width = bounds.maxX - bounds.minX; height = bounds.maxY - bounds.minY;
        } else {
            throw new TypeError('[Entity] worldBounds needs x/y/width/height or minX/maxX/minY/maxY.');
        }
        requireFinite(x, 'bounds.x');
        requireFinite(y, 'bounds.y');
        requireFinite(width, 'bounds.width');
        requireFinite(height, 'bounds.height');
        if (width <= 0 || height <= 0) {
            throw new RangeError('[Entity] worldBounds dimensions must be positive.');
        }
        this._worldBounds = Object.freeze({ x, y, width, height });
        return this;
    }

    /** @returns {?AABB} Active world clamping region. */
    get worldBounds() { return this._worldBounds; }

    /* ══════════════════════════════════════════════════════════════════
       COLLISION & DISTANCE UTILITIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Strict AABB intersection: touching edges do NOT count as overlap.
     * Purely geometric — ignores lifecycle state, so the manager can
     * filter active entities itself. Allocation-free.
     * @param {Object} other Entity or anything exposing getBoundsInto/bounds.
     * @returns {boolean}
     */
    collidesWith(other) {
        if (!other || other === this) return false;
        this.getBoundsInto(_boxA);
        if (!readEntityBounds(other, _boxB)) return false;
        return _boxA.x < _boxB.x + _boxB.width &&
            _boxA.x + _boxA.width > _boxB.x &&
            _boxA.y < _boxB.y + _boxB.height &&
            _boxA.y + _boxA.height > _boxB.y;
    }

    /**
     * Tests overlap against a raw AABB (map tiles, trigger volumes).
     * @param {AABB} box Axis-aligned box with min-corner origin.
     * @returns {boolean}
     */
    collidesWithBox(box) {
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) ||
            !Number.isFinite(box.width) || !Number.isFinite(box.height)) return false;
        this.getBoundsInto(_boxA);
        return _boxA.x < box.x + box.width &&
            _boxA.x + _boxA.width > box.x &&
            _boxA.y < box.y + box.height &&
            _boxA.y + _boxA.height > box.y;
    }

    /**
     * Static pairwise overlap for spatial indexes and batch sweeps.
     * @param {Object} a First entity.
     * @param {Object} b Second entity.
     * @returns {boolean}
     */
    static collides(a, b) {
        if (!a || !b || a === b) return false;
        if (!readEntityBounds(a, _boxA) || !readEntityBounds(b, _boxB)) return false;
        return _boxA.x < _boxB.x + _boxB.width &&
            _boxA.x + _boxA.width > _boxB.x &&
            _boxA.y < _boxB.y + _boxB.height &&
            _boxA.y + _boxA.height > _boxB.y;
    }

    /**
     * Euclidean distance between box centers. A plain {x,y} object is
     * treated as a world point. Null/undefined targets return Infinity
     * (safe "unreachable" sentinel for AI steering).
     * @param {Object} target Entity or world point.
     * @returns {number} CSS pixels.
     */
    distanceTo(target) {
        return Math.sqrt(this.distanceSquaredTo(target));
    }

    /**
     * Squared center distance. Use this for range comparisons: comparing
     * d² against r² avoids a sqrt per candidate in bullet-hell sweeps.
     * @param {Object} target Entity or world point.
     * @returns {number} Squared CSS pixels.
     */
    distanceSquaredTo(target) {
        if (target === null || target === undefined) return Infinity;
        let tx, ty;
        if (Number.isFinite(target.centerX) && Number.isFinite(target.centerY)) {
            tx = target.centerX; ty = target.centerY;
        } else if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
            tx = target.x; ty = target.y;
        } else {
            throw new TypeError('[Entity] distance target must be an entity or {x,y} point.');
        }
        const dx = tx - this.centerX;
        const dy = ty - this.centerY;
        return dx * dx + dy * dy;
    }

    /**
     * Inclusive range test using squared distance (no sqrt).
     * @param {Object} target Entity or world point.
     * @param {number} radius Range in CSS pixels (>= 0).
     * @returns {boolean}
     */
    isWithinRange(target, radius) {
        if (!Number.isFinite(radius) || radius < 0) return false;
        return this.distanceSquaredTo(target) <= radius * radius;
    }

    /**
     * Minimum translation vector separating two overlapping boxes.
     * Chooses the axis of least penetration; the normal points from the
     * other entity toward this one. Coincident centers resolve along +x
     * deterministically. Returns null when disjoint.
     * @param {Object} other Entity to separate from.
     * @returns {?{x:number,y:number,depth:number,axis:string}} MTV.
     */
    computeSeparation(other) {
        if (!other || other === this) return null;
        this.getBoundsInto(_boxA);
        if (!readEntityBounds(other, _boxB)) return null;
        const overlapX = Math.min(_boxA.x + _boxA.width, _boxB.x + _boxB.width) -
            Math.max(_boxA.x, _boxB.x);
        const overlapY = Math.min(_boxA.y + _boxA.height, _boxB.y + _boxB.height) -
            Math.max(_boxA.y, _boxB.y);
        if (overlapX <= 0 || overlapY <= 0) return null;
        if (overlapX < overlapY) {
            const sign = this.centerX >= _boxB.x + _boxB.width / 2 ? 1 : -1;
            return { x: sign * overlapX, y: 0, depth: overlapX, axis: 'x' };
        }
        const sign = this.centerY >= _boxB.y + _boxB.height / 2 ? 1 : -1;
        return { x: 0, y: sign * overlapY, depth: overlapY, axis: 'y' };
    }

    /**
     * Resolves an overlap by applying the MTV, split by `share`. This
     * entity moves by share·MTV; the other moves by -(1-share)·MTV if it
     * exposes setPosition. Both interpolate cleanly afterward. Does NOT
     * dispatch collision events — the manager calls onCollision once for
     * the pair, avoiding double notifications.
     * @param {Object} other Entity to separate from.
     * @param {number} [share=0.5] This entity's fraction of the push [0,1].
     * @returns {boolean} True if an overlap was resolved.
     */
    resolveCollision(other, share = 0.5) {
        if (!Number.isFinite(share) || share < 0 || share > 1) {
            throw new RangeError('[Entity] resolve share must be in [0, 1].');
        }
        const mtv = this.computeSeparation(other);
        if (!mtv) return false;
        this.setPosition(this._x + mtv.x * share, this._y + mtv.y * share, true);
        if (other && typeof other.setPosition === 'function' &&
            Number.isFinite(other.x) && Number.isFinite(other.y)) {
            other.setPosition(other.x - mtv.x * (1 - share), other.y - mtv.y * (1 - share), true);
        }
        return true;
    }

    /**
     * Exact continuous collision test for translating AABBs over one
     * tick. Uses the Minkowski sum + slab method (see file header) so a
     * projectile moving hundreds of px per tick cannot skip a target.
     * Reads the PREVIOUS position as the segment start, matching the
     * interval the last update() actually integrated.
     * @param {Object} other Target entity (vx/vy optional).
     * @param {number} dt Tick seconds.
     * @param {SweepContact} [out] Optional scratch contact record.
     * @returns {?SweepContact} First contact, or null.
     */
    sweepsInto(other, dt, out = null) {
        if (!other || other === this || !Number.isFinite(dt) || dt <= 0) return null;
        if (!readEntityBounds(other, _boxB)) return null;
        const offX = this._anchorOffsetX();
        const offY = this._anchorOffsetY();
        const px = this._previousX + offX;
        const py = this._previousY + offY;
        const rvx = this._vx - (Number.isFinite(other.vx) ? other.vx : 0);
        const rvy = this._vy - (Number.isFinite(other.vy) ? other.vy : 0);
        /* Minkowski expansion: mover's min corner becomes a point. */
        _sweepBox.x = _boxB.x - this._width;
        _sweepBox.y = _boxB.y - this._height;
        _sweepBox.width = _boxB.width + this._width;
        _sweepBox.height = _boxB.height + this._height;
        return Entity.segmentIntersectsBox(
            px, py, px + rvx * dt, py + rvy * dt, _sweepBox, out ?? _sweepResult
        );
    }

    /**
     * Slab-method segment/AABB intersection.
     *
     * For each axis, project the segment onto the axis and intersect the
     * resulting [entry, exit] interval with the running [tMin, tMax].
     * Parallel segments test containment instead of dividing by zero.
     * The latest entry is the first contact; its axis supplies the
     * contact normal. A segment starting inside reports time 0 with a
     * zero normal, signaling penetration (resolve with computeSeparation).
     *
     * @param {number} x0 Segment start x.
     * @param {number} y0 Segment start y.
     * @param {number} x1 Segment end x.
     * @param {number} y1 Segment end y.
     * @param {AABB} box Target box (min-corner origin).
     * @param {SweepContact} [out] Optional scratch destination.
     * @returns {?SweepContact} Contact with time ∈ [0,1], or null.
     */
    static segmentIntersectsBox(x0, y0, x1, y1, box, out = null) {
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) ||
            !Number.isFinite(box.width) || !Number.isFinite(box.height)) return null;
        const dx = x1 - x0;
        const dy = y1 - y0;
        let tMin = -Infinity;
        let tMax = Infinity;
        let normalX = 0;
        let normalY = 0;

        /* X slab. */
        if (Math.abs(dx) < EPSILON) {
            if (x0 < box.x || x0 > box.x + box.width) return null;
        } else {
            let t1 = (box.x - x0) / dx;
            let t2 = (box.x + box.width - x0) / dx;
            let sign = -1;
            if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; sign = 1; }
            if (t1 > tMin) { tMin = t1; normalX = sign; normalY = 0; }
            tMax = Math.min(tMax, t2);
        }

        /* Y slab. */
        if (Math.abs(dy) < EPSILON) {
            if (y0 < box.y || y0 > box.y + box.height) return null;
        } else {
            let t1 = (box.y - y0) / dy;
            let t2 = (box.y + box.height - y0) / dy;
            let sign = -1;
            if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; sign = 1; }
            if (t1 > tMin) { tMin = t1; normalX = 0; normalY = sign; }
            tMax = Math.min(tMax, t2);
        }

        if (tMin > tMax || tMax < 0 || tMin > 1) return null;
        const result = out ?? { time: 0, normalX: 0, normalY: 0 };
        if (tMin < 0) {
            /* Already penetrating at tick start. */
            result.time = 0;
            result.normalX = 0;
            result.normalY = 0;
        } else {
            result.time = tMin;
            result.normalX = normalX;
            result.normalY = normalY;
        }
        return result;
    }

    /**
     * Collision hook invoked by the manager after resolution. Base
     * implementation broadcasts the 'collision' event; overrides SHOULD
     * call super to preserve quest/audio subscriptions.
     * @param {Object} other The other entity.
     * @param {?SweepContact} [contact] Continuous contact, if available.
     * @returns {void}
     */
    onCollision(other, contact = null) {
        this._dispatch('collision', {
            id: this._id,
            otherId: other?.id ?? null,
            other,
            normalX: contact?.normalX ?? 0,
            normalY: contact?.normalY ?? 0,
            time: contact?.time ?? 0
        });
    }

    /* ══════════════════════════════════════════════════════════════════
       APPEARANCE CONFIGURATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Coerces an author-facing glyph (string or code point) to a single
     * Unicode code point. Multi-character strings are rejected rather
     * than silently truncated, which would corrupt the grid alignment.
     * @param {string|number} value Glyph.
     * @returns {number} Code point.
     * @private
     */
    _coerceCharCode(value) {
        if (typeof value === 'number') {
            if (!Number.isInteger(value) || value < 0 || value > 0x10FFFF) {
                throw new RangeError('[Entity] char code point must be in [0, 0x10FFFF].');
            }
            return value;
        }
        if (typeof value !== 'string' || Array.from(value).length !== 1) {
            throw new TypeError('[Entity] char must be a single character or code point.');
        }
        return value.codePointAt(0);
    }

    /** @returns {string} Glyph as a single-character string. */
    get char() { return String.fromCodePoint(this._charCode); }
    /** @returns {number} Glyph as a Unicode code point. */
    get glyphCode() { return this._charCode; }
    /**
     * Sets the glyph.
     * @param {string|number} value Single character or code point.
     * @returns {this}
     */
    set char(value) { this._charCode = this._coerceCharCode(value); }

    /** @returns {number} Packed foreground RGBA (engine color contract). */
    get fgColor() { return this._fgPacked; }
    /** @param {string|number|null} value CSS color, packed int, or null. */
    set fgColor(value) { this._fgPacked = ASCIIBuffer.packColor(value, DEFAULT_FG); }
    /** @returns {number} Packed background RGBA. */
    get bgColor() { return this._bgPacked; }
    /** @param {string|number|null} value CSS color, packed int, or null. */
    set bgColor(value) { this._bgPacked = ASCIIBuffer.packColor(value, TRANSPARENT_BG); }

    /** @returns {number} Painter-order layer key. */
    get zIndex() { return this._zIndex; }
    /** @param {number} value Layer key (may be fractional for tie-breaks). */
    set zIndex(value) { this._zIndex = requireFinite(value, 'zIndex'); }
    /** @returns {number} Entity opacity [0,1]. */
    get alpha() { return this._alpha; }
    /** @param {number} value Opacity, clamped into [0,1]. */
    set alpha(value) { this._alpha = clamp(requireFinite(value, 'alpha'), 0, 1); }
    /** @returns {boolean} Render gate. */
    get visible() { return this._visible; }
    /** @param {boolean} value Render gate. */
    set visible(value) { this._visible = Boolean(value); }

    /**
     * Sets glyph metrics after Renderer font recalibration. Mirrors
     * Camera.setCellMetrics so picking and rendering agree on grid space.
     * @param {number} cellWidth Glyph advance, CSS px.
     * @param {number} cellHeight Row pitch, CSS px.
     * @returns {this}
     */
    setCellMetrics(cellWidth, cellHeight) {
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
            throw new RangeError('[Entity] cellWidth must be positive.');
        }
        if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
            throw new RangeError('[Entity] cellHeight must be positive.');
        }
        this._cellW = cellWidth;
        this._cellH = cellHeight;
        return this;
    }

    /**
     * Arms a hit-flash. The timer advances in update(), so render stays
     * pure and safe to call from multiple presentation passes.
     * @param {number} duration Flash duration, seconds (>= 0).
     * @param {string|number} [color='#ffffff'] Flash foreground.
     * @returns {this}
     */
    flash(duration, color = '#ffffff') {
        if (!Number.isFinite(duration) || duration < 0) {
            throw new RangeError('[Entity] flash duration must be >= 0.');
        }
        this._flashDuration = duration;
        this._flashRemaining = duration;
        this._flashFg = ASCIIBuffer.packColor(color, FLASH_FG);
        return this;
    }

    /** @returns {number} Remaining flash time, seconds. */
    get flashRemaining() { return this._flashRemaining; }
    /** @returns {boolean} True while a hit-flash is active. */
    get isFlashing() { return this._flashRemaining > 0; }
    /** @returns {boolean} Debug bounding-box gate. */
    get showBounds() { return this._showBounds; }
    /** @param {boolean} value Debug bounding-box gate. */
    set showBounds(value) { this._showBounds = Boolean(value); }

    /* ══════════════════════════════════════════════════════════════════
       LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {string} ENTITY_STATE value. */
    get state() { return this._state; }
    /** @returns {boolean} True while ACTIVE. */
    get active() { return this._state === ENTITY_STATE.ACTIVE; }
    /** @returns {boolean} True once destroyed. */
    get destroyed() { return this._state === ENTITY_STATE.DESTROYED; }
    /** @returns {number} Age in simulated seconds. */
    get age() { return this._age; }
    /** @returns {number} Configured lifetime (Infinity for permanent). */
    get lifetime() { return this._lifetime; }
    /** @returns {number} Seconds until expiry (0 once expired). */
    get lifetimeRemaining() {
        return Math.max(0, this._lifetime - this._age);
    }

    /**
     * Expires the entity: stops motion and broadcasts 'expire'. Idempotent.
     * Used for projectile TTL, fading corpses, and timed quest markers.
     * @returns {boolean} True if this call caused the transition.
     */
    expire() {
        if (this._state !== ENTITY_STATE.ACTIVE) return false;
        this._state = ENTITY_STATE.EXPIRED;
        this.stop();
        this._dispatch('expire', { id: this._id, age: this._age });
        return true;
    }

    /**
     * Resurrects/repositions an entity and resets its age and transients.
     * Works from ACTIVE, EXPIRED, or DESTROYED, making it the single
     * respawn path for players and recycled monsters alike.
     * @param {number} x Spawn x.
     * @param {number} y Spawn y.
     * @returns {this}
     */
    respawn(x, y) {
        this._state = ENTITY_STATE.ACTIVE;
        this._age = 0;
        this._flashRemaining = 0;
        this.stop();
        this._angularVelocity = 0;
        this.setPosition(x, y, true);
        this._dispatch('respawn', { id: this._id, x, y });
        return this;
    }

    /**
     * Destroys the entity: broadcasts 'destroy', then releases all event
     * listeners to break reference cycles. The manager must still remove
     * the entity from its spatial index and render list.
     * @returns {boolean} True if this call caused the transition.
     */
    destroy() {
        if (this._state === ENTITY_STATE.DESTROYED) return false;
        this._dispatch('destroy', { id: this._id });
        this._state = ENTITY_STATE.DESTROYED;
        this.stop();
        this._listeners.clear();
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       SIMULATION UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances physics, age, lifetime, and transients by one fixed tick.
     * CONTRACT: call exactly once per simulation tick. Subclasses override
     * and call super.update(dt) after setting movement intent.
     *
     * Order of operations matters:
     *   1. Age + lifetime check (an expiring entity does not move on its
     *      death tick, so TTL and collision agree on the final position).
     *   2. Snapshot previous transform for interpolation.
     *   3. Damp + clamp velocity, then integrate position (semi-implicit).
     *   4. Integrate facing angle.
     *   5. Clamp against world bounds, emitting 'bounds' on impacts.
     *   6. Advance the hit-flash timer.
     *
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        if (this._state !== ENTITY_STATE.ACTIVE) return this;

        /* 1. Lifetime. */
        this._age += dt;
        if (Number.isFinite(this._lifetime) && this._age >= this._lifetime) {
            this.expire();
            return this;
        }

        /* 2. Interpolation snapshot. */
        this._previousX = this._x;
        this._previousY = this._y;
        this._previousAngle = this._angle;

        /* 3. Semi-implicit Euler with frame-rate-independent drag. */
        const damping = Math.exp(-this._friction * dt);
        this._vx *= damping;
        this._vy *= damping;
        const magnitudeSquared = this._vx * this._vx + this._vy * this._vy;
        const cap = this._maxSpeed;
        if (magnitudeSquared > cap * cap) {
            const scale = cap / Math.sqrt(magnitudeSquared);
            this._vx *= scale;
            this._vy *= scale;
        }
        this._x += this._vx * dt;
        this._y += this._vy * dt;

        /* 4. Facing. */
        this._angle = normalizeAngle(this._angle + this._angularVelocity * dt);

        /* 5. World bounds. Clamp the box MIN corner so the whole body
         * stays inside, then convert back to anchor coordinates. When the
         * region is smaller than the entity, the min edge wins (a stable,
         * deterministic tie-break). */
        if (this._worldBounds) {
            const b = this._worldBounds;
            const offX = this._anchorOffsetX();
            const offY = this._anchorOffsetY();
            let originX = this._x + offX;
            let originY = this._y + offY;
            const minOX = b.x;
            const maxOX = b.x + b.width - this._width;
            const minOY = b.y;
            const maxOY = b.y + b.height - this._height;

            if (originX < minOX) {
                originX = minOX;
                if (this._vx < 0) {
                    this._vx = 0;
                    this._dispatch('bounds', { id: this._id, axis: 'x', side: 'min' });
                }
            } else if (originX > maxOX) {
                originX = maxOX;
                if (this._vx > 0) {
                    this._vx = 0;
                    this._dispatch('bounds', { id: this._id, axis: 'x', side: 'max' });
                }
            }
            if (originY < minOY) {
                originY = minOY;
                if (this._vy < 0) {
                    this._vy = 0;
                    this._dispatch('bounds', { id: this._id, axis: 'y', side: 'min' });
                }
            } else if (originY > maxOY) {
                originY = maxOY;
                if (this._vy > 0) {
                    this._vy = 0;
                    this._dispatch('bounds', { id: this._id, axis: 'y', side: 'max' });
                }
            }
            this._x = originX - offX;
            this._y = originY - offY;
        }

        /* 6. Transients. */
        if (this._flashRemaining > 0) {
            this._flashRemaining = Math.max(0, this._flashRemaining - dt);
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       BUFFER INJECTION & RENDERING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Appearance extension point. Fills the reusable appearance record
     * with the glyph, colors, and opacity for this frame. Base behavior
     * applies the hit-flash. Subclasses override to animate (calling
     * super first), e.g. swapping '@' for an animated player sprite frame
     * or dimming an NPC during dialogue. The record is transient and must
     * not be retained across frames.
     * @param {{char:number,fg:number,bg:number,alpha:number}} appearance Scratch record.
     * @param {number} alpha Presentation interpolation phase.
     * @returns {void}
     */
    prepareAppearance(appearance, alpha) {
        appearance.char = this._charCode;
        appearance.fg = this._flashRemaining > 0 ? this._flashFg : this._fgPacked;
        appearance.bg = this._bgPacked;
        appearance.alpha = clamp(this._alpha * (Number.isFinite(alpha) ? alpha : 1), 0, 1);
    }

    /**
     * Source-over compositing of two packed RGBA colors.
     *
     * With source coverage a = (srcAlpha/255)·opacity and destination
     * coverage da = dstAlpha/255:
     *
     *   outAlpha = a + da·(1 - a)
     *   outRGB   = (srcRGB·a + dstRGB·da·(1 - a)) / outAlpha
     *
     * Dividing by outAlpha un-premultiplies the blend so the result is a
     * valid straight-alpha packed color. A fully transparent result packs
     * to 0. This powers dream phasing, fading corpses, and ghost NPCs.
     *
     * @param {number} src Source packed RGBA.
     * @param {number} dst Destination packed RGBA.
     * @param {number} opacity Additional source coverage [0,1].
     * @returns {number} Composited packed RGBA.
     */
    static compositeColor(src, dst, opacity) {
        const a = ((src & 0xFF) / 255) * opacity;
        if (a <= 0) return dst >>> 0;
        const inv = 1 - a;
        const da = (dst & 0xFF) / 255;
        const outAlpha = a + da * inv;
        if (outAlpha <= EPSILON) return 0;
        const sr = (src >>> 24) & 0xFF;
        const sg = (src >>> 16) & 0xFF;
        const sb = (src >>> 8) & 0xFF;
        const dr = (dst >>> 24) & 0xFF;
        const dg = (dst >>> 16) & 0xFF;
        const db = (dst >>> 8) & 0xFF;
        const r = Math.round((sr * a + dr * da * inv) / outAlpha);
        const g = Math.round((sg * a + dg * da * inv) / outAlpha);
        const b = Math.round((sb * a + db * da * inv) / outAlpha);
        const alpha = Math.round(outAlpha * 255);
        return (((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (alpha & 0xFF)) >>> 0;
    }

    /**
     * Clipped, alpha-aware cell write. All buffer injection funnels
     * through here so clipping and compositing stay consistent.
     * @param {ASCIIBuffer} buffer Target surface.
     * @param {number} col Cell column.
     * @param {number} row Cell row.
     * @param {number} code Glyph code point.
     * @param {number} fg Packed foreground.
     * @param {number} bg Packed background.
     * @param {number} opacity Entity coverage [0,1].
     * @returns {boolean} True if a cell was written.
     * @private
     */
    _writeCell(buffer, col, row, code, fg, bg, opacity) {
        if (col < 0 || row < 0 || col >= buffer.cols || row >= buffer.rows) return false;
        if (opacity >= 1) {
            buffer.setChar(col, row, code, fg, bg);
            return true;
        }
        const index = row * buffer.cols + col;
        const blendedFg = Entity.compositeColor(fg, buffer.foregroundColors[index], opacity);
        const blendedBg = Entity.compositeColor(bg, buffer.backgroundColors[index], opacity);
        buffer.setChar(col, row, code, blendedFg, blendedBg);
        return true;
    }

    /**
     * Draws the entity's glyph into the virtual grid. Call AFTER terrain,
     * water, and weather, in WorldManager's zIndex-sorted entity pass.
     * PURE with respect to entity state: all transients advance in update().
     *
     * @param {ASCIIBuffer} asciiBuffer Destination world buffer.
     * @param {?EntityCamera} [camera=null] Camera; identity when omitted.
     * @param {number} [alpha=1] GameLoop interpolation phase.
     * @returns {number} Number of cells written (including debug markers).
     */
    render(asciiBuffer, camera = null, alpha = 1) {
        if (!(asciiBuffer instanceof ASCIIBuffer)) {
            throw new TypeError('[Entity] render requires an ASCIIBuffer.');
        }
        if (!this._visible || this._state !== ENTITY_STATE.ACTIVE) return 0;

        const phase = Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1;
        this.prepareAppearance(this._appearance, phase);
        const appearance = this._appearance;
        if (appearance.alpha <= 0) return 0;

        const camX = camera && Number.isFinite(camera.x) ? camera.x : 0;
        const camY = camera && Number.isFinite(camera.y) ? camera.y : 0;
        const cellW = camera && Number.isFinite(camera.cellWidth) && camera.cellWidth > 0
            ? camera.cellWidth : this._cellW;
        const cellH = camera && Number.isFinite(camera.cellHeight) && camera.cellHeight > 0
            ? camera.cellHeight : this._cellH;

        let written = 0;
        if (this._showBounds) {
            written += this.renderBounds(asciiBuffer, camera, phase);
        }

        const pos = this.getRenderPosition(phase, _renderPoint);
        /* +0.5 snaps the anchor to the nearest cell CENTER. Shake is NOT
         * added: the Renderer applies it as a transient canvas translate. */
        const col = Math.floor((pos.x + this._anchorOffsetX() + this._width / 2 - camX) / cellW + 0.5);
        const row = Math.floor((pos.y + this._anchorOffsetY() + this._height / 2 - camY) / cellH + 0.5);

        if (this._writeCell(
            asciiBuffer, col, row, appearance.char,
            appearance.fg, appearance.bg, appearance.alpha
        )) {
            written += 1;
        }
        return written;
    }

    /**
     * Draws the collision box as four corner markers for the debug HUD.
     * Independent of showBounds so the HUD can toggle overlays without
     * mutating entities. Corner-only rendering keeps the cost at four
     * writes regardless of entity size.
     * @param {ASCIIBuffer} buffer Target surface.
     * @param {?EntityCamera} [camera=null] Camera.
     * @param {number} [alpha=1] Interpolation phase.
     * @returns {number} Markers written.
     */
    renderBounds(buffer, camera = null, alpha = 1) {
        if (!(buffer instanceof ASCIIBuffer)) {
            throw new TypeError('[Entity] renderBounds requires an ASCIIBuffer.');
        }
        const camX = camera && Number.isFinite(camera.x) ? camera.x : 0;
        const camY = camera && Number.isFinite(camera.y) ? camera.y : 0;
        const cellW = camera && Number.isFinite(camera.cellWidth) && camera.cellWidth > 0
            ? camera.cellWidth : this._cellW;
        const cellH = camera && Number.isFinite(camera.cellHeight) && camera.cellHeight > 0
            ? camera.cellHeight : this._cellH;
        const box = this.getRenderBounds(alpha, _boxA);
        const left = Math.floor((box.x - camX) / cellW);
        const top = Math.floor((box.y - camY) / cellH);
        const right = Math.floor((box.x + box.width - camX) / cellW);
        const bottom = Math.floor((box.y + box.height - camY) / cellH);
        let written = 0;
        const corners = [[left, top], [right, top], [left, bottom], [right, bottom]];
        for (let i = 0; i < corners.length; i += 1) {
            if (this._writeCell(buffer, corners[i][0], corners[i][1], 0x2B, this._debugFg, TRANSPARENT_BG, 1)) {
                written += 1;
            }
        }
        return written;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to 'teleport', 'collision', 'bounds', 'expire', 'respawn',
     * or 'destroy'.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {this}
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[Entity] event type must be a non-empty string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[Entity] listener must be a function.');
        }
        let set = this._listeners.get(type);
        if (!set) {
            set = new Set();
            this._listeners.set(type, set);
        }
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
     * Broadcasts an event. Listener exceptions are caught and logged:
     * cosmetic hooks (audio, quest flicker) must never kill the tick.
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
                console.error(`[Entity #${this._id}] '${type}' listener failed:`, error);
            }
        }
    }

    /**
     * Listener count for leak diagnostics.
     * @param {string} [type] Optional event filter.
     * @returns {number}
     */
    listenerCount(type) {
        if (type !== undefined) return this._listeners.get(type)?.size ?? 0;
        let total = 0;
        for (const set of this._listeners.values()) total += set.size;
        return total;
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates; poll at HUD rate,
     * not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            id: this._id,
            name: this._name,
            state: this._state,
            x: this._x,
            y: this._y,
            vx: this._vx,
            vy: this._vy,
            speed: this._speed,
            angle: this._angle,
            width: this._width,
            height: this._height,
            anchor: this._anchor,
            zIndex: this._zIndex,
            alpha: this._alpha,
            age: this._age,
            lifetimeRemaining: this.lifetimeRemaining,
            liveParticles: 0,
            bounds: this.getBounds(),
            tags: this.tags,
            listeners: this.listenerCount()
        };
    }

    /**
     * Human-readable identity for console inspection and debug overlays.
     * @returns {string}
     */
    toString() {
        return `[Entity #${this._id} '${this._name}' @ (${this._x.toFixed(1)}, ${this._y.toFixed(1)})]`;
    }
}

export default Entity;