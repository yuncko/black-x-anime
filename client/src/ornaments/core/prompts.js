/**
 * ============================================================================
 *  Hearbor — Prompt engineering kit (Midjourney v7 / Runway Gen-4 / Luma)
 * ============================================================================
 *  These strings are the *production* versions of the reference guide:
 *  they are what the UI shows in the copy-blocks, and they are written so the
 *  renders can actually be composited into a WebGL avatar frame / banner
 *  (pure-black plate for `screen` blending, alpha-matte workflow, web-safe
 *  lighting, seamless loops).
 *
 *  Every prompt object: { id, group, titleAr, titleEn, tool, code, notesAr, notesEn }
 *  `code` is copied verbatim into a <textarea>/<pre> in the UI.
 * ============================================================================
 */

export const PROMPT_KIT_VERSION = '2.0.0';

/** Pure-black background rule: needed for both `screen`-blend and matte work. */
export const BG_LOCK =
  'background: pure flat black #000000, no gradients, no floor, no reflection, no shadow on ground, no environment, no smoke beyond the subject';

/** Lighting rule that makes a still composable inside a dark glass UI. */
export const WEB_LIGHTING =
  'lighting: studio rim light only from behind plus a cool key at 6500K, emissive elements self-lit, no global illumination bounce, no lens flare, no bloom clipping, highlights below 92% luminance so it survives web tone-mapping';

export const NO_LIST_FRAME =
  'background, scenery, floor, ground shadow, human, face, character, text, watermark, logo, bokeh, depth-of-field blur, duplicate rings';

export const PROMPT_BLOCKS = [
  /* ---------------------------------------------------------------- MJ: FRAMES */
  {
    id: 'mj-dragon-flame',
    group: 'frames',
    tool: 'Midjourney v7 · --tile off',
    titleAr: 'إطار لهب التنين (أوبسيديان + ذهب الياقوت)',
    titleEn: 'Royal dragon flame frame (obsidian + ruby gold)',
    code: `/imagine prompt: A single perfectly circular 3D avatar frame, mythical royal dragon coiled around the ring, head overlapping tail, vibrant swirling flames hugging the band, floating incandescent embers, polished obsidian and ruby-gold metal, wet caustic reflections, octane render, unreal engine 5, path traced glass transmission IOR 1.52 with roughness 0.08, thin emissive core at high intensity, ${WEB_LIGHTING}. Center of the circle completely empty and pure black. Isolated subject on ${BG_LOCK}. Front-on orthographic view, dead center, subject inscribed in an 82% safe circle with 9% margin all sides, no crop, no perspective distortion.\n\n--ar 1:1 --stylize 250 --chaos 5 --quality 2 --no ${NO_LIST_FRAME} --v 7`,
    notesAr: 'المركز الفارغ شرط أساسي: سنضع الصورة داخله بـ CSS mask ولا نريد أي تفاصيل خلف الأفاتار.',
    notesEn: 'The empty centre is mandatory — the avatar sits inside it, so nothing may render behind it.'
  },
  {
    id: 'mj-cyber-neon',
    group: 'frames',
    tool: 'Midjourney v7',
    titleAr: 'إطار السايبربانك الهولوغرافي',
    titleEn: 'Cyberpunk holographic frame',
    code: `/imagine prompt: Floating 3D holographic sci-fi circular UI frame, three concentric rotating neon rings in cyan #22d3ee and magenta #f472b6, etched tech glyphs and micro data-ticks along the outer band, glassmorphism bevel with subtle chromatic aberration, hard-surface CAD modeling, emissive neon lines at 2.5 intensity, energy particles suspended around the ring, ray-traced refraction through 4mm glass, ${WEB_LIGHTING}. Symmetric ring, dead center, empty pure-black core, ${BG_LOCK}.\n\n--ar 1:1 --stylize 300 --chaos 3 --no ${NO_LIST_FRAME} --v 7`,
    notesAr: 'حدّد ألوان HEX صراحةً حتى تطابق اللوحة اللونية للإطار في CSS/Three.js.',
    notesEn: 'Naming the HEX codes keeps the still on-palette with the live Three.js rings.'
  },
  {
    id: 'mj-shadow-monarch',
    group: 'frames',
    tool: 'Midjourney v7',
    titleAr: 'هالة ملك الظلال',
    titleEn: 'Shadow Monarch aura',
    code: `/imagine prompt: Solo Leveling inspired 3D avatar ornament frame, circular crest of glowing violet runes, ethereal dark purple shadowy mist surging upward from the base of the ring, floating obsidian shadow crystals with faceted edges, menacing energy tendrils curling around the band, dramatic cold rim lighting, volumetric god-rays contained inside the ring only, dark fantasy AAA game asset, Unreal Engine 5, path traced, ${WEB_LIGHTING}. Ring is centered and geometrically perfect, hollow pure-black core, ${BG_LOCK}.\n\n--ar 1:1 --stylize 350 --chaos 8 --no ${NO_LIST_FRAME}, extra heads, monsters --v 7`,
    notesAr: 'أضفنا «volumetric محصور داخل الحلقة» حتى لا تغطي الضبابات على الصورة.',
    notesEn: 'Confining the volumetrics inside the ring prevents fog from washing over the avatar.'
  },
  {
    id: 'mj-alpha-matte',
    group: 'frames',
    tool: 'Midjourney v7 · transparency trick',
    titleAr: 'نسخة «خلفية شفافة» حقيقية (MAGENTA KEY)',
    titleEn: 'Real transparency via magenta key plate',
    code: `# Midjourney cannot output alpha. This is the reliable web pipeline.
# 1) same frame, flat magenta plate instead of black:
/imagine prompt: <PASTE FRAME PROMPT ABOVE, but replace the whole background clause with:>
background: perfectly flat uniform chroma-key magenta #FF00FF, no gradient, no vignette, no spill onto the subject, subject edges crisp and fully inside frame, no motion blur, no soft glow touching the edges --ar 1:1 --stylize 200 --chaos 0 --no shadows on background, glow bleeding to background, texture in background --v 7

# 2) pull the matte (one ffmpeg pass, 4K-ready):
ffmpeg -i frame.png -vf "chromakey=0xFF00FF:0.12:0.05,despill=type=mix,format=yuva420p" -frames:v 1 frame_alpha.png

# 3) or in the browser (WebGL-safe, no server):
gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
// css fallback without ffmpeg: mix-blend-mode: screen; on a #000 plate (black → invisible)`,
    notesAr: 'خياران: لوحة سوداء + screen blending (سهل)، أو لوحة ماجنتا + chromakey (دقة حواف أعلى).',
    notesEn: 'Two routes: black plate + `screen` blend (cheap), or magenta plate + chroma key (clean edges).'
  },

  /* ---------------------------------------------------------------- MJ: BANNERS */
  {
    id: 'mj-banner-neotokyo',
    group: 'banners',
    tool: 'Midjourney v7 · 16:9',
    titleAr: 'بانر طوكيو النيون (عريض)',
    titleEn: 'Neo-Tokyo neon banner (ultra-wide)',
    code: `/imagine prompt: Ultra-wide 16:9 cinematic anime profile header banner, futuristic Neo-Tokyo skyline at midnight, towering neon holographic billboards in cyan and hot pink, rain-slick rooftop with mirror reflections, low-hanging fog lit from below, dense vertical signage with unreadable glyph text, volumetric light shafts, camera 12mm ultra-wide slightly dutch-tilted, deep blacks with no crushed shadows, safe area: keep the lower 26% and the far left 18% of the frame dark and quiet for UI text overlay, ${WEB_LIGHTING}.\n\n--ar 16:9 --stylize 250 --chaos 6 --exp 40 --no text, letters, watermark, lens dirt, chromatic fringing, blown highlights --v 7`,
    notesAr: '«safe area» هو أهم سطر: يترك مكانًا نظيفًا لاسم المستخدم وزر المتابعة فوق البانر.',
    notesEn: 'The safe-area clause is the money line: it keeps the username/CTA zone clean.'
  },
  {
    id: 'mj-banner-shadow',
    group: 'banners',
    tool: 'Midjourney v7 · 16:9',
    titleAr: 'بانر هاوية الظلال',
    titleEn: 'Shadow abyss banner',
    code: `/imagine prompt: Ultra-wide 16:9 dark-fantasy profile banner, a colossal violet shadow rift opening above a shattered obsidian plaza, floating rune shards, ground fog crawling toward camera, single silhouetted crowned figure far off-center at the right third, embers of purple light drifting, cinematic anamorphic 2.39 crop inside 16:9, black-locked exposure (blacks at 3-7 IRE), rim light only, no fill, negative space left third reserved for profile text, ${WEB_LIGHTING}.\n\n--ar 16:9 --stylize 320 --chaos 10 --no extra characters, bright sky, daylight, text, watermark --v 7`,
    notesAr: 'قيدنا مستوى الأسود (IRE) حتى لا «يحرق» نص الملف الشخصي فوقه.',
    notesEn: 'Locking black levels keeps overlaid profile text legible.'
  },
  {
    id: 'mj-seamless-loop',
    group: 'banners',
    tool: 'Midjourney v7 → Runway input',
    titleAr: 'بذر «لูป» بلا قطع للبانر المتحرك',
    titleEn: 'Seamless-loop source plate for the banner',
    code: `/imagine prompt: Flat 2D equirectangular-ready horizontal panorama strip of a neon anime city, perfectly tileable left-to-right edge (the far-left and far-right columns must match pixel-for-pixel), no focal center, no horizon tilt, uniform luminance across the strip, parallax layers separated (sky / far towers / near towers / foreground rooftop), ${BG_LOCK}.\n\n--ar 32:9 --tile --stylize 120 --chaos 0 --no vignette, sun, moon, central subject --v 7`,
    notesAr: '--tile يجعل الحواف قابلة للتكرار؛ مثالي للتمرير الأفقي اللانهائي داخل الـ shader.',
    notesEn: '--tile makes the edges wrap; ideal for infinite horizontal scroll in the shader.'
  },

  /* ---------------------------------------------------------------- RUNWAY / LUMA */
  {
    id: 'runway-frame-loop',
    group: 'motion',
    tool: 'Runway Gen-4 · Image to Video · 10s',
    titleAr: 'تحريك الإطار: دوران Z + نَفَس توهج',
    titleEn: 'Frame motion: Z-axis rotation + glow breathing',
    code: `Cinematic 3D loop animation of this exact circular ornament. Locked-off orthographic front camera, ZERO camera movement, ZERO zoom, ZERO dolly. The ring rotates smoothly 360 degrees around its own Z axis in exactly 5 seconds at constant angular velocity (5s = one full turn, so a 10s clip is 2 perfect turns). Emissive core pulses in a slow 2.5s breathing sine wave (intensity 1.0 → 1.35 → 1.0). Embers and motes rise on a vertical loop and are re-seeded off-frame so no particle visibly appears or disappears. Volumetric particles stay inside the frame bounds. Background stays flat pure #000000 with zero noise, zero grain, zero gradient drift. First frame and last frame must be pixel-identical: perfectly seamless loop, no cross-fade, no dissolve, no flash. High frame rate, crisp focus, no motion blur smear on the ring, no morphing of the dragon silhouette, no added limbs, no flicker.\n\nMotion brush: ring band only (intensity 0.35). Camera motion 0. Framerate 24fps → interpolate to 60fps. Duration 10s. Style: photoreal CG, octane render.`,
    notesAr: 'شرط «pixel-identical first/last frame» + «zero camera motion» هما ما يمنع القفز عند تكرار الـ loop في المتصفح.',
    notesEn: 'Pixel-identical endpoints + locked camera are what stop the visible jump on loop restart.'
  },
  {
    id: 'runway-banner-parallax',
    group: 'motion',
    tool: 'Runway Gen-4 · Image to Video · 16:9',
    titleAr: 'بانر متحرك: بارالاكس طبقات بلا قطع',
    titleEn: 'Banner loop: layered parallax, seamless',
    code: `Seamless 8-second looping shot built from this banner. Absolutely static camera (no pan, no tilt, no zoom, no shake). Depth parallax only: foreground rooftop elements drift left at 12 px/s, mid towers at 6 px/s, far skyline at 2 px/s, clouds and haze at 1 px/s — all motion is horizontal and wraps around the frame edges. Rain streaks fall on a loop whose period divides evenly into 8 seconds (0.5s or 0.25s). Neon signs flicker on a repeating 2s pattern. Flag/hologram intensity breathes on a 4s sine. Everything else frozen. Frame edges: no new objects enter, nothing leaves. Black levels unchanged start to end. No film grain, no color shift, no auto-exposure pumping, no morphing geometry.\n\nNegative prompt: camera movement, zoom, dolly, orbit, shake, morph, subject change, text, watermark, frame cut, dissolve, exposure ramp.`,
    notesAr: 'قسّم السرعات بحيث تُقسَّم المسافة على عرض اللوب بالضبط — هذا شرط عدم القطع.',
    notesEn: 'Divide each layer speed so the travel distance divides the loop length exactly — that is the seamlessness trick.'
  },
  {
    id: 'luma-shadow-tendrils',
    group: 'motion',
    tool: 'Luma Dream Machine · Loop ON',
    titleAr: 'ظلال وأضواء متحركة لإطار ملك الظلال',
    titleEn: 'Living shadows for the Shadow Monarch frame',
    code: `Looping 5-second animated texture of this ornament. Camera completely locked, subject centered and unscaled. Motion comes ONLY from: (1) violet shadow mist rising along the inner edge of the ring at constant speed with wrap-around, (2) obsidian crystals bobbing ±3% on a 2.5s sine, (3) rune glyph glow travelling clockwise once per 5s, (4) slow global breathing 1.0 → 1.18 luminance. The ring silhouette itself never deforms, rotates, or rescales. Pure #000000 background, no glow spill past the ring, no grain. Start frame equals end frame for a seamless browser loop. Render style matches the input image exactly, no style drift, no new elements, no camera shake.\n\nLoop mode: ON. Motion amount: 3 / 10. Concept strength: 7.`,
    notesAr: 'Luma يميل لتغيير الأسلوب مع الوقت — «motion amount 3» و«no style drift» يكبحت ذلك.',
    notesEn: 'Luma drifts style over time; low motion amount + explicit no-style-drift keeps it stable.'
  },
  {
    id: 'after-effects-composite',
    group: 'motion',
    tool: 'Post-pipeline (AE / ffmpeg) → web',
    titleAr: 'تجهيز الناتج للويب (WebM VP9 + fallback)',
    titleEn: 'Ship it to the web (VP9 alpha + fallback)',
    code: `# 1. trim to an exact loop (drop the duplicated last frame)
ffmpeg -i in.mp4 -vf "select='lt(n\\,120)',setpts=N/FRAME_RATE/TB" -an tmp.mp4

# 2. webm with alpha (VP9) — works with mix-blend-mode:normal and object-fit:cover
ffmpeg -i tmp.mp4 -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -an ornament_alpha.webm

# 3. tiny AV1/VP9 no-alpha version for the #000 + screen blend path
ffmpeg -i tmp.mp4 -c:v libvpx-vp9 -crf 34 -b:v 0 -an -row-mt 1 ornament.webm

# 4. poster for LCP + Safari fallback
ffmpeg -i tmp.mp4 -frames:v 1 -vf scale=480:-1 poster.webp

/* css: layer the video over the glass ring */
.ornament__video {
  position: absolute; inset: -8%;
  width: 116%; height: 116%;
  object-fit: cover;
  mix-blend-mode: screen;       /* black plate → invisible */
  pointer-events: none;
  filter: saturate(1.1) contrast(1.05);
}`,
    notesAr: 'شغّل اللوب بـ two-video crossfade فقط إذا كان الـ loop غير متطابق الأطراف — وإلا video واحد يكفي.',
    notesEn: 'Only use the two-video crossfade trick when endpoints do not match; otherwise a single looping video is cheaper.'
  },

  /* ---------------------------------------------------------------- SPLINE/THREE */
  {
    id: 'three-spec',
    group: 'spec',
    tool: 'Three.js spec (this repo) · r180',
    titleAr: 'مواصفات الكود — نسخة مدققة وقابلة للقياس',
    titleEn: 'Code spec — measurable, not vibes',
    code: `GEOMETRY
  ring A   TorusGeometry(r=1.00, tube=0.050, radialSeg=12, tubularSeg=168)  scale.z = 1.9
  ring B   TorusGeometry(r=1.085, tube=0.018, 8 × 168)  tiltX = +0.16  spin = -0.26 rad/s
  ring C   TorusGeometry(r=1.170, tube=0.011, 6 × 168)  tiltX = -0.22  spin = +0.42 rad/s
  glyph    RingGeometry(1.25 → 1.39, 160 seg) + custom GLSL (rune | tech | filigree)
  avatar   CircleGeometry(0.90, 96) with THREE.Plane clipping (rings refract the photo)
  TOTAL    ≈ 22k triangles, ≤ 12 draw calls at 'balanced'

MATERIAL   MeshPhysicalMaterial
  transmission 0.90 · roughness 0.08 · metalness 0.00 · ior 1.52
  thickness 0.45 · clearcoat 1.0 · clearcoatRoughness 0.12
  attenuationColor preset-driven · attenuationDistance 1.40
  envMapIntensity 1.15 · specularIntensity 1.00
  emissive = preset glow · emissiveIntensity 2.5 (breathing ±16%)
  crystal preset: ior 1.90 · dispersion 3.4 · iridescence 1.0 · iridescenceIOR 1.90
  'lite' tier auto-swaps to MeshStandardMaterial (no transmission pass = -40% GPU)

LIGHTS     PMREM RoomEnvironment (procedural, zero network)
  key  Directional 1.05 @ (2.2, 3.4, 4.2)
  accentA Point preset.primary 12 @ (-2.1, 1.2, 1.8)   decay 2, distance 9
  accentB Point preset.accent  10 @ ( 2.2,-1.4, 1.5)
  rim   Point preset.glow       8 @ ( 0.0, 0.4,-2.4)
  ambient #0b1020 @ 1.4

BLOOM      EffectComposer → RenderPass → UnrealBloomPass → OutputPass
  strength 0.52–1.15 per preset · radius 0.58–0.90 · threshold 0.16–0.55
  HalfFloat render target · samples 4 (cinematic only) · ACESFilmic, exposure 1.08
  sRGB output is produced by OutputPass (never double-encode with renderer.outputColorSpace)

PARTICLES  Points + ShaderMaterial (billboard size from gl_PointSize)
  count 24–64 × quality.particleScale (1 / 0.7 / 0.45)
  orbit radius 1.16–1.24 · spread ±0.3 · additive · depthWrite false
  uPulse 0.3–1.4 twinkle · rise-mode life = sin(life·π) so no pop-in

INTERACTION
  pointer → NDC (-1..1) → critically damped spring (λ 7.5, dt-correct: 1-exp(-λ·dt))
  tiltX = -py · tilt, tiltY = px · tilt, tilt = 0.18–0.34 rad
  camera parallax push 0.16 (banner) / 0.06 (frame)
  wheel + drag → angular velocity 0.012·px, damped at λ 2.4
  click/hover → burst = 1 → glow ×1.9, bloom ×1.35, scale +4.5%, decays at λ 3.2
  prefers-reduced-motion → damping λ 26, idle spin ×0.15, no auto-rotate

PERF BUDGET  60 fps desktop · 30 fps mobile · < 14 ms frame · GPU time < 6 ms
  IntersectionObserver pause (rootMargin 120px) · visibilitychange pause
  DPR clamp 2 / 1.75 / 1.35 · auto-degrade after 3 consecutive sub-32fps seconds
  dispose(): geometry + material + render-target release, forceContextLoss()`,
    notesAr: 'هذه هي المواصفات الفعلية المطبَّقة في client/src/ornaments/core/engine.js.',
    notesEn: 'These are the real numbers implemented in client/src/ornaments/core/engine.js.'
  },
  {
    id: 'mj-to-three-bridge',
    group: 'spec',
    tool: 'AI render → 3D-ready assets',
    titleAr: 'من صورة MJ إلى أصول 3D حقيقية (إن أردت المجسَّم لا الصورة)',
    titleEn: 'From MJ still to real 3D assets',
    code: `# The web component is procedural, but if you want a *mesh* dragon/ring:
1. Midjourney still (front + 3/4 views, same seed, --cref) → turnaround sheet
2. Meshy AI / Tripo3D / Rodin  → .glb  (target: ≤ 40k tris, PBR metal-rough)
3. decimate + clean:
   gltf-transform optimize in.glb out.glb \\
     --compress draco --texture-compress webp --texture-size 1024 \\
     --simplify true --weld true
4. bake emission into a single channel:
   # emissive map drives UnrealBloomPass; keep baseColor ≤ 0.35 luminance
5. drop-in:
   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
   new GLTFLoader().load('/ornaments/dragon.glb', (gltf) => {
     gltf.scene.traverse(o => { if (o.isMesh) {
       o.material.envMapIntensity = 1.15;
       o.material.emissiveIntensity = 2.4;
     }});
     engine.spinGroup.add(gltf.scene);   // inherits gyro tilt + scroll spin
   });
6. budget: 1 glb ≤ 900 KB (draco + webp), lazy-load on hover, keep the
   procedural ring as the instant placeholder while it streams.`,
    notesAr: 'أضِف .glb إلى public/ornaments/ وسيُركَّب تلقائيًا داخل الحلقة الزجاجية.',
    notesEn: 'Drop the .glb in public/ornaments/ and it mounts inside the glass band.'
  }
];

export const PROMPT_GROUPS = [
  { id: 'frames', labelAr: 'أطر الملف الشخصي', labelEn: 'Profile frames' },
  { id: 'banners', labelAr: 'بانرات عريضة', labelEn: 'Wide banners' },
  { id: 'motion', labelAr: 'التحريك (Runway/Luma)', labelEn: 'Motion (Runway/Luma)' },
  { id: 'spec', labelAr: 'مواصفات الدمج في الويب', labelEn: 'Web integration specs' }
];

/** Negative prompt reused everywhere — surfaced separately for UI convenience. */
export const MASTER_NEGATIVE = NO_LIST_FRAME;

export function promptsByGroup(group) {
  return PROMPT_BLOCKS.filter((p) => p.group === group);
}
