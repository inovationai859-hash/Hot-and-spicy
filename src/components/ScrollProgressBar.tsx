import React from 'react';
import { motion, useScroll, useSpring, useReducedMotion } from 'motion/react';

interface ScrollProgressBarProps {
  hidden?: boolean;
}

export const ScrollProgressBar: React.FC<ScrollProgressBarProps> = ({ hidden = false }) => {
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 300,
    damping: 36,
    restDelta: 0.002,
  });

  if (hidden) return null;

  return (
    <div
      data-ink-live="true"
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[1001] h-[2px] pointer-events-none bg-transparent"
    >
      <motion.div
        className="h-full w-full origin-left bg-[#8D6613] dark:bg-[#D8B467] will-change-transform"
        style={{ scaleX: prefersReduced ? scrollYProgress : smoothProgress }}
      />
    </div>
  );
};
