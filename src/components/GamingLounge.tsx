import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Gamepad2, Clock, Tv, Box } from 'lucide-react';
import {
  VIEWPORT_CONFIG,
  createStaggerContainer,
  createRevealItem,
} from '../lib/revealVariants';
import { useCatalog } from '../context/CatalogContext';
import { formatOperatingHours } from '../data/catalogData';

const ThreeLoungeScene = lazy(() =>
  import('./ThreeLoungeScene').then((m) => ({ default: m.ThreeLoungeScene }))
);

interface GamingLoungeProps {
  onOpenBooking: (type: 'ps5' | 'pool') => void;
  highlightedStation?: { station: 'pool' | 'ps5'; nonce: number } | null;
}

interface StationStatus {
  total: number;
  occupied: number;
  available: number;
  status: string;
}

interface GamingStatusResponse {
  isOpenHours: boolean;
  operatingHours: string;
  pool: StationStatus;
  ps5: StationStatus;
  updatedAt: string;
}

export const GamingLounge: React.FC<GamingLoungeProps> = ({
  onOpenBooking,
  highlightedStation,
}) => {
  const { gamingRates, venueSettings } = useCatalog();
  const prefersReduced = useReducedMotion() ?? false;
  const [isInitialLoading] = useState(false);
  const [poolImgLoaded, setPoolImgLoaded] = useState(false);
  const [ps5ImgLoaded, setPs5ImgLoaded] = useState(false);
  const [show3DLounge, setShow3DLounge] = useState(false);
  const [activeStationHighlight, setActiveStationHighlight] = useState<'pool' | 'ps5' | null>(null);
  const [gamingStatus, setGamingStatus] = useState<GamingStatusResponse>(() => ({
    isOpenHours: true,
    operatingHours: formatOperatingHours(venueSettings),
    pool: { total: 2, occupied: 0, available: 2, status: 'Available Now' },
    ps5: { total: 3, occupied: 0, available: 3, status: 'Available Now' },
    updatedAt: '',
  }));

  const poolImgRef = useRef<HTMLImageElement | null>(null);
  const ps5ImgRef = useRef<HTMLImageElement | null>(null);

  const headerContainer = createStaggerContainer(0.09, 0.02, prefersReduced);
  const headerItem = createRevealItem({ y: 20, duration: 0.55, reduced: prefersReduced });
  const cardsContainer = createStaggerContainer(0.14, 0.06, prefersReduced);
  const cardItem = createRevealItem({ y: 30, scale: 0.97, duration: 0.6, reduced: prefersReduced });
  const specsContainer = createStaggerContainer(0.06, 0.14, prefersReduced);
  const specItem = createRevealItem({ y: 10, duration: 0.4, reduced: prefersReduced });

  useEffect(() => {
    if (poolImgRef.current?.complete) setPoolImgLoaded(true);
    if (ps5ImgRef.current?.complete) setPs5ImgLoaded(true);
  }, []);

  useEffect(() => {
    if (!highlightedStation) return;
    setActiveStationHighlight(highlightedStation.station);
    const timer = window.setTimeout(() => {
      setActiveStationHighlight((prev) => (prev === highlightedStation.station ? null : prev));
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [highlightedStation]);

  // Real-time station availability polling from /api/gaming-status
  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/gaming-status');
        if (!res.ok) return;
        const data = (await res.json()) as GamingStatusResponse;
        if (active && data.pool && data.ps5) {
          setGamingStatus(data);
        }
      } catch {
        // Keep last known availability snapshot
      }
    };
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section
      id="gaming"
      className="py-16 sm:py-20 bg-[#D9C7B0] dark:bg-[#19130D] relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header: Staggered Eyebrow, Headline & Live Lounge Status Strip */}
        <motion.div
          data-ink-reveal="true"
          variants={headerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 sm:mb-12"
        >
          <div className="max-w-3xl space-y-2">
            <motion.h2
              data-ink-reveal="true"
              variants={headerItem}
              className="font-luxury text-3xl min-[380px]:text-4xl sm:text-5xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] text-balance"
            >
              8-Ball Pool &amp; PlayStation 5 Arena
            </motion.h2>
          </div>

          {/* Small, Elegant Live Station Availability Bar */}
          <motion.div
            data-ink-reveal="true"
            variants={headerItem}
            aria-live="polite"
            className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-xl bg-[rgba(239,229,214,0.92)] dark:bg-[rgba(31,23,16,0.92)] border border-[#C2AD93] dark:border-[#3D2F20] text-xs font-medium text-[#14100B] dark:text-[#F0E6D8] shadow-sm shrink-0"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-[#5C4008] dark:text-[#D8B467]">
              <span
                className={`inline-flex rounded-full h-2 w-2 ${
                  gamingStatus.pool.available > 0 || gamingStatus.ps5.available > 0
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>Live Floor Status</span>
            </span>
            <span aria-hidden="true" className="text-[#C2AD93] dark:text-[#3D2F20]">·</span>
            <span className="tabular-nums">
              Pool:{' '}
              <strong className={gamingStatus.pool.available > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                {gamingStatus.pool.available}/{gamingStatus.pool.total} Open
              </strong>
            </span>
            <span aria-hidden="true" className="text-[#C2AD93] dark:text-[#3D2F20]">·</span>
            <span className="tabular-nums">
              PS5:{' '}
              <strong className={gamingStatus.ps5.available > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                {gamingStatus.ps5.available}/{gamingStatus.ps5.total} Open
              </strong>
            </span>
          </motion.div>
        </motion.div>

        {/* Skeleton Loading State */}
        {isInitialLoading ? (
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch"
            aria-busy="true"
            aria-label="Loading gaming lounge stations"
          >
            {[0, 1].map((cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-2xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[16/10] w-full skeleton-shimmer" />
                  <div className="p-5 sm:p-7 space-y-4">
                    <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-[#C2AD93] dark:border-[#3D2F20]">
                      <div className="space-y-2 flex-1">
                        <div className="h-3 w-36 rounded skeleton-shimmer" />
                        <div className="h-7 w-56 rounded-lg skeleton-shimmer" />
                      </div>
                      <div className="h-5 w-24 rounded skeleton-shimmer shrink-0" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3.5 w-full rounded skeleton-shimmer" />
                      <div className="h-3.5 w-4/5 rounded skeleton-shimmer" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                      <div className="h-3.5 w-40 rounded skeleton-shimmer" />
                      <div className="h-3.5 w-36 rounded skeleton-shimmer" />
                      <div className="h-3.5 w-44 rounded skeleton-shimmer" />
                      <div className="h-3.5 w-32 rounded skeleton-shimmer" />
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-7 pt-0">
                  <div className="w-full h-[46px] rounded-xl skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Staggered 2-Card Showcase Grid */
          <motion.div
            data-ink-reveal="true"
            variants={cardsContainer}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_CONFIG}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch"
          >
            {/* Card 1: 8-Ball Pool Lounge */}
            <motion.article
              id="gaming-pool"
              data-ink-reveal="true"
              variants={cardItem}
              whileHover={prefersReduced ? undefined : { y: -6 }}
              className={`group rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border hover:border-[rgba(141,102,19,0.8)] dark:hover:border-[rgba(216,180,103,0.7)] overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-2xl will-change-transform ${
                activeStationHighlight === 'pool'
                  ? 'border-[#8D6613] dark:border-[#D8B467] ring-2 ring-[rgba(141,102,19,0.7)] dark:ring-[rgba(216,180,103,0.7)]'
                  : 'border-[#C2AD93] dark:border-[#3D2F20]'
              }`}
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#D3C1AA] dark:bg-[#241C13]">
                  {!poolImgLoaded && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 skeleton-shimmer"
                    />
                  )}
                  <picture className="contents">
                    <source
                      type="image/webp"
                      srcSet="/assets/webp/lounge-pool-480.webp 480w, /assets/webp/lounge-pool-960.webp 960w"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    <img
                      ref={poolImgRef}
                      src="/assets/aistudio/7264835fe6313315b41970eb9302d9bc_29a73b0e.jpg"
                      alt="8-Ball Pool Lounge at Hot and Spicy"
                      decoding="async"
                      onLoad={() => setPoolImgLoaded(true)}
                      onError={() => setPoolImgLoaded(true)}
                      className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] ${
                        poolImgLoaded ? 'opacity-100' : 'opacity-0'
                      }`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </picture>
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[rgba(20,16,11,0.86)] border border-[rgba(255,255,255,0.16)] text-[11px] font-semibold text-[#F0E6D8] inline-flex items-center gap-1.5 tabular-nums shadow-md">
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full ${
                        gamingStatus.pool.available > 0 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>
                      {gamingStatus.pool.available}/{gamingStatus.pool.total} Tables · {gamingStatus.pool.status}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-7 space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#C2AD93] dark:border-[#3D2F20]">
                    <h3 className="font-luxury text-2xl sm:text-3xl font-bold text-[#14100B] dark:text-[#F0E6D8] group-hover:text-[#8D6613] dark:group-hover:text-[#D8B467]">
                      8-Ball Championship Pool
                    </h3>
                    <div className="font-condensed text-base sm:text-lg font-bold text-[#5C4008] dark:text-[#D8B467] tabular-nums">
                      ₹{gamingRates.pool15Price} / 15m · ₹{gamingRates.pool30Price} / 30m
                    </div>
                  </div>

                  <motion.div
                    data-ink-reveal="true"
                    variants={specsContainer}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium text-[#14100B] dark:text-[#F0E6D8] pt-1"
                  >
                    <motion.div data-ink-reveal="true" variants={specItem}>· Valley English Tournament Slate</motion.div>
                    <motion.div data-ink-reveal="true" variants={specItem}>· Precision Ash Cue Sticks</motion.div>
                    <motion.div data-ink-reveal="true" variants={specItem}>· Low-Glare Overhead Lighting</motion.div>
                    <motion.div data-ink-reveal="true" variants={specItem}>· Table-Side Cafe Orders</motion.div>
                  </motion.div>
                </div>
              </div>

              <div className="p-5 sm:p-7 pt-0">
                <motion.button
                  whileHover={{ y: -1.5, scale: 1.015 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onOpenBooking('pool')}
                  className="w-full min-h-[46px] px-4 rounded-xl border border-[#14100B] dark:border-[#8D6613] bg-[#14100B] hover:bg-[#8D6613] hover:border-[#8D6613] text-[#E4D6C3] dark:text-[#FAF2E6] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  <span>Book 8-Ball Pool Slot</span>
                </motion.button>
              </div>
            </motion.article>

            {/* Card 2: PlayStation 5 Arena */}
            <motion.article
              id="gaming-ps5"
              data-ink-reveal="true"
              variants={cardItem}
              whileHover={prefersReduced ? undefined : { y: -6 }}
              className={`group rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border hover:border-[rgba(141,102,19,0.8)] dark:hover:border-[rgba(216,180,103,0.7)] overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-2xl will-change-transform ${
                activeStationHighlight === 'ps5'
                  ? 'border-[#8D6613] dark:border-[#D8B467] ring-2 ring-[rgba(141,102,19,0.7)] dark:ring-[rgba(216,180,103,0.7)]'
                  : 'border-[#C2AD93] dark:border-[#3D2F20]'
              }`}
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#D3C1AA] dark:bg-[#241C13]">
                  {!ps5ImgLoaded && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 skeleton-shimmer"
                    />
                  )}
                  <picture className="contents">
                    <source
                      type="image/webp"
                      srcSet="/assets/webp/lounge-ps5-480.webp 480w, /assets/webp/lounge-ps5-960.webp 960w"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    <img
                      ref={ps5ImgRef}
                      src="/assets/aistudio/aa9abbaa0f039c2e9f2d9728f0eb0ba1_83db1f3b.jpg"
                      alt="PlayStation 5 Arena at Hot and Spicy"
                      decoding="async"
                      onLoad={() => setPs5ImgLoaded(true)}
                      onError={() => setPs5ImgLoaded(true)}
                      className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] ${
                        ps5ImgLoaded ? 'opacity-100' : 'opacity-0'
                      }`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </picture>
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[rgba(20,16,11,0.86)] border border-[rgba(255,255,255,0.16)] text-[11px] font-semibold text-[#F0E6D8] inline-flex items-center gap-1.5 tabular-nums shadow-md">
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full ${
                        gamingStatus.ps5.available > 0 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>
                      {gamingStatus.ps5.available}/{gamingStatus.ps5.total} Consoles · {gamingStatus.ps5.status}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-7 space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#C2AD93] dark:border-[#3D2F20]">
                    <h3 className="font-luxury text-2xl sm:text-3xl font-bold text-[#14100B] dark:text-[#F0E6D8] group-hover:text-[#8D6613] dark:group-hover:text-[#D8B467]">
                      PlayStation 5 Arena
                    </h3>
                    <div className="font-condensed text-base sm:text-lg font-bold text-[#5C4008] dark:text-[#D8B467] tabular-nums">
                      ₹{gamingRates.ps5HourlyPrice} / hr
                    </div>
                  </div>

                  <div className="text-xs text-[#14100B] dark:text-[#F0E6D8] space-y-1">
                    <div className="text-[11px] uppercase tracking-wider text-[#5C4008] dark:text-[#D8B467] font-bold">
                      Installed Titles
                    </div>
                    <p className="text-[#3B3126] dark:text-[#D4C5B3]">
                      EA Sports FC 25 · Tekken 8 · GTA V · Spider-Man 2 · Mortal Kombat 1
                    </p>
                  </div>

                  <motion.div
                    data-ink-reveal="true"
                    variants={specsContainer}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium text-[#14100B] dark:text-[#F0E6D8] pt-1"
                  >
                    <motion.div data-ink-reveal="true" variants={specItem} className="flex items-center gap-2">
                      <Tv className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467] shrink-0" />
                      <span>4K 120Hz Displays</span>
                    </motion.div>
                    <motion.div data-ink-reveal="true" variants={specItem} className="flex items-center gap-2">
                      <Gamepad2 className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467] shrink-0" />
                      <span>Dual Wireless Controllers</span>
                    </motion.div>
                  </motion.div>
                </div>
              </div>

              <div className="p-5 sm:p-7 pt-0">
                <motion.button
                  type="button"
                  whileHover={{ y: -1.5, scale: 1.015 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onOpenBooking('ps5')}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>Reserve PS5 Console Slot</span>
                </motion.button>
              </div>
            </motion.article>
          </motion.div>
        )}

        {/* Interactive 3D 8-Ball Lounge Preview */}
        <div className="mt-8 rounded-2xl bg-[rgba(239,229,214,0.92)] dark:bg-[rgba(31,23,16,0.92)] border border-[#C2AD93] dark:border-[#3D2F20] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-luxury text-lg sm:text-xl font-bold text-[#14100B] dark:text-[#F0E6D8]">
              3D Championship Pool Table
            </h3>
            <button
              type="button"
              onClick={() => setShow3DLounge((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] w-full sm:w-auto rounded-xl bg-[#14100B] dark:bg-[#8D6613] hover:bg-[#8D6613] dark:hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Box className="w-4 h-4" />
              <span>{show3DLounge ? 'Hide 3D Preview' : 'Launch 3D Preview'}</span>
            </button>
          </div>

          {show3DLounge && (
            <Suspense
              fallback={
                <div className="h-[340px] rounded-2xl bg-[#120D08] border border-[#3D2F20] flex items-center justify-center text-xs text-[#D4C5B3]">
                  Loading 3D Billiards Lounge...
                </div>
              }
            >
              <ThreeLoungeScene onBookPool={() => onOpenBooking('pool')} />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  );
};
