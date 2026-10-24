/**
 * @file src/systems/EnergySystem.js
 * @module systems/EnergySystem
 * @description
 * The Orange Energy economy for "A Stitch in Time" — the reality anchor
 * that binds the two dimensions together.
 *
 * EnergySystem is the SINGLE OWNER of the orange reserve. Every drain and
 * refill in the engine flows through it:
 *
 *   Player  → spend() per sprint tick and dodge commit (duck-typed
 *             consumer: reads .energy / .maxEnergy / .fraction).
 *   HUD     → reads player.oranges / maxOranges (bridged getters) and
 *             draws the ORANGE bar with the critical flicker below 15%.
 *   Game    → subscribes 'depleted' → requestShift(DRAB, ENERGY_DEPLETED)
 *             and 'restored' → requestShift(DREAM, JUICE_CONSUMED).
 *
 * There is deliberately NO duplicate reserve anywhere else: Player treats
 * an unattached system as infinite only for menu flight and tests, and
 * every gameplay drain calls spend() so the reserve, the HUD, and the
 * dimension state machine can never desynchronize.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POOL MODEL (BLUEPRINT §2.1)
 * ───────────────────────────────────────────────────────────────────────────
 * The reserve is a REAL-VALUED pool measured in oranges:
 *
 *   energy ∈ [0, maxEnergy]        (default max 20)
 *
 * Continuous drains (sprint at 18/s, passive Dream decay at 0.22/s)
 * produce fractional reserves; the HUD presents them with ceil() so the
 * bar never reads "0" while a fraction of an orange still holds the
 * stitch together. spend() is the ONLY mutation path that lowers the
 * pool, and it returns the amount actually consumed:
 *
 *   consumed = min(request, energy)
 *   energy  -= consumed
 *
 * Callers use the return value to scale under-funded actions (Player's
 * exhausted dodge scales its impulse by the funded fraction), so a
 * reserve that runs dry mid-action degrades the action instead of
 * teleporting the player or silently granting free energy.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DEPLETION / RESTORATION HYSTERESIS
 * ───────────────────────────────────────────────────────────────────────────
 * Crossing exactly to 0 latches the 'depleted' state and dispatches the
 * 'depleted' event ONCE. Game converts that event into the flicker-style
 * collapse into the Drab World. While latched:
 *
 *   - spend() still returns 0 (actions read as unfunded, not errored);
 *   - passive Dream decay stops (the Drab World cannot double-punish a
 *     player who is already locked out);
 *   - only restore() with a positive amount clears the latch, dispatching
 *     'restored' exactly once at the crossing.
 *
 * The latch is the hysteresis: hovering near zero can never strobe the
 * dimension state machine, exactly as Player's sprint lockout uses
 * SPRINT_RESUME_FRACTION to never strobe the speed multiplier.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DUAL-WORLD DRAIN RULES
 * ───────────────────────────────────────────────────────────────────────────
 *   DREAM: passive decay drains the pool every gameplay tick. The Dream
 *          World is vibrancy itself; staying in it costs reality.
 *   DRAB:  the pool sits at 0 (depleted). No drain, no decay. The only
 *          way out is the Orange Juice Cart: consumeJuice() refills the
 *          reserve to maximum and fires the fade-style return.
 *
 * World awareness arrives through attachWorldManager() (subscribes to
 * 'worldchanged', the same pattern as AudioEngine / UIManager / HUD) or
 * setWorld() directly for tests.
 *
 * @example
 * const energy = new EnergySystem({ maxEnergy: 20, seed: 42 });
 * energy.attachWorldManager(worlds);
 * game.attachEnergySystem(energy);      // wires depleted/restored shifts
 * player.attachEnergySystem(energy);    // wires sprint/dodge drains
 *
 * // Juice Cart interaction (Drab World vendor):
 * energy.consumeJuice();                // → 'restored' → Dream World fade
 */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Blueprint starting reserve: "The player begins with 20 Oranges." */
export const DEFAULT_MAX_ORANGES = 20;

/**
 * Passive Dream World decay, oranges per second. 0.22/s empties a full
 * reserve in ~91 s of pure exploration — long enough to explore, short
 * enough that sprinting and dodging (Player-owned drains of 18/s and 12
 * per commit) materially accelerate the collapse.
 */
export const DEFAULT_DREAM_PASSIVE_DRAIN = 0.22;

/** The Drab World never passively drains: the reserve is already 0. */
export const DRAB_PASSIVE_DRAIN = 0;

/** Fraction below which the 'energylow' edge event fires (matches Player). */
export const LOW_ENERGY_FRACTION = 0.2;

/** World identifiers accepted by setWorld(). @enum {string} */
export const ENERGY_WORLD = Object.freeze({ DREAM: 'DREAM', DRAB: 'DRAB' });

/* ══════════════════════════════════════════════════════════════════════════
   ENERGY SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Single owner of the orange reserve: continuous drains, hysteresis
 * latching, dual-world drain rules, and the dimension-shift trigger
 * events consumed by Game.
 *
 * Player duck-type contract (validated by Player.attachEnergySystem at
 * wiring time, so a misconfigured system fails at boot, not mid-sprint):
 * @property {number} energy     Current reserve (getter).
 * @property {number} maxEnergy  Pool ceiling, > 0 (getter).
 * @property {Function} spend    (amount) => actual consumed.
 */
export class EnergySystem {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxEnergy=20] Pool ceiling (> 0).
     * @param {number} [options.initialEnergy=maxEnergy] Starting reserve,
     *   clamped into [0, maxEnergy].
     * @param {number} [options.dreamPassiveDrain=0.22] Dream decay, oranges/s.
     * @param {number} [options.drabPassiveDrain=0] Drab decay, oranges/s.
     * @param {string} [options.world='DREAM'] Initial dimension.
     * @throws {TypeError} If options is not an object.
     * @throws {RangeError} If numeric options are out of bounds.
     */
    constructor(options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[EnergySystem] options must be an object.');
        }

        const maxEnergy = options.maxEnergy ?? DEFAULT_MAX_ORANGES;
        if (!Number.isFinite(maxEnergy) || maxEnergy <= 0) {
            throw new RangeError(
                `[EnergySystem] maxEnergy must be positive; received ${maxEnergy}.`
            );
        }

        /** @type {number} Pool ceiling in oranges. */
        this._maxEnergy = maxEnergy;

        const initial = options.initialEnergy ?? maxEnergy;
        if (!Number.isFinite(initial) || initial < 0) {
            throw new RangeError(
                `[EnergySystem] initialEnergy must be finite and >= 0; received ${initial}.`
            );
        }

        /** @type {number} Current reserve in oranges, [0, maxEnergy]. */
        this._energy = Math.min(initial, maxEnergy);

        const dreamDrain = options.dreamPassiveDrain ?? DEFAULT_DREAM_PASSIVE_DRAIN;
        if (!Number.isFinite(dreamDrain) || dreamDrain < 0) {
            throw new RangeError(
                '[EnergySystem] dreamPassiveDrain must be finite and >= 0.'
            );
        }

        const drabDrain = options.drabPassiveDrain ?? DRAB_PASSIVE_DRAIN;
        if (!Number.isFinite(drabDrain) || drabDrain < 0) {
            throw new RangeError(
                '[EnergySystem] drabPassiveDrain must be finite and >= 0.'
            );
        }

        /** @type {number} Passive decay rate in the Dream World, oranges/s. */
        this._dreamDrain = dreamDrain;

        /** @type {number} Passive decay rate in the Drab World, oranges/s. */
        this._drabDrain = drabDrain;

        const world = options.world ?? ENERGY_WORLD.DREAM;
        this._validateWorld(world);

        /** @type {string} Active dimension for drain-rule selection. */
        this._world = world;

        /* ---- Hysteresis latch ----------------------------------------- */
        /**
         * True after the reserve hits exactly 0, until a positive restore.
         * Gates the one-shot 'depleted' / 'restored' event pair.
         * @type {boolean}
         */
        this._depleted = this._energy <= 0;

        /** @type {boolean} 'energylow' edge latch (fraction < 0.2). */
        this._low = !this._depleted && this.fraction < LOW_ENERGY_FRACTION;

        /* ---- Event bus ------------------------------------------------ */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /* ---- World subscription (attachWorldManager) ------------------- */
        /** @type {Array<Function>} Unsubscribe handles. */
        this._worldUnsubs = [];
        /** @type {?Object} Attached WorldManager, if any. */
        this._worlds = null;

        /* ---- Diagnostics ------------------------------------------------ */
        /** @type {number} Total simulation seconds advanced. */
        this._elapsed = 0;
        /** @type {number} Lifetime oranges consumed via spend(). */
        this._totalSpent = 0;
        /** @type {number} Lifetime oranges returned via restore(). */
        this._totalRestored = 0;
    }

    /* ══════════════════════════════════════════════════════════════════
       PLAYER DUCK-TYPE CONTRACT
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {number} Current orange reserve. */
    get energy() {
        return this._energy;
    }

    /** @returns {number} Pool ceiling in oranges. */
    get maxEnergy() {
        return this._maxEnergy;
    }

    /** @returns {number} Reserve as a fraction of maximum, [0, 1]. */
    get fraction() {
        return this._maxEnergy > 0 ? this._energy / this._maxEnergy : 0;
    }

    /* Alias matching HUD/player naming: an orange IS the unit. */
    /** @returns {number} Current orange reserve. */
    get oranges() {
        return this._energy;
    }

    /** @returns {number} Pool ceiling in oranges. */
    get maxOranges() {
        return this._maxEnergy;
    }

    /** @returns {boolean} True while the depletion latch is held. */
    get isDepleted() {
        return this._depleted;
    }

    /** @returns {string} Active dimension ('DREAM' | 'DRAB'). */
    get world() {
        return this._world;
    }

    /**
     * Attempts to consume `amount` oranges.
     *
     * Returns the ACTUAL amount consumed, which may be less than requested
     * when the reserve runs dry (and is always 0 while depleted). Callers
     * scale under-funded actions by the funded fraction.
     *
     * @param {number} amount Requested consumption (>= 0).
     * @returns {number} Oranges actually consumed, [0, amount].
     */
    spend(amount) {
        if (!Number.isFinite(amount) || amount <= 0 || this._depleted) return 0;

        const consumed = Math.min(amount, this._energy);
        this._energy -= consumed;
        this._totalSpent += consumed;

        this._updateLowLatch();

        if (this._energy <= 0) {
            this._energy = 0;
            this._depleted = true;
            this._low = false;
            this.emit('depleted', {
                energy: 0,
                fraction: 0,
                world: this._world,
                totalSpent: this._totalSpent
            });
        }

        return consumed;
    }

    /**
     * Returns oranges to the pool. Clearing the depletion latch dispatches
     * the one-shot 'restored' event that Game converts into the
     * fade-style return to the Dream World.
     *
     * @param {number} amount Oranges to return (>= 0).
     * @returns {number} Oranges actually restored.
     */
    restore(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return 0;

        const restored = Math.min(amount, this._maxEnergy - this._energy);
        this._energy += restored;
        this._totalRestored += restored;

        if (restored > 0 && this._depleted) {
            this._depleted = false;
            this.emit('restored', {
                energy: this._energy,
                fraction: this.fraction,
                world: this._world,
                totalRestored: this._totalRestored
            });
        }

        this._updateLowLatch();
        return restored;
    }

    /**
     * The Orange Juice Cart transaction (Drab World vendor): refills the
     * reserve to maximum. The blueprint recovery loop — spend currency at
     * the cart, consume the juice, fade back into the Dream World.
     * @returns {number} Oranges restored (0 when already full).
     */
    consumeJuice() {
        return this.restore(this._maxEnergy - this._energy);
    }

    /* ══════════════════════════════════════════════════════════════════
       SIMULATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the passive decay for one fixed tick. Active drains
     * (sprint, dodge) do NOT run here — the Player owns them because only
     * the Player knows its movement state; this method owns only the
     * world-driven decay.
     *
     * @param {number} dt Fixed timestep in seconds (> 0).
     * @param {?Object} [input] Unused; present for the Game update contract.
     * @returns {this}
     */
    update(dt, input = null) {
        void input; // Game passes the InputManager; decay is input-independent.
        if (!Number.isFinite(dt) || dt <= 0) return this;

        this._elapsed += dt;

        const rate = this._world === ENERGY_WORLD.DREAM
            ? this._dreamDrain
            : this._drabDrain;

        if (rate > 0 && !this._depleted) {
            this.spend(rate * dt);
        }

        return this;
    }

    /**
     * Subscribes to the WorldManager so drain rules follow the active
     * dimension without per-tick polling. Same attach pattern as
     * AudioEngine, UIManager, and HUD.
     * @param {?Object} worlds WorldManager exposing on('worldchanged').
     * @returns {this}
     */
    attachWorldManager(worlds) {
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.warn('[EnergySystem] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];

        this._worlds = worlds;
        if (worlds && typeof worlds.on === 'function') {
            this._worldUnsubs.push(
                worlds.on('worldchanged', (detail) => {
                    if (detail && typeof detail.to === 'string') {
                        this.setWorld(detail.to);
                    }
                })
            );
        }
        return this;
    }

    /**
     * Switches the active dimension for drain-rule selection.
     * @param {string} world 'DREAM' or 'DRAB'.
     * @returns {this}
     * @throws {RangeError} On an unknown world id.
     */
    setWorld(world) {
        this._validateWorld(world);
        this._world = world;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENT BUS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to an energy event.
     *
     * Events emitted:
     *   'depleted'  {energy, fraction, world, totalSpent}   — once at zero
     *   'restored'  {energy, fraction, world, totalRestored} — once on refill
     *   'energylow' {fraction}      — edge crossing below 0.2
     *   'recovered' {fraction}      — edge crossing back up to >= 0.2
     *
     * Listener exceptions are isolated so a failing consumer can never
     * break the dimension-shift dispatch chain.
     *
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving the detail object.
     * @returns {Function} Unsubscribe function.
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || typeof listener !== 'function') {
            throw new TypeError('[EnergySystem] listener must be a function.');
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
     * Broadcasts an event with per-listener error isolation.
     * @param {string} type Event name.
     * @param {Object} detail Payload.
     * @returns {void}
     * @private
     */
    emit(type, detail) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const listener of set) {
            try {
                listener(detail);
            } catch (error) {
                console.error(`[EnergySystem] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll
     * at HUD rate, not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            energy: this._energy,
            maxEnergy: this._maxEnergy,
            fraction: this.fraction,
            world: this._world,
            depleted: this._depleted,
            dreamDrain: this._dreamDrain,
            elapsed: this._elapsed,
            totalSpent: this._totalSpent,
            totalRestored: this._totalRestored
        };
    }

    /**
     * Detaches world subscriptions and clears listeners. The system must
     * not be reused after destroy().
     * @returns {void}
     */
    destroy() {
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.warn('[EnergySystem] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];
        this._worlds = null;
        this._listeners.clear();
    }

    /* ══════════════════════════════════════════════════════════════════
       INTERNAL HELPERS
       ═════════════════════════════════════════════════════════════════ */

    /**
     * Maintains the 'energylow' / 'recovered' edge latch.
     * @returns {void}
     * @private
     */
    _updateLowLatch() {
        const low = !this._depleted && this.fraction < LOW_ENERGY_FRACTION;
        if (low && !this._low) {
            this._low = true;
            this.emit('energylow', { fraction: this.fraction });
        } else if (!low && this._low) {
            this._low = false;
            this.emit('recovered', { fraction: this.fraction });
        } else {
            this._low = low;
        }
    }

    /**
     * Validates a world identifier.
     * @param {string} world Candidate world id.
     * @returns {void}
     * @throws {RangeError} On an unknown world id.
     * @private
     */
    _validateWorld(world) {
        if (world !== ENERGY_WORLD.DREAM && world !== ENERGY_WORLD.DRAB) {
            throw new RangeError(`[EnergySystem] Unknown world: ${world}.`);
        }
    }
}

export default EnergySystem;
