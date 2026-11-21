import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  Users,
  Ticket,
  XCircle,
  AlertTriangle,
  Gamepad2,
  Trophy,
  Utensils,
  Sparkles,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ReservationRequest } from '../types';

export interface ReservationHistoryProps {
  isOpen: boolean;
  onBookingCountChange?: (count: number) => void;
}

function normalizeBookingRecord(
  raw: Record<string, unknown>,
  fallbackId: string
): ReservationRequest {
  const rawType = String(raw.bookingType || 'dining');
  const bookingType: ReservationRequest['bookingType'] =
    rawType === 'ps5' || rawType === 'pool' || rawType === 'combo_deal'
      ? rawType
      : 'dining';
  const rawStatus = String(raw.status || 'Confirmed');
  const status: ReservationRequest['status'] =
    rawStatus === 'Completed' || rawStatus === 'Cancelled' ? rawStatus : 'Confirmed';

  return {
    id: String(raw.id || fallbackId),
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    name: String(raw.name || 'Guest'),
    phone: String(raw.phone || ''),
    address: typeof raw.address === 'string' ? raw.address : undefined,
    bookingType,
    poolDuration:
      raw.poolDuration === '15min' || raw.poolDuration === '30min'
        ? raw.poolDuration
        : undefined,
    date: String(raw.date || ''),
    timeSlot: String(raw.timeSlot || ''),
    guests: Number(raw.guests) || 2,
    specialRequests:
      typeof raw.specialRequests === 'string' ? raw.specialRequests : undefined,
    is18Confirmed: Boolean(raw.is18Confirmed ?? true),
    voucherCode: typeof raw.voucherCode === 'string' ? raw.voucherCode : undefined,
    discountAmount:
      typeof raw.discountAmount === 'number' ? raw.discountAmount : undefined,
    rewardTitle: typeof raw.rewardTitle === 'string' ? raw.rewardTitle : undefined,
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
  };
}

function getBookingMeta(bookingType: ReservationRequest['bookingType']) {
  switch (bookingType) {
    case 'ps5':
      return { label: 'PS5 Arena Reservation', Icon: Gamepad2 };
    case 'pool':
      return { label: '8-Ball Pool Reservation', Icon: Trophy };
    case 'combo_deal':
      return { label: 'Combo Lounge Reservation', Icon: Sparkles };
    default:
      return { label: 'Dining Table Reservation', Icon: Utensils };
  }
}

export function isUpcomingBooking(booking: ReservationRequest): boolean {
  const normalizedStatus = (booking.status || 'Confirmed').toLowerCase();
  return normalizedStatus !== 'cancelled' && normalizedStatus !== 'completed';
}

export const ReservationHistory: React.FC<ReservationHistoryProps> = ({
  isOpen,
  onBookingCountChange,
}) => {
  const { userProfile, userBookings, cancelBookingRecord } = useAuth();
  const { showToast } = useToast();

  const [firestoreBookings, setFirestoreBookings] = useState<ReservationRequest[]>([]);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ReservationRequest | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Real-time Firestore listener for user bookings
  useEffect(() => {
    if (!isOpen || !userProfile?.uid) return;
    if (auth.currentUser?.uid !== userProfile.uid) {
      setFirestoreSynced(false);
      return;
    }

    const bookingsPath = 'bookings';
    const q = query(collection(db, bookingsPath), where('userId', '==', userProfile.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((docSnap) =>
          normalizeBookingRecord(docSnap.data() as Record<string, unknown>, docSnap.id)
        );
        setFirestoreBookings(docs);
        setFirestoreSynced(true);
      },
      (error) => {
        setFirestoreSynced(false);
        const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if (msg.includes('permission') || msg.includes('insufficient')) {
          handleFirestoreError(error, OperationType.LIST, bookingsPath);
        }
      }
    );

    return () => unsubscribe();
  }, [isOpen, userProfile?.uid]);

  // Dismiss cancellation confirmation dialog cleanly on Escape
  useEffect(() => {
    if (!confirmTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancellingId) {
        e.stopPropagation();
        setConfirmTarget(null);
        setCancelError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [confirmTarget, cancellingId]);

  const mergedBookings = useMemo(() => {
    const map = new Map<string, ReservationRequest>();
    for (const b of userBookings) {
      if (b.id) map.set(b.id, b);
    }
    for (const fb of firestoreBookings) {
      if (fb.id) map.set(fb.id, fb);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aUpcoming = isUpcomingBooking(a) ? 0 : 1;
      const bUpcoming = isUpcomingBooking(b) ? 0 : 1;
      if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [userBookings, firestoreBookings]);

  useEffect(() => {
    onBookingCountChange?.(mergedBookings.length);
  }, [mergedBookings.length, onBookingCountChange]);

  const handleConfirmCancel = async () => {
    if (!confirmTarget?.id) return;
    const bookingId = confirmTarget.id;
    setCancelError(null);
    setCancellingId(bookingId);

    try {
      // Update Firestore directly if authenticated in Firebase Auth and not already covered
      if (auth.currentUser && userProfile?.uid && auth.currentUser.uid === userProfile.uid) {
        const path = `bookings/${bookingId}`;
        try {
          await updateDoc(doc(db, 'bookings', bookingId), { status: 'Cancelled' });
        } catch (err) {
          const code = (err as { code?: string })?.code;
          const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
          if (msg.includes('permission') || msg.includes('insufficient')) {
            handleFirestoreError(err, OperationType.UPDATE, path);
          }
          if (code !== 'not-found') {
            handleFirestoreError(err, OperationType.UPDATE, path);
          }
        }
      }

      // Sync cancellation with backend reservation store & AuthContext state
      await cancelBookingRecord(bookingId);

      // Update local Firestore mirror state immediately in case only Express had the record
      setFirestoreBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'Cancelled' } : b))
      );

      showToast({
        variant: 'info',
        title: 'Reservation Cancelled',
        description: `Booking #${bookingId} (${confirmTarget.date} at ${confirmTarget.timeSlot}) has been cancelled.`,
      });
      setConfirmTarget(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const isInternalJson = raw.trim().startsWith('{') || /firestore|permission|insufficient/i.test(raw);
      const msg = !raw || isInternalJson
        ? 'Unable to cancel reservation right now. Please try again.'
        : raw;
      setCancelError(msg);
      showToast({
        variant: 'info',
        title: 'Cancellation Error',
        description: msg,
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-[#BAE6FD]">
        <span>
          {firestoreSynced ? 'Live Reservation Updates' : 'Your Lounge Reservations'}
        </span>
        <span className="font-mono text-[10px] text-[#7DD3FC] tabular-nums">
          {mergedBookings.filter(isUpcomingBooking).length} upcoming
        </span>
      </div>

      {mergedBookings.length === 0 ? (
        <div className="text-center py-8 bg-[#0E2947] border border-[#25578A] rounded-xl p-4 text-xs space-y-1">
          <Calendar className="w-8 h-8 text-[rgba(186,230,253,0.4)] mx-auto mb-2" />
          <p className="text-[#F0F9FF] font-bold">No reservations yet</p>
          <p className="text-[11px] text-[#BAE6FD]">
            Book a PS5 Arena or 8-Ball Pool slot to manage it here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {mergedBookings.map((b) => {
            const upcoming = isUpcomingBooking(b);
            const status = b.status || 'Confirmed';
            const isCancelled = status === 'Cancelled';
            const isCompleted = status === 'Completed';
            const { label: typeLabel, Icon: TypeIcon } = getBookingMeta(b.bookingType);

            return (
              <div
                key={b.id}
                className={`p-3.5 rounded-xl border space-y-2 text-xs ${
                  isCancelled
                    ? 'bg-[rgba(8,26,46,0.75)] border-[rgba(251,113,133,0.3)]'
                    : 'bg-[#0E2947] border-[#25578A]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#081A2E] border border-[#25578A] flex items-center justify-center shrink-0">
                      <TypeIcon className="w-3.5 h-3.5 text-[#38BDF8]" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-[#F0F9FF] uppercase block truncate">
                        {typeLabel}
                        {b.poolDuration
                          ? ` · ${b.poolDuration === '15min' ? '15 Mins (₹60)' : '30 Mins (₹120)'}`
                          : ''}
                      </span>
                      <span className="text-[10px] text-[#38BDF8] font-mono font-bold">
                        #{b.id}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                        isCancelled
                          ? 'bg-[rgba(244,63,94,0.15)] text-rose-300 border-[rgba(251,113,133,0.4)]'
                          : isCompleted
                          ? 'bg-[rgba(16,185,129,0.15)] text-emerald-300 border-[rgba(52,211,153,0.4)]'
                          : 'bg-[rgba(56,189,248,0.15)] text-[#7DD3FC] border-[rgba(56,189,248,0.45)]'
                      }`}
                    >
                      {isCancelled ? (
                        <XCircle className="w-3 h-3" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      <span>{status}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#BAE6FD]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#38BDF8]" />
                    {b.date}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#38BDF8]" />
                    {b.timeSlot}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#38BDF8]" />
                    {b.guests} Guests
                  </span>
                </div>

                {b.address && (
                  <div className="text-[11px] text-[rgba(224,242,254,0.8)] flex items-start gap-1">
                    <MapPin className="w-3 h-3 text-[#38BDF8] shrink-0 mt-0.5" />
                    <span>{b.address}</span>
                  </div>
                )}

                {b.specialRequests && (
                  <div className="text-[11px] text-[rgba(186,230,253,0.8)] italic">
                    Note: {b.specialRequests}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {b.voucherCode ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[rgba(16,185,129,0.15)] border border-[rgba(52,211,153,0.4)] text-emerald-200 text-[10px] font-bold">
                      <Ticket className="w-3 h-3" />
                      Reward Applied: {b.voucherCode} (-₹{b.discountAmount || 0})
                    </span>
                  ) : (
                    <span />
                  )}

                  {upcoming && b.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError(null);
                        setConfirmTarget(b);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg bg-[rgba(244,63,94,0.14)] hover:bg-[rgba(244,63,94,0.26)] border border-[rgba(251,113,133,0.45)] text-rose-200 hover:text-white font-bold text-[11px] uppercase tracking-wider cursor-pointer ml-auto"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog Before Updating Firestore */}
      <AnimatePresence>
        {confirmTarget && (
          <motion.div
            key="cancel-confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!cancellingId) {
                setConfirmTarget(null);
                setCancelError(null);
              }
            }}
            className="fixed inset-0 z-[1120] flex items-center justify-center p-4 bg-[rgba(3,11,22,0.85)]"
          >
            <motion.div
              key="cancel-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancel-booking-dialog-title"
              aria-describedby="cancel-booking-dialog-desc"
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-[#081A2E] border border-[rgba(251,113,133,0.5)] shadow-2xl p-5 space-y-4 text-[#F0F9FF]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgba(244,63,94,0.18)] border border-[rgba(251,113,133,0.45)] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-300" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h4
                    id="cancel-booking-dialog-title"
                    className="font-luxury text-lg font-bold text-[#F0F9FF]"
                  >
                    Cancel Reservation?
                  </h4>
                  <p
                    id="cancel-booking-dialog-desc"
                    className="text-xs text-[#BAE6FD] leading-relaxed"
                  >
                    Are you sure you want to cancel{' '}
                    <strong className="text-white">#{confirmTarget.id}</strong> for{' '}
                    <strong className="text-white">{confirmTarget.date}</strong> at{' '}
                    <strong className="text-white">{confirmTarget.timeSlot}</strong>? Your slot will
                    be released immediately.
                  </p>
                </div>
              </div>

              {cancelError && (
                <div className="p-2.5 rounded-lg bg-[rgba(76,5,25,0.45)] border border-[rgba(251,113,133,0.45)] text-[11px] text-rose-200">
                  {cancelError}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={Boolean(cancellingId)}
                  onClick={() => {
                    setConfirmTarget(null);
                    setCancelError(null);
                  }}
                  className="px-4 min-h-[40px] rounded-xl bg-[#0E2947] border border-[#25578A] hover:border-[#38BDF8] text-[#E0F2FE] font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Keep Booking
                </button>
                <button
                  type="button"
                  disabled={Boolean(cancellingId)}
                  onClick={handleConfirmCancel}
                  className="px-4 min-h-[40px] rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{cancellingId ? 'Cancelling...' : 'Confirm Cancellation'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
