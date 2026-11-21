import { useEffect, useRef, RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let activeDialogCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverscroll = '';
const openDialogStack: symbol[] = [];

function notifyDialogScrollLock(locked: boolean) {
  try {
    window.dispatchEvent(
      new CustomEvent('hs:dialog-lock', { detail: { locked } })
    );
  } catch {}
}

export function scrollFocusedInputIntoView(e: React.FocusEvent<HTMLElement>) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
  window.setTimeout(() => {
    try {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {}
  }, 140);
}

export function useDialogKeyboard(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const dialogToken = Symbol('dialog');
    openDialogStack.push(dialogToken);

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (activeDialogCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      savedHtmlOverscroll = document.documentElement.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      document.documentElement.dataset.dialogOpen = 'true';
      notifyDialogScrollLock(true);
    }
    activeDialogCount += 1;

    // Focus the dialog container without scrolling or hijacking typed inputs
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const active = document.activeElement;
      if (active && container.contains(active)) return;
      container.focus({ preventScroll: true });
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (openDialogStack[openDialogStack.length - 1] !== dialogToken) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const container = containerRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);

        if (focusables.length === 0) {
          e.preventDefault();
          container.focus({ preventScroll: true });
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);

      const idx = openDialogStack.lastIndexOf(dialogToken);
      if (idx !== -1) openDialogStack.splice(idx, 1);

      activeDialogCount = Math.max(0, activeDialogCount - 1);
      if (activeDialogCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.documentElement.style.overscrollBehavior = savedHtmlOverscroll;
        delete document.documentElement.dataset.dialogOpen;
        notifyDialogScrollLock(false);
      }

      if (
        previouslyFocused &&
        document.contains(previouslyFocused) &&
        typeof previouslyFocused.focus === 'function'
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen, containerRef]);
}
