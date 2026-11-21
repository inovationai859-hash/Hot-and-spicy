import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { HeartHandshake, UtensilsCrossed, Gamepad2 } from 'lucide-react';
import {
  VIEWPORT_CONFIG,
  createStaggerContainer,
  createRevealItem,
} from '../lib/revealVariants';

export const AboutSection: React.FC = () => {
  const prefersReduced = useReducedMotion() ?? false;

  const headerContainer = createStaggerContainer(0.09, 0.02, prefersReduced);
  const headerItem = createRevealItem({ y: 20, duration: 0.55, reduced: prefersReduced });
  const gridContainer = createStaggerContainer(0.12, 0.08, prefersReduced);
  const cardItem = createRevealItem({ y: 28, scale: 0.97, duration: 0.58, reduced: prefersReduced });

  const pillars = [
    {
      icon: HeartHandshake,
      title: 'Polite & Attentive Staff',
      description:
        'Unhurried table service for families, friends, and gaming groups.',
    },
    {
      icon: UtensilsCrossed,
      title: 'Cooked Fresh to Order',
      description:
        'Charcoal tandoor, wok noodles, and stone-baked pizzas made fresh.',
    },
    {
      icon: Gamepad2,
      title: 'Fair-Play Lounge',
      description:
        'Sanitized DualSense gear, tournament slate felt, and table refreshments.',
    },
  ];

  return (
    <section
      id="about"
      className="py-16 sm:py-20 bg-[#E4D6C3] dark:bg-[#120E0A] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Concise Editorial Intro */}
        <motion.div
          data-ink-reveal="true"
          variants={headerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="max-w-3xl space-y-2 mb-10 sm:mb-12"
        >
          <motion.div
            variants={headerItem}
            className="text-xs uppercase tracking-[0.16em] font-semibold text-[#5C4008] dark:text-[#D8B467]"
          >
            About Us
          </motion.div>
          <motion.h2
            variants={headerItem}
            className="font-luxury text-3xl min-[380px]:text-4xl sm:text-5xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] leading-tight text-balance"
          >
            Honest Food, Courteous People &amp; Focused Play
          </motion.h2>
        </motion.div>

        {/* Three Clean Pillars */}
        <motion.div
          data-ink-reveal="true"
          variants={gridContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <motion.article
                key={pillar.title}
                data-ink-reveal="true"
                variants={cardItem}
                whileHover={prefersReduced ? undefined : { y: -6, scale: 1.01 }}
                className="group p-6 sm:p-7 rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border border-[rgba(194,173,147,0.9)] dark:border-[rgba(61,47,32,0.9)] hover:border-[rgba(141,102,19,0.8)] dark:hover:border-[rgba(216,180,103,0.7)] flex flex-col justify-between space-y-4 shadow-sm hover:shadow-xl will-change-transform"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8D6613] flex items-center justify-center text-[#FAF2E6] shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-softline text-xl sm:text-2xl font-bold text-[#14100B] dark:text-[#F0E6D8] group-hover:text-[#8D6613] dark:group-hover:text-[#D8B467]">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#3B3126] dark:text-[#D4C5B3] leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};
