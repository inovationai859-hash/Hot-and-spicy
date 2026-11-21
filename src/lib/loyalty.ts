import type { LoyaltyRewardOption, UserOrderRecord } from '../types';

export const LOYALTY_EARN_RUPEES_PER_POINT = 10;

export function calculateOrderPoints(
  subtotal: number,
  status?: UserOrderRecord['status'] | string
): number {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'cancelled') return 0;
  const numericSubtotal = Number(subtotal);
  if (!Number.isFinite(numericSubtotal) || numericSubtotal <= 0) return 0;
  return Math.floor(numericSubtotal / LOYALTY_EARN_RUPEES_PER_POINT);
}

export const LOYALTY_REWARDS_CATALOG: LoyaltyRewardOption[] = [
  {
    id: 'dining-50',
    title: '₹50 Off Dining Table',
    category: 'dining',
    discountAmount: 50,
    pointsCost: 50,
    tagline: 'Redeem on your next restaurant table reservation.',
  },
  {
    id: 'pool-60',
    title: 'Free 15m 8-Ball Pool Match',
    category: 'pool',
    discountAmount: 60,
    pointsCost: 60,
    tagline: 'Save ₹60 on a 15-minute 8-Ball Pool table session.',
  },
  {
    id: 'ps5-100',
    title: '₹100 Off PS5 4K Arena',
    category: 'ps5',
    discountAmount: 100,
    pointsCost: 95,
    tagline: 'Apply ₹100 off your next PS5 Pro console booking.',
  },
  {
    id: 'combo-150',
    title: '₹150 Off Dining or Gaming',
    category: 'any',
    discountAmount: 150,
    pointsCost: 140,
    tagline: 'Flexible VIP discount for any Dining, PS5, or Pool slot.',
  },
];

export interface LoyaltyTierInfo {
  name: string;
  nextTierName: string | null;
  nextTierThreshold: number | null;
  progressPercent: number;
  pointsToNext: number;
}

export function getLoyaltyTier(earnedPoints: number): LoyaltyTierInfo {
  const pts = Math.max(0, Math.floor(Number(earnedPoints) || 0));

  if (pts >= 600) {
    return {
      name: 'Gold Royalty',
      nextTierName: null,
      nextTierThreshold: null,
      progressPercent: 100,
      pointsToNext: 0,
    };
  }
  if (pts >= 300) {
    return {
      name: 'Silver VIP',
      nextTierName: 'Gold Royalty',
      nextTierThreshold: 600,
      progressPercent: Math.min(100, Math.round(((pts - 300) / 300) * 100)),
      pointsToNext: 600 - pts,
    };
  }
  if (pts >= 100) {
    return {
      name: 'Bronze Lounge',
      nextTierName: 'Silver VIP',
      nextTierThreshold: 300,
      progressPercent: Math.min(100, Math.round(((pts - 100) / 200) * 100)),
      pointsToNext: 300 - pts,
    };
  }
  return {
    name: 'Spicy Insider',
    nextTierName: 'Bronze Lounge',
    nextTierThreshold: 100,
    progressPercent: Math.min(100, Math.round((pts / 100) * 100)),
    pointsToNext: 100 - pts,
  };
}

export function calculateLoyaltyFromOrders(
  orders: Array<Pick<UserOrderRecord, 'subtotal' | 'status'>>,
  vouchers: Array<{ pointsCost?: number }> = []
): {
  earnedPoints: number;
  spentPoints: number;
  availablePoints: number;
  tierName: string;
  eligibleOrdersCount: number;
} {
  let earnedPoints = 0;
  let eligibleOrdersCount = 0;

  for (const order of orders) {
    const pts = calculateOrderPoints(order.subtotal, order.status);
    if (pts > 0) {
      earnedPoints += pts;
      eligibleOrdersCount += 1;
    } else if (String(order.status || '').trim().toLowerCase() !== 'cancelled' && Number(order.subtotal) > 0) {
      eligibleOrdersCount += 1;
    }
  }

  const spentPoints = vouchers.reduce(
    (sum, v) => sum + Math.max(0, Math.floor(Number(v.pointsCost) || 0)),
    0
  );
  const availablePoints = Math.max(0, earnedPoints - spentPoints);
  const tierName = getLoyaltyTier(earnedPoints).name;

  return {
    earnedPoints,
    spentPoints,
    availablePoints,
    tierName,
    eligibleOrdersCount,
  };
}
