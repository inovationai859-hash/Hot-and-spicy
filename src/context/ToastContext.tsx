import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ToastViewport } from '../components/ToastViewport';
import { useAuth } from './AuthContext';
import { auth, db } from '../firebase';
import { normalizeOrderStatus } from '../lib/orderNormalizer';

export type ToastVariant = 'cart' | 'booking' | 'success' | 'info' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  durationMs: number;
  createdAt: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION_MS = 3800;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const counterRef = useRef(0);
  const knownOrderStatusesRef = useRef<Map<string, string>>(new Map());
  const isInitialSnapshotRef = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    counterRef.current += 1;
    const id = `hs-toast-${Date.now().toString(36)}-${counterRef.current}`;
    const record: ToastRecord = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'info',
      durationMs: Math.max(1500, options.durationMs ?? DEFAULT_DURATION_MS),
      action: options.action,
      createdAt: Date.now(),
    };

    setToasts((prev) => [record, ...prev].slice(0, MAX_VISIBLE_TOASTS));
    return id;
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((fbUser) => {
      setFirebaseUid(fbUser?.uid ?? null);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    knownOrderStatusesRef.current.clear();
    isInitialSnapshotRef.current = true;

    const uid = userProfile?.uid;
    if (!uid || !firebaseUid || firebaseUid !== uid) {
      return;
    }

    const ordersQuery = query(collection(db, 'orders'), where('userId', '==', uid));
    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        if (isInitialSnapshotRef.current) {
          snapshot.docs.forEach((docSnap) => {
            const rawStatus = docSnap.data()?.status;
            knownOrderStatusesRef.current.set(docSnap.id, normalizeOrderStatus(rawStatus));
          });
          isInitialSnapshotRef.current = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const nextStatus = normalizeOrderStatus(change.doc.data()?.status);
          const prevStatus = knownOrderStatusesRef.current.get(docId);

          if (change.type === 'removed') {
            knownOrderStatusesRef.current.delete(docId);
            return;
          }

          knownOrderStatusesRef.current.set(docId, nextStatus);

          if (change.type === 'modified' && prevStatus !== undefined && prevStatus !== nextStatus) {
            const shortId = docId.slice(-6).toUpperCase();
            if (nextStatus === 'Preparing') {
              showToast({
                variant: 'info',
                title: `Order #${shortId} is Preparing`,
                description: 'Our chefs are firing up your dishes right now.',
                durationMs: 4800,
              });
            } else if (nextStatus === 'Ready') {
              showToast({
                variant: 'success',
                title: `Order #${shortId} is Ready!`,
                description: 'Fresh from the kitchen—ready for pickup or table service.',
                durationMs: 5500,
              });
            } else if (nextStatus === 'Completed' || nextStatus === 'Delivered') {
              showToast({
                variant: 'success',
                title: `Order #${shortId} ${nextStatus}`,
                description: 'Thank you for dining with Hot & Spicy!',
                durationMs: 4500,
              });
            } else if (nextStatus === 'Cancelled') {
              showToast({
                variant: 'error',
                title: `Order #${shortId} Cancelled`,
                description: 'This order was cancelled. Reach out to our desk if you need assistance.',
                durationMs: 5500,
              });
            } else {
              showToast({
                variant: 'info',
                title: `Order #${shortId} Updated`,
                description: `Status is now ${nextStatus}.`,
                durationMs: 4200,
              });
            }
          }
        });
      },
      () => {
        // Non-fatal: customer order history remains synced via backend
      }
    );

    return () => {
      unsubscribeOrders();
    };
  }, [userProfile?.uid, firebaseUid, showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearToasts }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
