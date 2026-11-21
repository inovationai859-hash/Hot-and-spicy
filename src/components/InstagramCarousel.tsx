import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Instagram,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Pause,
  Film,
  Eye,
  X,
} from 'lucide-react';
import {
  VIEWPORT_CONFIG,
  createStaggerContainer,
  createRevealItem,
} from '../lib/revealVariants';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard';
import { getTransformedImageUrl, type VenueImageKey } from '../lib/imageTransform';
import { getSmoothstepScrimPng } from '../ink/snapshotAssets';
import { OptimizedImage } from './OptimizedImage';
import { useCatalog } from '../context/CatalogContext';

type FeedImageKey = VenueImageKey;

const FEED_IMAGE_ASSETS: Record<FeedImageKey, string> = {
  tandoor: getTransformedImageUrl('tandoor', 'card'),
  momos: getTransformedImageUrl('momos', 'card'),
  pizza: getTransformedImageUrl('pizza', 'card'),
  burger: getTransformedImageUrl('burger', 'card'),
  noodles: getTransformedImageUrl('noodles', 'card'),
  frappe: getTransformedImageUrl('frappe', 'card'),
  pool: getTransformedImageUrl('pool', 'card'),
  ps5: getTransformedImageUrl('ps5', 'card'),
  combos: getTransformedImageUrl('combos', 'card'),
  store: getTransformedImageUrl('store', 'card'),
};

interface InstagramPost {
  id: string;
  imageKey: FeedImageKey;
  mediaType?: 'IMAGE' | 'VIDEO' | 'REEL';
  mediaUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  duration?: string;
  views?: number;
  caption: string;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  category: string;
}

const FALLBACK_POSTS: InstagramPost[] = [
  {
    id: 'ig-reel-1',
    imageKey: 'tandoor',
    mediaType: 'REEL',
    duration: '0:24',
    views: 2480,
    caption:
      'Live charcoal tandoor flame reel — smoky Chicken & Paneer Tikka skewers sizzling straight off the embers.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    likes: 612,
    comments: 47,
    category: 'Tandoor Flame Reel',
  },
  {
    id: 'ig-reel-2',
    imageKey: 'pool',
    mediaType: 'REEL',
    duration: '0:19',
    views: 1920,
    caption:
      'Clean 8-Ball break shot at our Boropara More championship pool lounge — rack em up tonight after 6 PM.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    likes: 504,
    comments: 38,
    category: '8-Ball Break Reel',
  },
  {
    id: 'ig-reel-3',
    imageKey: 'momos',
    mediaType: 'REEL',
    duration: '0:21',
    views: 2150,
    caption:
      'High-flame wok toss: fiery Schezwan Pan-Tossed Momos glazed with roasted garlic and spring onions.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 579,
    comments: 44,
    category: 'Wok Toss Reel',
  },
  {
    id: 'ig-reel-4',
    imageKey: 'ps5',
    mediaType: 'REEL',
    duration: '0:28',
    views: 2690,
    caption:
      'Last-minute EA Sports FC 25 & Tekken 8 tournament highlights from our 4K 120Hz PS5 gaming booths.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 645,
    comments: 53,
    category: 'PS5 Arena Reel',
  },
  {
    id: 'ig-reel-5',
    imageKey: 'frappe',
    mediaType: 'REEL',
    duration: '0:16',
    views: 1580,
    caption:
      'Slow-motion iced hazelnut mocha frappe swirl topped with velvety whipped cream & dark cocoa dust.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 438,
    comments: 27,
    category: 'Café Pour Reel',
  },
  {
    id: 'ig-1',
    imageKey: 'combos',
    mediaType: 'IMAGE',
    caption:
      'Weekend table spread at Boropara More — spicy platters, grilled kebabs, and chilled coolers.',
    permalink: 'https://instagram.com/hotandspicy_aa',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 532,
    comments: 41,
    category: 'Signature Combos',
  },
  {
    id: 'ig-2',
    imageKey: 'pizza',
    mediaType: 'IMAGE',
    caption:
      'Hand-stretched wood-fired crust loaded with blistered veggies, fresh basil, and melted mozzarella.',
    permalink: 'https://instagram.com/hotandspicy_aa',
    timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 394,
    comments: 19,
    category: 'Artisan Pizza',
  },
];

function isVideoPost(post: InstagramPost): boolean {
  return post.mediaType === 'VIDEO' || post.mediaType === 'REEL' || Boolean(post.videoUrl);
}

function formatPostDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return 'Recent';
  }
}

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 24;
  const parts = duration.split(':').map((n) => Number(n));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return Math.max(5, parts[0] * 60 + parts[1]);
  }
  return 24;
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

export const InstagramCarousel: React.FC = () => {
  const { venueSettings } = useCatalog();
  const prefersReduced = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);

  const [posts, setPosts] = useState<InstagramPost[]>(FALLBACK_POSTS);
  const [feedMeta, setFeedMeta] = useState<{ handle?: string; profileUrl?: string }>({});
  const [loading, setLoading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'videos' | 'photos'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPostIndex, setSelectedPostIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [failedVideos, setFailedVideos] = useState<Record<string, boolean>>({});

  // Interactive preview player state when viewing a curated Reel without MP4 stream / embed
  const [reelPreviewPlaying, setReelPreviewPlaying] = useState(true);
  const [reelPreviewProgress, setReelPreviewProgress] = useState(0);
  const [preferEmbedFallback, setPreferEmbedFallback] = useState(false);

  const activeHandle = feedMeta.handle || venueSettings.instagramHandle || '@hotandspicy_aa';
  const activeProfileUrl = feedMeta.profileUrl || venueSettings.instagramUrl || 'https://instagram.com/hotandspicy_aa';
  const activeReelsUrl = `${activeProfileUrl.replace(/\/+$/, '')}/reels/`;

  useDialogKeyboard(
    selectedPostIndex !== null,
    () => setSelectedPostIndex(null),
    lightboxRef
  );

  useEffect(() => {
    if (selectedPostIndex === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedPostIndex]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch('/api/instagram-feed', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Feed error'))))
      .then((data: { posts?: InstagramPost[]; handle?: string; profileUrl?: string }) => {
        if (!active) return;
        if (data.handle || data.profileUrl) {
          setFeedMeta({ handle: data.handle, profileUrl: data.profileUrl });
        }
        if (Array.isArray(data.posts)) {
          setPosts(data.posts);
        }
      })
      .catch(() => {
        // Keep bundled fallback posts silently if feed request fails
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const videoCount = useMemo(() => posts.filter(isVideoPost).length, [posts]);
  const photoCount = useMemo(() => posts.filter((p) => !isVideoPost(p)).length, [posts]);

  const visiblePosts = useMemo(() => {
    if (mediaFilter === 'videos') return posts.filter(isVideoPost);
    if (mediaFilter === 'photos') return posts.filter((p) => !isVideoPost(p));
    return posts;
  }, [posts, mediaFilter]);

  // Reset track scroll and active index cleanly when filter switches
  useEffect(() => {
    setActiveIndex(0);
    setSelectedPostIndex(null);
    if (trackRef.current) {
      trackRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, [mediaFilter]);

  const selectedPost =
    selectedPostIndex !== null ? visiblePosts[selectedPostIndex] ?? null : null;

  // Reset modal preview timers whenever switching post
  useEffect(() => {
    setReelPreviewPlaying(true);
    setReelPreviewProgress(0);
    setPreferEmbedFallback(false);
  }, [selectedPost?.id]);

  // Animate Reel showcase scrubber when viewing a curated Reel without direct MP4 / embed
  useEffect(() => {
    if (!selectedPost) return;
    const hasNativeVideo = Boolean(selectedPost.videoUrl && !failedVideos[selectedPost.id]);
    const hasEmbed = Boolean(selectedPost.embedUrl && !preferEmbedFallback);
    if (!isVideoPost(selectedPost) || hasNativeVideo || hasEmbed || !reelPreviewPlaying) {
      return;
    }

    const totalSec = parseDurationSeconds(selectedPost.duration);
    const intervalMs = 100;
    const step = (100 / (totalSec * 1000)) * intervalMs;

    const timer = window.setInterval(() => {
      setReelPreviewProgress((prev) => (prev + step >= 100 ? 0 : prev + step));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [selectedPost, reelPreviewPlaying, preferEmbedFallback, failedVideos]);

  const cardStepRef = useRef<number>(325);
  const scrollRafRef = useRef<number>(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let timer = 0;
    const measureCardStep = () => {
      const firstCard = track.children[0] as HTMLElement | undefined;
      if (firstCard && firstCard.offsetWidth > 0) {
        cardStepRef.current = firstCard.offsetWidth + 20;
      }
    };
    measureCardStep();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(measureCardStep, 150);
      });
      ro.observe(track);
    }

    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [mediaFilter, visiblePosts.length]);

  const handleTrackScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const track = trackRef.current;
      const cardStep = cardStepRef.current;
      if (!track || cardStep <= 0) return;
      const idx = Math.round(track.scrollLeft / cardStep);
      const clamped = Math.min(Math.max(idx, 0), Math.max(0, visiblePosts.length - 1));
      setActiveIndex((prev) => (prev !== clamped ? clamped : prev));
    });
  };

  const scrollToSlide = (targetIndex: number) => {
    const track = trackRef.current;
    if (!track || visiblePosts.length === 0) return;
    const clamped = Math.min(Math.max(targetIndex, 0), visiblePosts.length - 1);
    const card = track.children[clamped] as HTMLElement | undefined;
    if (card) {
      track.scrollTo({
        left: card.offsetLeft,
        behavior: prefersReduced ? 'auto' : 'smooth',
      });
      setActiveIndex(clamped);
    }
  };

  const stepCarousel = (direction: -1 | 1) => {
    if (visiblePosts.length === 0) return;
    const next =
      direction === 1
        ? activeIndex + 1 >= visiblePosts.length
          ? 0
          : activeIndex + 1
        : activeIndex - 1 < 0
        ? visiblePosts.length - 1
        : activeIndex - 1;
    scrollToSlide(next);
  };

  const resolvePostImage = (post: InstagramPost): string => {
    const candidate = post.thumbnailUrl || post.mediaUrl;
    if (candidate && !failedImages[`live-${post.id}`]) {
      return candidate;
    }
    return FEED_IMAGE_ASSETS[post.imageKey] || FEED_IMAGE_ASSETS.tandoor;
  };

  const cardScrimPng = useMemo(
    () => getSmoothstepScrimPng('to-top', 20, 16, 11, 0.78, 0.0, 64),
    []
  );
  const modalScrimPng = useMemo(
    () => getSmoothstepScrimPng('to-top', 20, 16, 11, 0.88, 0.0, 64),
    []
  );

  const headerContainer = createStaggerContainer(0.09, 0.02, prefersReduced);
  const headerItem = createRevealItem({ y: 20, duration: 0.52, reduced: prefersReduced });
  const trackReveal = createRevealItem({
    y: 24,
    scale: 0.985,
    duration: 0.58,
    delay: 0.08,
    reduced: prefersReduced,
  });

  return (
    <section
      id="instagram"
      className="py-16 sm:py-20 bg-[#E4D6C3] dark:bg-[#120E0A] relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Row */}
        <motion.div
          data-ink-reveal="true"
          variants={headerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 sm:mb-10"
        >
          <div className="max-w-2xl space-y-2.5">
            <motion.a
              variants={headerItem}
              href={activeProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] font-semibold text-[#5C4008] dark:text-[#D8B467] hover:underline"
            >
              <Instagram className="w-3.5 h-3.5" />
              <span>{activeHandle}</span>
            </motion.a>
            <motion.h2
              variants={headerItem}
              className="font-luxury text-3xl min-[380px]:text-4xl sm:text-5xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] text-balance"
            >
              Reels &amp; Posts From Instagram
            </motion.h2>
          </div>

          <motion.div
            variants={headerItem}
            className="flex flex-wrap items-center gap-2.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => stepCarousel(-1)}
              aria-label="Previous Instagram post"
              className="w-11 h-11 rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[#EFE5D6] dark:bg-[#1F1710] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-[#14100B] dark:text-[#F0E6D8] flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => stepCarousel(1)}
              aria-label="Next Instagram post"
              className="w-11 h-11 rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[#EFE5D6] dark:bg-[#1F1710] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-[#14100B] dark:text-[#F0E6D8] flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <a
              href={activeReelsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#8D6613] dark:border-[#D8B467] bg-[#EFE5D6] dark:bg-[#1F1710] hover:bg-[#DFD0BC] dark:hover:bg-[#2A2016] text-[#5C4008] dark:text-[#D8B467] font-bold text-xs uppercase tracking-wider whitespace-nowrap shrink-0"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Watch Reels</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={activeProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider whitespace-nowrap shrink-0"
            >
              <Instagram className="w-3.5 h-3.5" />
              <span>Follow Feed</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </motion.div>
        </motion.div>

        {/* Segmented Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter Instagram posts by media type"
          className="flex items-center gap-2 mb-6 overflow-x-auto touch-pan-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              { key: 'all', label: `All (${posts.length})` },
              { key: 'videos', label: `Reels & Videos (${videoCount})` },
              { key: 'photos', label: `Photos (${photoCount})` },
            ] as const
          ).map((tab) => {
            const isSelected = mediaFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setMediaFilter(tab.key)}
                className={`px-4 min-h-[44px] rounded-xl border text-xs font-bold tracking-wide cursor-pointer whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-[#14100B] dark:bg-[#D8B467] text-[#FAF2E6] dark:text-[#14100B] border-[#14100B] dark:border-[#D8B467]'
                    : 'bg-[#EFE5D6] dark:bg-[#1F1710] text-[#3B3126] dark:text-[#D4C5B3] border-[#C2AD93] dark:border-[#3D2F20] hover:border-[#8D6613] dark:hover:border-[#D8B467]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Carousel Stage */}
        <motion.div
          data-ink-reveal="true"
          variants={trackReveal}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="relative"
        >
          <div
            ref={trackRef}
            onScroll={handleTrackScroll}
            role="region"
            aria-label="Instagram reels and photo carousel"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                stepCarousel(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                stepCarousel(-1);
              }
            }}
            className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`ig-skeleton-${i}`}
                    className="snap-start shrink-0 w-[74vw] max-w-[295px] sm:w-[275px] lg:w-[290px] rounded-2xl overflow-hidden bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20]"
                  >
                    <div className="aspect-[4/5] w-full skeleton-shimmer" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-3.5 w-3/4 rounded skeleton-shimmer" />
                      <div className="h-3 w-1/2 rounded skeleton-shimmer" />
                    </div>
                  </div>
                ))
              : visiblePosts.length === 0 ? (
                  <div className="w-full py-12 px-6 rounded-2xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[#EFE5D6] dark:bg-[#1F1710] text-center space-y-2.5">
                    <Instagram className="w-7 h-7 text-[#8D6613] dark:text-[#D8B467] mx-auto" />
                    <p className="text-sm font-bold text-[#14100B] dark:text-[#F0E6D8]">
                      No Reels or posts currently featured
                    </p>
                    <p className="text-xs text-[#574939] dark:text-[#C4B4A0]">
                      Follow {activeHandle} directly on Instagram for our latest clips and plates.
                    </p>
                  </div>
                )
              : visiblePosts.map((post, idx) => {
                  const src = resolvePostImage(post);
                  const isVideo = isVideoPost(post);
                  const hasLiveVideoStream = Boolean(post.videoUrl && !failedVideos[post.id]);
                  const isFallbackBroken = Boolean(failedImages[`local-${post.id}`]);

                  return (
                    <article
                      key={post.id}
                      className="snap-start shrink-0 w-[74vw] max-w-[295px] sm:w-[275px] lg:w-[290px] group rounded-2xl overflow-hidden bg-[rgba(239,229,214,0.92)] dark:bg-[rgba(31,23,16,0.92)] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[#8D6613] dark:hover:border-[#D8B467] shadow-sm hover:shadow-xl flex flex-col"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPostIndex(idx)}
                        className="relative aspect-[4/5] w-full overflow-hidden bg-[#120D08] text-left cursor-pointer focus:outline-none flex items-center justify-center"
                        aria-label={
                          isVideo
                            ? `Play Instagram reel: ${post.category}`
                            : `Preview Instagram post: ${post.category}`
                        }
                      >
                        {!isFallbackBroken && (
                          <img
                            src={src}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50"
                          />
                        )}

                        {hasLiveVideoStream ? (
                          <video
                            src={post.videoUrl}
                            poster={src}
                            muted
                            loop
                            playsInline
                            preload="none"
                            onError={() =>
                              setFailedVideos((prev) => ({ ...prev, [post.id]: true }))
                            }
                            className="relative z-[1] w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                          />
                        ) : isFallbackBroken ? (
                          <div className="relative z-[1] w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#14100B]">
                            <Instagram className="w-8 h-8 text-[#D8B467] mb-2" />
                            <span className="font-luxury text-lg font-bold text-[#FAF2E6]">
                              {post.category}
                            </span>
                          </div>
                        ) : (post.thumbnailUrl || post.mediaUrl) && !failedImages[`live-${post.id}`] ? (
                          <img
                            src={src}
                            alt={post.caption}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={() => {
                              setFailedImages((prev) => ({
                                ...prev,
                                [`live-${post.id}`]: true,
                              }));
                            }}
                            className="relative z-[1] w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                          />
                        ) : (
                          <OptimizedImage
                            imageKey={post.imageKey}
                            preset="card"
                            sizes="(max-width: 640px) 72vw, 285px"
                            alt={post.caption}
                            loading="lazy"
                            decoding="async"
                            onError={() => {
                              setFailedImages((prev) => ({
                                ...prev,
                                [`local-${post.id}`]: true,
                              }));
                            }}
                            className="relative z-[1] w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                          />
                        )}

                        {cardScrimPng && (
                          <img
                            src={cardScrimPng}
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            className="pointer-events-none select-none absolute inset-0 z-[2] w-full h-full object-fill"
                          />
                        )}

                        {/* Video Reel Center Play Trigger */}
                        {isVideo && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 z-[3] flex items-center justify-center"
                          >
                            <span className="w-14 h-14 rounded-full bg-[rgba(20,16,11,0.78)] border border-[rgba(250,242,230,0.45)] flex items-center justify-center text-[#FAF2E6] shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:bg-[#8D6613] group-hover:border-[#D8B467]">
                              <Play className="w-6 h-6 fill-current ml-0.5" />
                            </span>
                          </span>
                        )}

                        <div className="absolute bottom-3 left-3.5 right-3.5 z-[3] flex items-center justify-between text-[11px] font-semibold text-[#FAF2E6]">
                          <span className="truncate">
                            {isVideo
                              ? `Reel${post.duration ? ` · ${post.duration}` : ''}`
                              : post.category}
                          </span>
                          <span className="inline-flex items-center gap-1 opacity-95 shrink-0">
                            {isVideo ? (
                              <>
                                <Film className="w-3.5 h-3.5 text-[#D8B467]" />
                                <span>Play</span>
                              </>
                            ) : (
                              <>
                                <Instagram className="w-3.5 h-3.5 text-[#D8B467]" />
                                <span>View</span>
                              </>
                            )}
                          </span>
                        </div>
                      </button>

                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8D6613] dark:text-[#D8B467]">
                            {post.category}
                          </div>
                          <p className="text-xs sm:text-[13px] text-[#3B3126] dark:text-[#D4C5B3] leading-relaxed line-clamp-2">
                            {post.caption}
                          </p>
                        </div>

                        <div className="pt-2.5 border-t border-[rgba(194,173,147,0.7)] dark:border-[#3D2F20] flex items-center justify-between text-[11px] text-[#574939] dark:text-[#C4B4A0]">
                          <div className="flex items-center gap-2 tabular-nums font-medium">
                            {isVideo && typeof post.views === 'number' ? (
                              <>
                                <span className="inline-flex items-center gap-1">
                                  <Eye className="w-3 h-3 text-[#8D6613] dark:text-[#D8B467]" />
                                  {post.views.toLocaleString('en-IN')}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            ) : null}
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-3 h-3 text-[#8D6613] dark:text-[#D8B467]" />
                              {post.likes}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="w-3 h-3 text-[#8D6613] dark:text-[#D8B467]" />
                              {post.comments}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatPostDate(post.timestamp)}</span>
                          </div>

                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-[#8D6613] dark:text-[#D8B467] hover:underline whitespace-nowrap shrink-0"
                            aria-label={`Open ${post.category} on Instagram`}
                          >
                            Open
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
          </div>

          {/* Slide Navigation Dots */}
          {!loading && visiblePosts.length > 1 && (
            <div
              className="mt-3 flex items-center justify-center gap-1"
              aria-label="Carousel slide indicators"
            >
              {visiblePosts.map((post, idx) => {
                const isCurrent = idx === activeIndex;
                return (
                  <button
                    key={`dot-${post.id}`}
                    type="button"
                    onClick={() => scrollToSlide(idx)}
                    aria-label={`Go to item ${idx + 1}: ${post.category}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    className="min-w-[28px] min-h-[36px] flex items-center justify-center cursor-pointer"
                  >
                    <span
                      className={`h-2 rounded-full ${
                        isCurrent
                          ? 'w-7 bg-[#8D6613] dark:bg-[#D8B467]'
                          : 'w-2 bg-[#C2AD93] dark:bg-[#3D2F20] hover:bg-[rgba(141,102,19,0.6)] dark:hover:bg-[rgba(216,180,103,0.6)]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Interactive Video & Photo Lightbox Modal (Portaled to escape Navbar/LazyReveal stacking contexts) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selectedPost && selectedPostIndex !== null && (
              <motion.div
            key="ig-lightbox-backdrop"
            data-lenis-prevent
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedPostIndex(null)}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-6 bg-[rgba(14,10,6,0.90)] overscroll-contain"
          >
            <motion.div
              ref={lightboxRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ig-lightbox-title"
              tabIndex={-1}
              data-lenis-prevent
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[400px] sm:max-w-4xl max-h-[92dvh] overflow-y-auto sm:overflow-hidden overscroll-contain rounded-2xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] shadow-2xl flex flex-col sm:flex-row will-change-transform focus:outline-none"
            >
              {/* Mobile Top Modal Header (Prevents Navbar/Embed Overlap) */}
              <div className="sm:hidden sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-2.5 bg-[#EFE5D6] dark:bg-[#1F1710] border-b border-[#C2AD93] dark:border-[#3D2F20]">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[#8D6613] dark:text-[#D8B467] truncate">
                    {activeHandle} · {isVideoPost(selectedPost) ? 'Reel Video' : 'Photo'}
                  </div>
                  <div className="font-luxury text-base font-bold text-[#14100B] dark:text-[#F0E6D8] truncate">
                    {selectedPost.category}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPostIndex(null)}
                  aria-label="Close Instagram preview"
                  className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#574939] dark:text-[#D4C5B3] bg-[#E4D6C3] dark:bg-[#2A2016] hover:bg-[#D5C3AA] cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Left Column: Full-Frame 9:16 Video / Embed / Poster Stage */}
              <div className="w-full sm:w-[360px] md:w-[390px] shrink-0 bg-[#0B0805] flex flex-col justify-between overflow-hidden">
                {selectedPost.videoUrl && !failedVideos[selectedPost.id] ? (
                  <div className="relative w-full aspect-[9/16] max-h-[64dvh] sm:max-h-[82dvh] mx-auto bg-[#0B0805] flex items-center justify-center overflow-hidden">
                    <video
                      key={`modal-video-${selectedPost.id}`}
                      src={selectedPost.videoUrl}
                      poster={resolvePostImage(selectedPost)}
                      controls
                      autoPlay
                      playsInline
                      onError={() =>
                        setFailedVideos((prev) => ({ ...prev, [selectedPost.id]: true }))
                      }
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : selectedPost.embedUrl && !preferEmbedFallback ? (
                  <>
                    <div className="relative w-full h-[540px] min-[390px]:h-[580px] sm:h-[600px] sm:max-h-[78dvh] bg-white overflow-hidden">
                      <iframe
                        title={`${selectedPost.category} Instagram Reel`}
                        src={selectedPost.embedUrl}
                        className="w-full h-full border-0 bg-white"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[#16110C] border-t border-[#2E2318] text-[11px] text-[#E6D6BE]">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Film className="w-3.5 h-3.5 text-[#D8B467]" />
                        <span>Live Reel Embed</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreferEmbedFallback(true)}
                        className="px-2.5 py-1 rounded-lg bg-[#2A2016] hover:bg-[#3A2C1E] border border-[#4D3B28] text-[#FAF2E6] font-semibold cursor-pointer"
                      >
                        View Poster Preview
                      </button>
                    </div>
                  </>
                ) : isVideoPost(selectedPost) ? (
                  <>
                    <div className="relative w-full aspect-[9/16] max-h-[64dvh] sm:max-h-[78dvh] mx-auto bg-[#0B0805] overflow-hidden flex items-center justify-center">
                      <img
                        src={resolvePostImage(selectedPost)}
                        alt=""
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-35"
                      />
                      <img
                        src={resolvePostImage(selectedPost)}
                        alt={selectedPost.caption}
                        referrerPolicy="no-referrer"
                        className="relative z-[1] w-full h-full object-contain"
                      />
                      {modalScrimPng && (
                        <img
                          src={modalScrimPng}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                          className="pointer-events-none select-none absolute inset-0 z-[2] w-full h-full object-fill"
                        />
                      )}

                      {/* Top Reel Handle Strip */}
                      <div className="absolute top-3 left-3.5 right-3.5 z-[3] flex items-center justify-between text-[11px] font-bold text-[#FAF2E6] drop-shadow">
                        <span className="inline-flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-[#D8B467]" />
                          <span>Instagram Reel · {activeHandle}</span>
                        </span>
                        <span className="tabular-nums text-[#D8B467]">
                          {selectedPost.duration || '0:24'}
                        </span>
                      </div>

                      {/* Interactive Play/Pause Toggle */}
                      <button
                        type="button"
                        onClick={() => setReelPreviewPlaying((p) => !p)}
                        aria-label={reelPreviewPlaying ? 'Pause reel preview' : 'Play reel preview'}
                        className="absolute inset-0 z-[3] flex items-center justify-center group cursor-pointer focus:outline-none"
                      >
                        <span className="w-16 h-16 rounded-full bg-[rgba(20,16,11,0.78)] border border-[rgba(250,242,230,0.45)] flex items-center justify-center text-[#FAF2E6] shadow-xl group-hover:scale-105 group-hover:bg-[#8D6613]">
                          {reelPreviewPlaying ? (
                            <Pause className="w-6 h-6 fill-current" />
                          ) : (
                            <Play className="w-6 h-6 fill-current ml-0.5" />
                          )}
                        </span>
                      </button>

                      {/* Animated Progress Bar */}
                      <div className="absolute bottom-3 left-3.5 right-3.5 z-[3] space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-[rgba(250,242,230,0.9)] tabular-nums">
                          <span>
                            {formatSeconds(
                              (reelPreviewProgress / 100) *
                                parseDurationSeconds(selectedPost.duration)
                            )}
                          </span>
                          <span>{selectedPost.duration || '0:24'}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[rgba(250,242,230,0.25)] overflow-hidden">
                          <div
                            className="h-full w-full origin-left bg-[#D8B467] will-change-transform transition-transform duration-100 ease-linear"
                            style={{ transform: `scaleX(${Math.min(1, Math.max(0, reelPreviewProgress / 100))})` }}
                          />
                        </div>
                      </div>
                    </div>
                    {selectedPost.embedUrl && (
                      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[#16110C] border-t border-[#2E2318] text-[11px] text-[#E6D6BE]">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Film className="w-3.5 h-3.5 text-[#D8B467]" />
                          <span>Poster Preview</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreferEmbedFallback(false)}
                          className="px-2.5 py-1 rounded-lg bg-[#2A2016] hover:bg-[#3A2C1E] border border-[#4D3B28] text-[#FAF2E6] font-semibold cursor-pointer"
                        >
                          Back to Live Embed
                        </button>
                      </div>
                    )}
                  </>
                ) : (selectedPost.thumbnailUrl || selectedPost.mediaUrl) && !failedImages[`live-${selectedPost.id}`] ? (
                  <div className="relative w-full aspect-[4/5] max-h-[64dvh] sm:max-h-[82dvh] mx-auto bg-[#0B0805] overflow-hidden flex items-center justify-center">
                    <img
                      src={resolvePostImage(selectedPost)}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-35"
                    />
                    <img
                      src={resolvePostImage(selectedPost)}
                      alt={selectedPost.caption}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="relative z-[1] w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="relative w-full aspect-[4/5] max-h-[64dvh] sm:max-h-[82dvh] mx-auto bg-[#0B0805] overflow-hidden flex items-center justify-center">
                    <OptimizedImage
                      imageKey={selectedPost.imageKey}
                      preset="full"
                      sizes="(max-width: 640px) 100vw, 440px"
                      alt={selectedPost.caption}
                      decoding="async"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Caption, Stats & Actions */}
              <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between gap-5 sm:overflow-y-auto">
                <div className="space-y-3">
                  <div className="hidden sm:flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider font-bold text-[#8D6613] dark:text-[#D8B467]">
                        {activeHandle} · {isVideoPost(selectedPost) ? 'Reel Video' : 'Photo'}
                      </span>
                      <h3
                        id="ig-lightbox-title"
                        className="font-luxury text-2xl font-bold text-[#14100B] dark:text-[#F0E6D8]"
                      >
                        {selectedPost.category}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPostIndex(null)}
                      aria-label="Close Instagram preview"
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#574939] dark:text-[#D4C5B3] hover:bg-[#E4D6C3] dark:hover:bg-[#2E2318] cursor-pointer shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-sm text-[#3B3126] dark:text-[#D4C5B3] leading-relaxed">
                    {selectedPost.caption}
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#574939] dark:text-[#C4B4A0] tabular-nums pt-1">
                    {isVideoPost(selectedPost) && typeof selectedPost.views === 'number' && (
                      <>
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Eye className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467]" />
                          {selectedPost.views.toLocaleString('en-IN')} views
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Heart className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467]" />
                      {selectedPost.likes} likes
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <MessageCircle className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467]" />
                      {selectedPost.comments} comments
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatPostDate(selectedPost.timestamp)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#C2AD93] dark:border-[#3D2F20] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPostIndex(
                          selectedPostIndex - 1 < 0
                            ? visiblePosts.length - 1
                            : selectedPostIndex - 1
                        )
                      }
                      aria-label="Previous post"
                      className="w-11 h-11 rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[#E4D6C3] dark:bg-[#120E0A] hover:border-[#8D6613] dark:hover:border-[#D8B467] flex items-center justify-center text-[#14100B] dark:text-[#F0E6D8] cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPostIndex(
                          selectedPostIndex + 1 >= visiblePosts.length
                            ? 0
                            : selectedPostIndex + 1
                        )
                      }
                      aria-label="Next post"
                      className="w-11 h-11 rounded-xl border border-[#C2AD93] dark:border-[#3D2F20] bg-[#E4D6C3] dark:bg-[#120E0A] hover:border-[#8D6613] dark:hover:border-[#D8B467] flex items-center justify-center text-[#14100B] dark:text-[#F0E6D8] cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <a
                    href={selectedPost.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider whitespace-nowrap shrink-0"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span>
                      {isVideoPost(selectedPost) ? 'Watch Reel' : 'Instagram'}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  );
};
