/**
 * ============================================================================
 *  Hearbor — 3D Ornaments · presets catalog (framework-agnostic)
 * ============================================================================
 *  Every preset is a plain data object. It is consumed by:
 *    • `OrnamentEngine` (Three.js)  → geometry / materials / particles / bloom
 *    • the React wrappers           → gallery + live customizer
 *    • the standalone HTML demo     → vanilla customizer
 *
 *  A preset can always be overridden at runtime:
 *      engine.setOptions({ bloomStrength: 1.2, tilt: 0 })
 *      engine.setOptions({ rings: [{ ...rings[0], spin: -0.3 }] })
 *
 *  ── Preset field reference ────────────────────────────────────────────────
 *  rings[]        concentric bevel rings. r = radius multiplier of the frame
 *                 unit, tube = thickness, radialSegments/tubularSegments for
 *                 tessellation, spin = rad/s around Z, tiltX/tiltY = static
 *                 lean, glass{...} = MeshPhysicalMaterial props (null = no
 *                 glass, use emissive-only core), emissive{...} = glow core.
 *  particles      orbiting glowing sprites {count, radius, height, speed…}
 *  glyphs         shader-driven rune / tick ring {kind, color2, spokes…}
 *  shadowPlumes   volumetric-looking cone shells (shadow-mancer style)
 *  shards         instanced floating crystals
 *  petals         instanced falling blossom quads
 *  tilt           mouse-follow gyro amplitude in radians (0 disables)
 *  scrollRotation how much the whole rig rotates with wheel / drag
 *  rim            accent rim-light intensity multiplier
 *  bloom          {strength, radius, threshold} — UnrealBloomPass defaults
 *  css            2D fallback (used when WebGL is missing or `quality:'css'`)
 * ============================================================================
 */

export const ORNAMENT_VERSION = '1.0.0';

/** Neutral glass body shared by the hero presets. */
const GLASS = {
  transmission: 0.9,
  roughness: 0.08,
  ior: 1.52,
  thickness: 0.45,
  clearcoat: 1,
  clearcoatRoughness: 0.12,
  attenuationDistance: 1.4,
  envMapIntensity: 1.15,
  specularIntensity: 1
};

export const ORNAMENT_PRESETS = {
  /* ------------------------------------------------------------------ */
  'royal-flame': {
    id: 'royal-flame',
    icon: '🔥',
    labelAr: 'لهب التنين الملكي',
    labelEn: 'Royal Dragon Flame',
    descAr: 'حلقة زجاجية من obsidian وذهب الياقوت مع جمر صاعد وشرائط لهب.',
    descEn: 'Obsidian + ruby-gold glass ring, rising embers and flame ribbons.',
    colors: { primary: '#ff7a1a', accent: '#ffd166', glow: '#ff3d2e' },
    background: 'radial-gradient(circle at 50% 55%, #2a0d05 0%, #0a0406 70%)',
    rig: { spin: 0.05 },
    tilt: 0.26,
    scrollRotation: 1.2,
    rim: 1.35,
    bloom: { strength: 0.78, radius: 0.72, threshold: 0.42 },
    rings: [
      { r: 1, tube: 0.05, radialSegments: 12, tubularSegments: 168, spin: 0.14, tiltX: 0, color: '#3b0f0a', glass: GLASS, emissive: { color: '#ff5a1f', intensity: 2.4, scale: 0.72 } },
      { r: 1.085, tube: 0.018, radialSegments: 8, tubularSegments: 168, spin: -0.26, tiltX: 0.16, color: '#e8b25a', glass: { ...GLASS, transmission: 0.62, roughness: 0.18, metalness: 1, emissive: '#ff9d3c', emissiveIntensity: 0.7 }, emissive: null },
      { r: 1.17, tube: 0.011, radialSegments: 6, tubularSegments: 168, spin: 0.42, tiltX: -0.22, color: '#ffd166', glass: null, emissive: { color: '#ffb066', intensity: 3.1 }, flat: true }
    ],
    glyphs: { kind: 'rune', color: '#ff8a3d', color2: '#ffe9a8', radius: 1.25, width: 0.14, spokes: 18, opacity: 0.9 },
    particles: {
      count: 42, radius: 1.22, spread: 0.16, height: 0.72, rise: true,
      speed: 0.34, size: 0.055, color: '#ff9a3c', color2: '#ffe6a8',
      pulse: 0.6, fade: 0.9
    },
    flameRings: [{ radius: 1.02, height: 0.16, color: '#ff6a1f', speed: 0.55, amp: 0.5 },
                 { radius: 1.14, height: 0.1, color: '#ffd166', speed: -0.8, amp: 0.35 }],
    css: { border: '#f97316', glowA: '#f97316', glowB: '#ef4444', anim: 'flamePulse' }
  },

  /* ------------------------------------------------------------------ */
  'cyber-neon': {
    id: 'cyber-neon',
    icon: '⚡',
    labelAr: 'هولوغرام السايبربانك',
    labelEn: 'Cyberpunk Hologram',
    descAr: 'حلقات طاقة نيون زرقاء/قرمزية مع glyphs دوّارة وجسيمات بيانات.',
    descEn: 'Cyan/magenta energy rings, rotating tech glyphs and data particles.',
    colors: { primary: '#22d3ee', accent: '#f472b6', glow: '#38f7ff' },
    background: 'radial-gradient(circle at 50% 55%, #04222c 0%, #05060c 72%)',
    rig: { spin: 0.08 },
    tilt: 0.3,
    scrollRotation: 1.6,
    rim: 1.6,
    bloom: { strength: 1.15, radius: 0.58, threshold: 0.2 },
    rings: [
      { r: 1, tube: 0.042, radialSegments: 10, tubularSegments: 180, spin: 0.2, color: '#062b38', glass: { ...GLASS, transmission: 0.88, roughness: 0.06, ior: 1.42, emissive: '#22d3ee', emissiveIntensity: 0.55 }, emissive: { color: '#22d3ee', intensity: 2.6, scale: 0.66 } },
      { r: 1.1, tube: 0.014, radialSegments: 6, tubularSegments: 180, spin: -0.55, tiltX: 0.28, color: '#f472b6', glass: null, emissive: { color: '#ff5fa8', intensity: 3.4 }, flat: true },
      { r: 1.19, tube: 0.009, radialSegments: 6, tubularSegments: 200, spin: 0.9, tiltY: -0.3, color: '#7ef9ff', glass: null, emissive: { color: '#7ef9ff', intensity: 4.2 }, flat: true }
    ],
    glyphs: { kind: 'tech', color: '#39e6ff', color2: '#ff6fb7', radius: 1.29, width: 0.2, spokes: 24, opacity: 0.85 },
    particles: {
      count: 64, radius: 1.16, spread: 0.3, height: 0.24, rise: false,
      speed: 0.62, size: 0.04, color: '#7ef9ff', color2: '#ff9ad2',
      pulse: 1.1, fade: 0.5, hexa: true
    },
    scanlines: { radius: 1.05, color: '#22d3ee', opacity: 0.16 },
    css: { border: '#22d3ee', glowA: '#22d3ee', glowB: '#f43f5e', anim: 'cyberGlitch' }
  },

  /* ------------------------------------------------------------------ */
  'shadow-monarch': {
    id: 'shadow-monarch',
    icon: '👑',
    labelAr: 'هالة ملك الظلال',
    labelEn: 'Shadow Monarch Aura',
    descAr: 'ضباب وظلال أرجوانية متصاعدة مع بلورات أوبسيديان وختام روني.',
    descEn: 'Surging violet shadow mist, obsidian crystals and a runic crest.',
    colors: { primary: '#a855f7', accent: '#38f7ff', glow: '#c084fc' },
    background: 'radial-gradient(circle at 50% 70%, #1b0838 0%, #05030b 70%)',
    rig: { spin: -0.04 },
    tilt: 0.22,
    scrollRotation: 1,
    rim: 1.9,
    bloom: { strength: 0.96, radius: 0.8, threshold: 0.16 },
    rings: [
      { r: 1, tube: 0.055, radialSegments: 12, tubularSegments: 168, spin: 0.1, color: '#150725', glass: { ...GLASS, transmission: 0.78, roughness: 0.16, ior: 1.6, attenuationColor: '#7c3aed', emissive: '#7c3aed', emissiveIntensity: 0.8 }, emissive: { color: '#a855f7', intensity: 2.2, scale: 0.7 } },
      { r: 1.12, tube: 0.016, radialSegments: 6, tubularSegments: 168, spin: -0.34, tiltX: 0.4, color: '#c084fc', glass: null, emissive: { color: '#c084fc', intensity: 3 }, flat: true },
      { r: 1.22, tube: 0.008, radialSegments: 5, tubularSegments: 168, spin: 0.5, tiltY: 0.5, color: '#38f7ff', glass: null, emissive: { color: '#67e8f9', intensity: 2.6 }, flat: true }
    ],
    glyphs: { kind: 'rune', color: '#a855f7', color2: '#e9d5ff', radius: 1.3, width: 0.16, spokes: 12, opacity: 0.8 },
    particles: {
      count: 38, radius: 1.18, spread: 0.2, height: 0.5, rise: true,
      speed: 0.24, size: 0.05, color: '#c084fc', color2: '#7dd3fc',
      pulse: 0.5, fade: 1.2
    },
    shadowPlumes: { count: 7, color: '#2b0b4a', rimColor: '#a855f7', speed: 0.35, height: 1.5, opacity: 0.5 },
    shards: { count: 9, color: '#1b0b31', emissive: '#b06bff', radius: 1.32, size: 0.075, speed: 0.22, opacity: 0.95 },
    css: { border: '#8b5cf6', glowA: '#8b5cf6', glowB: '#6d28d9', anim: 'shadowAura' }
  },

  /* ------------------------------------------------------------------ */
  'imperial-gold': {
    id: 'imperial-gold',
    icon: '⚜️',
    labelAr: 'التاج الذهبي الإمبراطوري',
    labelEn: 'Imperial Gold Crown',
    descAr: 'ذهب مصقول مع نقوش رونية بطيئة وشرر ذهبي دافئ.',
    descEn: 'Polished gold band, slow runic filigree and warm golden sparks.',
    colors: { primary: '#eab308', accent: '#fff2b0', glow: '#fbbf24' },
    background: 'radial-gradient(circle at 50% 55%, #2b2005 0%, #08070a 72%)',
    rig: { spin: 0.03 },
    tilt: 0.2,
    scrollRotation: 0.8,
    rim: 1.1,
    bloom: { strength: 0.62, radius: 0.62, threshold: 0.5 },
    rings: [
      { r: 1, tube: 0.052, radialSegments: 14, tubularSegments: 168, spin: 0.08, color: '#f6d67c', glass: { ...GLASS, transmission: 0.28, roughness: 0.14, metalness: 1, clearcoat: 0.6, emissive: '#c99b2a', emissiveIntensity: 0.35 }, emissive: { color: '#ffcf5c', intensity: 1.1, scale: 0.8 } },
      { r: 1.11, tube: 0.014, radialSegments: 6, tubularSegments: 168, spin: -0.18, tiltX: 0.24, color: '#fff2b0', glass: null, emissive: { color: '#ffe08a', intensity: 2.2 }, flat: true },
      { r: 1.2, tube: 0.008, radialSegments: 6, tubularSegments: 168, spin: 0.3, tiltY: 0.32, color: '#eab308', glass: null, emissive: { color: '#fbbf24', intensity: 2.4 }, flat: true }
    ],
    glyphs: { kind: 'filigree', color: '#fcd34d', color2: '#fff7d6', radius: 1.27, width: 0.12, spokes: 24, opacity: 0.7 },
    particles: {
      count: 28, radius: 1.2, spread: 0.14, height: 0.34, rise: false,
      speed: 0.2, size: 0.042, color: '#ffd76a', color2: '#fff6d2',
      pulse: 0.4, fade: 0.6
    },
    css: { border: '#eab308', glowA: '#eab308', glowB: '#ca8a04', anim: 'goldShine' }
  },

  /* ------------------------------------------------------------------ */
  'sakura-blossom': {
    id: 'sakura-blossom',
    icon: '🌸',
    labelAr: 'أزهار الساكورا',
    labelEn: 'Sakura Blossom',
    descAr: 'زجاج وردي حليبي مع بتلات متساقطة وهالة ناعمة.',
    descEn: 'Milky rose glass, drifting petals and a soft bloom halo.',
    colors: { primary: '#f472b6', accent: '#ffe4ef', glow: '#fb7fd0' },
    background: 'radial-gradient(circle at 50% 55%, #2d0f22 0%, #08050c 74%)',
    rig: { spin: 0.02 },
    tilt: 0.18,
    scrollRotation: 0.6,
    rim: 0.9,
    bloom: { strength: 0.52, radius: 0.86, threshold: 0.55 },
    rings: [
      { r: 1, tube: 0.05, radialSegments: 12, tubularSegments: 168, spin: 0.06, color: '#ffd7e8', glass: { ...GLASS, transmission: 0.86, roughness: 0.28, ior: 1.34, attenuationColor: '#ff8fc4', thickness: 0.7, emissive: '#ff9ecb', emissiveIntensity: 0.32 }, emissive: { color: '#ffb3d9', intensity: 1.3, scale: 0.7 } },
      { r: 1.1, tube: 0.012, radialSegments: 6, tubularSegments: 168, spin: -0.12, tiltX: 0.2, color: '#ff7ab8', glass: null, emissive: { color: '#ff7ab8', intensity: 1.8 }, flat: true }
    ],
    glyphs: { kind: 'filigree', color: '#ffb0d4', color2: '#fff1f7', radius: 1.24, width: 0.1, spokes: 30, opacity: 0.55 },
    particles: {
      count: 24, radius: 1.18, spread: 0.3, height: 0.9, rise: false,
      speed: 0.16, size: 0.05, color: '#ffc4de', color2: '#fff', pulse: 0.3, fade: 1.4
    },
    petals: { count: 22, color: '#ff9ecb', color2: '#ffe1ef', radius: 1.5, fall: 0.24, size: 0.07, opacity: 0.9 },
    css: { border: '#f472b6', glowA: '#f472b6', glowB: '#ec4899', anim: 'sakuraFloat' }
  },

  /* ------------------------------------------------------------------ */
  'prismatic-diamond': {
    id: 'prismatic-diamond',
    icon: '💎',
    labelAr: 'الماسة الكريستالية',
    labelEn: 'Prismatic Diamond',
    descAr: 'كريستال عالي الانكسار بشقّ قوس قزح وشظايا ماسية عائمة.',
    descEn: 'High-dispersion crystal with chromatic shards and floating facets.',
    colors: { primary: '#38bdf8', accent: '#c084fc', glow: '#a5f3fc' },
    background: 'radial-gradient(circle at 50% 55%, #0b2334 0%, #05060d 74%)',
    rig: { spin: 0.06 },
    tilt: 0.34,
    scrollRotation: 2,
    rim: 1.5,
    bloom: { strength: 0.9, radius: 0.64, threshold: 0.28 },
    rings: [
      { r: 1, tube: 0.062, radialSegments: 6, tubularSegments: 120, spin: 0.16, color: '#dff6ff', glass: { ...GLASS, transmission: 0.96, roughness: 0.02, ior: 1.9, thickness: 0.9, dispersion: 3.4, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 420], attenuationDistance: 0.9, attenuationColor: '#7dd3fc' }, emissive: { color: '#67e8f9', intensity: 1.5, scale: 0.6 } },
      { r: 1.13, tube: 0.011, radialSegments: 5, tubularSegments: 168, spin: -0.44, tiltX: 0.5, color: '#a5f3fc', glass: null, emissive: { color: '#a5f3fc', intensity: 3.2 }, flat: true },
      { r: 1.21, tube: 0.009, radialSegments: 5, tubularSegments: 168, spin: 0.62, tiltY: -0.44, color: '#c084fc', glass: null, emissive: { color: '#d8b4fe', intensity: 2.9 }, flat: true }
    ],
    glyphs: { kind: 'tech', color: '#7dd3fc', color2: '#e9d5ff', radius: 1.3, width: 0.11, spokes: 36, opacity: 0.6 },
    particles: {
      count: 46, radius: 1.2, spread: 0.22, height: 0.3, rise: false,
      speed: 0.44, size: 0.045, color: '#a5f3fc', color2: '#f0abfc',
      pulse: 1.4, fade: 0.7, twinkle: true
    },
    shards: { count: 12, color: '#e0f2fe', emissive: '#7dd3fc', radius: 1.34, size: 0.07, speed: 0.3, opacity: 0.85, glassy: true },
    css: { border: '#38bdf8', glowA: '#38bdf8', glowB: '#c084fc', anim: 'prismShift' }
  },

  /* ── presets mirroring the layered CSS-3D components (Avatar3DDecoration) ── */
  'celestial-void': {
    id: 'celestial-void',
    icon: '🌌',
    labelAr: 'الفضاء الكوني',
    labelEn: 'Celestial Void',
    descAr: 'قبة نجوم زجاجية بنفسجية مع مدارات كوكبية وحلقة أوج قصيرة.',
    descEn: 'Violet star-globe glass with orbital planes and a short apogee loop.',
    colors: { primary: '#a855f7', accent: '#c4b5fd', glow: '#818cf8' },
    background: 'radial-gradient(circle at 50% 45%, #170b33 0%, #050410 74%)',
    rig: { spin: 0.03 },
    tilt: 0.3,
    scrollRotation: 1.8,
    rim: 1.25,
    bloom: { strength: 0.88, radius: 0.9, threshold: 0.24 },
    rings: [
      { r: 1, tube: 0.046, radialSegments: 12, tubularSegments: 168, spin: 0.09, color: '#1a0f36', glass: { ...GLASS, transmission: 0.92, roughness: 0.06, ior: 1.58, attenuationColor: '#8b5cf6', emissive: '#8b5cf6', emissiveIntensity: 0.5 }, emissive: { color: '#a855f7', intensity: 2.1, scale: 0.7 } },
      { r: 1.1, tube: 0.012, radialSegments: 6, tubularSegments: 168, spin: -0.3, tiltX: 0.95, color: '#c4b5fd', glass: null, emissive: { color: '#c4b5fd', intensity: 2.6 }, flat: true },
      { r: 1.19, tube: 0.009, radialSegments: 6, tubularSegments: 168, spin: 0.24, tiltY: 1.15, color: '#67e8f9', glass: null, emissive: { color: '#7dd3fc', intensity: 2.4 }, flat: true }
    ],
    glyphs: { kind: 'rune', color: '#c084fc', color2: '#e9d5ff', radius: 1.27, width: 0.13, spokes: 12, opacity: 0.75 },
    particles: {
      count: 54, radius: 1.24, spread: 0.42, height: 0.5, rise: false,
      speed: 0.3, size: 0.04, color: '#ddd6fe', color2: '#7dd3fc',
      pulse: 1.3, fade: 0.9, twinkle: true
    },
    shards: { count: 7, color: '#150a2e', emissive: '#a855f7', radius: 1.33, size: 0.058, speed: 0.16, opacity: 0.9 },
    css: { border: '#a855f7', glowA: '#a855f7', glowB: '#818cf8', anim: 'celestialDrift' }
  },

  'dragon-ascension': {
    id: 'dragon-ascension',
    icon: '🐉',
    labelAr: 'التنين السماوي',
    labelEn: 'Dragon Ascension',
    descAr: 'شرائط يقين زمردية تصعد حلزونيًا مع جمر ونواة زجاجية داكنة.',
    descEn: 'Jade ribbons spiralling upward with ember trails over a dark glass core.',
    colors: { primary: '#10b981', accent: '#fbbf24', glow: '#34d399' },
    background: 'radial-gradient(circle at 50% 62%, #04231b 0%, #050a0b 74%)',
    rig: { spin: 0.04 },
    tilt: 0.28,
    scrollRotation: 1.4,
    rim: 1.3,
    bloom: { strength: 0.82, radius: 0.78, threshold: 0.3 },
    rings: [
      { r: 1, tube: 0.054, radialSegments: 12, tubularSegments: 168, spin: 0.12, color: '#052e25', glass: { ...GLASS, transmission: 0.86, roughness: 0.09, ior: 1.55, attenuationColor: '#10b981', emissive: '#059669', emissiveIntensity: 0.6 }, emissive: { color: '#34d399', intensity: 2.3, scale: 0.7 } },
      { r: 1.09, tube: 0.015, radialSegments: 7, tubularSegments: 168, spin: -0.34, tiltX: 0.34, color: '#a7f3d0', glass: null, emissive: { color: '#6ee7b7', intensity: 2.7 }, flat: true },
      { r: 1.18, tube: 0.01, radialSegments: 6, tubularSegments: 168, spin: 0.5, tiltX: -0.42, color: '#fbbf24', glass: null, emissive: { color: '#fcd34d', intensity: 2.9 }, flat: true }
    ],
    glyphs: { kind: 'filigree', color: '#6ee7b7', color2: '#fef3c7', radius: 1.26, width: 0.15, spokes: 20, opacity: 0.7 },
    particles: {
      count: 44, radius: 1.2, spread: 0.22, height: 0.85, rise: true,
      speed: 0.4, size: 0.05, color: '#6ee7b7', color2: '#fde68a', pulse: 0.7, fade: 1
    },
    flameRings: [
      { radius: 1.03, height: 0.22, color: '#10b981', accent: '#a7f3d0', speed: 0.62, amp: 0.55 },
      { radius: 1.15, height: 0.14, color: '#fbbf24', accent: '#fff7d6', speed: -0.9, amp: 0.32 }
    ],
    css: { border: '#10b981', glowA: '#10b981', glowB: '#34d399', anim: 'dragonAscend' }
  },

  /* ------------------------------------------------------------------ */
  'aurora-veil': {
    id: 'aurora-veil',
    icon: '🌌',
    labelAr: 'ستارة الشفق القطبي',
    labelEn: 'Aurora Veil',
    descAr: 'أشرطة ضوء شمالية شفافة تنساب حول الإطار بألوان زمردية وفيروزية.',
    descEn: 'Ribbons of polar light drifting around the ring in teal and emerald.',
    colors: { primary: '#34d399', accent: '#67e8f9', glow: '#a7f3d0' },
    background: 'radial-gradient(circle at 50% 60%, #05231f 0%, #04060d 76%)',
    rig: { spin: 0.02 },
    tilt: 0.24,
    scrollRotation: 0.9,
    rim: 1.2,
    bloom: { strength: 0.85, radius: 0.9, threshold: 0.3 },
    rings: [
      { r: 1, tube: 0.045, radialSegments: 10, tubularSegments: 168, spin: 0.1, color: '#0f3b34', glass: { ...GLASS, transmission: 0.9, roughness: 0.12, ior: 1.45, emissive: '#10b981', emissiveIntensity: 0.5 }, emissive: { color: '#34d399', intensity: 2, scale: 0.7 } },
      { r: 1.14, tube: 0.013, radialSegments: 6, tubularSegments: 168, spin: -0.2, tiltX: 0.6, color: '#67e8f9', glass: null, emissive: { color: '#67e8f9', intensity: 2.4 }, flat: true }
    ],
    glyphs: { kind: 'filigree', color: '#5eead4', color2: '#bbf7d0', radius: 1.28, width: 0.18, spokes: 16, opacity: 0.5 },
    particles: {
      count: 34, radius: 1.24, spread: 0.5, height: 0.6, rise: true,
      speed: 0.18, size: 0.05, color: '#5eead4', color2: '#c4b5fd', pulse: 0.5, fade: 1.1
    },
    flameRings: [{ radius: 1.06, height: 0.3, color: '#34d399', speed: 0.25, amp: 0.6 },
                 { radius: 1.18, height: 0.24, color: '#818cf8', speed: -0.32, amp: 0.45 }],
    css: { border: '#34d399', glowA: '#34d399', glowB: '#67e8f9', anim: 'auroraWave' }
  }
};

export const ORNAMENT_IDS = Object.keys(ORNAMENT_PRESETS);

/**
 * Ids used by other parts of the app that share a look with a real preset.
 * Keeps one source of truth (no duplicated geometry config) while letting
 * `frameStyle: 'dragon-flame'` — which `Avatar3DDecoration` also aliases —
 * mount a genuine WebGL ornament.
 */
export const ORNAMENT_ALIASES = {
  'dragon-flame': 'royal-flame',
  'flame-dragon': 'royal-flame',
  'imperial-crown': 'imperial-gold'
};

export function resolveOrnamentId(id) {
  if (!id || id === 'default' || id === 'none') return null;
  if (ORNAMENT_PRESETS[id]) return id;
  return ORNAMENT_ALIASES[id] || null;
}

export function getOrnament(id) {
  return ORNAMENT_PRESETS[resolveOrnamentId(id)] || null;
}

/** Shallow-merge a preset with per-instance overrides (never mutates input). */
export function resolveOrnament(id, overrides = {}) {
  const base = ORNAMENT_PRESETS[resolveOrnamentId(id) || id];
  if (!base) return null;
  return {
    ...base,
    ...overrides,
    colors: { ...base.colors, ...(overrides.colors || {}) },
    rings: overrides.rings || base.rings,
    particles: overrides.particles || base.particles,
    bloom: { ...base.bloom, ...(overrides.bloom || {}) }
  };
}

/* ==========================================================================
 * 3D profile banners — same engine, wide framing + parallax city rig
 * ========================================================================== */

export const BANNER_PRESETS = {
  'neon-tokyo': {
    id: 'neon-tokyo',
    icon: '🏙️',
    labelAr: 'طوكيو النيون (حقيقي 3D)',
    labelEn: 'Neon Neo-Tokyo (live 3D)',
    descAr: 'أفق مديني هولوغرامي بشاشات نيون وشبكة أرضية متحركة وضباب.',
    descEn: 'Holographic skyline, neon billboards, moving grid floor and fog.',
    colors: { primary: '#22d3ee', accent: '#f472b6', glow: '#8b5cf6' },
    background: 'linear-gradient(180deg, #070917 0%, #0d1030 45%, #1b0a2b 100%)',
    camera: { z: 5.2, fov: 38 },
    plane: { width: 2.9, height: 1.12, curve: 0.16 },
    tilt: 0.075,
    scrollRotation: 0,
    rig: { spin: 0 },
    bloom: { strength: 0.82, radius: 0.72, threshold: 0.22 },
    skyline: {
      buildings: 34, billboards: 16, windowGrid: true,
      palette: ['#22d3ee', '#f472b6', '#8b5cf6', '#a3e635', '#fbbf24'],
      fog: '#160a2e', floorGrid: true
    },
    particles: { count: 90, size: 0.02, speed: 0.06, spread: 3.2, color: '#9fe9ff', color2: '#ffa8d8' },
    css: null
  },
  'shadow-abyss': {
    id: 'shadow-abyss',
    icon: '🕳️',
    labelAr: 'هاوية الظلال',
    labelEn: 'Shadow Abyss',
    descAr: 'بوابة ظل أرجوانية مع شظايا عائمة وضباب زاحف — وضع سينمائي.',
    descEn: 'Violet shadow gate with drifting shards and crawling fog.',
    colors: { primary: '#a855f7', accent: '#22d3ee', glow: '#7c3aed' },
    background: 'linear-gradient(180deg, #0a0413 0%, #180a30 60%, #06030c 100%)',
    camera: { z: 5.4, fov: 38 },
    plane: { width: 2.9, height: 1.12, curve: 0.22 },
    tilt: 0.06,
    rig: { spin: 0 },
    bloom: { strength: 0.95, radius: 0.85, threshold: 0.18 },
    skyline: { buildings: 0, billboards: 0, fog: '#150727', floorGrid: false },
    rift: { rings: 5, color: '#a855f7', accent: '#67e8f9' },
    shards: { count: 26, color: '#160a2b', emissive: '#b06bff', size: 0.06, opacity: 0.95 },
    particles: { count: 70, size: 0.024, speed: 0.1, spread: 3, color: '#c084fc', color2: '#22d3ee' },
    css: null
  },
  'sakura-dusk': {
    id: 'sakura-dusk',
    icon: '🌸',
    labelAr: 'غسق الساكورا',
    labelEn: 'Sakura Dusk',
    descAr: 'غروب وردي هادئ مع بتلات متساقطة وشبكة أرضية خافتة.',
    descEn: 'Calm rose dusk, falling petals and a faint floor grid.',
    colors: { primary: '#f472b6', accent: '#fbbf24', glow: '#fb7185' },
    background: 'linear-gradient(180deg, #200a1c 0%, #41163a 55%, #0b0510 100%)',
    camera: { z: 5.2, fov: 38 },
    plane: { width: 2.9, height: 1.12, curve: 0.2 },
    tilt: 0.055,
    rig: { spin: 0 },
    bloom: { strength: 0.6, radius: 0.9, threshold: 0.35 },
    skyline: { buildings: 12, billboards: 4, palette: ['#f9a8d4', '#fbbf24', '#fda4af'], fog: '#2b0f26', floorGrid: true },
    petals: { count: 46, color: '#ffb6d5', color2: '#fff0f6', size: 0.05, fall: 0.2 },
    particles: { count: 50, size: 0.02, speed: 0.05, spread: 3, color: '#ffd1e6', color2: '#fff3c4' },
    css: null
  },
  'dragon-ember': {
    id: 'dragon-ember',
    icon: '🐉',
    labelAr: 'جمر التنين',
    labelEn: 'Dragon Ember',
    descAr: 'جحيم برتقالي مع شرر صاعد ووهج نَبضي على حافة البانر.',
    descEn: 'Orange inferno with rising sparks and a pulsing rim glow.',
    colors: { primary: '#ff7a1a', accent: '#ffd166', glow: '#ef4444' },
    background: 'linear-gradient(180deg, #1c0702 0%, #431304 55%, #0a0406 100%)',
    camera: { z: 5.2, fov: 38 },
    plane: { width: 2.9, height: 1.12, curve: 0.18 },
    tilt: 0.07,
    rig: { spin: 0 },
    bloom: { strength: 0.9, radius: 0.8, threshold: 0.26 },
    skyline: { buildings: 0, billboards: 0, fog: '#2a0a02', floorGrid: false },
    flames: { rings: 6, color: '#ff6a1f', accent: '#ffd166' },
    particles: { count: 120, size: 0.022, speed: 0.24, spread: 3, color: '#ffb066', color2: '#fff1c4', rise: true },
    css: null
  }
};

export const BANNER_IDS = Object.keys(BANNER_PRESETS);

export function getBanner(id) {
  return BANNER_PRESETS[id] || null;
}

/* ==========================================================================
 * Quality tiers — resolved from the device, overridable by the user
 * ========================================================================== */

export const QUALITY_TIERS = {
  cinematic: { label: 'Cinematic', dprMax: 2, bloom: true, transmission: true, particleScale: 1, shadowPlumes: true, antialias: true },
  balanced: { label: 'Balanced', dprMax: 1.75, bloom: true, transmission: true, particleScale: 0.7, shadowPlumes: true, antialias: true },
  lite: { label: 'Lite', dprMax: 1.35, bloom: true, transmission: false, particleScale: 0.45, shadowPlumes: false, antialias: false },
  css: { label: 'CSS only', dprMax: 1, bloom: false, transmission: false, particleScale: 0, shadowPlumes: false, antialias: false }
};

/**
 * Guess the best tier for the current device.
 * Respect `prefers-reduced-motion` (kill idle spin, keep mouse parallax off)
 * and `prefers-reduced-transparency` / low-power devices (fallback to CSS).
 */
export function detectQuality(nav = globalThis.navigator, matchMediaFn = globalThis.matchMedia) {
  const reduceMotion = typeof matchMediaFn === 'function' && matchMediaFn('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof matchMediaFn === 'function' && matchMediaFn('(pointer: coarse)').matches;
  const cores = nav?.hardwareConcurrency || 4;
  const mem = nav?.deviceMemory || 4;
  const mobileish = coarse || cores <= 4 || mem <= 4;

  let tier = 'cinematic';
  if (mobileish) tier = 'balanced';
  if (mobileish && (cores <= 4 || mem <= 4)) tier = 'lite';
  return { tier, reduceMotion };
}

/* --------------------------------------------------- CSS-only fallback ---- */

/** 2D stand-ins for `ORNAMENT_PRESETS` — used by the CSS poster path when
 *  WebGL is missing, the browser can't load three.js, or the user opts out.
 *  Mirrors `.avatar-frame--*` in client/src/styles/app.css. */
export const CSS_FALLBACK = {
  'royal-flame': { border: '#f97316', glowA: '#f97316', glowB: '#ef4444', animation: 'flamePulse 2s infinite alternate' },
  'cyber-neon': { border: '#22d3ee', glowA: '#22d3ee', glowB: '#f43f5e', animation: 'cyberGlitch 3s infinite' },
  'shadow-monarch': { border: '#8b5cf6', glowA: '#8b5cf6', glowB: '#6d28d9', animation: 'shadowAura 2.5s infinite alternate' },
  'imperial-gold': { border: '#eab308', glowA: '#eab308', glowB: '#ca8a04', animation: 'goldShine 3.4s infinite' },
  'sakura-blossom': { border: '#f472b6', glowA: '#f472b6', glowB: '#ec4899', animation: 'sakuraFloat 6s infinite' },
  'prismatic-diamond': { border: '#38bdf8', glowA: '#38bdf8', glowB: '#c084fc', animation: 'prismShift 7s infinite linear' },
  'aurora-veil': { border: '#34d399', glowA: '#34d399', glowB: '#67e8f9', animation: 'auroraWave 4s infinite alternate' },
  'celestial-void': { border: '#a855f7', glowA: '#a855f7', glowB: '#818cf8', animation: 'celestialDrift 9s infinite linear' },
  'dragon-ascension': { border: '#10b981', glowA: '#10b981', glowB: '#34d399', animation: 'dragonAscend 5s infinite ease-in-out' }
};

export function cssFrameStyle(id) {
  const f = CSS_FALLBACK[id];
  if (!f) return null;
  return {
    border: `3px solid ${f.border}`,
    boxShadow: `0 0 18px ${f.glowA}, inset 0 0 10px ${f.glowB}`,
    animation: f.animation,
    borderRadius: '50%',
    position: 'absolute',
    inset: '-6%',
    pointerEvents: 'none'
  };
}

export const WEBGL_PROBE = `(() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
})()`;
