import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Menu,
  X,
  User,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { DietaryPreference } from '../types';

interface NavbarProps {
  onOpenBooking: (prefillType?: 'dining' | 'ps5' | 'pool') => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: (origin?: { x: number; y: number }) => void;
  dietaryPreference: DietaryPreference;
  onChangeDietaryPreference: (pref: DietaryPreference) => void;
  onNavigateSection?: (href: string) => void;
}

const DIETARY_OPTIONS: ReadonlyArray<{
  value: DietaryPreference;
  label: string;
  shortLabel: string;
  title: string;
}> = [
  { value: 'all', label: 'All', shortLabel: 'All', title: 'Show all menu dishes' },
  { value: 'veg', label: 'Veg', shortLabel: 'Veg', title: 'Show Pure Veg dishes only' },
  { value: 'non-veg', label: 'Non-Veg', shortLabel: 'Non-Veg', title: 'Show Non-Veg dishes only' },
];

/**
 * Memoized static 24x24 sun/moon vector with circle body + 8 ray lines.
 * GSAP MorphSVGPlugin converts the circle and morphs it directly without React overwriting DOM state.
 */
const ThemeToggleSvg = React.memo(
  function ThemeToggleSvg() {
    const rays: Array<[number, number, number, number]> = [
      [12, 2.2, 12, 4.4],
      [12, 19.6, 12, 21.8],
      [2.2, 12, 4.4, 12],
      [19.6, 12, 21.8, 12],
      [5.07, 5.07, 6.63, 6.63],
      [17.37, 17.37, 18.93, 18.93],
      [18.93, 5.07, 17.37, 6.63],
      [6.63, 17.37, 5.07, 18.93],
    ];
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="w-5 h-5 pointer-events-none"
      >
        <circle
          data-ink-sun-body="true"
          cx="12"
          cy="12"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {rays.map(([x1, y1, x2, y2], idx) => (
          <line
            key={idx}
            data-ink-ray="true"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        ))}
      </svg>
    );
  },
  () => true
);

export const Navbar: React.FC<NavbarProps> = ({
  onOpenBooking,
  cartCount,
  onOpenCart,
  onOpenProfile,
  theme,
  onToggleTheme,
  dietaryPreference,
  onChangeDietaryPreference,
  onNavigateSection,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const { user, userProfile, openAuthModal } = useAuth();

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileMenuOpen(false);
        mobileToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'Menu', href: '#book-menu' },
    { label: 'About', href: '#about' },
    { label: 'Gaming', href: '#gaming' },
    { label: 'Location', href: '#location' },
  ];

  const handleThemeTrigger = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isKeyboardActivation = e.detail === 0;
    onToggleTheme({
      x: isKeyboardActivation ? rect.left + rect.width / 2 : e.clientX || rect.left + rect.width / 2,
      y: isKeyboardActivation ? rect.top + rect.height / 2 : e.clientY || rect.top + rect.height / 2,
    });
  };

  const handleDrawerThemeTrigger = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMobileMenuOpen(false);
    onToggleTheme({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    if (onNavigateSection) {
      onNavigateSection(href);
      return;
    }
    const element = document.querySelector<HTMLElement>(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      element.focus({ preventScroll: true });
    }
  };

  const cycleDietaryPreference = () => {
    const order: DietaryPreference[] = ['all', 'veg', 'non-veg'];
    const next = order[(order.indexOf(dietaryPreference) + 1) % order.length];
    onChangeDietaryPreference(next);
  };

  return (
    <header
      data-ink-live="true"
      className="fixed top-0 left-0 right-0 z-[1001] bg-[#E4D6C3] dark:bg-[#120E0A] border-b border-[#C2AD93] dark:border-[#3D2F20]"
    >
      <div className="max-w-7xl mx-auto px-2 min-[375px]:px-3.5 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-1.5 min-[375px]:gap-2 sm:gap-4">
        {/* Zone 1: Clean Single-Line Single-Color Brand Wordmark */}
        <motion.a
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          href="#home"
          className="font-brand text-[15px] min-[375px]:text-[17px] sm:text-2xl font-extrabold tracking-tight text-[#14100B] dark:text-[#F0E6D8] hover:text-[#8D6613] dark:hover:text-[#D8B467] whitespace-nowrap shrink-0"
        >
          Hot &amp; Spicy
        </motion.a>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-8 text-sm font-semibold text-[#3B3126] dark:text-[#D4C5B3]">
          {navLinks.map((link) => (
            <motion.button
              key={link.label}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleNavClick(link.href)}
              className="nav-link-trigger relative hover:text-[#8D6613] dark:hover:text-[#D8B467] whitespace-nowrap shrink-0 py-2 cursor-pointer"
            >
              <span>{link.label}</span>
              <span
                aria-hidden="true"
                className="nav-link-bar absolute left-0 right-0 bottom-1 h-[1.5px] bg-[#8D6613] dark:bg-[#D8B467] pointer-events-none"
              />
            </motion.button>
          ))}
        </nav>

        {/* Zone 3: Global Dietary Toggle, Theme Toggle, Account, Bag & Primary Bronze CTA */}
        <div className="flex items-center gap-1 min-[390px]:gap-1.5 sm:gap-2 shrink-0">
          {/* Desktop / Tablet Segmented Dietary Preference Toggle */}
          <div
            role="radiogroup"
            aria-label="Global menu dietary preference"
            className="hidden md:inline-flex items-center p-0.5 rounded-lg bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] shrink-0"
          >
            {DIETARY_OPTIONS.map((opt) => {
              const isActive = dietaryPreference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  title={opt.title}
                  onClick={() => onChangeDietaryPreference(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[34px] rounded-md text-[11px] font-bold tracking-tight whitespace-nowrap cursor-pointer ${
                    isActive
                      ? opt.value === 'veg'
                        ? 'bg-emerald-700 text-[#FFFFFF] shadow-sm'
                        : opt.value === 'non-veg'
                        ? 'bg-rose-800 text-[#FFFFFF] shadow-sm'
                        : 'bg-[#8D6613] text-[#FAF2E6] shadow-sm'
                      : 'text-[#3B3126] dark:text-[#D4C5B3] hover:text-[#14100B] dark:hover:text-[#F0E6D8]'
                  }`}
                >
                  {opt.value === 'veg' && (
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full border ${
                        isActive
                          ? 'bg-emerald-300 border-[#FFFFFF]'
                          : 'bg-emerald-600 border-emerald-800 dark:bg-emerald-400 dark:border-emerald-200'
                      }`}
                    />
                  )}
                  {opt.value === 'non-veg' && (
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full border ${
                        isActive
                          ? 'bg-rose-300 border-[#FFFFFF]'
                          : 'bg-rose-600 border-rose-900 dark:bg-rose-400 dark:border-rose-200'
                      }`}
                    />
                  )}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Compact Dietary Filter Cycler */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={cycleDietaryPreference}
            aria-label={`Dietary filter: ${
              dietaryPreference === 'veg'
                ? 'Veg only'
                : dietaryPreference === 'non-veg'
                ? 'Non-Veg only'
                : 'All dishes'
            }. Tap to switch.`}
            title="Switch menu filter: All / Veg / Non-Veg"
            className={`md:hidden inline-flex items-center justify-center gap-1 min-w-[34px] min-[375px]:min-w-[40px] min-h-[38px] min-[375px]:min-h-[40px] px-1.5 min-[375px]:px-2.5 rounded-lg border text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer ${
              dietaryPreference === 'veg'
                ? 'bg-emerald-700 border-emerald-800 text-[#FFFFFF]'
                : dietaryPreference === 'non-veg'
                ? 'bg-rose-800 border-rose-900 text-[#FFFFFF]'
                : 'bg-[#EFE5D6] dark:bg-[#1F1710] border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8]'
            }`}
          >
            {dietaryPreference !== 'all' && (
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full border shrink-0 ${
                  dietaryPreference === 'veg'
                    ? 'bg-emerald-300 border-[#FFFFFF]'
                    : 'bg-rose-300 border-[#FFFFFF]'
                }`}
              />
            )}
            <span>
              {dietaryPreference === 'veg' ? (
                'Veg'
              ) : dietaryPreference === 'non-veg' ? (
                <>
                  <span className="min-[410px]:hidden">NV</span>
                  <span className="hidden min-[410px]:inline">Non-Veg</span>
                </>
              ) : (
                'All'
              )}
            </span>
          </motion.button>

          {/* Live WebGL2 Ink-Bleed Light/Dark Theme Toggle */}
          <button
            id="theme-toggle"
            type="button"
            data-ink-live="true"
            onClick={handleThemeTrigger}
            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Light mode (T)' : 'Dark mode (T)'}
            className="relative z-[1001] min-w-[36px] min-[375px]:min-w-[40px] min-h-[38px] min-[375px]:min-h-[40px] flex items-center justify-center rounded-full border shrink-0 cursor-pointer"
          >
            <ThemeToggleSvg />
          </button>

          {user || userProfile ? (
            <motion.button
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={onOpenProfile}
              aria-label="User Account"
              className="inline-flex items-center justify-center gap-1.5 min-w-[36px] min-[375px]:min-w-[40px] min-h-[38px] min-[375px]:min-h-[40px] px-1.5 md:px-2.5 rounded-lg bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] hover:border-[#8D6613] dark:hover:border-[#D8B467] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-[#8D6613] flex items-center justify-center text-[10px] font-bold text-[#FAF2E6] shrink-0">
                {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="hidden md:inline-block font-condensed text-xs font-bold tracking-normal max-w-[68px] truncate">
                {userProfile?.name?.split(' ')[0] || 'Account'}
              </span>
              {userProfile?.is18Plus && (
                <ShieldCheck className="w-3 h-3 text-[#8D6613] dark:text-[#D8B467] hidden lg:block" />
              )}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => openAuthModal('signin')}
              aria-label="Sign In"
              className="inline-flex items-center justify-center gap-1 min-w-[36px] min-[375px]:min-w-[40px] md:px-2.5 min-h-[38px] min-[375px]:min-h-[40px] rounded-lg bg-[#EFE5D6] md:bg-transparent dark:bg-[#1F1710] md:dark:bg-transparent border border-[#C2AD93] md:border-transparent dark:border-[#3D2F20] md:dark:border-transparent text-[#14100B] dark:text-[#F0E6D8] hover:text-[#8D6613] dark:hover:text-[#D8B467] font-condensed text-xs uppercase tracking-tight font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span className="hidden md:inline">Sign In</span>
            </motion.button>
          )}

          {/* Order Bag */}
          <motion.button
            whileHover={{ y: -1, scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onOpenCart}
            aria-label="View Order Bag"
            className="relative min-w-[36px] min-[375px]:min-w-[40px] min-h-[38px] min-[375px]:min-h-[40px] flex items-center justify-center rounded-lg bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] hover:border-[#8D6613] dark:hover:border-[#D8B467] shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4 text-[#14100B] dark:text-[#F0E6D8]" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#8D6613] text-[#FAF2E6] text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#E4D6C3] dark:border-[#120E0A] tabular-nums">
                {cartCount}
              </span>
            )}
          </motion.button>

          {/* Primary Bronze Action */}
          <motion.button
            whileHover={{ y: -1.5, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => onOpenBooking()}
            className="hidden md:inline-flex items-center justify-center px-3 min-h-[40px] rounded-lg bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-condensed text-xs uppercase tracking-tight font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Book Slot
          </motion.button>

          {/* Mobile Menu Toggle */}
          <motion.button
            ref={mobileToggleRef}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-w-[36px] min-[375px]:min-w-[40px] min-h-[38px] min-[375px]:min-h-[40px] flex items-center justify-center rounded-lg bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] hover:border-[#8D6613] dark:hover:border-[#D8B467] shrink-0 cursor-pointer"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      {/* Animated Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-nav-drawer"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain bg-[#E4D6C3] dark:bg-[#120E0A] border-b border-[#C2AD93] dark:border-[#3D2F20] px-4 sm:px-6 py-4 flex flex-col gap-1 will-change-transform"
          >
            {navLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => handleNavClick(link.href)}
                className="text-left text-sm font-semibold text-[#14100B] dark:text-[#F0E6D8] hover:text-[#8D6613] dark:hover:text-[#D8B467] min-h-[44px] flex items-center border-b border-[#C2AD93] dark:border-[#3D2F20] cursor-pointer"
              >
                {link.label}
              </button>
            ))}

            {/* Dietary Preference Control inside Mobile Drawer */}
            <div className="flex items-center justify-between gap-3 min-h-[48px] border-b border-[#C2AD93] dark:border-[#3D2F20] py-2">
              <span className="text-sm font-semibold text-[#14100B] dark:text-[#F0E6D8]">
                Dietary Preference
              </span>
              <div
                role="radiogroup"
                aria-label="Dietary preference"
                className="inline-flex items-center p-0.5 rounded-lg bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20]"
              >
                {DIETARY_OPTIONS.map((opt) => {
                  const isActive = dietaryPreference === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onChangeDietaryPreference(opt.value)}
                      className={`inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-md text-xs font-bold cursor-pointer ${
                        isActive
                          ? opt.value === 'veg'
                            ? 'bg-emerald-700 text-[#FFFFFF]'
                            : opt.value === 'non-veg'
                            ? 'bg-rose-800 text-[#FFFFFF]'
                            : 'bg-[#8D6613] text-[#FAF2E6]'
                          : 'text-[#3B3126] dark:text-[#D4C5B3]'
                      }`}
                    >
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Appearance Toggle Switch inside Mobile Drawer */}
            <button
              type="button"
              onClick={handleDrawerThemeTrigger}
              aria-pressed={theme === 'dark'}
              className="text-left text-sm font-semibold text-[#14100B] dark:text-[#F0E6D8] hover:text-[#8D6613] dark:hover:text-[#D8B467] min-h-[48px] flex items-center justify-between border-b border-[#C2AD93] dark:border-[#3D2F20] cursor-pointer"
            >
              <span>Appearance</span>
              <span className="inline-flex items-center gap-2.5 text-xs font-bold text-[#5C4008] dark:text-[#D8B467]">
                <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                <span className="relative w-12 h-6 rounded-full p-0.5 bg-[#D3C1AA] dark:bg-[#2E2318] border border-[#C2AD93] dark:border-[#3D2F20] inline-flex items-center">
                  <motion.span
                    animate={{ x: theme === 'dark' ? 24 : 0 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                    className="w-5 h-5 rounded-full bg-[#8D6613] dark:bg-[#D8B467] text-[#FAF2E6] dark:text-[#14100B] flex items-center justify-center shadow-sm"
                  >
                    {theme === 'dark' ? (
                      <Moon className="w-3 h-3" />
                    ) : (
                      <Sun className="w-3 h-3" />
                    )}
                  </motion.span>
                </span>
              </span>
            </button>

            <div className="pt-3 flex flex-col sm:flex-row gap-2.5">
              {!(user || userProfile) && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('signin');
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] font-semibold text-xs uppercase tracking-wider text-center cursor-pointer"
                >
                  Sign In / Create Account
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenBooking('ps5');
                }}
                className="w-full min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider text-center cursor-pointer"
              >
                Book Gaming Slot
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
