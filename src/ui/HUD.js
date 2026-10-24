/**
 * @file src/ui/HUD.js
 * @module ui/HUD
 * @description
 * Head-up display layer for "YUCCA".
 *
 * HUD owns every persistent at-a-glance readout: the player's vital bars,
 * the Orange Energy reality anchor, the active-dimension badge, the skill
 * hotbar with cooldown overlays, and the ASCII radar mini-map. It draws
 * exclusively through the Renderer's SCREEN-SPACE API (drawString /
 * drawRect), which bypasses the camera transform and the presented-cell
 * cache — the sanctioned path for interface elements that must never
 * scroll, shake, or participate in world-cell diffing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RENDER PASS PLACEMENT
 * ───────────────────────────────────────────────────────────────────────────
 * The HUD presents after the world blit and before any full-screen
 * transition overlay:
 *
 *     renderer.beginFrame();
 *     worlds.render(renderer, alpha);   // camera-space world
 *     hud.render(alpha);                // screen-space interface
 *     // TransitionFX / UIManager overlays draw after this
 *     renderer.endFrame();
 *
 * Unlike world cells, HUD output is redrawn unconditionally each frame.
 * This is deliberate and cheap: the entire interface is a few dozen glyph
 * runs, far below the cost of one weather-churned world region, and the
 * presented-cell cache is keyed to the world camera, which the interface
 * must not share. All animation (badge pulse, radar sweep, ready flashes)
 * is a pure function of the SIMULATION CLOCK advanced in update(dt), so
 * catch-up ticks reproduce identical motion — the engine-wide determinism
 * policy also used by WorldManager's flicker noise and WeatherSystem.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ASCII BAR COMPOSITION FORMULA
 * ───────────────────────────────────────────────────────────────────────────
 * Every status bar quantizes a [0, 1] fraction into glyph cells:
 *
 *     filled  = round(fraction · innerCols)
 *     bar     = fillGlyph × filled + emptyGlyph × (innerCols − filled)
 *     row     = LABEL  [████████░░░░]   80/100  80%
 *
 * Rounding (not flooring) keeps a full bar visually full and a near-empty
 * bar from reading as zero. Percentages are right-padded to three columns
 * so digit-width changes never wobble the rows below. Labels are padded to
 * a fixed column so stacked bars align:
 *
 *     HP     [██████████░░]  83/100  83%
 *     MP     [████░░░░░░░░]  21/60   35%
 *     ORANGE [████████████]  20/20   100%
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIMENSION-AWARE PALETTE (THE DRAB COLLAPSE)
 * ───────────────────────────────────────────────────────────────────────────
 * The Drab World drains hue from reality, and the interface is part of
 * reality. When the active dimension is DRAB, every HUD color passes
 * through the same Rec. 709 luminance collapse the Renderer applies to
 * world cells:
 *
 *     luma = round(0.2126·r + 0.7152·g + 0.0722·b)
 *
 * ONE color family is exempt: the Orange Energy bar and its badge pulse.
 * Oranges are the reality anchor that bridges both dimensions — the single
 * thread of warmth that survives the grayscale, by design. This exemption
 * is narrative-made-rendering: when the player's last color in a colorless
 * city is their energy reserve, the economy explains itself.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MINI-MAP / RADAR PROJECTION MATH
 * ───────────────────────────────────────────────────────────────────────────
 * The radar is a top-down projection of world space into a fixed cell grid,
 * centered on the camera focus (the player). Let (cx, cy) be the radar
 * center in world pixels and (rangeX, rangeY) the world radius mapped onto
 * the grid's half-extents:
 *
 *     nx   = clamp((wx − cx) / rangeX, −1, 1)          normalized offset
 *     col  = round((nx + 1) / 2 · (radarCols − 1))     world → cell
 *     row  = round((ny + 1) / 2 · (radarRows − 1))
 *
 * Contacts beyond range CLAMP to the frame edge rather than vanishing: an
 * off-screen hostile still reads as a threat direction. Default ranges are
 * 1.5× the camera viewport on each axis, so the radar always shows a ring
 * of space beyond what the player can see.
 *
 * A rotating sweep line sells the radar fantasy. The sweep angle advances
 * on the simulation clock, θ(t) = 2π·(t·sweepHz mod 1); each contact's
 * brightness scales with angular proximity to the sweep:
 *
 *     bearing = atan2(wy − cy, wx − cx)
 *     delta   = normalizeAngle(bearing − θ)  ∈ [−π, π]
 *     glint   = max(0, 1 − |delta| / sweepWindow)
 *     alpha   = base + glint · boost
 *
 * The viewport extent is drawn as four corner ticks inside the grid, so
 * the player always knows which blips are already on screen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOTBAR COMPOSITION
 * ───────────────────────────────────────────────────────────────────────────
 * Each skill slot is a fixed five-row cell block:
 *
 *      [1]        keybind label (from InputManager bindings)
 *     .-----.     frame
 *     |  ◈  |     skill glyph (dimmed while cooling, LOCK when locked)
 *     |▓▓▓░░|     readiness gauge: filled = round((1 − rem/dur) · inner)
 *     '-----'     frame; the numeric row replaces the gauge readout
 *
 * While a skill cools, its glyph is veiled and the numeric readout shows
 * remaining seconds (one decimal under 10 s, ceil above). The instant a
 * slot becomes ready, a 0.5 s quadratic-decay white flash fires and the
 * 'skillready' event broadcasts — audio hooks synthesize the chime there.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROVIDER CONTRACTS (DUCK-TYPED, FAIL-SOFT)
 * ───────────────────────────────────────────────────────────────────────────
 *     player    {name, level, hp, maxHp, mp, maxMp, oranges, maxOranges,
 *                energyFraction, currency, currencyName, party[]}
 *     worlds    WorldManager: getActiveWorldId(), getTransitionStatus(),
 *                on('worldchanged', …)
 *     camera    Camera: x, y, viewportWidth, viewportHeight
 *     radar     getRadarContacts() → [{x, y, kind|tags, glyph?, color?}]
 *                (Entity instances with hasTag('hostile'|'quest-marker')
 *                are accepted and classified automatically)
 *     skills    getSkills() → [{name, glyph, action, cooldownRemaining,
 *                cooldownDuration, locked}]
 *
 * @example
 * const hud = new HUD(renderer, { barInnerCols: 12 });
 * hud.attachPlayer(player);
 * hud.attachWorldManager(worlds);
 * hud.attachCamera(worlds.getCamera());
 * hud.attachRadarSource(entityIndex);
 * hud.attachSkillProvider(playerSkillBar);
 * hud.addEventListener('skillready', ({ name }) => audio.chime(name));
 *
 * // Per fixed tick:
 * hud.update(dt);
 * // Per presentation frame, after worlds.render():
 * hud.render(alpha);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — GEOMETRY & TIMING
   ══════════════════════════════════════════════════════════════════════════ */

/** Default interior width of status bars, glyph cells. */
const DEFAULT_BAR_CELLS = 12;

/** Orange reserve fraction below which the badge and bar pulse. */
const DEFAULT_CRITICAL_FRACTION = 0.15;

/** Radar grid defaults (odd widths center the player marker cleanly). */
const DEFAULT_RADAR_COLS = 19;
const DEFAULT_RADAR_ROWS = 9;

/** Default radar range as a multiple of the camera viewport per axis. */
const RADAR_RANGE_VIEWPORT_SCALE = 1.5;

/** Maximum contacts projected per frame (cost guard). */
const DEFAULT_MAX_CONTACTS = 48;

/** Radar sweep rotation rate, turns per second. */
const DEFAULT_SWEEP_HZ = 0.25;

/** Angular half-window (radians) over which the sweep glint fades. */
const SWEEP_WINDOW_RADIANS = 0.9;

/** Ready-flash duration after a cooldown completes, seconds. */
const READY_FLASH_SECONDS = 0.5;

/** Badge flash duration after a world commit, seconds. */
const WORLD_FLASH_SECONDS = 0.6;

/** Hotbar slot geometry, glyph cells. */
const SLOT_WIDTH = 7;
const SLOT_HEIGHT = 5;
const SLOT_GAP = 1;
const SLOT_INNER = SLOT_WIDTH - 2;

/** Screen margin for anchored blocks, glyph cells. */
const MARGIN_CELLS = 1;

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — GLYPHS & COLORS
   ══════════════════════════════════════════════════════════════════════════ */

/** Bar glyphs: full block, light shade, dense gauge fill. */
const GLYPH_BAR_FILL = 0x2588;   // '█'
const GLYPH_BAR_EMPTY = 0x2591;  // '░'
const GLYPH_GAUGE_FILL = 0x2593; // '▓'

/** Frame glyphs (pure ASCII per the project frame style). */
const GLYPH_CORNER = 0x2B;       // '+'
const GLYPH_HORIZ = 0x2D;        // '-'
const GLYPH_VERT = 0x7C;         // '|'

/** Radar marker glyphs. */
const GLYPH_PLAYER = 0x40;       // '@'
const GLYPH_HOSTILE = 0x58;      // 'X'
const GLYPH_QUEST = 0x21;        // '!'
const GLYPH_VIEWPORT_TICK = 0xB7; // '·'

/** Packed palette (packed once at module load). */
const COLOR_HP_HIGH = ASCIIBuffer.packColor('#6dff7c');
const COLOR_HP_MID = ASCIIBuffer.packColor('#ffd24a');
const COLOR_HP_LOW = ASCIIBuffer.packColor('#ff5a5a');
const COLOR_MP = ASCIIBuffer.packColor('#7fa9ff');
const COLOR_ORANGE = ASCIIBuffer.packColor('#ff7700');
const COLOR_ORANGE_LOW = ASCIIBuffer.packColor('#ff3d2e');
const COLOR_COOLDOWN = ASCIIBuffer.packColor('#8affdf');
const COLOR_TEXT = ASCIIBuffer.packColor('#d7e3ee');
const COLOR_TEXT_DIM = ASCIIBuffer.packColor('#6d7c8c');
const COLOR_TITLE = ASCIIBuffer.packColor('#ffe9c4');
const COLOR_CURRENCY = ASCIIBuffer.packColor('#ffd24a');
const COLOR_BADGE_DREAM = ASCIIBuffer.packColor('#ff9e3d');
const COLOR_BADGE_DRAB = ASCIIBuffer.packColor('#a9b8c6');
const COLOR_RADAR_FRAME = ASCIIBuffer.packColor('#5a6d80');
const COLOR_RADAR_BG = ASCIIBuffer.packColor('rgba(8, 12, 18, 0.78)');
const COLOR_CONTACT_HOSTILE = ASCIIBuffer.packColor('#ff5a5a');
const COLOR_CONTACT_QUEST = ASCIIBuffer.packColor('#ffd24a');
const COLOR_CONTACT_NEUTRAL = ASCIIBuffer.packColor('#9ad7ff');
const COLOR_PLAYER_MARKER = ASCIIBuffer.packColor('#ffffff');
const COLOR_READY_FLASH = ASCIIBuffer.packColor('#ffffff');
const COLOR_SLAB = ASCIIBuffer.packColor('rgba(8, 10, 16, 0.85)');
const COLOR_LOCKED = ASCIIBuffer.packColor('#5a6672');

/** Two pi, precomputed for sweep oscillators. */
const TWO_PI = Math.PI * 2;

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
 * Reads a finite number from a possibly-malformed source, falling back
 * to a default. All provider reads funnel through this so a half-built
 * player object can never poison a HUD frame with NaN.
 * @param {*} value Candidate.
 * @param {number} fallback Default when non-finite.
 * @returns {number}
 */
function finiteOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Scales the alpha byte of a packed RGBA color. The Renderer converts
 * packed alpha into rgba() CSS strings, which canvas text and rect fills
 * honor natively — every HUD fade routes through this without globalAlpha
 * state churn.
 * @param {number} packed Packed RGBA color.
 * @param {number} alpha Multiplier in [0, 1].
 * @returns {number} New packed RGBA color.
 */
function withAlpha(packed, alpha) {
    const a = clamp01(alpha);
    const src = packed >>> 0;
    const outAlpha = Math.round((src & 0xFF) * a);
    return ((src & 0xFFFFFF00) | (outAlpha & 0xFF)) >>> 0;
}

/**
 * Deterministic beat-interference noise in [0, 1]. Identical formula to
 * WorldManager.flickerNoise so the HUD's critical pulse and the reality
 * collapse it foreshadows glitch in visible sympathy. Pure function of
 * simulation time — catch-up ticks reproduce identical flicker.
 * @param {number} t Simulation seconds.
 * @returns {number}
 */
function flickerNoise(t) {
    const interference = Math.sin(t * 31.7) * Math.sin(t * 17.3) + Math.sin(t * 7.9);
    return Math.min(1, Math.abs(interference) / 2);
}

/**
 * Normalizes an angle into [−π, π). Used by the radar sweep glint so the
 * angular distance between sweep and contact bearing is always the short
 * way around the circle.
 * @param {number} angle Radians.
 * @returns {number}
 */
function normalizeAngle(angle) {
    return ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

/**
 * Rec. 709 luminance collapse of a packed color — byte-for-byte the same
 * formula Renderer.setGrayscale applies to world cells, so the Drab HUD
 * matches the Drab world exactly. Alpha is preserved.
 * @param {number} packed Packed RGBA color.
 * @returns {number} Grayscale packed RGBA.
 */
function luminanceCollapse(packed) {
    const src = packed >>> 0;
    const r = (src >>> 24) & 0xFF;
    const g = (src >>> 16) & 0xFF;
    const b = (src >>> 8) & 0xFF;
    const a = src & 0xFF;
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return (((luma & 0xFF) << 24) | ((luma & 0xFF) << 16) |
        ((luma & 0xFF) << 8) | (a & 0xFF)) >>> 0;
}

/**
 * Formats a KeyboardEvent.code into a compact keycap label.
 * 'KeyW' → 'W', 'Digit3' → '3', 'Space' → 'SPC', 'ShiftLeft' → 'SHL'.
 * Unknown codes truncate to four characters.
 * @param {?string} code Physical key code.
 * @returns {string} Label of at most 4 characters.
 */
function formatKeyCode(code) {
    if (typeof code !== 'string' || code.length === 0) return '·';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return `N${code.slice(6)}`.slice(0, 4);
    const specials = {
        Space: 'SPC', Enter: 'ENT', Escape: 'ESC', Tab: 'TAB',
        ShiftLeft: 'SHL', ShiftRight: 'SHR', ControlLeft: 'CTL',
        ControlRight: 'CTR', AltLeft: 'ALT', AltRight: 'ALR',
        ArrowUp: 'UP', ArrowDown: 'DN', ArrowLeft: 'LT', ArrowRight: 'RT'
    };
    if (specials[code] !== undefined) return specials[code];
    return code.slice(0, 4).toUpperCase();
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Normalized radar contact ready for projection.
 * @typedef {Object} RadarContact
 * @property {number} x World x, CSS pixels.
 * @property {number} y World y, CSS pixels.
 * @property {('hostile'|'quest'|'neutral')} kind Classification.
 * @property {?number} glyph Optional override glyph code point.
 * @property {?number} color Optional override packed color.
 */

/**
 * Normalized hotbar slot.
 * @typedef {Object} SkillSlot
 * @property {string} name Skill display name.
 * @property {string} glyph Single signature glyph.
 * @property {string} key Keycap label.
 * @property {number} remaining Cooldown remaining, seconds.
 * @property {number} duration Cooldown total, seconds.
 * @property {boolean} locked Permanently unavailable.
 */

/* ══════════════════════════════════════════════════════════════════════════
   HUD
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Head-up display: vital bars, dimension badge, hotbar, and radar. See the
 * file header for composition formulas, projection math, and the Drab
 * palette policy.
 */
export class HUD {
    /**
     * @param {import('../engine/Renderer.js').Renderer} renderer
     *   Engine renderer; the HUD reads its live cell/viewport metrics every
     *   frame and draws through its screen-space API.
     * @param {Object} [options]
     * @param {number} [options.barInnerCols=12] Status bar interior width.
     * @param {number} [options.criticalEnergyFraction=0.15] Pulse threshold.
     * @param {number} [options.radarCols=19] Radar width in cells.
     * @param {number} [options.radarRows=9] Radar height in cells.
     * @param {?number} [options.radarRangeX=null] World px radius on x;
     *   null auto-derives 1.5× viewport width.
     * @param {?number} [options.radarRangeY=null] World px radius on y;
     *   null auto-derives 1.5× viewport height.
     * @param {number} [options.sweepHz=0.25] Radar sweep turns per second.
     * @param {number} [options.maxRadarContacts=48] Contact draw cap.
     * @param {boolean} [options.showMinimap=true] Radar gate.
     * @param {boolean} [options.showHotbar=true] Hotbar gate.
     * @param {boolean} [options.showParty=true] Party frames gate.
     * @throws {TypeError|RangeError} If the renderer or options are invalid.
     */
    constructor(renderer, options = {}) {
        if (!renderer ||
            typeof renderer.drawString !== 'function' ||
            typeof renderer.drawRect !== 'function' ||
            typeof renderer.measureString !== 'function') {
            throw new TypeError(
                '[HUD] A Renderer with drawString/drawRect/measureString is required.'
            );
        }
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[HUD] options must be an object.');
        }

        /** @type {import('../engine/Renderer.js').Renderer} */
        this._renderer = renderer;

        /* ---- Bar configuration ------------------------------------------ */
        const barCells = options.barInnerCols ?? DEFAULT_BAR_CELLS;
        if (!Number.isInteger(barCells) || barCells < 6 || barCells > 24) {
            throw new RangeError('[HUD] barInnerCols must be an integer in [6, 24].');
        }
        /** @type {number} */
        this._barCells = barCells;

        const critical = options.criticalEnergyFraction ?? DEFAULT_CRITICAL_FRACTION;
        if (!Number.isFinite(critical) || critical <= 0 || critical >= 1) {
            throw new RangeError('[HUD] criticalEnergyFraction must be in (0, 1).');
        }
        /** @type {number} */
        this._criticalFraction = critical;

        /* ---- Radar configuration ----------------------------------------- */
        const radarCols = options.radarCols ?? DEFAULT_RADAR_COLS;
        const radarRows = options.radarRows ?? DEFAULT_RADAR_ROWS;
        if (!Number.isInteger(radarCols) || radarCols < 9 || radarCols > 40) {
            throw new RangeError('[HUD] radarCols must be an integer in [9, 40].');
        }
        if (!Number.isInteger(radarRows) || radarRows < 5 || radarRows > 20) {
            throw new RangeError('[HUD] radarRows must be an integer in [5, 20].');
        }
        /** @type {number} */ this._radarCols = radarCols;
        /** @type {number} */ this._radarRows = radarRows;
        /** @type {?number} Fixed x range, or null for viewport-derived. */
        this._radarRangeX = Number.isFinite(options.radarRangeX) && options.radarRangeX > 0
            ? options.radarRangeX : null;
        /** @type {?number} Fixed y range, or null for viewport-derived. */
        this._radarRangeY = Number.isFinite(options.radarRangeY) && options.radarRangeY > 0
            ? options.radarRangeY : null;

        const sweepHz = options.sweepHz ?? DEFAULT_SWEEP_HZ;
        if (!Number.isFinite(sweepHz) || sweepHz <= 0) {
            throw new RangeError('[HUD] sweepHz must be positive.');
        }
        /** @type {number} */ this._sweepHz = sweepHz;

        const maxContacts = options.maxRadarContacts ?? DEFAULT_MAX_CONTACTS;
        if (!Number.isInteger(maxContacts) || maxContacts < 1) {
            throw new RangeError('[HUD] maxRadarContacts must be a positive integer.');
        }
        /** @type {number} */ this._maxContacts = maxContacts;

        /* ---- Visibility gates --------------------------------------------- */
        /** @type {boolean} Master HUD gate (cinematics). */
        this._visible = true;
        /** @type {boolean} */ this._showMinimap = options.showMinimap !== false;
        /** @type {boolean} */ this._showHotbar = options.showHotbar !== false;
        /** @type {boolean} */ this._showParty = options.showParty !== false;

        /* ---- Providers ------------------------------------------------------ */
        /** @type {?Object} */ this._player = null;
        /** @type {?Object} */ this._worldManager = null;
        /** @type {?Object} */ this._camera = null;
        /** @type {?Object} */ this._radarSource = null;
        /** @type {?Object} */ this._skillProvider = null;
        /** @type {?Object} */ this._inputManager = null;
        /** @type {?Array<Object>} Static skill list fallback. */
        this._staticSkills = null;

        /* ---- Simulation clock & transient state ------------------------------ */
        /** @type {number} Simulation time, seconds (all HUD motion derives
         *   from this clock, never wall time). */
        this._time = 0;
        /** @type {boolean} Energy-critical edge latch for event emission. */
        this._wasCritical = false;
        /** @type {boolean} Pending world-change flash, consumed in update(). */
        this._pendingWorldFlash = false;
        /** @type {number} Sim time of the last world-change flash. */
        this._worldFlashAt = -Infinity;
        /** @type {Map<string, number>} Skill name → ready-flash start time. */
        this._readyFlashes = new Map();
        /** @type {Map<string, number>} Skill name → last observed remaining. */
        this._lastRemaining = new Map();
        /** @type {number} Contacts drawn last frame (diagnostics). */
        this._lastContactCount = 0;

        /* ---- Drab grayscale cache ---------------------------------------------- */
        /** @type {Map<number, number>} Packed → collapsed packed. */
        this._grayCache = new Map();

        /* ---- WorldManager event subscriptions ------------------------------------ */
        /** @type {Array<Function>} Unsubscribe functions. */
        this._worldUnsubs = [];

        /* ---- Events ----------------------------------------------------------------- */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {boolean} */
        this._destroyed = false;
    }

    /* ══════════════════════════════════════════════════════════════════
       PROVIDER WIRING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the player entity read for vitals, oranges, party frames,
     * and the radar's player blip. Any object with numeric hp/maxHp fields
     * works; absent fields degrade gracefully.
     * @param {?Object} player Player instance or null to detach.
     * @returns {this}
     */
    attachPlayer(player) {
        this._player = player;
        return this;
    }

    /**
     * Attaches the WorldManager that feeds the dimension badge. Subscribes
     * to 'worldchanged' so the badge flash arms deterministically on the
     * commit tick (the event sets a pending flag consumed by update(),
     * keeping the flash anchored to simulation time).
     * @param {?Object} worldManager WorldManager or null.
     * @returns {this}
     */
    attachWorldManager(worldManager) {
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.error('[HUD] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];
        this._worldManager = worldManager;
        if (worldManager && typeof worldManager.on === 'function') {
            this._worldUnsubs.push(
                worldManager.on('worldchanged', () => {
                    this._pendingWorldFlash = true;
                })
            );
        }
        return this;
    }

    /**
     * Attaches the camera used for radar centering and viewport ticks.
     * @param {?Object} camera Engine Camera or null.
     * @returns {this}
     */
    attachCamera(camera) {
        this._camera = camera;
        return this;
    }

    /**
     * Attaches the radar contact source. Accepts any object exposing
     * getRadarContacts() or a plain entities array; Entity instances are
     * classified by tags ('hostile' / 'quest-marker').
     * @param {?Object} source Radar source or null.
     * @returns {this}
     */
    attachRadarSource(source) {
        this._radarSource = source;
        return this;
    }

    /**
     * Attaches the hotbar skill provider ({getSkills()} or .skills array).
     * @param {?Object} provider Skill provider or null.
     * @returns {this}
     */
    attachSkillProvider(provider) {
        this._skillProvider = provider;
        return this;
    }

    /**
     * Installs a static skill list, used when no live provider is attached
     * (menu previews, tests).
     * @param {?Array<Object>} skills Skill definitions.
     * @returns {this}
     */
    setSkills(skills) {
        this._staticSkills = Array.isArray(skills) ? skills : null;
        return this;
    }

    /**
     * Attaches the InputManager used to resolve keycap labels from live
     * bindings, so rebinds flow into the hotbar automatically.
     * @param {?Object} input InputManager or null.
     * @returns {this}
     */
    attachInputManager(input) {
        this._inputManager = input;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       VISIBILITY GATES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Master HUD gate. Cinematics call setVisible(false) to strip the
     * interface without discarding provider state.
     * @param {boolean} visible
     * @returns {this}
     */
    setVisible(visible) {
        this._visible = Boolean(visible);
        return this;
    }

    /** @param {boolean} show Radar gate. @returns {this} */
    setShowMinimap(show) {
        this._showMinimap = Boolean(show);
        return this;
    }

    /** @param {boolean} show Hotbar gate. @returns {this} */
    setShowHotbar(show) {
        this._showHotbar = Boolean(show);
        return this;
    }

    /** @param {boolean} show Party frames gate. @returns {this} */
    setShowParty(show) {
        this._showParty = Boolean(show);
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the HUD simulation clock and edge detectors by one fixed
     * tick. CONTRACT: exactly once per simulation tick, before render().
     * Sequence:
     *   1. Advance the simulation clock.
     *   2. Consume a pending world-change flash (event → sim-time anchor).
     *   3. Detect the energy-critical edge and broadcast it.
     *   4. Detect skill-ready edges, arm flashes, and broadcast them.
     * @param {number} dt Fixed timestep, seconds.
     * @returns {this}
     */
    update(dt) {
        if (this._destroyed || !Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;

        if (this._pendingWorldFlash) {
            this._pendingWorldFlash = false;
            this._worldFlashAt = this._time;
        }

        /* Energy-critical edge with a clean latch, so the event fires once
         * on entry and once on recovery — no re-trigger churn. */
        const fraction = this._readEnergyFraction();
        const critical = fraction < this._criticalFraction;
        if (critical !== this._wasCritical) {
            this._wasCritical = critical;
            this._dispatch('energycritical', { critical, fraction });
        }

        /* Skill-ready edges: remaining crossing from > 0 to <= 0. */
        const skills = this._readSkills();
        for (let i = 0; i < skills.length; i += 1) {
            const skill = skills[i];
            const last = this._lastRemaining.get(skill.name) ?? 0;
            if (last > 0 && skill.remaining <= 0 && !skill.locked) {
                this._readyFlashes.set(skill.name, this._time);
                this._dispatch('skillready', { name: skill.name });
            }
            this._lastRemaining.set(skill.name, skill.remaining);
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER PASS — TOP LEVEL
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents the full HUD. Call once per presentation frame, after the
     * world blit and before any transition overlay. Layout anchors:
     *   top-left      status block (vitals + party)
     *   top-right     dimension badge (+ shift progress during transitions)
     *   bottom-left   radar mini-map
     *   bottom-center skill hotbar
     * @param {number} [interpolationAlpha=1] GameLoop render phase. Used to
     *   interpolate the radar player blip; all envelopes are sim-clocked.
     * @returns {void}
     */
    render(interpolationAlpha = 1) {
        if (this._destroyed || !this._visible) return;
        const grid = this._gridSize();
        if (grid.columns < 40 || grid.rows < 14) return;

        const worldId = this._readWorldId();
        const transition = this._readTransitionStatus();

        this._drawStatusBlock(grid, worldId);
        this._drawDimensionBadge(grid, worldId, transition);
        if (this._showMinimap) {
            this._drawRadar(grid, interpolationAlpha);
        }
        if (this._showHotbar) {
            this._drawHotbar(grid);
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — GEOMETRY & PALETTE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Live viewport grid metrics, read fresh every call. Layout is never
     * cached across frames, so resize and font recalibration self-heal —
     * the same policy WorldManager and UIManager apply.
     * @returns {{columns: number, rows: number, cellW: number, cellH: number}}
     * @private
     */
    _gridSize() {
        const r = this._renderer;
        const cellW = r.cellWidth > 0 ? r.cellWidth : 9.6;
        const cellH = r.cellHeight > 0 ? r.cellHeight : 20;
        let columns;
        let rows;
        if (typeof r.getViewportGridSize === 'function') {
            const size = r.getViewportGridSize();
            columns = size.columns;
            rows = size.rows;
        } else {
            columns = Math.max(1, Math.ceil(r.viewportWidth / cellW));
            rows = Math.max(1, Math.ceil(r.viewportHeight / cellH));
        }
        return { columns, rows, cellW, cellH };
    }

    /**
     * Dimension-aware palette resolution. In the Drab World every color
     * collapses to Rec. 709 luminance — except the orange reality anchor
     * family, which is exempt by design (see header). Collapse results are
     * cached exactly like Renderer's grayscale cache.
     * @param {number} packed Packed RGBA color.
     * @param {boolean} [exempt=false] True to survive the Drab collapse.
     * @returns {number} Packed RGBA color to present.
     * @private
     */
    _presentColor(packed, exempt = false) {
        if (exempt || this._readWorldId() !== 'DRAB') return packed;
        const key = packed >>> 0;
        const cached = this._grayCache.get(key);
        if (cached !== undefined) return cached;
        const gray = luminanceCollapse(key);
        if (this._grayCache.size > 1024) this._grayCache.clear();
        this._grayCache.set(key, gray);
        return gray;
    }

    /* ══════════════════════════════════════════════════════════════════
       BAR CONSTRUCTION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Builds an ASCII bar interior (see header formula). Exposed as a
     * static so UIManager panels and debug tools compose identical bars.
     * @param {number} fraction Fill fraction, clamped to [0, 1].
     * @param {number} innerCells Interior width in glyph cells.
     * @param {string} [fillGlyph='█'] Filled cell glyph.
     * @param {string} [emptyGlyph='░'] Empty cell glyph.
     * @returns {string} Exactly innerCells characters.
     */
    static buildBar(fraction, innerCells, fillGlyph = '\u2588', emptyGlyph = '\u2591') {
        const cells = Math.max(1, Math.floor(innerCells));
        const filled = Math.round(clamp01(fraction) * cells);
        return fillGlyph.repeat(filled) + emptyGlyph.repeat(cells - filled);
    }

    /**
     * Draws one labeled status bar row:
     *     LABEL [██████░░░░]  12/20   60%
     * The label column is caller-padded for stack alignment; the value and
     * percent columns are width-padded so digit changes never wobble rows.
     * @param {number} px Row x in CSS px.
     * @param {number} py Row y in CSS px.
     * @param {string} label Pre-padded label column.
     * @param {number} fraction Fill fraction [0, 1].
     * @param {number} color Packed bar color (dimension-resolved by caller).
     * @param {string} valueText Right-side value readout (e.g. '12/20').
     * @param {boolean} [exempt=false] Orange-anchor palette exemption.
     * @private
     */
    _drawStatusBar(px, py, label, fraction, color, valueText, exempt = false) {
        const r = this._renderer;
        const interior = HUD.buildBar(fraction, this._barCells);
        const percent = `${String(Math.round(clamp01(fraction) * 100)).padStart(3, ' ')}%`;
        const padValue = String(valueText).padEnd(9, ' ');

        r.drawString(px, py, `${label}[`, this._presentColor(COLOR_TEXT_DIM, exempt));
        const labelWidth = r.measureString(`${label}[`).width;
        r.drawString(px + labelWidth, py, interior, this._presentColor(color, exempt));
        const barWidth = r.measureString(interior).width;
        r.drawString(px + labelWidth + barWidth, py, `] ${padValue}${percent}`,
            this._presentColor(COLOR_TEXT, exempt));
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — STATUS BLOCK (TOP-LEFT)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the top-left vital block: identity row, HP bar with threshold
     * coloring, optional MP bar, the Orange Energy reality anchor (with
     * low-reserve flicker), currency, and party frames.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @param {string} worldId Active dimension id.
     * @private
     */
    _drawStatusBlock(grid, worldId) {
        const r = this._renderer;
        const px = MARGIN_CELLS * grid.cellW;
        const player = this._player;

        /* Background slab sized for the widest plausible block. */
        const slabCols = 6 + this._barCells + 16;
        r.drawRect(px - grid.cellW * 0.5, MARGIN_CELLS * grid.cellH - grid.cellH * 0.25,
            slabCols * grid.cellW, (player ? 8 : 2) * grid.cellH,
            this._presentColor(COLOR_SLAB));

        if (!player) {
            r.drawString(px, MARGIN_CELLS * grid.cellH, 'NO THREAD ATTUNED',
                this._presentColor(COLOR_TEXT_DIM));
            return;
        }

        let row = MARGIN_CELLS;
        const y = (rowIndex) => rowIndex * grid.cellH;

        /* Identity row. */
        const name = typeof player.name === 'string' ? player.name : 'Custodian';
        const level = finiteOr(player.level, 1);
        r.drawString(px, y(row), `${name}  Lv.${level}`,
            this._presentColor(COLOR_TITLE));
        row += 1;

        /* Health with threshold coloring. */
        const hp = finiteOr(player.hp, 0);
        const maxHp = finiteOr(player.maxHp, 0);
        const hpFraction = maxHp > 0 ? hp / maxHp : 0;
        const hpColor = hpFraction > 0.5 ? COLOR_HP_HIGH
            : hpFraction > 0.25 ? COLOR_HP_MID
                : COLOR_HP_LOW;
        this._drawStatusBar(px, y(row), 'HP    ', hpFraction, hpColor,
            `${Math.ceil(hp)}/${Math.ceil(maxHp)}`);
        row += 1;

        /* Mana, only when the player model carries it. */
        if (Number.isFinite(player.mp) && Number.isFinite(player.maxMp) && player.maxMp > 0) {
            this._drawStatusBar(px, y(row), 'MP    ', player.mp / player.maxMp, COLOR_MP,
                `${Math.ceil(player.mp)}/${Math.ceil(player.maxMp)}`);
            row += 1;
        }

        /* Orange Energy: the reality anchor. Palette-exempt in the Drab
         * World; below the critical fraction it flickers with the same
         * deterministic noise that drives the collapse itself. */
        const energyFraction = this._readEnergyFraction();
        let orangeColor = COLOR_ORANGE;
        let orangeAlpha = 1;
        if (energyFraction < this._criticalFraction) {
            orangeColor = COLOR_ORANGE_LOW;
            orangeAlpha = 0.45 + 0.55 * flickerNoise(this._time * 1.8);
        }
        const oranges = finiteOr(player.oranges, 0);
        const maxOranges = finiteOr(player.maxOranges, 20);
        /* Alpha modulation rides the bar color via withAlpha. */
        const orangePresent = withAlpha(this._presentColor(orangeColor, true), orangeAlpha);
        this._drawStatusBar(px, y(row), 'ORANGE', energyFraction, orangePresent,
            `${Math.ceil(oranges)}/${Math.ceil(maxOranges)}`, true);
        row += 1;

        /* Currency. */
        if (Number.isFinite(player.currency)) {
            const currencyName = typeof player.currencyName === 'string'
                ? player.currencyName
                : 'scrip';
            r.drawString(px, y(row),
                `${currencyName}: ${Math.floor(player.currency)}  [${worldId}]`,
                this._presentColor(COLOR_CURRENCY));
            row += 1;
        }

        /* Party frames. */
        if (this._showParty && Array.isArray(player.party) && player.party.length > 0) {
            row += 1;
            for (let i = 0; i < player.party.length && row < grid.rows - 2; i += 1) {
                const mate = player.party[i];
                if (!mate || typeof mate.name !== 'string') continue;
                const mateMax = finiteOr(mate.maxHp, 0);
                const mateFraction = mateMax > 0 ? finiteOr(mate.hp, 0) / mateMax : 0;
                this._drawStatusBar(px, y(row),
                    mate.name.slice(0, 10).padEnd(10, ' '),
                    mateFraction,
                    mateFraction > 0.25 ? COLOR_HP_HIGH : COLOR_HP_LOW,
                    `${Math.round(mateFraction * 100)}%`);
                row += 1;
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — DIMENSION BADGE (TOP-RIGHT)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the active-dimension badge, top-right. During a transition the
     * badge morphs into a shift readout with destination and progress;
     * flicker-style shifts (into Drab) jitter the badge alpha with the
     * engine's deterministic noise, fade-style shifts (into Dream) stay
     * serene. While the orange reserve is critical in the Dream World the
     * badge pulses — reality is about to let go.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @param {string} worldId Active dimension id.
     * @param {Object} transition Transition status snapshot.
     * @private
     */
    _drawDimensionBadge(grid, worldId, transition) {
        const r = this._renderer;
        const py = MARGIN_CELLS * grid.cellH;

        /* Badge text & palette derive from the destination mid-shift. */
        let label;
        let color;
        if (transition.active && transition.to) {
            label = `SHIFT \u2192 ${transition.to} ${Math.round(transition.progress * 100)}%`;
            color = transition.to === 'DRAB' ? COLOR_BADGE_DRAB : COLOR_BADGE_DREAM;
        } else if (worldId === 'DRAB') {
            label = 'DRAB WORLD';
            color = COLOR_BADGE_DRAB;
        } else {
            label = 'DREAM WORLD';
            color = COLOR_BADGE_DREAM;
        }
        const text = `[ ${label} ]`;
        const size = r.measureString(text);
        const px = grid.columns * grid.cellW - size.width - MARGIN_CELLS * grid.cellW;

        /* Pulse & flicker envelope. Critical-energy pulsing only threatens
         * in the Dream World: in Drab the collapse already happened. */
        let alpha = 1;
        const critical = this._wasCritical;
        if (critical && worldId === 'DREAM' && !transition.active) {
            alpha = 0.55 + 0.45 * flickerNoise(this._time * 2.1);
        } else if (transition.active && transition.flicker > 0.01) {
            alpha = 0.6 + 0.4 * flickerNoise(this._time * 3.3);
        }

        /* Slab + text. */
        r.drawRect(px - grid.cellW * 0.5, py - grid.cellH * 0.25,
            size.width + grid.cellW, size.height + grid.cellH * 0.5,
            this._presentColor(COLOR_SLAB, true));
        r.drawString(px, py, text, withAlpha(this._presentColor(color, true), alpha));

        /* Critical corner accents: red pulse brackets when the anchor frays. */
        if (critical && worldId === 'DREAM' && !transition.active) {
            const accent = withAlpha(COLOR_ORANGE_LOW, alpha);
            r.drawString(px - grid.cellW, py, '<', accent);
            r.drawString(px + size.width, py, '>', accent);
        }

        /* World-change flash: quadratic-decay white echo of the badge. */
        const flashAge = this._time - this._worldFlashAt;
        if (flashAge >= 0 && flashAge < WORLD_FLASH_SECONDS) {
            const decay = 1 - flashAge / WORLD_FLASH_SECONDS;
            r.drawString(px, py, text,
                withAlpha(COLOR_READY_FLASH, decay * decay));
        }

        /* Shift progress bar under the badge during transitions. */
        if (transition.active) {
            const inner = 10;
            const bar = HUD.buildBar(transition.progress, inner);
            const barText = `(${bar})`;
            const barSize = r.measureString(barText);
            r.drawString(
                grid.columns * grid.cellW - barSize.width - MARGIN_CELLS * grid.cellW,
                py + grid.cellH,
                barText,
                withAlpha(this._presentColor(color, true), alpha)
            );
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — RADAR MINI-MAP (BOTTOM-LEFT)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the ASCII radar: frame with compass notch, viewport corner
     * ticks, sweep-glinted contacts, and the interpolated player marker.
     * See the header for the projection and sweep formulas.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @param {number} interpolationAlpha GameLoop render phase for the blip.
     * @private
     */
    _drawRadar(grid, interpolationAlpha) {
        const r = this._renderer;
        const cols = this._radarCols;
        const rows = this._radarRows;
        const x0 = MARGIN_CELLS;
        const y0 = grid.rows - rows - MARGIN_CELLS - 1;
        const px = x0 * grid.cellW;
        const py = y0 * grid.cellH;

        /* Backdrop + frame strings. */
        r.drawRect(px, py, cols * grid.cellW, rows * grid.cellH,
            this._presentColor(COLOR_RADAR_BG));
        const H = String.fromCodePoint(GLYPH_HORIZ);
        const V = String.fromCodePoint(GLYPH_VERT);
        const PLUS = String.fromCodePoint(GLYPH_CORNER);

        /* Top border with an 'N' compass notch at its center. */
        let topBorder = PLUS + H.repeat(cols - 2) + PLUS;
        const notchIndex = Math.floor(topBorder.length / 2);
        topBorder = `${topBorder.slice(0, notchIndex)}N${topBorder.slice(notchIndex + 1)}`;
        r.drawString(px, py, topBorder, this._presentColor(COLOR_RADAR_FRAME));
        for (let row = 1; row < rows - 1; row += 1) {
            r.drawString(px, py + row * grid.cellH, V, this._presentColor(COLOR_RADAR_FRAME));
            r.drawString(px + (cols - 1) * grid.cellW, py + row * grid.cellH, V,
                this._presentColor(COLOR_RADAR_FRAME));
        }
        r.drawString(px, py + (rows - 1) * grid.cellH,
            PLUS + H.repeat(cols - 2) + PLUS, this._presentColor(COLOR_RADAR_FRAME));

        /* Radar center: camera focus, falling back to the player. */
        const center = this._radarCenter(interpolationAlpha);
        if (!center) {
            r.drawString(px + grid.cellW, py + Math.floor(rows / 2) * grid.cellH,
                'NO SIGNAL', this._presentColor(COLOR_TEXT_DIM));
            this._lastContactCount = 0;
            return;
        }

        /* World radii mapped onto the grid half-extents. */
        const cam = this._camera;
        const rangeX = this._radarRangeX ??
            (cam ? cam.viewportWidth * RADAR_RANGE_VIEWPORT_SCALE : 900);
        const rangeY = this._radarRangeY ??
            (cam ? cam.viewportHeight * RADAR_RANGE_VIEWPORT_SCALE : 600);

        /* Viewport corner ticks: where the visible screen sits in radar
         * space, so on-screen blips are recognizable at a glance. */
        if (cam) {
            const halfW = cam.viewportWidth / 2;
            const halfH = cam.viewportHeight / 2;
            const corners = [
                [center.x - halfW, center.y - halfH],
                [center.x + halfW, center.y - halfH],
                [center.x - halfW, center.y + halfH],
                [center.x + halfW, center.y + halfH]
            ];
            for (const [wx, wy] of corners) {
                const cell = this._projectToRadar(wx, wy, center, rangeX, rangeY, cols, rows);
                if (cell) {
                    r.drawString(px + cell.col * grid.cellW, py + cell.row * grid.cellH,
                        String.fromCodePoint(GLYPH_VIEWPORT_TICK),
                        this._presentColor(COLOR_TEXT_DIM));
                }
            }
        }

        /* Sweep angle for this frame. */
        const sweepTheta = TWO_PI * ((this._time * this._sweepHz) % 1);

        /* Contacts: classify, project, glint, draw. */
        const contacts = this._readRadarContacts();
        let drawn = 0;
        for (let i = 0; i < contacts.length && drawn < this._maxContacts; i += 1) {
            const contact = contacts[i];
            const cell = this._projectToRadar(
                contact.x, contact.y, center, rangeX, rangeY, cols, rows
            );
            if (!cell) continue;

            /* Sweep glint: brightness peaks as the beam crosses the bearing. */
            const bearing = Math.atan2(contact.y - center.y, contact.x - center.x);
            const delta = Math.abs(normalizeAngle(bearing - sweepTheta));
            const glint = Math.max(0, 1 - delta / SWEEP_WINDOW_RADIANS);
            const alpha = 0.35 + 0.65 * glint;

            const baseColor = contact.color ??
                (contact.kind === 'hostile' ? COLOR_CONTACT_HOSTILE
                    : contact.kind === 'quest' ? COLOR_CONTACT_QUEST
                        : COLOR_CONTACT_NEUTRAL);
            const glyph = contact.glyph ??
                (contact.kind === 'hostile' ? GLYPH_HOSTILE
                    : contact.kind === 'quest' ? GLYPH_QUEST
                        : GLYPH_VIEWPORT_TICK);

            r.drawString(px + cell.col * grid.cellW, py + cell.row * grid.cellH,
                String.fromCodePoint(glyph),
                withAlpha(this._presentColor(baseColor, contact.kind === 'quest'), alpha));
            drawn += 1;
        }
        this._lastContactCount = drawn;

        /* Player marker at radar center, always full brightness. The blip
         * uses the interpolated render position, so pursuit easing reads
         * smoothly on high-refresh displays. */
        const centerCol = Math.floor(cols / 2);
        const centerRow = Math.floor(rows / 2);
        r.drawString(px + centerCol * grid.cellW, py + centerRow * grid.cellH,
            String.fromCodePoint(GLYPH_PLAYER),
            this._presentColor(COLOR_PLAYER_MARKER, true));
    }

    /**
     * Resolves the radar center in world pixels: the camera's viewport
     * center when a camera is attached, otherwise the (interpolated)
     * player position. Returns null when neither exists.
     * @param {number} interpolationAlpha Render phase for blip smoothing.
     * @returns {?{x: number, y: number}}
     * @private
     */
    _radarCenter(interpolationAlpha) {
        const cam = this._camera;
        if (cam && Number.isFinite(cam.x) && Number.isFinite(cam.y) &&
            Number.isFinite(cam.viewportWidth) && Number.isFinite(cam.viewportHeight)) {
            return {
                x: cam.x + cam.viewportWidth / 2,
                y: cam.y + cam.viewportHeight / 2
            };
        }
        const player = this._player;
        if (player) {
            if (typeof player.getRenderPosition === 'function') {
                return player.getRenderPosition(interpolationAlpha);
            }
            if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
                return { x: player.x, y: player.y };
            }
        }
        return null;
    }

    /**
     * Projects a world point into radar cell coordinates (header formula).
     * Out-of-range points clamp to the frame edge and are flagged, so an
     * off-screen threat still indicates its direction instead of vanishing.
     * @param {number} wx World x.
     * @param {number} wy World y.
     * @param {{x: number, y: number}} center Radar center, world px.
     * @param {number} rangeX World radius on x.
     * @param {number} rangeY World radius on y.
     * @param {number} cols Radar width in cells.
     * @param {number} rows Radar height in cells.
     * @returns {?{col: number, row: number, clamped: boolean}}
     * @private
     */
    _projectToRadar(wx, wy, center, rangeX, rangeY, cols, rows) {
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
        const rawNx = (wx - center.x) / rangeX;
        const rawNy = (wy - center.y) / rangeY;
        const nx = Math.max(-1, Math.min(1, rawNx));
        const ny = Math.max(-1, Math.min(1, rawNy));
        const col = Math.max(1, Math.min(cols - 2,
            Math.round((nx + 1) / 2 * (cols - 1))));
        const row = Math.max(1, Math.min(rows - 2,
            Math.round((ny + 1) / 2 * (rows - 1))));
        return {
            col,
            row,
            clamped: rawNx !== nx || rawNy !== ny
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — HOTBAR (BOTTOM-CENTER)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the skill hotbar, bottom-center (see header composition).
     * Each slot shows its keycap label, glyph, readiness gauge, and either
     * a cooldown readout or RDY. Locked slots render a dim LOCK state.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @private
     */
    _drawHotbar(grid) {
        const r = this._renderer;
        const skills = this._readSkills();
        if (skills.length === 0) return;

        const totalCols = skills.length * SLOT_WIDTH +
            (skills.length - 1) * SLOT_GAP;
        const x0 = Math.max(MARGIN_CELLS,
            Math.floor((grid.columns - totalCols) / 2));
        const y0 = grid.rows - SLOT_HEIGHT - MARGIN_CELLS;
        const py = y0 * grid.cellH;

        const H = String.fromCodePoint(GLYPH_HORIZ);
        const V = String.fromCodePoint(GLYPH_VERT);
        const CORNER = String.fromCodePoint(GLYPH_CORNER);
        const frameTop = CORNER + H.repeat(SLOT_INNER) + CORNER;
        const frameBottom = CORNER + H.repeat(SLOT_INNER) + CORNER;

        for (let i = 0; i < skills.length; i += 1) {
            const skill = skills[i];
            const px = (x0 + i * (SLOT_WIDTH + SLOT_GAP)) * grid.cellW;

            const cooling = skill.remaining > 0 && skill.duration > 0;
            const readyFraction = cooling
                ? clamp01(1 - skill.remaining / skill.duration)
                : 1;

            /* Keycap label above the frame. */
            const keyText = `[${skill.key}]`;
            const keySize = r.measureString(keyText);
            r.drawString(px + (SLOT_WIDTH * grid.cellW - keySize.width) / 2, py,
                keyText, this._presentColor(COLOR_TEXT_DIM));

            /* Frame. */
            r.drawString(px, py + grid.cellH, frameTop,
                this._presentColor(COLOR_RADAR_FRAME));
            r.drawString(px, py + 4 * grid.cellH, frameBottom,
                this._presentColor(COLOR_RADAR_FRAME));

            /* Glyph row: veiled while cooling or locked. */
            const glyphRow = py + 2 * grid.cellH;
            let glyphAlpha = 1;
            let glyphColor = COLOR_TITLE;
            if (skill.locked) {
                glyphAlpha = 0.4;
                glyphColor = COLOR_LOCKED;
            } else if (cooling) {
                glyphAlpha = 0.35;
            }
            const readyFlashAge = this._time - (this._readyFlashes.get(skill.name) ?? -Infinity);
            if (readyFlashAge >= 0 && readyFlashAge < READY_FLASH_SECONDS) {
                const decay = 1 - readyFlashAge / READY_FLASH_SECONDS;
                glyphColor = COLOR_READY_FLASH;
                glyphAlpha = 0.5 + 0.5 * decay * decay;
            }
            r.drawString(px, glyphRow, V, this._presentColor(COLOR_RADAR_FRAME));
            const glyphText = skill.locked
                ? 'LOCK'.padStart(SLOT_INNER, ' ').slice(0, SLOT_INNER)
                : `  ${skill.glyph}  `.slice(0, SLOT_INNER).padEnd(SLOT_INNER, ' ');
            r.drawString(px + grid.cellW, glyphRow, glyphText,
                withAlpha(this._presentColor(glyphColor), glyphAlpha));
            r.drawString(px + (SLOT_WIDTH - 1) * grid.cellW, glyphRow, V,
                this._presentColor(COLOR_RADAR_FRAME));

            /* Gauge row: readiness fill plus numeric readout when cooling. */
            const gaugeRow = py + 3 * grid.cellH;
            const filled = Math.round(readyFraction * SLOT_INNER);
            const gaugeFill = String.fromCodePoint(GLYPH_GAUGE_FILL).repeat(filled);
            const gaugeEmpty = String.fromCodePoint(GLYPH_BAR_EMPTY).repeat(SLOT_INNER - filled);
            const readout = skill.locked
                ? ' -- '
                : cooling
                    ? ` ${skill.remaining >= 9.95 ? Math.ceil(skill.remaining) : skill.remaining.toFixed(1)}s`
                    : 'RDY ';
            const gaugeText = `${gaugeFill}${gaugeEmpty}`.slice(0, SLOT_INNER - 4) +
                readout.slice(0, 4);
            r.drawString(px, gaugeRow, V, this._presentColor(COLOR_RADAR_FRAME));
            r.drawString(px + grid.cellW, gaugeRow, gaugeText,
                this._presentColor(cooling ? COLOR_COOLDOWN : COLOR_HP_HIGH));
            r.drawString(px + (SLOT_WIDTH - 1) * grid.cellW, gaugeRow, V,
                this._presentColor(COLOR_RADAR_FRAME));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       PROVIDER READS (NORMALIZED, FAIL-SOFT)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Reads the orange reserve fraction, preferring an explicit
     * energyFraction and falling back to oranges/maxOranges. Returns 1
     * (never critical) when no player is attached.
     * @returns {number} Fraction in [0, 1].
     * @private
     */
    _readEnergyFraction() {
        const player = this._player;
        if (!player) return 1;
        if (Number.isFinite(player.energyFraction)) {
            return clamp01(player.energyFraction);
        }
        const oranges = finiteOr(player.oranges, 0);
        const maxOranges = finiteOr(player.maxOranges, 0);
        return maxOranges > 0 ? clamp01(oranges / maxOranges) : 0;
    }

    /** @returns {string} Active world id ('DREAM' fallback). @private */
    _readWorldId() {
        if (this._worldManager &&
            typeof this._worldManager.getActiveWorldId === 'function') {
            try {
                return String(this._worldManager.getActiveWorldId());
            } catch (error) {
                /* World id is cosmetic; never break the frame. */
            }
        }
        return 'DREAM';
    }

    /**
     * Reads the live transition status; returns a safe idle snapshot when
     * no WorldManager is attached.
     * @returns {{active: boolean, to: ?string, progress: number,
     *   flicker: number, fade: number}}
     * @private
     */
    _readTransitionStatus() {
        if (this._worldManager &&
            typeof this._worldManager.getTransitionStatus === 'function') {
            try {
                return this._worldManager.getTransitionStatus();
            } catch (error) {
                /* Telemetry is cosmetic; fall through to idle. */
            }
        }
        return { active: false, to: null, progress: 0, flicker: 0, fade: 0 };
    }

    /**
     * Normalizes radar contacts from whichever shape the source provides.
     * Entity instances are classified by tags; plain objects may carry an
     * explicit kind. Malformed entries are skipped, never thrown on.
     * @returns {RadarContact[]}
     * @private
     */
    _readRadarContacts() {
        const source = this._radarSource;
        if (!source) return [];
        let raw = [];
        try {
            if (typeof source.getRadarContacts === 'function') {
                raw = source.getRadarContacts();
            } else if (Array.isArray(source.entities)) {
                raw = source.entities;
            } else if (Array.isArray(source)) {
                raw = source;
            }
        } catch (error) {
            console.error('[HUD] radar source read failed:', error);
            return [];
        }
        if (!Array.isArray(raw)) return [];

        /** @type {RadarContact[]} */
        const contacts = [];
        for (let i = 0; i < raw.length && contacts.length < this._maxContacts; i += 1) {
            const entry = raw[i];
            if (!entry || typeof entry !== 'object') continue;
            const x = Number.isFinite(entry.centerX) ? entry.centerX
                : Number.isFinite(entry.x) ? entry.x : NaN;
            const y = Number.isFinite(entry.centerY) ? entry.centerY
                : Number.isFinite(entry.y) ? entry.y : NaN;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

            let kind = 'neutral';
            if (typeof entry.kind === 'string') {
                kind = entry.kind === 'hostile' || entry.kind === 'quest'
                    ? entry.kind : 'neutral';
            } else if (typeof entry.hasTag === 'function') {
                if (entry.hasTag('hostile')) kind = 'hostile';
                else if (entry.hasTag('quest-marker') || entry.hasTag('quest')) kind = 'quest';
            }

            contacts.push({
                x,
                y,
                kind,
                glyph: typeof entry.glyph === 'number' ? entry.glyph : null,
                color: typeof entry.color === 'number' ? entry.color : null
            });
        }
        return contacts;
    }

    /**
     * Normalizes hotbar skills from the provider, static list, or nothing.
     * Keycap labels resolve from an explicit key, then the live
     * InputManager binding for the skill's action, then a placeholder.
     * @returns {SkillSlot[]}
     * @private
     */
    _readSkills() {
        let raw = null;
        const provider = this._skillProvider;
        try {
            if (provider && typeof provider.getSkills === 'function') {
                raw = provider.getSkills();
            } else if (provider && Array.isArray(provider.skills)) {
                raw = provider.skills;
            } else if (this._staticSkills) {
                raw = this._staticSkills;
            }
        } catch (error) {
            console.error('[HUD] skill provider read failed:', error);
            return [];
        }
        if (!Array.isArray(raw)) return [];

        /** @type {SkillSlot[]} */
        const skills = [];
        for (let i = 0; i < raw.length; i += 1) {
            const entry = raw[i];
            if (!entry || typeof entry !== 'object') continue;

            let key = typeof entry.key === 'string' ? entry.key : null;
            if (!key && entry.action && this._inputManager &&
                typeof this._inputManager.getBoundCodes === 'function') {
                const codes = this._inputManager.getBoundCodes(entry.action);
                if (codes.length > 0) key = formatKeyCode(codes[0]);
            }
            if (!key) key = String(i + 1);

            const glyphSource = typeof entry.glyph === 'string' && entry.glyph.length > 0
                ? entry.glyph : '?';
            skills.push({
                name: typeof entry.name === 'string' ? entry.name : `skill-${i}`,
                glyph: Array.from(glyphSource)[0],
                key,
                remaining: Math.max(0, finiteOr(
                    entry.cooldownRemaining ?? entry.remaining, 0)),
                duration: Math.max(0, finiteOr(
                    entry.cooldownDuration ?? entry.duration, 0)),
                locked: Boolean(entry.locked)
            });
        }
        return skills;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a HUD event: 'energycritical' {critical, fraction}
     * and 'skillready' {name}. Audio hooks subscribe here.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {Function} Unsubscribe function.
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[HUD] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[HUD] listener must be a function.');
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
     * Broadcasts an event with error isolation. HUD hooks are cosmetic
     * glue; a throwing subscriber must never kill the simulation tick.
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
                console.error(`[HUD] '${type}' listener failed:`, error);
            }
        }
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
        return {
            time: this._time,
            world: this._readWorldId(),
            energyFraction: this._readEnergyFraction(),
            critical: this._wasCritical,
            radarContacts: this._lastContactCount,
            skills: this._readSkills().length,
            visible: this._visible,
            showMinimap: this._showMinimap,
            showHotbar: this._showHotbar
        };
    }

    /**
     * Tears down the HUD: unsubscribes WorldManager listeners, releases
     * providers, and clears all caches. The instance must not be reused
     * after destroy(); matches the engine-wide teardown contract for clean
     * hot-module reloads and test isolation.
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        for (const unsubscribe of this._worldUnsubs) {
            try {
                unsubscribe();
            } catch (error) {
                console.error('[HUD] world unsubscribe failed:', error);
            }
        }
        this._worldUnsubs = [];
        this._player = null;
        this._worldManager = null;
        this._camera = null;
        this._radarSource = null;
        this._skillProvider = null;
        this._inputManager = null;
        this._staticSkills = null;
        this._readyFlashes.clear();
        this._lastRemaining.clear();
        this._grayCache.clear();
        this._listeners.clear();
    }
}

export default HUD;