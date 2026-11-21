import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  onScrollToTop: () => void;
  hidden?: boolean;
}

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  onScrollToTop,
  hidden = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    let debounceTimer = 0;
    let rafId = 0;
    let lastCheckedAt = 0;
    let observer: IntersectionObserver | null = null;

    const heroEl = document.getElementById('home');

    const updateFromScroll = () => {
      rafId = 0;
      const now = performance.now();
      if (now - lastCheckedAt < 80) return;
      lastCheckedAt = now;
      const threshold = Math.max(480, window.innerHeight * 0.88);
      setIsVisible(window.scrollY > threshold);
    };

    const throttledScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateFromScroll);
    };

    if (heroEl && typeof IntersectionObserver !== 'undefined') {
      // Root margin triggers shortly before hero scrolls fully past the sticky navbar (80px)
      observer = new IntersectionObserver(
        (entries) => {
          window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            const heroVisible = entries.some((entry) => entry.isIntersecting);
            setIsVisible(!heroVisible);
          }, 80);
        },
        { rootMargin: '-80px 0px 0px 0px', threshold: 0.01 }
      );
      observer.observe(heroEl);
    } else {
      updateFromScroll();
      window.addEventListener('scroll', throttledScroll, { passive: true });
    }

    const onResize = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!observer) updateFromScroll();
      }, 150);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      window.clearTimeout(debounceTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('scroll', throttledScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const shouldRender = isVisible && !hidden;

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.button
          key="scroll-to-top-btn"
          data-ink-live="true"
          type="button"
          onClick={onScrollToTop}
          aria-label="Scroll to top"
          title="Scroll to top"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.88 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.88 }}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.06, y: -2 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="group fixed bottom-[76px] right-3.5 sm:bottom-[88px] sm:right-6 z-[1001] flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#FAF2E6] dark:bg-[#1F1710] text-[#14100B] dark:text-[#FAF2E6] border border-[rgba(141,102,19,0.55)] dark:border-[rgba(216,180,103,0.45)] hover:bg-[#14100B] hover:text-[#D8B467] hover:border-[#8D6613] dark:hover:bg-[#8D6613] dark:hover:text-[#FAF2E6] dark:hover:border-[#D8B467] shadow-[0_10px_28px_-6px_rgba(20,16,11,0.38)] will-change-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8D6613] dark:focus-visible:ring-[#D8B467] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E4D6C3] dark:focus-visible:ring-offset-[#120E0A]"
        >
          <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};
