import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  animate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';

interface PageLoaderProps {
  onComplete: () => void;
}

export const PageLoader: React.FC<PageLoaderProps> = ({ onComplete }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const [trackWidth, setTrackWidth] = useState(320);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [dotCount, setDotCount] = useState(2);
  const [isWalking, setIsWalking] = useState(true);

  const progressMV = useMotionValue(0);

  // Measure inner progress track so the mascot translates purely on the GPU compositor
  useEffect(() => {
    let resizeTimer = 0;
    const updateWidth = () => {
      if (trackRef.current) {
        setTrackWidth(trackRef.current.clientWidth);
      }
    };
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(updateWidth, 120);
    };
    updateWidth();
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const fillX = useTransform(progressMV, (v) => `${v - 100}%`);
  const mascotX = useTransform(
    progressMV,
    [0, 100],
    [10, Math.max(24, trackWidth - 10)]
  );

  useMotionValueEvent(progressMV, 'change', (latest) => {
    const rounded = Math.min(100, Math.max(0, Math.round(latest)));
    setDisplayPercent((prev) => (prev !== rounded ? rounded : prev));
    if (rounded >= 99) {
      setIsWalking(false);
    }
  });

  // Subtle Loading. / Loading.. / Loading... dot rhythm
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 380);
    return () => window.clearInterval(timer);
  }, []);

  const finishLoading = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      progressMV.set(100);
      setDisplayPercent(100);
      setIsWalking(false);
      const t = window.setTimeout(() => {
        if (!cancelled) finishLoading();
      }, 240);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    const waitForDocumentReady = () =>
      new Promise<void>((resolve) => {
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
          resolve();
          return;
        }
        const onReady = () => {
          window.clearTimeout(fallbackTimer);
          resolve();
        };
        const fallbackTimer = window.setTimeout(() => {
          document.removeEventListener('DOMContentLoaded', onReady);
          resolve();
        }, 180);
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
      });

    const runSequence = async () => {
      const stage1 = animate(progressMV, 80, {
        duration: 0.32,
        ease: [0.22, 1, 0.36, 1],
      });

      await Promise.all([stage1.finished, waitForDocumentReady()]);
      if (cancelled) return;

      const stage2 = animate(progressMV, 100, {
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1],
      });
      await stage2.finished;
      if (cancelled) return;

      window.setTimeout(() => {
        if (!cancelled) finishLoading();
      }, 45);
    };

    runSequence();

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        progressMV.stop();
        animate(progressMV, 100, { duration: 0.15, ease: 'easeOut' }).finished.then(() => {
          if (!cancelled) finishLoading();
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
      progressMV.stop();
    };
  }, []);

  const statusPhrase =
    displayPercent < 35
      ? 'Warming the tandoor'
      : displayPercent < 75
      ? 'Brewing fresh spices'
      : displayPercent < 100
      ? 'Setting your table'
      : 'Welcome in';

  return (
    <motion.div
      key="hs-page-loader"
      data-ink-loader="true"
      role="status"
      aria-live="polite"
      aria-label={`Loading Hot & Spicy website, ${displayPercent}%`}
      initial={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#E4D6C3] dark:bg-[#120E0A] text-[#14100B] dark:text-[#F0E6D8] select-none px-6"
    >
      {/* Organic corner canvas accents inspired by artisanal menu silhouettes */}
      <svg
        aria-hidden="true"
        viewBox="0 0 360 360"
        className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 sm:w-80 sm:h-80 text-[rgba(141,102,19,0.22)] dark:text-[rgba(216,180,103,0.12)]"
      >
        <path
          fill="currentColor"
          d="M120,0 L360,0 L360,260 C305,250 245,225 220,175 C195,125 180,55 120,0 Z"
        />
      </svg>

      <svg
        aria-hidden="true"
        viewBox="0 0 360 360"
        className="pointer-events-none absolute -bottom-14 -left-14 w-60 h-60 sm:w-80 sm:h-80 text-[rgba(141,102,19,0.22)] dark:text-[rgba(216,180,103,0.12)]"
      >
        <path
          fill="currentColor"
          d="M0,95 C65,120 110,165 135,220 C162,278 205,320 265,360 L0,360 Z"
        />
      </svg>

      {/* Main Centered Loading Stage */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        {/* Brand Identity + Loading Headline */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="font-brand text-xs sm:text-sm font-bold tracking-[0.22em] uppercase text-[#8D6613] dark:text-[#D8B467] mb-1.5"
        >
          Hot &amp; Spicy
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="font-luxury text-3xl sm:text-4xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] mb-14 sm:mb-16"
        >
          Loading{'.'.repeat(dotCount)}
        </motion.h1>

        {/* Progress Bar + Walking Spiced Brew Mascot */}
        <div className="relative w-[276px] sm:w-[348px]">
          {/* Walking Cup perched on top edge of progress bar */}
          <motion.div
            aria-hidden="true"
            style={{ x: mascotX }}
            className="pointer-events-none absolute -top-[54px] sm:-top-[58px] -left-7 z-20 w-14 h-16 will-change-transform"
          >
            <motion.div
              animate={
                isWalking
                  ? {
                      y: [0, -3.5, 0, -2.5, 0],
                      rotate: [-3, 3.5, -3],
                    }
                  : { y: [0, -4, 0], rotate: 0 }
              }
              transition={
                isWalking
                  ? {
                      duration: 0.56,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
                  : { duration: 0.35, ease: 'easeOut' }
              }
              className="w-full h-full"
            >
              <svg
                viewBox="0 0 64 72"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
              >
                {/* Ground contact shadow on top of bar */}
                <ellipse
                  cx="32"
                  cy="67"
                  rx="13"
                  ry="2.5"
                  className="fill-[rgba(20,16,11,0.2)] dark:fill-[rgba(0,0,0,0.45)]"
                />

                {/* GPU-accelerated Left & Right Walking Legs (transform rotate instead of SVG path morph) */}
                <motion.g
                  animate={isWalking ? { rotate: [-14, 14, -14] } : { rotate: 0 }}
                  transition={{
                    duration: 0.44,
                    repeat: isWalking ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                  style={{ transformOrigin: '27px 52px' }}
                  className="will-change-transform"
                >
                  <path
                    d="M27 52 L24 62 L19 63"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[#2B2116] dark:stroke-[#E8D5B8]"
                  />
                </motion.g>
                <motion.g
                  animate={isWalking ? { rotate: [14, -14, 14] } : { rotate: 0 }}
                  transition={{
                    duration: 0.44,
                    repeat: isWalking ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                  style={{ transformOrigin: '37px 52px' }}
                  className="will-change-transform"
                >
                  <path
                    d="M37 52 L40 62 L45 63"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[#2B2116] dark:stroke-[#E8D5B8]"
                  />
                </motion.g>

                {/* Cup Glass Outer Shell */}
                <path
                  d="M17 20 L47 20 L43 51 C42.6 53.6 40.4 55 37.8 55 L26.2 55 C23.6 55 21.4 53.6 21 51 Z"
                  className="fill-[#FAF2E6] dark:fill-[#2B2117] stroke-[#2B2116] dark:stroke-[#D8B467]"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />

                {/* Spiced Masala Chai / Caramel Brew Liquid */}
                <path
                  d="M19.5 31 C24 29 29 33 34 31 C38.5 29.2 42 30.8 44.5 31.8 L42.4 50.2 C42.1 52 40.5 53 38.6 53 L25.4 53 C23.5 53 21.9 52 21.6 50.2 Z"
                  className="fill-[#A66712] dark:fill-[#B87D24]"
                />

                {/* Creamy Foam & Splash Arc spilling with momentum */}
                <motion.g
                  animate={
                    isWalking
                      ? { y: [0, -1.2, 0], rotate: [-2, 2, -2] }
                      : { y: 0, rotate: 0 }
                  }
                  transition={{
                    duration: 0.56,
                    repeat: isWalking ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                  style={{ transformOrigin: '32px 20px' }}
                >
                  <path
                    d="M16 21 C15 15 21 12 27 14 C31 10 39 11 42 15 C46 14 50 17 48 21 C45 24 39 22 34 24 C28 26 21 25 16 21 Z"
                    className="fill-[#FAF2E6] stroke-[#2B2116] dark:stroke-[#D8B467]"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  {/* Trailing Splash Droplets */}
                  <circle
                    cx="11"
                    cy="14"
                    r="2.1"
                    className="fill-[#FAF2E6] stroke-[#2B2116] dark:stroke-[#D8B467]"
                    strokeWidth="1.4"
                  />
                  <circle
                    cx="15"
                    cy="9"
                    r="1.4"
                    className="fill-[#D8B467]"
                  />
                </motion.g>

                {/* Cute Expressive Eyes & Smile */}
                <motion.g
                  animate={{ scaleY: [1, 1, 0.15, 1, 1] }}
                  transition={{
                    duration: 3.2,
                    repeat: Infinity,
                    times: [0, 0.45, 0.5, 0.55, 1],
                  }}
                  style={{ transformOrigin: '32px 38px' }}
                >
                  <circle cx="27.5" cy="38" r="1.8" className="fill-[#14100B]" />
                  <circle cx="36.5" cy="38" r="1.8" className="fill-[#14100B]" />
                </motion.g>
                <path
                  d="M29.8 42.2 Q32 44.4 34.2 42.2"
                  stroke="#14100B"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Tiny Warm Cheek Highlights */}
                <circle cx="24.2" cy="40.5" r="1.4" className="fill-[rgba(217,119,54,0.6)]" />
                <circle cx="39.8" cy="40.5" r="1.4" className="fill-[rgba(217,119,54,0.6)]" />
              </svg>
            </motion.div>
          </motion.div>

          {/* Horizontal Progress Bar Track */}
          <div
            ref={trackRef}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayPercent}
            className="relative w-full h-8 sm:h-9 rounded-xl border-2 border-[#3D2F20] dark:border-[rgba(216,180,103,0.8)] bg-[#EFE5D6] dark:bg-[#1F1710] p-1 shadow-[0_14px_30px_-14px_rgba(20,16,11,0.3)] dark:shadow-[0_14px_34px_-14px_rgba(0,0,0,0.75)] overflow-hidden"
          >
            <div className="relative w-full h-full rounded-[6px] overflow-hidden bg-[rgba(223,208,188,0.65)] dark:bg-[#140F0B]">
              <motion.div
                style={{ x: fillX }}
                className="absolute inset-0 rounded-[6px] bg-[#8D6613] dark:bg-[#D8B467] will-change-transform"
              />
            </div>
          </div>
        </div>

        {/* Clean Unboxed Status Metadata & Tabular Progress Readout */}
        <div className="mt-4 flex items-center gap-2 text-xs text-[#574939] dark:text-[#D4C5B3] font-medium">
          <span>{statusPhrase}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-clean tabular-nums font-semibold text-[#8D6613] dark:text-[#D8B467]">
            {displayPercent}%
          </span>
        </div>
      </div>
    </motion.div>
  );
};
