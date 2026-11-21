import React, { Suspense, useEffect, useRef, useState } from 'react';

interface LazyRevealProps {
  children: React.ReactNode;
  className?: string;
  minHeightClass?: string;
}

export const LazyReveal: React.FC<LazyRevealProps> = ({
  children,
  className = '',
  minHeightClass = 'min-h-[160px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  useEffect(() => {
    if (visible) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    let rafId = 0;
    const reveal = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        setVisible(true);
      });
    };

    const rect = node.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.96 && rect.bottom >= 0) {
      reveal();
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight * 0.92) {
            reveal();
            observer.disconnect();
            break;
          }
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -24px 0px',
        threshold: 0.02,
      }
    );

    observer.observe(node);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [visible]);

  return (
    <div
      ref={containerRef}
      data-ink-reveal="true"
      data-visible={visible ? 'true' : 'false'}
      className={`lazy-reveal ${className}`}
    >
      <Suspense fallback={<div aria-hidden="true" className={minHeightClass} />}>
        {children}
      </Suspense>
    </div>
  );
};
