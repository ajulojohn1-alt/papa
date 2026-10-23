/**
 * @file src/audio/AudioEngine.js
 * @module audio/AudioEngine
 * @description
 * Procedural audio engine for "A Stitch in Time".
 *
 * AudioEngine is the game's ONLY sound source: every footstep, thunder
 * clap, typewriter tick, bullet whoosh, and both dimension soundtracks is
 * synthesized live through the Web Audio API. The project ships ZERO
 * audio assets by design — the ASCII aesthetic extends to sound: music
 * and effects are constructed from oscillators, noise buffers, filters,
 * and envelopes at runtime.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NODE GRAPH
 * ───────────────────────────────────────────────────────────────────────────
 * Three mix buses feed one master gain. Channel separation lets the
 * options screen mute music without silencing thunder, and lets the
 * dialogue typewriter sit in the SFX channel where it belongs:
 *
 *     Dream voices ──► dreamBus ─┐
 *                                ├──► bgmGain ─────┐
 *     Drab voices ───► drabBus ──┘                 │
 *                                                  ├──► masterGain ──► destination
 *     One-shot SFX ──────────────► sfxGain ────────┤
 *     Rain bed ─► rainGain ──────► sfxGain         │
 *     Thunder strikes ───────────► sfxGain ────────┘
 *
 * The Drab World additionally owns a feedback delay (0.42 s, 32%
 * feedback, low-passed return) so its sparse melody notes bloom into the
 * rain like echoes off wet concrete. The Dream World stays dry and bright.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AUTOPLAY POLICY & CONTEXT LIFECYCLE (CRITICAL BROWSER SAFETY)
 * ───────────────────────────────────────────────────────────────────────────
 * Browsers create an AudioContext in the 'suspended' state until a user
 * gesture (pointerdown / keydown / touchend) occurs. This engine:
 *
 *   1. Constructs the context eagerly (buffers, buses, and rain nodes are
 *      all legal while suspended — no sound simply plays yet).
 *   2. Installs one-shot capture-phase gesture listeners. The FIRST
 *      gesture calls ctx.resume() from INSIDE the gesture's call stack,
 *      which is the only invocation style every browser accepts.
 *   3. Defers all "start" behavior — the music scheduler, the world mix,
 *      the rain target — into _boot(), which runs exactly once after the
 *      context reports 'running'.
 *   4. Degrades to total silence (never exceptions) on platforms without
 *      Web Audio: every public method is guarded by the _failed flag.
 *
 * Call unlock() manually from a "Click to begin" title screen to control
 * the moment sound becomes possible; the gesture fallback remains armed
 * either way.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MUSIC SCHEDULER — THE TALE OF TWO CLOCKS
 * ───────────────────────────────────────────────────────────────────────────
 * Musical timing must come from AudioContext.currentTime (sample-accurate,
 * monotonic), NOT from the game's fixed tick: a 16.67 ms simulation grid
 * would audibly wobble note onsets. But the context clock cannot schedule
 * itself, so this engine uses the classic lookahead pattern:
 *
 *     Every SCHEDULER_INTERVAL_MS (27 ms, via setInterval):
 *         horizon = ctx.currentTime + LOOKAHEAD_SECONDS
 *         while (track.nextEventTime < horizon):
 *             schedule nodes at nextEventTime        (sample-accurate)
 *             advance the track's event clock
 *
 * The JS timer only decides WHICH notes to queue; the audio hardware plays
 * them at exact sample positions. Scheduling 180 ms ahead absorbs timer
 * jitter and main-thread stalls. Two extra guards keep the sequencer
 * honest:
 *
 *   reanchor:  after suspend/resume, nextEventTime can land far in the
 *              past; a stale clock snaps to now + 0.1 s instead of firing
 *              a machine-gun catch-up of notes.
 *   gating:    a world track creates nodes only while its bus is audible
 *              (mix target, plus one full crossfade window of grace so
 *              the outgoing theme keeps sounding until its bus is silent).
 *
 * update(dt) is accepted for GameLoop symmetry and simply re-runs the
 * scheduler guard — cheap, idempotent, and a safety net if the browser
 * throttles the interval timer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DUAL-WORLD CROSSFADE MATH (EQUAL-POWER)
 * ───────────────────────────────────────────────────────────────────────────
 * One scalar, the "drab mix" m ∈ [0, 1] (0 = fully DREAM, 1 = fully DRAB),
 * drives both buses. A naive linear crossfade dips perceived loudness ~3 dB
 * at the midpoint because powers ADD, not amplitudes. Equal-power curves
 * keep total power constant:
 *
 *     gDream(m) = cos(m · π/2)
 *     gDrab(m)  = sin(m · π/2)
 *     gDream² + gDrab² = 1          (constant power for every m)
 *
 * A shift animates m from its current value to the target over T seconds
 * by baking both curves into Float32Arrays and submitting them with
 * setValueCurveAtTime — sample-accurate, allocation happens once per shift,
 * and cancelScheduledValues first guarantees overlapping requests (rapid
 * Dream→Drab→Dream juice chaining) retarget cleanly instead of throwing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROCEDURAL RAIN (SHAPED WHITE NOISE)
 * ───────────────────────────────────────────────────────────────────────────
 * Rain is one looping white-noise buffer sculpted by three parallel filter
 * bands, each tied to intensity L ∈ [0, 1]:
 *
 *     bed    = noise → HPF(420 Hz) → LPF(7800 Hz)      gain = 0.42 · L
 *     patter = noise → BPF(2600 Hz, Q 0.9)             gain = 0.30 · L²
 *     body   = noise → LPF(240 Hz)                     gain = 0.38 · max(0, L−0.7)/0.3
 *
 * The L² patter term makes light mystic rain whisper while the Drab
 * downpour hisses; the body band only wakes inside a real storm, adding
 * the low window-rattle register. All gains glide via setTargetAtTime
 * (τ = 0.8 s) so weather profile crossfades never zipper.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THUNDER SYNTHESIS (FILTER-SWEEP CLAP + RETURN STROKES)
 * ───────────────────────────────────────────────────────────────────────────
 * WeatherSystem's 'lightning' event detail ({intensity, region,
 * strokeCount, world}) maps onto a three-layer strike:
 *
 *   crack:   noise → HPF(1200 Hz), 30 ms burst           (the flash edge)
 *   body:    noise → LPF swept f₀ → 60 Hz exponentially  (clap → rumble)
 *            f₀ = 500 + 1100·intensity; duration = 1.5 + 2.2·intensity
 *            envelope = (1 − t/D)²  — the same quadratic ease-out as
 *            Camera shake, so light, shake, and sound crest together.
 *   strokes: strokeCount − 1 secondary swells at 80–260 ms offsets,
 *            re-illuminating the rumble exactly like real return strokes.
 *   sub:     sine 55 → 30 Hz sweep, 0.5 s                (chest thump)
 *
 * Regional strikes (detail.region = {u0, u1}) pan via StereoPannerNode to
 * (u0+u1)/2 mapped into [−1, 1], so a storm on the left of the screen
 * crashes on the left of the head.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SFX CONCURRENCY & VOICE ECONOMY
 * ───────────────────────────────────────────────────────────────────────────
 * Bullet-hell combat can demand dozens of sounds per second. Every
 * spawned source registers in _activeSources and unregisters on its
 * 'ended' event; one-shot SFX beyond MAX_CONCURRENT_SFX are silently
 * dropped rather than allowed to stack into distortion (thunder, level-up
 * fanfares, and shift effects carry a force flag and always play). All
 * envelopes terminate with exponential ramps to 0.0001 and explicit
 * osc.stop() times, so no oscillator ever leaks past its tail.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INTEGRATION MAP
 * ───────────────────────────────────────────────────────────────────────────
 *   WorldManager  → attachWorldManager(): crossfades start on
 *                   'transitionstart' (audio turns WITH the visuals) and
 *                   snap on INITIAL 'worldchanged' events.
 *   WeatherSystem → attachWeather(): 'lightning' triggers thunder;
 *                   'profilechange' / 'worldchange' set rain intensity.
 *   DialogueBox   → 'chartyped'  → dialogueTick(char)
 *   HUD           → 'skillready' → skillReady()
 *   Player/Combat → hurt(), impact(), projectile(), dash(), footstep()
 *   EnergySystem  → setWorld(DRAB) happens through WorldManager already
 *
 * @example
 * const audio = new AudioEngine({ seed: 20250, world: 'DREAM' });
 * audio.attachWorldManager(worlds);   // dual-world crossfade
 * audio.attachWeather(weather);       // rain bed + thunder strikes
 *
 * dialogue.addEventListener('chartyped', ({ char }) => audio.dialogueTick(char));
 * hud.addEventListener('skillready', () => audio.skillReady());
 * player.addEventListener('hurt', () => audio.hurt());
 *
 * // GameLoop hooks:
 * const loop = new GameLoop({
 *     update: (dt) => { audio.update(dt); worlds.update(dt, input); },
 *     render: (alpha) => { ... }
 * });
 *
 * // Title screen button (explicit unlock, best practice):
 * startButton.addEventListener('click', () => audio.unlock());
 */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — ENGINE DEFAULTS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical dimension identifiers (self-contained copy; these strings are
 * the cross-wire protocol shared with WorldManager.WORLD).
 * @enum {string}
 */
export const AUDIO_WORLD = Object.freeze({
    DREAM: 'DREAM',
    DRAB: 'DRAB'
});

/** Bus default levels (perceptually balanced starting points). */
const DEFAULT_MASTER_VOLUME = 0.85;
const DEFAULT_BGM_VOLUME = 0.6;
const DEFAULT_SFX_VOLUME = 0.8;

/** Music scheduler timing (see header "tale of two clocks"). */
const DEFAULT_LOOKAHEAD_SECONDS = 0.18;
const DEFAULT_SCHEDULER_INTERVAL_MS = 27;

/** One-shot SFX concurrency ceiling (distortion protection). */
const MAX_CONCURRENT_SFX = 28;

/** Shared white-noise buffer length, seconds (loops seamlessly). */
const NOISE_BUFFER_SECONDS = 2;

/** Default crossfade duration for dimension shifts, seconds. */
const DEFAULT_CROSSFADE_SECONDS = 2.6;

/** Exponential-ramp floor: ramps may not target 0, so this is "silence". */
const SILENCE = 0.0001;

/** Equal-power curve resolution (points per setValueCurveAtTime curve). */
const CROSSFADE_CURVE_POINTS = 64;

/** Rain sub-band gain formulas (see header): bed, patter, body. */
const RAIN_BED_GAIN = 0.42;
const RAIN_PATTER_GAIN = 0.30;
const RAIN_BODY_GAIN = 0.38;
const RAIN_BODY_THRESHOLD = 0.7;

/** Gain smoothing time constant for volume/rain glides, seconds. */
const GLIDE_TAU = 0.045;
const RAIN_GLIDE_TAU = 0.8;

/** Dialogue typewriter tick throttle (characters closer than this merge). */
const DIALOGUE_TICK_MIN_INTERVAL = 0.028;

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — MUSIC DATA (ZERO-ASSET COMPOSITION)
   ══════════════════════════════════════════════════════════════════════════ */

/** Dream theme tempo. Bright, walking-pace; the grove is alive. */
const DREAM_BPM = 112;

/** Drab theme tempo. Slow; the city has nowhere to be. */
const DRAB_BPM = 60;

/**
 * Dream chord progression (I–vi–IV–V in A major): A, F#m, D, E.
 * Each entry is the marimba arp pitch set (MIDI) for one bar.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const DREAM_CHORDS = Object.freeze([
    Object.freeze([69, 73, 76, 81]),   // A:   A4 C#5 E5 A5
    Object.freeze([66, 69, 73, 78]),   // F#m: F#4 A4 C#5 F#5
    Object.freeze([62, 66, 69, 74]),   // D:   D4 F#4 A4 D5
    Object.freeze([64, 68, 71, 76])    // E:   E4 G#4 B4 E5
]);

/** Dream bass roots per bar (MIDI): A2, F#2, D2, E2. */
const DREAM_BASS_ROOTS = Object.freeze([45, 42, 38, 40]);

/**
 * Dream marimba arp pattern: [16th-step, chord-tone index, octave-up flag].
 * Composed for a skipping, upbeat feel: downbeat anchor, syncopated tail.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const DREAM_ARP_PATTERN = Object.freeze([
    Object.freeze([0, 0, 0]),
    Object.freeze([2, 1, 0]),
    Object.freeze([3, 2, 0]),
    Object.freeze([6, 3, 0]),
    Object.freeze([8, 2, 0]),
    Object.freeze([10, 1, 0]),
    Object.freeze([11, 2, 0]),
    Object.freeze([13, 3, 0]),
    Object.freeze([14, 1, 1])
]);

/**
 * Drab pad progression (i–VI–iv–V in A minor): Am, F, Dm, E.
 * Voiced low and close for the muted-pad brief.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const DRAB_CHORDS = Object.freeze([
    Object.freeze([45, 57, 60]),   // Am: A2 A3 C4
    Object.freeze([41, 57, 60]),   // F:  F2 A3 C4
    Object.freeze([50, 57, 62]),   // Dm: D3 A3 D4
    Object.freeze([40, 52, 56])    // E:  E2 E3 G#3
]);

/** Drab sparse melody pool (A minor pentatonic, MIDI): A C D E G A. */
const DRAB_MELODY_POOL = Object.freeze([69, 72, 74, 76, 79, 81]);

/** Drab drone fundamental: A1 (55 Hz). */
const DRAB_DRONE_MIDI = 33;

/** Rain intensity per WeatherSystem profile id (worldchange fallbacks in code). */
const PROFILE_RAIN_LEVELS = Object.freeze({
    CLEAR_GROVE: 0,
    MYSTIC_RAIN: 0.35,
    SPORE_DRIFT: 0.05,
    DRAB_DOWNPOUR: 0.85,
    DRAB_THUNDERSTORM: 1
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
 * Converts a MIDI note number to frequency.
 *     f = 440 · 2^((midi − 69) / 12)
 * @param {number} midi MIDI note number.
 * @returns {number} Frequency in Hz.
 */
function noteFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * mulberry32: tiny, fast, seedable 32-bit PRNG.
 * Seeded musical ornamentation keeps every player's Dream theme note-
 * identical under a shared seed (cosmetic parity with WeatherSystem's
 * determinism policy) while still feeling improvisational.
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

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Persistable volume snapshot (options menu / localStorage).
 * @typedef {Object} AudioSettings
 * @property {number} master Master bus level [0, 1].
 * @property {number} bgm Music bus level [0, 1].
 * @property {number} sfx Effects bus level [0, 1].
 * @property {boolean} muted Master mute latch.
 */

/**
 * Lightning event detail broadcast by WeatherSystem (duck-typed here).
 * @typedef {Object} ThunderDetail
 * @property {number} intensity Peak strike intensity 0..1.
 * @property {boolean} fullScreen True when inversion covers all cells.
 * @property {?{u0: number, u1: number}} region Viewport fractions or null.
 * @property {string} world Active world identifier.
 * @property {number} strokeCount Return strokes in the strike.
 */

/* ══════════════════════════════════════════════════════════════════════════
   AUDIO ENGINE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Procedural synthesis engine: three-bus mixer, dual-world generative
 * soundtrack, continuous rain bed, thunder synthesis, and a full SFX
 * catalog — all constructed from Web Audio primitives at runtime.
 */
export class AudioEngine {
    /**
     * @param {Object} [options]
     * @param {number} [options.masterVolume=0.85] Master bus level [0, 1].
     * @param {number} [options.bgmVolume=0.6] Music bus level [0, 1].
     * @param {number} [options.sfxVolume=0.8] Effects bus level [0, 1].
     * @param {boolean} [options.muted=false] Start muted.
     * @param {number} [options.seed] PRNG seed; time-seeded when omitted.
     * @param {string} [options.world='DREAM'] Initial dimension theme.
     * @param {number} [options.crossfadeSeconds=2.6] Default shift fade time.
     * @param {number} [options.lookaheadSeconds=0.18] Scheduler horizon.
     * @param {number} [options.schedulerIntervalMs=27] Scheduler timer period.
     * @param {boolean} [options.autoUnlock=true] Arm gesture-based unlock.
     * @param {string} [options.latencyHint='balanced'] AudioContext hint.
     * @throws {TypeError|RangeError} If options are malformed.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[AudioEngine] options must be an object.');
        }

        /* ---- Configuration --------------------------------------------- */
        /** @type {number} Default crossfade duration, seconds. */
        this._crossfadeSeconds = Number.isFinite(options.crossfadeSeconds) &&
            options.crossfadeSeconds > 0
            ? Math.min(15, options.crossfadeSeconds)
            : DEFAULT_CROSSFADE_SECONDS;
        /** @type {number} Scheduler horizon, seconds. */
        this._lookahead = Number.isFinite(options.lookaheadSeconds) &&
            options.lookaheadSeconds > 0.02
            ? Math.min(1, options.lookaheadSeconds)
            : DEFAULT_LOOKAHEAD_SECONDS;
        /** @type {number} Scheduler timer period, ms. */
        this._schedulerIntervalMs = Number.isInteger(options.schedulerIntervalMs) &&
            options.schedulerIntervalMs >= 5
            ? Math.min(250, options.schedulerIntervalMs)
            : DEFAULT_SCHEDULER_INTERVAL_MS;

        /* ---- Deterministic randomness ----------------------------------- */
        const seed = Number.isInteger(options.seed)
            ? options.seed
            : ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
        /** @type {() => number} */
        this._rng = mulberry32(seed);
        /** @type {number} */
        this._seed = seed;

        /* ---- Mixer settings (persisted snapshot) -------------------------- */
        /** @type {AudioSettings} */
        this._settings = {
            master: clamp01(options.masterVolume ?? DEFAULT_MASTER_VOLUME),
            bgm: clamp01(options.bgmVolume ?? DEFAULT_BGM_VOLUME),
            sfx: clamp01(options.sfxVolume ?? DEFAULT_SFX_VOLUME),
            muted: Boolean(options.muted)
        };

        /* ---- World mix state ---------------------------------------------- */
        const initialWorld = options.world === AUDIO_WORLD.DRAB
            ? AUDIO_WORLD.DRAB
            : AUDIO_WORLD.DREAM;
        /** @type {string} Target dimension for the music crossfade. */
        this._targetWorld = initialWorld;
        /** @type {number} Drab mix target: 0 = DREAM, 1 = DRAB. */
        this._mixTarget = initialWorld === AUDIO_WORLD.DRAB ? 1 : 0;
        /** @type {number} Context-time until which BOTH tracks stay audible. */
        this._fadeGraceUntil = 0;

        /* ---- Rain state ----------------------------------------------------- */
        /** @type {number} Rain intensity target [0, 1]. */
        this._rainTarget = 0;

        /* ---- Runtime plumbing ------------------------------------------------- */
        /** @type {?AudioContext} */
        this._ctx = null;
        /** @type {boolean} Unrecoverable platform failure (no Web Audio). */
        this._failed = false;
        /** @type {boolean} Destroyed latch. */
        this._destroyed = false;
        /** @type {boolean} Context running & music/scheduler booted. */
        this._booted = false;
        /** @type {boolean} Explicitly suspended by the game (pause menu). */
        this._gameSuspended = false;
        /** @type {?number} setInterval handle for the music scheduler. */
        this._schedulerId = null;

        /* ---- Voice bookkeeping -------------------------------------------------- */
        /** @type {Set<AudioScheduledSourceNode>} Live sources (SFX + music). */
        this._activeSources = new Set();
        /** @type {number} Sim-time of last typewriter tick (throttle). */
        this._lastDialogueTickAt = -1;
        /** @type {boolean} Footstep L/R alternator. */
        this._stepFoot = false;
        /** @type {?OscillatorNode} Drab sub drone (started once). */
        this._droneOsc = null;

        /* ---- Music track clocks ---------------------------------------------------- */
        /**
         * Dream sequencer clock. stepDur is one 16th note:
         *     stepDur = 60 / BPM / 4
         * @type {{nextStepTime: number, totalSteps: number, stepDur: number}}
         */
        this._dream = { nextStepTime: 0, totalSteps: 0, stepDur: 60 / DREAM_BPM / 4 };
        /**
         * Drab sequencer clocks: pads advance every 4 beats; the sparse
         * melody rolls its own 2-beat dice independently.
         * @type {{nextChordTime: number, chordIndex: number, chordDur: number,
         *          nextMelodyTime: number, melodyStep: number}}
         */
        this._drab = {
            nextChordTime: 0,
            chordIndex: 0,
            chordDur: (60 / DRAB_BPM) * 4,
            nextMelodyTime: 0,
            melodyStep: (60 / DRAB_BPM) * 2
        };

        /* ---- Attachments --------------------------------------------------------------- */
        /** @type {?Object} */ this._worldManager = null;
        /** @type {Array<Function>} Unsubscribe fns from WorldManager.on(). */
        this._worldUnsubs = [];
        /** @type {?Object} */ this._weather = null;
        /** @type {?Function} Bound lightning handler (for detach). */
        this._onLightning = null;
        /** @type {?Function} Bound profilechange handler (for detach). */
        this._onWeatherProfile = null;
        /** @type {?Function} Bound worldchange handler (for detach). */
        this._onWeatherWorld = null;

        /* ---- Events ------------------------------------------------------------------------ */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /* ---- Unlock gesture wiring -------------------------------------------------------------- */
        /** @type {?Function} Shared gesture handler reference. */
        this._gestureHandler = null;
        /** @type {EventTarget} */
        this._gestureTarget = typeof window !== 'undefined' ? window : null;

        /* ---- Context construction (fail-soft) ----------------------------------------------------- */
        try {
            const Ctor = (typeof window !== 'undefined') &&
                (window.AudioContext || window.webkitAudioContext);
            if (!Ctor) {
                throw new Error('Web Audio API unavailable.');
            }
            this._ctx = new Ctor({ latencyHint: options.latencyHint ?? 'balanced' });
            this._buildGraph();
            this._buildNoiseBuffer();
            this._buildRain();
        } catch (error) {
            console.warn('[AudioEngine] Web Audio unavailable; running silent.', error);
            this._failed = true;
            return;
        }

        /* ---- Boot or arm the unlock listeners ------------------------------------------------------- */
        if (this._ctx.state === 'running') {
            this._boot();
        } else if (options.autoUnlock !== false) {
            this._installUnlockListeners();
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       SUPPORT QUERIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Platform capability probe for title screens and settings menus.
     * @returns {boolean} True when Web Audio exists.
     */
    static isSupported() {
        return typeof window !== 'undefined' &&
            Boolean(window.AudioContext || window.webkitAudioContext);
    }

    /** @returns {string} AudioContext state ('suspended'|'running'|'closed'). */
    get state() {
        return this._ctx ? this._ctx.state : 'closed';
    }

    /** @returns {boolean} True until the first successful user-gesture resume. */
    get isLocked() {
        return !this._failed && !this._booted;
    }

    /** @returns {string} Current crossfade target world id. */
    get targetWorld() {
        return this._targetWorld;
    }

    /* ══════════════════════════════════════════════════════════════════
       AUTOPLAY UNLOCK & CONTEXT LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Arms capture-phase gesture listeners. The handler fires once,
     * removes itself, and unlocks. Capture phase + once-per-gesture
     * semantics mean a click on ANY element (including future DOM
     * overlays) satisfies the browser's interaction requirement.
     * @private
     */
    _installUnlockListeners() {
        if (!this._gestureTarget) return;
        this._gestureHandler = () => {
            this._removeUnlockListeners();
            void this.unlock();
        };
        const opts = { capture: true, once: false, passive: true };
        this._gestureTarget.addEventListener('pointerdown', this._gestureHandler, opts);
        this._gestureTarget.addEventListener('keydown', this._gestureHandler, opts);
        this._gestureTarget.addEventListener('touchend', this._gestureHandler, opts);
    }

    /**
     * Detaches all gesture listeners (post-unlock and teardown paths).
     * @private
     */
    _removeUnlockListeners() {
        if (!this._gestureTarget || !this._gestureHandler) return;
        const opts = { capture: true };
        this._gestureTarget.removeEventListener('pointerdown', this._gestureHandler, opts);
        this._gestureTarget.removeEventListener('keydown', this._gestureHandler, opts);
        this._gestureTarget.removeEventListener('touchend', this._gestureHandler, opts);
        this._gestureHandler = null;
    }

    /**
     * Requests playback permission. Safe to call repeatedly; resolves
     * immediately once booted. MUST be invoked inside a user-gesture
     * call stack for browsers that gate resume() (the installed gesture
     * handler guarantees this in the automatic path).
     * @returns {Promise<boolean>} True when the engine is running.
     */
    async unlock() {
        if (this._failed || this._destroyed) return false;
        if (this._booted) return true;
        try {
            await this._ctx.resume();
        } catch (error) {
            console.warn('[AudioEngine] resume() rejected; will retry on gesture.', error);
            if (this._gestureHandler === null) this._installUnlockListeners();
            return false;
        }
        if (this._ctx.state === 'running') {
            this._boot();
            return true;
        }
        return false;
    }

    /**
     * One-time post-unlock startup: applies stored volumes, anchors the
     * music clocks just ahead of the context time, starts the scheduler,
     * raises the world mix, and eases rain toward its pending target.
     * @private
     */
    _boot() {
        if (this._booted || this._destroyed || this._failed) return;
        this._booted = true;

        this._applySettingsToGraph();
        this._startMusic();
        if (this._schedulerId === null) {
            this._schedulerId = setInterval(() => this._schedule(), this._schedulerIntervalMs);
        }
        /* Snap (do not fade) into the pending world, then let rain ease in. */
        this._applyMixImmediate(this._mixTarget);
        this._setRainGains(this._rainTarget, true);

        this._dispatch('unlocked', { state: this._ctx.state });
    }

    /**
     * Suspends the entire audio graph (pause menu, cutscene mute-hold).
     * The scheduler keeps its timer but gates on context state, and the
     * stale-clock reanchor inside _schedule() prevents a catch-up burst
     * on resume.
     * @returns {Promise<void>}
     */
    async suspend() {
        if (this._failed || this._destroyed || !this._booted) return;
        this._gameSuspended = true;
        try {
            await this._ctx.suspend();
        } catch (error) {
            console.warn('[AudioEngine] suspend() failed:', error);
        }
    }

    /**
     * Resumes from game-initiated suspend. Mirrors unlock() but never
     * re-runs boot (boot already happened).
     * @returns {Promise<void>}
     */
    async resume() {
        if (this._failed || this._destroyed || !this._booted) return;
        this._gameSuspended = false;
        try {
            await this._ctx.resume();
        } catch (error) {
            console.warn('[AudioEngine] resume() failed:', error);
        }
    }

    /**
     * Tears down the engine: stops the scheduler, detaches every
     * external subscription, removes gesture listeners, and closes the
     * context. The instance must not be reused after destroy().
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._schedulerId !== null) {
            clearInterval(this._schedulerId);
            this._schedulerId = null;
        }
        this._removeUnlockListeners();
        this._detachWorldManager();
        this._detachWeather();
        this._listeners.clear();
        this._activeSources.clear();
        if (this._ctx && this._ctx.state !== 'closed') {
            void this._ctx.close().catch(() => {
                /* Closing an already-closing context is benign. */
            });
        }
        this._ctx = null;
    }

    /* ══════════════════════════════════════════════════════════════════
       MASTER VOLUME CONTROLS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Validates and clamps a volume value.
     * @param {number} value Candidate level.
     * @param {string} name Parameter name for errors.
     * @returns {number} Clamped [0, 1] level.
     * @private
     */
    _validateLevel(value, name) {
        if (!Number.isFinite(value)) {
            throw new RangeError(`[AudioEngine] ${name} must be a finite number.`);
        }
        return clamp01(value);
    }

    /**
     * Glides a GainNode toward a level without zipper noise.
     * setTargetAtTime is the click-safe ramp: exponential approach with
     * time constant tau.
     * @param {GainNode} node Bus gain node.
     * @param {number} value Target level [0, 1].
     * @param {number} [tau=GLIDE_TAU] Time constant, seconds.
     * @private
     */
    _glide(node, value, tau = GLIDE_TAU) {
        if (!node) return;
        const param = node.gain;
        const now = this._ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, tau);
    }

    /**
     * Resolves the effective master gain from user level + mute latch.
     * @returns {number}
     * @private
     */
    _effectiveMaster() {
        return this._settings.muted ? 0 : this._settings.master;
    }

    /**
     * Pushes the stored AudioSettings into the live graph.
     * @private
     */
    _applySettingsToGraph() {
        if (this._failed || !this._ctx) return;
        this._glide(this._masterGain, this._effectiveMaster());
        this._glide(this._bgmGain, this._settings.bgm);
        this._glide(this._sfxGain, this._settings.sfx);
    }

    /**
     * Sets the master output level.
     * @param {number} value Level in [0, 1].
     * @returns {this}
     */
    setMasterVolume(value) {
        this._settings.master = this._validateLevel(value, 'masterVolume');
        if (!this._failed) this._glide(this._masterGain, this._effectiveMaster());
        return this;
    }

    /**
     * Sets the music bus level (both world themes).
     * @param {number} value Level in [0, 1].
     * @returns {this}
     */
    setBGMVolume(value) {
        this._settings.bgm = this._validateLevel(value, 'bgmVolume');
        if (!this._failed) this._glide(this._bgmGain, this._settings.bgm);
        return this;
    }

    /**
     * Sets the effects bus level (SFX + rain + thunder).
     * @param {number} value Level in [0, 1].
     * @returns {this}
     */
    setSFXVolume(value) {
        this._settings.sfx = this._validateLevel(value, 'sfxVolume');
        if (!this._failed) this._glide(this._sfxGain, this._settings.sfx);
        return this;
    }

    /**
     * Engages or releases master mute. The underlying levels are
     * preserved so un-muting restores the exact previous balance.
     * @param {boolean} muted True to mute.
     * @returns {this}
     */
    setMuted(muted) {
        this._settings.muted = Boolean(muted);
        if (!this._failed) this._glide(this._masterGain, this._effectiveMaster());
        this._dispatch('mute', { muted: this._settings.muted });
        return this;
    }

    /**
     * Toggles the master mute latch.
     * @returns {boolean} New muted state.
     */
    toggleMuted() {
        this.setMuted(!this._settings.muted);
        return this._settings.muted;
    }

    /** @returns {AudioSettings} Copy of the persistable settings. */
    getSettings() {
        return { ...this._settings };
    }

    /**
     * Applies a persisted settings snapshot (options menu load path).
     * Invalid fields fall back to current values individually.
     * @param {Partial<AudioSettings>} settings Stored snapshot.
     * @returns {this}
     */
    applySettings(settings) {
        if (settings === null || typeof settings !== 'object') return this;
        if (Number.isFinite(settings.master)) this.setMasterVolume(settings.master);
        if (Number.isFinite(settings.bgm)) this.setBGMVolume(settings.bgm);
        if (Number.isFinite(settings.sfx)) this.setSFXVolume(settings.sfx);
        if (typeof settings.muted === 'boolean') this.setMuted(settings.muted);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       NODE GRAPH CONSTRUCTION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds the mixer hierarchy and the Drab spatial send. All gains
     * start at 0; _boot() / _applySettingsToGraph() raise them so a
     * suspended context never emits a power-on thump.
     * @private
     */
    _buildGraph() {
        const ctx = this._ctx;

        /* Master chain. */
        this._masterGain = ctx.createGain();
        this._masterGain.gain.value = 0;
        this._masterGain.connect(ctx.destination);

        /* BGM chain with per-world crossfade buses. */
        this._bgmGain = ctx.createGain();
        this._bgmGain.gain.value = 0;
        this._bgmGain.connect(this._masterGain);

        this._dreamBus = ctx.createGain();
        this._dreamBus.gain.value = 1;
        this._dreamBus.connect(this._bgmGain);

        this._drabBus = ctx.createGain();
        this._drabBus.gain.value = 0;
        this._drabBus.connect(this._bgmGain);

        /* SFX chain. */
        this._sfxGain = ctx.createGain();
        this._sfxGain.gain.value = 0;
        this._sfxGain.connect(this._masterGain);

        /* Drab pad voicing bus: shared low-pass keeps pads muted/warm. */
        this._padFilter = ctx.createBiquadFilter();
        this._padFilter.type = 'lowpass';
        this._padFilter.frequency.value = 520;
        this._padFilter.Q.value = 0.5;
        this._padFilter.connect(this._drabBus);

        /* Drab feedback delay: echo off wet streets.
         *   send → delay(0.42s) → lowpass(950) → fb gain(0.32) → delay
         *                └──────────────────────────────────────► drabBus */
        this._drabDelaySend = ctx.createGain();
        this._drabDelaySend.gain.value = 0.5;
        this._drabDelay = ctx.createDelay(1.5);
        this._drabDelay.delayTime.value = 0.42;
        this._drabDelayReturnFilter = ctx.createBiquadFilter();
        this._drabDelayReturnFilter.type = 'lowpass';
        this._drabDelayReturnFilter.frequency.value = 950;
        this._drabDelayFeedback = ctx.createGain();
        this._drabDelayFeedback.gain.value = 0.32;
        this._drabDelaySend.connect(this._drabDelay);
        this._drabDelay.connect(this._drabDelayReturnFilter);
        this._drabDelayReturnFilter.connect(this._drabDelayFeedback);
        this._drabDelayFeedback.connect(this._drabDelay);
        this._drabDelay.connect(this._drabBus);

        /* Optional panner factory result cached per call (SFX-local). */
        this._supportsPanner = typeof ctx.createStereoPanner === 'function';
    }

    /**
     * Renders the shared white-noise AudioBuffer once. Seeded rng keeps
     * the rain texture bit-identical across clients for a given seed —
     * cosmetic determinism matching WeatherSystem's policy.
     * @private
     */
    _buildNoiseBuffer() {
        const ctx = this._ctx;
        const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS));
        this._noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) {
            /* Uniform white noise in [-1, 1). */
            data[i] = this._rng() * 2 - 1;
        }
    }

    /**
     * Constructs the three-band rain bed (see header DSP diagram). The
     * sources start immediately: while the context is suspended they
     * simply produce no output, and they are already spinning the moment
     * unlock() lands — no first-drop delay.
     * @private
     */
    _buildRain() {
        const ctx = this._ctx;

        this._rainGain = ctx.createGain();
        this._rainGain.gain.value = 0;
        this._rainGain.connect(this._sfxGain);

        /* Bed: broadband hiss, HPF trims mud, LPF trims harshness. */
        const bedSrc = ctx.createBufferSource();
        bedSrc.buffer = this._noiseBuffer;
        bedSrc.loop = true;
        const bedHp = ctx.createBiquadFilter();
        bedHp.type = 'highpass';
        bedHp.frequency.value = 420;
        const bedLp = ctx.createBiquadFilter();
        bedLp.type = 'lowpass';
        bedLp.frequency.value = 7800;
        this._rainBedGain = ctx.createGain();
        this._rainBedGain.gain.value = 0;
        bedSrc.connect(bedHp);
        bedHp.connect(bedLp);
        bedLp.connect(this._rainBedGain);
        this._rainBedGain.connect(this._rainGain);
        bedSrc.start(0);

        /* Patter: resonant band around 2.6 kHz — the individual drops. */
        const patterSrc = ctx.createBufferSource();
        patterSrc.buffer = this._noiseBuffer;
        patterSrc.loop = true;
        patterSrc.playbackRate.value = 1.13;   /* de-correlate from bed */
        const patterBp = ctx.createBiquadFilter();
        patterBp.type = 'bandpass';
        patterBp.frequency.value = 2600;
        patterBp.Q.value = 0.9;
        this._rainPatterGain = ctx.createGain();
        this._rainPatterGain.gain.value = 0;
        patterSrc.connect(patterBp);
        patterBp.connect(this._rainPatterGain);
        this._rainPatterGain.connect(this._rainGain);
        patterSrc.start(0);

        /* Body: sub-250 Hz storm window-rattle, gated on hard rain. */
        const bodySrc = ctx.createBufferSource();
        bodySrc.buffer = this._noiseBuffer;
        bodySrc.loop = true;
        bodySrc.playbackRate.value = 0.71;     /* darker, slower churn */
        const bodyLp = ctx.createBiquadFilter();
        bodyLp.type = 'lowpass';
        bodyLp.frequency.value = 240;
        this._rainBodyGain = ctx.createGain();
        this._rainBodyGain.gain.value = 0;
        bodySrc.connect(bodyLp);
        bodyLp.connect(this._rainBodyGain);
        this._rainBodyGain.connect(this._rainGain);
        bodySrc.start(0);
    }

    /* ══════════════════════════════════════════════════════════════════
       DUAL-WORLD CROSSFADE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a WorldManager. The crossfade begins on
     * 'transitionstart' so the audio turn rides WITH the visual OUT/IN
     * phases; INITIAL worldchanged events (boot, teleports) snap the
     * mix instantly. Prior attachments are cleaned up first.
     * @param {?Object} worlds WorldManager instance, or null to detach.
     * @returns {this}
     */
    attachWorldManager(worlds) {
        this._detachWorldManager();
        if (!worlds || typeof worlds.on !== 'function') return this;
        this._worldManager = worlds;

        this._worldUnsubs.push(
            worlds.on('transitionstart', (status) => {
                if (status && typeof status.to === 'string') {
                    this.setWorld(status.to, { seconds: this._crossfadeSeconds });
                }
            })
        );
        this._worldUnsubs.push(
            worlds.on('worldchanged', (detail) => {
                /* INITIAL / hard swaps: snap, do not fade. */
                if (detail && detail.reason === 'INITIAL' && typeof detail.to === 'string') {
                    this.setWorld(detail.to, { seconds: 0 });
                }
            })
        );

        /* Late-attach reconciliation: adopt the manager's current world. */
        if (typeof worlds.getActiveWorldId === 'function') {
            const active = worlds.getActiveWorldId();
            if (typeof active === 'string') {
                this._targetWorld = active === AUDIO_WORLD.DRAB
                    ? AUDIO_WORLD.DRAB : AUDIO_WORLD.DREAM;
                this._mixTarget = this._targetWorld === AUDIO_WORLD.DRAB ? 1 : 0;
                if (this._booted) this._applyMixImmediate(this._mixTarget);
            }
        }
        return this;
    }

    /**
     * Removes WorldManager subscriptions.
     * @private
     */
    _detachWorldManager() {
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.warn('[AudioEngine] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];
        this._worldManager = null;
    }

    /**
     * Crossfades the soundtrack toward a dimension.
     *
     * Equal-power law (header derivation):
     *     gDream = cos(m·π/2),  gDrab = sin(m·π/2),  m → drab mix
     * The full curve is baked and submitted with setValueCurveAtTime;
     * seconds = 0 snaps instantly.
     *
     * Also fires a one-shot transition SFX (collapse riser into Drab,
     * restoration swell into Dream) — skipped on instant snaps so boot
     * and teleports stay silent.
     * @param {string} worldId AUDIO_WORLD.DREAM or AUDIO_WORLD.DRAB.
     * @param {Object} [options]
     * @param {number} [options.seconds] Fade duration override.
     * @param {boolean} [options.silent=false] Suppress the shift SFX.
     * @returns {boolean} True if a new crossfade was started.
     */
    setWorld(worldId, options = {}) {
        if (this._failed || this._destroyed) return false;
        if (worldId !== AUDIO_WORLD.DREAM && worldId !== AUDIO_WORLD.DRAB) {
            return false;
        }
        const target = worldId === AUDIO_WORLD.DRAB ? 1 : 0;
        if (target === this._mixTarget) return false;

        const seconds = Number.isFinite(options.seconds) && options.seconds >= 0
            ? Math.min(20, options.seconds)
            : this._crossfadeSeconds;

        this._targetWorld = worldId;
        this._mixTarget = target;

        if (this._booted) {
            this._beginCrossfade(target, seconds);
            if (seconds > 0.05 && !options.silent) {
                this._playShiftSfx(worldId);
            }
        }
        this._dispatch('worldmix', { world: worldId, seconds });
        return true;
    }

    /**
     * Animates both bus gains along equal-power curves over `seconds`.
     * cancelScheduledValues first makes overlapping shifts retarget
     * cleanly (juice-chained Dream→Drab→Dream never throws).
     * @param {number} target Target drab mix [0, 1].
     * @param {number} seconds Fade duration.
     * @private
     */
    _beginCrossfade(target, seconds) {
        const ctx = this._ctx;
        const now = ctx.currentTime;

        /* Grace window: both tracks keep scheduling through the fade so
         * the outgoing theme never dies before its bus is silent. */
        this._fadeGraceUntil = now + seconds;

        if (seconds <= 0.01) {
            this._applyMixImmediate(target);
            return;
        }

        const from = this._currentBusMix();
        const dreamCurve = new Float32Array(CROSSFADE_CURVE_POINTS);
        const drabCurve = new Float32Array(CROSSFADE_CURVE_POINTS);
        for (let i = 0; i < CROSSFADE_CURVE_POINTS; i += 1) {
            const p = i / (CROSSFADE_CURVE_POINTS - 1);
            const m = from + (target - from) * p;
            dreamCurve[i] = Math.cos(m * Math.PI / 2);
            drabCurve[i] = Math.sin(m * Math.PI / 2);
        }
        const dreamParam = this._dreamBus.gain;
        const drabParam = this._drabBus.gain;
        dreamParam.cancelScheduledValues(now);
        drabParam.cancelScheduledValues(now);
        dreamParam.setValueCurveAtTime(dreamCurve, now, seconds);
        drabParam.setValueCurveAtTime(drabCurve, now, seconds);
    }

    /**
     * Snaps the mix instantly (boot, teleports, initial world).
     * @param {number} target Drab mix [0, 1].
     * @private
     */
    _applyMixImmediate(target) {
        const now = this._ctx.currentTime;
        const dreamParam = this._dreamBus.gain;
        const drabParam = this._drabBus.gain;
        dreamParam.cancelScheduledValues(now);
        drabParam.cancelScheduledValues(now);
        dreamParam.setValueAtTime(Math.cos(target * Math.PI / 2), now);
        drabParam.setValueAtTime(Math.sin(target * Math.PI / 2), now);
    }

    /**
     * Reads the mix implied by the current dream bus gain (inverse of
     * the equal-power law) — used as the retarget origin for chained
     * crossfades mid-animation.
     * @returns {number} Drab mix estimate [0, 1].
     * @private
     */
    _currentBusMix() {
        const g = clamp01(this._dreamBus.gain.value);
        return clamp01(Math.acos(g) / (Math.PI / 2));
    }

    /**
     * One-shot shift SFX. Into Drab: a collapsing detuned saw sweep with
     * a glitch noise burst (energy death). Into Dream: a rising triangle
     * swell with a high shimmer (juice restoration).
     * @param {string} toWorld Destination world id.
     * @private
     */
    _playShiftSfx(toWorld) {
        if (toWorld === AUDIO_WORLD.DRAB) {
            this._playTone({
                type: 'sawtooth', freq: 340, freqEnd: 52, duration: 1.1,
                peak: 0.16, dest: this._sfxGain, force: true
            });
            this._playNoise({
                duration: 0.5, peak: 0.2, force: true,
                filter: { type: 'bandpass', freq: 900, Q: 0.6, freqEnd: 180 },
                dest: this._sfxGain
            });
            this._playTone({
                type: 'sine', freq: 62, freqEnd: 34, duration: 0.5,
                peak: 0.3, dest: this._sfxGain, force: true
            });
        } else {
            this._playTone({
                type: 'triangle', freq: 196, freqEnd: 523, duration: 0.9,
                peak: 0.14, dest: this._sfxGain, force: true
            });
            this._playTone({
                type: 'sine', freq: 1568, duration: 1.2,
                peak: 0.05, dest: this._sfxGain, force: true
            });
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       WEATHER INTEGRATION — RAIN & THUNDER
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a WeatherSystem:
     *   'lightning'     → playThunder(detail)
     *   'profilechange' → rain level from the profile table
     *   'worldchange'   → rain fallback per dimension
     * @param {?Object} weather WeatherSystem instance, or null to detach.
     * @returns {this}
     */
    attachWeather(weather) {
        this._detachWeather();
        if (!weather || typeof weather.addEventListener !== 'function') return this;
        this._weather = weather;

        this._onLightning = (detail) => this.playThunder(detail);
        this._onWeatherProfile = (detail) => {
            if (detail && typeof detail.to === 'string' &&
                PROFILE_RAIN_LEVELS[detail.to] !== undefined) {
                this.setRainIntensity(PROFILE_RAIN_LEVELS[detail.to]);
            }
        };
        this._onWeatherWorld = (detail) => {
            if (!detail) return;
            this.setRainIntensity(detail.world === AUDIO_WORLD.DRAB ? 0.9 : 0.05);
        };

        weather.addEventListener('lightning', this._onLightning);
        weather.addEventListener('profilechange', this._onWeatherProfile);
        weather.addEventListener('worldchange', this._onWeatherWorld);
        return this;
    }

    /**
     * Removes WeatherSystem subscriptions using stored handler refs
     * (WeatherSystem.addEventListener returns `this`, not an unsubscribe
     * closure, so explicit removeEventListener is required).
     * @private
     */
    _detachWeather() {
        const weather = this._weather;
        if (weather && typeof weather.removeEventListener === 'function') {
            if (this._onLightning) weather.removeEventListener('lightning', this._onLightning);
            if (this._onWeatherProfile) weather.removeEventListener('profilechange', this._onWeatherProfile);
            if (this._onWeatherWorld) weather.removeEventListener('worldchange', this._onWeatherWorld);
        }
        this._weather = null;
        this._onLightning = null;
        this._onWeatherProfile = null;
        this._onWeatherWorld = null;
    }

    /**
     * Sets the continuous rain level. Sub-band gains follow the header
     * formulas (bed linear, patter quadratic, body gated above 0.7),
     * glided over τ = 0.8 s so WeatherSystem's profile crossfades never
     * produce zipper noise.
     * @param {number} level Rain intensity [0, 1].
     * @param {Object} [options]
     * @param {boolean} [options.immediate=false] Skip the glide.
     * @returns {this}
     */
    setRainIntensity(level, options = {}) {
        if (!Number.isFinite(level)) return this;
        this._rainTarget = clamp01(level);
        if (!this._failed && this._booted) {
            this._setRainGains(this._rainTarget, Boolean(options.immediate));
        }
        return this;
    }

    /**
     * Applies the rain gain formulas to the live graph.
     * @param {number} level Clamped intensity.
     * @param {boolean} immediate Snap instead of glide.
     * @private
     */
    _setRainGains(level, immediate) {
        const L = clamp01(level);
        const bed = RAIN_BED_GAIN * L;
        const patter = RAIN_PATTER_GAIN * L * L;
        const body = RAIN_BODY_GAIN * Math.max(0, (L - RAIN_BODY_THRESHOLD) / (1 - RAIN_BODY_THRESHOLD));
        const tau = immediate ? 0.001 : RAIN_GLIDE_TAU;
        this._glide(this._rainBedGain, bed, tau);
        this._glide(this._rainPatterGain, patter, tau);
        this._glide(this._rainBodyGain, body, tau);
        /* The master rain gate opens slightly before sound matters so
         * the first drops never hit a silent chain. */
        this._glide(this._rainGain, L > 0.001 ? 1 : 0, tau);
    }

    /**
     * Synthesizes a full lightning strike from a WeatherSystem event
     * detail (see header DSP breakdown). Layers: crack burst, swept
     * low-pass body with quadratic-decay envelope, return-stroke
     * swells, and a sub-bass chest thump. Regional strikes pan.
     * @param {ThunderDetail} [detail] Lightning event payload.
     * @returns {this}
     */
    playThunder(detail = {}) {
        if (this._failed || this._destroyed || !this._booted) return this;
        if (this._ctx.state !== 'running') return this;

        const intensity = clamp01(Number.isFinite(detail.intensity) ? detail.intensity : 0.8);
        const strokeCount = Math.max(1, Math.min(4,
            Number.isInteger(detail.strokeCount) ? detail.strokeCount : 1));

        /* Stereo placement from the strike's viewport band. */
        let pan = 0;
        if (detail.region && Number.isFinite(detail.region.u0) &&
            Number.isFinite(detail.region.u1)) {
            pan = clamp01(((detail.region.u0 + detail.region.u1) / 2)) * 2 - 1;
        }

        const ctx = this._ctx;
        const t0 = ctx.currentTime + 0.01;
        const bodyDuration = 1.5 + 2.2 * intensity;

        /* 1. Crack: the visual flash's acoustic edge. */
        this._playNoise({
            startTime: t0,
            duration: 0.03 + 0.04 * intensity,
            peak: 0.22 + 0.28 * intensity,
            attack: 0.002,
            pan,
            force: true,
            filter: { type: 'highpass', freq: 1200 },
            dest: this._sfxGain
        });

        /* 2. Body: clap-to-rumble low-pass sweep with the camera-shake
         *    quadratic decay, so light/shake/sound crest together. */
        this._playNoise({
            startTime: t0,
            duration: bodyDuration,
            peak: 0.3 + 0.4 * intensity,
            attack: 0.008,
            pan,
            force: true,
            filter: {
                type: 'lowpass',
                freq: 500 + 1100 * intensity,
                freqEnd: 60
            },
            dest: this._sfxGain
        });

        /* 3. Return strokes: re-illumination swells at 80–260 ms spacing. */
        for (let s = 1; s < strokeCount; s += 1) {
            const offset = 0.08 + this._rng() * 0.18;
            this._playNoise({
                startTime: t0 + s * offset + this._rng() * 0.05,
                duration: 0.5 + 0.7 * intensity,
                peak: (0.14 + 0.2 * intensity) * (1 - s / (strokeCount + 1)),
                attack: 0.012,
                pan,
                force: true,
                filter: { type: 'lowpass', freq: 300 + 400 * intensity, freqEnd: 70 },
                dest: this._sfxGain
            });
        }

        /* 4. Sub thump: felt more than heard. */
        this._playTone({
            type: 'sine',
            freq: 55,
            freqEnd: 30,
            duration: 0.5,
            peak: 0.25 * intensity + 0.1,
            startTime: t0,
            pan,
            force: true,
            dest: this._sfxGain
        });

        this._dispatch('thunder', { intensity, pan, strokeCount });
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       MUSIC — SCHEDULER CORE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Anchors both music clocks just ahead of now and starts the Drab
     * sub drone (a persistent oscillator whose audibility is governed
     * entirely by the crossfade bus).
     * @private
     */
    _startMusic() {
        const now = this._ctx.currentTime;
        this._dream.nextStepTime = now + 0.15;
        this._dream.totalSteps = 0;
        this._drab.nextChordTime = now + 0.15;
        this._drab.chordIndex = 0;
        this._drab.nextMelodyTime = now + 2.2;
        this._startDrone();
    }

    /**
     * The lookahead scheduler. Fills the horizon with events from both
     * world tracks. Guards: context must be running; stale clocks
     * (post-suspend) reanchor instead of bursting.
     * @private
     */
    _schedule() {
        if (this._failed || this._destroyed || !this._booted) return;
        if (this._ctx.state !== 'running') return;

        const ctx = this._ctx;
        const now = ctx.currentTime;
        const horizon = now + this._lookahead;

        /* ---- Stale-clock reanchor (suspend/resume safety) -------------- */
        if (this._dream.nextStepTime < now - 0.5) {
            this._dream.nextStepTime = now + 0.1;
        }
        if (this._drab.nextChordTime < now - 0.5) {
            this._drab.nextChordTime = now + 0.1;
            this._drab.nextMelodyTime = now + 1.2;
        }

        /* ---- Dream track: 16th-note sequencer --------------------------- */
        const dreamAudible = this._mixTarget < 0.995 || now < this._fadeGraceUntil;
        let guard = 0;
        while (this._dream.nextStepTime < horizon && guard < 512) {
            if (dreamAudible) {
                this._scheduleDreamStep(this._dream.nextStepTime, this._dream.totalSteps);
            }
            this._dream.totalSteps += 1;
            this._dream.nextStepTime += this._dream.stepDur;
            guard += 1;
        }

        /* ---- Drab track: pad chords -------------------------------------- */
        const drabAudible = this._mixTarget > 0.005 || now < this._fadeGraceUntil;
        guard = 0;
        while (this._drab.nextChordTime < horizon && guard < 64) {
            if (drabAudible) {
                this._padChord(
                    this._drab.nextChordTime,
                    DRAB_CHORDS[this._drab.chordIndex % DRAB_CHORDS.length],
                    this._drab.chordDur
                );
            }
            this._drab.chordIndex += 1;
            this._drab.nextChordTime += this._drab.chordDur;
            guard += 1;
        }

        /* ---- Drab track: sparse melody ------------------------------------ */
        guard = 0;
        while (this._drab.nextMelodyTime < horizon && guard < 64) {
            if (drabAudible && this._rng() < 0.55) {
                const midi = DRAB_MELODY_POOL[
                    Math.floor(this._rng() * DRAB_MELODY_POOL.length)
                ];
                this._drabLead(this._drab.nextMelodyTime, midi);
            }
            this._drab.nextMelodyTime += this._drab.melodyStep;
            guard += 1;
        }
    }

    /**
     * Schedules all Dream instruments landing on one 16th step:
     * marimba arp (composed pattern + seeded sparkle), bass on
     * downbeat/eighth, and offbeat hi-hat noise ticks for groove.
     * @param {number} time Exact start time (context clock).
     * @param {number} totalSteps Absolute step counter.
     * @private
     */
    _scheduleDreamStep(time, totalSteps) {
        const step = totalSteps % 16;
        const bar = Math.floor(totalSteps / 16);
        const chord = DREAM_CHORDS[bar % DREAM_CHORDS.length];
        const root = DREAM_BASS_ROOTS[bar % DREAM_BASS_ROOTS.length];

        /* Marimba arp pattern hits. */
        for (let i = 0; i < DREAM_ARP_PATTERN.length; i += 1) {
            const [patternStep, toneIndex, octaveUp] = DREAM_ARP_PATTERN[i];
            if (patternStep !== step) continue;
            let midi = chord[toneIndex % chord.length] + (octaveUp ? 12 : 0);
            /* Seeded ornament: occasional octave lift keeps it alive. */
            if (this._rng() < 0.14) midi += 12;
            const accent = step % 4 === 0 ? 1 : 0.72;
            this._marimba(time, midi, accent);
        }

        /* Seeded sparkle: a high grace note floating over offbeats. */
        if (step % 4 === 2 && this._rng() < 0.12) {
            this._marimba(time + this._dream.stepDur * 0.5, chord[3] + 12, 0.4);
        }

        /* Bass: root on the downbeat and the back eighth, fifth walk-up. */
        if (step === 0) {
            this._bassNote(time, root, this._dream.stepDur * 3.4, 0.24);
        } else if (step === 8) {
            this._bassNote(time, root, this._dream.stepDur * 2.6, 0.2);
        } else if (step === 14) {
            const walk = this._rng() < 0.4 ? root + 7 : root;
            this._bassNote(time, walk, this._dream.stepDur * 1.6, 0.16);
        }

        /* Hats: every off-8th, accented before the downbeat. */
        if (step % 2 === 1) {
            const accent = step % 8 === 7;
            this._hat(time, accent ? 0.08 : 0.045);
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       MUSIC — VOICE BUILDERS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Marimba voice: a sine fundamental with a fast exponential decay
     * plus a quiet 4th-harmonic partial that dies even faster — the
     * classic two-partial mallet approximation. Routed to the Dream bus.
     * @param {number} time Start time.
     * @param {number} midi Pitch.
     * @param {number} vel Velocity 0..1.
     * @private
     */
    _marimba(time, midi, vel) {
        const f = noteFreq(midi);
        this._playTone({
            type: 'sine', freq: f, startTime: time,
            duration: 0.34, attack: 0.002, peak: 0.34 * vel,
            dest: this._dreamBus
        });
        this._playTone({
            type: 'sine', freq: f * 4.0, startTime: time,
            duration: 0.11, attack: 0.002, peak: 0.07 * vel,
            dest: this._dreamBus
        });
    }

    /**
     * Dream bass: soft triangle with a gentle low-pass round-off.
     * @param {number} time Start time.
     * @param {number} midi Pitch.
     * @param {number} duration Note length, seconds.
     * @param {number} peak Velocity.
     * @private
     */
    _bassNote(time, midi, duration, peak) {
        this._playTone({
            type: 'triangle', freq: noteFreq(midi), startTime: time,
            duration, attack: 0.006, peak,
            filter: { type: 'lowpass', freq: 340 },
            dest: this._dreamBus
        });
    }

    /**
     * Hi-hat tick: 30 ms of high-passed noise. Cheap, unpitched, grooves.
     * @param {number} time Start time.
     * @param {number} peak Velocity.
     * @private
     */
    _hat(time, peak) {
        this._playNoise({
            startTime: time, duration: 0.035, attack: 0.001,
            peak, filter: { type: 'highpass', freq: 6500 },
            dest: this._dreamBus
        });
    }

    /**
     * Drab pad chord: each note is two detuned triangles (±6 cents beat
     * slowly against each other) through the shared 520 Hz low-pass,
     * with a 1.3 s attack and a 2.4 s release overlapping the next
     * chord for seamless legato. Gains are small — pads support, they
     * do not lead.
     * @param {number} time Chord start.
     * @param {ReadonlyArray<number>} midis Chord pitches.
     * @param {number} duration Chord length, seconds.
     * @private
     */
    _padChord(time, midis, duration) {
        const ctx = this._ctx;
        for (let i = 0; i < midis.length; i += 1) {
            const f = noteFreq(midis[i]);
            for (const detune of [-6, 6]) {
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = f;
                osc.detune.value = detune;
                const gain = ctx.createGain();
                const t0 = time;
                const tEnd = time + duration + 2.4;
                gain.gain.setValueAtTime(SILENCE, t0);
                gain.gain.linearRampToValueAtTime(0.045, t0 + 1.3);
                gain.gain.setValueAtTime(0.045, time + duration);
                gain.gain.exponentialRampToValueAtTime(SILENCE, tEnd);
                osc.connect(gain);
                gain.connect(this._padFilter);
                osc.start(t0);
                osc.stop(tEnd + 0.05);
                this._trackSource(osc);
            }
        }
    }

    /**
     * Drab sparse melody note: a lonely triangle, slow bloom, sent both
     * dry and into the feedback delay so it echoes into the rain.
     * @param {number} time Start time.
     * @param {number} midi Pitch.
     * @private
     */
    _drabLead(time, midi) {
        const ctx = this._ctx;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = noteFreq(midi);
        const gain = ctx.createGain();
        const t0 = time;
        const tEnd = time + 2.2;
        gain.gain.setValueAtTime(SILENCE, t0);
        gain.gain.linearRampToValueAtTime(0.09, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(SILENCE, tEnd);
        osc.connect(gain);
        gain.connect(this._drabBus);
        gain.connect(this._drabDelaySend);
        osc.start(t0);
        osc.stop(tEnd + 0.05);
        this._trackSource(osc);
    }

    /**
     * The Drab sub drone: a continuous A1 sine at whisper level with a
     * 0.09 Hz LFO breathing ±30% depth. Runs forever once booted; the
     * crossfade bus decides whether anyone hears it.
     * @private
     */
    _startDrone() {
        if (this._droneOsc || !this._ctx) return;
        const ctx = this._ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = noteFreq(DRAB_DRONE_MIDI);
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.05;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.09;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain);
        lfoGain.connect(droneGain.gain);
        osc.connect(droneGain);
        droneGain.connect(this._drabBus);
        osc.start();
        lfo.start();
        this._droneOsc = osc;
    }

    /* ══════════════════════════════════════════════════════════════════
       SFX PRIMITIVES (OSCILLATOR & NOISE VOICE FACTORIES)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers a scheduled source for lifecycle bookkeeping. The
     * 'ended' handler unregisters and disconnects — the leak guarantee
     * that keeps months-long sessions clean.
     * @param {AudioScheduledSourceNode} source Oscillator or buffer source.
     * @private
     */
    _trackSource(source) {
        this._activeSources.add(source);
        source.onended = () => {
            this._activeSources.delete(source);
            try {
                source.disconnect();
            } catch (error) {
                /* Disconnect races are benign. */
            }
        };
    }

    /**
     * SFX admission gate. Enforces the concurrency ceiling unless the
     * voice is force-flagged (thunder, fanfares, shift cues).
     * @param {boolean} force Bypass the ceiling.
     * @returns {boolean} True if the voice may spawn.
     * @private
     */
    _beginSfx(force) {
        if (this._failed || this._destroyed || !this._booted) return false;
        if (this._ctx.state !== 'running') return false;
        if (!force && this._activeSources.size >= MAX_CONCURRENT_SFX) return false;
        return true;
    }

    /**
     * Builds an optional StereoPannerNode. Older Safari lacks the node;
     * the null return short-circuits panning everywhere.
     * @param {?number} pan Pan −1..1; null disables.
     * @returns {?StereoPannerNode}
     * @private
     */
    _makePan(pan) {
        if (!this._supportsPanner || pan === null || pan === undefined) return null;
        const panner = this._ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        return panner;
    }

    /**
     * One-shot oscillator voice. Chain:
     *     osc → [filter] → [panner] → gain → dest
     * Envelope: linear attack from silence to peak, then a single
     * exponential decay to SILENCE across the remainder of the
     * duration. Frequency sweeps ramp linearly or exponentially toward
     * freqEnd over the same span.
     * @param {Object} opts
     * @param {OscillatorType} [opts.type='sine'] Waveform.
     * @param {number} opts.freq Start frequency, Hz.
     * @param {?number} [opts.freqEnd=null] Sweep target frequency.
     * @param {number} [opts.duration=0.2] Total life, seconds.
     * @param {number} [opts.attack=0.004] Attack seconds.
     * @param {number} [opts.peak=0.2] Peak gain.
     * @param {number} [opts.startTime] Start time; defaults to now.
     * @param {AudioNode} [opts.dest] Output bus; defaults to sfxGain.
     * @param {?number} [opts.pan=null] Stereo placement.
     * @param {?Object} [opts.filter=null] Biquad spec {type, freq, Q}.
     * @param {boolean} [opts.force=false] Bypass the concurrency cap.
     * @returns {?OscillatorNode} The source, or null when gated.
     * @private
     */
    _playTone(opts) {
        if (!this._beginSfx(Boolean(opts.force))) return null;
        const ctx = this._ctx;
        const t0 = Number.isFinite(opts.startTime) ? opts.startTime : ctx.currentTime;
        const duration = Math.max(0.02, Number.isFinite(opts.duration) ? opts.duration : 0.2);
        const attack = Math.min(0.1, Math.max(0.001, opts.attack ?? 0.004));
        const peak = clamp01(opts.peak ?? 0.2);

        const osc = ctx.createOscillator();
        osc.type = opts.type ?? 'sine';
        osc.frequency.setValueAtTime(Math.max(1, opts.freq), t0);
        if (Number.isFinite(opts.freqEnd) && opts.freqEnd > 0) {
            osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + duration);
        }

        let tail = osc;
        if (opts.filter && typeof opts.filter === 'object') {
            const bq = ctx.createBiquadFilter();
            bq.type = opts.filter.type ?? 'lowpass';
            bq.frequency.value = opts.filter.freq ?? 800;
            bq.Q.value = opts.filter.Q ?? 0.8;
            tail.connect(bq);
            tail = bq;
        }
        const panner = this._makePan(opts.pan ?? null);
        if (panner) {
            tail.connect(panner);
            tail = panner;
        }
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(SILENCE, t0);
        gain.gain.linearRampToValueAtTime(Math.max(SILENCE, peak), t0 + attack);
        gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + duration);
        tail.connect(gain);
        gain.connect(opts.dest ?? this._sfxGain);

        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
        this._trackSource(osc);
        return osc;
    }

    /**
     * One-shot noise voice. Chain:
     *     bufferSrc → [biquad with optional freq sweep] → [panner] → gain → dest
     * The shared pre-rendered noise buffer is never re-allocated; only
     * the per-strike nodes are. Filter sweeps ramp exponentially from
     * freq to freqEnd across the duration — the thunder clap→rumble
     * shape and UI whooshes both live here.
     * @param {Object} opts
     * @param {number} [opts.duration=0.2] Total life, seconds.
     * @param {number} [opts.attack=0.003] Attack seconds.
     * @param {number} [opts.peak=0.2] Peak gain.
     * @param {number} [opts.playbackRate=1] Noise pitch scaling.
     * @param {number} [opts.startTime] Start time; defaults to now.
     * @param {AudioNode} [opts.dest] Output bus; defaults to sfxGain.
     * @param {?number} [opts.pan=null] Stereo placement.
     * @param {?Object} [opts.filter=null]
     *   {type, freq, Q, freqEnd} — freqEnd enables the sweep.
     * @param {boolean} [opts.force=false] Bypass the concurrency cap.
     * @returns {?AudioBufferSourceNode} The source, or null when gated.
     * @private
     */
    _playNoise(opts) {
        if (!this._beginSfx(Boolean(opts.force))) return null;
        const ctx = this._ctx;
        const t0 = Number.isFinite(opts.startTime) ? opts.startTime : ctx.currentTime;
        const duration = Math.max(0.015, Number.isFinite(opts.duration) ? opts.duration : 0.2);
        const attack = Math.min(0.15, Math.max(0.001, opts.attack ?? 0.003));
        const peak = clamp01(opts.peak ?? 0.2);

        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop = false;
        src.playbackRate.value = Number.isFinite(opts.playbackRate) && opts.playbackRate > 0
            ? opts.playbackRate
            : 1;

        let tail = src;
        if (opts.filter && typeof opts.filter === 'object') {
            const bq = ctx.createBiquadFilter();
            bq.type = opts.filter.type ?? 'lowpass';
            bq.frequency.setValueAtTime(Math.max(20, opts.filter.freq ?? 800), t0);
            bq.Q.value = opts.filter.Q ?? 0.8;
            if (Number.isFinite(opts.filter.freqEnd) && opts.filter.freqEnd > 0) {
                bq.frequency.exponentialRampToValueAtTime(opts.filter.freqEnd, t0 + duration);
            }
            tail.connect(bq);
            tail = bq;
        }
        const panner = this._makePan(opts.pan ?? null);
        if (panner) {
            tail.connect(panner);
            tail = panner;
        }
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(SILENCE, t0);
        gain.gain.linearRampToValueAtTime(Math.max(SILENCE, peak), t0 + attack);
        gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + duration);
        tail.connect(gain);
        gain.connect(opts.dest ?? this._sfxGain);

        src.start(t0);
        src.stop(t0 + duration + 0.05);
        this._trackSource(src);
        return src;
    }

    /* ══════════════════════════════════════════════════════════════════
       SFX CATALOG
       ══════════════════════════════════════════════════════════════════ */

    /** Menu cursor move: short dry square blip. @returns {this} */
    uiMove() {
        this._playTone({ type: 'square', freq: 640, duration: 0.05, peak: 0.08 });
        return this;
    }

    /** Menu confirm: two-step ascending square chirp. @returns {this} */
    uiConfirm() {
        const now = this._ctx ? this._ctx.currentTime : 0;
        this._playTone({ type: 'square', freq: 660, duration: 0.06, peak: 0.1, startTime: now });
        this._playTone({ type: 'square', freq: 990, duration: 0.08, peak: 0.1, startTime: now + 0.06 });
        return this;
    }

    /** Menu cancel/back: descending square chirp. @returns {this} */
    uiCancel() {
        const now = this._ctx ? this._ctx.currentTime : 0;
        this._playTone({ type: 'square', freq: 520, duration: 0.06, peak: 0.1, startTime: now });
        this._playTone({ type: 'square', freq: 330, duration: 0.09, peak: 0.1, startTime: now + 0.06 });
        return this;
    }

    /**
     * Typewriter tick for DialogueBox's 'chartyped' stream. A 1.9 kHz
     * square needle, 18 ms, throttled to ~35 Hz so high charsPerSecond
     * settings collapse into texture instead of machine-gunning.
     * @param {string} [char] Revealed character; spaces stay silent.
     * @returns {this}
     */
    dialogueTick(char = 'a') {
        if (char === ' ' || char === '\t' || char === '\n') return this;
        const now = this._ctx ? this._ctx.currentTime : 0;
        if (now - this._lastDialogueTickAt < DIALOGUE_TICK_MIN_INTERVAL) return this;
        this._lastDialogueTickAt = now;
        const pitch = 1750 + this._rng() * 380;
        this._playTone({ type: 'square', freq: pitch, duration: 0.018, peak: 0.045 });
        return this;
    }

    /**
     * Footstep: alternating filtered noise taps. The alternating
     * band-pass frequency gives left/right character without samples.
     * @returns {this}
     */
    footstep() {
        this._stepFoot = !this._stepFoot;
        this._playNoise({
            duration: 0.07,
            peak: 0.09,
            attack: 0.004,
            filter: {
                type: 'lowpass',
                freq: this._stepFoot ? 750 : 950
            }
        });
        return this;
    }

    /** Item pickup: quick ascending sine pair. @returns {this} */
    pickup() {
        const now = this._ctx ? this._ctx.currentTime : 0;
        this._playTone({ type: 'sine', freq: 660, duration: 0.09, peak: 0.14, startTime: now });
        this._playTone({ type: 'sine', freq: 990, duration: 0.14, peak: 0.14, startTime: now + 0.08 });
        return this;
    }

    /** Player hurt: falling saw sweep plus a noise snap. @returns {this} */
    hurt() {
        this._playTone({ type: 'sawtooth', freq: 320, freqEnd: 90, duration: 0.22, peak: 0.18 });
        this._playNoise({
            duration: 0.05, peak: 0.14,
            filter: { type: 'bandpass', freq: 1800, Q: 1.2 }
        });
        return this;
    }

    /**
     * Combat impact (bullet connect, melee hit). Low sine thump scaled
     * by intensity plus a bright transient click.
     * @param {number} [intensity=0.6] Impact strength 0..1.
     * @returns {this}
     */
    impact(intensity = 0.6) {
        const level = clamp01(intensity);
        this._playTone({
            type: 'sine', freq: 170 + 60 * level, freqEnd: 42,
            duration: 0.22 + 0.12 * level, peak: 0.16 + 0.2 * level
        });
        this._playNoise({
            duration: 0.035, peak: 0.1 + 0.12 * level,
            filter: { type: 'highpass', freq: 2500 }
        });
        return this;
    }

    /** Bullet-hell projectile launch: fast downward square chirp. @returns {this} */
    projectile() {
        this._playTone({ type: 'square', freq: 880, freqEnd: 330, duration: 0.11, peak: 0.1 });
        return this;
    }

    /** Dodge/dash: whooshing noise sweep with an upward filter glide. @returns {this} */
    dash() {
        this._playNoise({
            duration: 0.24, peak: 0.14, attack: 0.02,
            filter: { type: 'bandpass', freq: 500, Q: 1.1, freqEnd: 2400 }
        });
        return this;
    }

    /**
     * Level-up fanfare: four-note ascending square arpeggio (C E G C),
     * force-flagged so it always cuts through combat noise.
     * @returns {this}
     */
    levelUp() {
        if (!this._beginSfx(true)) return this;
        const now = this._ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < notes.length; i += 1) {
            this._playTone({
                type: 'square', freq: notes[i],
                startTime: now + i * 0.09,
                duration: i === notes.length - 1 ? 0.42 : 0.12,
                peak: 0.13, force: true
            });
        }
        return this;
    }

    /**
     * Quest update chime: bell approximation — a sine fundamental with
     * an inharmonic 2.7× partial, the classic struck-metal pairing.
     * @returns {this}
     */
    questChime() {
        const f = 784;
        this._playTone({ type: 'sine', freq: f, duration: 0.7, peak: 0.14 });
        this._playTone({ type: 'sine', freq: f * 2.7, duration: 0.45, peak: 0.05 });
        return this;
    }

    /** HUD skill-ready ping (HUD 'skillready' event). @returns {this} */
    skillReady() {
        this._playTone({ type: 'triangle', freq: 1180, duration: 0.1, peak: 0.1 });
        return this;
    }

    /**
     * Orange juice consumed: bubbly ascending triangle blips plus a
     * fizzy high-passed noise tail — the taste of restored reality.
     * @returns {this}
     */
    juiceDrink() {
        if (!this._beginSfx(true)) return this;
        const now = this._ctx.currentTime;
        for (let i = 0; i < 3; i += 1) {
            this._playTone({
                type: 'triangle',
                freq: 320 + i * 150 + this._rng() * 60,
                startTime: now + i * 0.07,
                duration: 0.09,
                peak: 0.12,
                force: true
            });
        }
        this._playNoise({
            startTime: now + 0.16,
            duration: 0.35,
            peak: 0.06,
            force: true,
            filter: { type: 'highpass', freq: 3800 }
        });
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK HOOK
       ══════════════════════════════════════════════════════════════════ */

    /**
     * GameLoop integration point. The scheduler is timer-driven, but
     * re-running its guard each tick is a cheap safety net for browsers
     * that throttle background intervals, and it keeps AudioEngine
     * symmetrical with every other update(dt) subsystem.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._schedule();
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to an engine event: 'unlocked', 'worldmix', 'thunder',
     * 'mute'.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {Function} Unsubscribe function.
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[AudioEngine] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[AudioEngine] listener must be a function.');
        }
        let set = this._listeners.get(type);
        if (!set) {
            set = new Set();
            this._listeners.set(type, set);
        }
        set.add(listener);
        return () => this.removeEventListener(type, listener);
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
     * Broadcasts an event with error isolation. Audio hooks are cosmetic;
     * a throwing subscriber must never kill the simulation tick.
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
                console.error(`[AudioEngine] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll
     * at HUD rate (4–10 Hz), not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            state: this.state,
            locked: this.isLocked,
            targetWorld: this._targetWorld,
            mixTarget: this._mixTarget,
            rainLevel: this._rainTarget,
            activeSources: this._activeSources.size,
            sfxCap: MAX_CONCURRENT_SFX,
            schedulerRunning: this._schedulerId !== null,
            seed: this._seed,
            settings: this.getSettings()
        };
    }
}

export default AudioEngine;