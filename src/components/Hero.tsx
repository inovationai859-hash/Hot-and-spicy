import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Gamepad2, ArrowRight } from 'lucide-react';
import { HeroAnimatedBackground } from './HeroAnimatedBackground';
import { OptimizedImage } from './OptimizedImage';
import type { VenueImageKey } from '../lib/imageTransform';
import heroDiningImg from '../assets/images/hero_dining_chandeliers_1795164584252.jpg';
import heroHakkaImg from '../assets/images/hero_hakka_platter_1795164583965.jpg';
import heroPoolBreakImg from '../assets/images/hero_pool_break_1795164584164.jpg';
import heroCornPizzaImg from '../assets/images/hero_corn_pizza_1795164584344.jpg';
import heroAngelWingsImg from '../assets/images/hero_angel_wings_clean_1795164643939.jpg';

export type ShowcaseTarget =
  | { kind: 'menu'; pageIndex: number; itemId?: string }
  | { kind: 'gaming'; station: 'pool' | 'ps5' };

interface ShowcaseCardItem {
  id: string;
  imageKey?: VenueImageKey;
  photoSrc?: string;
  alt: string;
  target: ShowcaseTarget;
}

interface HeroProps {
  onOpenBooking: (type?: 'dining' | 'ps5' | 'pool') => void;
  onExploreMenu: () => void;
  onSelectShowcase: (target: ShowcaseTarget) => void;
}

const SHOWCASE_CARDS: ShowcaseCardItem[] = [
  {
    id: 'c1',
    photoSrc: heroDiningImg,
    alt: 'Hot & Spicy Warm Cube-Chandelier Dining Room',
    target: { kind: 'menu', pageIndex: 0 },
  },
  {
    id: 'c2',
    photoSrc: heroPoolBreakImg,
    alt: '8-Ball Championship Pool Break Shot',
    target: { kind: 'gaming', station: 'pool' },
  },
  {
    id: 'c3',
    photoSrc: heroHakkaImg,
    alt: 'Hakka Chowmein & Warm Soup Platter',
    target: { kind: 'menu', pageIndex: 5, itemId: 'bm-17' },
  },
  {
    id: 'c4',
    photoSrc: heroCornPizzaImg,
    alt: 'Stone-Baked Corn & Mozzarella Cheese Pizza',
    target: { kind: 'menu', pageIndex: 3, itemId: 'bm-9' },
  },
  {
    id: 'c5',
    photoSrc: heroAngelWingsImg,
    alt: 'Angel Wings Neon Café Lounge Corner',
    target: { kind: 'menu', pageIndex: 6, itemId: 'bm-21' },
  },
  {
    id: 'c6',
    photoSrc: '/assets/aistudio/IMG_20261112_224707_ece4b2d9.png',
    alt: 'Hot & Spicy Restaurant & Café Storefront',
    target: { kind: 'menu', pageIndex: 0 },
  },
  {
    id: 'c7',
    imageKey: 'tandoor',
    alt: 'Charcoal Tandoor Delight Combo',
    target: { kind: 'menu', pageIndex: 2, itemId: 'bm-5' },
  },
  {
    id: 'c8',
    photoSrc: '/assets/aistudio/aa9abbaa0f039c2e9f2d9728f0eb0ba1_83db1f3b.jpg',
    alt: 'PlayStation 5 4K Gaming Arena',
    target: { kind: 'gaming', station: 'ps5' },
  },
  {
    id: 'c9',
    imageKey: 'momos',
    alt: 'Spicy Momo Fiesta & Chilli Dip',
    target: { kind: 'menu', pageIndex: 1, itemId: 'bm-1' },
  },
  {
    id: 'c10',
    imageKey: 'burger',
    alt: 'Gourmet Loaded Burger Combo',
    target: { kind: 'menu', pageIndex: 4, itemId: 'bm-13' },
  },
];

const AUTO_SCROLL_SPEED_PX_PER_SEC = 32;

export const Hero: React.FC<HeroProps> = ({
  onOpenBooking,
  onExploreMenu,
  onSelectShowcase,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollOffsetRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const pointerHoveringRef = useRef<boolean>(false);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    lastX: number;
    movedPx: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, lastX: 0, movedPx: 0, pointerId: null });
  const suppressNextClickRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);

  // Continuous smooth infinite loop + swipe inertia, pausing off-screen / hidden / reduced motion
  useEffect(() => {
    const stage = stageRef.current;
    let cachedStageWidth = stage?.clientWidth || 1280;
    let rafId = 0;
    let lastTime = performance.now();
    let isInView = true;
    let isDocHidden = typeof document !== 'undefined' ? document.hidden : false;
    const motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReduced = Boolean(motionQuery?.matches);

    const positionCards = () => {
      const stageWidth = cachedStageWidth || 1280;
      const isMobile = stageWidth < 640;
      const cardSpacing = isMobile ? 214 : stageWidth < 1024 ? 278 : 328;
      const totalTrack = SHOWCASE_CARDS.length * cardSpacing;
      const offset = scrollOffsetRef.current;
      const halfSpan = stageWidth * 0.54;

      for (let idx = 0; idx < SHOWCASE_CARDS.length; idx++) {
        const el = cardRefs.current[idx];
        if (!el) continue;

        let dx = ((idx * cardSpacing - offset) % totalTrack + totalTrack) % totalTrack;
        if (dx > totalTrack / 2) dx -= totalTrack;

        const norm = Math.max(-1.45, Math.min(1.45, dx / halfSpan));
        const absN = Math.min(1.25, Math.abs(norm));

        const scale = 0.88 + absN * 0.14;
        const translateY = -absN * 10;
        const zIndex = Math.round(20 + absN * 12);
        const opacity = absN > 0.92 ? Math.max(0, 1 - (absN - 0.92) * 2.4) : 1;

        el.style.transform = `translate3d(${dx}px, ${translateY}px, 0) scale(${scale})`;
        el.style.zIndex = String(zIndex);
        el.style.opacity = String(opacity);
      }
    };

    const shouldRun = () =>
      dragStateRef.current.active ||
      Math.abs(velocityRef.current) > 0.5 ||
      (isInView && !isDocHidden && !prefersReduced);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (!dragStateRef.current.active) {
        if (Math.abs(velocityRef.current) > 0.5) {
          scrollOffsetRef.current += velocityRef.current * dt;
          velocityRef.current *= Math.pow(0.08, dt);
          if (Math.abs(velocityRef.current) < 0.5) {
            velocityRef.current = 0;
          }
        } else if (isInView && !isDocHidden && !prefersReduced && !pointerHoveringRef.current) {
          scrollOffsetRef.current += AUTO_SCROLL_SPEED_PX_PER_SEC * dt;
        }
      }

      positionCards();

      if (shouldRun()) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const ensureLoop = () => {
      if (rafId === 0 && shouldRun()) {
        lastTime = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const pauseLoop = () => {
      if (rafId !== 0 && !dragStateRef.current.active && Math.abs(velocityRef.current) <= 0.5) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    (stage as unknown as { __ensureLoop?: () => void }).__ensureLoop = ensureLoop;

    const resizeObs =
      stage && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width;
            if (w && w > 0) {
              cachedStageWidth = w;
              positionCards();
            }
          })
        : null;
    if (stage && resizeObs) resizeObs.observe(stage);

    const intObs =
      stage && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isInView = entries.some((entry) => entry.isIntersecting);
              if (isInView) {
                ensureLoop();
              } else {
                pauseLoop();
              }
            },
            { threshold: 0.02 }
          )
        : null;
    if (stage && intObs) intObs.observe(stage);

    const onVisibilityChange = () => {
      isDocHidden = document.hidden;
      if (isDocHidden) {
        pauseLoop();
      } else {
        ensureLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onMotionChange = (ev: MediaQueryListEvent) => {
      prefersReduced = ev.matches;
      if (prefersReduced) {
        pauseLoop();
      } else {
        ensureLoop();
      }
    };
    motionQuery?.addEventListener?.('change', onMotionChange);

    positionCards();
    ensureLoop();

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      resizeObs?.disconnect();
      intObs?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
  }, []);

  const kickLoop = () => {
    const fn = (stageRef.current as unknown as { __ensureLoop?: () => void } | null)?.__ensureLoop;
    fn?.();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      lastX: e.clientX,
      movedPx: 0,
      pointerId: e.pointerId,
    };
    suppressNextClickRef.current = false;
    setIsDragging(true);
    velocityRef.current = 0;
    kickLoop();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.lastX;
    dragStateRef.current.lastX = e.clientX;
    dragStateRef.current.movedPx += Math.abs(dx);

    if (dragStateRef.current.movedPx > 12) {
      suppressNextClickRef.current = true;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
    }

    scrollOffsetRef.current -= dx * 1.15;
    velocityRef.current = -dx * 14;
    kickLoop();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dragged = dragStateRef.current.movedPx > 12;
    dragStateRef.current.active = false;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (dragged) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 60);
    }
    kickLoop();
  };

  const handleCardClick = (card: ShowcaseCardItem) => {
    if (suppressNextClickRef.current) return;
    onSelectShowcase(card.target);
  };

  return (
    <div
      id="showcase"
      className="relative z-[15] -mt-14 sm:-mt-20 rounded-t-[2rem] sm:rounded-t-[3rem] border-t border-[rgba(194,173,147,0.85)] dark:border-[#3D2F20] bg-[#E4D6C3] dark:bg-[#120E0A] shadow-[0_-24px_60px_-14px_rgba(20,16,11,0.34)] scroll-mt-16"
    >
      <section className="relative min-h-[100svh] flex flex-col justify-center pt-16 pb-24 sm:pt-20 sm:pb-28 lg:pt-24 lg:pb-32 rounded-t-[2rem] sm:rounded-t-[3rem] overflow-hidden bg-[#E4D6C3] dark:bg-[#120E0A]">
        <HeroAnimatedBackground />

        <div
          aria-hidden="true"
          className="relative z-10 w-14 h-1 rounded-full bg-[rgba(141,102,19,0.4)] dark:bg-[rgba(216,180,103,0.4)] mx-auto mb-6 sm:mb-8"
        />

        <div className="relative z-10 w-full">
          {/* Concise Centered Editorial Header */}
          <motion.div
            data-ink-reveal="true"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-4 sm:space-y-5"
          >
            <h2 className="font-luxury text-3xl min-[380px]:text-4xl sm:text-6xl lg:text-[4.65rem] font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] leading-[1.04] text-balance">
              Crafted Plates &amp; Focused Play.
            </h2>

            <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
              <motion.button
                type="button"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onExploreMenu}
                className="group inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 min-h-[46px] rounded-full bg-[#14100B] dark:bg-[#8D6613] hover:bg-[#8D6613] dark:hover:bg-[#73520D] text-[#FAF2E6] border border-[rgba(141,102,19,0.5)] font-bold text-xs uppercase tracking-wider shadow-lg whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-6" />
                <span>Explore Menu</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenBooking('ps5')}
                className="group inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[46px] rounded-full border border-[rgba(20,16,11,0.25)] dark:border-[rgba(216,180,103,0.35)] bg-[#EFE5D6] dark:bg-[#1F1710] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-[#14100B] dark:text-[#F0E6D8] font-bold text-xs uppercase tracking-wider shadow-sm whitespace-nowrap cursor-pointer"
              >
                <Gamepad2 className="w-4 h-4 text-[#8D6613] dark:text-[#D8B467] transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
                <span>Book Slot</span>
              </motion.button>
            </div>
          </motion.div>

          {/* 2D Curved Drag Showcase Stage (No 3D perspective/rotateY, no mask-image, no idle drift) */}
          <div className="relative mt-8 sm:mt-11 w-full max-w-[1680px] mx-auto px-2 sm:px-6 lg:px-10">
            <div
              ref={stageRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative w-full h-[310px] sm:h-[390px] md:h-[445px] lg:h-[490px] overflow-hidden select-none touch-pan-y ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              {/* Crisp Vertical Bronze Hairline */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-4 bottom-4 -translate-x-1/2 w-[2px] bg-[rgba(216,180,103,0.65)] z-30"
              />

              {/* Clickable Product Cards (2D geometry matches html2canvas 100%) */}
              <div className="relative w-full h-full flex items-center justify-center">
                {SHOWCASE_CARDS.map((card, idx) => (
                  <button
                    key={card.id}
                    type="button"
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    onClick={() => handleCardClick(card)}
                    aria-label={`View ${card.alt}`}
                    title={card.alt}
                    className="group absolute w-[192px] h-[268px] sm:w-[244px] sm:h-[338px] md:w-[280px] md:h-[385px] lg:w-[310px] lg:h-[425px] rounded-2xl overflow-hidden border border-[rgba(194,173,147,0.75)] dark:border-[rgba(216,180,103,0.25)] hover:border-[#8D6613] dark:hover:border-[#D8B467] bg-[#14100B] shadow-2xl will-change-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B467] p-0"
                  >
                    {card.photoSrc ? (
                      <img
                        src={card.photoSrc}
                        alt={card.alt}
                        draggable={false}
                        decoding="async"
                        loading={idx < 3 ? 'eager' : 'lazy'}
                        fetchPriority={idx < 3 ? 'high' : 'low'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
                      />
                    ) : (
                      <OptimizedImage
                        imageKey={card.imageKey || 'tandoor'}
                        preset="card"
                        sizes="(max-width: 640px) 192px, (max-width: 1024px) 280px, 310px"
                        alt={card.alt}
                        draggable={false}
                        decoding="async"
                        loading={idx < 3 ? 'eager' : 'lazy'}
                        fetchPriority={idx < 3 ? 'high' : 'low'}
                        className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
