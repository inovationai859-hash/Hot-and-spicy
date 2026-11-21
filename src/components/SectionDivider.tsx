import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LUXURY_EASE, VIEWPORT_CONFIG } from '../lib/revealVariants';
import { getDividerLinePng } from '../ink/snapshotAssets';

export const SectionDivider: React.FC = () => {
  const prefersReduced = useReducedMotion() ?? false;

  const ltrLight = useMemo(() => getDividerLinePng('ltr', 141, 102, 19, 0.78, 96), []);
  const rtlLight = useMemo(() => getDividerLinePng('rtl', 141, 102, 19, 0.78, 96), []);
  const ltrDark = useMemo(() => getDividerLinePng('ltr', 216, 180, 103, 0.75, 96), []);
  const rtlDark = useMemo(() => getDividerLinePng('rtl', 216, 180, 103, 0.75, 96), []);

  return (
    <div
      aria-hidden="true"
      className="relative w-full h-0 z-20 pointer-events-none select-none"
    >
      {/* Subtle full-width espresso hairline base */}
      <div className="absolute inset-x-0 top-0 h-px bg-[rgba(61,47,32,0.15)] dark:bg-[rgba(61,47,32,0.7)]" />

      {/* Centered bronze & espresso tapered ornament using snapshot-identical PNG hairlines */}
      <motion.div
        data-ink-reveal="true"
        initial={prefersReduced ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0.45 }}
        whileInView={{ opacity: 1, scaleX: 1 }}
        viewport={VIEWPORT_CONFIG}
        transition={{ duration: 0.7, ease: LUXURY_EASE }}
        className="absolute inset-x-0 top-0 -translate-y-1/2 max-w-6xl mx-auto px-6 sm:px-10 flex items-center justify-center gap-3 origin-center will-change-transform"
      >
        <div className="h-px flex-1 overflow-hidden">
          {ltrLight && (
            <>
              <img src={ltrLight} alt="" className="dark:hidden w-full h-px object-fill" />
              <img src={ltrDark} alt="" className="hidden dark:block w-full h-px object-fill" />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2.5 h-px bg-[rgba(141,102,19,0.65)] dark:bg-[#8D6613]" />
          <span className="w-2 h-2 rotate-45 border border-[#8D6613] dark:border-[rgba(216,180,103,0.85)] bg-[#E4D6C3] dark:bg-[#120E0A]" />
          <span className="w-2.5 h-px bg-[rgba(141,102,19,0.65)] dark:bg-[#8D6613]" />
        </div>

        <div className="h-px flex-1 overflow-hidden">
          {rtlLight && (
            <>
              <img src={rtlLight} alt="" className="dark:hidden w-full h-px object-fill" />
              <img src={rtlDark} alt="" className="hidden dark:block w-full h-px object-fill" />
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
