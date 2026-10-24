/**
 * @file src/ui/UIManager.js
 * @module ui/UIManager
 * @description
 * Central presentation authority for every head-up display element, modal
 * window, dialogue frame, notification toast, and reality-shift overlay in
 * "YUCCA".
 *
 * UIManager is the ONLY subsystem permitted to draw in SCREEN SPACE after
 * the world blit. WorldManager paints the active dimension through the
 * camera; UIManager then paints the interface ON TOP of it, anchored to the
 * viewport rather than the map, so HUD elements never scroll, shake, or
 * grayscale-collapse with the world.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RENDER PASS PLACEMENT (WHERE UI LIVES IN A FRAME)
 * ───────────────────────────────────────────────────────────────────────────
 * The fixed-timestep contract from GameLoop applies verbatim: simulation
 * advances in update(dt), presentation runs once per displayed frame.
 *
 *     // Simulation tick (60 Hz, deterministic):
 *     worlds.update(dt, input);            // InputManager edge commit lives here
 *     ui.update(dt, input);                // window keys, toasts, envelopes
 *     if (!ui.isGameplayInputBlocked()) player.handleInput(input);
 *
 *     // Presentation frame (display rate):
 *     renderer.beginFrame();
 *     worlds.render(renderer, alpha);      // camera-space world blit
 *     ui.render(alpha);                    // screen-space overlay pass, LAST
 *     renderer.endFrame();
 *
 * UIManager renders exclusively through Renderer.drawString() and
 * Renderer.drawRect(), the documented screen-space API that bypasses both
 * the camera transform and the presented-cell cache. Because Camera shake
 * is applied inside the world blit's save/restore block, UI output is
 * shake-immune by construction — the HUD stays locked while the world
 * rattles, exactly as a bullet-hell fairness contract demands.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LAYER STACK MODEL
 * ───────────────────────────────────────────────────────────────────────────
 * Presentation order is a fixed painter's algorithm, bottom to top:
 *
 *     1. HUD           player status, party frames, cooldowns, hint line.
 *                      Always drawn; dimmed to 55% while a blocking modal
 *                      covers it, so the modal reads as the focus object.
 *     2. PANEL STACK   ordered array of open windows (inventory, quest log,
 *                      shop, pause, plus anything installed through the
 *                      public registerPanel() extension point). The LAST
 *                      entry is the focused top panel; only it receives
 *                      cursor navigation and draws a live selection marker.
 *     3. DIALOGUE      the NPC typewriter frame, above every window: a
 *                      conversation always outranks menu browsing.
 *     4. TOASTS        quest updates and system notices, top-right column.
 *     5. FLOATING TEXT world-anchored drifting numbers (damage, pickups).
 *     6. ANNOUNCEMENTS full-width centered banners (level-ups, chapter beats).
 *     7. TRANSITION    Dream↔Drab flicker/fade overlay from WorldManager —
 *                      reality itself outranks the interface that lives in it.
 *
 * Modal windows additionally form an INPUT stack: while any panel with
 * `blocking: true` is open (or a dialogue view is active), the simulation
 * must stop reading gameplay intent. Systems query isGameplayInputBlocked()
 * once per tick; the Player controller gates movement, sprint, dodge, and
 * combat on the answer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INPUT INTERCEPT RULES
 * ───────────────────────────────────────────────────────────────────────────
 * Ownership is exclusive per state — exactly one consumer per key edge:
 *
 *     State                     Owner of keys
 *     ───────────────────────   ─────────────────────────────────────────────
 *     Dialogue open             NPC.handleInput() (ACTION, MOVE_UP/DOWN,
 *                               PAUSE). UIManager RENDERS the view but does
 *                               not consume its keys, matching the NPC
 *                               module's contract; double-handling an edge
 *                               would skip typewriter lines.
 *     Blocking panel open       UIManager: INVENTORY/QUEST_LOG/PAUSE toggle,
 *                               MOVE_UP/DOWN navigate, ACTION activates,
 *                               ESC closes the top panel. Gameplay is gated
 *                               out through isGameplayInputBlocked().
 *     No modal open             UIManager listens ONLY for window-open edges
 *                               (INVENTORY, QUEST_LOG, PAUSE). Everything
 *                               else flows to gameplay untouched.
 *
 * Edge semantics inherit the InputManager handshake: ui.update(dt, input)
 * reads just-pressed sets that were committed exactly once this tick by
 * WorldManager.update(), so a catch-up frame running two ticks never
 * double-triggers a window toggle.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LAYOUT MATH (CELL GRID SNAPPING)
 * ───────────────────────────────────────────────────────────────────────────
 * All UI geometry is derived in CELL units first, then multiplied by the
 * Renderer's measured font metrics, so every border, bar, and label lands
 * on the monospaced raster with zero sub-cell drift:
 *
 *     grid      = renderer.getViewportGridSize()         {columns, rows}
 *     panelW    = clamp(floor(columns · widthFraction), minWidth, maxWidth)
 *     panelH    = clamp(floor(rows · heightFraction), minHeight, maxHeight)
 *     x0        = floor((columns - panelW) / 2)          centered modal
 *     px        = x0 · cellWidth
 *
 * Status bars quantize a [0,1] fraction into glyph cells:
 *
 *     filled    = round(fraction · innerCols)
 *     bar       = '█' × filled + '░' × (innerCols - filled)
 *     label     = '[██████░░░░]  50%'
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ENVELOPE MATH (TOASTS, BANNERS, FLOATING TEXT)
 * ───────────────────────────────────────────────────────────────────────────
 * Every transient effect runs on SIMULATION TIME, never wall-clock time, so
 * catch-up ticks reproduce identical fades (the same determinism policy as
 * WorldManager's flicker noise). A toast envelope with phases F (fadeIn),
 * H (hold), O (fadeOut) over age t:
 *
 *     alpha(t) = t / F                          0 ≤ t < F
 *              = 1                              F ≤ t < F + H
 *              = 1 - (t - F - H) / O            F + H ≤ t < F + H + O
 *
 * Fades are applied by scaling the ALPHA BYTE of packed RGBA colors before
 * submission; the Renderer's CSS cache converts packed alpha into rgba()
 * strings, and canvas fillText/fillRect honor it natively. No globalAlpha
 * state churn, no save/restore storms.
 *
 * The Dream→Drab flicker overlay reuses the deterministic three-sine beat
 * interference from WorldManager, so glitch bands are a pure function of
 * simulation time and never shimmer during fixed-step replay:
 *
 *     noise(t) = |sin(31.7t)·sin(17.3t) + sin(7.9t)| / 2
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROVIDER CONTRACTS (DUCK-TYPED, FAIL-SOFT)
 * ───────────────────────────────────────────────────────────────────────────
 * UIManager reads gameplay data through minimal structural contracts and
 * degrades gracefully when a provider is absent (panels render an explicit
 * "unattuned" state instead of throwing mid-frame):
 *
 *     player      {name, level, hp, maxHp, mp, maxMp, oranges, maxOranges,
 *                  energyFraction, currency, cooldowns[], party[]}
 *     quests      listQuests() → [{id, title, status, objective}]
 *     inventory   getSlots() | items | slots → [{name, glyph, count}]
 *                 useItem(index) → boolean (optional)
 *     shop        items → [{name, price, glyph, stock}]
 *                 purchase(index) → boolean, currencyName (optional)
 *     camera      worldToScreen(x, y) for floating text anchoring
 *     worlds      getTransitionStatus(), getActiveWorldId()
 *
 * @example
 * const ui = new UIManager(renderer);
 * ui.attachPlayer(player);
 * ui.attachQuestSystem(quests);
 * ui.attachCamera(camera);
 * ui.attachWorldManager(worldManager);
 *
 * quests.addEventListener('questaccepted', ({ id, title }) =>
 *     ui.notify(`Quest accepted: ${title}`, { kind: 'quest' }));
 *
 * // Per fixed tick:
 * ui.update(dt, input);
 * // Per presentation frame, after worlds.render():
 * ui.render(alpha);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — TIMING & CAPACITY
   ══════════════════════════════════════════════════════════════════════════ */

/** Panel open animation length, seconds. */
const PANEL_ANIM_SECONDS = 0.14;

/** Default toast envelope phases, seconds. */
const TOAST_FADE_IN = 0.15;
const TOAST_HOLD = 2.4;
const TOAST_FADE_OUT = 0.45;

/** Maximum simultaneous toasts; the oldest is evicted beyond this. */
const MAX_TOASTS = 5;

/** Maximum simultaneous floating texts (damage numbers, pickup pings). */
const MAX_FLOATING = 32;

/** Maximum queued announcement banners (level-up, chapter beats). */
const MAX_ANNOUNCE_QUEUE = 3;

/** Announcement banner lifetime, seconds. */
const ANNOUNCE_LIFE = 2.6;

/** HUD dim factor applied while a blocking modal holds focus. */
const HUD_DIM_ALPHA = 0.55;

/** Orange-energy bar flickers below this fraction (reality-collapse hint). */
const LOW_ENERGY_FLICKER_FRACTION = 0.15;

/** Interior width of HUD status bars, in glyph cells. */
const HUD_BAR_CELLS = 12;

/** Toast box width, in glyph cells (text wraps at width − 2). */
const TOAST_WIDTH_CELLS = 30;

/** Dialogue box width ceiling, in glyph cells. */
const DIALOGUE_MAX_CELLS = 72;

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — GLYPHS & COLORS
   ══════════════════════════════════════════════════════════════════════════ */

/** Bar fill/empty glyphs: full block and light shade. */
const GLYPH_BAR_FILL = 0x2588;   // '█'
const GLYPH_BAR_EMPTY = 0x2591;  // '░'

/** Single-line box-drawing code points for panel frames. */
const GLYPH_FRAME_H = 0x2500;    // '─'
const GLYPH_FRAME_V = 0x2502;    // '│'
const GLYPH_FRAME_TL = 0x250C;   // '┌'
const GLYPH_FRAME_TR = 0x2510;   // '┐'
const GLYPH_FRAME_BL = 0x2514;   // '└'
const GLYPH_FRAME_BR = 0x2518;   // '┘'

/** Dialogue continuation marker and list selection cursor. */
const GLYPH_CONTINUE = 0x25BC;   // '▼'
const GLYPH_CURSOR = 0x3E;       // '>'

/** Glitch band glyph pool for the flicker overlay (code points). */
const GLITCH_GLYPHS = Object.freeze([0x2591, 0x2592, 0x2593, 0x2588, 0x3D, 0x2A]);

/** Panel background: near-black with high opacity for modal focus. */
const COLOR_PANEL_BG = ASCIIBuffer.packColor('rgba(8, 10, 16, 0.92)');
/** Panel border, cool interface blue. */
const COLOR_PANEL_FRAME = ASCIIBuffer.packColor('#9ad7ff');
/** Panel title text. */
const COLOR_PANEL_TITLE = ASCIIBuffer.packColor('#ffe9c4');
/** Generic panel body text. */
const COLOR_PANEL_TEXT = ASCIIBuffer.packColor('#d7e3ee');
/** Dimmed/secondary text. */
const COLOR_TEXT_DIM = ASCIIBuffer.packColor('#6d7c8c');

/** Health bar color thresholds (fraction → packed color). */
const COLOR_HP_HIGH = ASCIIBuffer.packColor('#6dff7c');
const COLOR_HP_MID = ASCIIBuffer.packColor('#ffd24a');
const COLOR_HP_LOW = ASCIIBuffer.packColor('#ff5a5a');
/** MP bar color. */
const COLOR_MP = ASCIIBuffer.packColor('#7fa9ff');
/** Orange energy bar colors (normal / depleted flicker). */
const COLOR_ORANGE = ASCIIBuffer.packColor('#ff7700');
const COLOR_ORANGE_LOW = ASCIIBuffer.packColor('#ff3d2e');
/** Cooldown bar color. */
const COLOR_COOLDOWN = ASCIIBuffer.packColor('#8affdf');
/** Currency text. */
const COLOR_CURRENCY = ASCIIBuffer.packColor('#ffd24a');

/** Dialogue frame and speaker colors. */
const COLOR_DIALOGUE_FRAME = ASCIIBuffer.packColor('#ffd27f');
const COLOR_DIALOGUE_TEXT = ASCIIBuffer.packColor('#f4ecdc');
const COLOR_DIALOGUE_SPEAKER = ASCIIBuffer.packColor('#ff9e3d');

/** Toast palette by TOAST_KIND. */
const TOAST_COLORS = Object.freeze({
    info: ASCIIBuffer.packColor('#9ad7ff'),
    quest: ASCIIBuffer.packColor('#ffd24a'),
    success: ASCIIBuffer.packColor('#7dff8a'),
    warning: ASCIIBuffer.packColor('#ff8a5a'),
    levelup: ASCIIBuffer.packColor('#ff9ed2')
});

/** Quest status → presentation color for the quest log panel. */
const QUEST_STATUS_COLORS = Object.freeze({
    LOCKED: ASCIIBuffer.packColor('#5a6672'),
    AVAILABLE: ASCIIBuffer.packColor('#ffd24a'),
    ACTIVE: ASCIIBuffer.packColor('#ff9e3d'),
    READY: ASCIIBuffer.packColor('#7dff8a'),
    COMPLETED: ASCIIBuffer.packColor('#8fa0b3')
});

/* ══════════════════════════════════════════════════════════════════════════
   ENUMERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Built-in panel identifiers. Extension panels registered at runtime may
 * use any unique string; these constants cover the shipped interface set.
 * @enum {string}
 */
export const PANEL_ID = Object.freeze({
    INVENTORY: 'inventory',
    QUEST_LOG: 'questlog',
    SHOP: 'shop',
    PAUSE: 'pause'
});

/**
 * Toast semantic kinds. The kind selects the accent color and is broadcast
 * in the 'toast' event so audio systems can differentiate quest stingers
 * from warnings.
 * @enum {string}
 */
export const TOAST_KIND = Object.freeze({
    INFO: 'info',
    QUEST: 'quest',
    SUCCESS: 'success',
    WARNING: 'warning',
    LEVELUP: 'levelup'
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
 * Reads a finite number from a possibly-malformed source, falling back to
 * a default. All provider reads funnel through this so a half-initialized
 * player object can never poison a HUD frame with NaN.
 * @param {*} value Candidate value.
 * @param {number} fallback Default when non-finite.
 * @returns {number}
 */
function finiteOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Cubic ease-out: fast launch, decelerating landing. f(p) = 1 − (1 − p)³.
 * Used for panel slide-ins and toast glide.
 * @param {number} p Progress [0, 1].
 * @returns {number}
 */
function easeOutCubic(p) {
    const t = clamp01(p);
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Cubic ease-in-out for announcement banner drift.
 * @param {number} p Progress [0, 1].
 * @returns {number}
 */
function easeInOutCubic(p) {
    const t = clamp01(p);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Hermite smoothstep, used for the tail fade of floating text.
 * @param {number} p Progress [0, 1].
 * @returns {number}
 */
function smoothstep(p) {
    const t = clamp01(p);
    return t * t * (3 - 2 * t);
}

/**
 * Deterministic beat-interference noise in [0, 1], a pure function of
 * simulation time. Identical formula to WorldManager.flickerNoise so the
 * UI overlay and the reality-shift signal glitch in visible sympathy.
 * @param {number} t Simulation seconds.
 * @returns {number}
 */
function flickerNoise(t) {
    const interference = Math.sin(t * 31.7) * Math.sin(t * 17.3) + Math.sin(t * 7.9);
    return Math.min(1, Math.abs(interference) / 2);
}

/**
 * Scales the alpha byte of a packed RGBA color. This is the ONLY fade
 * mechanism UIManager uses: the Renderer converts packed alpha into rgba()
 * CSS strings, which canvas text and rect fills honor directly.
 * @param {number} packed Packed RGBA color.
 * @param {number} alpha Multiplier in [0, 1].
 * @returns {number} New packed RGBA color.
 */
function withAlpha(packed, alpha) {
    const a = clamp01(alpha);
    const src = packed >>> 0;
    const srcAlpha = src & 0xFF;
    const outAlpha = Math.round(srcAlpha * a);
    return ((src & 0xFFFFFF00) | (outAlpha & 0xFF)) >>> 0;
}

/**
 * Builds the interior of an ASCII status bar by quantizing a fraction into
 * glyph cells: '█' × filled + '░' × remainder. Rounding (not flooring) keeps
 * a bar at 100% visually full and at ~4% non-empty, which reads fair.
 * @param {number} fraction Value in [0, 1] (clamped).
 * @param {number} innerCells Interior bar width in glyph cells.
 * @returns {string} Bar interior string of exactly innerCells characters.
 */
function buildBarInterior(fraction, innerCells) {
    const filled = Math.round(clamp01(fraction) * innerCells);
    const fill = String.fromCodePoint(GLYPH_BAR_FILL).repeat(filled);
    const empty = String.fromCodePoint(GLYPH_BAR_EMPTY).repeat(innerCells - filled);
    return fill + empty;
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Panel geometry resolved per frame in both cell and pixel space.
 * @typedef {Object} PanelGeometry
 * @property {number} x0 Left column in cells.
 * @property {number} y0 Top row in cells.
 * @property {number} cols Panel width in cells (border included).
 * @property {number} rows Panel height in cells (border included).
 * @property {number} px Left edge in CSS pixels.
 * @property {number} py Top edge in CSS pixels.
 * @property {number} wPx Width in CSS pixels.
 * @property {number} hPx Height in CSS pixels.
 * @property {number} innerX Content left column in cells (after border+pad).
 * @property {number} innerY Content top row in cells.
 * @property {number} innerCols Content width in cells.
 * @property {number} innerRows Content height in cells.
 */

/**
 * Extensible panel specification installed via registerPanel().
 * @typedef {Object} UIPanelSpec
 * @property {string} id Unique panel identifier.
 * @property {string} title Frame header text.
 * @property {boolean} [blocking=true] Blocks gameplay input while open.
 * @property {boolean} [listDriven=false] Panel owns a cursor (UP/DOWN/ACTION).
 * @property {number} [widthFraction=0.5] Width as fraction of viewport cols.
 * @property {number} [minWidthCells=30] Minimum width in cells.
 * @property {number} [maxWidthCells=58] Maximum width in cells.
 * @property {number} [heightFraction=0.62] Height as fraction of viewport rows.
 * @property {number} [minHeightCells=12] Minimum height in cells.
 * @property {number} [maxHeightCells=30] Maximum height in cells.
 * @property {?Function} [draw=null] Custom content renderer
 *   (ui, geometry, alpha) => void for extension panels; built-in panels
 *   leave this null and dispatch through the internal renderer table.
 */

/**
 * Toast record kept in the notification queue.
 * @typedef {Object} ToastRecord
 * @property {number} id Monotonic toast id.
 * @property {string} kind TOAST_KIND value.
 * @property {string[]} lines Pre-wrapped text lines.
 * @property {number} born Simulation time at spawn.
 * @property {number} fadeIn Fade-in seconds.
 * @property {number} hold Full-opacity seconds.
 * @property {number} fadeOut Fade-out seconds.
 * @property {number} fg Packed accent color.
 */

/**
 * Floating text record (world-anchored drifting numbers).
 * @typedef {Object} FloatingRecord
 * @property {number} worldX Anchor x (world or screen px, see floatingText()).
 * @property {number} worldY Anchor y.
 * @property {string} text Display text.
 * @property {number} fg Packed color.
 * @property {number} born Simulation time at spawn.
 * @property {number} life Total lifetime seconds.
 * @property {number} rise Upward travel in CSS pixels over the lifetime.
 */

/**
 * Dialogue view snapshot produced by NPC.getDialogueView(). UIManager is a
 * pure consumer: NPC advances the typewriter, UIManager draws it.
 * @typedef {Object} DialogueView
 * @property {boolean} active Whether a conversation is open.
 * @property {string} state NPC dialogue state name.
 * @property {string} speaker Display name for the frame tab.
 * @property {string} visibleText Typewriter-revealed text so far.
 * @property {boolean} lineComplete Whether the current line finished typing.
 * @property {number} lineIndex Current line index.
 * @property {number} lineCount Total lines in the node.
 * @property {Array<{label: string, selected: boolean}>} choices
 */

/* ══════════════════════════════════════════════════════════════════════════
   UI MANAGER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Central HUD, modal, dialogue, notification, and transition-overlay manager.
 * See the file header for the layer model, input intercept rules, layout
 * math, and render pass placement.
 */
export class UIManager {
    /**
     * @param {import('../engine/Renderer.js').Renderer} renderer
     *   Engine renderer. UIManager reads its cell metrics and viewport size
     *   every frame and draws through its screen-space API.
     * @param {Object} [options]
     * @param {boolean} [options.showHintLine=true] Render the contextual
     *   hint row at the bottom center of the viewport.
     * @param {boolean} [options.showHud=true] Master HUD gate (cinematic mode
     *   can disable it without discarding state).
     */
    constructor(renderer, options = {}) {
        if (!renderer ||
            typeof renderer.drawString !== 'function' ||
            typeof renderer.drawRect !== 'function') {
            throw new TypeError(
                '[UIManager] A Renderer with drawString()/drawRect() is required.'
            );
        }
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[UIManager] options must be an object.');
        }

        /** @type {import('../engine/Renderer.js').Renderer} */
        this._renderer = renderer;

        /** @type {boolean} Contextual hint row gate. */
        this._showHintLine = options.showHintLine !== false;
        /** @type {boolean} Master HUD gate for cinematic modes. */
        this._showHud = options.showHud !== false;

        /** @type {number} Simulation clock, seconds (deterministic fades). */
        this._time = 0;

        /* ---- Panel registry & focus stack ------------------------------ */
        /** @type {Map<string, UIPanelSpec>} id → spec. */
        this._panelSpecs = new Map();
        /** @type {string[]} Open panel ids, last entry is the focused top. */
        this._stack = [];
        /** @type {Map<string, number>} List-driven panel cursor positions. */
        this._cursors = new Map();
        /** @type {Map<string, number>} List-driven panel scroll offsets. */
        this._scrolls = new Map();
        /** @type {Map<string, number>} Panel open timestamps for slide-in. */
        this._openedAt = new Map();

        /* ---- Transient effect queues ------------------------------------ */
        /** @type {ToastRecord[]} */
        this._toasts = [];
        /** @type {FloatingRecord[]} */
        this._floating = [];
        /** @type {Array<{text: string, sub: ?string, born: number, fg: number}>} */
        this._announceQueue = [];
        /** @type {number} Monotonic toast id counter. */
        this._nextToastId = 1;

        /* ---- Dialogue & hint --------------------------------------------- */
        /** @type {?DialogueView} Latest NPC dialogue snapshot. */
        this._dialogueView = null;
        /** @type {?string} Bottom-center contextual hint text. */
        this._hint = null;

        /* ---- Providers (duck-typed, fail-soft reads) --------------------- */
        /** @type {?Object} */ this._player = null;
        /** @type {?Object} */ this._questSystem = null;
        /** @type {?Object} */ this._inventory = null;
        /** @type {?Object} */ this._shop = null;
        /** @type {?Object} */ this._camera = null;
        /** @type {?Object} */ this._worldManager = null;

        /* ---- Events & diagnostics ---------------------------------------- */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {Object} Lifetime counters for the debug HUD. */
        this._metrics = {
            panelsOpened: 0,
            panelsClosed: 0,
            toastsShown: 0,
            toastsEvicted: 0,
            announcements: 0,
            floatingTexts: 0
        };

        this._registerBuiltinPanels();
    }

    /* ══════════════════════════════════════════════════════════════════
       PROVIDER WIRING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Attaches the player entity read by the HUD (vitals, oranges, cooldowns,
     * party frames) and the shop affordability check. Any object exposing
     * numeric hp/maxHp fields works; absent fields degrade gracefully.
     * @param {?Object} player Player instance or null to detach.
     * @returns {this}
     */
    attachPlayer(player) {
        this._player = player;
        return this;
    }

    /**
     * Attaches the quest engine consumed by the quest log panel.
     * Expected shape: listQuests() → [{id, title, status, objective}].
     * @param {?Object} questSystem QuestSystem or null.
     * @returns {this}
     */
    attachQuestSystem(questSystem) {
        this._questSystem = questSystem;
        return this;
    }

    /**
     * Attaches the inventory provider (getSlots() | items | slots array).
     * @param {?Object} inventory Inventory system or null.
     * @returns {this}
     */
    attachInventory(inventory) {
        this._inventory = inventory;
        return this;
    }

    /**
     * Attaches the shop provider ({items, purchase(index), currencyName}).
     * @param {?Object} shop Shop vendor object or null to close the counter.
     * @returns {this}
     */
    attachShop(shop) {
        this._shop = shop;
        return this;
    }

    /**
     * Attaches the camera used to project world-anchored floating text into
     * screen space. Without a camera, floatingText() coordinates are read
     * as screen pixels directly.
     * @param {?Object} camera Engine Camera or null.
     * @returns {this}
     */
    attachCamera(camera) {
        this._camera = camera;
        return this;
    }

    /**
     * Attaches the WorldManager that feeds the HUD world tag and the
     * Dream↔Drab transition overlay (flicker/fade signals).
     * @param {?Object} worldManager WorldManager or null.
     * @returns {this}
     */
    attachWorldManager(worldManager) {
        this._worldManager = worldManager;
        return this;
    }

    /**
     * Installs the dialogue snapshot rendered by the dialogue layer. The
     * NPC module owns typewriter advancement and dialogue INPUT; UIManager
     * only presents what this view describes. Pass a view with
     * `active: false` (or call clearDialogueView()) when the talk ends.
     * @param {?DialogueView} view Snapshot from NPC.getDialogueView().
     * @returns {this}
     */
    setDialogueView(view) {
        this._dialogueView = view && view.active ? view : null;
        return this;
    }

    /** Clears any presented dialogue frame. @returns {this} */
    clearDialogueView() {
        this._dialogueView = null;
        return this;
    }

    /** @returns {boolean} True while a dialogue view is being presented. */
    isDialogueOpen() {
        return this._dialogueView !== null;
    }

    /**
     * Sets the bottom-center contextual hint line, e.g. '[E] Speak with
     * Mender Ira'. WorldManager/NPC proximity hooks drive this. Null clears.
     * @param {?string} text Hint text or null.
     * @returns {this}
     */
    setHint(text) {
        this._hint = typeof text === 'string' && text.length > 0 ? text : null;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PANEL REGISTRY & FOCUS STACK
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Registers the shipped interface set. Extension panels (mini-map,
     * codex, settings) install through the public registerPanel() API with
     * a custom draw hook; built-ins dispatch through _renderPanelContent().
     * @private
     */
    _registerBuiltinPanels() {
        this.registerPanel({
            id: PANEL_ID.INVENTORY,
            title: 'SATCHEL',
            listDriven: true,
            widthFraction: 0.44,
            minWidthCells: 30,
            maxWidthCells: 48
        });
        this.registerPanel({
            id: PANEL_ID.QUEST_LOG,
            title: 'LOOM RECORDS',
            listDriven: true,
            widthFraction: 0.5,
            minWidthCells: 34,
            maxWidthCells: 58
        });
        this.registerPanel({
            id: PANEL_ID.SHOP,
            title: 'ORANGE JUICE CART',
            listDriven: true,
            widthFraction: 0.48,
            minWidthCells: 32,
            maxWidthCells: 54
        });
        this.registerPanel({
            id: PANEL_ID.PAUSE,
            title: 'THE HOUR HOLDS',
            blocking: true,
            listDriven: false,
            widthFraction: 0.4,
            minWidthCells: 28,
            maxWidthCells: 44,
            heightFraction: 0.5,
            minHeightCells: 12,
            maxHeightCells: 22
        });
    }

    /**
     * Installs (or replaces) a panel specification. This is the public
     * extension point: future systems (world map, codex, keybind editor)
     * register here with a custom `draw` hook instead of modifying this
     * module.
     * @param {UIPanelSpec} spec Panel specification.
     * @returns {this}
     * @throws {TypeError|RangeError} If the spec is malformed.
     */
    registerPanel(spec) {
        if (spec === null || typeof spec !== 'object') {
            throw new TypeError('[UIManager] panel spec must be an object.');
        }
        if (typeof spec.id !== 'string' || spec.id.length === 0) {
            throw new RangeError('[UIManager] panel spec needs a non-empty id.');
        }
        const normalized = {
            id: spec.id,
            title: typeof spec.title === 'string' ? spec.title : spec.id.toUpperCase(),
            blocking: spec.blocking !== false,
            listDriven: Boolean(spec.listDriven),
            widthFraction: finiteOr(spec.widthFraction, 0.5),
            minWidthCells: finiteOr(spec.minWidthCells, 30),
            maxWidthCells: finiteOr(spec.maxWidthCells, 58),
            heightFraction: finiteOr(spec.heightFraction, 0.62),
            minHeightCells: finiteOr(spec.minHeightCells, 12),
            maxHeightCells: finiteOr(spec.maxHeightCells, 30),
            draw: typeof spec.draw === 'function' ? spec.draw : null
        };
        this._panelSpecs.set(normalized.id, Object.freeze(normalized));
        return this;
    }

    /**
     * Opens a panel, or refocuses it when already open (moving it to the
     * top of the stack). Emits 'panelopened' for new opens and
     * 'panelfocused' for refocuses so audio can differentiate.
     * @param {string} id Registered panel id.
     * @returns {boolean} True if the panel is open after this call.
     */
    openPanel(id) {
        if (!this._panelSpecs.has(id)) {
            console.warn(`[UIManager] openPanel: unknown panel '${id}'.`);
            return false;
        }
        const existing = this._stack.indexOf(id);
        if (existing !== -1) {
            this._stack.splice(existing, 1);
            this._stack.push(id);
            this._dispatch('panelfocused', { id });
            return true;
        }
        this._stack.push(id);
        this._cursors.set(id, 0);
        this._scrolls.set(id, 0);
        this._openedAt.set(id, this._time);
        this._metrics.panelsOpened += 1;
        this._dispatch('panelopened', { id });
        return true;
    }

    /**
     * Closes a panel wherever it sits in the stack. Emits 'panelclosed'.
     * @param {string} id Panel id.
     * @returns {boolean} True if a panel was actually closed.
     */
    closePanel(id) {
        const index = this._stack.indexOf(id);
        if (index === -1) return false;
        this._stack.splice(index, 1);
        this._openedAt.delete(id);
        this._metrics.panelsClosed += 1;
        this._dispatch('panelclosed', { id });
        return true;
    }

    /**
     * Toggles a panel open/closed. The standard binding handler for
     * INVENTORY and QUEST_LOG keys.
     * @param {string} id Panel id.
     * @returns {boolean} New open state.
     */
    togglePanel(id) {
        if (this._stack.includes(id)) {
            this.closePanel(id);
            return false;
        }
        return this.openPanel(id);
    }

    /**
     * Closes the focused (topmost) panel. Bound to ESC while any panel is
     * open. Returns false when the stack is empty so callers can chain
     * fallback behavior (e.g. opening the pause menu).
     * @returns {boolean} True if a panel was closed.
     */
    closeTopPanel() {
        if (this._stack.length === 0) return false;
        return this.closePanel(this._stack[this._stack.length - 1]);
    }

    /**
     * Closes every open panel (dimension shifts, death, cutscenes).
     * @returns {number} Number of panels closed.
     */
    closeAllPanels() {
        let closed = 0;
        while (this._stack.length > 0) {
            this.closePanel(this._stack[this._stack.length - 1]);
            closed += 1;
        }
        return closed;
    }

    /** @param {string} id Panel id. @returns {boolean} Open state. */
    isPanelOpen(id) {
        return this._stack.includes(id);
    }

    /** @returns {?string} Focused top panel id, or null. */
    getTopPanelId() {
        return this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
    }

    /**
     * True while any open panel declares `blocking: true`. Dialogue is
     * included here: a conversation blocks movement exactly like a modal.
     * @returns {boolean}
     */
    hasBlockingPanel() {
        if (this.isDialogueOpen()) return true;
        for (let i = 0; i < this._stack.length; i += 1) {
            const spec = this._panelSpecs.get(this._stack[i]);
            if (spec && spec.blocking) return true;
        }
        return false;
    }

    /**
     * THE gameplay gate. Player controllers and combat systems query this
     * once per tick and suppress movement/dodge/attack intent while true.
     * Named distinctly from hasBlockingPanel() to read naturally at call
     * sites: `if (!ui.isGameplayInputBlocked()) player.handleInput(input);`
     * @returns {boolean}
     */
    isGameplayInputBlocked() {
        return this.hasBlockingPanel();
    }

    /* ══════════════════════════════════════════════════════════════════
       NOTIFICATIONS, ANNOUNCEMENTS, FLOATING TEXT
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Queues a toast notification in the top-right column.
     * Toasts stack downward in spawn order; beyond MAX_TOASTS the oldest
     * is evicted immediately (a toast dying early is preferable to hiding
     * a fresh quest update).
     * @param {string} text Notice text (wrapped automatically).
     * @param {Object} [options]
     * @param {string} [options.kind='info'] TOAST_KIND value.
     * @param {number} [options.hold=2.4] Full-opacity seconds.
     * @param {string|number} [options.color] Accent override.
     * @returns {number} Toast id (for event correlation).
     */
    notify(text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) return -1;
        const kind = TOAST_COLORS[options.kind] !== undefined ? options.kind : 'info';
        if (this._toasts.length >= MAX_TOASTS) {
            this._toasts.shift();
            this._metrics.toastsEvicted += 1;
        }
        const id = this._nextToastId++;
        const fg = options.color !== undefined
            ? ASCIIBuffer.packColor(options.color, TOAST_COLORS[kind])
            : TOAST_COLORS[kind];
        /** @type {ToastRecord} */
        const toast = {
            id,
            kind,
            lines: this._wrapText(text, TOAST_WIDTH_CELLS - 2),
            born: this._time,
            fadeIn: TOAST_FADE_IN,
            hold: finiteOr(options.hold, TOAST_HOLD),
            fadeOut: TOAST_FADE_OUT,
            fg
        };
        this._toasts.push(toast);
        this._metrics.toastsShown += 1;
        this._dispatch('toast', { id, kind, text });
        return id;
    }

    /**
     * Queues a full-width centered banner (level-ups, chapter beats).
     * Announcements serialize: up to MAX_ANNOUNCE_QUEUE play back to back,
     * overflow drops the oldest pending banner (never the active one).
     * @param {string} text Banner headline.
     * @param {Object} [options]
     * @param {?string} [options.sub=null] Smaller sub-line under the headline.
     * @param {string|number} [options.color='#ff9ed2'] Headline color.
     * @returns {this}
     */
    announce(text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) return this;
        if (this._announceQueue.length >= MAX_ANNOUNCE_QUEUE) {
            this._announceQueue.shift();
        }
        this._announceQueue.push({
            text,
            sub: typeof options.sub === 'string' ? options.sub : null,
            born: this._time,
            fg: ASCIIBuffer.packColor(options.color ?? '#ff9ed2', TOAST_COLORS.levelup)
        });
        this._metrics.announcements += 1;
        this._dispatch('announce', { text });
        return this;
    }

    /**
     * Spawns world-anchored floating text (damage numbers, pickup pings).
     * When a camera is attached, coordinates are WORLD pixels projected
     * through camera.worldToScreen at spawn time; without a camera they
     * are treated as screen pixels. The projection is sampled once at
     * spawn — floating text then drifts in screen space, which is the
     * correct feel for combat numbers even if the camera pans away.
     * @param {number} x World x (or screen x without a camera).
     * @param {number} y World y (or screen y without a camera).
     * @param {string} text Display text.
     * @param {Object} [options]
     * @param {string|number} [options.color='#ffffff'] Text color.
     * @param {number} [options.life=1.0] Lifetime seconds.
     * @param {number} [options.rise=30] Upward travel in CSS px.
     * @returns {this}
     */
    floatingText(x, y, text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) return this;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return this;
        if (this._floating.length >= MAX_FLOATING) {
            this._floating.shift();
        }
        let screenX = x;
        let screenY = y;
        if (this._camera && typeof this._camera.worldToScreen === 'function') {
            const projected = this._camera.worldToScreen(x, y);
            screenX = projected.x;
            screenY = projected.y;
        }
        this._floating.push({
            worldX: screenX,
            worldY: screenY,
            text,
            fg: ASCIIBuffer.packColor(options.color ?? '#ffffff', 0xFFFFFFFF),
            born: this._time,
            life: Math.max(0.1, finiteOr(options.life, 1.0)),
            rise: Math.max(0, finiteOr(options.rise, 30))
        });
        this._metrics.floatingTexts += 1;
        return this;
    }

    /**
     * Clears all transient effects (world shifts, reloads, cutscene start).
     * @returns {this}
     */
    clearNotifications() {
        this._toasts.length = 0;
        this._floating.length = 0;
        this._announceQueue.length = 0;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a UI event: 'panelopened', 'panelfocused',
     * 'panelclosed', 'toast', 'announce'. Audio hooks subscribe here.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {Function} Unsubscribe function.
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[UIManager] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[UIManager] listener must be a function.');
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
     * Broadcasts an event with error isolation: UI hooks are cosmetic and a
     * throwing subscriber must never kill the simulation tick.
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
                console.error(`[UIManager] '${type}' listener failed:`, error);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the UI simulation by one fixed tick.
     * CONTRACT: call exactly once per simulation tick, after
     * WorldManager.update() (which commits InputManager edges) and before
     * any gameplay system reads movement intent through the block gate.
     * Sequence:
     *   1. Advance the simulation clock.
     *   2. Consume window toggle/navigation key edges.
     *   3. Retire expired toasts, floating texts, and announcements.
     * @param {number} dt Fixed timestep in seconds.
     * @param {import('../engine/InputManager.js').InputManager} [input]
     * @returns {this}
     */
    update(dt, input) {
        if (!Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;

        if (input && typeof input.isActionJustPressed === 'function') {
            this._handleWindowKeys(input);
            this._handlePanelNavigation(input);
        }

        this._advanceEffects();
        return this;
    }

    /**
     * Window-level key edges (see header INPUT INTERCEPT RULES).
     * While a dialogue view is presented, NPC.handleInput() owns every key
     * — UIManager steps aside entirely so edges are never double-consumed.
     * ESC semantics: close the topmost panel when any panel is open;
     * otherwise toggle the pause menu.
     * @param {Object} input InputManager.
     * @private
     */
    _handleWindowKeys(input) {
        if (this.isDialogueOpen()) return;

        if (input.isActionJustPressed('INVENTORY')) {
            this.togglePanel(PANEL_ID.INVENTORY);
        }
        if (input.isActionJustPressed('QUEST_LOG')) {
            this.togglePanel(PANEL_ID.QUEST_LOG);
        }
        if (input.isActionJustPressed('PAUSE')) {
            if (this._stack.length > 0) {
                this.closeTopPanel();
            } else {
                this.togglePanel(PANEL_ID.PAUSE);
            }
        }
    }

    /**
     * Cursor navigation for the focused list-driven panel. Runs only when
     * the top panel declares listDriven; UP/DOWN wrap around (menu feel),
     * ACTION activates through _activateSelection(). All edges consumed
     * here never reach gameplay — which is additionally gated out by
     * isGameplayInputBlocked(), a deliberate double safety.
     * @param {Object} input InputManager.
     * @private
     */
    _handlePanelNavigation(input) {
        const topId = this.getTopPanelId();
        if (!topId) return;
        const spec = this._panelSpecs.get(topId);
        if (!spec || !spec.listDriven) return;

        const items = this._readPanelItems(topId);
        const count = items.length;

        if (input.isActionJustPressed('MOVE_UP') && count > 0) {
            const cursor = (this._cursors.get(topId) ?? 0);
            this._cursors.set(topId, (cursor - 1 + count) % count);
            this._keepCursorVisible(topId, count);
        }
        if (input.isActionJustPressed('MOVE_DOWN') && count > 0) {
            const cursor = (this._cursors.get(topId) ?? 0);
            this._cursors.set(topId, (cursor + 1) % count);
            this._keepCursorVisible(topId, count);
        }
        if (input.isActionJustPressed('ACTION') && count > 0) {
            this._activateSelection(topId, items);
        }
    }

    /**
     * Scrolls the panel viewport so the cursor stays visible. Standard
     * clamped-follow: the window only moves when the cursor pushes past
     * an edge, which avoids jittery re-scrolling on wrap-around.
     * @param {string} panelId Panel id.
     * @param {number} count Item count.
     * @private
     */
    _keepCursorVisible(panelId, count) {
        const cursor = this._cursors.get(panelId) ?? 0;
        const visible = this._panelVisibleRows(panelId);
        let scroll = this._scrolls.get(panelId) ?? 0;
        if (cursor < scroll) scroll = cursor;
        if (cursor >= scroll + visible) scroll = cursor - visible + 1;
        scroll = Math.max(0, Math.min(scroll, Math.max(0, count - visible)));
        this._scrolls.set(panelId, scroll);
    }

    /**
     * Visible content rows for a list panel at the current viewport size.
     * Mirrors the geometry computed in render(): panel height minus border
     * (2), padding (2), header row (1), and footer hint row (1).
     * @param {string} panelId Panel id.
     * @returns {number} Rows available for list entries (>= 1).
     * @private
     */
    _panelVisibleRows(panelId) {
        const spec = this._panelSpecs.get(panelId);
        if (!spec) return 1;
        const grid = this._gridSize();
        const rows = Math.max(
            spec.minHeightCells,
            Math.min(spec.maxHeightCells, Math.floor(grid.rows * spec.heightFraction))
        );
        return Math.max(1, rows - 6);
    }

    /**
     * Retires expired transient effects. Reverse splice (not swap-remove)
     * preserves spawn order, which toast stacking depends on; queues are
     * tiny (≤ 32) so the O(n) shift is negligible.
     * @private
     */
    _advanceEffects() {
        for (let i = this._toasts.length - 1; i >= 0; i -= 1) {
            const t = this._toasts[i];
            const total = t.fadeIn + t.hold + t.fadeOut;
            if (this._time - t.born >= total) {
                this._toasts.splice(i, 1);
            }
        }
        for (let i = this._floating.length - 1; i >= 0; i -= 1) {
            if (this._time - this._floating[i].born >= this._floating[i].life) {
                this._floating.splice(i, 1);
            }
        }
        if (this._announceQueue.length > 0) {
            const head = this._announceQueue[0];
            if (this._time - head.born >= ANNOUNCE_LIFE) {
                this._announceQueue.shift();
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       PROVIDER READS (NORMALIZED, FAIL-SOFT)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Normalizes inventory entries from whichever shape the provider uses.
     * Accepts getSlots(), .items, or .slots. Malformed entries are
     * coerced, never thrown on: a bad item must not blank the whole panel.
     * @returns {Array<{name: string, glyph: string, count: number, description: string}>}
     * @private
     */
    _readInventoryItems() {
        const inv = this._inventory;
        if (!inv) return [];
        let raw = [];
        try {
            if (typeof inv.getSlots === 'function') raw = inv.getSlots();
            else if (Array.isArray(inv.items)) raw = inv.items;
            else if (Array.isArray(inv.slots)) raw = inv.slots;
        } catch (error) {
            console.error('[UIManager] inventory read failed:', error);
            return [];
        }
        if (!Array.isArray(raw)) return [];
        return raw.map((entry) => {
            const safe = entry && typeof entry === 'object' ? entry : {};
            const glyphSource = typeof safe.glyph === 'string' && safe.glyph.length > 0
                ? safe.glyph : '?';
            return {
                name: typeof safe.name === 'string' ? safe.name : 'Unknown wanderer',
                glyph: Array.from(glyphSource)[0],
                count: Math.max(1, Math.round(finiteOr(safe.count, 1))),
                description: typeof safe.description === 'string' ? safe.description : ''
            };
        });
    }

    /**
     * Normalizes quest entries from the quest engine.
     * @returns {Array<{id: string, title: string, status: string, objective: string}>}
     * @private
     */
    _readQuestItems() {
        const quests = this._questSystem;
        if (!quests) return [];
        let raw = [];
        try {
            if (typeof quests.listQuests === 'function') raw = quests.listQuests();
            else if (Array.isArray(quests.quests)) raw = quests.quests;
        } catch (error) {
            console.error('[UIManager] quest read failed:', error);
            return [];
        }
        if (!Array.isArray(raw)) return [];
        return raw.map((entry) => {
            const safe = entry && typeof entry === 'object' ? entry : {};
            return {
                id: typeof safe.id === 'string' ? safe.id : 'quest',
                title: typeof safe.title === 'string' ? safe.title : safe.id ?? 'Untitled',
                status: typeof safe.status === 'string' ? safe.status : 'ACTIVE',
                objective: typeof safe.objective === 'string' ? safe.objective : ''
            };
        });
    }

    /**
     * Normalizes shop stock from the attached vendor.
     * @returns {Array<{name: string, price: number, glyph: string, stock: number}>}
     * @private
     */
    _readShopItems() {
        const shop = this._shop;
        if (!shop || !Array.isArray(shop.items)) return [];
        return shop.items.map((entry) => {
            const safe = entry && typeof entry === 'object' ? entry : {};
            const glyphSource = typeof safe.glyph === 'string' && safe.glyph.length > 0
                ? safe.glyph : 'o';
            return {
                name: typeof safe.name === 'string' ? safe.name : 'Wares',
                price: Math.max(0, Math.round(finiteOr(safe.price, 0))),
                glyph: Array.from(glyphSource)[0],
                stock: Math.round(finiteOr(safe.stock, Infinity))
            };
        });
    }

    /**
     * Dispatches list reads by panel id — shared by navigation (item
     * counts) and rendering (content), guaranteeing both see an identical
     * normalized view within one tick.
     * @param {string} panelId Panel id.
     * @returns {Array<Object>} Normalized entries.
     * @private
     */
    _readPanelItems(panelId) {
        switch (panelId) {
            case PANEL_ID.INVENTORY: return this._readInventoryItems();
            case PANEL_ID.QUEST_LOG: return this._readQuestItems();
            case PANEL_ID.SHOP: return this._readShopItems();
            default: return [];
        }
    }

    /**
     * Executes the ACTION-key behavior for a list panel's selected entry.
     * Provider calls are fail-soft: a throwing purchase() logs and reports
     * a warning toast instead of killing the frame.
     * @param {string} panelId Panel id.
     * @param {Array<Object>} items Normalized entries.
     * @private
     */
    _activateSelection(panelId, items) {
        const index = this._cursors.get(panelId) ?? 0;
        const entry = items[index];
        if (!entry) return;

        try {
            if (panelId === PANEL_ID.INVENTORY) {
                const inv = this._inventory;
                if (inv && typeof inv.useItem === 'function') {
                    const used = inv.useItem(index);
                    this.notify(
                        used ? `Used ${entry.name}.` : `Cannot use ${entry.name} here.`,
                        { kind: used ? 'success' : 'warning' }
                    );
                } else {
                    this.notify(`${entry.name}: no usable action attuned.`, { kind: 'info' });
                }
            } else if (panelId === PANEL_ID.QUEST_LOG) {
                const quests = this._questSystem;
                if (quests && typeof quests.trackQuest === 'function') {
                    quests.trackQuest(entry.id);
                    this.notify(`Tracking: ${entry.title}`, { kind: 'quest' });
                } else if (entry.objective) {
                    this.notify(entry.objective, { kind: 'quest' });
                }
            } else if (panelId === PANEL_ID.SHOP) {
                this._attemptPurchase(index, entry);
            }
        } catch (error) {
            console.error(`[UIManager] selection action failed in '${panelId}':`, error);
            this.notify('The action fizzles.', { kind: 'warning' });
        }
    }

    /**
     * Shop purchase flow: affordability is checked against player.currency
     * before invoking provider.purchase(), so a hostile provider cannot
     * charge a broke player. Success/failure both surface as toasts.
     * @param {number} index Stock index.
     * @param {Object} entry Normalized stock entry.
     * @private
     */
    _attemptPurchase(index, entry) {
        const shop = this._shop;
        const currencyName = shop && typeof shop.currencyName === 'string'
            ? shop.currencyName
            : 'orange scrip';
        const wallet = finiteOr(this._player ? this._player.currency : 0, 0);
        if (entry.price > wallet) {
            this.notify(
                `Not enough ${currencyName} for ${entry.name}.`,
                { kind: 'warning' }
            );
            return;
        }
        let purchased = false;
        if (shop && typeof shop.purchase === 'function') {
            purchased = Boolean(shop.purchase(index));
        }
        this.notify(
            purchased ? `Bought ${entry.name}.` : 'The keeper shakes their head.',
            { kind: purchased ? 'success' : 'warning' }
        );
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER PASS — TOP LEVEL
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents the full UI overlay. Call ONCE per presentation frame, after
     * the world blit and before renderer.endFrame(). Layer order follows
     * the header painter's algorithm: HUD → panels → dialogue → toasts →
     * floating text → announcements → transition overlay.
     *
     * All animation envelopes are pure functions of the simulation clock,
     * so presentation rate never changes how a fade feels; the provided
     * interpolation alpha is reserved for future sub-tick cursor smoothing.
     * @param {number} [interpolationAlpha=1] GameLoop render phase [0, 1].
     * @returns {void}
     */
    render(interpolationAlpha = 1) {
        const grid = this._gridSize();
        if (grid.columns < 20 || grid.rows < 10) return; // Degenerate viewport.

        const blocking = this.hasBlockingPanel();

        /* 1. HUD — always on, dimmed under blocking modals. */
        if (this._showHud) {
            this._drawHUD(blocking ? HUD_DIM_ALPHA : 1);
        }

        /* 2. Panel stack, bottom → top. */
        for (let i = 0; i < this._stack.length; i += 1) {
            const isTop = i === this._stack.length - 1;
            this._drawPanel(this._stack[i], isTop);
        }

        /* 3. Dialogue frame. */
        if (this._dialogueView) {
            this._drawDialogue(this._dialogueView, grid);
        }

        /* 4–6. Transient effects. */
        this._drawToasts(grid);
        this._drawFloating();
        this._drawAnnouncement(grid);

        /* 7. Reality-shift overlay outranks everything. */
        this._drawTransitionOverlay(grid);
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — GEOMETRY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Viewport size in cells, derived from the Renderer each frame. Layout
     * is therefore self-healing across resize and font recalibration —
     * UIManager never caches metrics, matching WorldManager's policy.
     * @returns {{columns: number, rows: number, cellW: number, cellH: number}}
     * @private
     */
    _gridSize() {
        const r = this._renderer;
        const cellW = r.cellWidth > 0 ? r.cellWidth : 9.6;
        const cellH = r.cellHeight > 0 ? r.cellHeight : 20;
        let columns, rows;
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
     * Resolves a panel's frame geometry in both cell and pixel space.
     * See header LAYOUT MATH for the centering formulas.
     * @param {UIPanelSpec} spec Panel spec.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @returns {PanelGeometry}
     * @private
     */
    _panelGeometry(spec, grid) {
        const cols = Math.max(
            spec.minWidthCells,
            Math.min(spec.maxWidthCells, Math.floor(grid.columns * spec.widthFraction))
        );
        const rows = Math.max(
            spec.minHeightCells,
            Math.min(spec.maxHeightCells, Math.floor(grid.rows * spec.heightFraction))
        );
        const x0 = Math.floor((grid.columns - cols) / 2);
        const y0 = Math.floor((grid.rows - rows) / 2);
        return {
            x0,
            y0,
            cols,
            rows,
            px: x0 * grid.cellW,
            py: y0 * grid.cellH,
            wPx: cols * grid.cellW,
            hPx: rows * grid.cellH,
            innerX: x0 + 2,
            innerY: y0 + 2,
            innerCols: Math.max(1, cols - 4),
            innerRows: Math.max(1, rows - 4)
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — HUD
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the top-left status block: name/level/world tag, HP bar,
     * optional MP bar, the Orange Energy bar (with low-reserve flicker),
     * active cooldowns, and party frames. Anchored at cell (1, 1); every
     * row is one drawString call, so the whole HUD costs a handful of
     * glyph runs per frame.
     * @param {number} alpha Layer opacity (dimmed under blocking modals).
     * @private
     */
    _drawHUD(alpha) {
        const r = this._renderer;
        const grid = this._gridSize();
        const px = grid.cellW;               // column 1
        let row = 1;                          // row 1
        const y = (rowIndex) => rowIndex * grid.cellH;
        const dim = (color, extra = 1) => withAlpha(color, alpha * extra);

        const player = this._player;
        if (!player) {
            r.drawString(px, y(row), 'NO THREAD ATTUNED', dim(COLOR_TEXT_DIM));
            return;
        }

        /* ---- Identity row: name, level, world tag ---------------------- */
        const name = typeof player.name === 'string' ? player.name : 'Custodian';
        const level = finiteOr(player.level, 1);
        let worldTag = 'DREAM';
        let worldColor = COLOR_ORANGE;
        if (this._worldManager && typeof this._worldManager.getActiveWorldId === 'function') {
            try {
                worldTag = String(this._worldManager.getActiveWorldId());
                worldColor = worldTag === 'DRAB' ? COLOR_TEXT_DIM : COLOR_ORANGE;
            } catch (error) {
                /* World tag is cosmetic; keep the frame alive. */
            }
        }
        r.drawString(
            px, y(row),
            `${name}  Lv.${level}  [${worldTag}]`,
            dim(COLOR_PANEL_TEXT)
        );
        row += 1;

        /* ---- Health bar with threshold coloring ------------------------- */
        const hp = finiteOr(player.hp, 0);
        const maxHp = finiteOr(player.maxHp, 0);
        const hpFraction = maxHp > 0 ? hp / maxHp : 0;
        const hpColor = hpFraction > 0.5 ? COLOR_HP_HIGH
            : hpFraction > 0.25 ? COLOR_HP_MID
                : COLOR_HP_LOW;
        this._drawStatusBar(px, y(row), 'HP    ', hpFraction, hpColor,
            `${Math.ceil(hp)}/${Math.ceil(maxHp)}`, alpha);
        row += 1;

        /* ---- MP bar (only when the player model carries mana) ----------- */
        if (Number.isFinite(player.mp) && Number.isFinite(player.maxMp) && player.maxMp > 0) {
            this._drawStatusBar(px, y(row), 'MP    ', player.mp / player.maxMp, COLOR_MP,
                `${Math.ceil(player.mp)}/${Math.ceil(player.maxMp)}`, alpha);
            row += 1;
        }

        /* ---- Orange Energy: the reality anchor --------------------------
         * Below LOW_ENERGY_FLICKER_FRACTION the bar flickers with the same
         * deterministic noise that drives reality collapse, foreshadowing
         * the imminent Dream→Drab shift. Pure function of sim time. */
        const oranges = finiteOr(player.oranges, 0);
        const maxOranges = finiteOr(player.maxOranges, 20);
        const energyFraction = Number.isFinite(player.energyFraction)
            ? player.energyFraction
            : maxOranges > 0 ? oranges / maxOranges : 0;
        const lowEnergy = energyFraction < LOW_ENERGY_FLICKER_FRACTION;
        let orangeAlpha = alpha;
        let orangeColor = COLOR_ORANGE;
        if (lowEnergy) {
            orangeAlpha = alpha * (0.45 + 0.55 * flickerNoise(this._time * 1.8));
            orangeColor = COLOR_ORANGE_LOW;
        }
        this._drawStatusBar(px, y(row), 'ORANGE', energyFraction, orangeColor,
            `${Math.ceil(oranges)}/${Math.ceil(maxOranges)}`, orangeAlpha);
        row += 1;

        /* ---- Currency ----------------------------------------------------- */
        if (Number.isFinite(player.currency)) {
            const currencyName = typeof player.currencyName === 'string'
                ? player.currencyName
                : 'scrip';
            r.drawString(px, y(row), `${currencyName}: ${Math.floor(player.currency)}`,
                dim(COLOR_CURRENCY));
            row += 1;
        }

        /* ---- Active cooldowns (compact bars, only while charging) -------- */
        if (Array.isArray(player.cooldowns)) {
            for (let i = 0; i < player.cooldowns.length && row < grid.rows - 2; i += 1) {
                const cd = player.cooldowns[i];
                if (!cd || !Number.isFinite(cd.remaining) || cd.remaining <= 0) continue;
                const duration = finiteOr(cd.duration, cd.remaining);
                const fraction = duration > 0 ? 1 - (cd.remaining / duration) : 1;
                const label = String(cd.name ?? 'skill').slice(0, 8).padEnd(8, ' ');
                this._drawStatusBar(px, y(row), label, fraction, COLOR_COOLDOWN,
                    `${cd.remaining.toFixed(1)}s`, alpha, 8);
                row += 1;
            }
        }

        /* ---- Party frames (Stasia_apk, Jade, ...) ------------------------ */
        if (Array.isArray(player.party) && player.party.length > 0) {
            row += 1;
            r.drawString(px, y(row), 'PARTY', dim(COLOR_TEXT_DIM));
            row += 1;
            for (let i = 0; i < player.party.length && row < grid.rows - 1; i += 1) {
                const mate = player.party[i];
                if (!mate || typeof mate.name !== 'string') continue;
                const mateMax = finiteOr(mate.maxHp, 0);
                const mateFraction = mateMax > 0 ? finiteOr(mate.hp, 0) / mateMax : 0;
                this._drawStatusBar(px + grid.cellW, y(row),
                    mate.name.slice(0, 10).padEnd(10, ' '),
                    mateFraction, mateFraction > 0.25 ? COLOR_HP_HIGH : COLOR_HP_LOW,
                    `${Math.round(mateFraction * 100)}%`, alpha, 6);
                row += 1;
            }
        }

        /* ---- Contextual hint line, bottom center -------------------------- */
        if (this._showHintLine && this._hint) {
            const size = r.measureString(this._hint);
            const hintX = Math.max(0, (r.viewportWidth - size.width) / 2);
            const hintY = (grid.rows - 1) * grid.cellH;
            r.drawString(hintX, hintY, this._hint,
                dim(COLOR_PANEL_TITLE), withAlpha(COLOR_PANEL_BG, alpha * 0.85));
        }
    }

    /**
     * Draws one labeled ASCII status bar:
     *     LABEL [██████░░░░]  12/20
     * The label column is caller-padded so stacked bars align; the value
     * column is right-padded to keep subsequent text from wobbling as
     * digit counts change between frames.
     * @param {number} px Screen x in CSS px.
     * @param {number} py Screen y in CSS px.
     * @param {string} label Pre-padded label column.
     * @param {number} fraction Bar fill [0, 1].
     * @param {number} color Packed bar color.
     * @param {string} valueText Right-side value readout.
     * @param {number} alpha Layer opacity.
     * @param {number} [innerCells=HUD_BAR_CELLS] Interior bar width.
     * @private
     */
    _drawStatusBar(px, py, label, fraction, color, valueText, alpha, innerCells = HUD_BAR_CELLS) {
        const r = this._renderer;
        const bar = buildBarInterior(fraction, innerCells);
        const padValue = String(valueText).padEnd(9, ' ');
        r.drawString(px, py, `${label}[`, withAlpha(COLOR_TEXT_DIM, alpha));
        const labelWidth = r.measureString(`${label}[`).width;
        r.drawString(px + labelWidth, py, bar, withAlpha(color, alpha));
        const barWidth = r.measureString(bar).width;
        r.drawString(px + labelWidth + barWidth, py, `] ${padValue}`,
            withAlpha(COLOR_PANEL_TEXT, alpha));
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — PANELS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws one open panel: slide-in envelope, background slab, box frame
     * with inset title, then dispatched content. Only the focused (top)
     * panel draws live cursor markers; buried panels render at reduced
     * opacity so stack depth reads at a glance.
     * @param {string} panelId Panel id.
     * @param {boolean} isTop Whether this panel currently holds focus.
     * @private
     */
    _drawPanel(panelId, isTop) {
        const spec = this._panelSpecs.get(panelId);
        if (!spec) return;
        const grid = this._gridSize();
        const geo = this._panelGeometry(spec, grid);

        /* Slide-in envelope: opacity ramps and the frame drops one cell. */
        const openedAt = this._openedAt.get(panelId) ?? this._time;
        const anim = easeOutCubic((this._time - openedAt) / PANEL_ANIM_SECONDS);
        const alpha = (isTop ? 1 : 0.82) * anim;
        const slidePx = (1 - anim) * grid.cellH;

        const r = this._renderer;
        const py = geo.py + slidePx;

        /* Background slab. */
        r.drawRect(geo.px, py, geo.wPx, geo.hPx, withAlpha(COLOR_PANEL_BG, alpha));

        /* Frame: three strings (top border with inset title, repeated side
         * rows folded into per-row draws, bottom border). */
        this._drawPanelFrame(geo, py, spec.title, alpha, isTop);

        /* Content dispatch: extension draw hook wins, else built-in table. */
        if (spec.draw) {
            try {
                spec.draw(this, { ...geo, py }, alpha);
            } catch (error) {
                console.error(`[UIManager] panel '${panelId}' draw hook failed:`, error);
            }
        } else {
            this._renderPanelContent(panelId, geo, py, alpha, isTop);
        }
    }

    /**
     * Draws the single-line box frame with the title inset on the top
     * border: ┌─[ TITLE ]─────────┐. One drawString per row keeps the
     * frame cheap; vertical sides are drawn only at the corners plus a
     * translucent full-height pair of rails.
     * @param {PanelGeometry} geo Panel geometry.
     * @param {number} py Slide-adjusted top edge in CSS px.
     * @param {string} title Frame title text.
     * @param {number} alpha Frame opacity.
     * @param {boolean} isTop Focus flag (brightens the title when focused).
     * @private
     */
    _drawPanelFrame(geo, py, title, alpha, isTop) {
        const r = this._renderer;
        const grid = this._gridSize();
        const H = String.fromCodePoint(GLYPH_FRAME_H);
        const V = String.fromCodePoint(GLYPH_FRAME_V);
        const frameColor = withAlpha(COLOR_PANEL_FRAME, alpha);
        const titleColor = withAlpha(isTop ? COLOR_PANEL_TITLE : COLOR_TEXT_DIM, alpha);

        /* Top border with inset title: ┌─[ TITLE ]───┐ */
        const titleSegment = `[ ${title} ]`;
        const remaining = Math.max(0, geo.cols - 4 - titleSegment.length);
        const leftRun = H.repeat(1);
        const rightRun = H.repeat(remaining);
        r.drawString(geo.px, py,
            String.fromCodePoint(GLYPH_FRAME_TL) + leftRun, frameColor);
        const titleX = geo.px + r.measureString(String.fromCodePoint(GLYPH_FRAME_TL) + leftRun).width;
        r.drawString(titleX, py, titleSegment, titleColor);
        const afterTitleX = titleX + r.measureString(titleSegment).width;
        r.drawString(afterTitleX, py, rightRun + String.fromCodePoint(GLYPH_FRAME_TR), frameColor);

        /* Side rails. */
        for (let row = 1; row < geo.rows - 1; row += 1) {
            const rowY = py + row * grid.cellH;
            r.drawString(geo.px, rowY, V, frameColor);
            r.drawString(geo.px + (geo.cols - 1) * grid.cellW, rowY, V, frameColor);
        }

        /* Bottom border. */
        const bottomY = py + (geo.rows - 1) * grid.cellH;
        r.drawString(geo.px, bottomY,
            String.fromCodePoint(GLYPH_FRAME_BL) +
            H.repeat(Math.max(0, geo.cols - 2)) +
            String.fromCodePoint(GLYPH_FRAME_BR),
            frameColor);
    }

    /**
     * Built-in content renderer dispatch. Each case reads its normalized
     * provider data and paints rows into the panel interior. All cases
     * handle the empty/unattuned state explicitly — a panel is never blank
     * without explanation.
     * @param {string} panelId Panel id.
     * @param {PanelGeometry} geo Panel geometry.
     * @param {number} py Slide-adjusted top edge.
     * @param {number} alpha Panel opacity.
     * @param {boolean} isTop Focus flag (enables cursor drawing).
     * @private
     */
    _renderPanelContent(panelId, geo, py, alpha, isTop) {
        switch (panelId) {
            case PANEL_ID.INVENTORY:
                this._renderListPanel(geo, py, alpha, isTop, panelId,
                    this._readInventoryItems(),
                    (item) => `${item.glyph} ${item.name}${item.count > 1 ? ` x${item.count}` : ''}`,
                    () => COLOR_PANEL_TEXT,
                    '[UP/DOWN] browse   [ACTION] use');
                break;
            case PANEL_ID.QUEST_LOG:
                this._renderListPanel(geo, py, alpha, isTop, panelId,
                    this._readQuestItems(),
                    (item) => `${item.title}${item.objective ? ` — ${item.objective}` : ''}`,
                    (item) => QUEST_STATUS_COLORS[item.status] ?? COLOR_PANEL_TEXT,
                    '[UP/DOWN] browse   [ACTION] track');
                break;
            case PANEL_ID.SHOP:
                this._renderShopContent(geo, py, alpha, isTop);
                break;
            case PANEL_ID.PAUSE:
                this._renderPauseContent(geo, py, alpha);
                break;
            default:
                break;
        }
    }

    /**
     * Generic scrolling list renderer shared by inventory and quest log.
     * Layout rows inside the panel interior:
     *   row 0        column header / count summary
     *   rows 1..N    visible item window (scrolled)
     *   last row     key hint footer
     * The cursor marker '>' is drawn only for the focused panel, blinking
     * at 2 Hz on simulation time.
     * @param {PanelGeometry} geo Panel geometry.
     * @param {number} py Slide-adjusted top edge.
     * @param {number} alpha Panel opacity.
     * @param {boolean} isTop Focus flag.
     * @param {string} panelId Panel id (cursor/scroll state key).
     * @param {Array<Object>} items Normalized entries.
     * @param {(item: Object) => string} format Entry → row text.
     * @param {(item: Object) => number} colorOf Entry → packed color.
     * @param {string} footerHint Key hint line.
     * @private
     */
    _renderListPanel(geo, py, alpha, isTop, panelId, items, format, colorOf, footerHint) {
        const r = this._renderer;
        const grid = this._gridSize();
        const x = geo.innerX * grid.cellW;
        let y = py + geo.innerY * grid.cellH - geo.y0 * grid.cellH + geo.y0 * grid.cellH;
        // Interior top edge in px:
        y = (geo.y0 + 2) * grid.cellH + (py - geo.y0 * grid.cellH);

        /* Header summary. */
        r.drawString(x, y, `${items.length} entr${items.length === 1 ? 'y' : 'ies'}`,
            withAlpha(COLOR_TEXT_DIM, alpha));
        y += grid.cellH;

        if (items.length === 0) {
            r.drawString(x, y + grid.cellH, '— nothing attuned yet —',
                withAlpha(COLOR_TEXT_DIM, alpha));
        } else {
            const visible = this._panelVisibleRows(panelId);
            const scroll = this._scrolls.get(panelId) ?? 0;
            const cursor = this._cursors.get(panelId) ?? 0;
            const blinkOn = Math.floor(this._time * 2) % 2 === 0;
            const maxChars = geo.innerCols - 2;

            for (let i = 0; i < visible && scroll + i < items.length; i += 1) {
                const index = scroll + i;
                const item = items[index];
                const selected = isTop && index === cursor;
                const marker = selected ? `${String.fromCodePoint(GLYPH_CURSOR)} ` : '  ';
                let text = marker + format(item);
                if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
                const color = selected && blinkOn
                    ? COLOR_PANEL_TITLE
                    : colorOf(item);
                r.drawString(x, y, text, withAlpha(color, alpha));
                y += grid.cellH;
            }
        }

        /* Footer hint pinned to the interior bottom row. */
        const footerY = (geo.y0 + geo.rows - 3) * grid.cellH + (py - geo.y0 * grid.cellH);
        r.drawString(x, footerY, footerHint, withAlpha(COLOR_TEXT_DIM, alpha));
    }

    /**
     * Shop renderer: stock list with prices, affordability coloring, and a
     * wallet readout in the top-right corner of the frame. Prices render
     * red when they exceed the player's currency, so a broke custodian
     * sees exactly why the keeper shakes their head.
     * @param {PanelGeometry} geo Panel geometry.
     * @param {number} py Slide-adjusted top edge.
     * @param {number} alpha Panel opacity.
     * @param {boolean} isTop Focus flag.
     * @private
     */
    _renderShopContent(geo, py, alpha, isTop) {
        const r = this._renderer;
        const grid = this._gridSize();
        const x = (geo.x0 + 2) * grid.cellW;
        let y = (geo.y0 + 2) * grid.cellH + (py - geo.y0 * grid.cellH);
        const panelId = PANEL_ID.SHOP;

        /* Wallet readout. */
        const wallet = finiteOr(this._player ? this._player.currency : 0, 0);
        const currencyName = this._shop && typeof this._shop.currencyName === 'string'
            ? this._shop.currencyName
            : 'orange scrip';
        const walletText = `purse: ${wallet} ${currencyName}`;
        const walletX = (geo.x0 + geo.cols - 2) * grid.cellW - r.measureString(walletText).width;
        r.drawString(walletX, y - grid.cellH, walletText, withAlpha(COLOR_CURRENCY, alpha));

        const items = this._readShopItems();
        if (!this._shop) {
            r.drawString(x, y + grid.cellH, 'The cart is nowhere in sight.',
                withAlpha(COLOR_TEXT_DIM, alpha));
            return;
        }
        if (items.length === 0) {
            r.drawString(x, y + grid.cellH, '— the keeper sold out —',
                withAlpha(COLOR_TEXT_DIM, alpha));
            return;
        }

        const visible = this._panelVisibleRows(panelId);
        const scroll = this._scrolls.get(panelId) ?? 0;
        const cursor = this._cursors.get(panelId) ?? 0;
        const blinkOn = Math.floor(this._time * 2) % 2 === 0;
        const maxChars = geo.innerCols - 10;

        y += grid.cellH;
        for (let i = 0; i < visible && scroll + i < items.length; i += 1) {
            const index = scroll + i;
            const item = items[index];
            const selected = isTop && index === cursor;
            const affordable = item.price <= wallet;
            const marker = selected ? `${String.fromCodePoint(GLYPH_CURSOR)} ` : '  ';
            let name = `${marker}${item.glyph} ${item.name}`;
            if (name.length > maxChars) name = `${name.slice(0, maxChars - 1)}…`;
            const nameColor = selected && blinkOn ? COLOR_PANEL_TITLE : COLOR_PANEL_TEXT;
            r.drawString(x, y, name, withAlpha(nameColor, alpha));
            const priceText = `${item.price}c`;
            const priceX = (geo.x0 + geo.cols - 3) * grid.cellW - r.measureString(priceText).width;
            r.drawString(priceX, y, priceText,
                withAlpha(affordable ? COLOR_CURRENCY : COLOR_HP_LOW, alpha));
            y += grid.cellH;
        }

        const footerY = (geo.y0 + geo.rows - 3) * grid.cellH + (py - geo.y0 * grid.cellH);
        r.drawString(x, footerY, '[UP/DOWN] browse   [ACTION] buy',
            withAlpha(COLOR_TEXT_DIM, alpha));
    }

    /**
     * Pause menu content: title flavor line, the full control scheme as
     * static reference text, and resume instructions. Deliberately calm —
     * the Drab World is stressful enough.
     * @param {PanelGeometry} geo Panel geometry.
     * @param {number} py Slide-adjusted top edge.
     * @param {number} alpha Panel opacity.
     * @private
     */
    _renderPauseContent(geo, py, alpha) {
        const r = this._renderer;
        const grid = this._gridSize();
        const x = (geo.x0 + 2) * grid.cellW;
        let y = (geo.y0 + 2) * grid.cellH + (py - geo.y0 * grid.cellH);

        const lines = [
            { text: 'Time waits for you, custodian.', color: COLOR_PANEL_TITLE },
            { text: '', color: COLOR_PANEL_TEXT },
            { text: 'WASD / ARROWS   move', color: COLOR_PANEL_TEXT },
            { text: 'SHIFT           sprint (drains oranges)', color: COLOR_PANEL_TEXT },
            { text: 'SPACE           act / dodge', color: COLOR_PANEL_TEXT },
            { text: 'E               interact', color: COLOR_PANEL_TEXT },
            { text: 'I / Q           satchel / loom records', color: COLOR_PANEL_TEXT },
            { text: 'ESC             resume the hour', color: COLOR_TEXT_DIM }
        ];
        for (let i = 0; i < lines.length && i < geo.innerRows; i += 1) {
            if (lines[i].text.length > 0) {
                r.drawString(x, y, lines[i].text, withAlpha(lines[i].color, alpha));
            }
            y += grid.cellH;
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — DIALOGUE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the NPC dialogue frame, bottom-anchored: speaker tab, the
     * typewriter-revealed line (NPC advances it; UIManager only presents),
     * page indicator, then either the blinking continue marker or the
     * choice list with the NPC's current selection highlighted. Box height
     * adapts to the choice count and clamps to the viewport.
     * @param {DialogueView} view Dialogue snapshot.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @private
     */
    _drawDialogue(view, grid) {
        const r = this._renderer;

        /* Box sizing: speaker + 3 text rows + choices/continue + padding. */
        const cols = Math.min(DIALOGUE_MAX_CELLS, grid.columns - 4);
        const choiceRows = view.choices && view.choices.length > 0 ? view.choices.length : 1;
        const rows = Math.min(grid.rows - 2, 4 + choiceRows + 2);
        const x0 = Math.floor((grid.columns - cols) / 2);
        const y0 = Math.max(1, grid.rows - rows - 1);
        const px = x0 * grid.cellW;
        const py = y0 * grid.cellH;

        /* Frame slab + border. */
        r.drawRect(px, py, cols * grid.cellW, rows * grid.cellH, COLOR_PANEL_BG);
        const H = String.fromCodePoint(GLYPH_FRAME_H);
        const V = String.fromCodePoint(GLYPH_FRAME_V);
        r.drawString(px, py,
            String.fromCodePoint(GLYPH_FRAME_TL) + H.repeat(cols - 2) + String.fromCodePoint(GLYPH_FRAME_TR),
            COLOR_DIALOGUE_FRAME);
        for (let row = 1; row < rows - 1; row += 1) {
            r.drawString(px, py + row * grid.cellH, V, COLOR_DIALOGUE_FRAME);
            r.drawString(px + (cols - 1) * grid.cellW, py + row * grid.cellH, V, COLOR_DIALOGUE_FRAME);
        }
        r.drawString(px, py + (rows - 1) * grid.cellH,
            String.fromCodePoint(GLYPH_FRAME_BL) + H.repeat(cols - 2) + String.fromCodePoint(GLYPH_FRAME_BR),
            COLOR_DIALOGUE_FRAME);

        /* Speaker tab overlapping the top border. */
        const speaker = ` ${view.speaker || 'Voice'} `;
        const tabX = px + 2 * grid.cellW;
        r.drawString(tabX, py, speaker, COLOR_DIALOGUE_SPEAKER, COLOR_PANEL_BG);

        /* Typewriter text, wrapped and clipped to three rows. */
        const innerCols = cols - 4;
        const lines = this._wrapText(view.visibleText || '…', innerCols);
        const textTop = py + 2 * grid.cellH;
        for (let i = 0; i < lines.length && i < 3; i += 1) {
            r.drawString(px + 2 * grid.cellW, textTop + i * grid.cellH,
                lines[i], COLOR_DIALOGUE_TEXT);
        }

        /* Page indicator, top-right inside the frame. */
        if (view.lineCount > 1) {
            const page = `${view.lineIndex + 1}/${view.lineCount}`;
            r.drawString(px + (cols - 2) * grid.cellW - r.measureString(page).width,
                py + grid.cellH, page, COLOR_TEXT_DIM);
        }

        /* Choices or continue marker. */
        const choiceTop = textTop + 3 * grid.cellH;
        if (view.choices && view.choices.length > 0) {
            for (let i = 0; i < view.choices.length && i < rows - 7; i += 1) {
                const choice = view.choices[i];
                const marker = choice.selected
                    ? `${String.fromCodePoint(GLYPH_CURSOR)} `
                    : '  ';
                const color = choice.selected ? COLOR_PANEL_TITLE : COLOR_PANEL_TEXT;
                let label = marker + choice.label;
                if (label.length > innerCols) label = `${label.slice(0, innerCols - 1)}…`;
                r.drawString(px + 2 * grid.cellW, choiceTop + i * grid.cellH, label, color);
            }
        } else if (view.lineComplete) {
            const blinkOn = Math.floor(this._time * 2.5) % 2 === 0;
            if (blinkOn) {
                r.drawString(
                    px + (cols - 4) * grid.cellW,
                    choiceTop,
                    String.fromCodePoint(GLYPH_CONTINUE),
                    COLOR_DIALOGUE_FRAME
                );
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — TRANSIENT EFFECTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Draws the toast column top-right. Each toast is a background slab,
     * an accent left rail, and wrapped text lines. The envelope (see header)
     * drives both alpha and a horizontal glide-in from the right edge.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @private
     */
    _drawToasts(grid) {
        const r = this._renderer;
        const boxW = TOAST_WIDTH_CELLS * grid.cellW;
        let cursorY = 2 * grid.cellH;

        for (let i = 0; i < this._toasts.length; i += 1) {
            const toast = this._toasts[i];
            const age = this._time - toast.born;
            const total = toast.fadeIn + toast.hold + toast.fadeOut;
            if (age >= total) continue;

            /* Envelope alpha per header formula. */
            let alpha;
            if (age < toast.fadeIn) alpha = age / toast.fadeIn;
            else if (age < toast.fadeIn + toast.hold) alpha = 1;
            else alpha = 1 - (age - toast.fadeIn - toast.hold) / toast.fadeOut;
            alpha = clamp01(alpha);

            /* Glide-in: slides left from off-screen over the fade-in phase. */
            const glide = (1 - easeOutCubic(clamp01(age / toast.fadeIn))) * (boxW + grid.cellW);
            const boxH = (toast.lines.length + 2) * grid.cellH;
            const boxX = grid.columns * grid.cellW - boxW - grid.cellW + glide;

            r.drawRect(boxX, cursorY, boxW, boxH, withAlpha(COLOR_PANEL_BG, alpha * 0.9));
            r.drawRect(boxX, cursorY, Math.max(2, grid.cellW * 0.35), boxH, withAlpha(toast.fg, alpha));

            for (let line = 0; line < toast.lines.length; line += 1) {
                r.drawString(
                    boxX + grid.cellW,
                    cursorY + (line + 1) * grid.cellH,
                    toast.lines[line],
                    withAlpha(COLOR_PANEL_TEXT, alpha)
                );
            }
            cursorY += boxH + grid.cellH * 0.5;
        }
    }

    /**
     * Draws world-anchored floating texts rising with an ease-out drift and
     * fading over their final 40% of life. Positions were projected to
     * screen space at spawn; no camera sampling happens here, so the pass
     * stays cheap even mid-screen-shake.
     * @private
     */
    _drawFloating() {
        const r = this._renderer;
        for (let i = 0; i < this._floating.length; i += 1) {
            const f = this._floating[i];
            const age = this._time - f.born;
            const progress = clamp01(age / f.life);
            const drift = f.rise * easeOutCubic(progress);
            /* Fade over the last 40% of the lifetime. */
            const fadeStart = 0.6;
            const alpha = progress < fadeStart
                ? 1
                : 1 - smoothstep((progress - fadeStart) / (1 - fadeStart));
            if (alpha <= 0.01) continue;
            const size = r.measureString(f.text);
            r.drawString(f.worldX - size.width / 2, f.worldY - drift, f.text, withAlpha(f.fg, alpha));
        }
    }

    /**
     * Draws the active announcement banner (queue head) centered at ~35%
     * viewport height with decorative rails and an optional sub-line.
     * Envelope: 0.25 s fade-in, hold, 0.5 s fade-out with a gentle eased
     * upward drift of one cell.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @private
     */
    _drawAnnouncement(grid) {
        if (this._announceQueue.length === 0) return;
        const banner = this._announceQueue[0];
        const r = this._renderer;
        const age = this._time - banner.born;
        if (age >= ANNOUNCE_LIFE) return;

        const fadeIn = 0.25;
        const fadeOut = 0.5;
        let alpha;
        if (age < fadeIn) alpha = easeOutCubic(age / fadeIn);
        else if (age > ANNOUNCE_LIFE - fadeOut) alpha = clamp01((ANNOUNCE_LIFE - age) / fadeOut);
        else alpha = 1;

        const drift = easeInOutCubic(clamp01(age / ANNOUNCE_LIFE)) * grid.cellH;
        const text = `✦──  ${banner.text}  ──✦`;
        const size = r.measureString(text);
        const x = Math.max(0, (grid.columns * grid.cellW - size.width) / 2);
        const y = grid.rows * grid.cellH * 0.35 - drift;

        r.drawString(x, y, text, withAlpha(banner.fg, alpha));
        if (banner.sub) {
            const subSize = r.measureString(banner.sub);
            r.drawString(
                Math.max(0, (grid.columns * grid.cellW - subSize.width) / 2),
                y + grid.cellH * 1.2,
                banner.sub,
                withAlpha(COLOR_PANEL_TEXT, alpha * 0.85)
            );
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER INTERNALS — REALITY TRANSITION OVERLAY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents the Dream↔Drab transition signal sourced from WorldManager:
     *   fade style    → full-viewport black obscuration scaled by status.fade
     *   flicker style → deterministic glitch bands + scanline slabs + glyph
     *                   sparkles scaled by status.flicker.
     * Both signals are pure functions of simulation time, so catch-up ticks
     * reproduce identical glitches. Drawn LAST: reality outranks interface.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @private
     */
    _drawTransitionOverlay(grid) {
        if (!this._worldManager ||
            typeof this._worldManager.getTransitionStatus !== 'function') {
            return;
        }
        let status;
        try {
            status = this._worldManager.getTransitionStatus();
        } catch (error) {
            return; // Transition telemetry is cosmetic; never break the frame.
        }
        if (!status || !status.active) return;

        const r = this._renderer;
        const viewW = grid.columns * grid.cellW;
        const viewH = grid.rows * grid.cellH;

        /* Fade-style transitions (Drab → Dream): smooth obscuration. */
        if (status.fade > 0.001) {
            r.drawRect(0, 0, viewW, viewH,
                withAlpha(0x000000FF, clamp01(status.fade) * 0.97));
        }

        /* Flicker-style transitions (Dream → Drab): glitch interference. */
        if (status.flicker > 0.001) {
            const intensity = clamp01(status.flicker);
            const t = this._time;

            /* Full-frame static wash, breathing with the beat interference. */
            r.drawRect(0, 0, viewW, viewH,
                withAlpha(0xEAF2FFFF, intensity * 0.08 + 0.04 * flickerNoise(t * 2.2)));

            /* Horizontal glitch bands: count scales with intensity; each
             * band's row and jitter derive from offset noise samples so the
             * pattern never visibly loops yet stays deterministic. */
            const bands = Math.floor(intensity * 8);
            for (let b = 0; b < bands; b += 1) {
                const rowNoise = flickerNoise(t * 1.7 + b * 13.7);
                const bandRow = Math.floor(rowNoise * grid.rows);
                const jitterCells = (flickerNoise(t * 2.9 + b * 5.1) - 0.5) * 8;
                const bandY = bandRow * grid.cellH;
                r.drawRect(jitterCells * grid.cellW, bandY, viewW, grid.cellH * 0.6,
                    withAlpha(0x9ad7ffFF, intensity * 0.16));
            }

            /* Glyph sparkles: stray density characters scattered by noise. */
            const sparkles = Math.floor(intensity * 12);
            for (let s = 0; s < sparkles; s += 1) {
                const nx = flickerNoise(t * 3.3 + s * 7.9);
                const ny = flickerNoise(t * 2.1 + s * 11.3);
                const glyph = GLITCH_GLYPHS[Math.floor(nx * GLITCH_GLYPHS.length) % GLITCH_GLYPHS.length];
                r.drawString(
                    nx * viewW,
                    Math.floor(ny * grid.rows) * grid.cellH,
                    String.fromCodePoint(glyph),
                    withAlpha(0xFFFFFFFF, intensity * 0.5)
                );
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       UTILITIES
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Greedy word wrap into lines of at most maxChars characters. Words
     * longer than the measure are hard-sliced so a runaway item name can
     * never overflow a toast or dialogue frame.
     * @param {string} text Source text.
     * @param {number} maxChars Maximum characters per line (>= 1).
     * @returns {string[]} Wrapped lines (at least one, possibly empty).
     * @private
     */
    _wrapText(text, maxChars) {
        const width = Math.max(1, Math.floor(maxChars));
        const words = String(text).split(/\s+/).filter((w) => w.length > 0);
        const lines = [];
        let line = '';
        const pushWord = (word) => {
            let remaining = word;
            while (remaining.length > width) {
                lines.push(remaining.slice(0, width));
                remaining = remaining.slice(width);
            }
            return remaining;
        };
        for (const word of words) {
            if (word.length > width) {
                if (line) {
                    lines.push(line);
                    line = '';
                }
                line = pushWord(word);
                continue;
            }
            if (line && line.length + 1 + word.length > width) {
                lines.push(line);
                line = word;
            } else {
                line = line ? `${line} ${word}` : word;
            }
        }
        lines.push(line);
        return lines.length > 0 ? lines : [''];
    }

    /* ══════════════════════════════════════════════════════════════════
       DIAGNOSTICS & LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Diagnostic snapshot for the debug HUD. Allocates one object; poll at
     * HUD rate (4–10 Hz), not per tick.
     * @returns {Object}
     */
    getMetrics() {
        return {
            time: this._time,
            openPanels: [...this._stack],
            topPanel: this.getTopPanelId(),
            blocking: this.hasBlockingPanel(),
            dialogueOpen: this.isDialogueOpen(),
            toasts: this._toasts.length,
            floating: this._floating.length,
            announceQueue: this._announceQueue.length,
            hint: this._hint,
            lifetime: { ...this._metrics }
        };
    }

    /**
     * Tears down the manager: detaches every provider, clears all state,
     * and drops listeners. Matches the InputManager teardown contract for
     * clean hot-module reloads and test isolation. The instance must not
     * be reused after destroy().
     * @returns {void}
     */
    destroy() {
        this._player = null;
        this._questSystem = null;
        this._inventory = null;
        this._shop = null;
        this._camera = null;
        this._worldManager = null;
        this._dialogueView = null;
        this._hint = null;
        this._stack.length = 0;
        this._cursors.clear();
        this._scrolls.clear();
        this._openedAt.clear();
        this.clearNotifications();
        this._listeners.clear();
    }
}

export default UIManager;