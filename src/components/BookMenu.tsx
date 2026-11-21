import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Flame,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  isSoundMuted,
  toggleSoundMuted,
  playPageTurn,
  warmUpAudio,
} from '../utils/sound';

import { useCatalog } from '../context/CatalogContext';
import { resolveCatalogImage } from '../lib/catalogImages';
import { OptimizedImage } from './OptimizedImage';
import type { CatalogImageKey, CatalogItem } from '../data/catalogData';
import type { DietaryPreference } from '../types';

interface BookMenuProps {
  onAddItem: (item: {
    id: string;
    name: string;
    price: number;
    category: string;
    isVeg: boolean;
    description: string;
  }) => void;
  jumpRequest?: { pageIndex: number; itemId?: string; nonce: number } | null;
  dietaryPreference?: DietaryPreference;
  onChangeDietaryPreference?: (pref: DietaryPreference) => void;
}

interface MenuBookItem {
  id: string;
  name: string;
  price: number;
  description: string;
  isVeg: boolean;
  isSpicy?: boolean;
  inStock: boolean;
  image: string;
  imageKey: CatalogImageKey;
  imageUrl?: string;
}

interface SingleMenuPage {
  id: number;
  chapter: string;
  title: string;
  subtitle: string;
  items: MenuBookItem[];
}

const pageTurnVariants = {
  enter: (dir: 1 | -1) => ({
    opacity: 0,
    x: dir * 42,
    scale: 0.985,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: (dir: 1 | -1) => ({
    opacity: 0,
    x: dir * -42,
    scale: 0.985,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  }),
};

const menuItemVariants = {
  initial: (custom: { idx: number; reduced: boolean }) =>
    custom.reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 },
  animate: (custom: { idx: number; reduced: boolean }) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: custom.reduced
      ? { duration: 0.14 }
      : {
          duration: 0.24,
          delay: Math.min(custom.idx, 6) * 0.04,
          ease: [0.22, 1, 0.36, 1] as const,
        },
  }),
  exit: (custom: { idx: number; reduced: boolean }) =>
    custom.reduced
      ? { opacity: 0, transition: { duration: 0.12 } }
      : {
          opacity: 0,
          y: -10,
          scale: 0.975,
          transition: {
            duration: 0.18,
            ease: [0.4, 0, 1, 1] as const,
          },
        },
};

export const BookMenu: React.FC<BookMenuProps> = ({
  onAddItem,
  jumpRequest,
  dietaryPreference = 'all',
  onChangeDietaryPreference,
}) => {
  const { chapters, venueSettings } = useCatalog();
  const ALL_MENU_PAGES: SingleMenuPage[] = chapters.map((ch) => ({
    id: ch.pageNumber,
    chapter: ch.chapter,
    title: ch.title,
    subtitle: ch.subtitle,
    items: ch.items.map((it: CatalogItem) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      description: it.description,
      isVeg: it.isVeg,
      isSpicy: it.isSpicy,
      inStock: it.inStock !== false,
      image: it.imageUrl || resolveCatalogImage(it.imageKey, 'thumb'),
      imageKey: it.imageKey,
      imageUrl: it.imageUrl,
    })),
  }));

  const MENU_PAGES: SingleMenuPage[] = ALL_MENU_PAGES.map((pg) => ({
    ...pg,
    items: pg.items.filter((item) => {
      if (dietaryPreference === 'veg') return item.isVeg;
      if (dietaryPreference === 'non-veg') return !item.isVeg;
      return true;
    }),
  }));

  const totalMatchingItems = MENU_PAGES.reduce((sum, pg) => sum + pg.items.length, 0);

  const prefersReduced = useReducedMotion() ?? false;
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<1 | -1>(1);
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [isInitialLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [failedCustomImages, setFailedCustomImages] = useState<Record<string, string>>({});

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!jumpRequest) return;
    const { pageIndex, itemId } = jumpRequest;
    if (itemId && dietaryPreference !== 'all') {
      const targetItem = ALL_MENU_PAGES.flatMap((pg) => pg.items).find((it) => it.id === itemId);
      if (
        targetItem &&
        ((dietaryPreference === 'veg' && !targetItem.isVeg) ||
          (dietaryPreference === 'non-veg' && targetItem.isVeg))
      ) {
        onChangeDietaryPreference?.('all');
      }
    }
    if (pageIndex >= 0 && pageIndex < MENU_PAGES.length + 2 && pageIndex !== currentPageIndex) {
      const dir: 1 | -1 = pageIndex > currentPageIndex ? 1 : -1;
      setFlipDirection(dir);
      playPageTurn(dir);
      setCurrentPageIndex(pageIndex);
    }
    if (itemId) {
      setHighlightedItemId(itemId);
      const clearTimer = window.setTimeout(() => {
        setHighlightedItemId((prev) => (prev === itemId ? null : prev));
      }, 2400);
      return () => window.clearTimeout(clearTimer);
    }
  }, [jumpRequest]);

  const markImageLoaded = (key: string) => {
    setLoadedImages((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const totalPages = MENU_PAGES.length + 2; // Cover + 6 Single Menu Pages + Back Cover

  const goToPage = (targetIndex: number) => {
    if (targetIndex === currentPageIndex || targetIndex < 0 || targetIndex >= totalPages) return;
    const dir: 1 | -1 = targetIndex > currentPageIndex ? 1 : -1;
    setFlipDirection(dir);
    playPageTurn(dir);
    setCurrentPageIndex(targetIndex);
  };

  const handleNext = () => {
    if (currentPageIndex < totalPages - 1) {
      goToPage(currentPageIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentPageIndex > 0) {
      goToPage(currentPageIndex - 1);
    }
  };

  const handleToggleSound = () => {
    const nextMuted = toggleSoundMuted();
    setMuted(nextMuted);
    if (!nextMuted) {
      playPageTurn(1);
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % totalPages;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + totalPages) % totalPages;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = totalPages - 1;
    }

    if (nextIdx !== null) {
      e.preventDefault();
      goToPage(nextIdx);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  const handleBookKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      handleNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToPage(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToPage(totalPages - 1);
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      handleToggleSound();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    warmUpAudio();
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  const handleAdd = (item: MenuBookItem, category: string) => {
    onAddItem({
      id: item.id,
      name: item.name,
      price: item.price,
      category,
      isVeg: item.isVeg,
      description: item.description,
    });
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 1300);
  };

  const renderDishRow = (item: MenuBookItem, chapter: string, idx: number) => {
    const isImgLoaded = !!loadedImages[item.id];
    const isHighlighted = highlightedItemId === item.id;
    const itemCustom = { idx, reduced: prefersReduced };
    return (
      <motion.div
        key={item.id}
        id={`menu-item-${item.id}`}
        custom={itemCustom}
        variants={menuItemVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={prefersReduced ? undefined : { x: 3 }}
        className={`w-full flex items-start gap-3.5 px-2.5 pt-2 pb-4 rounded-xl border-b border-[#C2AD93] dark:border-[#3D2F20] last:border-b-0 last:pb-2 hover:bg-[rgba(228,214,195,0.55)] dark:hover:bg-[rgba(42,32,22,0.75)] will-change-transform group ${
          isHighlighted
            ? 'ring-2 ring-[#8D6613] dark:ring-[#D8B467] bg-[rgba(228,214,195,0.7)] dark:bg-[rgba(42,32,22,0.85)]'
            : ''
        }`}
      >
        {/* Fixed aspect-square thumbnail with paper skeleton placeholder */}
        <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] aspect-square shrink-0 rounded-xl overflow-hidden border border-[#C2AD93] dark:border-[#3D2F20] group-hover:border-[#8D6613] dark:group-hover:border-[#D8B467] bg-[#E4D6C3] dark:bg-[#19130D]">
          {!isImgLoaded && (
            <div aria-hidden="true" className="absolute inset-0 skeleton-paper-shimmer" />
          )}
          {item.imageUrl && failedCustomImages[item.id] !== item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              decoding="async"
              loading="lazy"
              onLoad={() => markImageLoaded(item.id)}
              onError={() => {
                setFailedCustomImages((prev) => ({ ...prev, [item.id]: item.imageUrl || '' }));
                markImageLoaded(item.id);
              }}
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 ${
                isImgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : (
            <OptimizedImage
              imageKey={item.imageKey}
              preset="thumb"
              sizes="(max-width: 640px) 64px, 72px"
              alt={item.name}
              decoding="async"
              onLoad={() => markImageLoaded(item.id)}
              onError={() => markImageLoaded(item.id)}
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 ${
                isImgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
            />
          )}
        </div>

        {/* Dish Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                  item.isVeg
                    ? 'bg-emerald-700 border-emerald-900 dark:bg-emerald-500 dark:border-emerald-300'
                    : 'bg-[#8D6613] border-[#5C410A] dark:bg-[#D8B467] dark:border-[#8D6613]'
                }`}
                title={item.isVeg ? 'Pure Veg' : 'Non-Veg'}
              />
              <h4 className="font-softline font-bold text-sm sm:text-base text-[#14100B] dark:text-[#F0E6D8] group-hover:text-[#8D6613] dark:group-hover:text-[#D8B467] truncate">
                {item.name}
              </h4>
              {item.isSpicy && (
                <Flame className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467] shrink-0 transition-transform duration-200 group-hover:scale-110" />
              )}
            </div>
            <span className="font-condensed font-bold text-base sm:text-lg text-[#14100B] dark:text-[#F0E6D8] tabular-nums shrink-0">
              ₹{item.price}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-[#3B3126] dark:text-[#D4C5B3] leading-snug mt-1 line-clamp-2">
            {item.description}
          </p>

          <div className="mt-2.5 flex justify-end">
            {item.inStock ? (
              <motion.button
                type="button"
                whileHover={{ y: -1, scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => handleAdd(item, chapter)}
                className={`inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-xs font-bold cursor-pointer ${
                  addedItemId === item.id
                    ? 'bg-emerald-800 text-[#EFE5D6]'
                    : 'bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6]'
                }`}
                aria-label={`Add ${item.name} to order`}
              >
                {addedItemId === item.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Added
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Add
                  </>
                )}
              </motion.button>
            ) : (
              <span className="inline-flex items-center px-3 py-1.5 min-h-[40px] rounded-lg text-[11px] font-bold uppercase tracking-wider bg-[rgba(194,173,147,0.45)] dark:bg-[#2A2016] text-[#5E5042] dark:text-[#B5A490]">
                Sold Out
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const activeMenuPage =
    currentPageIndex > 0 && currentPageIndex < totalPages - 1
      ? MENU_PAGES[currentPageIndex - 1]
      : null;

  return (
    <section
      id="book-menu"
      className="relative z-20 -mt-14 sm:-mt-20 pt-10 sm:pt-14 pb-16 sm:pb-20 bg-[#D9C7B0] dark:bg-[#19130D] rounded-t-[2rem] sm:rounded-t-[3rem] border-t border-[rgba(194,173,147,0.85)] dark:border-[#3D2F20] shadow-[0_-24px_60px_-14px_rgba(20,16,11,0.34)] scroll-mt-16 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="w-14 h-1 rounded-full bg-[rgba(141,102,19,0.4)] dark:bg-[rgba(216,180,103,0.4)] mx-auto mb-6 sm:mb-8"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header: Bigger, Bold, Strictly Single-Color Headline */}
        <motion.div
          data-ink-reveal="true"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8"
        >
          <div className="space-y-1.5">
            <h2 className="font-luxury text-3xl min-[380px]:text-4xl sm:text-5xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8]">
              Kitchen &amp; Cafe Catalogue
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {dietaryPreference !== 'all' && (
              <div className="inline-flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-[rgba(239,229,214,0.88)] dark:bg-[rgba(31,23,16,0.88)] border border-[#C2AD93] dark:border-[#3D2F20] text-xs font-bold text-[#14100B] dark:text-[#F0E6D8]">
                <span
                  aria-hidden="true"
                  className={`w-2.5 h-2.5 rounded-full ${
                    dietaryPreference === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                />
                <span>
                  {dietaryPreference === 'veg' ? 'Veg Only' : 'Non-Veg Only'} ({totalMatchingItems})
                </span>
                {onChangeDietaryPreference && (
                  <button
                    type="button"
                    onClick={() => onChangeDietaryPreference('all')}
                    className="ml-1 inline-flex items-center min-h-[36px] px-1.5 underline text-[#8D6613] dark:text-[#D8B467] hover:opacity-80 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            <motion.button
              whileHover={{ y: -1.5, scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleToggleSound}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-xs font-bold text-[#14100B] dark:text-[#F0E6D8] whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              aria-label={muted ? 'Unmute page turn sound' : 'Mute page turn sound'}
            >
              {muted ? (
                <>
                  <VolumeX className="w-4 h-4 text-[#5E5042] dark:text-[#B5A490]" />
                  <span>Sound Off</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-[#8D6613] dark:text-[#D8B467]" />
                  <span>Page Sound On</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {isInitialLoading ? (
          <div aria-busy="true" aria-label="Loading digital menu">
            {/* Page Pill Skeletons */}
            <div className="flex items-center gap-2 overflow-hidden pb-2 mb-5">
              <div className="h-[40px] w-20 rounded-xl skeleton-shimmer shrink-0" />
              <div className="h-[40px] w-24 rounded-xl skeleton-shimmer shrink-0" />
              <div className="h-[40px] w-24 rounded-xl skeleton-shimmer shrink-0" />
              <div className="h-[40px] w-24 rounded-xl skeleton-shimmer shrink-0" />
              <div className="h-[40px] w-24 rounded-xl skeleton-shimmer shrink-0" />
            </div>

            {/* Single-Page Book Skeleton */}
            <div className="max-w-2xl mx-auto rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 bg-[#8D6613] border border-[#5C4008] book-shadow">
              <div className="w-full min-h-[430px] sm:min-h-[460px] rounded-xl sm:rounded-2xl p-6 sm:p-10 bg-[#14100B] flex flex-col justify-between items-center">
                <div className="w-full border-b border-[#3A2D1E] pb-3 flex justify-between items-center">
                  <div className="h-3.5 w-32 rounded skeleton-dark-shimmer" />
                  <div className="h-3.5 w-28 rounded skeleton-dark-shimmer" />
                </div>

                <div className="my-auto py-6 w-full max-w-md flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl skeleton-dark-shimmer" />
                  <div className="h-10 w-56 rounded-xl skeleton-dark-shimmer" />
                  <div className="h-3.5 w-48 rounded skeleton-dark-shimmer" />
                  <div className="space-y-2 w-full max-w-sm pt-2">
                    <div className="h-3.5 w-full rounded skeleton-dark-shimmer" />
                    <div className="h-3.5 w-4/5 mx-auto rounded skeleton-dark-shimmer" />
                  </div>
                </div>

                <div className="w-full pt-4 border-t border-[#3A2D1E] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="h-3.5 w-40 rounded skeleton-dark-shimmer" />
                  <div className="w-full sm:w-36 h-[44px] rounded-xl skeleton-dark-shimmer" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Single-Page Switcher Tabs (WAI-ARIA Tablist with ArrowLeft/ArrowRight) */}
            <div
              role="tablist"
              aria-label="Menu Book Chapters"
              className="flex items-center gap-2 overflow-x-auto touch-pan-x py-1 pb-2 mb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                ref={(el) => {
                  tabRefs.current[0] = el;
                }}
                role="tab"
                aria-selected={currentPageIndex === 0}
                tabIndex={currentPageIndex === 0 ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, 0)}
                onClick={() => goToPage(0)}
                className={`px-3.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                  currentPageIndex === 0
                    ? 'bg-[#8D6613] text-[#FAF2E6] shadow-sm'
                    : 'bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#3B3126] dark:text-[#D4C5B3] hover:border-[#8D6613] dark:hover:border-[#D8B467] hover:text-[#14100B] dark:hover:text-[#F0E6D8]'
                }`}
              >
                Cover
              </motion.button>
              {MENU_PAGES.map((pg, idx) => {
                const pageIdx = idx + 1;
                const isActiveTab = currentPageIndex === pageIdx;
                const hasItems = pg.items.length > 0;
                return (
                  <motion.button
                    key={pg.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    ref={(el) => {
                      tabRefs.current[pageIdx] = el;
                    }}
                    role="tab"
                    aria-selected={isActiveTab}
                    tabIndex={isActiveTab ? 0 : -1}
                    onKeyDown={(e) => handleTabKeyDown(e, pageIdx)}
                    onClick={() => goToPage(pageIdx)}
                    className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                      isActiveTab
                        ? 'bg-[#8D6613] text-[#FAF2E6] shadow-sm'
                        : hasItems
                        ? 'bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#3B3126] dark:text-[#D4C5B3] hover:border-[#8D6613] dark:hover:border-[#D8B467] hover:text-[#14100B] dark:hover:text-[#F0E6D8]'
                        : 'bg-[rgba(239,229,214,0.55)] dark:bg-[rgba(31,23,16,0.55)] border border-[rgba(194,173,147,0.6)] dark:border-[rgba(61,47,32,0.6)] text-[rgba(94,80,66,0.7)] dark:text-[rgba(181,164,144,0.6)] hover:border-[rgba(141,102,19,0.6)] dark:hover:border-[rgba(216,180,103,0.6)]'
                    }`}
                  >
                    <span>{pg.chapter}</span>
                    {dietaryPreference !== 'all' && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] tabular-nums ${
                          isActiveTab
                            ? 'bg-[rgba(0,0,0,0.2)] text-[#FAF2E6]'
                            : 'bg-[rgba(194,173,147,0.4)] dark:bg-[#2A2016] text-inherit'
                        }`}
                      >
                        {pg.items.length}
                      </span>
                    )}
                  </motion.button>
                );
              })}
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                ref={(el) => {
                  tabRefs.current[totalPages - 1] = el;
                }}
                role="tab"
                aria-selected={currentPageIndex === totalPages - 1}
                tabIndex={currentPageIndex === totalPages - 1 ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, totalPages - 1)}
                onClick={() => goToPage(totalPages - 1)}
                className={`px-3.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                  currentPageIndex === totalPages - 1
                    ? 'bg-[#8D6613] text-[#FAF2E6] shadow-sm'
                    : 'bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#3B3126] dark:text-[#D4C5B3] hover:border-[#8D6613] dark:hover:border-[#D8B467] hover:text-[#14100B] dark:hover:text-[#F0E6D8]'
                }`}
              >
                Info
              </motion.button>
            </div>

            {/* Centered Single-Page Book Frame (Never stacks two pages vertically) */}
            <motion.div
              data-ink-reveal="true"
              role="region"
              aria-roledescription="interactive menu book"
              aria-label="Kitchen and Cafe Menu Book. Use Left and Right arrow keys to flip pages, Home or End to jump, or M to toggle sound."
              tabIndex={0}
              onKeyDown={handleBookKeyDown}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative max-w-2xl mx-auto rounded-3xl focus-visible:outline-2 focus-visible:outline-[#8D6613] dark:focus-visible:outline-[#D8B467]"
              onPointerEnter={warmUpAudio}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Desktop Left/Right Page Flip Arrows */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handlePrev}
                disabled={currentPageIndex === 0}
                className="hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-[rgba(20,16,11,0.92)] dark:bg-[rgba(36,27,18,0.92)] border border-[#8D6613] text-[#E4D6C3] items-center justify-center hover:bg-[#8D6613] disabled:opacity-30 disabled:pointer-events-none shadow-lg cursor-pointer"
                aria-label="Previous Menu Page"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleNext}
                disabled={currentPageIndex === totalPages - 1}
                className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-[rgba(20,16,11,0.92)] dark:bg-[rgba(36,27,18,0.92)] border border-[#8D6613] text-[#E4D6C3] items-center justify-center hover:bg-[#8D6613] disabled:opacity-30 disabled:pointer-events-none shadow-lg cursor-pointer"
                aria-label="Next Menu Page"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>

              {/* Bronze Bound Frame */}
              <div className="rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 bg-[#8D6613] border border-[#5C4008] dark:border-[rgba(216,180,103,0.4)] book-shadow">
                <div className="relative rounded-xl sm:rounded-2xl overflow-hidden bg-[#EFE5D6] dark:bg-[#1F1710] text-[#14100B] dark:text-[#F0E6D8] min-h-[430px] sm:min-h-[460px]">
                  <AnimatePresence mode="popLayout" custom={flipDirection} initial={false}>
                    {/* COVER PAGE */}
                    {currentPageIndex === 0 && (
                      <motion.div
                        key="cover"
                        custom={flipDirection}
                        variants={pageTurnVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="w-full min-h-[430px] sm:min-h-[460px] p-6 sm:p-10 bg-[#14100B] text-[#E4D6C3] flex flex-col justify-center items-center text-center select-none will-change-transform gap-6"
                      >
                        <div className="my-auto py-4 max-w-md space-y-4">
                          <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#8D6613] mx-auto shadow-lg bg-[#241C13]">
                            {!loadedImages['cover-img'] && (
                              <div aria-hidden="true" className="absolute inset-0 skeleton-dark-shimmer" />
                            )}
                            <OptimizedImage
                              imageKey="tandoor"
                              preset="thumb"
                              sizes="64px"
                              alt="Signature Tandoor Tikka"
                              decoding="async"
                              onLoad={() => markImageLoaded('cover-img')}
                              onError={() => markImageLoaded('cover-img')}
                              className={`w-full h-full object-cover ${
                                loadedImages['cover-img'] ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                          </div>
                          {/* Bold Single-Color Cover Title */}
                          <h3 className="font-brand text-3xl sm:text-5xl font-extrabold tracking-tight text-[#E4D6C3]">
                            Hot &amp; Spicy
                          </h3>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#D8B467] font-semibold">
                            Food &amp; Café Menu
                          </p>
                        </div>

                        <div className="w-full pt-4 border-t border-[rgba(141,102,19,0.4)] flex justify-center text-xs">
                          <motion.button
                            type="button"
                            whileHover={{ y: -1.5, scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={handleNext}
                            className="w-full sm:w-auto px-7 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <span>Open Menu</span>
                            <ChevronRight className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </motion.div>
                    )}

                    {/* SINGLE MENU PAGE AT A TIME */}
                    {activeMenuPage && (
                      <motion.div
                        key={`page-${activeMenuPage.id}`}
                        custom={flipDirection}
                        variants={pageTurnVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="w-full min-h-[430px] sm:min-h-[460px] p-5 sm:p-8 bg-[#EFE5D6] dark:bg-[#1F1710] flex flex-col justify-between will-change-transform"
                      >
                        <div>
                          <div className="pb-3.5 border-b border-[#C2AD93] dark:border-[#3D2F20] mb-5 flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <span className="text-[11px] uppercase tracking-[0.14em] text-[#5C4008] dark:text-[#D8B467] font-bold block">
                                Chapter 0{activeMenuPage.id} · {activeMenuPage.chapter}
                              </span>
                              <h3 className="font-luxury text-3xl sm:text-4xl font-bold text-[#14100B] dark:text-[#F0E6D8]">
                                {activeMenuPage.title}
                              </h3>
                            </div>
                            <span className="text-xs text-[#5E5042] dark:text-[#B5A490] italic">
                              {activeMenuPage.subtitle}
                            </span>
                          </div>

                          <div className="relative space-y-2.5">
                            <AnimatePresence mode="wait" initial={false}>
                              {activeMenuPage.items.length > 0 ? (
                                activeMenuPage.items.map((item, idx) =>
                                  renderDishRow(item, activeMenuPage.chapter, idx)
                                )
                              ) : (
                                <motion.div
                                  key={`empty-${activeMenuPage.id}-${dietaryPreference}`}
                                  initial={
                                    prefersReduced
                                      ? { opacity: 0 }
                                      : { opacity: 0, y: 10, scale: 0.985 }
                                  }
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={
                                    prefersReduced
                                      ? { opacity: 0 }
                                      : { opacity: 0, y: -8, scale: 0.985 }
                                  }
                                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                  className="py-10 px-5 rounded-2xl border border-dashed border-[#C2AD93] dark:border-[#3D2F20] bg-[rgba(228,214,195,0.45)] dark:bg-[rgba(20,16,11,0.45)] text-center space-y-3"
                                >
                                  <p className="font-luxury text-xl font-bold text-[#14100B] dark:text-[#F0E6D8]">
                                    No {dietaryPreference === 'veg' ? 'Pure Veg' : 'Non-Veg'} dishes in{' '}
                                    {activeMenuPage.chapter}
                                  </p>
                                  <p className="text-xs sm:text-sm text-[#5E5042] dark:text-[#B5A490] max-w-md mx-auto">
                                    Switch chapters using the tabs above or reset the dietary filter to view every dish in this section.
                                  </p>
                                  {onChangeDietaryPreference && (
                                    <button
                                      type="button"
                                      onClick={() => onChangeDietaryPreference('all')}
                                      className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] text-xs font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                      Show All Options
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="pt-4 mt-6 border-t border-[#C2AD93] dark:border-[#3D2F20] flex justify-end items-center text-[11px] text-[#5E5042] dark:text-[#B5A490] font-semibold">
                          <span className="tabular-nums">
                            Page {currentPageIndex} of {MENU_PAGES.length}
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {/* BACK COVER PAGE */}
                    {currentPageIndex === totalPages - 1 && (
                      <motion.div
                        key="back-cover"
                        custom={flipDirection}
                        variants={pageTurnVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="w-full min-h-[430px] sm:min-h-[460px] p-6 sm:p-10 bg-[#14100B] text-[#E4D6C3] flex flex-col justify-between items-center text-center select-none will-change-transform"
                      >
                        <div className="my-auto py-4 max-w-md space-y-3">
                          <h3 className="font-luxury text-3xl sm:text-4xl font-bold text-[#E4D6C3]">
                            Prepared Fresh Daily
                          </h3>
                          <p className="text-xs sm:text-sm text-[#D8C7B4] leading-relaxed">
                            All items cooked fresh to order until {venueSettings.kitchenLastOrder}.
                          </p>
                        </div>

                        <div className="w-full pt-4 border-t border-[rgba(141,102,19,0.4)] flex flex-wrap items-center justify-between gap-3 text-xs">
                          <button
                            type="button"
                            onClick={handlePrev}
                            className="px-4 min-h-[44px] rounded-xl bg-[#221A11] border border-[rgba(141,102,19,0.5)] text-[#E4D6C3] hover:border-[#E4D6C3] font-semibold cursor-pointer"
                          >
                            ← Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => goToPage(0)}
                            className="px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#EFE5D6] font-bold cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Back to Cover
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Bottom Navigation Bar */}
              <div className="mt-4 flex items-center justify-between gap-3 px-1 text-xs">
                <motion.button
                  whileHover={{ y: -1.5, scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePrev}
                  disabled={currentPageIndex === 0}
                  className="inline-flex items-center gap-1 px-4 min-h-[44px] rounded-xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-[#14100B] dark:text-[#F0E6D8] font-bold disabled:opacity-35 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </motion.button>

                <div className="flex flex-col items-center text-center">
                  <span className="font-bold text-[#14100B] dark:text-[#F0E6D8] tabular-nums">
                    {currentPageIndex + 1} / {totalPages}
                  </span>
                  <span className="hidden sm:block text-[10px] text-[#5E5042] dark:text-[#B5A490]">
                    Use ← → keys to turn pages
                  </span>
                </div>

                <motion.button
                  whileHover={{ y: -1.5, scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleNext}
                  disabled={currentPageIndex === totalPages - 1}
                  className="inline-flex items-center gap-1 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold disabled:opacity-35 cursor-pointer"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </section>
  );
};
