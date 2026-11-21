import React from 'react';
import { motion } from 'motion/react';
import {
  Award,
  Gift,
  Ticket,
  Sparkles,
  Gamepad2,
  Trophy,
  Utensils,
  ArrowRight,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShoppingBag,
} from 'lucide-react';
import {
  calculateOrderPoints,
  getLoyaltyTier,
  LOYALTY_REWARDS_CATALOG,
} from '../lib/loyalty';
import type {
  LoyaltyRewardCategory,
  LoyaltyRewardVoucher,
  UserOrderRecord,
} from '../types';

export interface LoyaltyRewardsProps {
  availablePoints: number;
  earnedPoints: number;
  spentPoints: number;
  vouchers: LoyaltyRewardVoucher[];
  orders?: UserOrderRecord[];
  variant?: 'full' | 'summary';
  syncingLoyalty?: boolean;
  redeemingRewardId?: string | null;
  rewardFeedback?: { type: 'error' | 'success'; message: string } | null;
  copiedCode?: string | null;
  onRecalculate?: () => void;
  onRedeem?: (rewardId: string) => void;
  onCopyCode?: (code: string) => void;
  onUseRewardForBooking?: (bookingType: 'dining' | 'ps5' | 'pool', voucherCode: string) => void;
  onOpenRewardsTab?: () => void;
}

function getCategoryMeta(category: LoyaltyRewardCategory) {
  switch (category) {
    case 'dining':
      return { label: 'Dining Table', Icon: Utensils };
    case 'pool':
      return { label: '8-Ball Pool', Icon: Trophy };
    case 'ps5':
      return { label: 'PS5 Arena', Icon: Gamepad2 };
    default:
      return { label: 'Gaming & Dining', Icon: Sparkles };
  }
}

function getOrderDisplayLabel(status?: UserOrderRecord['status']): string {
  const normalized = (status || 'Pending').toLowerCase();
  if (normalized === 'completed' || normalized === 'delivered') return 'Delivered';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'preparing') return 'Preparing';
  if (normalized === 'cancelled') return 'Cancelled';
  return 'Pending';
}

export const LoyaltyRewards: React.FC<LoyaltyRewardsProps> = ({
  availablePoints,
  earnedPoints,
  spentPoints,
  vouchers,
  orders = [],
  variant = 'full',
  syncingLoyalty = false,
  redeemingRewardId = null,
  rewardFeedback = null,
  copiedCode = null,
  onRecalculate,
  onRedeem,
  onCopyCode,
  onUseRewardForBooking,
  onOpenRewardsTab,
}) => {
  const loyaltyTier = getLoyaltyTier(earnedPoints);
  const activeVouchers = vouchers.filter((v) => v.status === 'active');

  if (variant === 'summary') {
    return (
      <section
        aria-label="Loyalty status and rewards summary"
        className="p-4 rounded-xl bg-[#0E2947] border border-[rgba(56,189,248,0.4)] space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#7DD3FC] font-bold block">
              Loyalty Points &amp; Status
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-luxury text-2xl sm:text-3xl font-bold text-[#F0F9FF] tabular-nums">
                {availablePoints}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
                Pts Available
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[rgba(245,158,11,0.2)] border border-[rgba(251,191,36,0.5)] text-amber-200 text-[10px] font-bold">
              <Award className="w-3 h-3 text-amber-300" />
              {loyaltyTier.name}
            </span>
            <span className="text-[10px] text-[#BAE6FD]">
              {earnedPoints} earned · {spentPoints} spent · {activeVouchers.length} active voucher{activeVouchers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-[#BAE6FD]">
            <span>
              {loyaltyTier.nextTierName
                ? `${loyaltyTier.pointsToNext} pts to ${loyaltyTier.nextTierName}`
                : 'Top Loyalty Tier Unlocked'}
            </span>
            <span className="font-mono font-bold text-[#E0F2FE] tabular-nums">
              {loyaltyTier.progressPercent}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#081A2E] border border-[#25578A] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#38BDF8]"
              style={{ width: `${loyaltyTier.progressPercent}%` }}
            />
          </div>
        </div>

        {activeVouchers.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-200 flex items-center gap-1">
              <Ticket className="w-3 h-3 text-amber-300" />
              Ready Redemption Vouchers
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeVouchers.slice(0, 2).map((v) => {
                const targetType: 'ps5' | 'pool' =
                  v.category === 'pool' ? 'pool' : 'ps5';
                return (
                  <div
                    key={v.id}
                    className="p-2.5 rounded-lg bg-[#081A2E] border border-[rgba(56,189,248,0.45)] flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-[#38BDF8] block truncate">
                        {v.code}
                      </span>
                      <span className="text-[#F0F9FF] font-semibold block truncate">
                        {v.title}
                      </span>
                    </div>
                    {onUseRewardForBooking && (
                      <button
                        type="button"
                        onClick={() => onUseRewardForBooking(targetType, v.code)}
                        className="px-2 py-1 rounded-lg bg-[#E0F2FE] hover:bg-white text-[#081A2E] font-bold text-[10px] uppercase shrink-0 cursor-pointer"
                      >
                        Use
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[rgba(37,87,138,0.8)]">
          {onRecalculate && (
            <button
              type="button"
              onClick={onRecalculate}
              disabled={syncingLoyalty}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-[#081A2E] border border-[#25578A] hover:border-[#38BDF8] text-[#BAE6FD] hover:text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 text-[#38BDF8] ${syncingLoyalty ? 'animate-spin' : ''}`} />
              <span>{syncingLoyalty ? 'Syncing...' : 'Sync from Orders'}</span>
            </button>
          )}

          {onOpenRewardsTab && (
            <button
              type="button"
              onClick={onOpenRewardsTab}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer ml-auto"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Redeem Rewards ({activeVouchers.length})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Loyalty Points & Tier Tracker Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0E2947] border border-[rgba(56,189,248,0.45)] shadow-lg space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#7DD3FC] font-bold block">
              Loyalty Points Balance
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-luxury text-3xl sm:text-4xl font-bold text-[#F0F9FF] tabular-nums">
                {availablePoints}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
                Pts Available
              </span>
            </div>
          </div>

          <div className="text-right space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(245,158,11,0.2)] border border-[rgba(251,191,36,0.5)] text-amber-200 text-[11px] font-bold">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              {loyaltyTier.name}
            </span>
            <span className="block text-[10px] text-[#BAE6FD]">
              Earn 1 pt per ₹10 ordered
            </span>
            {onRecalculate && (
              <button
                type="button"
                onClick={onRecalculate}
                disabled={syncingLoyalty}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#7DD3FC] hover:text-white cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${syncingLoyalty ? 'animate-spin' : ''}`} />
                <span>{syncingLoyalty ? 'Updating...' : 'Recalculate Points'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tier Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#BAE6FD]">
            <span>
              {loyaltyTier.nextTierName
                ? `${loyaltyTier.pointsToNext} pts to ${loyaltyTier.nextTierName}`
                : 'Top Loyalty Tier Unlocked'}
            </span>
            <span className="font-mono font-bold text-[#E0F2FE] tabular-nums">
              {loyaltyTier.progressPercent}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#081A2E] border border-[#25578A] overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${loyaltyTier.progressPercent}%` }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-[#38BDF8]"
            />
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-[rgba(8,26,46,0.75)] border border-[rgba(37,87,138,0.8)] text-center">
            <span className="block text-[10px] text-[#BAE6FD]">Earned</span>
            <strong className="text-sm text-[#F0F9FF] tabular-nums">
              {earnedPoints} pts
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-[rgba(8,26,46,0.75)] border border-[rgba(37,87,138,0.8)] text-center">
            <span className="block text-[10px] text-[#BAE6FD]">Redeemed</span>
            <strong className="text-sm text-[#F0F9FF] tabular-nums">
              {spentPoints} pts
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-[rgba(8,26,46,0.75)] border border-[rgba(37,87,138,0.8)] text-center">
            <span className="block text-[10px] text-[#BAE6FD]">Vouchers</span>
            <strong className="text-sm text-amber-300 tabular-nums">
              {activeVouchers.length} active
            </strong>
          </div>
        </div>
      </div>

      {rewardFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            rewardFeedback.type === 'success'
              ? 'bg-[rgba(2,44,34,0.45)] border-[rgba(52,211,153,0.5)] text-emerald-100'
              : 'bg-[rgba(76,5,25,0.45)] border-[rgba(251,113,133,0.5)] text-rose-100'
          }`}
        >
          {rewardFeedback.type === 'error' ? (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
          )}
          <span>{rewardFeedback.message}</span>
        </div>
      )}

      {/* Rewards Catalog Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#F0F9FF] flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-[#38BDF8]" />
            <span>Rewards — Redeem for Gaming &amp; Dining</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {LOYALTY_REWARDS_CATALOG.map((reward) => {
            const { label: catLabel, Icon: CatIcon } = getCategoryMeta(reward.category);
            const canAfford = availablePoints >= reward.pointsCost;
            const isRedeeming = redeemingRewardId === reward.id;
            const shortfall = Math.max(0, reward.pointsCost - availablePoints);
            const pct = Math.min(100, Math.round((availablePoints / reward.pointsCost) * 100));

            return (
              <div
                key={reward.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                  canAfford
                    ? 'bg-[#0E2947] border-[rgba(56,189,248,0.5)]'
                    : 'bg-[rgba(14,41,71,0.65)] border-[#25578A]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7DD3FC]">
                      <CatIcon className="w-3 h-3 text-[#38BDF8]" />
                      {catLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[rgba(16,185,129,0.15)] border border-[rgba(52,211,153,0.4)] text-emerald-200 text-[10px] font-bold tabular-nums">
                      Save ₹{reward.discountAmount}
                    </span>
                  </div>
                  <h5 className="font-bold text-xs sm:text-sm text-[#F0F9FF]">{reward.title}</h5>
                  <p className="text-[11px] text-[rgba(186,230,253,0.85)] leading-snug">
                    {reward.tagline}
                  </p>
                </div>

                <div className="space-y-2">
                  {!canAfford && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-[#BAE6FD]">
                        <span>Need {shortfall} more pts</span>
                        <span className="tabular-nums">
                          {availablePoints}/{reward.pointsCost}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#081A2E] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[rgba(56,189,248,0.7)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {onRedeem && (
                    <button
                      type="button"
                      disabled={!canAfford || Boolean(redeemingRewardId)}
                      onClick={() => onRedeem(reward.id)}
                      className={`w-full min-h-[38px] px-3 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                        canAfford
                          ? 'bg-[#1D4ED8] hover:bg-[#1E40AF] text-white cursor-pointer shadow-sm'
                          : 'bg-[#081A2E] border border-[#25578A] text-[rgba(186,230,253,0.55)] cursor-not-allowed'
                      }`}
                    >
                      <Ticket className="w-3.5 h-3.5" />
                      <span>{isRedeeming ? 'Redeeming...' : `Redeem (${reward.pointsCost} pts)`}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active & Redeemed Vouchers */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#F0F9FF] flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-amber-300" />
          <span>Available Redemption Vouchers ({vouchers.length})</span>
        </h4>

        {vouchers.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-[rgba(14,41,71,0.7)] border border-[#25578A] text-[11px] text-[#BAE6FD]">
            No vouchers claimed yet. Earn points with every food order and redeem them above for
            discounts on Dining, PS5 Arena, or 8-Ball Pool!
          </div>
        ) : (
          <div className="space-y-2">
            {vouchers.map((v) => {
              const isUsed = v.status === 'used';
              const { label: catLabel } = getCategoryMeta(v.category);
              const targetType: 'ps5' | 'pool' =
                v.category === 'pool' ? 'pool' : 'ps5';

              return (
                <div
                  key={v.id}
                  className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 text-xs ${
                    isUsed
                      ? 'bg-[rgba(8,26,46,0.7)] border-[rgba(37,87,138,0.7)] opacity-75'
                      : 'bg-[#0E2947] border-[rgba(56,189,248,0.5)]'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#38BDF8]">{v.code}</span>
                      {onCopyCode && (
                        <button
                          type="button"
                          onClick={() => onCopyCode(v.code)}
                          className="inline-flex items-center gap-1 text-[10px] text-[#BAE6FD] hover:text-white cursor-pointer"
                          title="Copy voucher code"
                        >
                          {copiedCode === v.code ? (
                            <Check className="w-3 h-3 text-emerald-300" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          isUsed
                            ? 'bg-[#13355B] text-[#BAE6FD]'
                            : 'bg-[rgba(16,185,129,0.2)] text-emerald-200 border border-[rgba(52,211,153,0.4)]'
                        }`}
                      >
                        {isUsed ? `Used (#${v.usedBookingId || 'Booked'})` : 'Active'}
                      </span>
                    </div>
                    <div className="font-semibold text-[#F0F9FF] truncate">
                      {v.title} · <span className="text-[#BAE6FD]">{catLabel}</span>
                    </div>
                  </div>

                  {!isUsed && onUseRewardForBooking && (
                    <button
                      type="button"
                      onClick={() => onUseRewardForBooking(targetType, v.code)}
                      className="px-3 min-h-[34px] rounded-xl bg-[#E0F2FE] hover:bg-white text-[#081A2E] font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span>Apply to Booking</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Points Earned Per Order Breakdown */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#F0F9FF] flex items-center gap-1.5">
          <ShoppingBag className="w-4 h-4 text-[#38BDF8]" />
          <span>Points Earned Per Order ({orders.length})</span>
        </h4>

        {orders.length === 0 ? (
          <div className="p-4 rounded-xl bg-[rgba(14,41,71,0.7)] border border-[#25578A] text-center text-xs space-y-1">
            <p className="font-bold text-[#F0F9FF]">No orders yet</p>
            <p className="text-[11px] text-[#BAE6FD]">
              Place an order from our menu book to start earning 1 Loyalty Point per ₹10 spent.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => {
              const pts = calculateOrderPoints(o.subtotal, o.status);
              const isCancelled = (o.status || '').toLowerCase() === 'cancelled';

              return (
                <div
                  key={`pts-${o.id}`}
                  className="p-3 rounded-xl bg-[#0E2947] border border-[#25578A] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#F0F9FF]">Order #{o.id}</span>
                      <span className="text-[10px] text-[#BAE6FD]">
                        ₹{o.subtotal} · {o.diningMode === 'dine-in' ? 'Dine-In' : 'Takeaway'}
                      </span>
                    </div>
                    <span className="text-[10px] text-[rgba(186,230,253,0.75)] block mt-0.5">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Recent Order'}{' '}
                      · {getOrderDisplayLabel(o.status)}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] tabular-nums shrink-0 border ${
                      isCancelled
                        ? 'bg-[#081A2E] border-[#25578A] text-[rgba(186,230,253,0.55)]'
                        : 'bg-[rgba(245,158,11,0.15)] border-[rgba(251,191,36,0.45)] text-amber-200'
                    }`}
                  >
                    {isCancelled ? '0 pts' : `+${pts} pts`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
