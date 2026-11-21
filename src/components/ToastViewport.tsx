import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ShoppingBag,
  CalendarCheck2,
  CheckCircle2,
  Info,
  AlertCircle,
  X,
} from 'lucide-react';
import type { ToastRecord, ToastVariant } from '../context/ToastContext';

interface ToastItemProps {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
  reducedMotion: boolean;
}

const VARIANT_META: Record<
  ToastVariant,
  {
    Icon: React.FC<{ className?: string }>;
    badgeClass: string;
    barClass: string;
    borderClass: string;
  }
> = {
  cart: {
    Icon: ShoppingBag,
    badgeClass: 'bg-[#8D6613] text-[#FAF2E6]',
    barClass: 'bg-[#8D6613] dark:bg-[#D8B467]',
    borderClass: 'border-[rgba(141,102,19,0.45)] dark:border-[rgba(216,180,103,0.45)]',
  },
  booking: {
    Icon: CalendarCheck2,
    badgeClass: 'bg-emerald-700 text-[#FFFFFF]',
    barClass: 'bg-emerald-600 dark:bg-emerald-400',
    borderClass: 'border-[rgba(4,120,87,0.4)] dark:border-[rgba(16,185,129,0.4)]',
  },
  success: {
    Icon: CheckCircle2,
    badgeClass: 'bg-emerald-700 text-[#FFFFFF]',
    barClass: 'bg-emerald-600 dark:bg-emerald-400',
    borderClass: 'border-[rgba(4,120,87,0.4)] dark:border-[rgba(16,185,129,0.4)]',
  },
  info: {
    Icon: Info,
    badgeClass: 'bg-[#14100B] dark:bg-[#D8B467] text-[#FAF2E6] dark:text-[#14100B]',
    barClass: 'bg-[#8D6613] dark:bg-[#D8B467]',
    borderClass: 'border-[#C2AD93] dark:border-[#3D2F20]',
  },
  error: {
    Icon: AlertCircle,
    badgeClass: 'bg-red-700 text-[#FFFFFF]',
    barClass: 'bg-red-600 dark:bg-red-400',
    borderClass: 'border-[rgba(185,28,28,0.45)] dark:border-[rgba(239,68,68,0.45)]',
  },
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, reducedMotion }) => {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.durationMs, onDismiss]);

  const { Icon, badgeClass, barClass, borderClass } = VARIANT_META[toast.variant];

  return (
    <motion.div
      layout
      role={toast.variant === 'error' ? 'alert' : 'status'}
      initial={
        reducedMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -18, scale: 0.94 }
      }
      animate={
        reducedMotion
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      exit={
        reducedMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -14, scale: 0.94 }
      }
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 30,
        mass: 0.85,
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-2xl bg-[#EFE5D6] dark:bg-[#1B140E] border ${borderClass} shadow-[0_18px_40px_-14px_rgba(20,16,11,0.35)] dark:shadow-[0_20px_44px_-14px_rgba(0,0,0,0.75)] text-[#14100B] dark:text-[#F0E6D8]`}
    >
      <div className="p-3.5 pr-3 flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-xs ${badgeClass}`}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-xs sm:text-[13px] font-bold leading-snug text-[#14100B] dark:text-[#F0E6D8]">
            {toast.title}
          </div>
          {toast.description && (
            <p className="text-[11px] sm:text-xs text-[#3B3126] dark:text-[#D4C5B3] mt-0.5 leading-snug">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#14100B] dark:bg-[#D8B467] text-[#FAF2E6] dark:text-[#14100B] text-[11px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[#5E5042] dark:text-[#B5A490] hover:bg-[#DFD0BC] dark:hover:bg-[#2C2117] hover:text-[#14100B] dark:hover:text-[#F0E6D8] cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Smooth auto-dismiss progress hairline */}
      {!paused && !reducedMotion && (
        <motion.div
          key={`bar-${toast.id}`}
          aria-hidden="true"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
          className={`h-[2px] w-full origin-left ${barClass}`}
        />
      )}
    </motion.div>
  );
};

interface ToastViewportProps {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}

export const ToastViewport: React.FC<ToastViewportProps> = ({ toasts, onDismiss }) => {
  const prefersReduced = useReducedMotion() ?? false;

  return (
    <div
      data-ink-live="true"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed top-[74px] sm:top-[84px] left-3 right-3 sm:left-auto sm:right-6 z-[1001] flex flex-col gap-2.5 sm:w-[360px]"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
            reducedMotion={prefersReduced}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
