import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, Calendar, ArrowRight, ChevronDown } from 'lucide-react';
import { getTransformedImageUrl } from '../lib/imageTransform';
import { getSmoothstepScrimPng } from '../ink/snapshotAssets';
import { OptimizedImage } from './OptimizedImage';
import { LUXURY_EASE } from '../lib/revealVariants';

const heroStoreImg = getTransformedImageUrl('store', 'full');

interface VideoHeroProps {
  onExploreMenu: () => void;
  onOpenBooking: (type?: 'dining' | 'ps5' | 'pool') => void;
  onScrollToShowcase: () => void;
  isReady: boolean;
}

const HERO_VIDEO_SRC =
  '/assets/aistudio/959372878_1794748712599853_fb2c151f.mp4';

export const VideoHero: React.FC<VideoHeroProps> = ({
  onExploreMenu,
  onOpenBooking,
  onScrollToShowcase,
  isReady,
}) => {
  const heroWrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inViewportRef = useRef(true);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const scrimPng = useMemo(
    () => getSmoothstepScrimPng('to-top', 20, 16, 11, 0.9, 0.24, 96),
    []
  );

  useEffect(() => {
    const heroEl = heroWrapRef.current;
    if (!heroEl || typeof IntersectionObserver === 'undefined') return;

    let debounceTimer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          const visible = entries.some((entry) => entry.isIntersecting);
          inViewportRef.current = visible;
          const video = videoRef.current;
          if (!video) return;
          if (!visible) {
            if (!video.paused) video.pause();
          } else if (isReady && !prefersReducedMotion && !videoFailed && !document.hidden) {
            const p = video.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        }, 60);
      },
      { threshold: 0.05 }
    );
    observer.observe(heroEl);

    return () => {
      window.clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [isReady, prefersReducedMotion, videoFailed]);

  useEffect(() => {
    if (!isReady || prefersReducedMotion || videoFailed) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const tryPlay = () => {
      if (!inViewportRef.current || document.hidden) return;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Keep muted poster visible if browser energy saver defers autoplay
        });
      }
    };

    tryPlay();

    const onVisibility = () => {
      if (document.hidden) {
        if (!video.paused) video.pause();
      } else if (inViewportRef.current && video.paused && !videoFailed) {
        tryPlay();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isReady, prefersReducedMotion, videoFailed]);

  return (
    <div ref={heroWrapRef} id="home" className="relative z-10 h-[100svh] bg-[#14100B]">
      <section
        aria-label="Hot & Spicy architectural reveal hero"
        className="relative h-full w-full overflow-hidden bg-[#14100B]"
      >
        {/* Instant base storefront poster underneath */}
        <OptimizedImage
          imageKey="store"
          preset="full"
          sizes="100vw"
          alt="Hot & Spicy Restaurant & Café exterior at Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Continuous muted looping hero background video */}
        {!prefersReducedMotion && !videoFailed && (
          <video
            ref={videoRef}
            src={HERO_VIDEO_SRC}
            poster={heroStoreImg}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            onPlay={(e) => {
              if (!inViewportRef.current || document.hidden) {
                e.currentTarget.pause();
              }
            }}
            onError={() => setVideoFailed(true)}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out will-change-[opacity] ${
              videoReady ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Snapshot-identical smoothstep PNG scrim */}
        {scrimPng && (
          <img
            src={scrimPng}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none select-none absolute inset-0 w-full h-full object-fill"
          />
        )}

        {/* Hero Foreground Content */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: LUXURY_EASE }}
          className="relative z-20 h-full w-full max-w-6xl mx-auto px-4 sm:px-8 pt-20 pb-20 sm:pb-24 flex flex-col justify-end items-center text-center will-change-[transform,opacity]"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.18em] font-semibold text-[#D8B467] mb-2.5">
            <span>Boropara More, Dingalhat</span>
            <span aria-hidden="true" className="text-[rgba(250,242,230,0.4)]">·</span>
            <span>Near Azdan Moto Hub, Bansberia</span>
          </div>

          <h1 className="font-luxury text-3xl min-[380px]:text-4xl sm:text-6xl lg:text-[4.85rem] font-extrabold tracking-tight text-[#FAF2E6] leading-[1.06] text-balance max-w-4xl">
            Hot &amp; Spicy, Built Fresh Daily.
          </h1>

          <p className="mt-3 text-xs sm:text-base text-[#E4D6C3] max-w-lg leading-relaxed">
            Tandoor, artisan café, 8-ball pool &amp; 4K PS5 lounge.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <motion.button
              whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.02 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              type="button"
              onClick={onExploreMenu}
              className="group inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 min-h-[48px] rounded-full bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] border border-[rgba(216,180,103,0.5)] font-bold text-xs uppercase tracking-wider shadow-xl whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-6" />
              <span>Explore Menu</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </motion.button>

            <motion.button
              whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.02 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              type="button"
              onClick={() => onOpenBooking('ps5')}
              className="group inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[48px] rounded-full border border-[rgba(250,242,230,0.35)] bg-[rgba(20,16,11,0.78)] hover:bg-[rgba(20,16,11,0.92)] hover:border-[#D8B467] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider shadow-lg whitespace-nowrap cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-[#D8B467]" />
              <span>Book Gaming Slot</span>
            </motion.button>
          </div>

          <div className="mt-6 sm:mt-8 flex items-center justify-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D4C5B3]">
            <button
              type="button"
              onClick={onScrollToShowcase}
              className="min-h-[44px] px-3 inline-flex items-center gap-1.5 hover:text-[#D8B467] cursor-pointer transition-transform duration-200 active:translate-y-0.5"
            >
              <span>Scroll</span>
              <ChevronDown className="w-4 h-4 text-[#D8B467]" />
            </button>
          </div>
        </motion.div>
      </section>
    </div>
  );
};
