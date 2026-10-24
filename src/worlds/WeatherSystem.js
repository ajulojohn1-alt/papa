/**
 * @file src/worlds/WeatherSystem.js
 * @module worlds/WeatherSystem
 * @description
 * Atmospheric simulation for "YUCCA".
 * WeatherSystem owns rain, spore drift, fog, wind, thunderstorm scheduling,
 * and the Dream↔Drab lighting-inversion behavior. It is a pure simulation
 * module: it advances in fixed ticks via update(dt), then stamps weather
 * glyphs into the shared world ASCIIBuffer via render(buffer, camera)
 * during the presentation phase.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PIPELINE CONTRACT (WHERE WEATHER LIVES IN A FRAME)
 * ───────────────────────────────────────────────────────────────────────────
 * The WorldManager runs an immediate-mode ASCII pipeline every tick:
 *
 *   weather.update(FIXED_DT);              // simulation phase
 *   ...
 *   buffer.clear();                        // presentation phase
 *   map.stampInto(buffer);                 // terrain restamp
 *   entities.draw(buffer, camera);
 *   weather.render(buffer, camera);        // weather draws LAST
 *   const frame = buffer.commit();
 *   renderer.render(buffer, camera);
 *
 * Restamping terrain every frame is cheap by design: ASCIIBuffer.commit()
 * discards every cell whose final state equals the presented front state,
 * so only cells actually touched by weather, entities, or terrain edits
 * become dirty canvas redraws. Weather therefore never needs to know what
 * lies beneath a raindrop — it overwrites freely, and the double buffer
 * absorbs the cost.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARTICLE POOL MATH (STRUCTURE-OF-ARRAYS + SWAP-REMOVE)
 * ───────────────────────────────────────────────────────────────────────────
 * Particles live in flat typed arrays, matching the ASCIIBuffer memory
 * philosophy. No per-particle objects exist, so steady-state weather
 * performs ZERO allocations per tick.
 *
 *   px, py        Float32Array   world-space position, CSS pixels
 *   vx, vy        Float32Array   velocity, CSS px/s
 *   gv            Float32Array   per-particle gravity, px/s² (+down)
 *   tv            Float32Array   per-particle terminal speed, px/s
 *   age, life     Float32Array   seconds lived / seconds allowed
 *   phase         Float32Array   per-particle sine phase (spore sway)
 *   fg            Uint32Array    packed RGBA, baked at spawn
 *   glyph         Uint32Array    Unicode code point, baked at spawn
 *   kind, lean    Uint8Array     behavior class / wind-lean flag
 *
 * Live particles occupy the DENSE PREFIX [0, count). Removal uses the
 * swap-remove compaction:
 *
 *   kill(i):  copy slot (count-1) over slot i, then count -= 1
 *
 * This is O(1) per kill and keeps iteration cache-coherent. The update
 * loop therefore does NOT advance its index after a kill, because the
 * swapped-in particle still needs its own update this tick.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EMISSION ACCUMULATOR (FRACTIONAL SPAWNING)
 * ───────────────────────────────────────────────────────────────────────────
 * Emission rates are real-valued (e.g. 380 particles/s) but spawning is
 * discrete. Each layer carries an accumulator:
 *
 *   acc += rate · weight · scale · dt
 *   n    = floor(acc)          → spawn n particles this tick
 *   acc -= n                   → fractional remainder survives
 *
 * Over any window T the expected spawn count converges to rate·T exactly,
 * independent of tick rate. Accumulators are clamped so a stalled frame
 * never unleashes a visible burst on recovery.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIND FIELD & DRIFT CALCULATIONS
 * ───────────────────────────────────────────────────────────────────────────
 * The global wind signal is a base vector plus a procedural gust field.
 * Gusts are two phase-offset sinusoids with an irrational-ish frequency
 * ratio (1.7) so the combined waveform never visibly loops:
 *
 *   gust(t) = A · ( 0.6·sin(2π·f₁·t + φ₁) + 0.4·sin(2π·1.7·f₁·t + φ₂) )
 *   windX(t) = lerp(baseFrom.x, baseTo.x, blend) + gust(t)
 *
 * Each particle's horizontal velocity relaxes toward the wind with the
 * same frame-rate-independent exponential damping used by Camera pursuit:
 *
 *   alpha = 1 - e^(-k·dt)
 *   vx   += (windTarget - vx) · alpha
 *
 * Vertical motion integrates gravity and clamps at terminal speed:
 *
 *   vy += g·dt          (g > 0 falls, g < 0 rises for spores)
 *   vy  = clamp(vy, -tv, +tv)
 *
 * RAIN SPAWN STRIP. A drop needs fallTime ≈ viewH / tv to cross the
 * viewport, drifting windX·fallTime sideways on the way. To keep the
 * curtain continuous at every height, the spawn strip is the union of
 * all drift offsets — the viewport span extended downwind:
 *
 *   x ∈ [ camX - M + min(0, windX·fallTime),
 *         camX + viewW + M + max(0, windX·fallTime) ]
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LIGHTNING TIMING ALGORITHM
 * ───────────────────────────────────────────────────────────────────────────
 * Strikes follow a Poisson process with mean interval μ. The next delay is
 * drawn by inverse-transform sampling of the exponential distribution:
 *
 *   CDF:  F(t) = 1 - e^(-t/μ)
 *   draw: U ∈ [0, 1)  uniform
 *   Δt   = -μ · ln(1 - U)          (1-U avoids ln(0); still uniform)
 *
 * The raw draw is clamped to [1.25 s, 4μ] so a storm never machine-guns
 * the player nor falls silent for minutes.
 *
 * Each strike is a SEQUENCE of return strokes (real lightning flickers):
 * 1–3 strokes, each a quadratic-decay flash envelope, separated by
 * 50–130 ms gaps — the same ease-out shape as Camera shake:
 *
 *   stroke_intensity(τ) = I · (1 - τ/D)²        τ ∈ [0, D]
 *
 * During the first `inversionTicks` of a strike, render() runs an
 * inversion pass over the buffer: foreground/background colors swap and
 * terrain glyphs pass through INVERTED_GLYPHS, producing a one-or-two-tick
 * X-ray silhouette of the world. Blank cells swap too, which reads as the
 * sky itself flashing. The pass is regional (~35% of strikes) or
 * full-screen, and each strike also drives Camera.shake() scaled by
 * intensity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DUAL-WORLD STATES
 * ───────────────────────────────────────────────────────────────────────────
 * DRAB:  locked into DRAB_THUNDERSTORM — relentless heavy rain, high
 *        gloom, active lightning scheduler. No profile cycling: the Drab
 *        World's weather is a constant, oppressive fact.
 * DREAM: an internal Markov-style scheduler crossfades between
 *        CLEAR_GROVE, MYSTIC_RAIN, and SPORE_DRIFT every 18–40 s.
 *
 * Profile transitions last `transitionSeconds` and run BOTH profiles'
 * emission layers simultaneously, weighting the outgoing set by (1-t) and
 * the incoming set by t (smoothstep-eased). Wind base vectors and gloom
 * lerp over the same window, so weather never pops between worlds — it
 * turns.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 * ───────────────────────────────────────────────────────────────────────────
 * All randomness flows through a seeded mulberry32 PRNG. Pass a fixed
 * `seed` in tests or for client/server cosmetic parity; omit it for a
 * time-seeded stream in production.
 *
 * @example
 * const weather = new WeatherSystem({
 *     cellWidth: renderer.cellWidth,
 *     cellHeight: renderer.cellHeight
 * });
 * weather.attachCamera(camera);
 * weather.setWorld('DRAB');                 // locks in the storm
 * weather.addEventListener('lightning', (detail) => audio.playThunder(detail));
 *
 * // Per fixed tick:
 * weather.update(dt);
 *
 * // Per presentation frame, after terrain + entities:
 * weather.render(worldBuffer, camera);
 * worldBuffer.commit();
 * renderer.render(worldBuffer, camera);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Minimum particle pool capacity. */
const MIN_POOL_CAPACITY = 64;
/** Maximum particle pool capacity (memory guard). */
const MAX_POOL_CAPACITY = 16384;
/** Default pool capacity: covers the Drab storm cap with headroom. */
const DEFAULT_POOL_CAPACITY = 2048;

/** Default glyph advance width in CSS pixels (Renderer measures the truth). */
const DEFAULT_CELL_WIDTH = 9.6;
/** Default row pitch in CSS pixels. */
const DEFAULT_CELL_HEIGHT = 20;

/** Distance beyond the viewport edge where particles spawn/die, CSS px. */
const SPAWN_MARGIN_PX = 96;
/** Kill margin: particles farther out than this are recycled. */
const KILL_MARGIN_PX = 160;

/**
 * Camera displacement (in viewport diagonals) treated as a teleport.
 * Beyond this, the pool is flushed: dragging every particle across a
 * teleport would paint streak artifacts for a full second.
 * @type {number}
 */
const CAMERA_JUMP_THRESHOLD_SCREENS = 1.0;

/** Per-layer spawn clamp: no layer may emit more than this per tick. */
const MAX_SPAWNS_PER_LAYER_PER_TICK = 128;

/** Exponential relaxation rate k (1/s) pulling particle vx toward wind. */
const WIND_RELAXATION_K = 3.2;

/** Wind influence factor by particle kind (rain rides wind fully). */
const KIND_WIND_FACTOR = Object.freeze({ RAIN: 1.0, SPORE: 0.45, FOG: 0.35 });

/** Spore sway parameters: slow lateral pendulum drift. */
const SPORE_SWAY_AMPLITUDE = 18;   // px/s lateral speed amplitude
const SPORE_SWAY_FREQUENCY = 0.22; // Hz

/** Fog vertical bob amplitude (px/s) and frequency (Hz). */
const FOG_BOB_AMPLITUDE = 4;
const FOG_BOB_FREQUENCY = 0.07;

/** Gust waveform: secondary sine frequency ratio (never loops visibly). */
const GUST_SECONDARY_RATIO = 1.7;

/** Horizontal wind speed beyond which rain glyphs lean (px/s). */
const RAIN_LEAN_THRESHOLD = 24;

/** Glyph code points used for wind-lean selection. */
const GLYPH_VERTICAL = 0x7C;   // '|'
const GLYPH_LEAN_LEFT = 0x2F;  // '/'
const GLYPH_LEAN_RIGHT = 0x5C; // '\'
const GLYPH_DOT = 0x2E;        // '.'

/** Particle behavior classes. @enum {number} */
const PARTICLE_KIND = Object.freeze({ RAIN: 0, SPORE: 1, FOG: 2 });

/** World identifiers accepted by setWorld(). @enum {string} */
export const WORLD = Object.freeze({ DREAM: 'DREAM', DRAB: 'DRAB' });

/** Packed colors for lightning presentation. */
const FLASH_WHITE = 0xFFFFFFFF;
/** Cold blue-white used when inversion swaps into a transparent background. */
const FLASH_SKY = 0xEAF2FFFF;

/**
 * Glyph substitutions applied during the lightning inversion pass.
 * Keys and values are Unicode code points. Unmapped glyphs keep their
 * shape and only swap colors.
 * @type {Object<number, number>}
 */
const INVERTED_GLYPHS = Object.freeze({
    0x23: 0x25, // '#' → '%'
    0x2E: 0x3A, // '.' → ':'
    0x2C: 0x2E, // ',' → '.'
    0x7E: 0x3D, // '~' → '='
    0x2A: 0x2B  // '*' → '+'
});

/* ══════════════════════════════════════════════════════════════════════════
   WEATHER PROFILES
   ══════════════════════════════════════════════════════════════════════════ */

/** Canonical profile identifiers. @enum {string} */
export const WEATHER_PROFILE = Object.freeze({
    CLEAR_GROVE: 'CLEAR_GROVE',
    MYSTIC_RAIN: 'MYSTIC_RAIN',
    SPORE_DRIFT: 'SPORE_DRIFT',
    DRAB_DOWNPOUR: 'DRAB_DOWNPOUR',
    DRAB_THUNDERSTORM: 'DRAB_THUNDERSTORM'
});

/**
 * @typedef {Object} WeatherLayerSpec
 * @property {number} kind PARTICLE_KIND value.
 * @property {number} rate Emission rate in particles/second.
 * @property {number} gravity Gravity in px/s² (negative = buoyant).
 * @property {number} terminalSpeed Terminal speed cap in px/s.
 * @property {number} speedJitter ±fraction of terminal applied at spawn.
 * @property {[number, number]} lifetime Min/max lifetime, seconds.
 * @property {Array<{char: string, weight: number}>} glyphs Weighted glyph set.
 * @property {boolean} lean True if rain glyphs tilt with the wind.
 * @property {Array<{fg: (string|number)}>} colors Foreground variants.
 * @property {('TOP'|'AMBIENT'|'EDGE')} spawn Spawn placement strategy.
 */

/**
 * @typedef {Object} LightningConfig
 * @property {number} meanInterval Mean seconds between strikes (μ).
 * @property {[number, number]} intensity Min/max strike intensity 0..1.
 * @property {[number, number]} strokeCount Min/max return strokes.
 * @property {[number, number]} strokeDuration Stroke flash length, seconds.
 * @property {[number, number]} strokeGap Gap between strokes, seconds.
 * @property {number} fullScreenChance Probability of a full-screen inversion.
 * @property {number} inversionSeconds Inversion pass duration, seconds.
 * @property {{duration: number, intensity: number, frequency: number}} shake
 */

/**
 * The full profile table. Every object is deeply frozen: profiles are
 * immutable data, copied per-run only where mutation is required
 * (per-layer emission accumulators live in runtime layer objects instead).
 * @type {Object<string, Object>}
 */
const PROFILES = Object.freeze({
    CLEAR_GROVE: Object.freeze({
        id: WEATHER_PROFILE.CLEAR_GROVE,
        world: WORLD.DREAM,
        gloom: 0.0,
        maxLive: 80,
        wind: Object.freeze({ x: 6, y: 0 }),
        gust: Object.freeze({ amplitude: 5, frequency: 0.05 }),
        lightning: null,
        layers: Object.freeze([
            Object.freeze({
                kind: PARTICLE_KIND.SPORE,
                rate: 2.5,
                gravity: -6,
                terminalSpeed: 12,
                speedJitter: 0.4,
                lifetime: [6, 11],
                glyphs: Object.freeze([{ char: '.', weight: 3 }, { char: '*', weight: 1 }]),
                lean: false,
                colors: Object.freeze([{ fg: '#ffd27f' }, { fg: '#fff3c4' }]),
                spawn: 'AMBIENT'
            })
        ])
    }),

    MYSTIC_RAIN: Object.freeze({
        id: WEATHER_PROFILE.MYSTIC_RAIN,
        world: WORLD.DREAM,
        gloom: 0.15,
        maxLive: 420,
        wind: Object.freeze({ x: 14, y: 0 }),
        gust: Object.freeze({ amplitude: 12, frequency: 0.09 }),
        lightning: null,
        layers: Object.freeze([
            Object.freeze({
                kind: PARTICLE_KIND.RAIN,
                rate: 90,
                gravity: 420,
                terminalSpeed: 260,
                speedJitter: 0.25,
                lifetime: [1.4, 2.6],
                glyphs: Object.freeze([
                    { char: '|', weight: 4 },
                    { char: '/', weight: 2 },
                    { char: '.', weight: 3 }
                ]),
                lean: true,
                colors: Object.freeze([{ fg: '#7fe3ff' }, { fg: '#c48fff' }]),
                spawn: 'TOP'
            })
        ])
    }),

    SPORE_DRIFT: Object.freeze({
        id: WEATHER_PROFILE.SPORE_DRIFT,
        world: WORLD.DREAM,
        gloom: 0.05,
        maxLive: 220,
        wind: Object.freeze({ x: 20, y: -4 }),
        gust: Object.freeze({ amplitude: 16, frequency: 0.07 }),
        lightning: null,
        layers: Object.freeze([
            Object.freeze({
                kind: PARTICLE_KIND.SPORE,
                rate: 16,
                gravity: -14,
                terminalSpeed: 26,
                speedJitter: 0.5,
                lifetime: [5, 9],
                glyphs: Object.freeze([
                    { char: '*', weight: 3 },
                    { char: '.', weight: 4 },
                    { char: ',', weight: 1 }
                ]),
                lean: false,
                colors: Object.freeze([
                    { fg: '#ff9ed2' },
                    { fg: '#8affdf' },
                    { fg: '#d6b4ff' }
                ]),
                spawn: 'AMBIENT'
            })
        ])
    }),

    DRAB_DOWNPOUR: Object.freeze({
        id: WEATHER_PROFILE.DRAB_DOWNPOUR,
        world: WORLD.DRAB,
        gloom: 0.55,
        maxLive: 900,
        wind: Object.freeze({ x: -70, y: 0 }),
        gust: Object.freeze({ amplitude: 40, frequency: 0.12 }),
        lightning: null,
        layers: Object.freeze([
            Object.freeze({
                kind: PARTICLE_KIND.RAIN,
                rate: 300,
                gravity: 1400,
                terminalSpeed: 680,
                speedJitter: 0.2,
                lifetime: [0.8, 1.5],
                glyphs: Object.freeze([
                    { char: '|', weight: 5 },
                    { char: '/', weight: 3 },
                    { char: '.', weight: 1 }
                ]),
                lean: true,
                colors: Object.freeze([{ fg: '#7c8b9d' }, { fg: '#a9b8c6' }]),
                spawn: 'TOP'
            }),
            Object.freeze({
                kind: PARTICLE_KIND.FOG,
                rate: 3,
                gravity: 0,
                terminalSpeed: 30,
                speedJitter: 0.3,
                lifetime: [9, 15],
                glyphs: Object.freeze([{ char: '~', weight: 4 }, { char: '-', weight: 1 }]),
                lean: false,
                colors: Object.freeze([{ fg: 'rgba(90,102,114,0.55)' }]),
                spawn: 'EDGE'
            })
        ])
    }),

    DRAB_THUNDERSTORM: Object.freeze({
        id: WEATHER_PROFILE.DRAB_THUNDERSTORM,
        world: WORLD.DRAB,
        gloom: 0.7,
        maxLive: 1200,
        wind: Object.freeze({ x: -95, y: 0 }),
        gust: Object.freeze({ amplitude: 60, frequency: 0.13 }),
        lightning: Object.freeze({
            meanInterval: 8.0,
            intensity: [0.55, 1.0],
            strokeCount: [1, 3],
            strokeDuration: [0.06, 0.14],
            strokeGap: [0.05, 0.13],
            fullScreenChance: 0.65,
            inversionSeconds: 0.05,   // ≈ 1–2 fixed ticks at 60 Hz
            shake: Object.freeze({ duration: 0.55, intensity: 12, frequency: 22 })
        }),
        layers: Object.freeze([
            Object.freeze({
                kind: PARTICLE_KIND.RAIN,
                rate: 380,
                gravity: 1600,
                terminalSpeed: 720,
                speedJitter: 0.22,
                lifetime: [0.8, 1.4],
                glyphs: Object.freeze([
                    { char: '|', weight: 6 },
                    { char: '/', weight: 3 },
                    { char: '.', weight: 1 }
                ]),
                lean: true,
                colors: Object.freeze([{ fg: '#8fa0b3' }, { fg: '#c2d2e0' }]),
                spawn: 'TOP'
            }),
            Object.freeze({
                kind: PARTICLE_KIND.FOG,
                rate: 4,
                gravity: 0,
                terminalSpeed: 34,
                speedJitter: 0.3,
                lifetime: [8, 14],
                glyphs: Object.freeze([{ char: '~', weight: 4 }, { char: '-', weight: 1 }]),
                lean: false,
                colors: Object.freeze([{ fg: 'rgba(84,96,110,0.6)' }]),
                spawn: 'EDGE'
            })
        ])
    })
});

/** Profile pool the Dream scheduler cycles through (no immediate repeats). */
const DREAM_CYCLE = Object.freeze([
    WEATHER_PROFILE.CLEAR_GROVE,
    WEATHER_PROFILE.MYSTIC_RAIN,
    WEATHER_PROFILE.SPORE_DRIFT
]);

/** Dream scheduler dwell window, seconds. */
const DREAM_DWELL_MIN = 18;
const DREAM_DWELL_MAX = 40;

/* ══════════════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * mulberry32: tiny, fast, seedable 32-bit PRNG.
 * Determinism lets tests pin weather behavior and lets a future server
 * broadcast a storm seed so all clients flicker in unison.
 * @param {number} seed Unsigned 32-bit seed.
 * @returns {() => number} Function returning floats in [0, 1).
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

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Minimal camera contract consumed by WeatherSystem. The engine Camera
 * satisfies it directly; tests may pass a plain object.
 * @typedef {Object} WeatherCamera
 * @property {number} x Camera top-left x in world CSS pixels.
 * @property {number} y Camera top-left y in world CSS pixels.
 * @property {number} viewportWidth Viewport width in CSS pixels.
 * @property {number} viewportHeight Viewport height in CSS pixels.
 * @property {Function} [shake] Optional Camera.shake for lightning impacts.
 */

/**
 * Event detail broadcast on the 'lightning' event. Audio systems should
 * synthesize thunder from `intensity` and delay it by distance flavor.
 * @typedef {Object} LightningDetail
 * @property {number} intensity Peak strike intensity 0..1.
 * @property {boolean} fullScreen True when the inversion covers all cells.
 * @property {?{u0: number, u1: number}} region Viewport fractions, or null.
 * @property {string} world Active world identifier.
 * @property {number} strokeCount Number of return strokes in the strike.
 */

/* ══════════════════════════════════════════════════════════════════════════
   WEATHER SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pooled atmospheric particle simulator with wind fields, thunderstorm
 * scheduling, and dual-world profile management.
 */
export class WeatherSystem {
    /**
     * @param {Object} [options]
     * @param {number} [options.poolCapacity=2048] Maximum live particles.
     * @param {number} [options.cellWidth=9.6] Glyph advance, CSS pixels.
     * @param {number} [options.cellHeight=20] Row pitch, CSS pixels.
     * @param {number} [options.seed] PRNG seed; time-seeded when omitted.
     * @param {number} [options.emissionScale=1] Global density multiplier
     *   (0..1) for low-power rendering modes.
     * @param {string} [options.world='DREAM'] Initial world state.
     * @throws {TypeError|RangeError} If any option is invalid.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[WeatherSystem] options must be an object.');
        }

        const capacity = options.poolCapacity ?? DEFAULT_POOL_CAPACITY;
        if (!Number.isInteger(capacity) || capacity < MIN_POOL_CAPACITY || capacity > MAX_POOL_CAPACITY) {
            throw new RangeError(
                `[WeatherSystem] poolCapacity must be an integer in ` +
                `[${MIN_POOL_CAPACITY}, ${MAX_POOL_CAPACITY}]; received ${capacity}.`
            );
        }

        /** @type {number} Pool capacity (hard particle ceiling). */
        this._capacity = capacity;

        /* ---- Cell metrics (world px → grid cell conversion) ---------- */
        this.setCellMetrics(
            options.cellWidth ?? DEFAULT_CELL_WIDTH,
            options.cellHeight ?? DEFAULT_CELL_HEIGHT
        );

        /* ---- Emission density scaling -------------------------------- */
        this.setEmissionScale(options.emissionScale ?? 1);

        /* ---- Deterministic randomness -------------------------------- */
        const seed = Number.isInteger(options.seed)
            ? options.seed
            : ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
        /** @type {() => number} Seeded uniform random in [0, 1). */
        this._rng = mulberry32(seed);
        /** @type {number} Retained for diagnostics / reseeding. */
        this._seed = seed;

        /* ---- Particle pool arrays (see header memory layout) --------- */
        /** @type {Float32Array} */ this._px = new Float32Array(capacity);
        /** @type {Float32Array} */ this._py = new Float32Array(capacity);
        /** @type {Float32Array} */ this._vx = new Float32Array(capacity);
        /** @type {Float32Array} */ this._vy = new Float32Array(capacity);
        /** @type {Float32Array} */ this._gv = new Float32Array(capacity);
        /** @type {Float32Array} */ this._tv = new Float32Array(capacity);
        /** @type {Float32Array} */ this._age = new Float32Array(capacity);
        /** @type {Float32Array} */ this._life = new Float32Array(capacity);
        /** @type {Float32Array} */ this._phase = new Float32Array(capacity);
        /** @type {Uint32Array}  */ this._fg = new Uint32Array(capacity);
        /** @type {Uint32Array}  */ this._glyph = new Uint32Array(capacity);
        /** @type {Uint8Array}   */ this._kind = new Uint8Array(capacity);
        /** @type {Uint8Array}   */ this._lean = new Uint8Array(capacity);
        /** @type {number} Dense live-particle prefix length. */
        this._count = 0;

        /* ---- Wind field state ---------------------------------------- */
        /** @type {number} Simulation clock, seconds. */
        this._time = 0;
        /** @type {number} Live resolved wind x, px/s. */
        this._windX = 0;
        /** @type {number} Live resolved wind y, px/s. */
        this._windY = 0;
        /** @type {number} Random phase for the primary gust sine. */
        this._gustPhaseA = this._rng() * Math.PI * 2;
        /** @type {number} Random phase for the secondary gust sine. */
        this._gustPhaseB = this._rng() * Math.PI * 2;

        /* ---- Profile / world state ------------------------------------ */
        /** @type {string} Active world identifier. */
        this._world = WORLD.DREAM;
        /** @type {?Object} Outgoing profile during a transition. */
        this._fromProfile = null;
        /** @type {Object} Incoming (or current) profile. */
        this._toProfile = PROFILES[WEATHER_PROFILE.CLEAR_GROVE];
        /** @type {Array<Object>} Runtime layers of the outgoing profile. */
        this._fromLayers = null;
        /** @type {Array<Object>} Runtime layers of the incoming profile. */
        this._toLayers = this._buildLayerRuntimes(this._toProfile);
        /** @type {number} Transition progress 0..1 (1 = settled). */
        this._blend = 1;
        /** @type {number} Transition duration in seconds. */
        this._blendDuration = 1;
        /** @type {boolean} Dream scheduler active. */
        this._schedulerEnabled = true;
        /** @type {number} Seconds until the next Dream profile shift. */
        this._nextShiftIn = this._randRange(DREAM_DWELL_MIN, DREAM_DWELL_MAX);
        /** @type {boolean} Master gate for the lightning scheduler. */
        this._lightningEnabled = true;

        /* ---- Lightning state ------------------------------------------ */
        /** @type {?Object} Active flash state, or null when idle. */
        this._flash = null;
        /** @type {number} Seconds until the next scheduled strike. */
        this._nextStrikeIn = this._sampleStrikeDelay(
            PROFILES[WEATHER_PROFILE.DRAB_THUNDERSTORM].lightning.meanInterval
        );
        /** @type {boolean} Stray guard: never schedule without a config. */
        this._strikeTimerActive = false;

        /* ---- Camera tracking ------------------------------------------ */
        /** @type {?WeatherCamera} Attached camera reference. */
        this._camera = null;
        /** @type {number} Last observed camera x (teleport detection). */
        this._lastCamX = NaN;
        /** @type {number} Last observed camera y (teleport detection). */
        this._lastCamY = NaN;

        /* ---- Event listeners ------------------------------------------ */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /* ---- Diagnostics ----------------------------------------------- */
        /** @type {Object} Lifetime counters for the debug HUD. */
        this._metrics = {
            spawnedTotal: 0,
            recycledTotal: 0,
            strikesTotal: 0,
            profileChanges: 0,
            worldChanges: 0
        };

        /* Apply the initial world state through the public API so all
         * invariants (scheduler flags, timers, events) initialize once. */
        this.setWorld(options.world ?? WORLD.DREAM);
    }

    /* ══════════════════════════════════════════════════════════════════
       CONFIGURATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Reseeds the deterministic PRNG from the authoritative server's
     * global weatherSeed. Multi-client sessions call this once on the
     * welcome handshake so every client's storm — particle draws, gust
     * phases, strike delays — flows from the identical mulberry32 stream.
     * The particle pool is flushed so post-reseed emission restarts from
     * the shared deterministic head of the stream.
     * @param {number} seed 32-bit integer seed.
     * @returns {this}
     */
    setSeed(seed) {
        if (!Number.isInteger(seed) || seed < 0) {
            throw new RangeError('[WeatherSystem] seed must be a non-negative integer.');
        }
        this._seed = seed >>> 0;
        this._rng = mulberry32(this._seed);
        this._count = 0;
        this._metrics.spawnedTotal = 0;
        this._metrics.recycledTotal = 0;
        return this;
    }

    /**
     * Updates glyph metrics after Renderer font recalibration.
     * Mirrors Camera.setCellMetrics so both systems agree on grid space.
     * @param {number} cellWidth Glyph advance width, CSS pixels.
     * @param {number} cellHeight Row pitch, CSS pixels.
     * @returns {this}
     */
    setCellMetrics(cellWidth, cellHeight) {
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
            throw new RangeError('[WeatherSystem] cellWidth must be positive.');
        }
        if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
            throw new RangeError('[WeatherSystem] cellHeight must be positive.');
        }
        /** @type {number} */
        this._cellW = cellWidth;
        /** @type {number} */
        this._cellH = cellHeight;
        return this;
    }

    /**
     * Sets the global emission density multiplier. Use 0.5–0.7 on
     * low-power devices; 0 disables all particle emission while leaving
     * lightning and gloom intact.
     * @param {number} scale Multiplier clamped to [0, 2].
     * @returns {this}
     */
    setEmissionScale(scale) {
        if (!Number.isFinite(scale)) {
            throw new RangeError('[WeatherSystem] emissionScale must be finite.');
        }
        /** @type {number} */
        this._emissionScale = Math.min(2, Math.max(0, scale));
        return this;
    }

    /**
     * Attaches the camera used for spawn regions, culling, and lightning
     * screen-shake. Accepts any object satisfying the WeatherCamera
     * contract; the engine Camera works directly.
     * @param {?WeatherCamera} camera Camera, or null to detach.
     * @returns {this}
     */
    attachCamera(camera) {
        if (camera !== null &&
            (typeof camera.x !== 'number' || typeof camera.y !== 'number')) {
            throw new TypeError('[WeatherSystem] camera must expose numeric x and y.');
        }
        this._camera = camera;
        this._lastCamX = NaN;
        this._lastCamY = NaN;
        return this;
    }

    /**
     * Enables or disables the lightning scheduler. Scripted strikes via
     * triggerLightning() remain available either way (boss fights, quests).
     * @param {boolean} enabled
     * @returns {this}
     */
    setLightningEnabled(enabled) {
        this._lightningEnabled = Boolean(enabled);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       WORLD & PROFILE STATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Switches the dual-world weather regime.
     * DRAB locks the storm profile and disables cycling; DREAM enables
     * the scheduler and eases into a gentle starting profile.
     * @param {string} world WORLD.DREAM or WORLD.DRAB.
     * @param {Object} [options]
     * @param {number} [options.transitionSeconds=3] Crossfade duration.
     * @returns {this}
     */
    setWorld(world, options = {}) {
        if (world !== WORLD.DREAM && world !== WORLD.DRAB) {
            throw new TypeError('[WeatherSystem] world must be DREAM or DRAB.');
        }
        this._world = world;
        this._metrics.worldChanges += 1;

        if (world === WORLD.DRAB) {
            this._schedulerEnabled = false;
            this.setProfile(WEATHER_PROFILE.DRAB_THUNDERSTORM, {
                transitionSeconds: options.transitionSeconds ?? 3
            });
        } else {
            this._schedulerEnabled = true;
            this._nextShiftIn = this._randRange(DREAM_DWELL_MIN, DREAM_DWELL_MAX);
            this.setProfile(WEATHER_PROFILE.CLEAR_GROVE, {
                transitionSeconds: options.transitionSeconds ?? 3
            });
        }
        this._dispatch('worldchange', { world });
        return this;
    }

    /**
     * Crossfades to a named weather profile. During the transition both
     * profiles emit simultaneously with complementary weights (see header).
     * Calling mid-transition retargets from the previous DESTINATION, so
     * rapid chaining never resurrects a profile that is already fading.
     * @param {string} profileId One of WEATHER_PROFILE values.
     * @param {Object} [options]
     * @param {number} [options.transitionSeconds=3] Crossfade duration, [0, 30].
     * @returns {this}
     */
    setProfile(profileId, options = {}) {
        const profile = PROFILES[profileId];
        if (!profile) {
            throw new RangeError(`[WeatherSystem] Unknown profile: ${profileId}.`);
        }
        let seconds = options.transitionSeconds ?? 3;
        if (!Number.isFinite(seconds)) seconds = 3;
        seconds = Math.min(30, Math.max(0, seconds));

        /* Retarget from the current destination, not the fading ghost. */
        this._fromProfile = this._toProfile;
        this._fromLayers = this._toLayers;
        this._toProfile = profile;
        this._toLayers = this._buildLayerRuntimes(profile);
        this._blend = seconds === 0 ? 1 : 0;
        this._blendDuration = Math.max(seconds, 1e-4);
        this._metrics.profileChanges += 1;

        /* The Dream scheduler restarts its dwell after any manual change. */
        if (this._schedulerEnabled) {
            this._nextShiftIn = this._randRange(DREAM_DWELL_MIN, DREAM_DWELL_MAX);
        }

        /* Lightning timing resumes against the destination config. */
        if (profile.lightning) {
            this._nextStrikeIn = this._sampleStrikeDelay(profile.lightning.meanInterval);
            this._strikeTimerActive = true;
        } else {
            this._strikeTimerActive = false;
        }

        this._dispatch('profilechange', {
            from: this._fromProfile ? this._fromProfile.id : null,
            to: profile.id,
            transitionSeconds: seconds
        });
        return this;
    }

    /** @returns {string} Active world identifier. */
    get world() {
        return this._world;
    }

    /** @returns {string} Destination profile id (current once settled). */
    get activeProfile() {
        return this._toProfile.id;
    }

    /** @returns {boolean} True while a profile crossfade is running. */
    get isTransitioning() {
        return this._blend < 1;
    }

    /**
     * Current gloom factor 0..1, eased across transitions. WorldManager
     * can feed this into a palette dim for the Drab oppression grade.
     * @returns {number}
     */
    get gloom() {
        const t = this._easedBlend();
        const from = this._fromProfile ? this._fromProfile.gloom : this._toProfile.gloom;
        return from + (this._toProfile.gloom - from) * t;
    }

    /**
     * Live resolved wind vector, gusts included, px/s.
     * @returns {{x: number, y: number}}
     */
    get wind() {
        return { x: this._windX, y: this._windY };
    }

    /* ══════════════════════════════════════════════════════════════════
       LIGHTNING: SCRIPTED TRIGGERS & QUERIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Fires a scripted lightning strike immediately (quest beats, boss
     * telegraphs). Uses the active profile's lightning config when
     * present, otherwise a sensible dramatic default.
     * @param {Object} [options]
     * @param {number} [options.intensity] Override intensity 0..1.
     * @param {?{u0: number, u1: number}} [options.region=null]
     *   Viewport-fraction column band; null = full screen.
     * @returns {this}
     */
    triggerLightning(options = {}) {
        const cfg = this._toProfile.lightning ?? PROFILES[WEATHER_PROFILE.DRAB_THUNDERSTORM].lightning;
        let intensity = options.intensity;
        if (!Number.isFinite(intensity)) {
            intensity = this._randRange(cfg.intensity[0], cfg.intensity[1]);
        }
        intensity = Math.min(1, Math.max(0.1, intensity));

        let region = null;
        if (options.region && Number.isFinite(options.region.u0) && Number.isFinite(options.region.u1)) {
            region = {
                u0: Math.min(options.region.u0, options.region.u1),
                u1: Math.max(options.region.u0, options.region.u1)
            };
        } else if (this._rng() > cfg.fullScreenChance) {
            /* Regional strike: a random 30–60% wide column band. */
            const width = this._randRange(0.3, 0.6);
            const u0 = this._rng() * (1 - width);
            region = { u0, u1: u0 + width };
        }

        this._executeStrike(cfg, intensity, region);
        return this;
    }

    /** @returns {boolean} True while any stroke envelope is above zero. */
    get isFlashing() {
        return this._flash !== null && this.flashIntensity > 0.02;
    }

    /**
     * Peak stroke envelope intensity right now, 0..1.
     * envelope(τ) = I · (1 - τ/D)² per stroke; the max wins.
     * @returns {number}
     */
    get flashIntensity() {
        if (!this._flash) return 0;
        const t = this._flash.elapsed;
        let peak = 0;
        for (let i = 0; i < this._flash.strokes.length; i += 1) {
            const stroke = this._flash.strokes[i];
            const local = t - stroke.t;
            if (local >= 0 && local < stroke.duration) {
                const decay = 1 - local / stroke.duration;
                const value = stroke.intensity * decay * decay;
                if (value > peak) peak = value;
            }
        }
        return peak;
    }

    /**
     * Snapshot of the flash state for systems that react to lightning
     * (Renderer palette flashes, HUD flicker, photography mode).
     * @returns {{active: boolean, intensity: number, region: ?Object}}
     */
    getFlashState() {
        return {
            active: this.isFlashing,
            intensity: this.flashIntensity,
            region: this._flash ? this._flash.region : null
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a weather event: 'lightning', 'profilechange',
     * 'worldchange'.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {this}
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[WeatherSystem] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[WeatherSystem] listener must be a function.');
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
     * Unsubscribes a previously registered listener.
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
     * Broadcasts an event to all subscribers. Listener exceptions are
     * caught and logged: weather hooks are cosmetic (audio, flicker) and
     * must never be able to kill the simulation tick.
     * @param {string} type Event name.
     * @param {Object} detail Event payload.
     * @private
     */
    _dispatch(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[WeatherSystem] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the weather simulation by one fixed tick.
     * CONTRACT: call exactly once per simulation tick with the loop's
     * fixed dt, before any render() this frame.
     *
     * Sequence:
     *   1. Advance clocks, wind field, and profile crossfade.
     *   2. Run the Dream scheduler and lightning scheduler.
     *   3. Emit particles per layer (fractional accumulator).
     *   4. Integrate particle physics with swap-remove culling.
     *
     * @param {number} dt Fixed timestep in seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;

        /* ---- 1. Profile crossfade & wind resolution ------------------- */
        this._advanceBlend(dt);
        this._resolveWind();

        /* ---- 2. Schedulers -------------------------------------------- */
        this._advanceScheduler(dt);
        this._advanceLightning(dt);

        /* Without a camera there is no viewport to populate; particles
         * freeze rather than simulating against a stale rectangle. */
        const cam = this._camera;
        if (!cam) return this;

        /* ---- Teleport detection --------------------------------------- */
        if (Number.isFinite(this._lastCamX)) {
            const dx = cam.x - this._lastCamX;
            const dy = cam.y - this._lastCamY;
            const screen = Math.hypot(cam.viewportWidth, cam.viewportHeight);
            if (Math.hypot(dx, dy) > screen * CAMERA_JUMP_THRESHOLD_SCREENS) {
                this.clearParticles();
            }
        }
        this._lastCamX = cam.x;
        this._lastCamY = cam.y;

        /* ---- 3. Emission ---------------------------------------------- */
        const maxLive = this._effectiveMaxLive();
        const t = this._easedBlend();
        if (this._fromLayers && this._blend < 1) {
            this._emitFromLayers(this._fromLayers, 1 - t, dt, cam, maxLive);
            this._emitFromLayers(this._toLayers, t, dt, cam, maxLive);
        } else {
            this._emitFromLayers(this._toLayers, 1, dt, cam, maxLive);
        }

        /* ---- 4. Physics + culling -------------------------------------- */
        this._integrateParticles(dt, cam);
        return this;
    }

    /**
     * Advances the profile crossfade clock and commits when complete.
     * @param {number} dt Tick seconds.
     * @private
     */
    _advanceBlend(dt) {
        if (this._blend >= 1) return;
        this._blend = Math.min(1, this._blend + dt / this._blendDuration);
        if (this._blend >= 1) {
            /* Transition settled: drop the ghost profile entirely. */
            this._fromProfile = null;
            this._fromLayers = null;
        }
    }

    /**
     * Smoothstep-eased blend factor. The Hermite curve t²(3-2t) gives
     * zero velocity at both ends, so emission weights never jerk at the
     * moment a transition starts or lands.
     * @returns {number} Eased t in [0, 1].
     * @private
     */
    _easedBlend() {
        const t = Math.min(1, Math.max(0, this._blend));
        return t * t * (3 - 2 * t);
    }

    /**
     * Resolves the live wind vector: lerped base wind across the active
     * crossfade plus the procedural gust field (see header formula).
     * @private
     */
    _resolveWind() {
        const t = this._easedBlend();
        const from = this._fromProfile ? this._fromProfile.wind : this._toProfile.wind;
        const to = this._toProfile.wind;
        const baseX = from.x + (to.x - from.x) * t;
        const baseY = from.y + (to.y - from.y) * t;

        /* Gust amplitude also crossfades: a storm arriving should gust
         * harder gradually, not instantly. */
        const fromGust = this._fromProfile ? this._fromProfile.gust : this._toProfile.gust;
        const toGust = this._toProfile.gust;
        const amplitude = fromGust.amplitude + (toGust.amplitude - fromGust.amplitude) * t;
        const frequency = fromGust.frequency + (toGust.frequency - fromGust.frequency) * t;

        const w1 = Math.PI * 2 * frequency * this._time + this._gustPhaseA;
        const w2 = Math.PI * 2 * frequency * GUST_SECONDARY_RATIO * this._time + this._gustPhaseB;
        const gust = amplitude * (0.6 * Math.sin(w1) + 0.4 * Math.sin(w2));

        this._windX = baseX + gust;
        this._windY = baseY;
    }

    /**
     * Dream World scheduler: after a randomized dwell, shifts to a new
     * profile, never repeating the current one back-to-back.
     * @param {number} dt Tick seconds.
     * @private
     */
    _advanceScheduler(dt) {
        if (!this._schedulerEnabled || this._world !== WORLD.DREAM) return;
        this._nextShiftIn -= dt;
        if (this._nextShiftIn > 0) return;

        const candidates = DREAM_CYCLE.filter((id) => id !== this._toProfile.id);
        const next = candidates[Math.floor(this._rng() * candidates.length)];
        this.setProfile(next, { transitionSeconds: this._randRange(3, 6) });
    }

    /**
     * Lightning scheduler: counts down the Poisson-sampled delay and
     * fires a strike when it elapses. Only runs while the destination
     * profile carries a lightning config and lightning is enabled.
     * @param {number} dt Tick seconds.
     * @private
     */
    _advanceLightning(dt) {
        const cfg = this._toProfile.lightning;
        if (!cfg || !this._lightningEnabled || !this._strikeTimerActive) return;

        /* A flash already in flight postpones scheduling: strikes never
         * overlap, which keeps the inversion pass and shake readable. */
        if (this._flash) return;

        this._nextStrikeIn -= dt;
        if (this._nextStrikeIn <= 0) {
            const intensity = this._randRange(cfg.intensity[0], cfg.intensity[1]);
            let region = null;
            if (this._rng() > cfg.fullScreenChance) {
                const width = this._randRange(0.3, 0.6);
                const u0 = this._rng() * (1 - width);
                region = { u0, u1: u0 + width };
            }
            this._executeStrike(cfg, intensity, region);
            this._nextStrikeIn = this._sampleStrikeDelay(cfg.meanInterval);
        }
    }

    /**
     * Draws the next strike delay from the exponential distribution via
     * inverse-transform sampling, clamped to a sane storm cadence:
     *   Δt = clamp( -μ·ln(1-U), 1.25, 4μ )
     * @param {number} meanInterval Mean seconds between strikes (μ).
     * @returns {number} Delay in seconds.
     * @private
     */
    _sampleStrikeDelay(meanInterval) {
        const u = this._rng();
        const raw = -meanInterval * Math.log(1 - u);
        return Math.min(meanInterval * 4, Math.max(1.25, raw));
    }

    /**
     * Executes one strike: builds the return-stroke sequence, arms the
     * inversion window, shakes the camera, and broadcasts the event.
     * @param {LightningConfig} cfg Lightning configuration.
     * @param {number} intensity Peak intensity 0..1.
     * @param {?{u0: number, u1: number}} region Column band or null.
     * @private
     */
    _executeStrike(cfg, intensity, region) {
        const strokeTotal = Math.max(1, Math.round(
            this._randRange(cfg.strokeCount[0], cfg.strokeCount[1])
        ));
        const strokes = [];
        let cursor = 0;
        for (let i = 0; i < strokeTotal; i += 1) {
            const duration = this._randRange(cfg.strokeDuration[0], cfg.strokeDuration[1]);
            strokes.push({
                t: cursor,
                duration,
                /* The first return stroke is brightest; later strokes
                 * re-illuminate at 50–90% power. */
                intensity: intensity * (i === 0 ? 1 : this._randRange(0.5, 0.9))
            });
            cursor += duration + this._randRange(cfg.strokeGap[0], cfg.strokeGap[1]);
        }

        this._flash = {
            elapsed: 0,
            total: cursor,
            strokes,
            /* Inversion pass budget, consumed in update() ticks. */
            inversionRemaining: cfg.inversionSeconds,
            region,
            intensity
        };
        this._metrics.strikesTotal += 1;

        /* Screen shake scales with strike intensity. Camera.shake's own
         * stacking policy protects a running slam from weak tremors. */
        const cam = this._camera;
        if (cam && typeof cam.shake === 'function') {
            cam.shake(
                cfg.shake.duration,
                cfg.shake.intensity * intensity,
                cfg.shake.frequency
            );
        }

        /** @type {LightningDetail} */
        const detail = {
            intensity,
            fullScreen: region === null,
            region,
            world: this._world,
            strokeCount: strokeTotal
        };
        this._dispatch('lightning', detail);
    }

    /* ══════════════════════════════════════════════════════════════════
       EMISSION INTERNALS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds mutable per-layer runtime state from a frozen profile.
     * Each runtime carries its own fractional emission accumulator and
     * precomputed cumulative glyph weights for O(log-free) sampling.
     * @param {Object} profile Frozen profile definition.
     * @returns {Array<Object>} Runtime layer objects.
     * @private
     */
    _buildLayerRuntimes(profile) {
        return profile.layers.map((spec) => {
            const totalWeight = spec.glyphs.reduce((sum, g) => sum + g.weight, 0);
            const glyphCodes = new Uint32Array(spec.glyphs.length);
            const cumulative = new Float64Array(spec.glyphs.length);
            let running = 0;
            for (let i = 0; i < spec.glyphs.length; i += 1) {
                glyphCodes[i] = spec.glyphs[i].char.codePointAt(0);
                running += spec.glyphs[i].weight / totalWeight;
                cumulative[i] = running;
            }
            cumulative[cumulative.length - 1] = 1; /* kill float drift */
            const colors = spec.colors.map(
                (c) => ASCIIBuffer.packColor(c.fg, FLASH_WHITE)
            );
            return {
                spec,
                accumulator: 0,
                glyphCodes,
                cumulative,
                colors
            };
        });
    }

    /**
     * Runs one layer set's emission for this tick.
     * @param {Array<Object>} layers Runtime layers.
     * @param {number} weight Crossfade weight 0..1.
     * @param {number} dt Tick seconds.
     * @param {WeatherCamera} cam Camera viewport.
     * @param {number} maxLive Global live-particle budget.
     * @private
     */
    _emitFromLayers(layers, weight, dt, cam, maxLive) {
        if (weight <= 0 || this._emissionScale <= 0) return;
        for (let i = 0; i < layers.length; i += 1) {
            const layer = layers[i];
            layer.accumulator += layer.spec.rate * weight * this._emissionScale * dt;
            let n = Math.floor(layer.accumulator);
            layer.accumulator -= n;
            if (n <= 0) continue;

            /* Burst clamp: a stalled frame must not dump a wall of rain. */
            if (n > MAX_SPAWNS_PER_LAYER_PER_TICK) {
                n = MAX_SPAWNS_PER_LAYER_PER_TICK;
                layer.accumulator = 0;
            }
            for (let s = 0; s < n; s += 1) {
                if (this._count >= this._capacity || this._count >= maxLive) {
                    /* Saturated: discard pending demand instead of
                     * banking it into the next tick. */
                    layer.accumulator = 0;
                    return;
                }
                this._spawnParticle(layer, cam);
            }
        }
    }

    /**
     * Spawns one particle from a layer into the first free pool slot.
     * Placement depends on the layer's spawn strategy:
     *   TOP     rain curtain along the upwind-extended top strip
     *   AMBIENT spores materializing anywhere inside the viewport
     *   EDGE    fog wisps entering from the upwind side edge
     * @param {Object} layer Runtime layer.
     * @param {WeatherCamera} cam Camera viewport.
     * @private
     */
    _spawnParticle(layer, cam) {
        const spec = layer.spec;
        const i = this._count;
        const rng = this._rng;

        /* Terminal speed with per-particle jitter so the curtain never
         * falls as a uniform sheet. */
        const jitter = 1 + (rng() * 2 - 1) * spec.speedJitter;
        const terminal = Math.max(1, spec.terminalSpeed * jitter);
        const windFactor = KIND_WIND_FACTOR[Object.keys(PARTICLE_KIND)[spec.kind]] ?? 1;

        let x = 0;
        let y = 0;
        if (spec.kind === PARTICLE_KIND.RAIN) {
            /* Upwind-extended spawn strip (see header derivation). */
            const fallTime = (cam.viewportHeight + SPAWN_MARGIN_PX * 2) / terminal;
            const drift = this._windX * fallTime;
            const x0 = cam.x - SPAWN_MARGIN_PX + Math.min(0, drift);
            const x1 = cam.x + cam.viewportWidth + SPAWN_MARGIN_PX + Math.max(0, drift);
            x = x0 + rng() * (x1 - x0);
            y = cam.y - SPAWN_MARGIN_PX * rng() - 2;
            this._vy[i] = terminal * this._randRange(0.3, 0.7);
        } else if (spec.kind === PARTICLE_KIND.SPORE) {
            x = cam.x - SPAWN_MARGIN_PX + rng() * (cam.viewportWidth + SPAWN_MARGIN_PX * 2);
            y = cam.y - SPAWN_MARGIN_PX + rng() * (cam.viewportHeight + SPAWN_MARGIN_PX * 2);
            this._vy[i] = (rng() * 2 - 1) * terminal * 0.3;
        } else { /* FOG */
            const fromLeft = this._windX >= 0;
            x = fromLeft ? cam.x - SPAWN_MARGIN_PX : cam.x + cam.viewportWidth + SPAWN_MARGIN_PX;
            y = cam.y + rng() * cam.viewportHeight;
            this._vy[i] = 0;
        }

        this._px[i] = x;
        this._py[i] = y;
        this._vx[i] = this._windX * windFactor + (rng() * 2 - 1) * 8;
        this._gv[i] = spec.gravity;
        this._tv[i] = terminal;
        this._age[i] = 0;
        this._life[i] = this._randRange(spec.lifetime[0], spec.lifetime[1]);
        this._phase[i] = rng() * Math.PI * 2;
        this._glyph[i] = this._sampleGlyph(layer);
        this._fg[i] = layer.colors[Math.floor(rng() * layer.colors.length)];
        this._kind[i] = spec.kind;
        this._lean[i] = spec.lean ? 1 : 0;

        this._count += 1;
        this._metrics.spawnedTotal += 1;
    }

    /**
     * Weighted glyph sampling against the layer's cumulative table.
     * @param {Object} layer Runtime layer.
     * @returns {number} Chosen glyph code point.
     * @private
     */
    _sampleGlyph(layer) {
        const u = this._rng();
        for (let i = 0; i < layer.cumulative.length; i += 1) {
            if (u <= layer.cumulative[i]) return layer.glyphCodes[i];
        }
        return layer.glyphCodes[layer.glyphCodes.length - 1];
    }

    /* ══════════════════════════════════════════════════════════════════
       PHYSICS INTEGRATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Integrates all live particles and recycles dead ones via
     * swap-remove. Index handling is subtle: after a kill, slot i holds
     * the particle swapped in from the pool tail, so the loop reprocesses
     * the same index instead of advancing.
     * @param {number} dt Tick seconds.
     * @param {WeatherCamera} cam Camera viewport for culling bounds.
     * @private
     */
    _integrateParticles(dt, cam) {
        /* Frame-rate-independent wind relaxation factor (Camera math). */
        const relax = 1 - Math.exp(-WIND_RELAXATION_K * dt);
        const killX0 = cam.x - KILL_MARGIN_PX;
        const killX1 = cam.x + cam.viewportWidth + KILL_MARGIN_PX;
        const killY0 = cam.y - KILL_MARGIN_PX;
        const killY1 = cam.y + cam.viewportHeight + KILL_MARGIN_PX;

        let i = 0;
        while (i < this._count) {
            const kind = this._kind[i];
            this._age[i] += dt;

            if (kind === PARTICLE_KIND.RAIN) {
                this._vx[i] += (this._windX - this._vx[i]) * relax;
                this._vy[i] += this._gv[i] * dt;
                if (this._vy[i] > this._tv[i]) this._vy[i] = this._tv[i];
            } else if (kind === PARTICLE_KIND.SPORE) {
                /* Overdamped drift: velocity follows the sway signal
                 * directly instead of accumulating force. */
                const sway = SPORE_SWAY_AMPLITUDE *
                    Math.sin(Math.PI * 2 * SPORE_SWAY_FREQUENCY * this._age[i] + this._phase[i]);
                this._vx[i] = this._windX * KIND_WIND_FACTOR.SPORE + sway;
                this._vy[i] += this._gv[i] * dt;
                if (this._vy[i] < -this._tv[i]) this._vy[i] = -this._tv[i];
                if (this._vy[i] > this._tv[i]) this._vy[i] = this._tv[i];
            } else { /* FOG */
                const target = this._windX * KIND_WIND_FACTOR.FOG;
                this._vx[i] += (target - this._vx[i]) * relax;
                this._vy[i] = FOG_BOB_AMPLITUDE *
                    Math.sin(Math.PI * 2 * FOG_BOB_FREQUENCY * this._age[i] + this._phase[i]);
            }

            this._px[i] += this._vx[i] * dt;
            this._py[i] += this._vy[i] * dt;

            const dead =
                this._age[i] >= this._life[i] ||
                this._px[i] < killX0 || this._px[i] > killX1 ||
                this._py[i] < killY0 || this._py[i] > killY1;

            if (dead) {
                this._swapRemove(i);
                this._metrics.recycledTotal += 1;
                /* Do NOT advance: slot i now holds the swapped particle. */
            } else {
                i += 1;
            }
        }

        /* Advance any running flash envelope and its inversion budget. */
        if (this._flash) {
            this._flash.elapsed += dt;
            if (this._flash.inversionRemaining > 0) {
                this._flash.inversionRemaining -= dt;
            }
            if (this._flash.elapsed >= this._flash.total) {
                this._flash = null;
            }
        }
    }

    /**
     * Swap-remove compaction: overwrites slot i with the tail particle
     * and shrinks the dense prefix. O(1), allocation-free.
     * @param {number} i Slot to kill, i < count.
     * @private
     */
    _swapRemove(i) {
        const last = this._count - 1;
        if (i !== last) {
            this._px[i] = this._px[last];
            this._py[i] = this._py[last];
            this._vx[i] = this._vx[last];
            this._vy[i] = this._vy[last];
            this._gv[i] = this._gv[last];
            this._tv[i] = this._tv[last];
            this._age[i] = this._age[last];
            this._life[i] = this._life[last];
            this._phase[i] = this._phase[last];
            this._fg[i] = this._fg[last];
            this._glyph[i] = this._glyph[last];
            this._kind[i] = this._kind[last];
            this._lean[i] = this._lean[last];
        }
        this._count = last;
    }

    /**
     * Blended live-particle budget across the active transition.
     * @returns {number}
     * @private
     */
    _effectiveMaxLive() {
        const t = this._easedBlend();
        const from = this._fromProfile ? this._fromProfile.maxLive : this._toProfile.maxLive;
        return Math.round(from + (this._toProfile.maxLive - from) * t);
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER (BUFFER INJECTION)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Stamps all live weather particles into the world buffer and runs
     * the lightning inversion pass when a strike is in its inversion
     * window. Call AFTER terrain and entities, BEFORE buffer.commit().
     *
     * World→cell transform:
     *   col = floor((worldX - camX) / cellW)
     *   row = floor((worldY - camY) / cellH)
     *
     * @param {ASCIIBuffer} buffer Destination world buffer.
     * @param {WeatherCamera} [camera] Camera override; defaults to attached.
     * @returns {number} Number of particles drawn after culling.
     */
    render(buffer, camera = this._camera) {
        if (!(buffer instanceof ASCIIBuffer)) {
            throw new TypeError('[WeatherSystem] render requires an ASCIIBuffer.');
        }
        if (!camera) return 0;

        const camX = camera.x;
        const camY = camera.y;
        const cellW = this._cellW;
        const cellH = this._cellH;
        const flash = this.flashIntensity;
        /* Bright rain during a flash reads as illuminated sheets. */
        const brightRain = flash > 0.35;
        let drawn = 0;

        for (let i = 0; i < this._count; i += 1) {
            const col = Math.floor((this._px[i] - camX) / cellW);
            const row = Math.floor((this._py[i] - camY) / cellH);
            if (col < 0 || col >= buffer.cols || row < 0 || row >= buffer.rows) {
                continue;
            }

            let code = this._glyph[i];
            /* Wind-lean: falling streaks tilt into the gust direction.
             * Drizzle dots never lean. */
            if (this._lean[i] === 1 && code !== GLYPH_DOT) {
                if (this._windX < -RAIN_LEAN_THRESHOLD) code = GLYPH_LEAN_LEFT;
                else if (this._windX > RAIN_LEAN_THRESHOLD) code = GLYPH_LEAN_RIGHT;
                else code = GLYPH_VERTICAL;
            }

            let fg = this._fg[i];
            const kind = this._kind[i];
            if (brightRain && kind === PARTICLE_KIND.RAIN) {
                fg = FLASH_WHITE;
            } else if (kind !== PARTICLE_KIND.RAIN) {
                /* Spores and fog fade in and out over their lifetime:
                 * alpha = sin(π · age/life), zero at both ends. */
                const frac = Math.min(1, this._age[i] / this._life[i]);
                const alpha = Math.round(Math.sin(Math.PI * frac) * 255);
                fg = (fg & 0xFFFFFF00) | (alpha & 0xFF);
            }

            /* bg = null preserves whatever terrain color sits beneath. */
            buffer.setChar(col, row, code, fg, null);
            drawn += 1;
        }

        /* Lightning inversion pass: one-or-two-tick X-ray silhouette. */
        if (this._flash && this._flash.inversionRemaining > 0) {
            this._applyInversion(buffer, this._flash.region);
        }
        return drawn;
    }

    /**
     * Lightning inversion pass over a buffer region (or the full grid).
     * For every cell:
     *   - foreground and background colors swap;
     *   - a transparent background is replaced by FLASH_SKY so the sky
     *     itself appears to ignite instead of vanishing;
     *   - glyphs pass through INVERTED_GLYPHS for a glitch silhouette.
     * Reads use the buffer's typed-array views (read-only contract) and
     * writes go through setChar so dirty tracking stays intact. The next
     * tick's terrain restamp restores every cell; commit()'s diff filter
     * makes the round trip cost exactly two redraws per affected cell.
     * @param {ASCIIBuffer} buffer Target buffer.
     * @param {?{u0: number, u1: number}} region Viewport fractions or null.
     * @private
     */
    _applyInversion(buffer, region) {
        const cols = buffer.cols;
        const rows = buffer.rows;
        const x0 = region ? Math.max(0, Math.floor(region.u0 * cols)) : 0;
        const x1 = region ? Math.min(cols, Math.ceil(region.u1 * cols)) : cols;
        if (x0 >= x1) return;

        const chars = buffer.charCodes;
        const fgColors = buffer.foregroundColors;
        const bgColors = buffer.backgroundColors;

        for (let row = 0; row < rows; row += 1) {
            let index = row * cols + x0;
            for (let col = x0; col < x1; col += 1, index += 1) {
                const code = chars[index];
                const fg = fgColors[index];
                let bg = bgColors[index];
                /* Transparent background → ignite the sky cell. */
                if ((bg & 0xFF) === 0) bg = FLASH_SKY;
                const invertedCode = INVERTED_GLYPHS[code] ?? code;
                buffer.setChar(col, row, invertedCode, bg, fg);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       UTILITIES, METRICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Uniform random float in [min, max].
     * @param {number} min Lower bound.
     * @param {number} max Upper bound.
     * @returns {number}
     * @private
     */
    _randRange(min, max) {
        return min + this._rng() * (max - min);
    }

    /**
     * Instantly kills every particle (teleports, world shifts, reset).
     * @returns {this}
     */
    clearParticles() {
        this._count = 0;
        return this;
    }

    /** @returns {number} Currently live particle count. */
    get liveCount() {
        return this._count;
    }

    /** @returns {number} Pool capacity. */
    get poolCapacity() {
        return this._capacity;
    }

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll
     * at HUD rate, not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            liveParticles: this._count,
            poolCapacity: this._capacity,
            spawnedTotal: this._metrics.spawnedTotal,
            recycledTotal: this._metrics.recycledTotal,
            strikesTotal: this._metrics.strikesTotal,
            profileChanges: this._metrics.profileChanges,
            worldChanges: this._metrics.worldChanges,
            profile: this._toProfile.id,
            world: this._world,
            gloom: this.gloom,
            windX: Math.round(this._windX * 10) / 10,
            flashing: this.isFlashing,
            transitioning: this.isTransitioning,
            seed: this._seed
        };
    }

    /**
     * Restores pristine state: kills particles, clears flashes, and
     * reschedules timers without changing the active world/profile.
     * @returns {this}
     */
    reset() {
        this.clearParticles();
        this._flash = null;
        if (this._toProfile.lightning) {
            this._nextStrikeIn = this._sampleStrikeDelay(this._toProfile.lightning.meanInterval);
        }
        this._nextShiftIn = this._randRange(DREAM_DWELL_MIN, DREAM_DWELL_MAX);
        this._lastCamX = NaN;
        this._lastCamY = NaN;
        return this;
    }

    /**
     * Detaches the camera and drops all listeners. The system must not
     * be reused after destroy(); matches the InputManager teardown
     * contract for clean hot-module reloads and test isolation.
     * @returns {void}
     */
    destroy() {
        this._camera = null;
        this._listeners.clear();
        this.clearParticles();
    }
}

export default WeatherSystem;