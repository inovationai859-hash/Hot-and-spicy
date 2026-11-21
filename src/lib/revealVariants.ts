import { Variants } from 'motion/react';

export const LUXURY_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const VIEWPORT_CONFIG = {
  once: true,
  amount: 'some' as const,
  margin: '0px 0px -32px 0px',
};

export function createStaggerContainer(
  staggerChildren = 0.07,
  delayChildren = 0.02,
  reduced = false
): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 1 },
      visible: { opacity: 1 },
    };
  }
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren,
        delayChildren,
      },
    },
  };
}

export function createRevealItem(
  options: {
    y?: number;
    x?: number;
    scale?: number;
    duration?: number;
    delay?: number;
    reduced?: boolean;
  } = {}
): Variants {
  const {
    y = 18,
    x = 0,
    scale = 1,
    duration = 0.46,
    delay = 0,
    reduced = false,
  } = options;

  if (reduced) {
    return {
      hidden: { opacity: 1, y: 0, x: 0, scale: 1 },
      visible: { opacity: 1, y: 0, x: 0, scale: 1 },
    };
  }

  return {
    hidden: {
      opacity: 0,
      y,
      x,
      scale,
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      transition: {
        duration,
        delay,
        ease: LUXURY_EASE,
      },
    },
  };
}
