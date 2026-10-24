/**
 * @file src/engine/Engine.js
 * @module engine/Engine
 *
 * @description
 * Hybrid GPU presenter for "YUCCA": a Three.js WebGLRenderer driving one
 * full-screen quad whose fragment shader composites the entire ASCII grid
 * from a glyph atlas (engine/FontAtlas.js) plus per-cell data textures
 * packed by engine/GLDataPack.js.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY A FULL-SCREEN QUAD
 * ───────────────────────────────────────────────────────────────────────────
 * The Canvas 2D path (engine/Renderer.js) pays one fillText() per visible
 * glyph per repaint. The GPU path pays exactly ONE draw call per frame:
 * every cell's glyph coverage, foreground, background, lighting gradient,
 * water ripple, rain sheen, X-ray inversion, and glitch tear is evaluated
 * in parallel per-fragment. The virtual grid remains the single source of
 * truth — the CPU simulation never knows which presenter is live.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PIPELINE (per presented frame)
 * ───────────────────────────────────────────────────────────────────────────
 *   1. collectGlyphVocabulary(buffer)  → FontAtlas.ensure(codes)
 *      (atlas pixels change at most when a NEW glyph appears; then the
 *       atlas CanvasTexture re-uploads once)
 *   2. packCharPlane / packColorPlane  → three RGBA8 DataTextures
 *      (allocation-free: the typed arrays live for the session)
 *   3. uniforms ← camera (pan/zoom/shake) + frame state
 *      (flash, rain, gloom, glitch, grayscale, tint, water, lights)
 *   4. renderer.render(scene, orthoCamera)  — one quad, one draw call
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FRAGMENT SHADER FEATURE MAP
 * ───────────────────────────────────────────────────────────────────────────
 *   ZOOM & PAN        worldPx = uCam + screenPx / uZoom — fluid mouse-wheel
 *                     zoom (Camera exponential damping) resolves to a single
 *                     division; macro overview → intimate close-up is free.
 *   SCREEN-SPACE
 *   REFLECTIONS       water-flagged cells resample the grid through the
 *                     ripple formula
 *                         y' = y + sin(x·f + t)·a
 *                     (plus a slower counter-diagonal harmonic), blended
 *                     with a shimmer term — GPU reinforcement of the CPU
 *                     WaterShader's mirrored buffer rows.
 *   RADIAL LIGHTING   up to 8 point lights in world-pixel space, squared
 *                     falloff, per-light color: player aura, grove heart,
 *                     juice-cart glow, boss cores.
 *   RAIN BLENDING     two parallax streak layers of procedurally hashed
 *                     columns falling at different speeds — a fine sheen
 *                     BETWEEN the CPU's rain glyphs, scaled by uRain.
 *   X-RAY INVERSION   uFlash (WeatherSystem.flashIntensity) drives a
 *                     luminance-inverted high-contrast pass synchronized
 *                     with the CPU buffer inversion + camera shake.
 *   GLITCH            uGlitch (orange depletion) tears horizontal bands
 *                     via a time-hashed displacement and splits chroma.
 *   POLISH            storm gloom dimming, dimension tint, Rec.709
 *                     grayscale collapse (Drab), vignette.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FALLBACK CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * The engine treats WebGL as an accelerator, never a dependency:
 *
 *   • construction probes WebGL2/WebGL; failure → isSupported === false and
 *     zero THREE objects exist (Game keeps the Canvas 2D presenter).
 *   • a runtime WebGL failure inside present() flips isSupported false and
 *     throws once — Renderer catches, drops the delegate, and the next
 *     frame presents through the untouched 2D path.
 *
 * The Node validation harness imports this module safely: with a canvas
 * whose getContext() yields no GL context, the class degrades to the
 * unsupported path and every uniform-state computation stays testable.
 */

import * as THREE from 'three';
import { FontAtlas } from './FontAtlas.js';
import {
    packCharPlane,
    packColorPlane,
    collectGlyphVocabulary
} from './GLDataPack.js';

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** Maximum simultaneous point lights (must match the shader array size). */
export const MAX_LIGHTS = 8;

/** Void fallback RGB when a cell's background alpha is empty. */
const VOID_RGB = [0.043, 0.055, 0.078]; /* #0B0E14 */

/* ══════════════════════════════════════════════════════════════════════════
 * SHADER SOURCES
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Vertex stage: passes the quad through clip space; vUv spans [0,1]² over
 * the viewport with (0,0) at the bottom-left (GL convention). The fragment
 * stage immediately flips to top-left screen space.
 */
const VERTEX_SHADER = /* glsl */`
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Fragment stage: the entire ASCII compositor. See the module header for
 * the feature map; inline comments tie each block to its uniform source.
 */
const FRAGMENT_SHADER = /* glsl */`
varying vec2 vUv;

uniform sampler2D uAtlas;   /* glyph coverage atlas (white on transparent)  */
uniform sampler2D uChars;   /* r/g = atlas slot, b = water flag             */
uniform sampler2D uFg;      /* per-cell foreground rgb                      */
uniform sampler2D uBg;      /* per-cell background rgba                     */

uniform vec2  uGrid;        /* buffer size in cells                         */
uniform vec2  uCam;         /* camera top-left in world CSS px (incl. shake)*/
uniform vec2  uCell;        /* base cell size in CSS px                     */
uniform vec2  uViewport;    /* viewport size in CSS px                      */
uniform float uZoom;        /* camera zoom (>= 1 close-up)                  */
uniform float uTime;        /* presentation clock, seconds                  */

uniform float uFlash;       /* lightning inversion 0..1                     */
uniform float uRain;        /* rain intensity 0..1                          */
uniform float uGloom;       /* storm gloom 0..1                             */
uniform float uGlitch;      /* orange depletion 0..1                        */
uniform float uGrayscale;   /* Drab World luminance collapse 0/1            */
uniform vec3  uTint;        /* dimension ambient tint                       */
uniform float uTintStrength;

uniform float uWaterFrequency;
uniform float uWaterAmplitude;
uniform float uWaterSpeed;

uniform vec4  uLights[${MAX_LIGHTS}];    /* x, y, radius (world px), intensity */
uniform vec3  uLightColors[${MAX_LIGHTS}];
uniform int   uLightCount;

uniform vec2  uAtlasTiles;  /* atlas tiles per axis                        */

/* -- deterministic hash (spores, streaks, glitch bands) ------------------- */
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/* -- raw char texel; outside the grid reads pure blank --------------------- */
vec4 cellRaw(vec2 cell) {
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
        return vec4(0.0);
    }
    return texture2D(uChars, (cell + 0.5) / uGrid);
}

/* -- composite one cell: atlas coverage over bg tinted by fg --------------- */
vec3 cellColor(vec2 cell, vec2 sub, out float waterFlag) {
    vec4 cd = cellRaw(cell);
    float slot = cd.r * 255.0 + cd.g * 255.0 * 256.0;
    waterFlag = step(128.0, cd.b);

    vec2 gridUv = (cell + 0.5) / uGrid;
    vec3 fg = texture2D(uFg, gridUv).rgb;
    vec4 bgT = texture2D(uBg, gridUv);
    vec3 bg = bgT.a < 0.02 ? vec3(0.043, 0.055, 0.078) : bgT.rgb;

    vec3 col = bg;
    if (slot > 0.5) {
        vec2 tile = vec2(mod(slot, uAtlasTiles.x), floor(slot / uAtlasTiles.x));
        vec2 inner = clamp(sub, 0.04, 0.96);
        vec2 atlasUv = (tile + inner) / uAtlasTiles;
        float coverage = texture2D(uAtlas, atlasUv).a;
        col = mix(bg, fg, coverage);
    }
    return col;
}

void main() {
    /* vUv (0,0) is bottom-left in GL; the grid is authored top-left. */
    vec2 screenPx = vec2(vUv.x, 1.0 - vUv.y) * uViewport;

    /* ---- glitch band tear (orange depletion) --------------------------- */
    float glitchShift = 0.0;
    if (uGlitch > 0.001) {
        float bandH = max(24.0, uViewport.y / 22.0);
        float band = floor(screenPx.y / bandH);
        float jitter = hash12(vec2(band, floor(uTime * 16.0)));
        float active = step(0.35, jitter);
        glitchShift = (jitter - 0.5) * 46.0 * uGlitch * active;
    }

    /* ---- camera: world position of this fragment ------------------------ */
    vec2 worldPx = uCam + (screenPx + vec2(glitchShift, 0.0)) / uZoom;
    vec2 cellF = worldPx / uCell;
    vec2 cell = floor(cellF);
    vec2 sub = fract(cellF);

    float waterFlag;
    vec3 col = cellColor(cell, sub, waterFlag);

    /* ---- water ripple resample ------------------------------------------
     * y' = y + sin(x·f + t·speed)·a  (blueprint formula) plus a slower
     * counter-diagonal harmonic; blended with a horizontal shimmer.      */
    if (waterFlag > 0.5) {
        vec2 ripple;
        ripple.x = cellF.x + sin(cellF.y * uWaterFrequency * 0.62
                                 + uTime * uWaterSpeed * 1.31)
                   * uWaterAmplitude * 0.5;
        ripple.y = cellF.y + sin(cellF.x * uWaterFrequency
                                 + uTime * uWaterSpeed)
                   * uWaterAmplitude;
        float ignored;
        vec3 reflected = cellColor(floor(ripple), fract(ripple), ignored);
        float shimmer = 0.5 + 0.5 * sin(cellF.x * uWaterFrequency * 2.3
                                        + uTime * uWaterSpeed * 1.7);
        col = mix(col, reflected * (0.78 + 0.22 * shimmer), 0.62);
    }

    /* ---- radial lights (world-pixel space, squared falloff) ------------- */
    if (uLightCount > 0) {
        vec3 light = vec3(0.0);
        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            if (i >= uLightCount) break;
            vec4 L = uLights[i];
            float d = distance(worldPx, L.xy);
            float fall = clamp(1.0 - d / max(L.z, 0.001), 0.0, 1.0);
            light += uLightColors[i] * (L.w * fall * fall);
        }
        col += light * 0.55;
    }

    /* ---- rain sheen: two parallax streak layers -------------------------- */
    if (uRain > 0.001) {
        float sheen = 0.0;

        float w0 = 14.0;
        float c0 = floor(screenPx.x / w0);
        float on0 = step(0.55, hash12(vec2(c0, 0.0)));
        float len0 = 120.0;
        float y0 = mod(hash12(vec2(c0, 1.0)) * uViewport.y + uTime * 900.0,
                       uViewport.y + len0) - len0;
        float d0 = screenPx.y - y0;
        sheen += on0 * smoothstep(len0, len0 * 0.25, d0) * smoothstep(-2.0, 6.0, d0);

        float w1 = 31.0;
        float c1 = floor(screenPx.x / w1 + 7.0);
        float on1 = step(0.35, hash12(vec2(c1, 2.0)));
        float len1 = 210.0;
        float y1 = mod(hash12(vec2(c1, 3.0)) * uViewport.y + uTime * 1500.0,
                       uViewport.y + len1) - len1;
        float d1 = screenPx.y - y1;
        sheen += on1 * 0.7 * smoothstep(len1, len1 * 0.25, d1) * smoothstep(-2.0, 8.0, d1);

        col += vec3(0.42, 0.52, 0.66) * sheen * uRain * 0.20;
    }

    /* ---- storm gloom ----------------------------------------------------- */
    col *= 1.0 - uGloom * 0.35;

    /* ---- dimension ambient tint ------------------------------------------ */
    col = mix(col, col * uTint, uTintStrength);

    /* ---- Drab World grayscale (Rec.709, mirrors Renderer.setGrayscale) --- */
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(luma), uGrayscale);

    /* ---- X-ray lightning inversion --------------------------------------- */
    if (uFlash > 0.001) {
        vec3 inverted = 1.0 - col;
        float invLuma = dot(inverted, vec3(0.3333));
        inverted = mix(vec3(invLuma), inverted, 0.65);
        col = mix(col, inverted, clamp(uFlash, 0.0, 1.0));
    }

    /* ---- glitch chroma tear ----------------------------------------------- */
    if (uGlitch > 0.001) {
        float phase = sin(uTime * 42.0 + vUv.y * 34.0);
        col.r *= 1.0 + 0.35 * uGlitch * phase;
        col.b *= 1.0 - 0.25 * uGlitch * phase;
    }

    /* ---- vignette ---------------------------------------------------------- */
    float vig = smoothstep(1.32, 0.42, length(vUv - 0.5) * 1.414);
    col *= mix(0.80, 1.0, vig);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* ══════════════════════════════════════════════════════════════════════════
 * ENGINE (HYBRID GPU PRESENTER)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Three.js full-screen-quad ASCII compositor.
 *
 * Lifecycle:
 *   const engine = new Engine(glCanvas, { cellWidth, cellHeight });
 *   if (engine.isSupported) renderer.setGLDelegate(engine);
 *   … per frame: engine.setFrameState(state); engine.present(buffer, camera);
 *
 * All state setters tolerate any call order and merge partial updates.
 */
export class Engine {
    /**
     * @param {HTMLCanvasElement} canvas Dedicated WebGL surface (#glCanvas),
     *   stacked beneath the Canvas 2D overlay.
     * @param {Object} [options]
     * @param {number} [options.cellWidth=9.6]  Base glyph advance, CSS px.
     * @param {number} [options.cellHeight=20]  Base row pitch, CSS px.
     * @param {string} [options.fontFamily]     Atlas rasterization stack.
     */
    constructor(canvas, options = {}) {
        if (options === null || typeof options !== 'object') {
            throw new TypeError('[Engine] options must be an object.');
        }

        /** @type {HTMLCanvasElement} */
        this._canvas = canvas;

        /** @type {number} */
        this._cellW = Number.isFinite(options.cellWidth) && options.cellWidth > 0
            ? options.cellWidth : 9.6;

        /** @type {number} */
        this._cellH = Number.isFinite(options.cellHeight) && options.cellHeight > 0
            ? options.cellHeight : 20;

        /** @type {number} CSS viewport width. */
        this._cssW = 1280;

        /** @type {number} CSS viewport height. */
        this._cssH = 800;

        /** @type {number} Effective device pixel ratio. */
        this._dpr = 1;

        /* ---- Support probe ------------------------------------------------ */
        const gl = this._probeGL(canvas);
        /** @type {boolean} */
        this._supported = gl !== null;
        /** @type {string} */
        this._backend = gl !== null
            ? String(gl.getParameter(gl.VERSION) || 'WebGL')
            : 'none';

        /* ---- Diagnostics --------------------------------------------------- */
        /** @type {Object} */
        this._metrics = {
            frames: 0,
            lastPackMs: 0,
            lastWaterCells: 0,
            lastBlankCells: 0,
            atlasUploads: 0,
            supported: this._supported,
            backend: this._backend
        };

        if (!this._supported) {
            /* Headless/unsupported instances still honor the full state
             * API: the water-glyph vocabulary is the one mutable store
             * that must exist before the early exit. */
            /** @type {Set<number>} Water glyph vocabulary snapshot. */
            this._waterCodes = new Set();
            return;
        }

        /* ---- Font atlas ----------------------------------------------------- */
        /** @type {FontAtlas} */
        this._atlas = new FontAtlas({
            fontFamily: options.fontFamily,
            weight: 700
        });

        /** @type {Set<number>} Reused vocabulary scan target (allocation-free). */
        this._vocab = new Set();

        /** @type {number} Atlas generation baked into the live texture. */
        this._atlasGeneration = -1;

        /* ---- THREE core ----------------------------------------------------- */
        /** @type {THREE.WebGLRenderer} */
        this._three = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: false
        });

        this._three.setClearColor(
            new THREE.Color(VOID_RGB[0], VOID_RGB[1], VOID_RGB[2]), 1.0
        );

        /** @type {THREE.Scene} */
        this._scene = new THREE.Scene();

        /** @type {THREE.OrthographicCamera} */
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        /* ---- Data buffers (allocated on first present) ---------------------- */
        /** @type {?Uint8Array} */ this._charBytes = null;
        /** @type {?Uint8Array} */ this._fgBytes = null;
        /** @type {?Uint8Array} */ this._bgBytes = null;

        /** @type {?THREE.DataTexture} */ this._charTex = null;
        /** @type {?THREE.DataTexture} */ this._fgTex = null;
        /** @type {?THREE.DataTexture} */ this._bgTex = null;
        /** @type {?THREE.CanvasTexture} */ this._atlasTex = null;

        /** @type {number} */ this._gridW = 0;
        /** @type {number} */ this._gridH = 0;

        /** @type {Set<number>} Water glyph vocabulary snapshot. */
        this._waterCodes = new Set();

        /* ---- Uniforms -------------------------------------------------------- */
        const lightVecs = [];
        const lightCols = [];
        for (let i = 0; i < MAX_LIGHTS; i += 1) {
            lightVecs.push(new THREE.Vector4(0, 0, 1, 0));
            lightCols.push(new THREE.Color(0, 0, 0));
        }

        /** @type {Object} */
        this._uniforms = {
            uAtlas: { value: null },
            uChars: { value: null },
            uFg: { value: null },
            uBg: { value: null },
            uGrid: { value: new THREE.Vector2(1, 1) },
            uCam: { value: new THREE.Vector2(0, 0) },
            uCell: { value: new THREE.Vector2(this._cellW, this._cellH) },
            uViewport: { value: new THREE.Vector2(this._cssW, this._cssH) },
            uZoom: { value: 1 },
            uTime: { value: 0 },
            uFlash: { value: 0 },
            uRain: { value: 0 },
            uGloom: { value: 0 },
            uGlitch: { value: 0 },
            uGrayscale: { value: 0 },
            uTint: { value: new THREE.Color(1, 1, 1) },
            uTintStrength: { value: 0 },
            uWaterFrequency: { value: 0.55 },
            uWaterAmplitude: { value: 1.4 },
            uWaterSpeed: { value: 2.2 },
            uLights: { value: lightVecs },
            uLightColors: { value: lightCols },
            uLightCount: { value: 0 },
            uAtlasTiles: { value: new THREE.Vector2(16, 16) }
        };

        /** @type {Map<string, THREE.Color>} CSS color string → Color cache. */
        this._colorCache = new Map();

        /* ---- Full-screen quad ------------------------------------------------ */
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: this._uniforms,
            depthTest: false,
            depthWrite: false
        });

        /** @type {THREE.Mesh} */
        this._quad = new THREE.Mesh(geometry, material);
        this._quad.frustumCulled = false;
        this._scene.add(this._quad);

        /** @type {number} Presentation clock origin, seconds. */
        this._clock = performance.now() * 0.001;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * SUPPORT & LIFECYCLE
     * ══════════════════════════════════════════════════════════════════════ */

    /** @returns {boolean} True when WebGL presentation is live. */
    get isSupported() {
        return this._supported;
    }

    /** @returns {string} GL VERSION string, or 'none' headless. */
    get backend() {
        return this._backend;
    }

    /**
     * Acquires a probe context without consuming it for rendering.
     * @param {HTMLCanvasElement} canvas
     * @returns {?WebGLRenderingContext|?WebGL2RenderingContext}
     * @private
     */
    _probeGL(canvas) {
        if (!canvas || typeof canvas.getContext !== 'function') return null;
        try {
            return canvas.getContext('webgl2') || canvas.getContext('webgl');
        } catch (error) {
            return null;
        }
    }

    /**
     * Releases every GPU resource. The instance must not present after
     * destroy(); isSupported flips false so the Renderer falls back.
     * @returns {void}
     */
    destroy() {
        if (!this._supported && !this._three) return;
        this._supported = false;

        try {
            this._charTex?.dispose();
            this._fgTex?.dispose();
            this._bgTex?.dispose();
            this._atlasTex?.dispose();
            if (this._quad) {
                this._quad.geometry.dispose();
                this._quad.material.dispose();
            }
            this._three?.dispose();
        } catch (error) {
            console.warn('[Engine] destroy() encountered an error:', error);
        }

        this._charTex = null;
        this._fgTex = null;
        this._bgTex = null;
        this._atlasTex = null;
        this._three = null;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CONFIGURATION
     * ══════════════════════════════════════════════════════════════════════ */

    /**
     * Updates base cell metrics (Renderer font recalibration).
     * @param {number} cellWidth Glyph advance, CSS px.
     * @param {number} cellHeight Row pitch, CSS px.
     * @returns {this}
     */
    setCellMetrics(cellWidth, cellHeight) {
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) return this;
        if (!Number.isFinite(cellHeight) || cellHeight <= 0) return this;

        this._cellW = cellWidth;
        this._cellH = cellHeight;
        if (this._uniforms) {
            this._uniforms.uCell.value.set(cellWidth, cellHeight);
        }
        return this;
    }

    /**
     * Applies a display snapshot (resize / DPR change).
     * @param {{cssWidth: number, cssHeight: number, dpr?: number}} info
     * @returns {this}
     */
    handleResize(info) {
        if (!this._supported || !info) return this;

        this._cssW = Math.max(1, Math.floor(info.cssWidth || this._cssW));
        this._cssH = Math.max(1, Math.floor(info.cssHeight || this._cssH));
        this._dpr = Number.isFinite(info.dpr) && info.dpr > 0 ? info.dpr : 1;

        this._three.setPixelRatio(this._dpr);
        this._three.setSize(this._cssW, this._cssH, false);
        this._uniforms.uViewport.value.set(this._cssW, this._cssH);
        return this;
    }

    /**
     * Snapshots the water-glyph vocabulary used to flag ripple cells.
     * @param {Iterable<number|string>} codes Code points (or glyph strings).
     * @returns {this}
     */
    setWaterGlyphs(codes) {
        this._waterCodes.clear();
        if (!codes) return this;
        for (const code of codes) {
            this._waterCodes.add(
                typeof code === 'string' ? code.codePointAt(0) : code >>> 0
            );
        }
        return this;
    }

    /**
     * Merges a partial frame-state payload into the uniform sources.
     *
     * Recognized keys (all optional):
     *   flash         0..1 lightning inversion
     *   rain          0..1 rain sheen intensity
     *   gloom         0..1 storm dimming
     *   glitch        0..1 orange-depletion tear
     *   grayscale     0|1 Drab luminance collapse
     *   tint          CSS color string for ambient dimension tint
     *   tintStrength  0..1
     *   water         { frequency, amplitude, speed }
     *   lights        [{ x, y, radius, intensity, color }] world CSS px
     *
     * @param {Object} state Partial uniform state.
     * @returns {this}
     */
    setFrameState(state) {
        if (!this._supported || !state) return this;
        const u = this._uniforms;

        if (Number.isFinite(state.flash)) u.uFlash.value = clamp01(state.flash);
        if (Number.isFinite(state.rain)) u.uRain.value = clamp01(state.rain);
        if (Number.isFinite(state.gloom)) u.uGloom.value = clamp01(state.gloom);
        if (Number.isFinite(state.glitch)) u.uGlitch.value = clamp01(state.glitch);
        if (Number.isFinite(state.grayscale)) {
            u.uGrayscale.value = state.grayscale > 0.5 ? 1 : 0;
        }

        if (state.tint !== undefined) {
            u.uTint.value.copy(this._toColor(state.tint, u.uTint.value));
        }
        if (Number.isFinite(state.tintStrength)) {
            u.uTintStrength.value = clamp01(state.tintStrength);
        }

        if (state.water && typeof state.water === 'object') {
            const w = state.water;
            if (Number.isFinite(w.frequency) && w.frequency > 0) {
                u.uWaterFrequency.value = w.frequency;
            }
            if (Number.isFinite(w.amplitude) && w.amplitude >= 0) {
                u.uWaterAmplitude.value = w.amplitude;
            }
            if (Number.isFinite(w.speed) && w.speed >= 0) {
                u.uWaterSpeed.value = w.speed;
            }
        }

        if (Array.isArray(state.lights)) {
            const vecs = u.uLights.value;
            const cols = u.uLightColors.value;
            const count = Math.min(state.lights.length, MAX_LIGHTS);

            for (let i = 0; i < count; i += 1) {
                const L = state.lights[i];
                if (!L) continue;
                vecs[i].set(
                    Number.isFinite(L.x) ? L.x : 0,
                    Number.isFinite(L.y) ? L.y : 0,
                    Number.isFinite(L.radius) && L.radius > 0 ? L.radius : 96,
                    Number.isFinite(L.intensity) ? L.intensity : 0.5
                );
                cols[i].copy(this._toColor(L.color ?? '#ffb46b', cols[i]));
            }
            u.uLightCount.value = count;
        }

        return this;
    }

    /**
     * Resolves a CSS color string / hex / rgb array into a THREE.Color,
     * caching string parses for the session.
     * @param {string|number|number[]} color Source color.
     * @param {THREE.Color} fallback Mutated in place when unparseable.
     * @returns {THREE.Color}
     * @private
     */
    _toColor(color, fallback) {
        if (typeof color === 'string') {
            let cached = this._colorCache.get(color);
            if (!cached) {
                cached = new THREE.Color(color);
                if (this._colorCache.size > 256) this._colorCache.clear();
                this._colorCache.set(color, cached);
            }
            return cached;
        }
        if (Array.isArray(color) && color.length >= 3) {
            return new THREE.Color(color[0], color[1], color[2]);
        }
        return fallback;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PRESENTATION
     ══════════════════════════════════════════════════════════════════════ */

    /**
     * Presents one frame of the virtual grid through the GPU compositor.
     *
     * @param {ASCIIBuffer} buffer Composed virtual grid (post water pass).
     * @param {{x?: number, y?: number, shakeX?: number, shakeY?: number,
     *          zoom?: number}} camera RenderCamera state.
     * @returns {boolean} True when the GPU frame was issued.
     * @throws {Error} On WebGL failure — the caller (Renderer) catches,
     *   drops the delegate, and falls back to the 2D presenter.
     */
    present(buffer, camera = {}) {
        if (!this._supported) return false;

        const packStart = performance.now();

        /* ---- 1. Atlas vocabulary ----------------------------------------- */
        collectGlyphVocabulary(buffer, this._vocab);
        if (this._atlas.ensure(this._vocab)) {
            this._atlasGeneration = -1; /* force texture refresh below */
        }

        if (this._atlasGeneration !== this._atlas.atlasGeneration) {
            this._uploadAtlasTexture();
            this._atlasGeneration = this._atlas.atlasGeneration;
            this._metrics.atlasUploads += 1;
        }

        /* ---- 2. Data planes ----------------------------------------------- */
        this._ensureDataTextures(buffer.cols, buffer.rows);

        const charStats = packCharPlane(buffer, this._atlas, this._charBytes, this._waterCodes);
        packColorPlane(buffer.foregroundColors, this._fgBytes);
        packColorPlane(buffer.backgroundColors, this._bgBytes);

        this._charTex.needsUpdate = true;
        this._fgTex.needsUpdate = true;
        this._bgTex.needsUpdate = true;

        /* ---- 3. Uniforms ---------------------------------------------------- */
        const u = this._uniforms;
        const zoom = Math.max(0.05, camera.zoom ?? 1);
        const shakeX = camera.shakeX || 0;
        const shakeY = camera.shakeY || 0;

        /* Screen-space shake folds into the camera: world = cam + screen/z. */
        u.uCam.value.set(
            (camera.x || 0) + shakeX / zoom,
            (camera.y || 0) + shakeY / zoom
        );
        u.uZoom.value = zoom;
        u.uTime.value = performance.now() * 0.001 - this._clock;
        u.uGrid.value.set(buffer.cols, buffer.rows);

        /* ---- 4. Draw --------------------------------------------------------- */
        this._three.render(this._scene, this._camera);

        this._metrics.frames += 1;
        this._metrics.lastPackMs = performance.now() - packStart;
        this._metrics.lastWaterCells = charStats.waterCells;
        this._metrics.lastBlankCells = charStats.blankCells;

        return true;
    }

    /**
     * (Re)creates the atlas CanvasTexture after page growth or first use.
     * @private
     */
    _uploadAtlasTexture() {
        if (!this._atlas.canRasterize) return;

        if (this._atlasTex) {
            this._atlasTex.image = this._atlas.canvas;
            this._atlasTex.needsUpdate = true;
        } else {
            this._atlasTex = new THREE.CanvasTexture(this._atlas.canvas);
            this._atlasTex.flipY = false;          /* match data-texture rows */
            this._atlasTex.generateMipmaps = false;
            this._atlasTex.minFilter = THREE.LinearFilter;
            this._atlasTex.magFilter = THREE.LinearFilter;
            this._atlasTex.wrapS = THREE.ClampToEdgeWrapping;
            this._atlasTex.wrapT = THREE.ClampToEdgeWrapping;
            this._uniforms.uAtlas.value = this._atlasTex;
        }

        this._uniforms.uAtlasTiles.value.set(this._atlas.tilesX, this._atlas.tilesX);
    }

    /**
     * Allocates the per-cell data textures for a grid geometry, reusing
     * everything when the dimensions are unchanged.
     * @param {number} cols Grid columns.
     * @param {number} rows Grid rows.
     * @private
     */
    _ensureDataTextures(cols, rows) {
        if (this._charTex && cols === this._gridW && rows === this._gridH) return;

        const cells = cols * rows;
        const bytes = cells * 4;

        this._charBytes = new Uint8Array(bytes);
        this._fgBytes = new Uint8Array(bytes);
        this._bgBytes = new Uint8Array(bytes);

        this._charTex?.dispose();
        this._fgTex?.dispose();
        this._bgTex?.dispose();

        this._charTex = this._makeDataTexture(this._charBytes, cols, rows);
        this._fgTex = this._makeDataTexture(this._fgBytes, cols, rows);
        this._bgTex = this._makeDataTexture(this._bgBytes, cols, rows);

        this._uniforms.uChars.value = this._charTex;
        this._uniforms.uFg.value = this._fgTex;
        this._uniforms.uBg.value = this._bgTex;

        this._gridW = cols;
        this._gridH = rows;
    }

    /**
     * Builds one RGBA8 nearest-filtered data texture.
     * @param {Uint8Array} bytes Backing store.
     * @param {number} cols Width in texels.
     * @param {number} rows Height in texels.
     * @returns {THREE.DataTexture}
     * @private
     */
    _makeDataTexture(bytes, cols, rows) {
        const tex = new THREE.DataTexture(bytes, cols, rows);
        tex.format = THREE.RGBAFormat;
        tex.type = THREE.UnsignedByteType;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return tex;
    }

    /* ══════════════════════════════════════════════════════════════════════
     * DIAGNOSTICS
     ══════════════════════════════════════════════════════════════════════ */

    /**
     * Snapshot for the HUD telemetry panel and the validation harness.
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...this._metrics,
            grid: this._gridW > 0 ? `${this._gridW}x${this._gridH}` : null,
            atlas: this._atlas ? this._atlas.getMetrics() : null,
            lights: this._uniforms ? this._uniforms.uLightCount.value : 0,
            zoom: this._uniforms ? this._uniforms.uZoom.value : 1
        };
    }
}

/**
 * Clamps a value into [0, 1] (module-private helper).
 * @param {number} v Candidate.
 * @returns {number}
 */
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default Engine;
