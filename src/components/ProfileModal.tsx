import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  CheckCircle2,
  LogOut,
  Calendar,
  ShoppingBag,
  ShieldCheck,
  Clock,
  Flame,
  PackageCheck,
  RefreshCw,
  XCircle,
  Award,
  QrCode,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialogKeyboard, scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';
import {
  calculateOrderPoints,
  calculateLoyaltyFromOrders,
  getLoyaltyTier,
} from '../lib/loyalty';
import { normalizeFirestoreOrder } from '../lib/orderNormalizer';
import { LoyaltyRewards } from './LoyaltyRewards';
import { LoungeCheckInQrCard } from './LoungeCheckInQrCard';
import { ReservationHistory } from './ReservationHistory';
import type { UserOrderRecord } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseRewardForBooking?: (bookingType: 'dining' | 'ps5' | 'pool', voucherCode: string) => void;
}

const ORDER_STEPS = [
  { key: 'pending', label: 'Pending', Icon: Clock },
  { key: 'preparing', label: 'Preparing', Icon: Flame },
  { key: 'ready', label: 'Ready', Icon: CheckCircle2 },
  { key: 'delivered', label: 'Delivered', Icon: PackageCheck },
] as const;

function getOrderStepIndex(status?: UserOrderRecord['status']): number {
  const normalized = (status || 'Pending').toLowerCase();
  if (normalized === 'completed' || normalized === 'delivered') return 3;
  if (normalized === 'ready') return 2;
  if (normalized === 'preparing') return 1;
  return 0;
}

function getOrderDisplayLabel(status?: UserOrderRecord['status']): string {
  const normalized = (status || 'Pending').toLowerCase();
  if (normalized === 'completed' || normalized === 'delivered') return 'Delivered';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'preparing') return 'Preparing';
  if (normalized === 'cancelled') return 'Cancelled';
  return 'Pending';
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onUseRewardForBooking,
}) => {
  const {
    userProfile,
    signOutUser,
    saveUserProfile,
    userBookings,
    userOrders,
    loyalty,
    redeemReward,
    recalculateLoyalty,
    refreshHistory,
  } = useAuth();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(Boolean(isOpen && userProfile), onClose, dialogRef);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [is18Plus, setIs18Plus] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'loyalty' | 'bookings' | 'orders'>('profile');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [syncingLoyalty, setSyncingLoyalty] = useState(false);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [rewardFeedback, setRewardFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [firestoreOrders, setFirestoreOrders] = useState<UserOrderRecord[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(false);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [bookingCount, setBookingCount] = useState(userBookings.length);
  const lastSyncedLoyaltyKeyRef = useRef<string>('');
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const mergedOrdersRef = useRef<UserOrderRecord[]>([]);
  const lastFetchedUidRef = useRef<string | null>(null);

  useEffect(() => {
    setBookingCount(userBookings.length);
  }, [userBookings.length]);

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setRewardFeedback(null);
      lastFetchedUidRef.current = null;
      return;
    }
    if (userProfile && !isEditing) {
      setName(userProfile.name || '');
      setPhone(userProfile.phone ? userProfile.phone.replace(/^\+\d+\s*/, '') : '');
      setAddress(userProfile.address || '');
      setIs18Plus(!!userProfile.is18Plus);
    }
  }, [userProfile, isOpen, isEditing]);

  const currentUid = userProfile?.uid ?? null;

  // Refresh user bookings, loyalty ledger & order statuses once when opening ProfileModal
  useEffect(() => {
    if (!isOpen || !currentUid) return;
    if (lastFetchedUidRef.current !== currentUid) {
      lastFetchedUidRef.current = currentUid;
      void refreshHistory();
    }
  }, [isOpen, currentUid, refreshHistory]);

  // Background poll every 15s only while viewing Orders or Rewards tabs
  useEffect(() => {
    if (!isOpen || !currentUid) return;
    if (activeTab !== 'orders' && activeTab !== 'loyalty') return;
    const interval = window.setInterval(() => {
      void refreshHistory();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [isOpen, activeTab, currentUid, refreshHistory]);

  // Real-time Firestore listener for user's past orders (pending -> preparing -> ready -> delivered)
  useEffect(() => {
    if (!isOpen || !currentUid) return;
    if (auth.currentUser?.uid !== currentUid) {
      setFirestoreSynced(false);
      setFirestoreLoading(false);
      return;
    }

    setFirestoreLoading(true);
    const ordersPath = 'orders';
    const q = query(collection(db, ordersPath), where('userId', '==', currentUid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const activeProfile = userProfileRef.current;
        const docs: UserOrderRecord[] = snapshot.docs.map((docSnap) =>
          normalizeFirestoreOrder(
            docSnap.data() as Record<string, unknown>,
            docSnap.id,
            activeProfile ?? undefined
          )
        );
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setFirestoreOrders(docs);
        setFirestoreSynced(true);
        setFirestoreLoading(false);
      },
      () => {
        setFirestoreLoading(false);
        setFirestoreSynced(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, currentUid]);

  const mergedOrders: UserOrderRecord[] = React.useMemo(() => {
    const map = new Map<string, UserOrderRecord>();
    for (const o of userOrders) {
      map.set(o.id, o);
    }
    for (const fo of firestoreOrders) {
      map.set(fo.id, fo);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [userOrders, firestoreOrders]);
  mergedOrdersRef.current = mergedOrders;

  const effectiveLoyalty = React.useMemo(() => {
    if (mergedOrders.length === 0) {
      return {
        earnedPoints: loyalty.earnedPoints,
        spentPoints: loyalty.spentPoints,
        availablePoints: loyalty.availablePoints,
        vouchers: loyalty.vouchers,
        eligibleOrdersCount: 0,
      };
    }
    const calc = calculateLoyaltyFromOrders(mergedOrders, loyalty.vouchers);
    return {
      earnedPoints: calc.earnedPoints,
      spentPoints: calc.spentPoints,
      availablePoints: calc.availablePoints,
      vouchers: loyalty.vouchers,
      eligibleOrdersCount: calc.eligibleOrdersCount,
    };
  }, [mergedOrders, loyalty]);

  // Automatically sync calculated order-history points to user profile DB & Firestore when orders change
  useEffect(() => {
    const activeProfile = userProfileRef.current;
    if (!isOpen || !currentUid || !activeProfile || !firestoreSynced) return;
    const syncKey = `${currentUid}:${effectiveLoyalty.earnedPoints}:${effectiveLoyalty.spentPoints}:${effectiveLoyalty.availablePoints}`;
    if (lastSyncedLoyaltyKeyRef.current === syncKey) return;

    const dbNeedsUpdate =
      activeProfile.loyaltyPoints !== effectiveLoyalty.availablePoints ||
      activeProfile.earnedPoints !== effectiveLoyalty.earnedPoints ||
      loyalty.availablePoints !== effectiveLoyalty.availablePoints;

    if (!dbNeedsUpdate) {
      lastSyncedLoyaltyKeyRef.current = syncKey;
      return;
    }

    lastSyncedLoyaltyKeyRef.current = syncKey;
    recalculateLoyalty(mergedOrdersRef.current).catch(() => {});
  }, [
    isOpen,
    currentUid,
    firestoreSynced,
    effectiveLoyalty.earnedPoints,
    effectiveLoyalty.spentPoints,
    effectiveLoyalty.availablePoints,
    loyalty.availablePoints,
    recalculateLoyalty,
  ]);

  const handleRecalculateLoyalty = async () => {
    if (!userProfile?.uid) return;
    setSyncingLoyalty(true);
    try {
      const updated = await recalculateLoyalty(mergedOrders);
      showToast({
        variant: 'success',
        title: 'Loyalty Balance Updated',
        description: `${updated.availablePoints} pts synced from your order history`,
      });
    } catch {
      showToast({
        variant: 'info',
        title: 'Sync Notice',
        description: 'Could not sync loyalty points right now. Please try again.',
      });
    } finally {
      window.setTimeout(() => setSyncingLoyalty(false), 350);
    }
  };

  const handleManualRefreshOrders = async () => {
    setRefreshingOrders(true);
    try {
      await refreshHistory();
      if (userProfile?.uid && auth.currentUser?.uid === userProfile.uid) {
        const q = query(collection(db, 'orders'), where('userId', '==', userProfile.uid));
        const snap = await getDocs(q);
        const docs: UserOrderRecord[] = snap.docs.map((docSnap) =>
          normalizeFirestoreOrder(docSnap.data() as Record<string, unknown>, docSnap.id, userProfile)
        );
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setFirestoreOrders(docs);
        setFirestoreSynced(true);

        // Merge with SQLite orders deduped by id before loyalty recalculation (ISSUE-02)
        const mergedMap = new Map<string, UserOrderRecord>();
        for (const o of userOrders) {
          mergedMap.set(o.id, o);
        }
        for (const fo of docs) {
          mergedMap.set(fo.id, fo);
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        await recalculateLoyalty(merged);
      }
    } catch {
      setFirestoreSynced(false);
      showToast({
        variant: 'info',
        title: 'Sync Notice',
        description: 'Could not refresh live cloud status right now.',
      });
    } finally {
      window.setTimeout(() => setRefreshingOrders(false), 350);
    }
  };

  const handleRedeemReward = async (rewardId: string) => {
    setRewardFeedback(null);
    setRedeemingRewardId(rewardId);
    try {
      const voucher = await redeemReward(rewardId);
      setRewardFeedback({
        type: 'success',
        message: `Redeemed ${voucher.title}! Voucher code ${voucher.code} is ready for your next booking.`,
      });
      showToast({
        variant: 'success',
        title: 'Loyalty Reward Claimed',
        description: `${voucher.title} · Code ${voucher.code} ready to use`,
        durationMs: 4800,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unable to redeem reward right now.';
      setRewardFeedback({ type: 'error', message: msg });
      showToast({
        variant: 'info',
        title: 'Redemption Notice',
        description: msg,
      });
    } finally {
      setRedeemingRewardId(null);
    }
  };

  const handleCopyVoucherCode = (code: string) => {
    try {
      navigator.clipboard?.writeText(code);
    } catch {}
    setCopiedCode(code);
    window.setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 1800);
  };

  const loyaltyTier = getLoyaltyTier(effectiveLoyalty.earnedPoints);
  const activeVouchersCount = effectiveLoyalty.vouchers.filter((v) => v.status === 'active').length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setSaving(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const formattedPhone = cleanPhone ? `+91 ${cleanPhone}` : '';
      await saveUserProfile({
        name: name.trim() || userProfile.name,
        phone: formattedPhone,
        address: address.trim(),
        is18Plus,
      });
      setIsEditing(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      showToast({
        variant: 'info',
        title: 'Save Failed',
        description: err?.message || 'Unable to save profile details right now.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && userProfile && (
        <motion.div
          key="profile-backdrop"
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4 bg-[rgba(3,11,22,0.9)] overscroll-none"
        >
          <motion.div
            ref={dialogRef}
            key="profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl rounded-2xl bg-[rgba(8,26,46,0.98)] border border-[rgba(56,189,248,0.35)] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90dvh] flex flex-col text-[#F0F9FF] focus:outline-none"
          >
            {/* Header */}
            <div className="shrink-0 p-5 sm:p-6 bg-[rgba(14,41,71,0.9)] border-b border-[#25578A] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#1D4ED8] border border-[#38BDF8] flex items-center justify-center text-lg font-bold text-white shrink-0">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 id="profile-modal-title" className="font-luxury text-lg sm:text-xl font-bold text-[#F0F9FF] flex flex-wrap items-center gap-2 truncate">
                <span className="truncate">{userProfile.name}</span>
                {userProfile.phoneVerified && (
                  <span className="text-[10px] bg-[rgba(16,185,129,0.2)] border border-[rgba(52,211,153,0.5)] text-emerald-200 px-2 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-300" /> Phone Verified
                  </span>
                )}
                {userProfile.is18Plus && (
                  <span className="text-[10px] bg-[#13355B] border border-[#38BDF8] text-[#E0F2FE] px-2 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#38BDF8]" /> 18+
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('loyalty')}
                  className="text-[10px] bg-[rgba(245,158,11,0.15)] border border-[rgba(251,191,36,0.5)] text-amber-200 px-2 py-0.5 rounded-lg font-bold inline-flex items-center gap-1 hover:bg-[rgba(245,158,11,0.25)] cursor-pointer tabular-nums"
                >
                  <Award className="w-3 h-3 text-amber-300" /> {effectiveLoyalty.availablePoints} Pts
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="text-[10px] bg-[#13355B] border border-[rgba(56,189,248,0.5)] text-[#7DD3FC] px-2 py-0.5 rounded-lg font-bold inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  title="Show Express Check-In QR Pass"
                >
                  <QrCode className="w-3 h-3 text-[#38BDF8]" /> Check-In QR
                </button>
              </h3>
              <p className="text-xs text-[#BAE6FD] truncate">
                {userProfile.email || userProfile.phone || 'Verified Guest'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#BAE6FD] hover:text-white hover:bg-[#13355B] cursor-pointer"
            aria-label="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Profile sections"
          className="shrink-0 flex overflow-x-auto touch-pan-x sm:grid sm:grid-cols-4 bg-[#0E2947] border-b border-[#25578A] text-xs font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 border-b-2 cursor-pointer px-3.5 sm:px-2 whitespace-nowrap shrink-0 ${
              activeTab === 'profile'
                ? 'border-[#38BDF8] text-[#F0F9FF] bg-[rgba(19,53,91,0.6)] font-bold'
                : 'border-transparent text-[#BAE6FD] hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Details</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'loyalty'}
            onClick={() => setActiveTab('loyalty')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 border-b-2 cursor-pointer px-3.5 sm:px-2 whitespace-nowrap shrink-0 ${
              activeTab === 'loyalty'
                ? 'border-[#38BDF8] text-[#F0F9FF] bg-[rgba(19,53,91,0.6)] font-bold'
                : 'border-transparent text-[#BAE6FD] hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            <span>Rewards</span>
            {activeVouchersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-[rgba(251,191,36,0.2)] text-amber-200 text-[9px] font-bold tabular-nums">
                {activeVouchersCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bookings'}
            onClick={() => setActiveTab('bookings')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 border-b-2 cursor-pointer px-3.5 sm:px-2 whitespace-nowrap shrink-0 ${
              activeTab === 'bookings'
                ? 'border-[#38BDF8] text-[#F0F9FF] bg-[rgba(19,53,91,0.6)] font-bold'
                : 'border-transparent text-[#BAE6FD] hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Bookings ({bookingCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            onClick={() => setActiveTab('orders')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 border-b-2 cursor-pointer px-3.5 sm:px-2 whitespace-nowrap shrink-0 ${
              activeTab === 'orders'
                ? 'border-[#38BDF8] text-[#F0F9FF] bg-[rgba(19,53,91,0.6)] font-bold'
                : 'border-transparent text-[#BAE6FD] hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span>Orders ({mergedOrders.length})</span>
          </button>
        </div>

        {/* Content */}
        <div
          data-lenis-prevent
          data-dialog-scroll
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onFocusCapture={scrollFocusedInputIntoView}
          className="p-5 sm:p-6 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain space-y-4 flex-1 min-h-0"
        >
          {savedSuccess && (
            <div className="p-3 rounded-xl bg-[#13355B] border border-[#38BDF8] text-[#E0F2FE] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#38BDF8]" />
              <span>Your details have been saved.</span>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              {!isEditing ? (
                <div className="space-y-3.5 bg-[#0E2947] border border-[#25578A] rounded-xl p-4 text-xs">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#25578A]">
                    <span className="text-[#BAE6FD] font-semibold">Saved Details</span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center min-h-[36px] px-2 text-[#E0F2FE] font-bold underline hover:text-white cursor-pointer"
                    >
                      Edit Details
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[#BAE6FD] block text-[11px]">Full Name</span>
                      <span className="font-semibold text-[#F0F9FF]">{userProfile.name}</span>
                    </div>
                    <div>
                      <span className="text-[#BAE6FD] block text-[11px]">Email</span>
                      <span className="font-semibold text-[#F0F9FF] break-all">
                        {userProfile.email || <em className="text-[rgba(186,230,253,0.6)]">Not provided</em>}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#BAE6FD] block text-[11px]">WhatsApp Phone</span>
                      <span className="font-semibold text-[#F0F9FF]">
                        {userProfile.phone || <em className="text-[rgba(186,230,253,0.6)]">Not set</em>}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#BAE6FD] block text-[11px]">Age Verification</span>
                      <span className="font-semibold text-[#38BDF8]">
                        {userProfile.is18Plus ? '18+ Confirmed' : 'Not yet confirmed'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#25578A]">
                    <span className="text-[#BAE6FD] block text-[11px]">Address</span>
                    <span className="font-semibold text-[#F0F9FF]">
                      {userProfile.address || <em className="text-[rgba(186,230,253,0.6)]">No address saved</em>}
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-3.5 bg-[#0E2947] border border-[#25578A] rounded-xl p-4 text-xs">
                  <h4 className="font-bold text-[#F0F9FF]">Update Information</h4>

                  <div>
                    <label className="block text-[#BAE6FD] mb-1 font-semibold">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#081A2E] border border-[#25578A] rounded-xl px-3 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] focus:border-[#38BDF8] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[#BAE6FD] mb-1 font-semibold">WhatsApp Phone (+91)</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-sm sm:text-xs font-bold text-[#38BDF8] pointer-events-none">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        className="w-full bg-[#081A2E] border border-[#25578A] rounded-xl pl-12 pr-3 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] focus:border-[#38BDF8] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#BAE6FD] mb-1 font-semibold">Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Boropara More, Dingalhat, Bansberia"
                      className="w-full bg-[#081A2E] border border-[#25578A] rounded-xl px-3 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] focus:border-[#38BDF8] focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={is18Plus}
                      onChange={(e) => setIs18Plus(e.target.checked)}
                      className="accent-[#38BDF8] w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-[#F0F9FF]">
                      I confirm I am 18 years or older
                    </span>
                  </label>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 min-h-[40px] rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-xs uppercase cursor-pointer"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 min-h-[40px] rounded-xl bg-[#081A2E] border border-[#25578A] text-[#BAE6FD] font-semibold text-xs hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Quick Lounge Check-In QR Pass */}
              <LoungeCheckInQrCard
                userProfile={userProfile}
                tierName={loyaltyTier.name}
                availablePoints={effectiveLoyalty.availablePoints}
                bookings={userBookings}
              />

              {/* LoyaltyRewards Summary Card visible on Profile Details */}
              <LoyaltyRewards
                variant="summary"
                availablePoints={effectiveLoyalty.availablePoints}
                earnedPoints={effectiveLoyalty.earnedPoints}
                spentPoints={effectiveLoyalty.spentPoints}
                vouchers={effectiveLoyalty.vouchers}
                syncingLoyalty={syncingLoyalty}
                onRecalculate={handleRecalculateLoyalty}
                onUseRewardForBooking={onUseRewardForBooking}
                onOpenRewardsTab={() => setActiveTab('loyalty')}
              />

              <div className="pt-2 flex flex-wrap justify-between items-center gap-3">
                <span className="text-[11px] text-[#BAE6FD] truncate">
                  {userProfile.email || userProfile.phone || 'Verified Guest'}
                </span>
                <button
                  onClick={async () => {
                    await signOutUser();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-[#25578A] bg-[#0E2947] hover:bg-[#13355B] text-[#E0F2FE] font-bold text-xs cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <LoyaltyRewards
              variant="full"
              availablePoints={effectiveLoyalty.availablePoints}
              earnedPoints={effectiveLoyalty.earnedPoints}
              spentPoints={effectiveLoyalty.spentPoints}
              vouchers={loyalty.vouchers}
              orders={mergedOrders}
              syncingLoyalty={syncingLoyalty}
              redeemingRewardId={redeemingRewardId}
              rewardFeedback={rewardFeedback}
              copiedCode={copiedCode}
              onRecalculate={handleRecalculateLoyalty}
              onRedeem={handleRedeemReward}
              onCopyCode={handleCopyVoucherCode}
              onUseRewardForBooking={onUseRewardForBooking}
            />
          )}

          {activeTab === 'bookings' && (
            <ReservationHistory
              isOpen={isOpen}
              onBookingCountChange={setBookingCount}
            />
          )}

          {activeTab === 'orders' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-[11px] text-[#BAE6FD]">
                <span>
                  {firestoreSynced
                    ? 'Live Kitchen Progress'
                    : 'Order Progress'}
                </span>
                <button
                  type="button"
                  onClick={handleManualRefreshOrders}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0E2947] border border-[#25578A] hover:border-[#38BDF8] text-[#E0F2FE] font-semibold cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 text-[#38BDF8] ${refreshingOrders ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
              </div>

              {firestoreLoading && mergedOrders.length === 0 ? (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1].map((idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#0E2947] border border-[#25578A] space-y-3 animate-pulse"
                    >
                      <div className="flex justify-between">
                        <div className="h-4 w-32 rounded bg-[#13355B]" />
                        <div className="h-4 w-20 rounded bg-[#13355B]" />
                      </div>
                      <div className="h-7 w-full rounded bg-[#13355B]" />
                      <div className="h-12 w-full rounded bg-[#081A2E]" />
                    </div>
                  ))}
                </div>
              ) : mergedOrders.length === 0 ? (
                <div className="text-center py-8 bg-[#0E2947] border border-[#25578A] rounded-xl p-4 text-xs">
                  <ShoppingBag className="w-8 h-8 text-[rgba(186,230,253,0.4)] mx-auto mb-2" />
                  <p className="text-[#F0F9FF] font-bold">No orders placed yet</p>
                </div>
              ) : (
                mergedOrders.map((o) => {
                  const statusLabel = getOrderDisplayLabel(o.status);
                  const isCancelled = statusLabel === 'Cancelled';
                  const currentStep = getOrderStepIndex(o.status);
                  const fillPercent =
                    currentStep === 0 ? 0 : currentStep === 1 ? 33 : currentStep === 2 ? 67 : 100;

                  return (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="p-4 bg-[#0E2947] border border-[#25578A] rounded-xl space-y-3 text-xs"
                    >
                      {/* Top Order Header & Animated Status Pill */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#F0F9FF]">
                              Order #{o.id}
                            </span>
                            <span className="text-[10px] text-[#BAE6FD] font-medium">
                              ({o.diningMode === 'dine-in' ? 'Dine-In' : 'Takeaway'})
                            </span>
                          </div>
                          {o.createdAt && (
                            <span className="block text-[10px] text-[rgba(186,230,253,0.75)] mt-0.5">
                              {new Date(o.createdAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isCancelled && calculateOrderPoints(o.subtotal, o.status) > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-[rgba(245,158,11,0.15)] border border-[rgba(251,191,36,0.4)] text-amber-200 text-[10px] font-bold tabular-nums">
                              +{calculateOrderPoints(o.subtotal, o.status)} pts
                            </span>
                          )}
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={statusLabel}
                              initial={{ opacity: 0, y: -4, scale: 0.92 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 4, scale: 0.92 }}
                              transition={{ duration: 0.22, ease: 'easeOut' }}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                isCancelled
                                  ? 'bg-[rgba(244,63,94,0.15)] text-rose-300 border-[rgba(251,113,133,0.4)]'
                                  : currentStep === 3
                                  ? 'bg-[rgba(16,185,129,0.15)] text-emerald-300 border-[rgba(52,211,153,0.4)]'
                                  : currentStep === 2
                                  ? 'bg-[rgba(99,102,241,0.15)] text-indigo-300 border-[rgba(129,140,248,0.4)]'
                                  : currentStep === 1
                                  ? 'bg-[rgba(14,165,233,0.15)] text-sky-300 border-[rgba(56,189,248,0.4)]'
                                  : 'bg-[rgba(245,158,11,0.15)] text-amber-300 border-[rgba(251,191,36,0.4)]'
                              }`}
                            >
                              {statusLabel}
                            </motion.span>
                          </AnimatePresence>
                          <span className="text-sm font-bold text-[#38BDF8] tabular-nums">
                            ₹{o.subtotal}
                          </span>
                        </div>
                      </div>

                      {/* Subtle Animated Order Progress Stepper */}
                      {isCancelled ? (
                        <div className="p-2.5 rounded-lg bg-[rgba(76,5,25,0.35)] border border-[rgba(251,113,133,0.3)] text-[11px] text-rose-200 flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-rose-300 shrink-0" />
                          <span>This order was cancelled. Contact +91 7605857713 if you need help.</span>
                        </div>
                      ) : (
                        <div
                          className="pt-1 pb-0.5 px-1"
                          aria-label={`Order progress: ${statusLabel}`}
                        >
                          <div className="relative flex items-center justify-between">
                            {/* Background Track */}
                            <div
                              aria-hidden="true"
                              className="absolute left-4 right-4 top-3.5 h-[3px] rounded-full bg-[#081A2E] border border-[rgba(37,87,138,0.7)] overflow-hidden"
                            >
                              <motion.div
                                initial={false}
                                animate={{ width: `${fillPercent}%` }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 140,
                                  damping: 22,
                                }}
                                className={`h-full rounded-full ${
                                  currentStep === 3
                                    ? 'bg-emerald-400'
                                    : 'bg-[#38BDF8]'
                                }`}
                              />
                            </div>

                            {ORDER_STEPS.map((step, idx) => {
                              const isCompleted = idx < currentStep || (idx === 3 && currentStep === 3);
                              const isActive = idx === currentStep && currentStep < 3;
                              const StepIcon = step.Icon;

                              return (
                                <div
                                  key={step.key}
                                  className="relative z-10 flex flex-col items-center gap-1.5"
                                >
                                  <div className="relative">
                                    {isActive && (
                                      <motion.span
                                        aria-hidden="true"
                                        animate={{
                                          scale: [1, 1.45, 1],
                                          opacity: [0.55, 0, 0.55],
                                        }}
                                        transition={{
                                          duration: 2,
                                          repeat: Infinity,
                                          ease: 'easeInOut',
                                        }}
                                        className="absolute inset-0 rounded-full bg-[rgba(56,189,248,0.4)]"
                                      />
                                    )}
                                    <motion.div
                                      initial={false}
                                      animate={{
                                        scale: isActive ? 1.08 : 1,
                                        backgroundColor: isCompleted
                                          ? idx === 3
                                            ? '#10B981'
                                            : '#38BDF8'
                                          : isActive
                                          ? '#13355B'
                                          : '#081A2E',
                                        borderColor: isCompleted
                                          ? idx === 3
                                            ? '#34D399'
                                            : '#7DD3FC'
                                          : isActive
                                          ? '#38BDF8'
                                          : '#25578A',
                                      }}
                                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                      className="w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-sm"
                                    >
                                      <StepIcon
                                        className={`w-3.5 h-3.5 duration-200 ${
                                          isCompleted
                                            ? 'text-[#081A2E]'
                                            : isActive
                                            ? 'text-[#38BDF8]'
                                            : 'text-[rgba(186,230,253,0.45)]'
                                        }`}
                                      />
                                    </motion.div>
                                  </div>

                                  <motion.span
                                    initial={false}
                                    animate={{
                                      opacity: isCompleted || isActive ? 1 : 0.55,
                                    }}
                                    transition={{ duration: 0.25 }}
                                    className={`text-[10px] font-bold tracking-wide ${
                                      isCompleted && idx === 3
                                        ? 'text-emerald-300'
                                        : isCompleted || isActive
                                        ? 'text-[#F0F9FF]'
                                        : 'text-[rgba(186,230,253,0.6)]'
                                    }`}
                                  >
                                    {step.label}
                                  </motion.span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] text-[rgba(224,242,254,0.9)] whitespace-pre-line bg-[rgba(8,26,46,0.7)] p-2.5 rounded-lg border border-[rgba(37,87,138,0.5)]">
                        {o.itemsSummary}
                      </p>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
