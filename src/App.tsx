import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { AnimatePresence } from 'motion/react';
import Lenis from 'lenis';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { VideoHero } from './components/VideoHero';
import { Hero, ShowcaseTarget } from './components/Hero';
import { SectionDivider } from './components/SectionDivider';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { ScrollProgressBar } from './components/ScrollProgressBar';
import { PageLoader } from './components/PageLoader';
import { CustomErrorPage } from './components/CustomErrorPage';
import { InkTransitionHost } from './components/InkTransitionHost';
import { OrderDrawer } from './components/OrderDrawer';
import { LazyReveal } from './components/LazyReveal';
import { getTheme, THEME_CHANGE_EVENT } from './ink/theme';
import { ComboPack, CartItem } from './types';

// Lazy-load below-the-fold sections and modals so initial bundle parses & mounts rapidly
const BookMenu = lazy(() =>
  import('./components/BookMenu').then((m) => ({ default: m.BookMenu }))
);
const AboutSection = lazy(() =>
  import('./components/AboutSection').then((m) => ({ default: m.AboutSection }))
);
const GamingLounge = lazy(() =>
  import('./components/GamingLounge').then((m) => ({ default: m.GamingLounge }))
);
const LocationSection = lazy(() =>
  import('./components/LocationSection').then((m) => ({ default: m.LocationSection }))
);
const InstagramCarousel = lazy(() =>
  import('./components/InstagramCarousel').then((m) => ({ default: m.InstagramCarousel }))
);
const Footer = lazy(() =>
  import('./components/Footer').then((m) => ({ default: m.Footer }))
);
const SpicyBot = lazy(() =>
  import('./components/SpicyBot').then((m) => ({ default: m.SpicyBot }))
);
const BookingModal = lazy(() =>
  import('./components/BookingModal').then((m) => ({ default: m.BookingModal }))
);
const ComboCustomizerModal = lazy(() =>
  import('./components/ComboCustomizerModal').then((m) => ({ default: m.ComboCustomizerModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const ProfileModal = lazy(() =>
  import('./components/ProfileModal').then((m) => ({ default: m.ProfileModal }))
);
const AdminPortal = lazy(() =>
  import('./components/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);

function MainApp() {
  const { userProfile, dietaryPreference, updateDietaryPreference } = useAuth();
  const { showToast } = useToast();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getTheme());

  const [showPageLoader, setShowPageLoader] = useState(true);

  const [dialogLocked, setDialogLocked] = useState(false);

  const [invalidRoute, setInvalidRoute] = useState<boolean>(() => {
    try {
      const p = window.location.pathname || '/';
      return p !== '/' && p !== '/index.html';
    } catch {
      return false;
    }
  });

  const [role, setRole] = useState<'customer' | 'admin'>('customer');

  useEffect(() => {
    try {
      if (window.location.hash === '#admin') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
  }, []);

  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const onThemeChange = (e: Event) => {
      const next = (e as CustomEvent<{ theme?: 'light' | 'dark' }>).detail?.theme;
      if (next === 'light' || next === 'dark') {
        setTheme(next);
      } else {
        setTheme(getTheme());
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const p = window.location.pathname || '/';
      setInvalidRoute(p !== '/' && p !== '/index.html');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onDialogLock = (e: Event) => {
      const detail = (e as CustomEvent<{ locked?: boolean }>).detail;
      setDialogLocked(Boolean(detail?.locked));
    };
    window.addEventListener('hs:dialog-lock', onDialogLock as EventListener);
    return () => window.removeEventListener('hs:dialog-lock', onDialogLock as EventListener);
  }, []);

  // Buttery smooth 60/120fps inertial scrolling across the customer page only (disabled in Admin Portal so native scrolling works uninterrupted)
  const lenisLoopControlRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    if (role === 'admin') {
      delete document.documentElement.dataset.dialogOpen;
      document.body.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
      lenisRef.current = null;
      lenisLoopControlRef.current = null;
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const lenis = new Lenis({
      lerp: 0.115,
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.15,
      prevent: (node) =>
        Boolean(
          node.closest(
            '[data-lenis-prevent], [data-dialog-scroll], .chat-scroll-contain, [role="dialog"], input, textarea, select'
          )
        ),
    });

    lenisRef.current = lenis;
    let rafId = 0;

    const raf = (time: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    };

    const startRaf = () => {
      lenis.start();
      if (rafId === 0 && !document.hidden) {
        rafId = window.requestAnimationFrame(raf);
      }
    };

    const stopRaf = () => {
      lenis.stop();
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    lenisLoopControlRef.current = { start: startRaf, stop: stopRaf };

    if (showPageLoader || dialogLocked) {
      stopRaf();
    } else {
      startRaf();
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafId !== 0) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (!showPageLoader && !dialogLocked) {
        startRaf();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest('a[href^="#"]');
      if (!anchor) return;
      const hash = anchor.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.querySelector<HTMLElement>(hash);
      if (target) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -64, duration: 0.95 });
      }
    };

    document.addEventListener('click', onAnchorClick);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('click', onAnchorClick);
      stopRaf();
      lenis.destroy();
      lenisRef.current = null;
      lenisLoopControlRef.current = null;
    };
  }, [role]);

  useEffect(() => {
    const ctrl = lenisLoopControlRef.current;
    if (!ctrl || role === 'admin') return;
    if (showPageLoader || dialogLocked) {
      ctrl.stop();
    } else {
      ctrl.start();
    }
  }, [role, showPageLoader, dialogLocked]);

  const toggleTheme = (origin?: { x: number; y: number }) => {
    import('./ink/inkTransition').then(({ inkTransition }) => {
      inkTransition.toggle(origin);
    });
  };

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingMounted, setBookingMounted] = useState(false);
  const [bookingPrefillType, setBookingPrefillType] = useState<'ps5' | 'pool'>('ps5');
  const [bookingPrefillVoucherCode, setBookingPrefillVoucherCode] = useState<string | undefined>(undefined);
  const [customizerCombo, setCustomizerCombo] = useState<ComboPack | null>(null);
  const [customizerMounted, setCustomizerMounted] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);
  const [menuJumpRequest, setMenuJumpRequest] = useState<{
    pageIndex: number;
    itemId?: string;
    nonce: number;
  } | null>(null);
  const [gamingJumpRequest, setGamingJumpRequest] = useState<{
    station: 'pool' | 'ps5';
    nonce: number;
  } | null>(null);

  const handleOpenBooking = (
    type: 'dining' | 'ps5' | 'pool' = 'ps5',
    voucherCode?: string
  ) => {
    setBookingPrefillType(type === 'pool' ? 'pool' : 'ps5');
    setBookingPrefillVoucherCode(voucherCode);
    setBookingMounted(true);
    setBookingModalOpen(true);
  };

  const handleCloseBooking = () => {
    setBookingModalOpen(false);
    setBookingPrefillVoucherCode(undefined);
  };

  const handleAddItemFromBook = (item: {
    id: string;
    name: string;
    price: number;
    category: string;
    isVeg: boolean;
    description: string;
  }) => {
    const pseudoCombo: ComboPack = {
      id: item.id,
      name: item.name,
      tagline: item.category.toUpperCase(),
      price: item.price,
      spicyLevel: 2,
      category: 'asian',
      isVegAvailable: item.isVeg,
      items: [item.description],
      description: item.description,
      serves: '1-2 Persons',
      imageAlt: item.name,
    };

    setCartItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.combo.id === item.id);
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          combo: pseudoCombo,
          quantity: 1,
          variant: item.isVeg ? 'veg' : 'standard',
          drinkChoice: 'Complimentary Soft Drink',
        },
      ];
    });

    setCartOpen(true);
    showToast({
      variant: 'cart',
      title: `${item.name} added to bag`,
      description: !userProfile
        ? `₹${item.price} · Sign in inside cart to confirm order`
        : `₹${item.price} · Ready in your order bag`,
      action: {
        label: 'View Bag',
        onClick: () => {
          setCartOpen(true);
        },
      },
    });
  };

  const handleAddToCartFromCustomizer = (item: CartItem) => {
    setCartItems((prev) => [...prev, item]);
    setCartOpen(true);
    showToast({
      variant: 'cart',
      title: `${item.combo.name} added to bag`,
      description: !userProfile
        ? `Qty ${item.quantity} · ₹${item.combo.price * item.quantity} · Sign in to order`
        : `Qty ${item.quantity} · ₹${item.combo.price * item.quantity}`,
      action: {
        label: 'View Bag',
        onClick: () => {
          setCartOpen(true);
        },
      },
    });
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    setCartItems((prev) => {
      const copy = [...prev];
      copy[index].quantity = newQty;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const totalCartCount = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);

  const scrollToSection = (href: string) => {
    const el = document.querySelector<HTMLElement>(href);
    if (el) {
      if (lenisRef.current) {
        lenisRef.current.scrollTo(el, { offset: -64, duration: 1.1 });
      } else {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      el.focus({ preventScroll: true });
    }
  };

  const scrollToBookMenu = () => {
    scrollToSection('#book-menu');
  };

  const scrollToTop = () => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, prefersReduced ? { immediate: true } : { duration: 1.15 });
    } else {
      window.scrollTo({
        top: 0,
        behavior: prefersReduced ? 'auto' : 'smooth',
      });
    }
  };

  const handleSelectShowcase = (target: ShowcaseTarget) => {
    const nonce = Date.now();
    if (target.kind === 'menu') {
      setMenuJumpRequest({
        pageIndex: target.pageIndex,
        itemId: target.itemId,
        nonce,
      });
      scrollToSection('#book-menu');
      return;
    }

    setGamingJumpRequest({
      station: target.station,
      nonce,
    });
    const stationSelector = target.station === 'pool' ? '#gaming-pool' : '#gaming-ps5';
    const targetEl = document.querySelector<HTMLElement>(stationSelector)
      ? stationSelector
      : '#gaming';
    scrollToSection(targetEl);
  };

  const routeKey = invalidRoute ? '404' : role;

  if (invalidRoute) {
    return (
      <>
        <InkTransitionHost routeKey={routeKey} />
        <CustomErrorPage
          statusCode={404}
          onReset={() => {
            window.history.replaceState(null, '', '/');
            setInvalidRoute(false);
          }}
        />
      </>
    );
  }

  if (role === 'admin') {
    return (
      <>
        <InkTransitionHost routeKey={routeKey} />
        <Suspense fallback={null}>
          <AdminPortal
            onSwitchToCustomer={() => {
              try {
                if (window.location.hash === '#admin') {
                  window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
              } catch {}
              setRole('customer');
            }}
          />
        </Suspense>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4D6C3] dark:bg-[#120E0A] text-[#14100B] dark:text-[#F0E6D8] flex flex-col relative selection:bg-[rgba(141,102,19,0.2)] selection:text-[#14100B] dark:selection:text-[#F0E6D8]">
      <InkTransitionHost routeKey={routeKey} />

      <AnimatePresence>
        {showPageLoader && (
          <PageLoader onComplete={() => setShowPageLoader(false)} />
        )}
      </AnimatePresence>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-[#8D6613] focus:text-[#FAF2E6] focus:text-xs focus:font-bold focus:uppercase focus:tracking-wider focus:shadow-xl"
      >
        Skip to main content
      </a>

      <ScrollProgressBar hidden={showPageLoader} />

      <Navbar
        onOpenBooking={handleOpenBooking}
        cartCount={totalCartCount}
        onOpenCart={() => {
          setCartOpen(true);
        }}
        onOpenProfile={() => {
          setProfileMounted(true);
          setProfileModalOpen(true);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        dietaryPreference={dietaryPreference}
        onChangeDietaryPreference={updateDietaryPreference}
        onNavigateSection={scrollToSection}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <VideoHero
          onExploreMenu={scrollToBookMenu}
          onOpenBooking={handleOpenBooking}
          onScrollToShowcase={() => scrollToSection('#showcase')}
          isReady={!showPageLoader}
        />

        <Hero
          onOpenBooking={handleOpenBooking}
          onExploreMenu={scrollToBookMenu}
          onSelectShowcase={handleSelectShowcase}
        />

        <LazyReveal className="relative z-20" minHeightClass="min-h-[420px]">
          <BookMenu
            onAddItem={handleAddItemFromBook}
            jumpRequest={menuJumpRequest}
            dietaryPreference={dietaryPreference}
            onChangeDietaryPreference={updateDietaryPreference}
          />
        </LazyReveal>

        <div className="relative z-20 bg-[#E4D6C3] dark:bg-[#120E0A]">
          <SectionDivider />

          <LazyReveal minHeightClass="min-h-[280px]">
            <AboutSection />
          </LazyReveal>

          <SectionDivider />

          <LazyReveal minHeightClass="min-h-[420px]">
            <GamingLounge
              onOpenBooking={handleOpenBooking}
              highlightedStation={gamingJumpRequest}
            />
          </LazyReveal>

          <SectionDivider />

          <LazyReveal minHeightClass="min-h-[360px]">
            <LocationSection />
          </LazyReveal>

          <SectionDivider />

          <LazyReveal minHeightClass="min-h-[360px]">
            <InstagramCarousel />
          </LazyReveal>
        </div>
      </main>

      <LazyReveal minHeightClass="min-h-[240px]">
        <Footer
          onOpenBooking={() => handleOpenBooking('ps5')}
          onOpenAdmin={() => {
            try {
              window.scrollTo({ top: 0, behavior: 'auto' });
            } catch {}
            setRole('admin');
          }}
        />
      </LazyReveal>

      <WhatsAppFloatingButton />
      <ScrollToTopButton
        onScrollToTop={scrollToTop}
        hidden={showPageLoader || dialogLocked}
      />
      <Suspense fallback={null}>
        <SpicyBot onOpenBooking={handleOpenBooking} />
      </Suspense>

      <OrderDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      <Suspense fallback={null}>
        {bookingMounted && (
          <BookingModal
            isOpen={bookingModalOpen}
            onClose={handleCloseBooking}
            prefillType={bookingPrefillType}
            prefillVoucherCode={bookingPrefillVoucherCode}
          />
        )}

        {(customizerMounted || Boolean(customizerCombo)) && (
          <ComboCustomizerModal
            combo={customizerCombo}
            onClose={() => {
              setCustomizerMounted(true);
              setCustomizerCombo(null);
            }}
            onAddToCart={handleAddToCartFromCustomizer}
          />
        )}

        <AuthModal />

        {profileMounted && (
          <ProfileModal
            isOpen={profileModalOpen}
            onClose={() => setProfileModalOpen(false)}
            onUseRewardForBooking={(bookingType, voucherCode) => {
              setProfileModalOpen(false);
              handleOpenBooking(bookingType, voucherCode);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <ToastProvider>
          <MainApp />
        </ToastProvider>
      </CatalogProvider>
    </AuthProvider>
  );
}
