/**
 * @file src/audio/SoundEffects.js
 * @module audio/SoundEffects
 * @description
 * Procedural sound-effect library and trigger system for "A Stitch in Time".
 *
 * SoundEffects is the GAME-FACING half of the zero-asset audio architecture.
 * AudioEngine owns the AudioContext, the bus hierarchy, the dual-world
 * soundtrack, and the raw voice factories; this module owns the CATALOG:
 * every named effect the simulation, combat, UI, and world systems fire,
 * synthesized live from oscillators and shaped noise — never from files.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATIONSHIP TO AUDIOENGINE
 * ───────────────────────────────────────────────────────────────────────────
 * SoundEffects is a trusted in-package consumer of AudioEngine internals.
 * The underscore contract it relies on is stable within src/audio/:
 *
 *     engine._ctx          the shared AudioContext
 *     engine._sfxGain      the SFX bus (under masterGain)
 *     engine._playTone()   oscillator voice factory (env + filter + pan)
 *     engine._playNoise()  noise voice factory (env + swept filter + pan)
 *     engine._beginSfx()   concurrency gate (MAX_CONCURRENT_SFX)
 *     engine._trackSource() node lifecycle registration ('ended' cleanup)
 *
 * All playback therefore inherits the engine's autoplay safety (locked
 * contexts return null voices), its distortion-protection ceiling, and its
 * leak-free source tracking automatically. SoundEffects adds the three
 * things a library layer must: NAMING, MODULATION, and SPACE.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE CATALOG
 * ───────────────────────────────────────────────────────────────────────────
 * Effects are registered by name with a category and a minimum re-trigger
 * interval (throttle), then dispatched through play():
 *
 *     UI        ui_click, ui_hover, ui_open, ui_close, ui_error,
 *               dialogue_tick, item_grab, item_equip, item_drop
 *     COMBAT    sword_swing, projectile_fire, laser_hum, hit_impact,
 *               hit_critical, player_hurt, death_dissolve, dodge_whoosh,
 *               footstep
 *     WORLD     reality_flicker, dimension_shift, juice_gulp, rain_splash
 *
 * The throttle is a spam guard, not a mixer: bullet-hell combat can demand
 * a dozen projectile fires per tick, and an unthrottled typewriter stream
 * would machine-gun the tick synth. Each name carries the smallest interval
 * at which it may legally re-fire; earlier requests are dropped silently.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DYNAMIC PITCH & GAIN MODULATION (ANTI-FATIGUE MATH)
 * ───────────────────────────────────────────────────────────────────────────
 * Repetitive effects (dialogue ticks, footsteps, rain, projectile spam)
 * fatigue the ear within seconds when sample-identical. Every voice passes
 * through a modulation stage before reaching the engine:
 *
 *     pitch:   f' = f · 2^(c/1200),   c = uniform(−P, +P) cents
 *     gain:    a' = a · (1 + uniform(−G, +G))
 *     rate:    noise playbackRate × (1 + uniform(−0.06, +0.06))
 *
 * P defaults to ±60 cents and G to ±12% (configurable). Sixty cents is a
 * semitone's worth of total spread — clearly varied, never off-key. The
 * randomness is seeded (mulberry32, the engine's own PRNG family), so a
 * shared seed reproduces the exact flavor of a session for tests.
 * Sweeping voices (freqEnd) receive the SAME cent offset as their start
 * frequency, so the sweep's contour is transposed intact instead of being
 * warped.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ENVELOPE SHAPING REFERENCE
 * ───────────────────────────────────────────────────────────────────────────
 * All voices use the engine's two-stage envelope, expressed in ADSR terms:
 *
 *     ATTACK   linear ramp from silence (0.0001) to peak over `attack`
 *              seconds — clicks use 1–4 ms, pads 50–130 ms.
 *     DECAY    single exponential ramp from peak back to 0.0001 across the
 *              remainder of `duration`. There is no sustain plateau in a
 *              one-shot; sustained voices (laser_hum, reality_flicker) are
 *              built as custom node graphs with explicit hold segments.
 *     RELEASE  implicit — exponential ramps asymptote, and every source
 *              carries an explicit stop() 50 ms past the ramp end so tails
 *              never click and never leak.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SPATIAL AUDIO / DISTANCE ATTENUATION
 * ───────────────────────────────────────────────────────────────────────────
 * Grid-space positioning uses a quadratic falloff with linear pan:
 *
 *     d    = √(Δx² + Δy²)                        world CSS pixels
 *     g(d) = (1 − clamp(d/D, 0, 1))^γ            γ = 2 (quadratic)
 *     pan  = clamp(Δx / D, −1, 1) · panStrength
 *
 * Quadratic attenuation spends its energy early: a strike two cells away
 * reads nearly full volume while one just past half range is already a
 * whisper — the weight curve bullet-hell telegraphs need. Sounds at or
 * beyond maxDistance are culled entirely (returning false), which is also
 * the off-screen culling policy for combat SFX. Pan divides by D rather
 * than viewport width so a sound at the falloff edge is always fully
 * staged; panStrength (0.85) keeps extreme panning from burying cues.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AMBIENT RAIN DRIPS (EMISSION ACCUMULATOR)
 * ───────────────────────────────────────────────────────────────────────────
 * Rain splashes are ambient texture, not events, so they use the same
 * fractional-emission pattern as WeatherSystem:
 *
 *     acc += intensity · maxDripsPerSecond · dt
 *     n    = min(3, floor(acc));  acc −= n
 *
 * update(dt) runs the accumulator; each drip is a rain_splash with a
 * randomized pan and gain so a storm builds texture instead of rhythm.
 *
 * @example
 * const sfx = new SoundEffects(audio, { seed: 20250 });
 *
 * // Combat:
 * combat.addEventListener('hit', ({ x, y, critical }) =>
 *     sfx.playSpatialSFX(critical ? 'hit_critical' : 'hit_impact',
 *         x, y, player.x, player.y, 640));
 *
 * // Dialogue typewriter (DialogueBox 'chartyped'):
 * dialogue.addEventListener('chartyped', () => sfx.play('dialogue_tick'));
 *
 * // World:
 * worlds.on('transitionstart', (status) =>
 *     sfx.play('dimension_shift', { direction: status.to }));
 * sfx.setRainIntensity(0.85);           // driven by WeatherSystem events
 *
 * // Per fixed tick (GameLoop):
 * sfx.update(dt);
 */

/* ══════════════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * mulberry32: the project-standard seeded 32-bit PRNG (identical family
 * to AudioEngine and WeatherSystem). Seeded modulation means a shared
 * seed reproduces a session's exact sonic flavor in tests and replays.
 * @param {number} seed Unsigned 32-bit seed.
 * @returns {() => number} Uniform floats in [0, 1).
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
 * Clamps a value into [0, 1].
 * @param {number} v Candidate.
 * @returns {number}
 */
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ══════════════════════════════════════════════════════════════════════════
   ENUMERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Effect categories (diagnostics and mixing policies).
 * @enum {string}
 */
export const SFX_CATEGORY = Object.freeze({
    UI: 'UI',
    COMBAT: 'COMBAT',
    WORLD: 'WORLD'
});

/**
 * Canonical effect names. Systems must reference these constants — never
 * raw strings — so a typo fails at import time instead of failing silent.
 * @enum {string}
 */
export const SFX_NAME = Object.freeze({
    UI_CLICK: 'ui_click',
    UI_HOVER: 'ui_hover',
    UI_OPEN: 'ui_open',
    UI_CLOSE: 'ui_close',
    UI_ERROR: 'ui_error',
    DIALOGUE_TICK: 'dialogue_tick',
    ITEM_GRAB: 'item_grab',
    ITEM_EQUIP: 'item_equip',
    ITEM_DROP: 'item_drop',
    SWORD_SWING: 'sword_swing',
    PROJECTILE_FIRE: 'projectile_fire',
    LASER_HUM: 'laser_hum',
    HIT_IMPACT: 'hit_impact',
    HIT_CRITICAL: 'hit_critical',
    PLAYER_HURT: 'player_hurt',
    DEATH_DISSOLVE: 'death_dissolve',
    DODGE_WHOOSH: 'dodge_whoosh',
    FOOTSTEP: 'footstep',
    REALITY_FLICKER: 'reality_flicker',
    DIMENSION_SHIFT: 'dimension_shift',
    JUICE_GULP: 'juice_gulp',
    RAIN_SPLASH: 'rain_splash'
});

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Default pitch jitter span, ±cents (60¢ = half a semitone each side). */
const DEFAULT_PITCH_JITTER_CENTS = 60;

/** Default gain jitter span, ±fraction (0.12 = ±12%). */
const DEFAULT_GAIN_JITTER = 0.12;

/** Noise playback-rate jitter span, ±fraction. */
const NOISE_RATE_JITTER = 0.06;

/** Default spatial falloff ceiling, world CSS pixels. */
const DEFAULT_MAX_DISTANCE = 640;

/** Quadratic falloff exponent γ (see header spatial math). */
const DEFAULT_ROLLOFF_EXPONENT = 2;

/** Pan staging strength: full edge placement scaled to 85%. */
const DEFAULT_PAN_STRENGTH = 0.85;

/** Ambient rain drip ceiling, drips per second at intensity 1. */
const RAIN_MAX_DRIPS_PER_SECOND = 14;

/** Per-tick drip cap: a stalled frame never dumps a splash burst. */
const RAIN_MAX_DRIPS_PER_TICK = 3;

/* ══════════════════════════════════════════════════════════════════════════
   SOUND EFFECTS LIBRARY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Named-effect SFX library: catalog registration, anti-fatigue modulation,
 * spatial attenuation, and ambient drip emission — all routed through an
 * AudioEngine's SFX bus.
 */
export class SoundEffects {
    /**
     * @param {import('./AudioEngine.js').AudioEngine} engine
     *   The initialized AudioEngine. Its AudioContext and SFX gain
     *   hierarchy are used directly; playback inherits the engine's
     *   autoplay gating and concurrency ceiling.
     * @param {Object} [options]
     * @param {number} [options.seed] PRNG seed; time-seeded when omitted.
     * @param {number} [options.pitchJitterCents=60] ± pitch variation, cents.
     * @param {number} [options.gainJitter=0.12] ± gain variation, fraction.
     * @param {number} [options.masterScale=1] Library-wide gain multiplier.
     * @param {number} [options.maxDistance=640] Default spatial ceiling, px.
     * @param {number} [options.rolloffExponent=2] Falloff curve exponent γ.
     * @param {number} [options.panStrength=0.85] Pan staging strength [0, 1].
     * @throws {TypeError|RangeError} If the engine or options are invalid.
     */
    constructor(engine, options = {}) {
        if (!engine || typeof engine._playTone !== 'function' ||
            typeof engine._playNoise !== 'function') {
            throw new TypeError(
                '[SoundEffects] A booted-or-bootable AudioEngine instance is required.'
            );
        }
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[SoundEffects] options must be an object.');
        }

        /** @type {import('./AudioEngine.js').AudioEngine} */
        this._engine = engine;
        /**
         * Silent mode: the AudioEngine itself degrades to a mute no-op when
         * the Web Audio API is unavailable (sandboxed frames, embedded
         * webviews, audio-blocked permissions). The SFX library must degrade
         * the same way rather than abort the whole engine bootstrap — a
         * muted game is playable; a dead one is not.
         * @type {boolean}
         */
        this._silent = engine._ctx == null;
        /** @type {?AudioContext} Shared audio clock and node factory. */
        this._ctx = engine._ctx ?? null;
        /** @type {?GainNode} Destination bus (engine SFX chain). */
        this._bus = engine._sfxGain ?? null;

        /* ---- Deterministic randomness -------------------------------- */
        const seed = Number.isInteger(options.seed)
            ? options.seed
            : ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
        /** @type {() => number} */
        this._rng = mulberry32(seed);
        /** @type {number} */
        this._seed = seed;

        /* ---- Modulation configuration --------------------------------- */
        const pitchJitter = options.pitchJitterCents ?? DEFAULT_PITCH_JITTER_CENTS;
        if (!Number.isFinite(pitchJitter) || pitchJitter < 0 || pitchJitter > 600) {
            throw new RangeError('[SoundEffects] pitchJitterCents must be in [0, 600].');
        }
        /** @type {number} ± pitch jitter, cents. */
        this._pitchJitterCents = pitchJitter;

        const gainJitter = options.gainJitter ?? DEFAULT_GAIN_JITTER;
        if (!Number.isFinite(gainJitter) || gainJitter < 0 || gainJitter > 0.5) {
            throw new RangeError('[SoundEffects] gainJitter must be in [0, 0.5].');
        }
        /** @type {number} ± gain jitter, fraction. */
        this._gainJitter = gainJitter;

        const masterScale = options.masterScale ?? 1;
        if (!Number.isFinite(masterScale) || masterScale < 0 || masterScale > 2) {
            throw new RangeError('[SoundEffects] masterScale must be in [0, 2].');
        }
        /** @type {number} Library-wide gain multiplier. */
        this._masterScale = masterScale;

        /* ---- Spatial configuration ------------------------------------- */
        const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
        if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
            throw new RangeError('[SoundEffects] maxDistance must be positive.');
        }
        /** @type {number} Default spatial falloff ceiling, CSS px. */
        this._maxDistance = maxDistance;

        const rolloff = options.rolloffExponent ?? DEFAULT_ROLLOFF_EXPONENT;
        if (!Number.isFinite(rolloff) || rolloff < 0.5 || rolloff > 4) {
            throw new RangeError('[SoundEffects] rolloffExponent must be in [0.5, 4].');
        }
        /** @type {number} Falloff exponent γ. */
        this._rolloffExponent = rolloff;

        const panStrength = options.panStrength ?? DEFAULT_PAN_STRENGTH;
        if (!Number.isFinite(panStrength) || panStrength < 0 || panStrength > 1) {
            throw new RangeError('[SoundEffects] panStrength must be in [0, 1].');
        }
        /** @type {number} Pan staging strength. */
        this._panStrength = panStrength;

        /* ---- Runtime state ---------------------------------------------- */
        /** @type {?{gainScale: number, pan: ?number, filter: ?Object}}
         *  Per-dispatch spatial/modulation context, read by _tone/_noise. */
        this._active = null;
        /** @type {?{x: number, y: number}} Attached spatial listener. */
        this._listener = null;
        /** @type {Map<string, number>} Throttle: name → last fire (ctx time). */
        this._lastPlayedAt = new Map();
        /** @type {Set<string>} Names already warned about (warn-once). */
        this._warnedNames = new Set();
        /** @type {boolean} Teardown latch. */
        this._destroyed = false;

        /* ---- Ambient rain drip emission ----------------------------------- */
        /** @type {number} Rain intensity [0, 1]; 0 disables drips. */
        this._rainIntensity = 0;
        /** @type {number} Fractional drip accumulator (WeatherSystem pattern). */
        this._rainAccumulator = 0;

        /* ---- Library registry ----------------------------------------------- */
        /** @type {Map<string, {fn: Function, category: string, minInterval: number}>} */
        this._library = new Map();
        /** @type {Map<string, number>} Lifetime play counters (capped). */
        this._playCounts = new Map();
        /** @type {number} Total effects dispatched. */
        this._totalPlays = 0;

        this._registerBuiltinLibrary();
    }

    /* ══════════════════════════════════════════════════════════════════
       CONFIGURATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Sets the pitch jitter span for anti-fatigue modulation.
     * @param {number} cents ± variation in cents, [0, 600].
     * @returns {this}
     */
    setPitchJitter(cents) {
        if (!Number.isFinite(cents) || cents < 0 || cents > 600) {
            throw new RangeError('[SoundEffects] pitch jitter must be in [0, 600].');
        }
        this._pitchJitterCents = cents;
        return this;
    }

    /**
     * Sets the gain jitter span for anti-fatigue modulation.
     * @param {number} fraction ± variation, [0, 0.5].
     * @returns {this}
     */
    setGainJitter(fraction) {
        if (!Number.isFinite(fraction) || fraction < 0 || fraction > 0.5) {
            throw new RangeError('[SoundEffects] gain jitter must be in [0, 0.5].');
        }
        this._gainJitter = fraction;
        return this;
    }

    /**
     * Sets the default spatial falloff ceiling.
     * @param {number} distance Positive CSS pixels.
     * @returns {this}
     */
    setDefaultMaxDistance(distance) {
        if (!Number.isFinite(distance) || distance <= 0) {
            throw new RangeError('[SoundEffects] maxDistance must be positive.');
        }
        this._maxDistance = distance;
        return this;
    }

    /**
     * Attaches the spatial listener (player or camera). Any object with
     * numeric x/y is accepted; read live at each playAt() call, so a
     * moving camera needs no re-attachment.
     * @param {?{x: number, y: number}} listener Listener or null.
     * @returns {this}
     */
    attachListener(listener) {
        if (listener !== null &&
            (!Number.isFinite(listener.x) || !Number.isFinite(listener.y))) {
            throw new TypeError('[SoundEffects] listener must expose numeric x and y.');
        }
        this._listener = listener;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       LIBRARY REGISTRATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers one named effect.
     * @param {string} name Effect name (use SFX_NAME constants).
     * @param {string} category SFX_CATEGORY value.
     * @param {number} minInterval Minimum seconds between re-fires (0 = none).
     * @param {(sfx: SoundEffects, opts: Object) => void} generator
     *   Synthesis routine; builds voices through sfx._tone/_noise/_custom.
     * @returns {this}
     * @private
     */
    _define(name, category, minInterval, generator) {
        this._library.set(name, Object.freeze({
            fn: generator,
            category,
            minInterval: Math.max(0, minInterval)
        }));
        return this;
    }

    /**
     * Registers (or replaces) a custom effect at runtime. This is the
     * public extension point: quest-specific stingers and boss telegraph
     * cues install here without modifying the built-in catalog.
     * @param {string} name Unique effect name.
     * @param {(sfx: SoundEffects, opts: Object) => void} generator
     * @param {Object} [spec]
     * @param {string} [spec.category='WORLD'] SFX_CATEGORY value.
     * @param {number} [spec.minInterval=0] Throttle interval, seconds.
     * @returns {this}
     */
    register(name, generator, spec = {}) {
        if (typeof name !== 'string' || name.length === 0) {
            throw new TypeError('[SoundEffects] effect name must be a non-empty string.');
        }
        if (typeof generator !== 'function') {
            throw new TypeError('[SoundEffects] generator must be a function.');
        }
        const category = Object.values(SFX_CATEGORY).includes(spec.category)
            ? spec.category
            : SFX_CATEGORY.WORLD;
        this._define(name, category, spec.minInterval ?? 0, generator);
        return this;
    }

    /**
     * @param {string} name Effect name.
     * @returns {boolean} True when the catalog contains the effect.
     */
    has(name) {
        return this._library.has(name);
    }

    /* ══════════════════════════════════════════════════════════════════
       DISPATCH
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Plays a named effect with optional modulation overrides.
     *
     * Pipeline: engine gate → throttle → spatial/modulation context →
     * generator dispatch. The generator runs synchronously with an
     * active context object that _tone/_noise read, so spatial pan,
     * distance gain, and distance filtering shape EVERY voice the
     * generator builds without per-call-site plumbing.
     *
     * @param {string} name Effect name (SFX_NAME constant).
     * @param {Object} [opts]
     * @param {number} [opts.gainScale=1] Additional gain multiplier.
     * @param {?number} [opts.pan=null] Explicit pan override, −1..1.
     * @param {?Object} [opts.filter=null] Distance-dulling filter override
     *   ({type, freq, Q}) applied to voices without their own filter.
     * @param {number} [opts.intensity=0.6] Generic strength 0..1 (impacts).
     * @param {number} [opts.duration] Voice-length override where supported.
     * @param {string} [opts.direction] dimension_shift direction.
     * @param {boolean} [opts.jitter=true] Disable per-voice modulation.
     * @returns {boolean} True if the effect was dispatched.
     */
    play(name, opts = {}) {
        if (this._destroyed || this._silent || this._engine.isLocked) return false;
        const entry = this._library.get(name);
        if (!entry) {
            if (!this._warnedNames.has(name)) {
                this._warnedNames.add(name);
                if (this._warnedNames.size <= 32) {
                    console.warn(`[SoundEffects] Unknown effect: '${name}'.`);
                }
            }
            return false;
        }

        /* Throttle gate (audio clock — immune to tick-rate drift). */
        const now = this._ctx.currentTime;
        if (entry.minInterval > 0) {
            const last = this._lastPlayedAt.get(name);
            if (last !== undefined && now - last < entry.minInterval) {
                return false;
            }
        }
        this._lastPlayedAt.set(name, now);

        /* Per-dispatch context: spatial shaping read by all voice helpers. */
        this._active = {
            gainScale: Number.isFinite(opts.gainScale) ? Math.max(0, opts.gainScale) : 1,
            pan: Number.isFinite(opts.pan) ? Math.max(-1, Math.min(1, opts.pan)) : null,
            filter: opts.filter && typeof opts.filter === 'object' ? opts.filter : null
        };
        try {
            entry.fn(this, opts);
        } catch (error) {
            console.error(`[SoundEffects] generator '${name}' failed:`, error);
            return false;
        } finally {
            this._active = null;
        }

        /* Diagnostics (capped map so pathological names can't grow it). */
        this._totalPlays += 1;
        if (this._playCounts.size < 256 || this._playCounts.has(name)) {
            this._playCounts.set(name, (this._playCounts.get(name) ?? 0) + 1);
        }
        return true;
    }

    /**
     * Plays an effect positioned in world space relative to an explicit
     * listener point. See header spatial math:
     *
     *     g = (1 − d/D)^γ,  pan = clamp(Δx/D, −1, 1) · panStrength
     *
     * Sounds at or beyond maxDistance are culled (off-screen policy).
     * @param {string} soundName Effect name.
     * @param {number} sourceX Source world x, CSS px.
     * @param {number} sourceY Source world y, CSS px.
     * @param {number} listenerX Listener world x, CSS px.
     * @param {number} listenerY Listener world y, CSS px.
     * @param {number} [maxDistance] Falloff ceiling; defaults to configured.
     * @param {Object} [opts] Additional play() options.
     * @returns {boolean} True if dispatched (false when culled).
     */
    playSpatialSFX(soundName, sourceX, sourceY, listenerX, listenerY, maxDistance, opts = {}) {
        if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY) ||
            !Number.isFinite(listenerX) || !Number.isFinite(listenerY)) {
            return false;
        }
        const range = Number.isFinite(maxDistance) && maxDistance > 0
            ? maxDistance
            : this._maxDistance;

        const dx = sourceX - listenerX;
        const dy = sourceY - listenerY;
        const distance = Math.hypot(dx, dy);
        if (distance >= range) return false;

        /* Quadratic falloff: early energy, fast tail (header formula). */
        const normalized = distance / range;
        const gain = Math.pow(1 - normalized, this._rolloffExponent);
        const pan = Math.max(-1, Math.min(1, dx / range)) * this._panStrength;

        return this.play(soundName, {
            ...opts,
            gainScale: (Number.isFinite(opts.gainScale) ? opts.gainScale : 1) * gain,
            pan: Number.isFinite(opts.pan) ? opts.pan : pan
        });
    }

    /**
     * Convenience spatial dispatch against the ATTACHED listener
     * (playAt → playSpatialSFX). Falls back to a plain non-spatial play
     * when no listener is attached.
     * @param {string} soundName Effect name.
     * @param {number} sourceX Source world x.
     * @param {number} sourceY Source world y.
     * @param {Object} [opts] Additional play() options.
     * @returns {boolean}
     */
    playAt(soundName, sourceX, sourceY, opts = {}) {
        const listener = this._listener;
        if (!listener || !Number.isFinite(listener.x) || !Number.isFinite(listener.y)) {
            return this.play(soundName, opts);
        }
        return this.playSpatialSFX(
            soundName, sourceX, sourceY,
            listener.x, listener.y,
            opts.maxDistance ?? this._maxDistance, opts
        );
    }

    /* ══════════════════════════════════════════════════════════════════
       VOICE HELPERS (MODULATION STAGE)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws a uniform pitch offset in cents: uniform(−P, +P).
     * @returns {number} Cents offset.
     * @private
     */
    _cents() {
        return (this._rng() * 2 - 1) * this._pitchJitterCents;
    }

    /**
     * Draws a uniform gain multiplier: 1 + uniform(−G, +G).
     * @returns {number}
     * @private
     */
    _gainJit() {
        return 1 + (this._rng() * 2 - 1) * this._gainJitter;
    }

    /**
     * Builds one modulated oscillator voice through the engine factory.
     * Applies the anti-fatigue transform (header math): the same cent
     * offset transposes BOTH freq and freqEnd so sweep contours survive,
     * the active spatial context scales peak and supplies pan/filter,
     * and the library master scale closes the chain.
     * @param {Object} spec Voice spec (type, freq, freqEnd, duration,
     *   attack, peak, at, pan, filter, force, jitter).
     * @returns {?OscillatorNode} The spawned source, or null when gated.
     * @private
     */
    _tone(spec) {
        const active = this._active;
        const jitterEnabled = spec.jitter !== false;
        const cents = jitterEnabled ? this._cents() : 0;
        const transpose = Math.pow(2, cents / 1200);
        const peak = clamp01(
            (spec.peak ?? 0.2) *
            (active ? active.gainScale : 1) *
            (jitterEnabled ? this._gainJit() : 1) *
            this._masterScale
        );
        return this._engine._playTone({
            type: spec.type ?? 'sine',
            freq: Math.max(1, (spec.freq ?? 440) * transpose),
            freqEnd: Number.isFinite(spec.freqEnd)
                ? Math.max(1, spec.freqEnd * transpose)
                : null,
            duration: spec.duration ?? 0.2,
            attack: spec.attack ?? 0.004,
            peak,
            startTime: Number.isFinite(spec.at) ? spec.at : undefined,
            dest: this._bus,
            pan: spec.pan ?? (active ? active.pan : null),
            filter: spec.filter ?? (active ? active.filter : null),
            force: Boolean(spec.force)
        });
    }

    /**
     * Builds one modulated noise voice through the engine factory. Noise
     * receives playback-rate jitter in addition to gain jitter, which
     * shifts its spectral character subtly per instance.
     * @param {Object} spec Voice spec (duration, attack, peak, at, pan,
     *   filter {type, freq, freqEnd, Q}, playbackRate, force, jitter).
     * @returns {?AudioBufferSourceNode} The spawned source, or null.
     * @private
     */
    _noise(spec) {
        const active = this._active;
        const jitterEnabled = spec.jitter !== false;
        const rateJitter = jitterEnabled
            ? 1 + (this._rng() * 2 - 1) * NOISE_RATE_JITTER
            : 1;
        const peak = clamp01(
            (spec.peak ?? 0.2) *
            (active ? active.gainScale : 1) *
            (jitterEnabled ? this._gainJit() : 1) *
            this._masterScale
        );
        return this._engine._playNoise({
            duration: spec.duration ?? 0.2,
            attack: spec.attack ?? 0.003,
            peak,
            playbackRate: (spec.playbackRate ?? 1) * rateJitter,
            startTime: Number.isFinite(spec.at) ? spec.at : undefined,
            dest: this._bus,
            pan: spec.pan ?? (active ? active.pan : null),
            filter: spec.filter ?? (active ? active.filter : null),
            force: Boolean(spec.force)
        });
    }

    /**
     * Admission gate for custom multi-node voices (laser hum, flicker
     * drone). Mirrors the engine's concurrency policy.
     * @param {boolean} [force=false] Bypass the concurrency ceiling.
     * @returns {boolean} True if the voice may be built.
     * @private
     */
    _begin(force = false) {
        return this._engine._beginSfx(Boolean(force));
    }

    /**
     * Registers a custom-built source for lifecycle cleanup.
     * @param {AudioScheduledSourceNode} node Oscillator or buffer source.
     * @private
     */
    _track(node) {
        this._engine._trackSource(node);
    }

    /* ══════════════════════════════════════════════════════════════════
       AMBIENT RAIN DRIPS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Sets the ambient drip rate. Wire this to WeatherSystem profile
     * events (or the HUD rain slider). Zero stops drips immediately.
     * @param {number} level Intensity [0, 1].
     * @returns {this}
     */
    setRainIntensity(level) {
        if (!Number.isFinite(level)) return this;
        this._rainIntensity = clamp01(level);
        if (this._rainIntensity === 0) this._rainAccumulator = 0;
        return this;
    }

    /**
     * Advances the ambient drip accumulator by one fixed tick
     * (fractional emission, WeatherSystem pattern — see header).
     * CONTRACT: call once per simulation tick from the GameLoop update.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (this._destroyed || !Number.isFinite(dt) || dt <= 0) return this;
        if (this._rainIntensity <= 0 || this._engine.isLocked) return this;

        this._rainAccumulator +=
            this._rainIntensity * RAIN_MAX_DRIPS_PER_SECOND * dt;
        let n = Math.floor(this._rainAccumulator);
        this._rainAccumulator -= n;
        if (n > RAIN_MAX_DRIPS_PER_TICK) {
            n = RAIN_MAX_DRIPS_PER_TICK;
            this._rainAccumulator = 0;
        }
        for (let i = 0; i < n; i += 1) {
            /* Random staging: drips land anywhere in the stereo field at
             * varied closeness, building texture instead of rhythm. */
            this.play(SFX_NAME.RAIN_SPLASH, {
                pan: this._rng() * 2 - 1,
                gainScale: 0.3 + this._rng() * 0.7
            });
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       BUILTIN CATALOG — UI EFFECTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers the full built-in catalog. Generators are ordered UI →
     * COMBAT → WORLD to match SFX_NAME. Each generator composes voices
     * through _tone/_noise so modulation and spatial shaping apply
     * uniformly; bespoke multi-node voices gate through _begin/_track.
     * @private
     */
    _registerBuiltinLibrary() {
        /* ---- UI_CLICK: crisp menu confirm --------------------------------
         * A 30 ms square chirp down through 660 Hz plus a 12 ms high-pass
         * noise tick. The noise transient supplies the "click" edge; the
         * square body supplies the pitch the ear remembers. */
        this._define(SFX_NAME.UI_CLICK, SFX_CATEGORY.UI, 0.03, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({
                type: 'square', freq: 880, freqEnd: 660,
                duration: 0.03, attack: 0.002, peak: 0.09, at: t0
            });
            sfx._noise({
                duration: 0.012, attack: 0.001, peak: 0.06, at: t0,
                filter: { type: 'highpass', freq: 4200 }
            });
        });

        /* ---- UI_HOVER: quiet upward chirp --------------------------------
         * Sine glides 1400→1750 Hz in 22 ms at whisper level. Deliberately
         * 6 dB below UI_CLICK so hovering never competes with selecting. */
        this._define(SFX_NAME.UI_HOVER, SFX_CATEGORY.UI, 0.045, (sfx) => {
            sfx._tone({
                type: 'sine', freq: 1400, freqEnd: 1750,
                duration: 0.022, attack: 0.003, peak: 0.035
            });
        });

        /* ---- UI_OPEN: rising triad ---------------------------------------
         * A major arpeggio (A4 C#5 E5) at 45 ms spacing reads as "space
         * opening up" for inventory/quest panels. */
        this._define(SFX_NAME.UI_OPEN, SFX_CATEGORY.UI, 0.08, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            const notes = [440, 554.37, 659.25];
            for (let i = 0; i < notes.length; i += 1) {
                sfx._tone({
                    type: 'triangle', freq: notes[i],
                    duration: 0.07, attack: 0.004, peak: 0.08,
                    at: t0 + i * 0.045
                });
            }
        });

        /* ---- UI_CLOSE: falling triad --------------------------------------
         * The exact inversion of UI_OPEN (E5 C#5 A4) — closing a panel
         * audibly undoes opening one. */
        this._define(SFX_NAME.UI_CLOSE, SFX_CATEGORY.UI, 0.08, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            const notes = [659.25, 554.37, 440];
            for (let i = 0; i < notes.length; i += 1) {
                sfx._tone({
                    type: 'triangle', freq: notes[i],
                    duration: 0.07, attack: 0.004, peak: 0.07,
                    at: t0 + i * 0.04
                });
            }
        });

        /* ---- UI_ERROR: low double buzz -------------------------------------
         * Two 220 Hz square pulses — the universal "that did nothing". */
        this._define(SFX_NAME.UI_ERROR, SFX_CATEGORY.UI, 0.12, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'square', freq: 220, duration: 0.08, peak: 0.08, at: t0 });
            sfx._tone({ type: 'square', freq: 196, duration: 0.1, peak: 0.08, at: t0 + 0.09 });
        });

        /* ---- DIALOGUE_TICK: typewriter needle ------------------------------
         * 18 ms square at ~1.9 kHz. Heavy pitch jitter (per-voice override)
         * keeps a fast charsPerSecond stream reading as mechanical texture
         * rather than a metronome. Throttled to ~35 Hz. */
        this._define(SFX_NAME.DIALOGUE_TICK, SFX_CATEGORY.UI, 0.028, (sfx) => {
            sfx._tone({
                type: 'square', freq: 1900,
                duration: 0.018, attack: 0.002, peak: 0.045
            });
        });

        /* ---- ITEM_GRAB: pickup double-blip + rustle -------------------------
         * Two fast rising sines (the "take") under a band-passed rustle
         * (the hand-on-cloth transient). */
        this._define(SFX_NAME.ITEM_GRAB, SFX_CATEGORY.UI, 0.07, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sine', freq: 520, freqEnd: 620, duration: 0.05, peak: 0.11, at: t0 });
            sfx._tone({ type: 'sine', freq: 660, freqEnd: 780, duration: 0.07, peak: 0.11, at: t0 + 0.05 });
            sfx._noise({
                duration: 0.06, attack: 0.004, peak: 0.06, at: t0,
                filter: { type: 'bandpass', freq: 1300, Q: 0.8 }
            });
        });

        /* ---- ITEM_EQUIP: metallic ping + settle whoosh ------------------------
         * Bell approximation (fundamental + inharmonic 3.01× partial) with
         * a soft noise swell underneath — the "it fits" moment. */
        this._define(SFX_NAME.ITEM_EQUIP, SFX_CATEGORY.UI, 0.1, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sine', freq: 784, duration: 0.32, peak: 0.12, at: t0 });
            sfx._tone({ type: 'sine', freq: 784 * 3.01, duration: 0.18, peak: 0.04, at: t0 });
            sfx._noise({
                duration: 0.2, attack: 0.05, peak: 0.05, at: t0,
                filter: { type: 'bandpass', freq: 2400, Q: 0.7 }
            });
        });

        /* ---- ITEM_DROP: falling blip + floor thud ------------------------------- */
        this._define(SFX_NAME.ITEM_DROP, SFX_CATEGORY.UI, 0.08, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sine', freq: 420, freqEnd: 180, duration: 0.1, peak: 0.1, at: t0 });
            sfx._tone({ type: 'sine', freq: 90, duration: 0.09, peak: 0.12, at: t0 + 0.1 });
            sfx._noise({
                duration: 0.04, peak: 0.06, at: t0 + 0.1,
                filter: { type: 'lowpass', freq: 900 }
            });
        });

        /* ---- COMBAT: SWORD_SWING ----------------------------------------------
         * Band-passed noise swept 300→2600 Hz (the blade cutting air) over a
         * 90 Hz sub accent for physical weight. opts.swing sign flips the
         * sweep direction so alternating slashes alternate timbre. */
        this._define(SFX_NAME.SWORD_SWING, SFX_CATEGORY.COMBAT, 0.06, (sfx, opts) => {
            const reversed = opts.swing === 'backhand';
            sfx._noise({
                duration: 0.13, attack: 0.015, peak: 0.2,
                filter: {
                    type: 'bandpass',
                    freq: reversed ? 2600 : 300,
                    freqEnd: reversed ? 300 : 2600,
                    Q: 1.1
                }
            });
            sfx._tone({ type: 'sine', freq: 95, duration: 0.06, peak: 0.1 });
        });

        /* ---- PROJECTILE_FIRE: launch chirp + spark -------------------------------
         * Square falling 640→210 Hz with a 2 ms high-pass spark. The heaviest
         * jitter in the catalog: bullet-hell fires dozens per second and
         * identical launches read as one stuck note. */
        this._define(SFX_NAME.PROJECTILE_FIRE, SFX_CATEGORY.COMBAT, 0.02, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'square', freq: 640, freqEnd: 210, duration: 0.09, peak: 0.09, at: t0 });
            sfx._noise({
                duration: 0.02, peak: 0.05, at: t0,
                filter: { type: 'highpass', freq: 3200 }
            });
        });

        /* ---- LASER_HUM: boss beam sustain -----------------------------------------
         * Custom multi-node voice: two detuned saws (110 Hz and its 2.01×
         * harmonic) through a resonant band-pass, with a 6 Hz vibrato LFO on
         * the fundamental and an explicit ADSR hold (0.05 s attack, flat
         * sustain, 0.15 s release). Duration scales with the telegraph. */
        this._define(SFX_NAME.LASER_HUM, SFX_CATEGORY.COMBAT, 0.15, (sfx, opts) => {
            if (!sfx._begin(Boolean(opts.force))) return;
            const ctx = sfx._ctx;
            const t0 = ctx.currentTime;
            const duration = Number.isFinite(opts.duration)
                ? Math.min(4, Math.max(0.2, opts.duration))
                : 0.9;
            const baseFreq = Number.isFinite(opts.freq) ? opts.freq : 110;
            const active = sfx._active;
            const gainScale = (active ? active.gainScale : 1) * sfx._masterScale;

            const shaper = ctx.createBiquadFilter();
            shaper.type = 'bandpass';
            shaper.frequency.value = 820;
            shaper.Q.value = 1.4;

            const env = ctx.createGain();
            env.gain.setValueAtTime(0.0001, t0);
            env.gain.linearRampToValueAtTime(clamp01(0.16 * gainScale), t0 + 0.05);
            env.gain.setValueAtTime(clamp01(0.16 * gainScale), t0 + duration);
            env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.15);

            const panner = sfx._engine._makePan(active ? active.pan : null);
            shaper.connect(env);
            if (panner) {
                env.connect(panner);
                panner.connect(sfx._bus);
            } else {
                env.connect(sfx._bus);
            }

            const partials = [1, 2.01];
            for (let i = 0; i < partials.length; i += 1) {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = baseFreq * partials[i];
                const partialGain = ctx.createGain();
                partialGain.gain.value = i === 0 ? 0.6 : 0.25;
                osc.connect(partialGain);
                partialGain.connect(shaper);
                osc.start(t0);
                osc.stop(t0 + duration + 0.25);
                sfx._track(osc);
            }

            /* Vibrato: 6 Hz sine wobbling the fundamental ±9 Hz. */
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 6;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 9;
            lfo.connect(lfoGain);
            lfoGain.connect(shaper.frequency);
            lfo.start(t0);
            lfo.stop(t0 + duration + 0.25);
            sfx._track(lfo);
        });

        /* ---- HIT_IMPACT: thump + transient -------------------------------------------
         * opts.intensity scales both layers; the low sine drops 170→42 Hz
         * while a high-passed click marks the contact frame. */
        this._define(SFX_NAME.HIT_IMPACT, SFX_CATEGORY.COMBAT, 0.03, (sfx, opts) => {
            const level = clamp01(Number.isFinite(opts.intensity) ? opts.intensity : 0.6);
            const t0 = sfx._ctx.currentTime;
            sfx._tone({
                type: 'sine', freq: 170 + 70 * level, freqEnd: 42,
                duration: 0.2 + 0.14 * level, peak: 0.16 + 0.2 * level, at: t0
            });
            sfx._noise({
                duration: 0.03, peak: 0.08 + 0.12 * level, at: t0,
                filter: { type: 'highpass', freq: 2600 }
            });
        });

        /* ---- HIT_CRITICAL: bright sting ------------------------------------------------
         * Two fast high sines under a bell tail — the "that counted" flash
         * paired with the floating damage number. */
        this._define(SFX_NAME.HIT_CRITICAL, SFX_CATEGORY.COMBAT, 0.06, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sine', freq: 988, duration: 0.05, peak: 0.13, at: t0 });
            sfx._tone({ type: 'sine', freq: 1319, duration: 0.09, peak: 0.13, at: t0 + 0.05 });
            sfx._tone({ type: 'sine', freq: 1318.5, duration: 0.4, peak: 0.09, at: t0 + 0.1 });
            sfx._tone({ type: 'sine', freq: 1318.5 * 2.7, duration: 0.22, peak: 0.03, at: t0 + 0.1 });
        });

        /* ---- PLAYER_HURT: gut-punch sweep ----------------------------------------------- */
        this._define(SFX_NAME.PLAYER_HURT, SFX_CATEGORY.COMBAT, 0.1, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sawtooth', freq: 300, freqEnd: 85, duration: 0.2, peak: 0.17, at: t0 });
            sfx._noise({
                duration: 0.05, peak: 0.12, at: t0,
                filter: { type: 'bandpass', freq: 1700, Q: 1.2 }
            });
        });

        /* ---- DEATH_DISSOLVE: unraveling ----------------------------------------------------
         * Two detuned saws collapse 220→38 Hz while high-passed noise hisses
         * away above — a thread coming loose, matching the dissolve VFX. */
        this._define(SFX_NAME.DEATH_DISSOLVE, SFX_CATEGORY.COMBAT, 0.2, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._tone({ type: 'sawtooth', freq: 220, freqEnd: 38, duration: 0.7, peak: 0.16, at: t0 });
            sfx._tone({ type: 'sawtooth', freq: 226, freqEnd: 36, duration: 0.75, peak: 0.1, at: t0 });
            sfx._noise({
                duration: 0.5, attack: 0.02, peak: 0.1, at: t0 + 0.1,
                filter: { type: 'highpass', freq: 2200 }
            });
        });

        /* ---- DODGE_WHOOSH: upward air displacement ------------------------------------------- */
        this._define(SFX_NAME.DODGE_WHOOSH, SFX_CATEGORY.COMBAT, 0.08, (sfx) => {
            sfx._noise({
                duration: 0.22, attack: 0.03, peak: 0.13,
                filter: { type: 'bandpass', freq: 500, freqEnd: 2400, Q: 1.1 }
            });
        });

        /* ---- FOOTSTEP: alternating filtered taps -----------------------------------------------
         * Internal alternator flips the low-pass corner per step (left/right
         * character) with rate jitter so a sprint never locks into a loop. */
        this._define(SFX_NAME.FOOTSTEP, SFX_CATEGORY.COMBAT, 0.09, (sfx) => {
            sfx._stepFoot = !sfx._stepFoot;
            sfx._noise({
                duration: 0.06, attack: 0.004, peak: 0.08,
                filter: { type: 'lowpass', freq: sfx._stepFoot ? 720 : 940 }
            });
        });

        /* ---- WORLD: REALITY_FLICKER -------------------------------------------------------------
         * Custom voice: two beating triangles (55 Hz against 57.3 Hz) create
         * a slow throb, amplitude-modulated by a 9 Hz tremolo LFO — the sound
         * of the orange reserve fraying. opts.duration extends it for long
         * EnergySystem flicker warnings. */
        this._define(SFX_NAME.REALITY_FLICKER, SFX_CATEGORY.WORLD, 0.2, (sfx, opts) => {
            if (!sfx._begin(Boolean(opts.force))) return;
            const ctx = sfx._ctx;
            const t0 = ctx.currentTime;
            const duration = Number.isFinite(opts.duration)
                ? Math.min(6, Math.max(0.3, opts.duration))
                : 1.2;
            const active = sfx._active;
            const gainScale = (active ? active.gainScale : 1) * sfx._masterScale;

            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 320;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0.0001, t0);
            env.gain.linearRampToValueAtTime(clamp01(0.11 * gainScale), t0 + 0.12);
            env.gain.setValueAtTime(clamp01(0.11 * gainScale), t0 + duration);
            env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.25);

            /* Tremolo: 9 Hz LFO swinging the envelope ±40%. */
            const trem = ctx.createOscillator();
            trem.type = 'sine';
            trem.frequency.value = 9;
            const tremGain = ctx.createGain();
            tremGain.gain.value = clamp01(0.044 * gainScale);
            trem.connect(tremGain);
            tremGain.connect(env.gain);

            const panner = sfx._engine._makePan(active ? active.pan : null);
            lowpass.connect(env);
            if (panner) {
                env.connect(panner);
                panner.connect(sfx._bus);
            } else {
                env.connect(sfx._bus);
            }

            const frequencies = [55, 57.3];
            for (let i = 0; i < frequencies.length; i += 1) {
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = frequencies[i];
                osc.connect(lowpass);
                osc.start(t0);
                osc.stop(t0 + duration + 0.35);
                sfx._track(osc);
            }
            trem.start(t0);
            trem.stop(t0 + duration + 0.35);
            sfx._track(trem);
        });

        /* ---- DIMENSION_SHIFT: collapse / restoration whoosh ----------------------------------------
         * opts.direction chooses the contour: into DRAB, energy dies (falling
         * saw + downward noise sweep + sub thump); into DREAM, juice returns
         * (rising triangle swell + high shimmer). Force-flagged — a shift
         * must always be heard over combat. */
        this._define(SFX_NAME.DIMENSION_SHIFT, SFX_CATEGORY.WORLD, 0.4, (sfx, opts) => {
            const toDrab = opts.direction === 'DRAB';
            const t0 = sfx._ctx.currentTime;
            if (toDrab) {
                sfx._tone({
                    type: 'sawtooth', freq: 320, freqEnd: 52,
                    duration: 1.0, peak: 0.15, force: true, at: t0
                });
                sfx._noise({
                    duration: 0.55, attack: 0.02, peak: 0.18, force: true, at: t0,
                    filter: { type: 'bandpass', freq: 900, freqEnd: 170, Q: 0.7 }
                });
                sfx._tone({
                    type: 'sine', freq: 62, freqEnd: 33,
                    duration: 0.5, peak: 0.28, force: true, at: t0
                });
            } else {
                sfx._tone({
                    type: 'triangle', freq: 180, freqEnd: 540,
                    duration: 0.9, attack: 0.08, peak: 0.13, force: true, at: t0
                });
                sfx._tone({
                    type: 'sine', freq: 1568,
                    duration: 1.2, attack: 0.15, peak: 0.05, force: true, at: t0 + 0.2
                });
                sfx._noise({
                    duration: 0.6, attack: 0.1, peak: 0.08, force: true, at: t0,
                    filter: { type: 'bandpass', freq: 400, freqEnd: 2600, Q: 0.6 }
                });
            }
        });

        /* ---- JUICE_GULP: three glugs + fizz -----------------------------------------------------------
         * Each glug is a sine dropping through its own band (cartoon
         * deglutition), pitched lower each swallow; a high-passed fizz tail
         * is the orange settling. The Orange Juice Cart's signature. */
        this._define(SFX_NAME.JUICE_GULP, SFX_CATEGORY.WORLD, 0.2, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            for (let i = 0; i < 3; i += 1) {
                sfx._tone({
                    type: 'sine',
                    freq: 330 - i * 70,
                    freqEnd: 150 - i * 28,
                    duration: 0.09, attack: 0.01, peak: 0.13,
                    at: t0 + i * 0.11
                });
            }
            sfx._noise({
                duration: 0.3, attack: 0.04, peak: 0.05, at: t0 + 0.34,
                filter: { type: 'highpass', freq: 4200 }
            });
        });

        /* ---- RAIN_SPLASH: single droplet ------------------------------------------------------------------
         * A 30 ms high-passed hiss (the splash) under a fast sine plink
         * falling 1900→700 Hz (the drop's pitch). Maximum jitter — ambient
         * variety is the whole point. */
        this._define(SFX_NAME.RAIN_SPLASH, SFX_CATEGORY.WORLD, 0.05, (sfx) => {
            const t0 = sfx._ctx.currentTime;
            sfx._noise({
                duration: 0.03, peak: 0.05, at: t0,
                filter: { type: 'highpass', freq: 3600 }
            });
            sfx._tone({
                type: 'sine', freq: 1900, freqEnd: 700,
                duration: 0.045, attack: 0.002, peak: 0.04, at: t0
            });
        });

        /* Footstep alternator seed. */
        this._stepFoot = false;
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll
     * at HUD rate (4–10 Hz), not per tick.
     * @returns {Object}
     */
    getMetrics() {
        const counts = {};
        for (const [name, n] of this._playCounts) counts[name] = n;
        return {
            seed: this._seed,
            totalPlays: this._totalPlays,
            perName: counts,
            librarySize: this._library.size,
            pitchJitterCents: this._pitchJitterCents,
            gainJitter: this._gainJitter,
            maxDistance: this._maxDistance,
            rolloffExponent: this._rolloffExponent,
            rainIntensity: this._rainIntensity,
            destroyed: this._destroyed
        };
    }

    /**
     * Tears down the library: releases engine references and clears all
     * state. The instance must not be reused after destroy(); matches the
     * engine-wide teardown contract for hot-module reloads and tests.
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._engine = null;
        this._ctx = null;
        this._bus = null;
        this._listener = null;
        this._active = null;
        this._library.clear();
        this._lastPlayedAt.clear();
        this._playCounts.clear();
        this._warnedNames.clear();
        this._rainIntensity = 0;
        this._rainAccumulator = 0;
    }
}

export default SoundEffects;