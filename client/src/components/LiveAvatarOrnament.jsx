import React, { useEffect, useRef } from 'react';

/**
 * Maps any Hearbor frameStyle or bannerStyle id to its living creature archetype & palette.
 */
export function resolveCreatureTheme(styleId = 'dragon') {
  const id = String(styleId || '').toLowerCase();
  if (!id || id === 'default' || id === 'none' || id === 'off') return null;

  if (id.includes('shadow')) {
    return {
      kind: 'shadow',
      primary: '#a855f7',
      secondary: '#38bdf8',
      core: '#1e0936',
      glow: 'rgba(168, 85, 247, 0.7)'
    };
  }
  if (id.includes('cyber') || id.includes('neo-tokyo')) {
    return {
      kind: 'cyber',
      primary: '#00f2fe',
      secondary: '#ff007f',
      core: '#082f49',
      glow: 'rgba(0, 242, 254, 0.7)'
    };
  }
  if (id.includes('ascension')) {
    return {
      kind: 'dragon',
      primary: '#10b981',
      secondary: '#a7f3d0',
      core: '#064e3b',
      glow: 'rgba(16, 185, 129, 0.7)',
      scheme: 'emerald'
    };
  }
  if (id.includes('imperial') || id.includes('gold')) {
    return {
      kind: 'dragon',
      primary: '#eab308',
      secondary: '#fef08a',
      core: '#713f12',
      glow: 'rgba(234, 179, 8, 0.7)',
      scheme: 'gold'
    };
  }
  if (id.includes('sakura')) {
    return {
      kind: 'dragon',
      primary: '#f472b6',
      secondary: '#fbcfe8',
      core: '#831843',
      glow: 'rgba(244, 114, 182, 0.7)',
      scheme: 'sakura'
    };
  }
  if (id.includes('diamond') || id.includes('celestial') || id.includes('thunder') || id.includes('aurora')) {
    return {
      kind: 'dragon',
      primary: '#38bdf8',
      secondary: '#e0f2fe',
      core: '#0c4a6e',
      glow: 'rgba(56, 189, 248, 0.7)',
      scheme: 'thunder',
      isThunder: true
    };
  }
  // Default for 'royal-flame', 'dragon-flame', 'dragon', etc.
  return {
    kind: 'dragon',
    primary: '#ff4500',
    secondary: '#fde047',
    core: '#7f1d1d',
    glow: 'rgba(255, 69, 0, 0.75)',
    scheme: 'fire'
  };
}

/**
 * LiveCreatureOverlay — renders a smooth, sculpted living creature
 * hugging the circular avatar ring (or soaring across the profile banner).
 */
export function LiveCreatureOverlay({
  ornament = 'royal-flame',
  mode = 'frame',
  size = 112,
  style = {}
}) {
  const canvasRef = useRef(null);
  const forcedAttackRef = useRef(0);
  const theme = resolveCreatureTheme(ornament);

  useEffect(() => {
    if (!theme) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let rafId = null;
    const startTime = performance.now();
    const fireParticles = [];
    let headAngle = -Math.PI * 0.4;

    const onTriggerAttack = () => {
      forcedAttackRef.current = performance.now() + 3800;
    };
    window.addEventListener('blackx:trigger-creature-attack', onTriggerAttack);

    function spawnFireBreath(hx, hy, aimAngle, W, scheme) {
      for (let i = 0; i < 5; i++) {
        const spread = (Math.random() - 0.5) * 0.42;
        const speed = (W * 0.011) * (0.75 + Math.random() * 0.55);
        const a = aimAngle + spread;
        fireParticles.push({
          x: hx,
          y: hy,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 1.0,
          decay: 0.02 + Math.random() * 0.015,
          size: (W * 0.028) * (0.7 + Math.random() * 0.65),
          scheme
        });
      }
    }

    function renderFrameMode(t, now) {
      const W = canvas.width;
      const H = canvas.height;
      const CX = W / 2;
      const CY = H / 2;
      // Ring radius calibrated so it hugs the exact edge of the circular avatar
      const R = W * 0.355;

      ctx.clearRect(0, 0, W, H);

      const cycle = t % 5.6;
      const isAttacking = now < forcedAttackRef.current || cycle > 2.8;

      // 1. Update & Draw Volumetric Fire / Shadow / Plasma Stream hugging the ring
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = fireParticles.length - 1; i >= 0; i--) {
        const p = fireParticles[i];
        const toCenterA = Math.atan2(p.y - CY, p.x - CX);
        const tangentA = toCenterA + Math.PI / 2;
        // Pull particles gently onto the circular perimeter so the flame wraps the avatar
        const currDist = Math.hypot(p.x - CX, p.y - CY);
        const radialFix = (R - currDist) * 0.08;
        p.vx = p.vx * 0.88 + Math.cos(tangentA) * (W * 0.0075) + Math.cos(toCenterA) * radialFix;
        p.vy = p.vy * 0.88 + Math.sin(tangentA) * (W * 0.0075) + Math.sin(toCenterA) * radialFix;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) {
          fireParticles.splice(i, 1);
          continue;
        }
        const rad = p.size * (1.7 - p.life * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        if (p.scheme === 'shadow') {
          g.addColorStop(0, `rgba(255,255,255,${p.life})`);
          g.addColorStop(0.38, `rgba(56,189,248,${p.life * 0.9})`);
          g.addColorStop(0.75, `rgba(168,85,247,${p.life * 0.7})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else if (p.scheme === 'cyber' || p.scheme === 'thunder') {
          g.addColorStop(0, `rgba(255,255,255,${p.life})`);
          g.addColorStop(0.4, `rgba(0,242,254,${p.life * 0.9})`);
          g.addColorStop(0.75, `rgba(168,85,247,${p.life * 0.6})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else if (p.scheme === 'emerald') {
          g.addColorStop(0, `rgba(255,255,255,${p.life})`);
          g.addColorStop(0.35, `rgba(167,243,208,${p.life * 0.92})`);
          g.addColorStop(0.7, `rgba(16,185,129,${p.life * 0.75})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else if (p.scheme === 'sakura') {
          g.addColorStop(0, `rgba(255,255,255,${p.life})`);
          g.addColorStop(0.4, `rgba(244,114,182,${p.life * 0.92})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          g.addColorStop(0, `rgba(255,255,245,${p.life})`);
          g.addColorStop(0.28, `rgba(253,224,71,${p.life * 0.95})`);
          g.addColorStop(0.62, `rgba(255,69,0,${p.life * 0.82})`);
          g.addColorStop(1, 'rgba(127,29,29,0)');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2. Draw Smooth Continuous Sculpted Dragon / Creature
      if (theme.kind === 'dragon') {
        const speed = isAttacking ? 0.25 : 1.38;
        headAngle += speed * 0.016;
        const SEGMENTS = 44;
        const spine = [];
        for (let i = 0; i < SEGMENTS; i++) {
          const frac = i / (SEGMENTS - 1);
          const a = headAngle - frac * Math.PI * 1.15;
          const wave = Math.sin(t * 7.5 - i * 0.38) * (W * 0.012) * Math.sin(frac * Math.PI);
          const rad = R + wave;
          spine.push({
            x: CX + Math.cos(a) * rad,
            y: CY + Math.sin(a) * rad,
            a: a + Math.PI / 2,
            frac
          });
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Outer Aura Ribbon along the Dragon Spine
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = SEGMENTS - 1; i >= 1; i--) {
          const p0 = spine[i];
          const p1 = spine[i - 1];
          const taper = Math.sin((1 - p0.frac * 0.88) * Math.PI * 0.9);
          const w = Math.max(2, (W * 0.044) * taper);

          // Glowing outer body stroke
          ctx.strokeStyle = theme.glow;
          ctx.lineWidth = w * 1.45;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();

          // Solid armored core stroke
          ctx.strokeStyle = i % 3 === 0 ? theme.secondary : theme.primary;
          ctx.lineWidth = w * 0.72;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();

          // Sharp Dorsal Dragon Fins along the outer curve
          if (i % 2 === 0 && i < SEGMENTS - 4) {
            const dir = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const nx = Math.cos(dir - Math.PI / 2);
            const ny = Math.sin(dir - Math.PI / 2);
            const finLen = w * 0.95;
            ctx.fillStyle = theme.secondary;
            ctx.beginPath();
            ctx.moveTo(p0.x + nx * (w * 0.3), p0.y + ny * (w * 0.3));
            ctx.lineTo(
              p0.x + nx * (w * 0.3 + finLen) - Math.cos(dir) * (w * 0.55),
              p0.y + ny * (w * 0.3 + finLen) - Math.sin(dir) * (w * 0.55)
            );
            ctx.lineTo(p0.x - Math.cos(dir) * (w * 0.35), p0.y - Math.sin(dir) * (w * 0.35));
            ctx.closePath();
            ctx.fill();
          }
        }

        // Sculpted Dragon Head with Horns, Whiskers, Glowing Eyes & Opening Jaw
        const head = spine[0];
        const neck = spine[1];
        const headDir = Math.atan2(head.y - neck.y, head.x - neck.x);
        const hs = W * 0.052;
        const jawOpen = isAttacking ? 0.52 + Math.sin(t * 28) * 0.08 : 0.08;

        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(headDir);

        // Swept-back Royal Dragon Horns
        ctx.strokeStyle = theme.secondary;
        ctx.lineWidth = Math.max(2, W * 0.01);
        [-1, 1].forEach((side) => {
          ctx.beginPath();
          ctx.moveTo(-hs * 0.15, side * hs * 0.38);
          ctx.quadraticCurveTo(-hs * 1.15, side * hs * 1.15, -hs * 1.75, side * hs * 0.78);
          ctx.stroke();
        });

        // Lower Jaw
        ctx.save();
        ctx.rotate(jawOpen);
        ctx.fillStyle = theme.primary;
        ctx.beginPath();
        ctx.moveTo(0, hs * 0.12);
        ctx.lineTo(hs * 1.18, hs * 0.34);
        ctx.lineTo(hs * 0.88, hs * 0.58);
        ctx.lineTo(-hs * 0.2, hs * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Upper Snout & Fierce Brow
        ctx.save();
        ctx.rotate(-jawOpen * 0.5);
        ctx.fillStyle = theme.secondary;
        ctx.beginPath();
        ctx.moveTo(-hs * 0.5, 0);
        ctx.lineTo(-hs * 0.1, -hs * 0.68);
        ctx.lineTo(hs * 1.32, -hs * 0.22);
        ctx.lineTo(hs * 1.38, hs * 0.12);
        ctx.lineTo(0, hs * 0.18);
        ctx.closePath();
        ctx.fill();

        // Glowing Slit Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hs * 0.28, -hs * 0.24, hs * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // Breathe Fire Stream / Lightning Bolts!
        const mouthX = head.x + Math.cos(headDir) * (hs * 1.25);
        const mouthY = head.y + Math.sin(headDir) * (hs * 1.25);
        if (isAttacking) {
          spawnFireBreath(mouthX, mouthY, headDir + 0.22, W, theme.scheme);
          if (theme.isThunder) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            let currA = headAngle + 0.18;
            ctx.moveTo(mouthX, mouthY);
            for (let s = 1; s <= 10; s++) {
              currA += 0.22;
              const jitter = (Math.random() - 0.5) * (W * 0.038);
              ctx.lineTo(CX + Math.cos(currA) * (R + jitter), CY + Math.sin(currA) * (R + jitter));
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      } else if (theme.kind === 'shadow') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Continuous Abyssal Shadow Aura Ring + Swirling Shadow Tendrils
        for (let i = 0; i < 3; i++) {
          const startA = t * (1.2 + i * 0.4) + (i * Math.PI * 2) / 3;
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(168, 85, 247, 0.78)' : 'rgba(56, 189, 248, 0.78)';
          ctx.lineWidth = W * 0.018;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(CX, CY, R + Math.sin(t * 4 + i) * (W * 0.008), startA, startA + Math.PI * 0.45);
          ctx.stroke();
        }

        // Shadow Monarch Armored Helm Crest at Crown of Avatar
        const mx = CX;
        const my = CY - R * 1.02 + Math.sin(t * 3) * (W * 0.008);
        const s = W * 0.088;
        ctx.fillStyle = 'rgba(15, 7, 32, 0.94)';
        ctx.strokeStyle = isAttacking ? '#38bdf8' : '#a855f7';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(mx, my - s * 1.15);
        ctx.lineTo(mx - s * 0.72, my - s * 0.35);
        ctx.lineTo(mx - s * 0.45, my + s * 0.52);
        ctx.lineTo(mx, my + s * 0.78);
        ctx.lineTo(mx + s * 0.45, my + s * 0.52);
        ctx.lineTo(mx + s * 0.72, my - s * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Sovereign Eyes
        [-1, 1].forEach((side) => {
          ctx.fillStyle = isAttacking ? '#38bdf8' : '#c084fc';
          ctx.beginPath();
          ctx.moveTo(mx + side * s * 0.12, my + s * 0.12);
          ctx.lineTo(mx + side * s * 0.44, my - s * 0.08);
          ctx.lineTo(mx + side * s * 0.26, my + s * 0.24);
          ctx.closePath();
          ctx.fill();
        });

        if (isAttacking) {
          for (let k = 0; k < 2; k++) {
            const slashStart = t * 9.5 + k * Math.PI;
            ctx.strokeStyle = k === 0 ? '#a855f7' : '#38bdf8';
            ctx.lineWidth = W * 0.024;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(CX, CY, R * 1.02, slashStart, slashStart + Math.PI * 0.72);
            ctx.stroke();
          }
          const randA = t * 8;
          spawnFireBreath(CX + Math.cos(randA) * R, CY + Math.sin(randA) * R, randA + Math.PI / 2, W, 'shadow');
        }
        ctx.restore();
      } else if (theme.kind === 'cyber') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const droneA = isAttacking ? -Math.PI / 2 + Math.sin(t * 3) * 0.35 : t * 1.18;
        const dx = CX + Math.cos(droneA) * (R * 1.02);
        const dy = CY + Math.sin(droneA) * (R * 1.02);
        const wingSpread = isAttacking ? 0.55 + Math.sin(t * 20) * 0.08 : 0.24;
        const ds = W * 0.068;

        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(droneA + Math.PI / 2);
        [-1, 1].forEach((side) => {
          for (let w = 0; w < 3; w++) {
            ctx.save();
            ctx.rotate(side * (wingSpread + w * 0.24));
            ctx.fillStyle = w % 2 === 0 ? 'rgba(0, 242, 254, 0.85)' : 'rgba(255, 0, 128, 0.85)';
            ctx.beginPath();
            ctx.moveTo(side * ds * 0.3, 0);
            ctx.lineTo(side * ds * (1.5 - w * 0.2), -ds * (0.35 + w * 0.15));
            ctx.lineTo(side * ds * (1.2 - w * 0.2), ds * 0.18);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        });
        ctx.fillStyle = isAttacking ? '#ff0055' : '#00f2fe';
        ctx.beginPath();
        ctx.arc(0, 0, ds * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (isAttacking) {
          const scanY = CY + Math.sin(t * 7) * (R * 0.78);
          const halfChord = Math.sqrt(Math.max(0, R * R - Math.pow(scanY - CY, 2)));
          ctx.strokeStyle = 'rgba(255, 0, 128, 0.92)';
          ctx.lineWidth = W * 0.012;
          ctx.beginPath();
          ctx.moveTo(CX - halfChord, scanY);
          ctx.lineTo(CX + halfChord, scanY);
          ctx.stroke();
          spawnFireBreath(dx, dy, droneA + Math.PI / 2, W, 'cyber');
        }
        ctx.restore();
      }
    }

    function renderBannerMode(t) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Smooth Soaring Winged Dragon / Energy Ribbon across the Banner Sky (no dotted worm!)
      const headX = ((t * 115) % (W * 1.4)) - W * 0.2;
      const headY = H * 0.44 + Math.sin(t * 2.4) * (H * 0.12);

      // Continuous Tapered Serpentine Ribbon
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const sx = headX - i * 9.5;
        const sy = headY + Math.sin(t * 6.5 - i * 0.32) * 11;
        pts.push({ x: sx, y: sy });
      }

      for (let i = pts.length - 1; i >= 1; i--) {
        const taper = Math.sin((1 - i / pts.length) * Math.PI * 0.9);
        ctx.strokeStyle = theme.glow;
        ctx.lineWidth = Math.max(1.5, 16 * taper);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
        ctx.stroke();

        ctx.strokeStyle = i % 2 === 0 ? theme.secondary : theme.primary;
        ctx.lineWidth = Math.max(1, 7 * taper);
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
        ctx.stroke();
      }

      // Sweeping Dragon Wings at segment 4
      const wingBase = pts[4];
      if (wingBase) {
        const flap = Math.sin(t * 9) * 24;
        ctx.fillStyle = theme.glow;
        ctx.beginPath();
        ctx.moveTo(wingBase.x, wingBase.y);
        ctx.lineTo(wingBase.x - 34, wingBase.y - 32 - flap);
        ctx.lineTo(wingBase.x - 14, wingBase.y - 6);
        ctx.closePath();
        ctx.fill();
      }

      // Dragon Breath Flame Plume in the Banner Sky
      if (Math.sin(t * 2.2) > -0.2) {
        const plume = ctx.createRadialGradient(headX + 10, headY, 2, headX + 85, headY, 78);
        plume.addColorStop(0, '#ffffff');
        plume.addColorStop(0.32, theme.secondary);
        plume.addColorStop(0.7, theme.primary);
        plume.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = plume;
        ctx.beginPath();
        ctx.arc(headX + 68, headY, 78, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function animate(now) {
      const t = (now - startTime) * 0.001;
      if (mode === 'banner') {
        renderBannerMode(t);
      } else {
        renderFrameMode(t, now);
      }
      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('blackx:trigger-creature-attack', onTriggerAttack);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [ornament, mode, size, theme]);

  if (!theme) return null;

  if (mode === 'banner') {
    return (
      <canvas
        ref={canvasRef}
        width={760}
        height={240}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 3,
          ...style
        }}
      />
    );
  }

  // Calibrated to 1.38x so R = 0.355 * 1.38 = 0.49x of container size (hugs the avatar border!)
  const overlaySize = Math.round(size * 1.38);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={360}
      onClick={() => {
        forcedAttackRef.current = performance.now() + 3800;
      }}
      style={{
        position: 'absolute',
        width: `${overlaySize}px`,
        height: `${overlaySize}px`,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 12,
        ...style
      }}
    />
  );
}

export default LiveCreatureOverlay;
