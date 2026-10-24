import React, { useEffect, useRef, useState, useCallback } from 'react';
import BxIcon from '../mobile/BxIcon.jsx';

export const BLACK_X_MOTION_THEMES = [
  {
    id: 'random',
    iconName: 'dice',
    nameAr: 'تبديل عشوائي (الكل)',
    nameEn: 'Auto-Rotate (All 5)',
    subAr: 'يشغّل موشن مختلف من الـ 5 في كل مرة',
    subEn: 'Plays a different motion graphic every launch'
  },
  {
    id: 'vortex',
    iconName: 'orbit',
    nameAr: '1. بوابة الظلال',
    nameEn: '1. Shadow Vortex',
    subAr: 'دوامة جزيئات ثلاثية الأبعاد وموجات صدمة ضوئية',
    subEn: '3D Particle Singularity & Shockwaves'
  },
  {
    id: 'katana',
    iconName: 'swords',
    nameAr: '2. ضربة سيف الكاتانا',
    nameEn: '2. Katana X-Slash',
    subAr: 'ضربتا سيف أنمي خاطفتان مع شرارات الفولاذ الأبيض',
    subEn: 'Dual Supersonic Anime Blade Slashes & Sparks'
  },
  {
    id: 'cyber',
    iconName: 'zap',
    nameAr: '3. مصفوفة الغليتش',
    nameEn: '3. Cyber Matrix Glitch',
    subAr: 'مطر رقمي وشبكة ثلاثية الأبعاد وغليتش سايبربانك',
    subEn: 'Digital Rain, 3D Wireframe Grid & Glitch Lock'
  },
  {
    id: 'eclipse',
    iconName: 'circle-dashed',
    nameAr: '4. كسوف الثقب الأسود',
    nameEn: '4. Eclipse Singularity',
    subAr: 'أفق الحدث وحلقة الفوتونات وانحناء الضوء الكوني',
    subEn: 'Relativistic Accretion Disk & Photon Ring'
  },
  {
    id: 'monarch',
    iconName: 'crown',
    nameAr: '5. عرش إمبراطور الظلال',
    nameEn: '5. Monarch Sovereign',
    subAr: 'تاج الملك الماسي وأعمدة لهب الظلال البيضاء',
    subEn: 'Sovereign Crown Forging & Ascending Light Pillars'
  }
];

const CONCRETE_MODES = ['vortex', 'katana', 'cyber', 'eclipse', 'monarch'];

function resolveInitialMode(requestedMode) {
  let saved = requestedMode || 'random';
  if (!requestedMode) {
    try {
      saved = localStorage.getItem('bx_motion_pref') || 'random';
    } catch (_) {}
  }
  if (saved === 'random' || !CONCRETE_MODES.includes(saved)) {
    let lastIdx = 0;
    try {
      lastIdx = Number(sessionStorage.getItem('bx_motion_rot_idx') || 0);
    } catch (_) {}
    const nextIdx = (Number.isFinite(lastIdx) ? lastIdx : 0) + 1;
    const modeIdx = nextIdx % CONCRETE_MODES.length;
    try {
      sessionStorage.setItem('bx_motion_rot_idx', String(modeIdx));
    } catch (_) {}
    return CONCRETE_MODES[modeIdx];
  }
  return saved;
}

/**
 * Hearbor — 5-Engine 120Hz Motion Graphics Suite (Pure Monochrome #000000 & #FFFFFF)
 * Engines:
 *  1. vortex  — Shadow Vortex Singularity (بوابة الظلال والجزيئات)
 *  2. katana  — Katana X-Slash (ضربة سيف الكاتانا الأسطورية)
 *  3. cyber   — Cyber Matrix Glitch 120Hz (مصفوفة السايبربانك والغليتش)
 *  4. eclipse — Eclipse Singularity (كسوف الثقب الأسود وأفق الحدث)
 *  5. monarch — Monarch Sovereign Crown (عرش إمبراطور الظلال VIP)
 */
export default function BlackXSplashVortex({
  durationMs = 4000,
  initialMode,
  customSubtitleAr,
  customSubtitleEn,
  onComplete,
  lang = 'ar',
  enableSound = true,
  performanceProfile = 'full'
}) {
  const canvasRef = useRef(null);
  const prefersReducedMotion = typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const isWebProfile = performanceProfile === 'web';
  const [activeMode] = useState(() => resolveInitialMode(initialMode));
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0); // 0: intro, 1: climax, 2: logo lock, 3: portal exit
  const [exiting, setExiting] = useState(false);
  const [measuredFps, setMeasuredFps] = useState(() => (isWebProfile ? 0 : 120));
  const [soundMuted, setSoundMuted] = useState(() => !enableSound || prefersReducedMotion);

  const audioCtxRef = useRef(null);
  const soundPlayedRef = useRef(false);
  const impactPlayedRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const climaxAudioRef = useRef(null);
  onCompleteRef.current = onComplete;

  const isRtl = lang === 'ar';

  // Ensure AudioContext is ready
  const getAudioCtx = useCallback(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Mode-Specific Procedural Web Audio API Sound Design (5 Distinct Soundscapes)
  const triggerIntroAudio = useCallback(
    (mode) => {
      if (soundMuted || soundPlayedRef.current) return;
      try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        soundPlayedRef.current = true;
        const now = ctx.currentTime;
        const scale = Math.max(0.35, durationMs / 4000);

        if (mode === 'vortex') {
          // 1. Deep Sub-Bass Vortex Drone + Swirling Bandpass Wind
          const sub = ctx.createOscillator();
          const gain = ctx.createGain();
          sub.type = 'sine';
          sub.frequency.setValueAtTime(36, now);
          sub.frequency.exponentialRampToValueAtTime(94, now + 1.8 * scale);
          sub.frequency.exponentialRampToValueAtTime(32, now + 2.6 * scale);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.32, now + 0.45 * scale);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5 * scale);
          sub.connect(gain);
          gain.connect(ctx.destination);
          sub.start(now);
          sub.stop(now + 3.55 * scale);
        } else if (mode === 'katana') {
          // 2. Metallic Katana Unsheathe ("Shiiing") + Dual Air-Slice Whooshes
          const ring = ctx.createOscillator();
          const ringGain = ctx.createGain();
          ring.type = 'sine';
          ring.frequency.setValueAtTime(1480, now);
          ring.frequency.exponentialRampToValueAtTime(3120, now + 0.55 * scale);
          ringGain.gain.setValueAtTime(0.001, now);
          ringGain.gain.linearRampToValueAtTime(0.12, now + 0.12 * scale);
          ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9 * scale);
          ring.connect(ringGain);
          ringGain.connect(ctx.destination);
          ring.start(now);
          ring.stop(now + 0.95 * scale);

          // Two high-velocity blade slashes at 0.65s and 1.15s
          [0.62 * scale, 1.12 * scale].forEach((slashTime, idx) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(idx === 0 ? 680 : 880, now + slashTime);
            osc.frequency.exponentialRampToValueAtTime(95, now + slashTime + 0.28);
            g.gain.setValueAtTime(0.24, now + slashTime);
            g.gain.exponentialRampToValueAtTime(0.001, now + slashTime + 0.3);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now + slashTime);
            osc.stop(now + slashTime + 0.32);
          });
        } else if (mode === 'cyber') {
          // 3. High-Speed Digital Arpeggio Telemetry Pulses
          const notes = [220, 330, 440, 660, 880, 660, 990, 1320];
          notes.forEach((freq, i) => {
            const t = now + i * 0.16 * scale;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.06, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.12 * scale);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.13 * scale);
          });
        } else if (mode === 'eclipse') {
          // 4. Cosmic Gravitational Sub-Harmonic Chord
          [44, 66, 132].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = i === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 1.8 * scale);
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.18 / (i + 1), now + 0.9 * scale);
            g.gain.exponentialRampToValueAtTime(0.001, now + 3.4 * scale);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 3.45 * scale);
          });
        } else if (mode === 'monarch') {
          // 5. Royal Sovereign Ascending Brass/Crystalline Fanfare
          [196, 246.94, 293.66, 392, 587.33].forEach((freq, i) => {
            const t = now + i * 0.25 * scale;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.14, t + 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.2 * scale);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 1.25 * scale);
          });
        }
      } catch (_) {}
    },
    [soundMuted, durationMs, getAudioCtx]
  );

  const triggerClimaxImpactAudio = useCallback(
    (mode) => {
      if (soundMuted || impactPlayedRef.current) return;
      try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        impactPlayedRef.current = true;
        const now = ctx.currentTime;

        const impactOsc = ctx.createOscillator();
        const impactGain = ctx.createGain();
        impactOsc.type = 'triangle';
        impactOsc.frequency.setValueAtTime(mode === 'katana' ? 190 : 150, now);
        impactOsc.frequency.exponentialRampToValueAtTime(28, now + 1.2);
        impactGain.gain.setValueAtTime(0.42, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
        impactOsc.connect(impactGain);
        impactGain.connect(ctx.destination);
        impactOsc.start(now);
        impactOsc.stop(now + 1.4);

        const chord =
          mode === 'monarch'
            ? [587.33, 880, 1174.66]
            : mode === 'cyber'
            ? [440, 880, 1320]
            : [528, 792, 1056];
        chord.forEach((freq, idx) => {
          const chime = ctx.createOscillator();
          const chimeGain = ctx.createGain();
          chime.type = 'sine';
          chime.frequency.setValueAtTime(freq, now);
          chime.frequency.exponentialRampToValueAtTime(freq * 0.996, now + 1.5);
          chimeGain.gain.setValueAtTime(0.085 / (idx + 1), now);
          chimeGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.55);
          chime.connect(chimeGain);
          chimeGain.connect(ctx.destination);
          chime.start(now);
          chime.stop(now + 1.6);
        });
      } catch (_) {}
    },
    [soundMuted, getAudioCtx]
  );

  const finishSplash = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setExiting(true);
    setTimeout(() => {
      try {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
      } catch (_) {}
      onCompleteRef.current?.();
    }, 320);
  }, []);

  useEffect(() => {
    climaxAudioRef.current = triggerClimaxImpactAudio;
  }, [triggerClimaxImpactAudio]);

  useEffect(() => {
    triggerIntroAudio(activeMode);
    const unlock = () => {
      if (!soundPlayedRef.current) triggerIntroAudio(activeMode);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [activeMode, triggerIntroAudio]);

  // Canvas renderer uses one engine per splash and a 60 FPS cap on the website.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, isWebProfile ? 1.5 : 2.5);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, isWebProfile ? 1.5 : 2.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    if (prefersReducedMotion) {
      resize();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      setProgress(100);
      setPhase(2);
      const completionTimer = window.setTimeout(finishSplash, Math.min(850, Math.max(500, durationMs)));
      return () => window.clearTimeout(completionTimer);
    }

    resize();
    window.addEventListener('resize', resize);

    const maxRadius = Math.hypot(width, height) * 0.68;

    // Allocate only the current engine's particles; the website profile trims the active set.
    const particleCount = isWebProfile ? 150 : 360;
    const particles = activeMode === 'vortex' || activeMode === 'eclipse'
      ? Array.from({ length: particleCount }, (_, i) => {
      const arm = i % 4;
      const baseAngle = (arm * Math.PI) / 2 + Math.random() * 0.9;
      const distRatio = Math.pow(Math.random(), 0.72);
      return {
        angle: baseAngle + distRatio * Math.PI * 3.2,
        radius: 18 + distRatio * maxRadius,
        initialRadius: 18 + distRatio * maxRadius,
        speed: 1.4 + (1 - distRatio) * 3.8 + Math.random() * 0.8,
        size: 1.0 + Math.random() * 2.4,
        alpha: 0.25 + Math.random() * 0.75,
        trailLen: 0.06 + Math.random() * 0.14,
        inclination: (Math.random() - 0.5) * 0.38
      };
    })
      : [];

    // 2. Katana Sparks
    const katanaSparks = activeMode === 'katana'
      ? Array.from({ length: isWebProfile ? 90 : 240 }, (_, i) => {
      const along = (Math.random() - 0.5) * Math.min(width, height) * 0.95;
      const diag = i % 2 === 0 ? 1 : -1;
      const angle = (diag === 1 ? Math.PI / 4 : (3 * Math.PI) / 4) + (Math.random() - 0.5) * 1.4;
      const speed = 90 + Math.random() * 520;
      return {
        x0: along * 0.7,
        y0: along * 0.7 * diag,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.1 + Math.random() * 2.6,
        alpha: 0.5 + Math.random() * 0.5,
        diag
      };
    })
      : [];

    // Only build the current mode's matrix columns.
    const colCount = activeMode === 'cyber'
      ? (isWebProfile ? Math.max(12, Math.floor(width / 72)) : Math.max(28, Math.floor(width / 22)))
      : 0;
    const matrixCols = Array.from({ length: colCount }, (_, i) => ({
      x: (i + 0.5) * (width / colCount),
      y: Math.random() * height,
      speed: 260 + Math.random() * 440,
      len: 6 + Math.floor(Math.random() * 14),
      chars: Array.from({ length: 16 }, () =>
        'BLACKX120HZ01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ'[Math.floor(Math.random() * 28)]
      )
    }));

    const monarchShards = activeMode === 'monarch'
      ? Array.from({ length: isWebProfile ? 72 : 180 }, () => ({
          x: (Math.random() - 0.5) * width * 0.9,
          y: height * 0.55 + Math.random() * height * 0.5,
          vy: 180 + Math.random() * 420,
          size: 2 + Math.random() * 5.5,
          alpha: 0.3 + Math.random() * 0.7,
          spin: (Math.random() - 0.5) * 6
        }))
      : [];

    const shockwaves = [
      { maxR: Math.max(width, height) * 0.75, speed: 950, width: 3.5, alpha: 0.95, delay: 0 },
      { maxR: Math.max(width, height) * 0.55, speed: 640, width: 1.8, alpha: 0.65, delay: 0.12 },
      { maxR: Math.max(width, height) * 0.4, speed: 420, width: 1.0, alpha: 0.45, delay: 0.24 }
    ];

    const startTime = performance.now();
    let lastFrameTime = startTime;
    let frameCounter = 0;
    let fpsTimer = startTime;
    let lastProgress = -1;
    let lastPhase = -1;
    let rafId;
    const frameIntervalMs = 1000 / (isWebProfile ? 60 : 120);
    const safeDurationMs = Math.max(1, Number(durationMs) || 4000);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const render = (now) => {
      if (completedRef.current) return;
      if (now - lastFrameTime < frameIntervalMs - 0.25) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      frameCounter++;
      if (now - fpsTimer >= 450) {
        const currentFps = Math.round((frameCounter * 1000) / (now - fpsTimer));
        setMeasuredFps(isWebProfile ? currentFps : (currentFps >= 105 ? 120 : currentFps >= 80 ? 90 : 120));
        frameCounter = 0;
        fpsTimer = now;
      }

      const elapsed = now - startTime;
      const tNorm = Math.min(elapsed / safeDurationMs, 1);
      const tSec = tNorm * 4.0;

      const nextProgress = Math.round(tNorm * 100);
      if (nextProgress !== lastProgress) {
        setProgress(nextProgress);
        lastProgress = nextProgress;
      }

      const nextPhase = tSec < 1.35 ? 0 : tSec < 1.95 ? 1 : tSec < 3.45 ? 2 : 3;
      if (nextPhase !== lastPhase) {
        setPhase(nextPhase);
        lastPhase = nextPhase;
      }
      if (nextPhase === 2 && !impactPlayedRef.current) {
        climaxAudioRef.current?.(activeMode);
      }

      const cx = width / 2;
      const cy = height / 2 - 18;

      // Clear with motion trail
      ctx.fillStyle = activeMode === 'katana' ? 'rgba(0, 0, 0, 0.38)' : 'rgba(0, 0, 0, 0.30)';
      ctx.fillRect(0, 0, width, height);

      // ==================== ENGINE 1: SHADOW VORTEX ====================
      if (activeMode === 'vortex') {
        const coreIntensity =
          tSec < 1.8 ? Math.min(0.24, (tSec / 1.8) * 0.24) : tSec < 2.15 ? 0.55 - ((tSec - 1.8) / 0.35) * 0.35 : 0.18;
        const coreRadius = tSec < 1.8 ? 70 + (1 - tSec / 1.8) * 140 : 190 + Math.sin(tSec * 5) * 12;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
        grad.addColorStop(0, `rgba(255,255,255,${coreIntensity})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${coreIntensity * 0.28})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(cx, cy);
        for (let r = 0; r < 3; r++) {
          const ringBaseR = 64 + r * 38;
          const squeeze =
            tSec < 1.8 ? 1 - Math.pow(tSec / 1.8, 2.2) * 0.68 : Math.min(1.08, 0.32 + (tSec - 1.8) * 1.4);
          ctx.save();
          ctx.rotate(tSec * (r % 2 === 0 ? 2.4 : -3.1) * (1 + r * 0.35));
          ctx.strokeStyle = `rgba(255,255,255,${0.15 - r * 0.03})`;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([14 + r * 8, 10 + r * 6]);
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(4, ringBaseR * squeeze), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();

        ctx.lineCap = 'round';
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (tSec < 1.8) {
            const pull = 1 + Math.pow(tSec / 1.8, 2.4) * 5.2;
            p.angle += p.speed * pull * dt;
            p.radius = Math.max(2, p.initialRadius * (1 - Math.pow(tSec / 1.8, 1.85)));
            const x1 = cx + Math.cos(p.angle) * p.radius;
            const y1 = cy + Math.sin(p.angle) * p.radius;
            const prevA = p.angle - p.trailLen * pull * 0.45;
            const prevR = p.radius + 8 * (tSec / 1.8);
            ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, p.alpha * (0.4 + (tSec / 1.8) * 0.7))})`;
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(prevA) * prevR, cy + Math.sin(prevA) * prevR);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          } else {
            const postT = tSec - 1.8;
            p.angle += p.speed * 0.45 * dt;
            p.radius = 46 + p.initialRadius * 0.62 * Math.min(1, Math.pow(postT / 0.55, 0.58));
            ctx.fillStyle = `rgba(255,255,255,${p.alpha * 0.68})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(p.angle) * p.radius, cy + Math.sin(p.angle) * p.radius, p.size * 0.75, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ==================== ENGINE 2: KATANA X-SLASH ====================
      else if (activeMode === 'katana') {
        const span = Math.max(width, height) * 0.75;
        ctx.save();
        ctx.translate(cx, cy);

        // Slash 1 (\) at tSec >= 0.55
        if (tSec >= 0.55) {
          const p1 = Math.min(1, (tSec - 0.55) / 0.22);
          const fade1 = tSec < 1.9 ? 1 : Math.max(0.18, 1 - (tSec - 1.9) * 0.5);
          ctx.strokeStyle = `rgba(255,255,255,${fade1})`;
          ctx.lineWidth = tSec < 0.85 ? 6.5 : 2.4;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = isWebProfile ? 12 : 28;
          ctx.beginPath();
          ctx.moveTo(-span, -span);
          ctx.lineTo(-span + span * 2 * p1, -span + span * 2 * p1);
          ctx.stroke();
        }

        // Slash 2 (/) at tSec >= 1.05
        if (tSec >= 1.05) {
          const p2 = Math.min(1, (tSec - 1.05) / 0.22);
          const fade2 = tSec < 1.9 ? 1 : Math.max(0.18, 1 - (tSec - 1.9) * 0.5);
          ctx.strokeStyle = `rgba(255,255,255,${fade2})`;
          ctx.lineWidth = tSec < 1.35 ? 6.5 : 2.4;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = isWebProfile ? 12 : 28;
          ctx.beginPath();
          ctx.moveTo(span, -span);
          ctx.lineTo(span - span * 2 * p2, -span + span * 2 * p2);
          ctx.stroke();
        }

        // High-velocity steel sparks erupting along both blade trajectories
        ctx.shadowBlur = 0;
        for (let i = 0; i < katanaSparks.length; i++) {
          const sp = katanaSparks[i];
          const triggerT = sp.diag === 1 ? 0.62 : 1.12;
          if (tSec >= triggerT) {
            const st = tSec - triggerT;
            const x = sp.x0 + sp.vx * st;
            const y = sp.y0 + sp.vy * st + 140 * st * st;
            const alpha = Math.max(0, sp.alpha * (1 - st / 1.8));
            if (alpha > 0.02) {
              ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
              ctx.lineWidth = sp.size;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x - sp.vx * 0.035, y - sp.vy * 0.035);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // ==================== ENGINE 3: CYBER MATRIX GLITCH 120Hz ====================
      else if (activeMode === 'cyber') {
        // 1. Monochrome Digital Rain Columns
        ctx.font = '900 12px monospace';
        for (let i = 0; i < matrixCols.length; i++) {
          const col = matrixCols[i];
          col.y += col.speed * dt * (tSec < 1.8 ? 1.35 : 0.55);
          if (col.y > height + 180) col.y = -120;
          for (let j = 0; j < col.len; j++) {
            const cyChar = col.y - j * 15;
            if (cyChar < -20 || cyChar > height + 20) continue;
            const isHead = j === 0;
            const alpha = isHead ? 0.92 : Math.max(0, (1 - j / col.len) * 0.32);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillText(col.chars[(j + Math.floor(tSec * 12)) % col.chars.length], col.x, cyChar);
          }
        }

        // 2. 3D Perspective Wireframe Horizon Grid
        const horizonY = cy + 68;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        for (let gx = -12; gx <= 12; gx++) {
          ctx.beginPath();
          ctx.moveTo(cx + gx * 18, horizonY);
          ctx.lineTo(cx + gx * 145, height);
          ctx.stroke();
        }
        const gridOffset = (tSec * 3.5) % 1;
        for (let gz = 1; gz <= 8; gz++) {
          const zNorm = (gz + gridOffset) / 9;
          const yLine = horizonY + Math.pow(zNorm, 2.1) * (height - horizonY);
          ctx.strokeStyle = `rgba(255,255,255,${zNorm * 0.35})`;
          ctx.beginPath();
          ctx.moveTo(0, yLine);
          ctx.lineTo(width, yLine);
          ctx.stroke();
        }

        // 3. Monochrome Glitch Slice Bars during Climax (1.2s -> 2.1s)
        if (tSec >= 1.15 && tSec <= 2.25) {
          for (let b = 0; b < 7; b++) {
            if (Math.random() > 0.45) {
              const by = cy - 110 + Math.random() * 220;
              const bh = 2 + Math.random() * 12;
              const bw = 90 + Math.random() * 260;
              ctx.fillStyle = 'rgba(255,255,255,0.75)';
              ctx.fillRect(cx - bw / 2 + (Math.random() - 0.5) * 60, by, bw, bh);
            }
          }
        }
      }

      // ==================== ENGINE 4: ECLIPSE SINGULARITY (BLACK HOLE) ====================
      else if (activeMode === 'eclipse') {
        const bhRadius = tSec < 1.8 ? 44 + (tSec / 1.8) * 24 : 58;

        // Relativistic Accretion Disk (Tilted Orbital Rings)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.26);
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.angle += p.speed * (tSec < 1.8 ? 1.8 : 0.9) * dt;
          const orbitR = bhRadius * 1.18 + (p.initialRadius * 0.58) * (tSec < 1.8 ? 1 - (tSec / 1.8) * 0.35 : 0.78);
          const x = Math.cos(p.angle) * orbitR;
          const y = Math.sin(p.angle) * orbitR * (0.28 + Math.abs(p.inclination));
          // Relativistic Doppler beaming (brighter on approaching side)
          const doppler = 0.55 + 0.45 * Math.cos(p.angle);
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, p.alpha * doppler)})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Blazing White Photon Ring + Pitch-Black Event Horizon Core
        ctx.save();
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = isWebProfile ? (tSec >= 1.8 ? 20 : 12) : (tSec >= 1.8 ? 42 : 24);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = tSec >= 1.8 ? 3.8 : 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, bhRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(cx, cy, bhRadius - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ==================== ENGINE 5: MONARCH SOVEREIGN CROWN ====================
      else if (activeMode === 'monarch') {
        // Ascending Royal Shadow-Light Shards
        for (let i = 0; i < monarchShards.length; i++) {
          const s = monarchShards[i];
          s.y -= s.vy * dt * (tSec < 1.8 ? 1.3 : 0.65);
          if (s.y < -height * 0.55) s.y = height * 0.55;
          const sx = cx + s.x * (tSec < 1.8 ? 1 - (tSec / 1.8) * 0.45 : 0.85);
          const sy = cy + s.y;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(tSec * s.spin);
          ctx.fillStyle = `rgba(255,255,255,${s.alpha * 0.78})`;
          ctx.beginPath();
          ctx.moveTo(0, -s.size);
          ctx.lineTo(s.size * 0.65, 0);
          ctx.lineTo(0, s.size);
          ctx.lineTo(-s.size * 0.65, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Sovereign Geometric Crown forged above the Emblem
        const crownProgress = Math.min(1, Math.max(0, (tSec - 0.55) / 1.1));
        if (crownProgress > 0.02) {
          ctx.save();
          ctx.translate(cx, cy - 92);
          ctx.scale(crownProgress, crownProgress);
          ctx.strokeStyle = '#ffffff';
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = isWebProfile ? 10 : 22;
          ctx.beginPath();
          ctx.moveTo(-48, 16);
          ctx.lineTo(-56, -18);
          ctx.lineTo(-26, 2);
          ctx.lineTo(0, -34);
          ctx.lineTo(26, 2);
          ctx.lineTo(56, -18);
          ctx.lineTo(48, 16);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Universal Climax Shockwave Rings & X-Beams at tSec >= 1.8
      if (tSec >= 1.8) {
        const postT = tSec - 1.8;
        for (const sw of shockwaves) {
          const swTime = postT - sw.delay;
          if (swTime > 0) {
            const r = Math.min(sw.maxR, swTime * sw.speed);
            const prog = r / sw.maxR;
            const alpha = Math.max(0, sw.alpha * (1 - Math.pow(prog, 0.85)));
            if (alpha > 0.01) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.lineWidth = sw.width * (1 - prog * 0.5);
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      if (elapsed >= safeDurationMs) {
        finishSplash();
        return;
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [activeMode, durationMs, finishSplash, isWebProfile, prefersReducedMotion]);

  const logoVisible = phase >= 1;
  const textVisible = phase >= 2;
  const portalZoom = phase === 3 || exiting;
  const activeMeta = BLACK_X_MOTION_THEMES.find((m) => m.id === activeMode) || BLACK_X_MOTION_THEMES[1];

  return (
    <div
      className="bx-intro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#000000',
        color: '#ffffff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        opacity: exiting ? 0 : 1,
        transform: portalZoom ? (isWebProfile ? 'scale(1.05)' : 'scale(1.42)') : 'scale(1)',
        transition: 'opacity 0.34s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* 120Hz Motion Graphics Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      />

      {/* Top HUD Bar: 120Hz Telemetry + Sound + Instant Skip */}
      <div
        style={{
          position: 'absolute',
          top: 'max(0.9rem, env(safe-area-inset-top, 0.9rem))',
          left: '1rem',
          right: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 6,
          gap: '0.5rem'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.32rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.22)',
            backdropFilter: isWebProfile ? 'none' : 'blur(10px)',
            fontSize: '0.66rem',
            fontWeight: 900,
            letterSpacing: '0.07em',
            fontFamily: 'monospace'
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 0 10px #ffffff'
            }}
          />
          <span>
            {isWebProfile
              ? (measuredFps ? `${measuredFps} FPS` : '≤60 FPS')
              : `${measuredFps >= 105 ? 120 : measuredFps >= 80 ? 90 : 60}Hz`} · <BxIcon name={activeMeta.iconName} /> {isRtl ? activeMeta.nameAr : activeMeta.nameEn}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={() => {
              const nextMuted = !soundMuted;
              setSoundMuted(nextMuted);
              if (!nextMuted) {
                soundPlayedRef.current = false;
                triggerIntroAudio(activeMode);
              }
            }}
            style={{
              padding: '0.34rem 0.65rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.22)',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <BxIcon name={soundMuted ? 'mute' : 'volume'} label={soundMuted ? 'Unmute' : 'Mute'} />
          </button>

          <button
            type="button"
            onClick={finishSplash}
            style={{
              padding: '0.34rem 0.85rem',
              borderRadius: '999px',
              background: '#ffffff',
              border: '1px solid #ffffff',
              color: '#000000',
              fontSize: '0.72rem',
              fontWeight: 900,
              cursor: 'pointer',
              letterSpacing: '0.04em'
            }}
          >
            {isRtl ? 'تخطي' : 'SKIP'} <BxIcon name="skip-forward" />
          </button>
        </div>
      </div>

      {/* Central Vector Emblem & Kinetic Typography */}
      <div
        style={{
          position: 'relative',
          zIndex: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 1.5rem',
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '116px',
            height: '116px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.3rem',
            transform: logoVisible ? 'scale(1) rotate(0deg)' : 'scale(0.18) rotate(-135deg)',
            opacity: logoVisible ? 1 : 0,
            transition:
              'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <svg
            viewBox="0 0 140 140"
            style={{
              position: 'absolute',
              inset: '-12px',
              width: '140px',
              height: '140px',
              overflow: 'visible',
              filter: isWebProfile ? 'drop-shadow(0 0 12px rgba(255,255,255,0.4))' : 'drop-shadow(0 0 24px rgba(255,255,255,0.6))'
            }}
          >
            <polygon
              points="70,4 120,20 136,70 120,120 70,136 20,120 4,70 20,20"
              fill="rgba(0,0,0,0.92)"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeDasharray={textVisible ? '420' : '90 30'}
              style={{ transition: 'stroke-dasharray 0.7s ease' }}
            />
            <circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              stroke="rgba(255,255,255,0.32)"
              strokeWidth="1"
              strokeDasharray="6 6"
            />
          </svg>
          <img
            src="/blackx-logo.png"
            alt="Hearbor"
            style={{
              position: 'relative',
              zIndex: 2,
              width: '88px',
              height: '88px',
              borderRadius: '20px',
              objectFit: 'cover',
              boxShadow: isWebProfile ? '0 0 26px rgba(255, 255, 255, 0.34)' : '0 0 26px rgba(255, 0, 0, 0.45)'
            }}
          />
        </div>

        <div
          style={{
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.92)',
            transition: 'all 0.52s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div
            style={{
              fontSize: 'clamp(2.1rem, 7vw, 3.1rem)',
              fontWeight: 900,
              letterSpacing: textVisible ? '0.26em' : '0.65em',
              paddingLeft: textVisible ? '0.26em' : '0.65em',
              color: '#ffffff',
              textShadow: isWebProfile ? '0 0 16px rgba(255,255,255,0.5)' : '0 0 28px rgba(255,255,255,0.65)',
              lineHeight: 1.05,
              transition: 'letter-spacing 0.72s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            Hearbor
          </div>

          <div
            style={{
              marginTop: '0.58rem',
              fontSize: '0.84rem',
              fontWeight: 800,
              color: 'rgba(255,255,255,0.88)',
              letterSpacing: '0.04em'
            }}
          >
            {customSubtitleAr || customSubtitleEn
              ? isRtl
                ? customSubtitleAr || customSubtitleEn
                : customSubtitleEn || customSubtitleAr
              : isRtl
              ? activeMeta.subAr
              : activeMeta.subEn}
          </div>

          <div
            style={{
              marginTop: '0.3rem',
              fontSize: '0.64rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.48)',
              letterSpacing: '0.2em',
              fontFamily: 'monospace'
            }}
          >
            {activeMeta.nameEn.toUpperCase()}{isWebProfile ? ' · WEB · 60 FPS CAP' : ''}
          </div>
        </div>
      </div>

      {/* Bottom Cinematic Loader Bar (Clean External Splash — Theme selection is strictly inside App Settings) */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(1.6rem, env(safe-area-inset-bottom, 1.6rem))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(340px, 84vw)',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.42rem'
        }}
      >
        {/* Progress Status & Track */}
        <div style={{ maxWidth: '340px', width: '100%', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: 'rgba(255,255,255,0.75)',
              fontFamily: 'monospace',
              marginBottom: '0.32rem'
            }}
          >
            <span>
              <BxIcon name={activeMeta.iconName} /> {isRtl ? activeMeta.nameAr : activeMeta.nameEn}
            </span>
            <span>{progress}%</span>
          </div>

          <div
            style={{
              width: '100%',
              height: '3px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.14)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: '#ffffff',
                boxShadow: '0 0 14px #ffffff',
                transition: 'width 0.05s linear'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
