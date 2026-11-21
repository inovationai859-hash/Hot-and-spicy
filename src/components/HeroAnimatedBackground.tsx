import React, { useEffect, useRef } from 'react';
import { getTheme } from '../ink/theme';

interface GlowingOrb {
  baseX: number;
  baseY: number;
  radius: number;
  lightStops: [string, string];
  darkStops: [string, string];
}

const ORBS: GlowingOrb[] = [
  {
    baseX: 0.72,
    baseY: 0.42,
    radius: 0.56,
    lightStops: ['rgba(141, 102, 19, 0.24)', 'rgba(141, 102, 19, 0)'],
    darkStops: ['rgba(216, 180, 103, 0.26)', 'rgba(141, 102, 19, 0)'],
  },
  {
    baseX: 0.24,
    baseY: 0.68,
    radius: 0.5,
    lightStops: ['rgba(168, 56, 22, 0.16)', 'rgba(168, 56, 22, 0)'],
    darkStops: ['rgba(196, 62, 24, 0.24)', 'rgba(140, 32, 12, 0)'],
  },
  {
    baseX: 0.84,
    baseY: 0.76,
    radius: 0.42,
    lightStops: ['rgba(14, 165, 233, 0.11)', 'rgba(14, 165, 233, 0)'],
    darkStops: ['rgba(56, 189, 248, 0.18)', 'rgba(14, 116, 144, 0)'],
  },
  {
    baseX: 0.46,
    baseY: 0.22,
    radius: 0.58,
    lightStops: ['rgba(20, 16, 11, 0.12)', 'rgba(20, 16, 11, 0)'],
    darkStops: ['rgba(141, 102, 19, 0.14)', 'rgba(18, 14, 10, 0)'],
  },
];

export const HeroAnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const WIDTH = 320;
    const HEIGHT = 180;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const drawStaticFrame = () => {
      const isDark = getTheme() === 'dark';

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // 1. Base backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      if (isDark) {
        bgGrad.addColorStop(0, '#090705');
        bgGrad.addColorStop(1, '#130D09');
      } else {
        bgGrad.addColorStop(0, '#E4D6C3');
        bgGrad.addColorStop(1, '#D2BEA4');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // 2. Soft atmospheric orbs baked into canvas bitmap
      ctx.globalCompositeOperation = isDark ? 'screen' : 'source-over';
      for (const orb of ORBS) {
        const cx = orb.baseX * WIDTH;
        const cy = orb.baseY * HEIGHT;
        const r = orb.radius * Math.max(WIDTH, HEIGHT) * 0.55;
        const stops = isDark ? orb.darkStops : orb.lightStops;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, stops[0]);
        grad.addColorStop(1, stops[1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Edge vignette baked directly into canvas (replaces CSS overlay gradient fades)
      ctx.globalCompositeOperation = 'source-over';
      const bottomFade = ctx.createLinearGradient(0, HEIGHT * 0.55, 0, HEIGHT);
      if (isDark) {
        bottomFade.addColorStop(0, 'rgba(18, 14, 10, 0)');
        bottomFade.addColorStop(1, 'rgba(18, 14, 10, 0.85)');
      } else {
        bottomFade.addColorStop(0, 'rgba(228, 214, 195, 0)');
        bottomFade.addColorStop(1, 'rgba(228, 214, 195, 0.75)');
      }
      ctx.fillStyle = bottomFade;
      ctx.fillRect(0, HEIGHT * 0.55, WIDTH, HEIGHT * 0.45);
    };

    drawStaticFrame();

    const themeObserver = new MutationObserver(() => {
      drawStaticFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full object-cover" />
    </div>
  );
};
