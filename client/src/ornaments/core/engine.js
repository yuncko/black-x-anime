/**
 * ============================================================================
 *  Hearbor — OrnamentEngine · framework-agnostic Three.js 3D avatar frames
 * ============================================================================
 *  Zero React dependency on purpose: the same class powers the React wrappers
 *  and the standalone HTML demo.
 *
 *      import { mountOrnament } from './engine.js';
 *      const frame = await mountOrnament({ canvas, ornament: 'cyber-neon' });
 *      frame.setOptions({ bloomStrength: 1.2 });
 *      frame.dispose();
 *
 *  Feature map
 *  ───────────
 *  • Material  : MeshPhysicalMaterial, transmission 0.9 / roughness 0.08 /
 *                IOR 1.52 (+ clearcoat, iridescence, dispersion on crystal).
 *  • Light rig : PMREM RoomEnvironment (procedural, no network) + 3 accent
 *                point lights + rim light, all re-tinted per preset.
 *  • Glow      : UnrealBloomPass through EffectComposer + OutputPass
 *                (ACES tone mapping survives the composer chain).
 *  • Motion    : pointer-follow gyro tilt with critically-damped springs,
 *                idle rotation, wheel/drag spin, click burst, breathing pulse.
 *  • Extras    : orbiting additive particle field, custom GLSL glyph/rune
 *                ring, flame ribbons, shadow plumes, instanced shards/petals.
 *  • Perf      : IntersectionObserver auto-pause, tab-visibility pause,
 *                DPR clamping per quality tier, adaptive auto-degrade.
 * ============================================================================
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { QUALITY_TIERS, resolveOrnament, getBanner } from './ornaments.js';

/* ------------------------------------------------------------------ utils */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Critically-damped-ish lerp that is frame-rate independent. */
function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/* ------------------------------------------------------- shared textures */

const textureCache = new Map();

/** Soft round glow sprite used by every particle system. */
function glowSprite() {
  if (textureCache.has('glow')) return textureCache.get('glow');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textureCache.set('glow', tex);
  return keepShared(tex);
}

/** Mark a texture as shared so `_disposeGroup` never frees it. */
function keepShared(tex) {
  textureCache.set(tex.uuid, tex);
  return tex;
}
function scanlineStrip() {
  if (textureCache.has('scan')) return textureCache.get('scan');
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y += 4) {
    g.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.18)';
    g.fillRect(0, y, 4, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 26);
  textureCache.set('scan', tex);
  return keepShared(tex);
}

/**
 * Shared avatar disc texture (clipped circle image, or initials over the
 * brand gradient). Used by BOTH the engine and the React fallback so the
 * standalone demo and the app never drift apart.
 *
 * @returns {Promise<THREE.CanvasTexture>}
 */
export async function createAvatarTexture({ src = null, label = 'X', color = '#22d3ee', size = 512 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;

  const drawInitials = (bgImg = null) => {
    g.save();
    g.beginPath();
    g.arc(r, r, r - 2, 0, TAU);
    g.closePath();
    g.clip();
    if (bgImg) {
      const ratio = bgImg.width / bgImg.height || 1;
      let dw = size, dh = size, dx = 0, dy = 0;
      if (ratio > 1) { dw = size * ratio; dx = (size - dw) / 2; }
      else if (ratio < 1) { dh = size / ratio; dy = (size - dh) / 2; }
      g.drawImage(bgImg, dx, dy, dw, dh);
    } else {
      const grd = g.createLinearGradient(0, 0, size, size);
      grd.addColorStop(0, color);
      grd.addColorStop(1, '#0b0e18');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.globalAlpha = 0.22;
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(r, r * 1.55, r * 1.05, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.font = `700 ${Math.round(size * 0.42)}px 'Space Grotesk', 'Cairo', system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((label || 'X').slice(0, 2).toUpperCase(), r, r + size * 0.02);
    }
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  if (!src) return drawInitials(null);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });
    return drawInitials(img);
  } catch {
    return drawInitials(null);
  }
}

/* ----------------------------------------------------------- env (PMREM) */

const WeakEnvCache = typeof WeakMap === 'function' ? new WeakMap() : null;

function getEnvironment(renderer) {
  if (WeakEnvCache?.has(renderer)) return WeakEnvCache.get(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  WeakEnvCache?.set(renderer, envRT.texture);
  pmrem.dispose();
  envScene?.dispose?.();
  return envRT.texture;
}

/* ------------------------------------------------------------ glyph rings */

const GLYPH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLYPH_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uColor2;
  uniform float uSpokes;
  uniform float uOpacity;
  uniform float uSpin;
  uniform float uKind;   // 0 = rune, 1 = tech, 2 = filigree
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    float angle = vUv.x * 6.28318530718;
    float spokeF = angle / 6.28318530718 * uSpokes;
    float spokeIdx = floor(spokeF);
    float s = fract(spokeF);

    float mark = 0.0;
    float seed = hash(spokeIdx * 12.9898 + uKind * 7.0);

    if (uKind < 0.5) {                       /* ── runic ticks ── */
      float bar = smoothstep(0.30, 0.38, s) * (1.0 - smoothstep(0.62, 0.70, s));
      float h1 = smoothstep(0.15, 0.22, vUv.y) * (1.0 - smoothstep(0.55, 0.62, vUv.y));
      float h2 = smoothstep(0.55, 0.62, vUv.y) * (1.0 - smoothstep(0.80, 0.87, vUv.y));
      mark = bar * max(h1, h2 * step(0.45, seed));
      mark += bar * 0.35 * step(0.75, seed) * smoothstep(0.05, 0.12, vUv.y) * (1.0 - smoothstep(0.28, 0.36, vUv.y));
    } else if (uKind < 1.5) {                /* ── tech chevrons + data bars ── */
      float chev = abs(fract(s * 3.0 + uTime * 0.25) - 0.5) * 2.0;
      mark = smoothstep(0.62, 0.98, chev) * smoothstep(0.22, 0.36, vUv.y) * (1.0 - smoothstep(0.64, 0.78, vUv.y));
      float dataLen = mix(0.18, 0.86, hash(spokeIdx * 4.1 + floor(uTime * 1.6) * 0.37));
      mark += step(s, dataLen) * smoothstep(0.68, 0.72, vUv.y) * (1.0 - smoothstep(0.86, 0.9, vUv.y)) * 0.85;
      mark += step(1.0 - dataLen, s) * smoothstep(0.10, 0.14, vUv.y) * (1.0 - smoothstep(0.28, 0.32, vUv.y)) * 0.6;
    } else {                                 /* ── filigree arcs + diamonds ── */
      float arc = sin(angle * uSpokes * 0.5 + uTime * 0.35) * 0.5 + 0.5;
      mark = smoothstep(0.55, 1.0, arc) * smoothstep(0.28, 0.42, vUv.y) * (1.0 - smoothstep(0.58, 0.72, vUv.y));
      float d = abs(s - 0.5) + abs(vUv.y - 0.5);
      mark += (1.0 - smoothstep(0.06, 0.14, d)) * step(0.5, seed) * 1.4;
    }

    /* radial falloff keeps the band edges clean */
    float band = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float pulse = 0.72 + 0.28 * sin(uTime * 1.35 + spokeIdx * 0.7 + uSpin * 2.0);

    vec3 col = mix(uColor, uColor2, hash(spokeIdx * 3.1));
    float a = clamp(mark, 0.0, 1.0) * band * uOpacity * pulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * (1.6 + pulse * 0.9), a);
  }
`;

function makeGlyphRing(cfg) {
  const geo = new THREE.RingGeometry(cfg.radius, cfg.radius + cfg.width, 160, 1);
  // remap uv.x to the actual angle so spokes align with the geometry
  const kinds = { rune: 0, tech: 1, filigree: 2 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLYPH_VERT,
    fragmentShader: GLYPH_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(cfg.color || '#22d3ee') },
      uColor2: { value: new THREE.Color(cfg.color2 || cfg.color || '#ffffff') },
      uSpokes: { value: cfg.spokes ?? 18 },
      uOpacity: { value: cfg.opacity ?? 0.75 },
      uSpin: { value: 0 },
      uKind: { value: kinds[cfg.kind] ?? 0 }
    }
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.isGlyph = true;
  return mesh;
}

/* ------------------------------------------------------------ flame rings */

const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uSpeed;
  varying float vH;
  varying vec2 vUv2;
  void main() {
    vUv2 = uv;
    vec3 p = position;
    float a = atan(p.y, p.x);
    float wob = sin(a * 7.0 + uTime * uSpeed * 4.0) * 0.5 + sin(a * 17.0 - uTime * uSpeed * 6.0) * 0.25;
    p.z += wob * uAmp * uv.y;
    vH = uv.y + wob * 0.12;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uOpacity;
  varying float vH;
  varying vec2 vUv2;
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    float h = clamp(vH, 0.0, 1.0);
    float flick = 0.75 + 0.25 * noise(vec2(vUv2.x * 40.0, floor(uTime * 14.0)));
    float alpha = (1.0 - smoothstep(0.05, 1.0, h)) * uOpacity * flick;
    vec3 col = mix(uColor2, uColor, h);
    col *= 1.0 + (1.0 - h) * 1.4;             // hot base → blooms nicely
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function makeFlameRing(cfg) {
  const geo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 0.82, cfg.height, 96, 8, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: cfg.amp ?? 0.5 },
      uSpeed: { value: Math.abs(cfg.speed ?? 0.5) },
      uColor: { value: new THREE.Color(cfg.color || '#ff6a1f') },
      uColor2: { value: new THREE.Color(cfg.accent || cfg.color2 || '#ffd166') },
      uOpacity: { value: 0.75 }
    }
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = cfg.height * 0.4;
  mesh.userData.isFlame = true;
  mesh.userData.dir = cfg.speed < 0 ? -1 : 1;
  return mesh;
}

/* ==========================================================================
 *  OrnamentEngine
 * ========================================================================== */

export class OrnamentEngine {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {HTMLElement}  [opts.container]  pointer + resize target (defaults to canvas.parentElement)
   * @param {string}       [opts.ornament]   preset id
   * @param {'frame'|'banner'} [opts.mode]
   * @param {object}       [opts.overrides]  per-instance preset patch
   * @param {'cinematic'|'balanced'|'lite'|'css'} [opts.quality]
   * @param {boolean}      [opts.interactive=true]
   * @param {boolean}      [opts.autoRotate=true]
   * @param {number}       [opts.tilt]       gyro amplitude (rad)
   * @param {object}       [opts.bloom]      {strength,radius,threshold}
   * @param {'over'|'contain'} [opts.clip]   avatar clip plane mode
   * @param {() => void}   [opts.onStats]    ({fps, tris, calls}) => void
   * @param {(info:{fps:number}) => void} [opts.onDegrade]
   */
  constructor(opts = {}) {
    const canvas = opts.canvas;
    if (!canvas) throw new Error('[OrnamentEngine] a <canvas> is required.');

    this.canvas = canvas;
    this.container = opts.container || canvas.parentElement || canvas;
    this.mode = opts.mode || 'frame';
    this.qualityKey = QUALITY_TIERS[opts.quality] ? opts.quality : 'cinematic';
    this.quality = QUALITY_TIERS[this.qualityKey];
    this.interactive = opts.interactive !== false;
    this.pointerMode = opts.pointerMode || 'auto';
    this.autoRotate = opts.autoRotate !== false;
    this.reduceMotion = !!opts.reduceMotion;
    this.onStats = opts.onStats || null;
    this.onDegrade = opts.onDegrade || null;
    this.avatarSrc = opts.avatarSrc || null;
    this.avatarLabel = opts.avatarLabel || 'X';
    this.avatarColor = opts.avatarColor || '#22d3ee';
    this.clipMode = opts.clip || 'over';

    this.preset = (this.mode === 'banner' ? getBanner(opts.ornament) : resolveOrnament(opts.ornament, opts.overrides))
      || (this.mode === 'banner' ? getBanner('neon-tokyo') : resolveOrnament('cyber-neon'));
    if (this.mode === 'banner') this.preset = { ...getBanner(opts.ornament) || getBanner('neon-tokyo'), ...(opts.overrides || {}) };

    /* runtime-tunable knobs (mirrored on the DOM by the customizers) */
    this.opts = {
      tilt: opts.tilt ?? this.preset.tilt ?? 0.26,
      scrollRotation: opts.scrollRotation ?? this.preset.scrollRotation ?? 1,
      bloomStrength: opts.bloomStrength ?? this.preset.bloom?.strength ?? 0.8,
      bloomRadius: opts.bloomRadius ?? this.preset.bloom?.radius ?? 0.7,
      bloomThreshold: opts.bloomThreshold ?? this.preset.bloom?.threshold ?? 0.3,
      spin: opts.spin ?? this.preset.rig?.spin ?? 0.06,
      particleSpeed: opts.particleSpeed ?? 1,
      glassTransmission: opts.glassTransmission ?? null,
      glassRoughness: opts.glassRoughness ?? null,
      glassIor: opts.glassIor ?? null,
      emissive: opts.emissive ?? null,
      exposure: opts.exposure ?? 1.08,
      transmission: opts.transmission ?? this.quality.transmission,
      bloom: opts.bloom ?? this.quality.bloom
    };

    this._pointer = { x: 0, y: 0 };
    this._smooth = { x: 0, y: 0 };
    this._spin = { angle: 0, vel: 0 };
    this._burst = 0;
    this._disposed = false;
    this._visible = true;
    this._frames = 0;
    this._fpsClock = 0;
    this._slowStreak = 0;
    this._clock = new THREE.Clock();
    this._textures = [];
    this._tmpVec = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this._build();
    this._initComposer();
    this._initEvents();
    this.setSize();

    this._raf = requestAnimationFrame(this._tick);
  }

  /* ------------------------------------------------------------- renderer */

  _initRenderer() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: this.quality.antialias,
      powerPreference: 'high-performance'
    });
    renderer.setClearAlpha(0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    // size is applied once the camera exists (end of the constructor)
  }

  _initScene() {
    const cam = this.preset.camera || {};
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(cam.fov ?? 34, 1, 0.1, 60);
    this.camera.position.set(0, 0, cam.z ?? (this.mode === 'banner' ? 3.6 : 3.35));

    this.rig = new THREE.Group();          // gyro tilt lives here
    this.spinGroup = new THREE.Group();    // continuous + scrolled rotation
    this.rig.add(this.spinGroup);
    this.scene.add(this.rig);

    /* lights: subtle key + two colored accents + a rim light behind */
    this.key = new THREE.DirectionalLight(0xffffff, 1.25);
    this.key.position.set(2.2, 3.4, 4.2);
    this.accA = new THREE.PointLight(0x22d3ee, 12, 9, 2);
    this.accA.position.set(-2.1, 1.2, 1.8);
    this.accB = new THREE.PointLight(0xf472b6, 10, 9, 2);
    this.accB.position.set(2.2, -1.4, 1.5);
    this.rim = new THREE.PointLight(0xffffff, 8, 12, 2);
    this.rim.position.set(0, 0.4, -2.4);
    this.ambient = new THREE.AmbientLight(0x0b1020, 1.4);
    this.scene.add(this.key, this.accA, this.accB, this.rim, this.ambient);

    this.envMap = getEnvironment(this.renderer);
    this.scene.environment = this.envMap;
  }

  /* --------------------------------------------------------- scene build */

  _disposeGroup(group) {
    const shared = new Set(textureCache.values());
    group.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isSprite) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture && !shared.has(v) && v !== this.avatarMat?.map) v.dispose?.();
          }
          m.dispose?.();
        });
      }
    });
    while (group.children.length) group.remove(group.children[0]);
  }

  _build() {
    this._disposeGroup(this.spinGroup);
    this._disposeGroup(this.rig);
    this._ringMeshes = [];
    this.glassMats = [];
    this.emissiveMats = [];
    this.glyphMats = [];
    this.flameMats = [];
    // drop references to objects that were just disposed
    this.particleMat = null;
    this.particlePoints = null;
    this._plumes = null;
    this._shards = null;
    this._shardMesh = null;
    this._petals = null;
    this._petalMesh = null;
    this._scan = null;
    this._scanMat = null;
    this._flames = null;
    this._glyphPair = null;
    this.avatarMesh = null;
    this._sharedGlow = glowSprite();

    const p = this.preset;
    const rimMul = p.rim ?? 1;
    const c = p.colors || {};
    this.accA.color.set(c.primary || '#22d3ee');
    this.accB.color.set(c.accent || '#f472b6');
    this.rim.color.set(c.glow || c.primary || '#22d3ee');
    this.accA.intensity = 12 * rimMul;
    this.accB.intensity = 10 * rimMul;
    this.rim.intensity = 8 * rimMul;
    this.key.intensity = 1.05 + 0.35 * rimMul;

    if (this.mode === 'banner') { this._buildBanner(); return; }
    this._buildFrame(p);
  }

  _torusMaterial(glass, emissive, baseColor) {
    let mat;
    const useTransmission = this.opts.transmission !== false && glass?.transmission != null;
    if (useTransmission) {
      const g = { ...glass };
      const em = g.emissive;
      delete g.emissive;
      const emI = g.emissiveIntensity;
      delete g.emissiveIntensity;
      mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(baseColor || '#ffffff'),
        metalness: g.metalness ?? 0,
        roughness: g.roughness ?? 0.08,
        transmission: g.transmission ?? 0.9,
        thickness: g.thickness ?? 0.45,
        ior: g.ior ?? 1.52,
        clearcoat: g.clearcoat ?? 1,
        clearcoatRoughness: g.clearcoatRoughness ?? 0.12,
        attenuationDistance: g.attenuationDistance ?? 1.4,
        attenuationColor: new THREE.Color(g.attenuationColor || '#ffffff'),
        envMapIntensity: g.envMapIntensity ?? 1.15,
        specularIntensity: g.specularIntensity ?? 1,
        iridescence: g.iridescence ?? 0,
        iridescenceIOR: g.iridescenceIOR ?? 1.3,
        dispersion: g.dispersion ?? 0,
        emissive: new THREE.Color(em || '#000000'),
        emissiveIntensity: emI ?? 1
      });
      if (this.opts.glassTransmission != null) mat.transmission = this.opts.glassTransmission;
      if (this.opts.glassRoughness != null) mat.roughness = this.opts.glassRoughness;
      if (this.opts.glassIor != null) mat.ior = this.opts.glassIor;
      if (this.opts.emissive != null) mat.emissiveIntensity = this.opts.emissive;
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
      this.glassMats.push(mat);
    } else if (glass || baseColor) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor || '#dbeafe'),
        metalness: glass?.metalness ?? 0.35,
        roughness: glass?.roughness ?? 0.25,
        emissive: new THREE.Color(glass?.emissive || '#000000'),
        emissiveIntensity: glass?.emissiveIntensity ?? 0.6,
        envMapIntensity: 1.1,
        flatShading: !!glass?.flatShading
      });
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
      this.glassMats.push(mat);
    }
    if (emissive) {
      const glow = new THREE.MeshBasicMaterial({
        color: new THREE.Color(emissive.color || '#ffffff'),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: true
      });
      glow.userData.baseEmissiveIntensity = emissive.intensity ?? 2.4;
      glow.userData.glowScale = emissive.scale ?? 0.7;
      this.emissiveMats.push(glow);
    }
    return mat;
  }

  _buildFrame(p) {
    const rings = p.rings || [];
    rings.forEach((cfg) => {
      const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, cfg.radialSegments || 10, cfg.tubularSegments || 160);
      const main = this._torusMaterial(cfg.glass, null, cfg.color);
      const bandScale = 1.9;
      if (main) {
        const mesh = new THREE.Mesh(geo, main);
        mesh.scale.z = bandScale;
        mesh.userData.spin = cfg.spin ?? 0;
        mesh.rotation.x = cfg.tiltX ?? 0;
        mesh.rotation.y = cfg.tiltY ?? 0;
        this.spinGroup.add(mesh);
        this._ringMeshes = this._ringMeshes || [];
        this._ringMeshes.push(mesh);
      }
      if (cfg.emissive) {
        const gGeo = new THREE.TorusGeometry(cfg.r, Math.max(0.006, cfg.tube * (cfg.emissive.scale ?? 0.7)), 6, 128);
        const glow = this._torusMaterial(null, cfg.emissive, null) || this.emissiveMats[this.emissiveMats.length - 1];
        const mesh = new THREE.Mesh(gGeo, glow);
        mesh.scale.z = bandScale;
        mesh.userData.spin = (cfg.spin ?? 0) * 1.15;
        mesh.rotation.x = cfg.tiltX ?? 0;
        mesh.rotation.y = cfg.tiltY ?? 0;
        this.spinGroup.add(mesh);
      }
    });
    this._ringMeshes = this._ringMeshes || [];

    /* avatar core disc (shared with banner mode) */
    this._buildAvatarDisc(0.9);

    if (p.glyphs) {
      const g = makeGlyphRing(p.glyphs);
      this.spinGroup.add(g);
      this.glyphMats.push(g.material);
      const g2 = makeGlyphRing({ ...p.glyphs, radius: p.glyphs.radius + 0.06, opacity: (p.glyphs.opacity ?? 1) * 0.45, spokes: Math.round((p.glyphs.spokes || 18) * 1.5) });
      g2.scale.z = 0.9;
      this.spinGroup.add(g2);
      this.glyphMats.push(g2.material);
      this._glyphPair = [g, g2];
    }

    if (p.flameRings) {
      this._flames = p.flameRings.map((f) => {
        const m = makeFlameRing(f);
        this.spinGroup.add(m);
        this.flameMats.push(m.material);
        return m;
      });
    }

    if (p.shadowPlumes) this._buildPlumes(p.shadowPlumes);
    if (p.shards) this._buildShards(p.shards);
    if (p.petals) this._buildPetals(p.petals);
    if (p.scanlines) this._buildScanlines(p.scanlines);
    if (p.particles) this._buildParticles(p.particles);
  }

  _buildAvatarDisc(radius = 0.9) {
    const geo = new THREE.CircleGeometry(radius, 96);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -0.02;
    mesh.renderOrder = 1;
    this.avatarMesh = mesh;
    this.avatarMat = mat;
    if (this.clipMode === 'over') {
      this._clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), -0.005);
      mat.clippingPlanes = [this._clipPlane];
      this.renderer.localClippingEnabled = true;
    }
    this.spinGroup.add(mesh);
    this.setAvatar({ src: this.avatarSrc, label: this.avatarLabel, color: this.avatarColor });
  }

  async setAvatar({ src = null, label = 'X', color = '#22d3ee' } = {}) {
    this.avatarSrc = src;
    this.avatarLabel = label;
    this.avatarColor = color;
    if (!this.avatarMesh) return;
    const tex = await createAvatarTexture({ src, label, color });
    if (this._disposed) { tex.dispose(); return; }
    const old = this.avatarMat.map;
    this.avatarMat.map = tex;
    this.avatarMat.needsUpdate = true;
    if (old && old !== tex) {
      this._textures = this._textures.filter((t) => t !== old);
      old.dispose();
    }
    this._textures.push(tex);
  }

  _buildParticles(cfg) {
    const count = Math.max(0, Math.round((cfg.count || 32) * this.quality.particleScale));
    if (!count) return;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const aAngle = new Float32Array(count);
    const aRadius = new Float32Array(count);
    const aSpeed = new Float32Array(count);
    const aOffset = new Float32Array(count);
    const aSize = new Float32Array(count);
    const aMix = new Float32Array(count);

    const c1 = new THREE.Color(cfg.color || '#ffffff');
    const c2 = new THREE.Color(cfg.color2 || cfg.color || '#ffffff');
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      aAngle[i] = Math.random() * TAU;
      aRadius[i] = (cfg.radius || 1.2) + (Math.random() - 0.5) * (cfg.spread || 0.2);
      aSpeed[i] = (0.5 + Math.random()) * (cfg.speed || 0.35) * (Math.random() > 0.5 ? 1 : -1);
      aOffset[i] = (Math.random() - 0.5) * 2;
      aSize[i] = (cfg.size || 0.05) * (0.55 + Math.random() * 0.9);
      aMix[i] = Math.random();
      tmp.copy(c1).lerp(c2, aMix[i]);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      pos[i * 3] = Math.cos(aAngle[i]) * aRadius[i];
      pos[i * 3 + 1] = aOffset[i] * (cfg.height || 0.4);
      pos[i * 3 + 2] = Math.sin(aAngle[i]) * aRadius[i] * 0.35;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(aOffset, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: 120 },
        uHeight: { value: cfg.height || 0.4 },
        uRise: { value: cfg.rise ? 1 : 0 },
        uPulse: { value: cfg.pulse ?? 0.6 },
        uFade: { value: cfg.fade ?? 1 },
        uSpeedMul: { value: this.opts.particleSpeed },
        uMap: { value: this._sharedGlow }
      },
      vertexShader: /* glsl */ `
        attribute float aAngle;
        attribute float aRadius;
        attribute float aSpeed;
        attribute float aOffset;
        attribute float aSize;
        attribute vec3 color;
        uniform float uTime, uHeight, uRise, uSpeedMul, uPixel;
        varying vec2 vP;
        varying vec3 vC;
        varying float vLife;
        void main() {
          float a = aAngle + uTime * aSpeed * uSpeedMul;
          float y = aOffset * uHeight;
          if (uRise > 0.5) {
            float life = fract(aOffset * 0.5 + 0.5 + uTime * (0.10 + abs(aSpeed) * 0.35));
            vLife = sin(life * 3.14159);          // fade in + fade out
            y = mix(-uHeight * 0.6, uHeight * 1.8, life) + sin(a * 4.0 + uTime * 2.0) * 0.05;
          } else {
            vLife = 1.0;
            y += sin(uTime * 1.4 + aOffset * 6.28) * uHeight * 0.25;
          }
          float r = aRadius + sin(uTime * 0.9 + aOffset * 3.0) * 0.03;
          vec3 p = vec3(cos(a) * r, y, sin(a) * r * 0.42);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * uPixel / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
          vP = p.xy;
          vC = color;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uPulse, uFade, uTime;
        varying vec2 vP;
        varying vec3 vC;
        varying float vLife;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float tw = 0.72 + 0.28 * sin(uTime * 4.0 + vP.x * 9.0 + vP.y * 7.0);
          float a = tex.a * uFade * vLife * (0.7 + uPulse * 0.5) * tw;
          if (a < 0.012) discard;
          gl_FragColor = vec4(vC * (1.3 + uPulse), a);
        }
      `
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.particleMat = mat;
    this.particlePoints = pts;
    this.spinGroup.add(pts);
  }

  _buildPlumes(cfg) {
    if (!this.quality.shadowPlumes) return;
    const count = cfg.count || 6;
    const group = new THREE.Group();
    this._plumes = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.ConeGeometry(0.24, cfg.height || 1.4, 20, 4, true);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cfg.color || '#2b0b4a'),
        transparent: true,
        opacity: cfg.opacity ?? 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      mat.userData.plume = true;
      const m = new THREE.Mesh(geo, mat);
      const a = (i / count) * TAU;
      m.position.set(Math.cos(a) * 1.02, -0.75, Math.sin(a) * 0.4);
      m.userData.phase = a;
      m.userData.speed = cfg.speed || 0.35;
      m.userData.rimColor = new THREE.Color(cfg.rimColor || '#a855f7');
      group.add(m);
      this._plumes.push(m);
      this.flameMats.push(mat);
    }
    this.spinGroup.add(group);
  }

  _buildShards(cfg) {
    const count = Math.max(0, Math.round((cfg.count || 8) * (this.quality.particleScale || 1)));
    if (!count) return;
    const geo = new THREE.OctahedronGeometry(cfg.size || 0.07, 0);
    const mat = cfg.glassy && this.opts.transmission !== false
      ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(cfg.color || '#e0f2fe'),
        metalness: 0, roughness: 0.05,
        transmission: 0.92, thickness: 0.25, ior: 1.7,
        emissive: new THREE.Color(cfg.emissive || '#7dd3fc'),
        emissiveIntensity: 0.8, envMapIntensity: 1.4,
        transparent: true, opacity: cfg.opacity ?? 1
      })
      : new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.color || '#1b0b31'),
        metalness: 0.6, roughness: 0.3,
        emissive: new THREE.Color(cfg.emissive || '#b06bff'),
        emissiveIntensity: 1.1,
        transparent: true, opacity: cfg.opacity ?? 0.95,
        flatShading: true
      });
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
    this.glassMats.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._shards = [];
    for (let i = 0; i < count; i++) {
      this._shards.push({
        angle: (i / count) * TAU + Math.random() * 0.4,
        radius: (cfg.radius || 1.3) + (Math.random() - 0.5) * 0.18,
        y: (Math.random() - 0.5) * 1.1,
        speed: (cfg.speed || 0.25) * (0.6 + Math.random() * 0.8) * (i % 2 ? -1 : 1),
        bob: Math.random() * TAU,
        rot: new THREE.Euler(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
        spin: (Math.random() - 0.5) * 1.6,
        scale: 0.7 + Math.random() * 0.7
      });
    }
    this._shardMesh = mesh;
    this._shardMat = mat;
    this.spinGroup.add(mesh);
  }

  _buildPetals(cfg) {
    const count = Math.max(0, Math.round((cfg.count || 18) * (this.quality.particleScale || 1)));
    if (!count) return;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.5, 0.25, 0.42, 0.85, 0, 1);
    shape.bezierCurveTo(-0.42, 0.85, -0.5, 0.25, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 8);
    geo.scale(cfg.size || 0.07, cfg.size || 0.07, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color || '#ff9ecb'),
      emissive: new THREE.Color(cfg.color2 || '#fff'),
      emissiveIntensity: 0.35,
      roughness: 0.6, metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: cfg.opacity ?? 0.9
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._petals = [];
    for (let i = 0; i < count; i++) {
      this._petals.push({
        angle: Math.random() * TAU,
        radius: (cfg.radius || 1.4) * (0.65 + Math.random() * 0.6),
        y: (Math.random() - 0.5) * 2.4,
        fall: (cfg.fall || 0.22) * (0.6 + Math.random() * 0.9),
        swirl: 0.4 + Math.random() * 0.8,
        spin: (Math.random() - 0.5) * 2.4,
        rot: Math.random() * TAU
      });
    }
    this._petalMesh = mesh;
    this.spinGroup.add(mesh);
  }

  _buildScanlines(cfg) {
    const geo = new THREE.CylinderGeometry(cfg.radius, cfg.radius, 2.05, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: scanlineStrip(),
      color: new THREE.Color(cfg.color || '#22d3ee'),
      transparent: true,
      opacity: cfg.opacity ?? 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._scan = new THREE.Mesh(geo, mat);
    this._scanMat = mat;
    this.spinGroup.add(this._scan);
  }

  /* ------------------------------------------------------- banner builder */

  _buildBanner() {
    const p = this.preset;
    const pw = p.plane?.width ?? 2.9;
    const ph = p.plane?.height ?? 1.12;
    this._bannerPlaneWidth = pw;

    /* procedural city / nebula canvas → texture on a gently curved plane */
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = Math.round((1024 * ph) / pw);
    this._bannerCanvas = cv;
    const st = document.createElement('canvas');   // cached static layer
    st.width = cv.width;
    st.height = cv.height;
    this._bannerStatic = st;
    this._drawBannerStatic();
    this._bannerTex = new THREE.CanvasTexture(cv);
    this._bannerTex.colorSpace = THREE.SRGBColorSpace;
    this._bannerTex.anisotropy = 4;
    this._textures.push(this._bannerTex);
    this._drawBannerFrame(0);

    if (p.imageOverride) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(p.imageOverride, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        const old = this._bannerMat.map;
        this._bannerMat.map = t;
        this._bannerMat.needsUpdate = true;
        if (old && old !== this._bannerTex) old.dispose();
      }, undefined, () => {});
    }

    const geo = new THREE.PlaneGeometry(pw, ph, 64, 24);
    if (p.plane?.curve) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = -Math.pow(x / (pw * 0.55), 2) * p.plane.curve;
        pos.setZ(i, z);
      }
      geo.computeVertexNormals();
    }
    const mat = new THREE.MeshStandardMaterial({
      map: p.imageOverride ? null : this._bannerTex,
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0.15,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.6,
      emissiveMap: p.imageOverride ? null : this._bannerTex,
      transparent: true
    });
    this._bannerMat = mat;
    mat.userData.baseEmissiveIntensity = 0.6;
    this.glassMats.push(mat);
    const plane = new THREE.Mesh(geo, mat);
    this.bannerPlane = plane;
    this.spinGroup.add(plane);

    /* framing edge: thin glass rail on the bottom + top for the "mounted" look */
    const railGeo = new THREE.BoxGeometry(pw * 1.01, 0.012, 0.02);
    const railMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(p.colors?.primary || '#22d3ee'),
      transmission: this.opts.transmission === false ? 0 : 0.7,
      thickness: 0.1, roughness: 0.12, ior: 1.4,
      emissive: new THREE.Color(p.colors?.glow || '#22d3ee'),
      emissiveIntensity: 1.8,
      metalness: 0.2
    });
    railMat.userData.baseEmissiveIntensity = 1.8;
    this.glassMats.push(railMat);
    [-1, 1].forEach((s) => {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(0, (s * ph) / 2 + s * 0.006, 0.03);
      this.spinGroup.add(rail);
    });

    if (p.particles) this._buildBannerParticles(p.particles);
    if (p.shards) this._buildShards(p.shards);
    if (p.petals) this._buildPetals({ ...p.petals, radius: 1.6 });
  }

  /**
   * Static banner layers (sky, stars, fog, skyline silhouettes) are painted
   * ONCE into an offscreen canvas; `_drawBannerFrame` then blits it and adds
   * only the animated bits — 60 fps friendly, no per-frame path storms.
   */
  _drawBannerStatic() {
    const cv = this._bannerStatic;
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    const p = this.preset;
    const c = p.colors || {};
    const horizon = h * 0.72;
    const sl = p.skyline || {};

    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05060d');
    sky.addColorStop(0.45, c.primary ? mixHex(c.primary, '#05060d', 0.78) : '#0a1020');
    sky.addColorStop(0.78, c.accent ? mixHex(c.accent, '#05060d', 0.72) : '#150a24');
    sky.addColorStop(1, '#02030a');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 260; i++) {
      const x = frac(Math.sin(i * 12.9898) * 43758.5453) * w;
      const y = frac(Math.sin(i * 78.233) * 12345.678) * h * 0.6;
      const a = 0.12 + 0.5 * frac(Math.sin(i * 3.7) * 9543.7);
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      g.fillRect(x, y, 1.5, 1.5);
    }

    if (sl.fog) {
      const fg = g.createLinearGradient(0, horizon - h * 0.26, 0, horizon + 4);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(1, sl.fog);
      g.fillStyle = fg;
      g.fillRect(0, horizon - h * 0.26, w, h * 0.3);
    }

    const drawLayer = (count, minH, maxH, shade, lit, offset) => {
      for (let i = 0; i < count; i++) {
        const seed = Math.abs(Math.sin((i + 1) * 12.9898 + offset));
        const bw = (w / (count * 1.35)) * (0.6 + seed * 0.9);
        const bh = h * (minH + (maxH - minH) * seed);
        const bx = frac((i / count) * 1.06 + offset * 0.013) * w - bw * 0.25;
        g.fillStyle = shade;
        g.fillRect(bx, horizon - bh, bw, bh + 2);
        if (lit) {
          const cols = Math.max(2, Math.floor(bw / 9));
          const rows = Math.max(3, Math.floor(bh / 12));
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              const on = Math.sin(cx * 3.1 + cy * 7.7 + i * 11.3 + offset) > 0.45;
              if (!on) continue;
              g.fillStyle = `rgba(255,246,214,${(0.2 + 0.45 * Math.abs(Math.sin(cx + cy * 2 + i))).toFixed(2)})`;
              g.fillRect(bx + 3 + cx * (bw / cols), horizon - bh + 5 + cy * (bh / rows), 2.4, 3.4);
            }
          }
        }
        /* roof antenna light */
        if (lit && seed > 0.72) {
          g.fillStyle = 'rgba(255,90,90,0.85)';
          g.fillRect(bx + bw * 0.5, horizon - bh - 6, 2, 6);
        }
      }
    };
    if (sl.buildings) {
      drawLayer(Math.max(4, Math.round(sl.buildings * 0.65)), 0.16, 0.4, 'rgba(10,13,28,0.9)', false, 3.3);
      drawLayer(sl.buildings, 0.24, 0.7, 'rgba(5,7,16,0.98)', true, 0.9);
    }

    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.12, w / 2, h / 2, h * 1.2);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.66)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }

  /** Paint one banner frame (blit static layer + animated overlays). */
  _drawBannerFrame(t) {
    const cv = this._bannerCanvas;
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    const p = this.preset;
    const c = p.colors || {};
    const sl = p.skyline || {};
    const horizon = h * 0.72;

    g.globalCompositeOperation = 'source-over';
    if (this._bannerStatic) g.drawImage(this._bannerStatic, 0, 0);
    else { g.fillStyle = '#05060d'; g.fillRect(0, 0, w, h); }

    /* neon billboards with flicker */
    if (sl.billboards) {
      const pal = sl.palette || ['#22d3ee', '#f472b6', '#8b5cf6'];
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < sl.billboards; i++) {
        const seed = Math.abs(Math.sin(i * 45.164));
        const bw = w * (0.035 + seed * 0.05);
        const bh = h * (0.07 + seed * 0.15);
        const bx = frac((i + 0.5) / sl.billboards) * w;
        const by = horizon - h * (0.2 + seed * 0.44);
        const col = pal[i % pal.length];
        const flick = 0.5 + 0.5 * Math.abs(Math.sin(t * (1.1 + seed * 1.8) + i));
        g.shadowColor = col;
        g.shadowBlur = 20 * flick;
        g.fillStyle = hexA(col, 0.35 + 0.45 * flick);
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = hexA('#ffffff', 0.2 * flick);
        for (let l = 0; l < 4; l++) {
          const ly = by + (bh / 5) * (l + 1);
          g.fillRect(bx + bw * 0.12, ly, bw * (0.35 + 0.6 * Math.abs(Math.sin(l * 2 + t * 0.9 + i))), Math.max(2, bh * 0.05));
        }
      }
      g.restore();
    }

    /* scrolling reflective floor grid */
    if (sl.floorGrid) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = hexA(c.primary || '#22d3ee', 0.42);
      g.lineWidth = 1.15;
      const vpx = w * 0.5;
      for (let i = -14; i <= 14; i++) {
        g.beginPath();
        g.moveTo(vpx + i * 24, horizon + 2);
        g.lineTo(vpx + i * w * 0.13, h + 40);
        g.stroke();
      }
      for (let r = 0; r < 10; r++) {
        const prog = (r / 10 + ((t * 0.05) % 0.1)) % 1;
        const yy = horizon + 2 + Math.pow(prog, 2.2) * (h - horizon + 40);
        g.globalAlpha = 0.45 * (1 - prog);
        g.beginPath();
        g.moveTo(0, yy);
        g.lineTo(w, yy);
        g.stroke();
      }
      g.restore();
    }

    /* violet rift rings */
    if (p.rift) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < p.rift.rings; i++) {
        const rad = h * (0.16 + i * 0.075) * (1 + 0.06 * Math.sin(t * 1.4 + i));
        g.strokeStyle = hexA(i % 2 ? p.rift.accent : p.rift.color, 0.4 - i * 0.05);
        g.lineWidth = Math.max(0.6, 3 - i * 0.35);
        g.shadowColor = p.rift.color;
        g.shadowBlur = 26;
        g.beginPath();
        g.ellipse(w * 0.5, horizon - h * 0.22, rad * 2.4, rad, 0, 0, TAU);
        g.stroke();
      }
      g.restore();
    }

    /* ember glow */
    if (p.flames) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < p.flames.rings; i++) {
        const rad = h * (0.2 + i * 0.1) * (1 + 0.09 * Math.sin(t * 2.2 + i * 1.7));
        const grd = g.createRadialGradient(w * 0.5, h * 0.88, rad * 0.2, w * 0.5, h * 0.88, rad * 2.6);
        grd.addColorStop(0, hexA(i % 2 ? p.flames.accent : p.flames.color, 0.2));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(w * 0.5, h * 0.88, rad * 2.6, rad, 0, 0, TAU);
        g.fill();
      }
      g.restore();
    }

    /* bottom fade so the profile content can sit on top */
    const fade = g.createLinearGradient(0, h * 0.45, 0, h);
    fade.addColorStop(0, 'rgba(6,7,13,0)');
    fade.addColorStop(1, 'rgba(6,7,13,0.94)');
    g.fillStyle = fade;
    g.fillRect(0, h * 0.45, w, h * 0.55);

    this._bannerTex.needsUpdate = true;
  }


  _buildBannerParticles(cfg) {
    const count = Math.max(0, Math.round((cfg.count || 60) * this.quality.particleScale));
    if (!count) return;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const aAngle = new Float32Array(count);
    const aRadius = new Float32Array(count);
    const aSpeed = new Float32Array(count);
    const aOffset = new Float32Array(count);
    const aSize = new Float32Array(count);
    const c1 = new THREE.Color(cfg.color || '#9fe9ff');
    const c2 = new THREE.Color(cfg.color2 || '#ffffff');
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      aAngle[i] = Math.random() * TAU;
      aRadius[i] = 0.6 + Math.random() * (cfg.spread || 1.8);
      aSpeed[i] = (0.4 + Math.random()) * (cfg.speed || 0.08) * (i % 2 ? -1 : 1);
      aOffset[i] = (Math.random() - 0.5) * 2;
      aSize[i] = (cfg.size || 0.02) * (0.6 + Math.random());
      tmp.copy(c1).lerp(c2, Math.random());
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(aOffset, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uPixel: { value: 260 }, uHeight: { value: 0.55 },
        uRise: { value: cfg.rise ? 1 : 0 }, uPulse: { value: 0.4 }, uFade: { value: 1 },
        uSpeedMul: { value: this.opts.particleSpeed }, uMap: { value: this._sharedGlow }
      },
      vertexShader: /* glsl */ `
        attribute float aAngle; attribute float aRadius; attribute float aSpeed;
        attribute float aOffset; attribute float aSize; attribute vec3 color;
        uniform float uTime, uHeight, uRise, uSpeedMul, uPixel;
        varying vec2 vP; varying vec3 vC; varying float vLife;
        void main() {
          float a = aAngle + uTime * aSpeed * uSpeedMul;
          float y = aOffset * uHeight;
          if (uRise > 0.5) {
            float life = fract(aOffset * 0.5 + 0.5 + uTime * 0.16);
            vLife = sin(life * 3.14159);
            y = mix(-0.5, 0.9, life);
          } else { vLife = 1.0; y += sin(uTime * 0.9 + aOffset * 6.28) * uHeight * 0.4; }
          vec3 p = vec3(cos(a) * aRadius * 2.4, y, sin(a) * aRadius * 0.5 - 0.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * uPixel / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
          vP = p.xy; vC = color;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uPulse, uFade, uTime;
        varying vec2 vP; varying vec3 vC; varying float vLife;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float tw = 0.7 + 0.3 * sin(uTime * 3.0 + vP.x * 6.0 + vP.y * 5.0);
          float a = tex.a * uFade * vLife * tw;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC * (1.2 + uPulse), a);
        }
      `
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.particleMat = mat;
    this.spinGroup.add(pts);
  }

  /* ------------------------------------------------------------ composer */

  _initComposer() {
    this.bloomPass = null;
    this.composer = null;
    if (!this.opts.bloom) { this._bloomEnabled = false; return; }
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.qualityKey === 'cinematic' ? 4 : 0
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      this.opts.bloomStrength,
      this.opts.bloomRadius,
      this.opts.bloomThreshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.bloomPass = bloom;
    this._bloomEnabled = true;
  }

  setBloom(enabled) {
    if (enabled && !this.composer) {
      this.opts.bloom = true;
      this._initComposer();
      this.setSize();
    } else if (!enabled && this.composer) {
      this.composer.dispose?.();
      this.composer = null;
      this.bloomPass = null;
      this.opts.bloom = false;
    }
    this._bloomEnabled = !!this.composer;
  }

  /* -------------------------------------------------------------- events */

  _initEvents() {
    const el = this.container;
    this._onPointerMove = (e) => {
      const r = (el.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 });
      this._pointer.x = clamp(((e.clientX - r.left) / (r.width || 1)) * 2 - 1, -1, 1);
      this._pointer.y = clamp(((e.clientY - r.top) / (r.height || 1)) * 2 - 1, -1, 1);
    };
    this._onPointerLeave = () => { this._pointer.x = 0; this._pointer.y = 0; };
    this._onPointerDown = () => {
      this._burst = 1;
      this._drag = { lastX: 0, active: true };
    };
    this._onDragMove = (e) => {
      if (!this._drag?.active) return;
      const dx = e.clientX - (this._drag.lastX ?? e.clientX);
      this._drag.lastX = e.clientX;
      this._spin.vel += dx * 0.012 * (this.opts.scrollRotation || 1);
    };
    this._onPointerUp = () => { if (this._drag) this._drag.active = false; };
    this._onWheel = (e) => {
      const d = Math.abs(e.deltaY) > 100 ? 100 : Math.abs(e.deltaY);
      this._spin.vel += Math.sign(e.deltaY) * (d / 100) * 0.35 * (this.opts.scrollRotation || 1);
      if (Math.abs(this._spin.vel) > 0.05) e.preventDefault?.();
    };
    this._onVisibility = () => { this._tabVisible = document.visibilityState !== 'hidden'; };
    this._onResize = () => this.setSize();

    if (this.interactive) {
      // hover/pointer tracking never blocks the page …
      el.addEventListener('pointermove', this._onPointerMove, { passive: true });
      el.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
      // … but drag-spin and click-burst do intercept, so they are opt-in
      if (this.pointerMode === 'block') {
        el.addEventListener('pointerdown', this._onPointerDown, { passive: true });
        window.addEventListener('pointermove', this._onDragMove, { passive: true });
        window.addEventListener('pointerup', this._onPointerUp, { passive: true });
        el.addEventListener('wheel', this._onWheel, { passive: false });
      }
    }
    window.addEventListener('visibilitychange', this._onVisibility);
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this.setSize());
      this._ro.observe(el);
    } else {
      window.addEventListener('resize', this._onResize);
    }
    if (typeof IntersectionObserver === 'function') {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((en) => en.isIntersecting);
      }, { rootMargin: '120px' });
      this._io.observe(el);
    }
  }

  /* ------------------------------------------------------------ resizing */

  setSize() {
    if (!this.renderer || !this.camera) return;
    const el = this.container;
    const rect = el?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const w = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 1));
    const h = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 1));
    const dpr = clamp(window.devicePixelRatio || 1, 1, this.quality.dprMax);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio?.(dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;

    /* Fit the ornament inside the box for any aspect ratio.
       Frame rig has a content radius ≈ 1.55; banner plane is 2.9 × 1.12. */
    const vFov = (this.camera.fov * Math.PI) / 180;
    if (this.mode === 'frame') {
      this.camera.position.z = 3.35;
      const halfV = Math.tan(vFov / 2) * 3.35;
      const halfH = halfV * this.camera.aspect;
      const r = 1.62;
      const s = clamp(Math.min(halfV / r, halfH / r), 0.35, 1.25);
      this.fitScale = s;
    } else {
      this.camera.position.z = 3.6;
      const halfV = Math.tan(vFov / 2) * 3.6;
      const halfH = halfV * this.camera.aspect;
      this.fitScale = clamp(Math.min((halfH * 2) / 3.12, (halfV * 2) / 1.32), 0.4, 1.6);
    }
    this._applyFit();
    this.camera.updateProjectionMatrix();
    this.bloomPass?.setSize?.(w, h);
    /* gl_PointSize = aSize * uPixel / dist  →  uPixel is the px-per-unit scale */
    if (this.particleMat) this.particleMat.uniforms.uPixel.value = Math.round(Math.min(w, h) * 2.2);
  }

  _applyFit() {
    // scale is applied every frame in _updateRig so it survives the breathing pulse
    this.rig.userData.fitScale = this.fitScale || 1;
  }

  /* ------------------------------------------------------------- updates */

  _updateRig(dt, time) {
    const tilt = this.opts.tilt ?? 0;
    const tx = -this._pointer.y * tilt;
    const ty = this._pointer.x * tilt;
    const L = this.reduceMotion ? 26 : 7.5;
    this._smooth.x = damp(this._smooth.x, tx, L, dt);
    this._smooth.y = damp(this._smooth.y, ty, L, dt);
    this.rig.rotation.x = this._smooth.x;
    this.rig.rotation.y = this._smooth.y;
    this.rig.position.z = this._smooth.y * 0.35;

    /* scroll / drag spin with angular damping */
    this._spin.vel = damp(this._spin.vel, 0, 2.4, dt);
    if (this.autoRotate && !this.reduceMotion) this._spin.angle += (this.opts.spin || 0) * dt;
    this._spin.angle += this._spin.vel * dt;
    this.spinGroup.rotation.z = this._spin.angle;

    /* click burst: brief glow + scale punch */
    if (this._burst > 0.001) {
      this._burst = damp(this._burst, 0, 3.2, dt);
    } else this._burst = 0;
    const pulse = (this.fitScale || 1) * (1 + 0.014 * Math.sin(time * 1.6) + this._burst * 0.045);
    this.rig.scale.setScalar(pulse);

    /* camera parallax (banner mode leans on this instead of rig tilt) */
    const camPush = this.mode === 'banner' ? 0.16 : 0.06;
    this.camera.position.x = damp(this.camera.position.x, this._pointer.x * camPush, 5, dt);
    this.camera.position.y = damp(this.camera.position.y, -this._pointer.y * camPush * 0.6, 5, dt);
    this.camera.lookAt(0, 0, 0);

    /* breathing emissive → everything that stores a base intensity */
    const breathe = 1 + 0.16 * Math.sin(time * 1.35) + this._burst * 0.9;
    for (const m of this.glassMats) {
      const base = m.userData.baseEmissiveIntensity;
      if (base != null) m.emissiveIntensity = base * breathe;
    }
    for (const m of this.emissiveMats) m.opacity = clamp(0.55 + 0.35 * (breathe - 1) + 0.35 + this._burst * 0.3, 0.2, 1);

    /* ring self-rotation */
    for (const r of this._ringMeshes || []) {
      if (r.userData.spin) r.rotation.z += r.userData.spin * dt * (this.reduceMotion ? 0.15 : 1);
    }

    /* shader clocks */
    for (const m of this.glyphMats) { m.uniforms.uTime.value = time; m.uniforms.uSpin.value = this._spin.angle; }
    for (const m of this.flameMats) { if (m.uniforms?.uTime) m.uniforms.uTime.value = time * (this.reduceMotion ? 0.3 : 1); }
    if (this.particleMat) this.particleMat.uniforms.uTime.value = time;
    if (this._scan) {
      this._scanMat.map.offset.y = (time * 0.12) % 1;
      this._scanMat.opacity = (this.preset.scanlines?.opacity ?? 0.16) * (0.7 + 0.3 * Math.sin(time * 2));
    }
    if (this._plumes) {
      for (const pl of this._plumes) {
        const s = 0.75 + 0.35 * Math.sin(time * pl.userData.speed * 2 + pl.userData.phase);
        pl.scale.set(0.8 + s * 0.4, s * 1.3, 0.8 + s * 0.4);
        pl.material.opacity = (this.preset.shadowPlumes?.opacity ?? 0.45) * (0.5 + 0.5 * s);
        pl.rotation.y += dt * 0.4;
      }
    }
    if (this._shardMesh) this._updateInstances(this._shardMesh, this._shards, time, dt, 'shard');
    if (this._petalMesh) this._updateInstances(this._petalMesh, this._petals, time, dt, 'petal');

    if (this._bloomEnabled && this.bloomPass) {
      this.bloomPass.strength = (this.opts.bloomStrength || 0) * (1 + this._burst * 0.35);
      this.bloomPass.radius = this.opts.bloomRadius;
      this.bloomPass.threshold = this.opts.bloomThreshold;
    }
  }

  _updateInstances(mesh, list, time, dt, kind) {
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4());
    const q = this._q || (this._q = new THREE.Quaternion());
    const e = this._e || (this._e = new THREE.Euler());
    const v = this._v || (this._v = new THREE.Vector3());
    const s = this._s || (this._s = new THREE.Vector3());
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (kind === 'shard') {
        it.angle += it.speed * dt;
        const y = it.y + Math.sin(time * 0.9 + it.bob) * 0.12;
        v.set(Math.cos(it.angle) * it.radius, y, Math.sin(it.angle) * it.radius * 0.4);
        e.set(it.rot.x + time * it.spin, it.rot.y + time * it.spin * 0.8, it.rot.z);
        const sc = it.scale * (1 + 0.06 * Math.sin(time * 2 + it.bob));
        s.set(sc, sc, sc);
      } else {
        it.y -= it.fall * dt;
        if (it.y < -1.4) { it.y = 1.5; it.angle = Math.random() * TAU; }
        it.rot += it.spin * dt;
        const a = it.angle + time * it.swirl * 0.2;
        v.set(Math.cos(a) * it.radius, it.y, Math.sin(a) * it.radius * 0.4);
        e.set(it.rot, it.rot * 0.7, a);
        s.set(1, 1, 1);
      }
      q.setFromEuler(e);
      m4.compose(v, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _tick = () => {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._tick);
    if (!this._visible || this._tabVisible === false) return;

    const dt = clamp(this._clock.getDelta(), 0, 0.05);
    const time = this._clock.elapsedTime;

    if (this._bannerTex && this.preset.animated !== false && this.mode === 'banner') {
      this._bannerTick = (this._bannerTick || 0) + dt;
      if (this._bannerTick > 0.066) { this._drawBannerFrame(this._bannerTick); this._bannerTick = 0; }
    }

    this._updateRig(dt, time);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    /* fps watch → optional auto-degrade */
    if (this.onStats || this.onDegrade) {
      this._frames++;
      this._fpsClock += dt;
      if (this._fpsClock >= 1) {
        const fps = this._frames / this._fpsClock;
        this._frames = 0;
        this._fpsClock = 0;
        const info = this.renderer.info;
        this.onStats?.({ fps, tris: info.render.triangles, calls: info.render.calls, dpr: this.renderer.getPixelRatio() });
        if (this.onDegrade) {
          if (fps < 32) this._slowStreak++; else this._slowStreak = 0;
          if (this._slowStreak >= 3) { this._slowStreak = 0; this.onDegrade({ fps }); }
        }
      }
    }
  };

  /* ------------------------------------------------------- public setters */

  setOrnament(id, overrides) {
    const next = resolveOrnament(id, overrides);
    if (!next) return false;
    this.preset = next;
    this.opts.tilt = overrides?.tilt ?? next.tilt ?? this.opts.tilt;
    this.opts.scrollRotation = overrides?.scrollRotation ?? next.scrollRotation ?? this.opts.scrollRotation;
    if (overrides?.bloomStrength == null && next.bloom) {
      this.opts.bloomStrength = next.bloom.strength;
      this.opts.bloomRadius = next.bloom.radius;
      this.opts.bloomThreshold = next.bloom.threshold;
    }
    this._build();
    return true;
  }

  /** Patch runtime knobs; `structural: true` forces a rebuild. */
  setOptions(patch = {}) {
    const structural = ['rings', 'particles', 'glyphs', 'quality', 'transmission', 'bloom'].some((k) => k in patch);
    Object.assign(this.opts, patch);
    if (patch.quality && QUALITY_TIERS[patch.quality]) {
      this.qualityKey = patch.quality;
      this.quality = QUALITY_TIERS[patch.quality];
      this.opts.transmission = this.quality.transmission;
      this.setSize();
      this._build();
      return;
    }
    if (patch.bloomStrength != null && this.bloomPass) this.bloomPass.strength = patch.bloomStrength;
    if ('transmission' in patch) this._build();
    else if (structural) this._build();
    if (patch.glassTransmission != null) this.glassMats.forEach((m) => { m.transmission = patch.glassTransmission; });
    if (patch.glassRoughness != null) this.glassMats.forEach((m) => { m.roughness = patch.glassRoughness; });
    if (patch.glassIor != null) this.glassMats.forEach((m) => { m.ior = patch.glassIor; });
    if (patch.emissive != null) this.glassMats.forEach((m) => {
      m.emissiveIntensity = patch.emissive;
      m.userData.baseEmissiveIntensity = patch.emissive;
    });
    if (patch.particleSpeed != null && this.particleMat) this.particleMat.uniforms.uSpeedMul.value = patch.particleSpeed;
    if (patch.autoRotate !== undefined) this.autoRotate = !!patch.autoRotate;
    /* brand-tintable lights: lets the app push the live poster colour into the
       rim/accents so the ornament always matches the anime currently on screen */
    if (patch.rimColor) {
      this.rim.color.set(patch.rimColor);
      this.accA.color.set(patch.rimColor);
      if (this.preset?.colors) this.preset.colors = { ...this.preset.colors, glow: patch.rimColor };
    }
    if (patch.accentColor) { this.accB.color.set(patch.accentColor); }
    if (patch.exposure != null) this.renderer.toneMappingExposure = patch.exposure;
    if (patch.spin != null) this.opts.spin = patch.spin;
  }

  /** Burst of light + motion — call on hover/selection for tactile feedback. */
  pulse(strength = 1) { this._burst = clamp(strength, 0, 2); }

  /** Force one frame (useful for thumbnails / `renderStill`). */
  renderNow() {
    if (this.composer) this.composer.render(0);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Off-time snapshot for social cards / thumbnails.
   * @returns {string} dataURL (PNG with alpha)
   */
  toDataURL(type = 'image/png', quality = 0.92) {
    this.renderNow();
    return this.canvas.toDataURL(type, quality);
  }

  getStats() {
    const info = this.renderer.info;
    return {
      fps: null,
      quality: this.qualityKey,
      bloom: !!this.composer,
      transmission: this.opts.transmission !== false,
      tris: info.render.triangles,
      calls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      dpr: this.renderer.getPixelRatio()
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    const el = this.container;
    el.removeEventListener?.('pointermove', this._onPointerMove);
    el.removeEventListener?.('pointerleave', this._onPointerLeave);
    el.removeEventListener?.('pointerdown', this._onPointerDown);
    el.removeEventListener?.('pointermove', this._onDragMove);
    el.removeEventListener?.('wheel', this._onWheel);
    window.removeEventListener?.('pointermove', this._onDragMove);
    window.removeEventListener?.('pointerup', this._onPointerUp);
    window.removeEventListener?.('visibilitychange', this._onVisibility);
    window.removeEventListener?.('resize', this._onResize);
    this._ro?.disconnect?.();
    this._io?.disconnect?.();
    this._disposeGroup(this.rig);
    this.avatarMat?.map?.dispose?.();
    this.composer?.dispose?.();
    this.scene?.traverse?.((o) => o.material?.dispose?.());
    this.renderer?.dispose?.();
    this.renderer?.forceContextLoss?.();
  }
}

/* ----------------------------------------------------------- color utils */

function frac(n) { return n - Math.floor(n); }
function hexToRgb(hex) {
  const h = (hex || '#ffffff').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mixHex(a, b, amount) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * amount);
  return `rgb(${m(A.r, B.r)}, ${m(A.g, B.g)}, ${m(A.b, B.b)})`;
}
function hexA(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------- bootstrap */

/**
 * Feature-detect + mount in one call. Returns null when WebGL is unavailable
 * so callers can fall back to the 2D CSS frame without try/catch noise.
 */
export async function mountOrnament(options = {}) {
  const canvas = options.canvas || document.createElement('canvas');
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) return null;
  try {
    return new OrnamentEngine({ ...options, canvas });
  } catch (err) {
    console.warn('[ornaments] engine failed to start:', err?.message || err);
    return null;
  }
}

export { THREE };
