/**
 * @file src/ui/DialogueBox.js
 * @module ui/DialogueBox
 * @description
 * Typewriter dialogue presentation and conversation input authority for
 * "YUCCA".
 *
 * DialogueBox is the screen-space UI face of every NPC conversation: it
 * frames the speaker in ASCII, streams dialogue text character by
 * character on the simulation clock, renders branching choices, and owns
 * the keyboard/mouse interaction for the whole exchange. It draws through
 * the Renderer's screen-space API (drawString / drawRect), so dialogue is
 * anchored to the viewport — never scrolled, shaken, or palette-collapsed
 * with the world. During a Dream→Drab shift the conversation box keeps its
 * color identity while the city drains around it, which is exactly the
 * "interface outranks reality" layering contract UIManager documents.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STATE MACHINE
 * ───────────────────────────────────────────────────────────────────────────
 * Four states, exactly as the conversation feels:
 *
 *                    present(view) / presentLines()
 *     ┌──────┐ ──────────────────────────────────────► ┌─────────┐
 *     │ IDLE │                                         │ TYPING  │◄─┐
 *     └──────┘                                         └─────────┘  │
 *         ▲                                                │        │ next line
 *         │ reset()                        line complete   │        │ (script mode)
 *         │                                                ▼        │
 *     ┌────────┐   close()/abort     ┌──────────────────────────┐  │
 *     │ CLOSED │ ◄────────────────── │      AWAITING_INPUT      │ ─┘
 *     └────────┘                     │ (continue prompt OR      │
 *                                    │  interactive choice list)│
 *                                    └──────────────────────────┘
 *
 *     IDLE           Box hidden; present() is accepted.
 *     TYPING         Characters stream at charsPerSecond × multiplier.
 *                    ACTION taps fast-forward; SPRINT hold accelerates.
 *     AWAITING_INPUT Line complete. Two sub-modes share the state:
 *                      continue mode  → blinking ▼, ACTION/click advances
 *                      choice mode    → navigable response list
 *     CLOSED         Box hidden after close()/abort; present() reopens.
 *
 * Every transition broadcasts 'statechange' {from, to} plus the targeted
 * events listed below, so audio, analytics, and quest systems can react
 * without polling.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TYPEWRITER TIMING MODEL (DETERMINISTIC, SIMULATION-CLOCKED)
 * ───────────────────────────────────────────────────────────────────────────
 * Reveal is delta-time driven, NOT wall-clock or Promise-based: a Promise
 * chain would drift against the fixed timestep and desynchronize from
 * catch-up bursts. Instead the box integrates character debt:
 *
 *     accumulator += charsPerSecond · dt · multiplier
 *     revealed     = floor(accumulator)
 *
 * multiplier is 1 normally, options.fastForwardMultiplier while SPRINT is
 * held, and effectively infinite for skipLine() (which dumps the whole
 * line in one tick). Because the integrator runs inside update(dt), a
 * lag-spike frame that consumes three ticks reveals exactly three ticks'
 * worth of text — the reveal rate is tick-deterministic on every display,
 * matching the engine-wide determinism policy (GameLoop, WeatherSystem,
 * WorldManager flicker noise).
 *
 * Audio tick hooks fire as characters cross the reveal frontier. The hook
 * is throttled two ways to keep synthesis cheap at high speeds:
 *   1. whitespace characters are skipped by default (a space typing sound
 *      reads as noise, not speech),
 *   2. only every Nth revealed character fires (options.tickEvery).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ASCII FRAME COMPOSITION (CELL-SPACE LAYOUT MATH)
 * ───────────────────────────────────────────────────────────────────────────
 * All geometry is derived in CELL units from the Renderer's live grid,
 * then multiplied by measured cell metrics, so the frame always lands on
 * the monospaced raster. The box is bottom-anchored and centered:
 *
 *     cols      = min(maxCols, gridColumns − 4)
 *     textCols  = cols − portraitWidth − 6          (rails + pads + divider)
 *     rows      = 1(top) + textRows + (choices ? 1+C+1 : 1) + 1(bottom)
 *     x0        = floor((gridColumns − cols) / 2)
 *     y0        = gridRows − rows − 1               (one cell above edge)
 *
 * Composition of the frame, row by row:
 *
 *     +--[ Mender Ira ]·····················2/4+      top border, speaker
 *     |  ┌───┐   The stitches of this hour    |      portrait column +
 *     |  │ M │   are loose, traveler.         |      wrapped text area
 *     |  └───┘                                |
 *     +----------------------------------------------+   choice divider
 *     |  > I'll seal the tear.                 |      choice rows
 *     |    Not yet.                            |
 *     |  [W/S] choose  [SPACE] confirm  [ESC] end |   hint row
 *     +----------------------------------------------+
 *
 * The speaker tab is inset into the top border:  +--[ NAME ]  + dashes.
 * NAME is truncated with '…' when it overflows, and its color encodes the
 * speaker's side: warm orange for NPCs, cool cyan for the player, pale
 * gray for system voices (see SPEAKER_KIND). The portrait column carries
 * the speaker's signature glyph with a slow alpha pulse while they talk.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INPUT OWNERSHIP RULES
 * ───────────────────────────────────────────────────────────────────────────
 * While a DialogueBox is presented, IT is the sole consumer of conversation
 * input. handleInput(input) returns whether an edge was consumed; the
 * recommended WorldManager wiring is:
 *
 *     if (npc.inDialogue) {
 *         dialogueBox.present(npc.getDialogueView());
 *         dialogueBox.handleInput(input);   // owns ACTION/UP/DOWN/ESC/mouse
 *     }
 *
 * DialogueBox never touches NPC internals. It broadcasts intent:
 *     'advance'         continue mode confirmed → owner calls
 *                       npc.advanceDialogue() and re-presents the view
 *     'optionselected'  choice confirmed with {index, label} → owner syncs
 *                       the NPC cursor (see syncChoiceCursor) and advances
 *     'abort'           ESC pressed → owner calls npc.endDialogue('closed')
 *
 * NPC views arrive via present(view) every tick. The box detects a NEW
 * line by fingerprint (nodeId:lineIndex) and resets the typewriter; an
 * unchanged fingerprint is a no-op, so per-tick re-presentation is cheap
 * and idempotent.
 *
 * MOUSE: hit rectangles are computed during render() and consumed by the
 * NEXT tick's update(). A one-frame staleness window is intentional and
 * invisible at 60 Hz; the alternative (layout during update) would force
 * the box to pre-guess its own wrapped text. Hover moves the choice
 * cursor; left-click confirms (or skips typing / advances continue mode).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO DRIVING MODES
 * ───────────────────────────────────────────────────────────────────────────
 * driven  present(npc.getDialogueView()) each tick. The NPC module owns
 *         the dialogue GRAPH; DialogueBox owns the presentation clock.
 *         Recommended: construct NPCs with a very high charsPerSecond so
 *         the NPC's internal reveal never races the box's typewriter.
 * script  presentLines(speaker, lines, options) for cutscenes, signs, and
 *         lore tablets that have no NPC behind them. The box then owns
 *         line progression itself and fires 'complete' when the script
 *         ends.
 *
 * @example
 * const dialogue = new DialogueBox(renderer, {
 *     charsPerSecond: 55,
 *     playerName: player.name,
 *     onCharTyped: ({ char }) => audio.tickDialogue(char),
 *     onOptionSelected: ({ index, label }) => questLog.noteChoice(label)
 * });
 *
 * dialogue.addEventListener('advance', () => {
 *     if (!ira.advanceDialogue()) ira.endDialogue('terminal');
 * });
 * dialogue.addEventListener('optionselected', ({ index }) => {
 *     DialogueBox.syncChoiceCursor(ira, index);
 *     ira.advanceDialogue();
 * });
 * dialogue.addEventListener('abort', () => ira.endDialogue('closed'));
 *
 * // Per fixed tick (WorldManager):
 * if (ira.inDialogue) {
 *     dialogue.present(ira.getDialogueView());
 *     dialogue.handleInput(input);
 * }
 * // Per presentation frame, after world + HUD:
 * dialogue.render(alpha);
 */

import { ASCIIBuffer } from '../engine/ASCIIBuffer.js';
import { MOUSE_BUTTON } from '../engine/InputManager.js';

/* ══════════════════════════════════════════════════════════════════════════
   ENUMERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dialogue box lifecycle states (see header state diagram).
 * @enum {string}
 */
export const DIALOGUE_BOX_STATE = Object.freeze({
    IDLE: 'IDLE',
    TYPING: 'TYPING',
    AWAITING_INPUT: 'AWAITING_INPUT',
    CLOSED: 'CLOSED'
});

/**
 * Speaker side classification. Drives name-tab and portrait coloring so
 * the player always reads at a glance WHO is speaking.
 * @enum {string}
 */
export const SPEAKER_KIND = Object.freeze({
    NPC: 'NPC',
    PLAYER: 'PLAYER',
    SYSTEM: 'SYSTEM'
});

/**
 * AWAITING_INPUT sub-modes: a bare continue prompt vs. a choice list.
 * Kept as an internal flavor of the state rather than a fifth state so
 * external consumers see exactly the four contract states.
 * @enum {string}
 */
const AWAIT_MODE = Object.freeze({
    CONTINUE: 'CONTINUE',
    CHOICES: 'CHOICES'
});

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — LAYOUT, TIMING, GLYPHS, COLORS
   ══════════════════════════════════════════════════════════════════════════ */

/** Default typewriter reveal speed, characters per simulated second. */
const DEFAULT_CHARS_PER_SECOND = 45;

/** Reveal multiplier applied while the SPRINT action is held. */
const DEFAULT_FAST_FORWARD_MULTIPLIER = 3;

/** Default box width ceiling in grid cells. */
const DEFAULT_MAX_COLS = 76;

/** Portrait column width in cells (frame + padding around the glyph). */
const DEFAULT_PORTRAIT_WIDTH = 5;

/** Maximum wrapped text rows shown before truncation. */
const DEFAULT_TEXT_ROWS = 4;

/** Frame glyph code points — pure ASCII per the project's frame style. */
const GLYPH_CORNER = 0x2B;   // '+'
const GLYPH_HORIZ = 0x2D;    // '-'
const GLYPH_VERT = 0x7C;     // '|'
const GLYPH_CURSOR = 0x3E;   // '>'
const GLYPH_CONTINUE = 0x25BC; // '▼'

/** Packed palette (packed once at module load, alpha-aware end to end). */
const COLOR_BACKDROP = ASCIIBuffer.packColor('rgba(8, 10, 16, 0.92)');
const COLOR_FRAME = ASCIIBuffer.packColor('#6d7c8c');
const COLOR_TEXT = ASCIIBuffer.packColor('#f4ecdc');
const COLOR_TEXT_DIM = ASCIIBuffer.packColor('#8a97a6');
const COLOR_NAME_NPC = ASCIIBuffer.packColor('#ff9e3d');
const COLOR_NAME_PLAYER = ASCIIBuffer.packColor('#7fd4ff');
const COLOR_NAME_SYSTEM = ASCIIBuffer.packColor('#d7e3ee');
const COLOR_PORTRAIT_NPC = ASCIIBuffer.packColor('#ffb057');
const COLOR_PORTRAIT_PLAYER = ASCIIBuffer.packColor('#9ad7ff');
const COLOR_PORTRAIT_SYSTEM = ASCIIBuffer.packColor('#c2cdd8');
const COLOR_CHOICE = ASCIIBuffer.packColor('#d7e3ee');
const COLOR_CHOICE_SELECTED = ASCIIBuffer.packColor('#ffe9c4');
const COLOR_CHOICE_SELECTED_BG = ASCIIBuffer.packColor('rgba(255, 158, 61, 0.10)');
const COLOR_CHOICE_HOVER_BG = ASCIIBuffer.packColor('rgba(255, 158, 61, 0.20)');
const COLOR_CONTINUE = ASCIIBuffer.packColor('#ffd27f');
const COLOR_PAGE = ASCIIBuffer.packColor('#8a97a6');

/** Portrait idle pulse: frequency Hz and minimum alpha at the trough. */
const PORTRAIT_PULSE_HZ = 0.6;
const PORTRAIT_PULSE_MIN_ALPHA = 0.78;

/** Continue-marker blink rate in Hz (simulation-clocked). */
const CONTINUE_BLINK_HZ = 2.4;

/* ══════════════════════════════════════════════════════════════════════════
   PURE HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Scales the alpha byte of a packed RGBA color. The Renderer converts
 * packed alpha into rgba() CSS strings, which canvas fillText/fillRect
 * honor natively — the portrait pulse and hover washes fade through this
 * without any globalAlpha state churn.
 * @param {number} packed Packed RGBA color.
 * @param {number} alpha Multiplier in [0, 1].
 * @returns {number} New packed RGBA color.
 */
function withAlpha(packed, alpha) {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const src = packed >>> 0;
    const outAlpha = Math.round((src & 0xFF) * a);
    return ((src & 0xFFFFFF00) | (outAlpha & 0xFF)) >>> 0;
}

/**
 * Greedy word wrap into lines of at most maxChars characters. Words
 * longer than the measure are hard-sliced so a runaway speaker name or
 * lore line can never overflow the frame.
 * @param {string} text Source text.
 * @param {number} maxChars Maximum characters per line (>= 1).
 * @returns {string[]} Wrapped lines; [''] for empty input.
 */
function wrapText(text, maxChars) {
    const width = Math.max(1, Math.floor(maxChars));
    const words = String(text).split(/\s+/).filter((w) => w.length > 0);
    const lines = [];
    let line = '';
    const sliceWord = (word) => {
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
            line = sliceWord(word);
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

/**
 * Point-in-rectangle test for mouse hit-testing.
 * @param {{x: number, y: number}} point CSS-pixel point.
 * @param {{x: number, y: number, w: number, h: number}} rect Rectangle.
 * @returns {boolean}
 */
function pointInRect(point, rect) {
    return point.x >= rect.x && point.x < rect.x + rect.w &&
        point.y >= rect.y && point.y < rect.y + rect.h;
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dialogue view snapshot, compatible with NPC.getDialogueView() plus
 * optional presentation extensions DialogueBox understands.
 * @typedef {Object} DialogueView
 * @property {boolean} active Whether a conversation is open.
 * @property {string} [speaker] Display name for the frame tab.
 * @property {string} [speakerGlyph] Signature glyph for the portrait.
 * @property {string} [speakerKind] SPEAKER_KIND override; inferred when absent.
 * @property {string} [nodeId] Dialogue node id (fingerprint component).
 * @property {number} [lineIndex] Current line index within the node.
 * @property {number} [lineCount] Total lines in the node.
 * @property {string} [fullLine] Full line text — the typewriter source of truth.
 * @property {string} [visibleText] Fallback text source when fullLine is absent.
 * @property {Array<{label: string, selected: boolean}>} [choices]
 */

/**
 * Resolved per-frame layout in both cell and pixel space. Built in
 * render(), cached for the next tick's mouse hit-testing.
 * @typedef {Object} DialogueLayout
 * @property {number} cols Box width in cells.
 * @property {number} rows Box height in cells.
 * @property {number} px Box left edge in CSS pixels.
 * @property {number} py Box top edge in CSS pixels.
 * @property {number} wPx Box width in CSS pixels.
 * @property {number} hPx Box height in CSS pixels.
 * @property {number} textX Text-area left column in cells.
 * @property {number} textCols Text-area width in cells.
 * @property {number} textTopRow First text row (absolute grid row).
 * @property {Array<{index: number, x: number, y: number, w: number, h: number}>} choiceRects
 * @property {{x: number, y: number, w: number, h: number}} boxRect
 */

/* ══════════════════════════════════════════════════════════════════════════
   DIALOGUE BOX
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Typewriter dialogue presenter: ASCII framing, simulation-clocked text
 * reveal, branching choice UI, and conversation input authority. See the
 * file header for the state machine, timing model, layout math, and the
 * input ownership contract with NPC/WorldManager.
 */
export class DialogueBox {
    /**
     * @param {import('../engine/Renderer.js').Renderer} renderer
     *   Engine renderer; the box draws exclusively through its screen-space
     *   API and reads its live cell/viewport metrics every frame.
     * @param {Object} [options]
     * @param {number} [options.charsPerSecond=45] Typewriter reveal speed.
     * @param {number} [options.fastForwardMultiplier=3] SPRINT-hold multiplier.
     * @param {number} [options.maxCols=76] Box width ceiling in cells.
     * @param {number} [options.portraitWidth=5] Portrait column width, cells.
     * @param {number} [options.textRows=4] Maximum wrapped text rows shown.
     * @param {number} [options.tickEvery=1] Audio tick fires every Nth char.
     * @param {boolean} [options.audioSkipWhitespace=true] Skip spaces for ticks.
     * @param {?string} [options.playerName=null] Player name for speaker inference.
     * @param {Function} [options.onStart] Conversation/line-start callback.
     * @param {Function} [options.onCharTyped] Audio tick hook ({char, index, total}).
     * @param {Function} [options.onLineComplete] Line finished ({skipped}).
     * @param {Function} [options.onOptionSelected] Choice confirmed ({index, label}).
     * @param {Function} [options.onComplete] Script-mode conversation finished.
     * @param {Function} [options.onClose] Box closed ({reason}).
     * @param {Function} [options.onStateChange] Any transition ({from, to}).
     * @throws {TypeError|RangeError} If the renderer or options are invalid.
     */
    constructor(renderer, options = {}) {
        if (!renderer ||
            typeof renderer.drawString !== 'function' ||
            typeof renderer.drawRect !== 'function' ||
            typeof renderer.measureString !== 'function') {
            throw new TypeError(
                '[DialogueBox] A Renderer with drawString/drawRect/measureString is required.'
            );
        }
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[DialogueBox] options must be an object.');
        }

        /** @type {import('../engine/Renderer.js').Renderer} */
        this._renderer = renderer;

        /* ---- Timing configuration ------------------------------------ */
        this.setTypingSpeed(options.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND);
        const multiplier = options.fastForwardMultiplier ?? DEFAULT_FAST_FORWARD_MULTIPLIER;
        if (!Number.isFinite(multiplier) || multiplier < 1) {
            throw new RangeError('[DialogueBox] fastForwardMultiplier must be >= 1.');
        }
        /** @type {number} Reveal multiplier while SPRINT is held. */
        this._fastForwardMultiplier = multiplier;

        /* ---- Layout configuration ------------------------------------- */
        const maxCols = options.maxCols ?? DEFAULT_MAX_COLS;
        if (!Number.isInteger(maxCols) || maxCols < 30) {
            throw new RangeError('[DialogueBox] maxCols must be an integer >= 30.');
        }
        /** @type {number} */
        this._maxCols = maxCols;
        const portraitWidth = options.portraitWidth ?? DEFAULT_PORTRAIT_WIDTH;
        if (!Number.isInteger(portraitWidth) || portraitWidth < 3) {
            throw new RangeError('[DialogueBox] portraitWidth must be an integer >= 3.');
        }
        /** @type {number} */
        this._portraitWidth = portraitWidth;
        const textRows = options.textRows ?? DEFAULT_TEXT_ROWS;
        if (!Number.isInteger(textRows) || textRows < 1 || textRows > 8) {
            throw new RangeError('[DialogueBox] textRows must be an integer in [1, 8].');
        }
        /** @type {number} */
        this._textRows = textRows;

        /* ---- Audio tick configuration ---------------------------------- */
        /** @type {number} Fire the audio tick every Nth revealed char. */
        this._tickEvery = Math.max(1, Math.floor(options.tickEvery ?? 1));
        /** @type {boolean} Skip whitespace characters for audio ticks. */
        this._audioSkipWhitespace = options.audioSkipWhitespace !== false;

        /** @type {?string} Player name for PLAYER speaker inference. */
        this._playerName = typeof options.playerName === 'string' ? options.playerName : null;

        /* ---- State machine ---------------------------------------------- */
        /** @type {string} Current DIALOGUE_BOX_STATE value. */
        this._state = DIALOGUE_BOX_STATE.IDLE;
        /** @type {string} AWAITING_INPUT sub-mode. */
        this._awaitMode = AWAIT_MODE.CONTINUE;
        /** @type {boolean} Driving mode: 'driven' (NPC views) or 'script'. */
        this._mode = 'driven';
        /** @type {number} Simulation clock, seconds (deterministic blinks). */
        this._time = 0;

        /* ---- Line model --------------------------------------------------- */
        /** @type {string} nodeId:lineIndex fingerprint of the typed line. */
        this._fingerprint = '';
        /** @type {string} Speaker display name. */
        this._speaker = 'Voice';
        /** @type {string} Speaker signature glyph. */
        this._speakerGlyph = 'N';
        /** @type {string} SPEAKER_KIND classification. */
        this._speakerKind = SPEAKER_KIND.NPC;
        /** @type {string[]} Wrapped lines of the current full text. */
        this._wrappedLines = [''];
        /** @type {string} Flattened wrapped text (reveal index space). */
        this._flatText = '';
        /** @type {number[]} Cumulative start offset of each wrapped line. */
        this._lineOffsets = [0];
        /** @type {number} Characters revealed so far. */
        this._revealed = 0;
        /** @type {number} Fractional character debt accumulator. */
        this._accumulator = 0;
        /** @type {number} Current line index within the node/script. */
        this._lineIndex = 0;
        /** @type {number} Total lines in the node/script. */
        this._lineCount = 1;

        /* ---- Choices -------------------------------------------------------- */
        /** @type {Array<{label: string}>} Active choice list. */
        this._choices = [];
        /** @type {number} Keyboard/mouse cursor position. */
        this._selection = 0;
        /** @type {number} Mouse hover index, or -1. */
        this._hoverIndex = -1;
        /**
         * Confirm latch: true from a choice confirm / advance until the next
         * view adoption, so a held key never double-fires intent at the owner.
         * @type {boolean}
         */
        this._awaitingOwner = false;

        /* ---- Script mode ------------------------------------------------------ */
        /** @type {Array<{speaker: string, glyph: string, kind: string, text: string}>} */
        this._scriptLines = [];
        /** @type {?Function} Script-mode advance hook (optional author callback). */
        this._scriptOnComplete = null;

        /* ---- Mouse hit-testing (populated by render) ----------------------------- */
        /** @type {?DialogueLayout} Last computed layout. */
        this._layout = null;

        /* ---- Events ---------------------------------------------------------------- */
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {boolean} Teardown flag. */
        this._destroyed = false;

        /* ---- Constructor callback bag → listener wiring ------------------------------ */
        const callbackKeys = [
            ['onStart', 'started'],
            ['onCharTyped', 'chartyped'],
            ['onLineComplete', 'linecomplete'],
            ['onOptionSelected', 'optionselected'],
            ['onComplete', 'complete'],
            ['onClose', 'closed'],
            ['onStateChange', 'statechange']
        ];
        for (const [optionKey, eventType] of callbackKeys) {
            if (options[optionKey] !== undefined) {
                if (typeof options[optionKey] !== 'function') {
                    throw new TypeError(
                        `[DialogueBox] ${optionKey} must be a function.`
                    );
                }
                this.addEventListener(eventType, options[optionKey]);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       CONFIGURATION
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Sets the typewriter reveal speed. Live-safe: the accumulator keeps
     * its fractional debt, so a mid-line speed change never re-reveals or
     * drops characters.
     * @param {number} charsPerSecond Reveal speed (> 0).
     * @returns {this}
     */
    setTypingSpeed(charsPerSecond) {
        if (!Number.isFinite(charsPerSecond) || charsPerSecond <= 0) {
            throw new RangeError('[DialogueBox] charsPerSecond must be positive.');
        }
        /** @type {number} */
        this._charsPerSecond = charsPerSecond;
        return this;
    }

    /** @returns {number} Current reveal speed, chars/second. */
    get charsPerSecond() {
        return this._charsPerSecond;
    }

    /**
     * Sets the player name used to infer PLAYER speaker kind when a view
     * does not declare one explicitly.
     * @param {?string} name Player display name, or null.
     * @returns {this}
     */
    setPlayerName(name) {
        this._playerName = typeof name === 'string' && name.length > 0 ? name : null;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PRESENTATION ADMISSION (DRIVEN + SCRIPT MODES)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents one NPC dialogue view snapshot. Call every simulation tick
     * while npc.inDialogue — admission is fingerprint-guarded, so repeated
     * presentation of the same line is a cheap no-op.
     *
     * A new fingerprint (nodeId:lineIndex) resets the typewriter and
     * adopts any choice list; an unchanged fingerprint only mirrors
     * NPC-side selection changes, so NPC.handleInput-driven menus and
     * DialogueBox-driven menus never fight.
     * @param {DialogueView} view View snapshot from NPC.getDialogueView().
     * @returns {boolean} True if the box is presented after this call.
     */
    present(view) {
        if (this._destroyed) return false;
        if (!view || view.active === false) {
            this.close('view-inactive');
            return false;
        }

        this._mode = 'driven';
        const nodeId = typeof view.nodeId === 'string' ? view.nodeId : view.speaker ?? 'node';
        const lineIndex = Number.isFinite(view.lineIndex) ? view.lineIndex : 0;
        const fingerprint = `${nodeId}:${lineIndex}`;

        /* Speaker identity (name, glyph, kind) refreshes every admission. */
        this._speaker = typeof view.speaker === 'string' && view.speaker.length > 0
            ? view.speaker
            : 'Voice';
        this._speakerGlyph = typeof view.speakerGlyph === 'string' && view.speakerGlyph.length > 0
            ? Array.from(view.speakerGlyph)[0]
            : 'N';
        this._speakerKind = this._classifySpeaker(view);

        if (fingerprint !== this._fingerprint) {
            /* NEW line: reset the typewriter and adopt fresh content. */
            const source = typeof view.fullLine === 'string' && view.fullLine.length > 0
                ? view.fullLine
                : (typeof view.visibleText === 'string' ? view.visibleText : '');
            this._fingerprint = fingerprint;
            this._lineIndex = lineIndex;
            this._lineCount = Number.isFinite(view.lineCount) ? Math.max(1, view.lineCount) : 1;
            this._adoptText(source);
            this._adoptChoices(view.choices ?? []);
            this._awaitingOwner = false;
            this._setState(DIALOGUE_BOX_STATE.TYPING);
            this._dispatch('started', {
                speaker: this._speaker,
                kind: this._speakerKind,
                lineIndex: this._lineIndex,
                lineCount: this._lineCount
            });
        } else {
            /* Same line: mirror external selection drift (NPC-side nav). */
            this._mirrorChoices(view.choices ?? []);
        }
        return true;
    }

    /**
     * Presents a standalone line script (signs, lore tablets, cutscenes
     * with no NPC owner). The box runs the line queue itself: advancing
     * past the last line closes the box and fires 'complete'.
     * @param {string} speaker Speaker display name.
     * @param {string[]} lines One or more line texts.
     * @param {Object} [options]
     * @param {string} [options.glyph='◈'] Speaker portrait glyph.
     * @param {string} [options.kind='SYSTEM'] SPEAKER_KIND value.
     * @returns {boolean} True if the script opened.
     */
    presentLines(speaker, lines, options = {}) {
        if (this._destroyed) return false;
        if (typeof speaker !== 'string' || speaker.length === 0) {
            throw new TypeError('[DialogueBox] speaker must be a non-empty string.');
        }
        if (!Array.isArray(lines) || lines.length === 0 ||
            !lines.every((line) => typeof line === 'string' && line.length > 0)) {
            throw new TypeError('[DialogueBox] lines must be a non-empty string array.');
        }

        this._mode = 'script';
        this._scriptLines = lines.map((text, i) => ({
            speaker,
            glyph: typeof options.glyph === 'string' && options.glyph.length > 0
                ? Array.from(options.glyph)[0]
                : '\u25C8',
            kind: Object.values(SPEAKER_KIND).includes(options.kind)
                ? options.kind
                : SPEAKER_KIND.SYSTEM,
            text
        }));
        this._lineCount = lines.length;
        this._lineIndex = 0;
        this._presentScriptLine();
        return true;
    }

    /**
     * Loads script-mode line i into the typewriter.
     * @private
     */
    _presentScriptLine() {
        const entry = this._scriptLines[this._lineIndex];
        this._speaker = entry.speaker;
        this._speakerGlyph = entry.glyph;
        this._speakerKind = entry.kind;
        this._fingerprint = `script:${this._lineIndex}`;
        this._adoptText(entry.text);
        this._adoptChoices([]);
        this._awaitingOwner = false;
        this._setState(DIALOGUE_BOX_STATE.TYPING);
        this._dispatch('started', {
            speaker: this._speaker,
            kind: this._speakerKind,
            lineIndex: this._lineIndex,
            lineCount: this._lineCount
        });
    }

    /**
     * Classifies the speaker's side. Explicit view.speakerKind wins;
     * otherwise a match against the configured player name reads PLAYER;
     * anything else reads NPC.
     * @param {DialogueView} view View snapshot.
     * @returns {string} SPEAKER_KIND value.
     * @private
     */
    _classifySpeaker(view) {
        if (Object.values(SPEAKER_KIND).includes(view.speakerKind)) {
            return view.speakerKind;
        }
        if (this._playerName !== null && view.speaker === this._playerName) {
            return SPEAKER_KIND.PLAYER;
        }
        return SPEAKER_KIND.NPC;
    }

    /**
     * Installs a new source text: wraps it against the live text column
     * width, rebuilds the flat reveal space, and zeroes the typewriter.
     * Wrapping happens ONCE per line; revealing then walks the fixed
     * wrapped rows, so mid-type reflow can never jitter the frame.
     * @param {string} source Raw line text.
     * @private
     */
    _adoptText(source) {
        const grid = this._gridSize();
        const cols = Math.min(this._maxCols, grid.columns - 4);
        const textCols = Math.max(8, cols - this._portraitWidth - 6);
        const wrapped = wrapText(source, textCols);

        /* Truncation guard: more wrapped rows than the frame can hold
         * clips the overflow with an ellipsis instead of growing the box
         * mid-conversation. */
        if (wrapped.length > this._textRows) {
            const kept = wrapped.slice(0, this._textRows);
            const last = kept[this._textRows - 1];
            kept[this._textRows - 1] = last.length > 1
                ? `${last.slice(0, last.length - 1)}\u2026`
                : '\u2026';
            this._wrappedLines = kept;
        } else {
            this._wrappedLines = wrapped;
        }

        this._flatText = this._wrappedLines.join('');
        this._lineOffsets = [];
        let offset = 0;
        for (const line of this._wrappedLines) {
            this._lineOffsets.push(offset);
            offset += line.length;
        }
        this._revealed = 0;
        this._accumulator = 0;
    }

    /**
     * Adopts a choice list for the upcoming AWAITING_INPUT phase and
     * seeds the cursor from the view's selected flag.
     * @param {Array<{label: string, selected: boolean}>} choices
     * @private
     */
    _adoptChoices(choices) {
        this._choices = Array.isArray(choices)
            ? choices
                .filter((c) => c && typeof c.label === 'string')
                .map((c) => ({ label: c.label }))
            : [];
        const selectedIndex = Array.isArray(choices)
            ? choices.findIndex((c) => c && c.selected === true)
            : -1;
        this._selection = selectedIndex >= 0 ? selectedIndex : 0;
        this._hoverIndex = -1;
    }

    /**
     * Mirrors NPC-side selection drift on an unchanged fingerprint:
     * when the presented view marks a different choice selected and no
     * local confirm is pending, adopt it. Keeps NPC.handleInput-driven
     * navigation and DialogueBox rendering consistent without conflict.
     * @param {Array<{label: string, selected: boolean}>} choices
     * @private
     */
    _mirrorChoices(choices) {
        if (!Array.isArray(choices) || this._awaitingOwner) return;
        if (choices.length !== this._choices.length) return;
        const selectedIndex = choices.findIndex((c) => c && c.selected === true);
        if (selectedIndex >= 0 && selectedIndex !== this._selection) {
            this._selection = selectedIndex;
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       TYPEWRITER ENGINE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the reveal integrator by one fixed tick (see header math):
     *
     *     accumulator += charsPerSecond · dt · multiplier
     *     revealed     = floor(accumulator)
     *
     * Every character crossing the frontier fires the throttled audio
     * tick; crossing the line's end transitions to AWAITING_INPUT and
     * broadcasts 'linecomplete'.
     * @param {number} dt Fixed timestep, seconds.
     * @param {boolean} sprintHeld SPRINT action state for fast-forward.
     * @private
     */
    _advanceTypewriter(dt, sprintHeld) {
        const total = this._flatText.length;
        if (this._revealed >= total) {
            this._completeLine(false);
            return;
        }
        const multiplier = sprintHeld ? this._fastForwardMultiplier : 1;
        this._accumulator += this._charsPerSecond * dt * multiplier;
        const target = Math.min(total, Math.floor(this._accumulator));
        if (target > this._revealed) {
            this._revealThrough(target);
        }
        if (this._revealed >= total) {
            this._completeLine(false);
        }
    }

    /**
     * Reveals characters up to index `target` (exclusive frontier) and
     * dispatches throttled audio ticks for each newly revealed glyph.
     * Whitespace is skipped acoustically by default; every Nth surviving
     * character fires so a 90 cps skip never floods the synth.
     * @param {number} target New reveal frontier.
     * @private
     */
    _revealThrough(target) {
        const total = this._flatText.length;
        while (this._revealed < target && this._revealed < total) {
            const char = this._flatText[this._revealed];
            const isWhitespace = char === ' ' || char === '\t';
            if (!(this._audioSkipWhitespace && isWhitespace) &&
                this._revealed % this._tickEvery === 0) {
                this._dispatch('chartyped', {
                    char,
                    index: this._revealed,
                    total,
                    speaker: this._speaker
                });
            }
            this._revealed += 1;
        }
    }

    /**
     * Instantly reveals the remainder of the current line (ACTION tap
     * during TYPING, or programmatic skip). The audio frontier is NOT
     * walked — a skipped line does not machine-gun the tick synth.
     * @returns {boolean} True if a line was skipped.
     */
    skipLine() {
        if (this._state !== DIALOGUE_BOX_STATE.TYPING) return false;
        const total = this._flatText.length;
        this._revealed = total;
        this._accumulator = total;
        this._completeLine(true);
        return true;
    }

    /**
     * Finalizes the line: transitions to AWAITING_INPUT, selects the
     * sub-mode (choice list present → CHOICES, otherwise CONTINUE), and
     * broadcasts 'linecomplete'.
     * @param {boolean} skipped True when fast-forwarded via skipLine().
     * @private
     */
    _completeLine(skipped) {
        if (this._state !== DIALOGUE_BOX_STATE.TYPING) return;
        this._awaitMode = this._choices.length > 0
            ? AWAIT_MODE.CHOICES
            : AWAIT_MODE.CONTINUE;
        this._setState(DIALOGUE_BOX_STATE.AWAITING_INPUT);
        this._dispatch('linecomplete', {
            skipped,
            lineIndex: this._lineIndex,
            lineCount: this._lineCount,
            hasChoices: this._choices.length > 0
        });
    }

    /* ══════════════════════════════════════════════════════════════════
       CHOICE NAVIGATION
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {boolean} True while AWAITING_INPUT shows a choice list. */
    get isAwaitingChoice() {
        return this._state === DIALOGUE_BOX_STATE.AWAITING_INPUT &&
            this._awaitMode === AWAIT_MODE.CHOICES;
    }

    /** @returns {number} Current choice cursor index. */
    getSelection() {
        return this._selection;
    }

    /**
     * Moves the choice cursor with wrap-around (standard menu feel) and
     * broadcasts 'selection'. No-op outside choice-awaiting state.
     * @param {number} delta -1 or +1 (any integer is sign-reduced).
     * @returns {this}
     */
    moveSelection(delta) {
        if (!this.isAwaitingChoice || this._choices.length === 0) return this;
        const step = delta < 0 ? -1 : 1;
        const count = this._choices.length;
        this.setSelection((this._selection + step + count) % count);
        return this;
    }

    /**
     * Jumps the choice cursor to an explicit index (mouse hover,
     * network-driven menus). Emits 'selection' on change.
     * @param {number} index Target index, clamped into range.
     * @returns {this}
     */
    setSelection(index) {
        if (!this.isAwaitingChoice || this._choices.length === 0) return this;
        const clamped = Math.max(0, Math.min(this._choices.length - 1, Math.floor(index)));
        if (clamped === this._selection) return this;
        this._selection = clamped;
        this._dispatch('selection', {
            index: clamped,
            label: this._choices[clamped].label
        });
        return this;
    }

    /**
     * Confirms the highlighted choice: latches against double-fire,
     * broadcasts 'optionselected', and waits for the owner to advance
     * the NPC graph (which re-presents a fresh view).
     * @returns {boolean} True if a choice was confirmed.
     * @private
     */
    _confirmChoice() {
        if (!this.isAwaitingChoice || this._awaitingOwner) return false;
        const choice = this._choices[this._selection];
        if (!choice) return false;
        this._awaitingOwner = true;
        this._dispatch('optionselected', {
            index: this._selection,
            label: choice.label,
            speaker: this._speaker
        });
        return true;
    }

    /**
     * Synchronizes an NPC's internal choice cursor to a target index.
     * NPC exposes only moveChoiceSelection(delta), so this reads the
     * NPC's own view, computes the signed distance, and steps it across.
     * Owner glue for 'optionselected':
     *
     *     DialogueBox.syncChoiceCursor(npc, detail.index);
     *     npc.advanceDialogue();
     *
     * @param {Object} npc NPC instance with getDialogueView/moveChoiceSelection.
     * @param {number} targetIndex Desired cursor position.
     * @returns {boolean} True if the cursor was synced.
     */
    static syncChoiceCursor(npc, targetIndex) {
        if (!npc ||
            typeof npc.getDialogueView !== 'function' ||
            typeof npc.moveChoiceSelection !== 'function') {
            return false;
        }
        const view = npc.getDialogueView();
        if (!view.active || !Array.isArray(view.choices) || view.choices.length === 0) {
            return false;
        }
        const current = view.choices.findIndex((c) => c && c.selected === true);
        const from = current >= 0 ? current : 0;
        const to = Math.max(0, Math.min(view.choices.length - 1, Math.floor(targetIndex)));
        let steps = to - from;
        const direction = steps < 0 ? -1 : 1;
        steps = Math.abs(steps);
        for (let i = 0; i < steps; i += 1) {
            npc.moveChoiceSelection(direction);
        }
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
       INPUT HANDLING (KEYBOARD + MOUSE)
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Consumes conversation input for one fixed tick. THIS IS THE SOLE
     * INPUT AUTHORITY while a box is presented (see header ownership
     * table). Sequence:
     *   1. Mouse hover updates the choice cursor from last frame's rects.
     *   2. Keyboard edges: PAUSE aborts; UP/DOWN navigate choices;
     *      ACTION skips (TYPING), confirms (choices), or advances.
     *   3. Left-click mirrors ACTION semantics when over the box.
     * @param {import('../engine/InputManager.js').InputManager} input
     * @returns {boolean} True if any edge was consumed this tick.
     */
    handleInput(input) {
        if (this._destroyed || !input) return false;
        if (this._state !== DIALOGUE_BOX_STATE.TYPING &&
            this._state !== DIALOGUE_BOX_STATE.AWAITING_INPUT) {
            return false;
        }
        let consumed = false;

        /* ---- Mouse hover (rects from the previous render) ------------ */
        const mouse = typeof input.getMousePosition === 'function'
            ? input.getMousePosition()
            : null;
        if (mouse && this.isAwaitingChoice && this._layout) {
            this._hoverIndex = -1;
            for (const rect of this._layout.choiceRects) {
                if (pointInRect(mouse, rect)) {
                    this._hoverIndex = rect.index;
                    this.setSelection(rect.index);
                    break;
                }
            }
        }

        /* ---- Keyboard edges ------------------------------------------ */
        const just = (action) => typeof input.isActionJustPressed === 'function' &&
            input.isActionJustPressed(action);

        if (just('PAUSE')) {
            this._dispatch('abort', { reason: 'user-exit' });
            this.close('abort');
            return true;
        }

        if (this.isAwaitingChoice) {
            if (just('MOVE_UP')) {
                this.moveSelection(-1);
                return true;
            }
            if (just('MOVE_DOWN')) {
                this.moveSelection(1);
                return true;
            }
        }

        if (just('ACTION')) {
            consumed = this._handleConfirm() || consumed;
        }

        /* ---- Mouse click ---------------------------------------------- */
        if (typeof input.isMouseJustPressed === 'function' &&
            input.isMouseJustPressed(MOUSE_BUTTON.LEFT) &&
            mouse && this._layout && pointInRect(mouse, this._layout.boxRect)) {
            consumed = this._handleConfirm() || consumed;
        }

        return consumed;
    }

    /**
     * Shared confirm path for ACTION and left-click:
     *   TYPING          → skip the line;
     *   AWAITING choices → confirm the highlighted option;
     *   AWAITING continue → broadcast 'advance' (owner moves the graph).
     * Script mode resolves 'advance' locally against its line queue.
     * @returns {boolean} True if an edge was consumed.
     * @private
     */
    _handleConfirm() {
        if (this._state === DIALOGUE_BOX_STATE.TYPING) {
            return this.skipLine();
        }
        if (this._state !== DIALOGUE_BOX_STATE.AWAITING_INPUT || this._awaitingOwner) {
            return false;
        }
        if (this._awaitMode === AWAIT_MODE.CHOICES) {
            return this._confirmChoice();
        }
        /* Continue mode. */
        this._awaitingOwner = true;
        if (this._mode === 'script') {
            this._advanceScript();
        } else {
            this._dispatch('advance', {
                lineIndex: this._lineIndex,
                lineCount: this._lineCount
            });
        }
        return true;
    }

    /**
     * Script-mode line progression: step the queue, or close with
     * 'complete' when the script is exhausted.
     * @private
     */
    _advanceScript() {
        if (this._lineIndex + 1 < this._scriptLines.length) {
            this._lineIndex += 1;
            this._presentScriptLine();
        } else {
            this.close('complete');
            this._dispatch('complete', { lines: this._scriptLines.length });
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       STATE LIFECYCLE
       ══════════════════════════════════════════════════════════════════ */

    /** @returns {string} Current DIALOGUE_BOX_STATE value. */
    get state() {
        return this._state;
    }

    /** @returns {boolean} True while any visible state is active. */
    get isOpen() {
        return this._state === DIALOGUE_BOX_STATE.TYPING ||
            this._state === DIALOGUE_BOX_STATE.AWAITING_INPUT;
    }

    /**
     * Transitions the state machine and broadcasts 'statechange'. All
     * transitions funnel through here so no edge case can bypass the
     * event stream.
     * @param {string} next Target DIALOGUE_BOX_STATE value.
     * @private
     */
    _setState(next) {
        if (next === this._state) return;
        const from = this._state;
        this._state = next;
        this._dispatch('statechange', { from, to: next });
    }

    /**
     * Closes the box from any state. Idempotent: closing an already
     * closed/hidden box is a no-op. Owners call this when the NPC's
     * conversation ends externally ('walkedaway', 'destroyed').
     * @param {string} [reason='closed'] Close cause for listeners.
     * @returns {boolean} True if this call closed an open box.
     */
    close(reason = 'closed') {
        if (!this.isOpen) {
            this._setState(DIALOGUE_BOX_STATE.CLOSED);
            return false;
        }
        this._setState(DIALOGUE_BOX_STATE.CLOSED);
        this._choices = [];
        this._wrappedLines = [''];
        this._flatText = '';
        this._layout = null;
        this._dispatch('closed', { reason });
        return true;
    }

    /**
     * Returns a closed box to IDLE so present() reads as a fresh open.
     * present() calls this implicitly on admission; exposed for owners
     * that gate on explicit readiness.
     * @returns {this}
     */
    reset() {
        this._setState(DIALOGUE_BOX_STATE.IDLE);
        this._fingerprint = '';
        this._awaitingOwner = false;
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       PER-TICK UPDATE
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Advances the box by one fixed tick: simulation clock, typewriter
     * integration, and reveal completion. Input is handled separately by
     * handleInput(); WorldManager calls both.
     * CONTRACT: exactly once per simulation tick, before render().
     * @param {number} dt Fixed timestep, seconds.
     * @param {import('../engine/InputManager.js').InputManager} [input]
     *   Optional; when supplied, SPRINT hold state accelerates typing.
     * @returns {this}
     */
    update(dt, input = null) {
        if (this._destroyed || !Number.isFinite(dt) || dt <= 0) return this;
        this._time += dt;

        if (this._state === DIALOGUE_BOX_STATE.TYPING) {
            const sprintHeld = Boolean(
                input && typeof input.isActionDown === 'function' &&
                input.isActionDown('SPRINT')
            );
            this._advanceTypewriter(dt, sprintHeld);
        }
        return this;
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER PASS — GEOMETRY
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Live viewport grid metrics, read fresh every call. Layout is never
     * cached across frames, so resize and font recalibration self-heal.
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
     * Resolves the full box layout for the current content (see header
     * composition formulas) and caches hit rectangles for next tick's
     * mouse handling.
     * @param {{columns: number, rows: number, cellW: number, cellH: number}} grid
     * @returns {DialogueLayout}
     * @private
     */
    _composeLayout(grid) {
        const cols = Math.min(this._maxCols, grid.columns - 4);
        const choiceCount = this._awaitMode === AWAIT_MODE.CHOICES &&
            this._state === DIALOGUE_BOX_STATE.AWAITING_INPUT
            ? this._choices.length
            : 0;
        const textRows = Math.max(1, Math.min(this._textRows, this._wrappedLines.length || 1));
        /* top border + text rows + (divider + choices + hint | hint) + bottom border */
        const rows = 1 + textRows + (choiceCount > 0 ? choiceCount + 2 : 1) + 1;

        const x0 = Math.floor((grid.columns - cols) / 2);
        const y0 = Math.max(1, grid.rows - rows - 1);
        const px = x0 * grid.cellW;
        const py = y0 * grid.cellH;

        const layout = {
            cols,
            rows,
            px,
            py,
            wPx: cols * grid.cellW,
            hPx: rows * grid.cellH,
            textX: x0 + this._portraitWidth + 4,
            textCols: Math.max(8, cols - this._portraitWidth - 6),
            textTopRow: y0 + 1,
            choiceRects: [],
            boxRect: { x: px, y: py, w: cols * grid.cellW, h: rows * grid.cellH }
        };

        /* Choice row hit rectangles (consumed next tick by handleInput). */
        if (choiceCount > 0) {
            const dividerRow = y0 + 1 + textRows;
            const firstChoiceRow = dividerRow + 1;
            for (let i = 0; i < choiceCount; i += 1) {
                layout.choiceRects.push({
                    index: i,
                    x: (x0 + 1) * grid.cellW,
                    y: (firstChoiceRow + i) * grid.cellH,
                    w: (cols - 2) * grid.cellW,
                    h: grid.cellH
                });
            }
        }
        return layout;
    }

    /* ══════════════════════════════════════════════════════════════════
       RENDER PASS — DRAWING
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Presents the dialogue frame. Call once per presentation frame,
     * after world and HUD, before endFrame(). Draws nothing in IDLE or
     * CLOSED. The pass order is: backdrop slab → top border with speaker
     * tab → side rails + portrait divider → portrait glyph → typed text
     * rows → divider/choices or continue marker → hint row → page
     * indicator.
     * @param {number} [interpolationAlpha=1] GameLoop render phase;
     *   accepted for API symmetry. All box animation is simulation-clocked
     *   (blinks, portrait pulse), so the phase is currently unused.
     * @returns {void}
     */
    render(interpolationAlpha = 1) {
        if (this._destroyed) return;
        if (!this.isOpen) return;

        const grid = this._gridSize();
        if (grid.columns < 24 || grid.rows < 8) return;
        const layout = this._composeLayout(grid);
        this._layout = layout;

        const r = this._renderer;
        const H = String.fromCodePoint(GLYPH_HORIZ);
        const V = String.fromCodePoint(GLYPH_VERT);
        const PLUS = String.fromCodePoint(GLYPH_CORNER);
        const cellW = grid.cellW;
        const cellH = grid.cellH;

        /* ---- Backdrop slab --------------------------------------------- */
        r.drawRect(layout.px, layout.py, layout.wPx, layout.hPx, COLOR_BACKDROP);

        /* ---- Top border with inset speaker tab -------------------------
         * Composition:  +--[ NAME ]-----...-----+
         * Prefix '+--[' is 4 cells; suffix ']'+dashes+'+' fills the rest.
         * Overflowing names truncate with an ellipsis, never grow the box. */
        const nameColor = this._speakerKind === SPEAKER_KIND.PLAYER
            ? COLOR_NAME_PLAYER
            : this._speakerKind === SPEAKER_KIND.SYSTEM
                ? COLOR_NAME_SYSTEM
                : COLOR_NAME_NPC;
        const prefix = `${PLUS}--[ `;
        const suffixFixed = 3; // ']' + trailing '+' + one dash minimum
        const maxNameLen = Math.max(1, layout.cols - prefix.length - suffixFixed - 1);
        let displayName = this._speaker;
        if (displayName.length > maxNameLen) {
            displayName = `${displayName.slice(0, maxNameLen - 1)}\u2026`;
        }
        const dashCount = Math.max(1, layout.cols - prefix.length - displayName.length - 2);
        r.drawString(layout.px, layout.py, prefix, COLOR_FRAME);
        r.drawString(
            layout.px + r.measureString(prefix).width,
            layout.py,
            displayName,
            nameColor
        );
        r.drawString(
            layout.px + r.measureString(prefix + displayName).width,
            layout.py,
            ` ]${H.repeat(dashCount)}${PLUS}`,
            COLOR_FRAME
        );

        /* ---- Page indicator, top-right inside the frame ------------------ */
        if (this._lineCount > 1) {
            const page = `${this._lineIndex + 1}/${this._lineCount}`;
            const pageX = layout.px + (layout.cols - 1 - page.length) * cellW;
            r.drawString(pageX, layout.py + cellH * 0, page, COLOR_PAGE, COLOR_BACKDROP);
        }

        /* ---- Content rows: rails, portrait divider, typed text ----------- */
        const textRows = Math.min(this._textRows, this._wrappedLines.length || 1);
        const portraitRow = layout.textTopRow + Math.floor(textRows / 2);
        const portraitColor = this._speakerKind === SPEAKER_KIND.PLAYER
            ? COLOR_PORTRAIT_PLAYER
            : this._speakerKind === SPEAKER_KIND.SYSTEM
                ? COLOR_PORTRAIT_SYSTEM
                : COLOR_PORTRAIT_NPC;
        /* Speaking pulse: pure function of simulation time. */
        const pulse = this._state === DIALOGUE_BOX_STATE.TYPING
            ? PORTRAIT_PULSE_MIN_ALPHA +
              (1 - PORTRAIT_PULSE_MIN_ALPHA) *
              (0.5 + 0.5 * Math.sin(Math.PI * 2 * PORTRAIT_PULSE_HZ * this._time))
            : 1;

        for (let i = 0; i < textRows; i += 1) {
            const row = layout.textTopRow + i;
            const rowY = row * cellH;

            /* Left rail. */
            r.drawString(layout.px, rowY, V, COLOR_FRAME);

            /* Portrait glyph on its centered row, padded inside the column. */
            if (row === portraitRow) {
                const portraitX = layout.px + 2 * cellW;
                r.drawString(
                    portraitX,
                    rowY,
                    this._speakerGlyph,
                    withAlpha(portraitColor, pulse),
                    COLOR_BACKDROP
                );
            }

            /* Portrait/text divider. */
            const dividerX = layout.px + (this._portraitWidth + 2) * cellW;
            r.drawString(dividerX, rowY, V, COLOR_FRAME);

            /* Typed text for this wrapped row (reveal frontier walk). */
            const lineText = this._visibleRowText(i);
            if (lineText.length > 0) {
                r.drawString(layout.textX * cellW, rowY, lineText, COLOR_TEXT);
            }

            /* Right rail. */
            r.drawString(layout.px + (layout.cols - 1) * cellW, rowY, V, COLOR_FRAME);
        }

        /* ---- Footer: choices or continue prompt -------------------------- */
        let cursorRow = layout.textTopRow + textRows;
        if (this._awaitMode === AWAIT_MODE.CHOICES &&
            this._state === DIALOGUE_BOX_STATE.AWAITING_INPUT) {
            /* Divider above the choice list. */
            r.drawString(
                layout.px,
                cursorRow * cellH,
                PLUS + H.repeat(layout.cols - 2) + PLUS,
                COLOR_FRAME
            );
            cursorRow += 1;

            for (let i = 0; i < this._choices.length; i += 1) {
                const rowY = cursorRow * cellH;
                const selected = i === this._selection;
                const hovered = i === this._hoverIndex;
                const marker = selected ? `${String.fromCodePoint(GLYPH_CURSOR)} ` : '  ';
                let label = marker + this._choices[i].label;
                const maxLen = layout.cols - 4;
                if (label.length > maxLen) {
                    label = `${label.slice(0, maxLen - 1)}\u2026`;
                }
                const bg = hovered && !selected
                    ? COLOR_CHOICE_HOVER_BG
                    : selected ? COLOR_CHOICE_SELECTED_BG : null;
                const fg = selected ? COLOR_CHOICE_SELECTED : COLOR_CHOICE;
                r.drawString(layout.px + 2 * cellW, rowY, label, fg, bg);
                /* Rails alongside the choice block. */
                r.drawString(layout.px, rowY, V, COLOR_FRAME);
                r.drawString(layout.px + (layout.cols - 1) * cellW, rowY, V, COLOR_FRAME);
                cursorRow += 1;
            }
            this._drawHintRow(cursorRow, layout, cellW, cellH,
                '[W/S] choose  [SPACE] confirm  [ESC] end');
        } else {
            /* Continue prompt: blinking ▼ at the text area's bottom right. */
            if (this._state === DIALOGUE_BOX_STATE.AWAITING_INPUT) {
                const blinkOn = Math.floor(this._time * CONTINUE_BLINK_HZ) % 2 === 0;
                if (blinkOn) {
                    r.drawString(
                        layout.px + (layout.cols - 3) * cellW,
                        (layout.textTopRow + textRows - 1) * cellH,
                        String.fromCodePoint(GLYPH_CONTINUE),
                        COLOR_CONTINUE
                    );
                }
            }
            this._drawHintRow(cursorRow, layout, cellW, cellH,
                this._state === DIALOGUE_BOX_STATE.TYPING
                    ? '[SPACE] skip'
                    : '[SPACE] continue');
        }

        /* ---- Bottom border ------------------------------------------------ */
        r.drawString(
            layout.px,
            (layout.rows + layout.textTopRow - layout.textTopRow + (this._layout.rows - 1) - (this._layout.rows - 1)) * cellH + (grid.rows - layout.rows - 1 >= 0 ? 0 : 0),
            '',
            COLOR_FRAME
        );
        const bottomRow = this._layout.rows - 1;
        r.drawString(
            layout.px,
            (Math.floor((layout.py / cellH)) + bottomRow) * cellH,
            PLUS + H.repeat(layout.cols - 2) + PLUS,
            COLOR_FRAME
        );
    }

    /**
     * Extracts the visible slice of wrapped row `rowIndex` under the
     * current reveal frontier. Characters before the row's cumulative
     * offset are fully revealed; characters beyond the frontier are
     * withheld from presentation.
     * @param {number} rowIndex Wrapped row index.
     * @returns {string} Visible text for the row ('' when unreached).
     * @private
     */
    _visibleRowText(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this._wrappedLines.length) return '';
        const start = this._lineOffsets[rowIndex];
        const line = this._wrappedLines[rowIndex];
        if (this._revealed <= start) return '';
        const visibleCount = Math.min(line.length, this._revealed - start);
        return line.slice(0, visibleCount);
    }

    /**
     * Draws the dim key-hint row immediately above the bottom border.
     * @param {number} row Absolute grid row.
     * @param {DialogueLayout} layout Current layout.
     * @param {number} cellW Cell width in CSS px.
     * @param {number} cellH Cell height in CSS px.
     * @param {string} hint Hint text.
     * @private
     */
    _drawHintRow(row, layout, cellW, cellH, hint) {
        const V = String.fromCodePoint(GLYPH_VERT);
        const maxLen = layout.cols - 4;
        const text = hint.length > maxLen ? hint.slice(0, maxLen) : hint;
        this._renderer.drawString(layout.px, row * cellH, V, COLOR_FRAME);
        this._renderer.drawString(layout.px + 2 * cellW, row * cellH, text, COLOR_TEXT_DIM);
        this._renderer.drawString(
            layout.px + (layout.cols - 1) * cellW,
            row * cellH,
            V,
            COLOR_FRAME
        );
    }

    /* ══════════════════════════════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════════════════════════════ */

    /**
     * Subscribes to a dialogue event: 'started', 'statechange',
     * 'chartyped', 'linecomplete', 'selection', 'optionselected',
     * 'advance', 'abort', 'closed', 'complete'.
     * @param {string} type Event name.
     * @param {Function} listener Callback receiving a detail object.
     * @returns {Function} Unsubscribe function.
     */
    addEventListener(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('[DialogueBox] event type must be a string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('[DialogueBox] listener must be a function.');
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
     * Broadcasts an event with error isolation. Dialogue hooks are
     * cosmetic/audio glue; a throwing subscriber must never kill the
     * simulation tick or the conversation itself.
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
                console.error(`[DialogueBox] '${type}' listener failed:`, error);
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
            state: this._state,
            awaitMode: this._awaitMode,
            mode: this._mode,
            speaker: this._speaker,
            speakerKind: this._speakerKind,
            lineIndex: this._lineIndex,
            lineCount: this._lineCount,
            revealedChars: this._revealed,
            totalChars: this._flatText.length,
            charsPerSecond: this._charsPerSecond,
            choices: this._choices.length,
            selection: this._selection,
            hoverIndex: this._hoverIndex,
            time: this._time
        };
    }

    /**
     * Tears down the box: closes any open conversation quietly, drops all
     * listeners, and releases layout caches. The instance must not be
     * reused after destroy(); matches the engine-wide teardown contract
     * for clean hot-module reloads and test isolation.
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._setState(DIALOGUE_BOX_STATE.CLOSED);
        this._listeners.clear();
        this._layout = null;
        this._choices = [];
        this._scriptLines = [];
    }
}

export default DialogueBox;