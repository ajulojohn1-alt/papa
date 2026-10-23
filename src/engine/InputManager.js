/**
 * @file src/engine/InputManager.js
 * @module engine/InputManager
 *
 * @description
 * Input capture, state tracking, and action mapping for "A Stitch in Time".
 *
 * InputManager is the single source of truth for player intent. It converts
 * raw browser DOM events into stable, pollable game state that systems query
 * synchronously inside the fixed-timestep simulation.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EVENT LIFECYCLE & STATE MAPS
 * ───────────────────────────────────────────────────────────────────────────
 * Five DOM event classes are observed:
 *
 *   keydown / keyup        attached to the global event target (window)
 *   mousemove / mouseup    attached to the global event target (window)
 *   mousedown              attached to the canvas element
 *
 * mousedown is bound to the canvas rather than window so clicks on browser
 * chrome, devtools, or future DOM overlays never register as game input.
 * mouseup and mousemove stay global so a button released outside the canvas
 * still clears its state — otherwise a drag that exits the viewport would
 * leave the player permanently "firing".
 *
 * Internal state maps:
 *
 *   _keysDown              Set<string>   Held key codes (e.code, layout
 *                                         independent — WASD stays physical
 *                                         on AZERTY/QWERTZ keyboards).
 *   _keysJustPressed       Set<string>   Pressed since last frame commit.
 *   _keysJustReleased      Set<string>   Released since last frame commit.
 *   _buttonsDown           boolean[]     Held mouse buttons by button index.
 *   _buttonsJustPressed    Set<number>   Buttons pressed this frame.
 *   _buttonsJustReleased   Set<number>   Buttons released this frame.
 *
 * Key identity uses KeyboardEvent.code, NOT KeyboardEvent.key: code is the
 * physical key ('KeyW'), while key is the produced character ('z' on AZERTY),
 * which would silently break movement bindings for international players.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FRAME CONTRACT (THE update() HANDSHAKE)
 * ───────────────────────────────────────────────────────────────────────────
 * DOM events arrive asynchronously between animation frames, while gameplay
 * queries happen inside deterministic fixed ticks. To reconcile these two
 * clocks without double-triggering or lag, events write into PENDING sets:
 *
 *   DOM event ──► pending set ──► update() ──► just-pressed/released sets
 *
 * update() must be called exactly once per simulation tick, BEFORE any
 * system queries the manager:
 *
 *   input.update();                 // commit pending edge events
 *   worlds.update(dt, input);       // systems read stable state
 *
 * Consequences this design guarantees:
 *
 *   - A press is visible for exactly one tick (no double-trigger).
 *   - A press+release arriving within one frame is delivered as both edges
 *     in the same tick, faithfully representing the tap.
 *   - Multi-tick catch-up frames never replay stale edges: the second tick
 *     of a catch-up burst sees empty just-sets because pending was drained.
 *   - Auto-repeat (holding a key) never re-fires just-pressed; native
 *     repeat events are discarded via KeyboardEvent.repeat.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MOUSE COORDINATE MATH
 * ───────────────────────────────────────────────────────────────────────────
 * Client coordinates are converted to canvas-local CSS pixels:
 *
 *   localX = clientX - canvasRect.left
 *   localY = clientY - canvasRect.top
 *
 * The Renderer draws in the same CSS-pixel space (the DPR transform is
 * applied inside the context), so these coordinates can be compared directly
 * against entity screen positions or divided by cell metrics to obtain grid
 * coordinates via getMouseCell().
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ACTION MAPPING
 * ───────────────────────────────────────────────────────────────────────────
 * Systems never query raw keys. They query semantic actions ('MOVE_UP',
 * 'INVENTORY'), which resolve through a configurable action map. This keeps
 * rebinding (settings menu, accessibility remaps) a pure data operation.
 * A reverse index (code → actions) makes keydown preventDefault decisions
 * O(1) and enables future "which key triggered this action" UI hints.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CLEANUP
 * ───────────────────────────────────────────────────────────────────────────
 * All listeners are stored as stable bound references and removed verbatim
 * by destroy(). The manager is therefore safe to instantiate in tests and
 * tear down without leaking global handlers across hot-module reloads.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical mouse button indices from MouseEvent.button.
 * @enum {number}
 */
export const MOUSE_BUTTON = Object.freeze({
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2,
    BACK: 3,
    FORWARD: 4
});

/** Maximum tracked mouse buttons (matches the MouseEvent.button range). */
const MAX_MOUSE_BUTTONS = 5;

/**
 * Default action map. Every gameplay system references these action names,
 * never raw key codes, so the entire control scheme can be rebinded through
 * setActionMap() without touching simulation code.
 *
 * NOTE: 'ACTION' and 'DODGE' intentionally share Space. Combat contexts read
 * DODGE, exploration/dialogue contexts read ACTION — the same physical key
 * serves both roles per the design blueprint, resolved by the consuming
 * state machine rather than by input.
 *
 * @type {Object<string, string[]>}
 */
const DEFAULT_ACTION_MAP = Object.freeze({
    MOVE_UP: ['KeyW', 'ArrowUp'],
    MOVE_DOWN: ['KeyS', 'ArrowDown'],
    MOVE_LEFT: ['KeyA', 'ArrowLeft'],
    MOVE_RIGHT: ['KeyD', 'ArrowRight'],
    SPRINT: ['ShiftLeft', 'ShiftRight'],
    ACTION: ['Space', 'Enter'],
    DODGE: ['Space'],
    INTERACT: ['KeyE'],
    INVENTORY: ['KeyI'],
    QUEST_LOG: ['KeyQ'],
    WORLD_MAP: ['KeyM'],
    DIMENSION_FOCUS: ['Tab'],
    PAUSE: ['Escape']
});

/* ══════════════════════════════════════════════════════════════════════════
 * INPUT MANAGER
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Captures keyboard and mouse events, maintains pollable state maps, and
 * resolves semantic action queries for gameplay and UI systems.
 */
export class InputManager {
    /**
     * @param {Window|EventTarget} [eventTarget=window]
     *   Global target for keyboard and tracking listeners. Accepts any
     *   EventTarget to keep the class unit-testable.
     * @param {?HTMLCanvasElement} [canvas=null]
     *   Render surface used for mousedown capture and local coordinate
     *   conversion. When null, mouse coordinates fall back to viewport space.
     * @param {Object} [options]
     * @param {Object<string, string|string[]>} [options.actionMap]
     *   Custom action map. Values may be a single code or an array of codes.
     *   Omit to use DEFAULT_ACTION_MAP.
     */
    constructor(eventTarget = window, canvas = null, options = {}) {
        if (canvas !== null && !(canvas instanceof HTMLCanvasElement)) {
            throw new TypeError(
                '[InputManager] canvas must be an HTMLCanvasElement or null.'
            );
        }

        /** @type {Window|EventTarget} Global listener target. */
        this._target = eventTarget;

        /** @type {?HTMLCanvasElement} Render surface for pointer capture. */
        this._canvas = canvas;

        /** @type {boolean} Master gate. Disabled managers swallow events. */
        this._enabled = true;

        /* ---- Keyboard state maps --------------------------------------- */
        /** @type {Set<string>} Held physical key codes. */
        this._keysDown = new Set();

        /** @type {Set<string>} Pending presses awaiting frame commit. */
        this._keysPressedPending = new Set();

        /** @type {Set<string>} Pending releases awaiting frame commit. */
        this._keysReleasedPending = new Set();

        /** @type {Set<string>} Presses committed for the current tick. */
        this._keysJustPressed = new Set();

        /** @type {Set<string>} Releases committed for the current tick. */
        this._keysJustReleased = new Set();

        /* ---- Mouse state maps ------------------------------------------ */
        /** @type {boolean[]} Held buttons by MouseEvent.button index. */
        this._buttonsDown = new Array(MAX_MOUSE_BUTTONS).fill(false);

        /** @type {Set<number>} Pending button presses. */
        this._buttonsPressedPending = new Set();

        /** @type {Set<number>} Pending button releases. */
        this._buttonsReleasedPending = new Set();

        /** @type {Set<number>} Button presses committed this tick. */
        this._buttonsJustPressed = new Set();

        /** @type {Set<number>} Button releases committed this tick. */
        this._buttonsJustReleased = new Set();

        /** @type {number} Pointer x in canvas-local CSS pixels. */
        this._mouseX = 0;

        /** @type {number} Pointer y in canvas-local CSS pixels. */
        this._mouseY = 0;

        /** @type {number} Accumulated pointer travel since last commit. */
        this._mouseDeltaX = 0;

        /** @type {number} Accumulated pointer travel since last commit. */
        this._mouseDeltaY = 0;

        /** @type {number} Committed delta for the current tick. */
        this._lastDeltaX = 0;

        /** @type {number} Committed delta for the current tick. */
        this._lastDeltaY = 0;

        /* ---- Action mapping -------------------------------------------- */
        /** @type {Map<string, Set<string>>} action → bound key codes. */
        this._actionMap = new Map();

        /** @type {Map<string, Set<string>>} key code → actions bound to it. */
        this._codeToActions = new Map();

        /** @type {Set<string>} Codes whose default behavior is suppressed. */
        this._preventDefaultCodes = new Set();

        this.setActionMap(options.actionMap ?? DEFAULT_ACTION_MAP);

        /* ---- Stable listener references --------------------------------
         * Arrow-function fields guarantee addEventListener and
         * removeEventListener receive identical references, which is the
         * only way to detach anonymous-style handlers cleanly. */

        /** @type {(e: KeyboardEvent) => void} */
        this._onKeyDown = (event) => this._handleKeyDown(event);

        /** @type {(e: KeyboardEvent) => void} */
        this._onKeyUp = (event) => this._handleKeyUp(event);

        /** @type {(e: MouseEvent) => void} */
        this._onMouseMove = (event) => this._handleMouseMove(event);

        /** @type {(e: MouseEvent) => void} */
        this._onMouseDown = (event) => this._handleMouseDown(event);

        /** @type {(e: MouseEvent) => void} */
        this._onMouseUp = (event) => this._handleMouseUp(event);

        /** @type {() => void} */
        this._onBlur = () => this.releaseAll();

        /** @type {(e: Event) => void} */
        this._onContextMenu = (event) => {
            /* Right-click is a bindable game button; suppress the browser
             * context menu so it never interrupts combat. */
            if (this._enabled) event.preventDefault();
        };

        this._attach();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * LISTENER ATTACHMENT / TEARDOWN
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Registers all DOM listeners.
     *
     * mousemove is registered passive because it never calls preventDefault;
     * this lets the compositor run pointer tracking off the critical path.
     * Keyboard and button handlers remain non-passive because they suppress
     * native behaviors (page scroll on Space/Arrows, middle-click autoscroll).
     *
     * @private
     */
    _attach() {
        this._target.addEventListener('keydown', this._onKeyDown);
        this._target.addEventListener('keyup', this._onKeyUp);
        this._target.addEventListener('blur', this._onBlur);

        this._target.addEventListener('mousemove', this._onMouseMove, { passive: true });
        this._target.addEventListener('mouseup', this._onMouseUp);

        if (this._canvas) {
            this._canvas.addEventListener('mousedown', this._onMouseDown);
            this._canvas.addEventListener('contextmenu', this._onContextMenu);
        } else {
            this._target.addEventListener('mousedown', this._onMouseDown);
        }
    }

    /**
     * Removes every listener registered by _attach() and clears all state.
     * Call during engine shutdown (main.js wires this to pagehide) or before
     * discarding the manager in tests. After destroy(), the instance must
     * not be reused.
     *
     * @returns {void}
     */
    destroy() {
        this._target.removeEventListener('keydown', this._onKeyDown);
        this._target.removeEventListener('keyup', this._onKeyUp);
        this._target.removeEventListener('blur', this._onBlur);

        this._target.removeEventListener('mousemove', this._onMouseMove);
        this._target.removeEventListener('mouseup', this._onMouseUp);

        if (this._canvas) {
            this._canvas.removeEventListener('mousedown', this._onMouseDown);
            this._canvas.removeEventListener('contextmenu', this._onContextMenu);
        } else {
            this._target.removeEventListener('mousedown', this._onMouseDown);
        }

        this.releaseAll();
    }

    /**
     * Enables or disables input capture.
     *
     * Disabling immediately releases all held state so a key held during a
     * cutscene or dialog cannot resume "held" after re-enabling.
     *
     * @param {boolean} enabled True to capture, false to swallow events.
     * @returns {this}
     */
    setEnabled(enabled) {
        const next = Boolean(enabled);

        if (!next && this._enabled) {
            this.releaseAll();
        }

        this._enabled = next;
        return this;
    }

    /** @returns {boolean} Whether the manager is currently capturing input. */
    isEnabled() {
        return this._enabled;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DOM EVENT HANDLERS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Handles keydown: records held state and queues a press edge.
     *
     * Native auto-repeat fires keydown continuously while a key is held.
     * Those repeats are discarded for edge tracking (otherwise DODGE would
     * re-trigger every ~33 ms while Space is held), but still suppressed so
     * the page never scrolls.
     *
     * @param {KeyboardEvent} event Native event.
     * @private
     */
    _handleKeyDown(event) {
        const code = event.code;
        if (!code) return;

        if (this._preventDefaultCodes.has(code)) {
            event.preventDefault();
        }

        if (!this._enabled) return;
        if (event.repeat) return;

        if (!this._keysDown.has(code)) {
            this._keysDown.add(code);
            this._keysPressedPending.add(code);
        }
    }

    /**
     * Handles keyup: clears held state and queues a release edge.
     * @param {KeyboardEvent} event Native event.
     * @private
     */
    _handleKeyUp(event) {
        const code = event.code;
        if (!code) return;

        if (this._preventDefaultCodes.has(code)) {
            event.preventDefault();
        }

        if (!this._enabled) return;

        if (this._keysDown.has(code)) {
            this._keysDown.delete(code);
            this._keysReleasedPending.add(code);
        }
    }

    /**
     * Handles mousemove: updates local coordinates and accumulates delta.
     * Delta accumulation happens here (event time) rather than in update()
     * (tick time) so sub-frame movement is never lost between fixed ticks.
     *
     * @param {MouseEvent} event Native event.
     * @private
     */
    _handleMouseMove(event) {
        if (!this._enabled) return;

        const previousX = this._mouseX;
        const previousY = this._mouseY;

        this._updateMousePosition(event.clientX, event.clientY);

        this._mouseDeltaX += this._mouseX - previousX;
        this._mouseDeltaY += this._mouseY - previousY;
    }

    /**
     * Handles mousedown on the render surface.
     *
     * Also pulls keyboard focus onto the canvas: the canvas carries
     * tabindex="0", and without focus some browsers route keystrokes to the
     * document body, which works for window listeners but breaks future
     * input isolation (e.g. embedded chat fields).
     *
     * @param {MouseEvent} event Native event.
     * @private
     */
    _handleMouseDown(event) {
        /* Middle-click autoscroll would hijack the gesture; suppress it. */
        if (event.button === MOUSE_BUTTON.MIDDLE) {
            event.preventDefault();
        }

        if (!this._enabled) return;

        this._updateMousePosition(event.clientX, event.clientY);

        if (this._canvas && typeof this._canvas.focus === 'function') {
            this._canvas.focus({ preventScroll: true });
        }

        if (this._isValidButton(event.button) && !this._buttonsDown[event.button]) {
            this._buttonsDown[event.button] = true;
            this._buttonsPressedPending.add(event.button);
        }
    }

    /**
     * Handles mouseup globally so releases outside the canvas still land.
     * @param {MouseEvent} event Native event.
     * @private
     */
    _handleMouseUp(event) {
        if (!this._enabled) return;

        this._updateMousePosition(event.clientX, event.clientY);

        if (this._isValidButton(event.button) && this._buttonsDown[event.button]) {
            this._buttonsDown[event.button] = false;
            this._buttonsReleasedPending.add(event.button);
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
     * MOUSE COORDINATE HELPERS
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Converts client-space coordinates into canvas-local CSS pixels and
     * stores them. Falls back to raw client coordinates when no canvas was
     * provided (headless/test mode).
     *
     * @param {number} clientX MouseEvent.clientX.
     * @param {number} clientY MouseEvent.clientY.
     * @private
     */
    _updateMousePosition(clientX, clientY) {
        if (this._canvas) {
            const rect = this._canvas.getBoundingClientRect();
            this._mouseX = clientX - rect.left;
            this._mouseY = clientY - rect.top;
        } else {
            this._mouseX = clientX;
            this._mouseY = clientY;
        }
    }

    /**
     * Validates a MouseEvent.button index against the tracked range.
     * @param {number} button Candidate button index.
     * @returns {boolean} True if trackable.
     * @private
     */
    _isValidButton(button) {
        return Number.isInteger(button) && button >= 0 && button < MAX_MOUSE_BUTTONS;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * FRAME COMMIT
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Commits pending edge events into the per-tick just-sets and rotates
     * the mouse delta accumulator.
     *
     * CONTRACT: call exactly once per simulation tick, before any query.
     * WorldManager.update() owns this call in the current architecture.
     *
     * The swap-and-drain pattern guarantees each physical press/release is
     * observed by gameplay code exactly once, regardless of how many ticks
     * a single frame consumes during catch-up.
     *
     * @returns {void}
     */
    update() {
        /* Rotate keyboard edges: pending becomes current; fresh pending set. */
        this._keysJustPressed = this._keysPressedPending;
        this._keysJustReleased = this._keysReleasedPending;
        this._keysPressedPending = new Set();
        this._keysReleasedPending = new Set();

        /* Rotate button edges the same way. */
        this._buttonsJustPressed = this._buttonsPressedPending;
        this._buttonsJustReleased = this._buttonsReleasedPending;
        this._buttonsPressedPending = new Set();
        this._buttonsReleasedPending = new Set();

        /* Publish accumulated pointer travel, then start a fresh bucket. */
        this._lastDeltaX = this._mouseDeltaX;
        this._lastDeltaY = this._mouseDeltaY;
        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;
    }

    /**
     * Explicit alias for systems that prefer intent-named calls.
     * Equivalent to update(); provided for API clarity at call sites that
     * only care about edge hygiene.
     *
     * @returns {void}
     */
    clearJustPressed() {
        this.update();
    }

    /**
     * Silently releases all held keys and buttons WITHOUT generating
     * release edges. Used on window blur / disable: gameplay must not react
     * to phantom releases caused by focus loss (e.g. dodging because the
     * player alt-tabbed away from a held key).
     *
     * @returns {void}
     */
    releaseAll() {
        this._keysDown.clear();
        this._keysPressedPending.clear();
        this._keysReleasedPending.clear();
        this._keysJustPressed.clear();
        this._keysJustReleased.clear();

        this._buttonsDown.fill(false);
        this._buttonsPressedPending.clear();
        this._buttonsReleasedPending.clear();
        this._buttonsJustPressed.clear();
        this._buttonsJustReleased.clear();

        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;
        this._lastDeltaX = 0;
        this._lastDeltaY = 0;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * KEYBOARD QUERIES
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Tests whether a physical key is currently held.
     * @param {string} code KeyboardEvent.code, e.g. 'KeyW', 'Space'.
     * @returns {boolean}
     */
    isKeyPressed(code) {
        return this._keysDown.has(code);
    }

    /** @returns {boolean} True if at least one key is held. */
    isAnyKeyPressed() {
        return this._keysDown.size > 0;
    }

    /**
     * Tests whether a key was pressed during the current tick.
     * True for exactly one tick after the press commits.
     * @param {string} code KeyboardEvent.code.
     * @returns {boolean}
     */
    isKeyJustPressed(code) {
        return this._keysJustPressed.has(code);
    }

    /**
     * Tests whether a key was released during the current tick.
     * @param {string} code KeyboardEvent.code.
     * @returns {boolean}
     */
    isKeyJustReleased(code) {
        return this._keysJustReleased.has(code);
    }

    /** @returns {string[]} Snapshot of currently held key codes. */
    getActiveKeys() {
        return Array.from(this._keysDown);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * MOUSE QUERIES
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Tests whether a mouse button is currently held.
     * @param {number} [button=0] MouseEvent.button index (see MOUSE_BUTTON).
     * @returns {boolean}
     */
    isMousePressed(button = MOUSE_BUTTON.LEFT) {
        return this._isValidButton(button) && this._buttonsDown[button];
    }

    /**
     * Tests whether a mouse button was pressed during the current tick.
     * @param {number} [button=0] MouseEvent.button index.
     * @returns {boolean}
     */
    isMouseJustPressed(button = MOUSE_BUTTON.LEFT) {
        return this._buttonsJustPressed.has(button);
    }

    /**
     * Tests whether a mouse button was released during the current tick.
     * @param {number} [button=0] MouseEvent.button index.
     * @returns {boolean}
     */
    isMouseJustReleased(button = MOUSE_BUTTON.LEFT) {
        return this._buttonsJustReleased.has(button);
    }

    /**
     * Current pointer position in canvas-local CSS pixels.
     * @returns {{x: number, y: number}}
     */
    getMousePosition() {
        return { x: this._mouseX, y: this._mouseY };
    }

    /**
     * Pointer travel committed for the current tick. Useful for camera
     * edge-panning and drag gestures without sampling raw events.
     * @returns {{dx: number, dy: number}}
     */
    getMouseDelta() {
        return { dx: this._lastDeltaX, dy: this._lastDeltaY };
    }

    /**
     * Converts the pointer position to ASCII grid coordinates.
     *
     * @param {number} cellWidth Renderer cell width in CSS pixels.
     * @param {number} cellHeight Renderer cell height in CSS pixels.
     * @returns {{col: number, row: number}} Grid cell under the pointer.
     */
    getMouseCell(cellWidth, cellHeight) {
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
            throw new RangeError('[InputManager] cellWidth must be positive.');
        }
        if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
            throw new RangeError('[InputManager] cellHeight must be positive.');
        }

        return {
            col: Math.floor(this._mouseX / cellWidth),
            row: Math.floor(this._mouseY / cellHeight)
        };
    }

    /**
     * Tests whether the pointer currently sits inside the canvas bounds.
     * @returns {boolean}
     */
    isMouseInsideCanvas() {
        if (!this._canvas) return false;

        const rect = this._canvas.getBoundingClientRect();

        return (
            this._mouseX >= 0 &&
            this._mouseY >= 0 &&
            this._mouseX < rect.width &&
            this._mouseY < rect.height
        );
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ACTION MAP CONFIGURATION
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Replaces the entire action map and rebuilds the reverse index and the
     * preventDefault code set.
     *
     * @param {Object<string, string|string[]>} config
     *   Action name → key code or array of key codes.
     * @returns {this}
     * @throws {TypeError} If config is not an object.
     */
    setActionMap(config) {
        if (config === null || typeof config !== 'object') {
            throw new TypeError('[InputManager] action map must be an object.');
        }

        this._actionMap.clear();
        this._codeToActions.clear();
        this._preventDefaultCodes.clear();

        for (const [action, codes] of Object.entries(config)) {
            this._registerAction(action, codes);
        }

        return this;
    }

    /**
     * Rebinds a single action, replacing any previous bindings.
     *
     * @param {string} action Action name, e.g. 'DODGE'.
     * @param {string|string[]} codes Replacement key code(s).
     * @returns {this}
     */
    rebindAction(action, codes) {
        this._unregisterAction(action);
        this._registerAction(action, codes);
        return this;
    }

    /**
     * Removes an action and all of its bindings.
     * @param {string} action Action name.
     * @returns {this}
     */
    unbindAction(action) {
        this._unregisterAction(action);
        return this;
    }

    /**
     * Returns the key codes currently bound to an action.
     * @param {string} action Action name.
     * @returns {string[]} Bound codes; empty array when unbound.
     */
    getBoundCodes(action) {
        const codes = this._actionMap.get(action);
        return codes ? Array.from(codes) : [];
    }

    /**
     * Returns a plain-object snapshot of the live action map, suitable for
     * persistence (localStorage) or a keybind settings UI.
     * @returns {Object<string, string[]>}
     */
    exportActionMap() {
        const exported = {};

        for (const [action, codes] of this._actionMap) {
            exported[action] = Array.from(codes);
        }

        return exported;
    }

    /**
     * Internal registration shared by setActionMap and rebindAction.
     * Normalizes string values into arrays and updates every index.
     *
     * @param {string} action Action name.
     * @param {string|string[]} codes Key code(s).
     * @private
     */
    _registerAction(action, codes) {
        const codeList = Array.isArray(codes) ? codes : [codes];
        const codeSet = new Set();

        for (const code of codeList) {
            if (typeof code !== 'string' || code.length === 0) continue;

            codeSet.add(code);

            let actions = this._codeToActions.get(code);
            if (!actions) {
                actions = new Set();
                this._codeToActions.set(code, actions);
            }
            actions.add(action);

            this._preventDefaultCodes.add(code);
        }

        this._actionMap.set(action, codeSet);
    }

    /**
     * Internal unregistration. Rebuilds indices for the removed codes and
     * prunes preventDefault entries no longer referenced by any action.
     *
     * @param {string} action Action name.
     * @private
     */
    _unregisterAction(action) {
        const codes = this._actionMap.get(action);
        if (!codes) return;

        for (const code of codes) {
            const actions = this._codeToActions.get(code);
            if (actions) {
                actions.delete(action);
                if (actions.size === 0) {
                    this._codeToActions.delete(code);
                    this._preventDefaultCodes.delete(code);
                }
            }
        }

        this._actionMap.delete(action);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ACTION QUERIES
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Tests whether any key bound to an action is currently held.
     * @param {string} action Action name.
     * @returns {boolean}
     */
    isActionDown(action) {
        const codes = this._actionMap.get(action);
        if (!codes) return false;

        for (const code of codes) {
            if (this._keysDown.has(code)) return true;
        }
        return false;
    }

    /**
     * Tests whether a bound key was pressed during the current tick.
     * @param {string} action Action name.
     * @returns {boolean}
     */
    isActionJustPressed(action) {
        const codes = this._actionMap.get(action);
        if (!codes) return false;

        for (const code of codes) {
            if (this._keysJustPressed.has(code)) return true;
        }
        return false;
    }

    /**
     * Tests whether the last key bound to an action was released this tick.
     * @param {string} action Action name.
     * @returns {boolean}
     */
    isActionJustReleased(action) {
        const codes = this._actionMap.get(action);
        if (!codes) return false;

        for (const code of codes) {
            if (this._keysJustReleased.has(code)) return true;
        }
        return false;
    }

    /**
     * Computes the normalized movement vector from the four MOVE actions.
     *
     * Diagonal input is scaled to unit length so sprinting diagonally never
     * outpaces cardinal movement — a fairness requirement for bullet-hell
     * dodge windows where √2 speed would trivialize patterns.
     *
     *   raw    = (right - left, down - up)
     *   output = raw / |raw|   when |raw| > 0, else (0, 0)
     *
     * @returns {{x: number, y: number}} Unit vector in grid space (+y down).
     */
    getMovementVector() {
        let x = 0;
        let y = 0;

        if (this.isActionDown('MOVE_LEFT')) x -= 1;
        if (this.isActionDown('MOVE_RIGHT')) x += 1;
        if (this.isActionDown('MOVE_UP')) y -= 1;
        if (this.isActionDown('MOVE_DOWN')) y += 1;

        if (x !== 0 && y !== 0) {
            const inverseLength = 1 / Math.hypot(x, y);
            x *= inverseLength;
            y *= inverseLength;
        }

        return { x, y };
    }
}

export default InputManager;