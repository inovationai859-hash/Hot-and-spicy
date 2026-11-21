export interface ComboPack {
  id: string;
  name: string;
  tagline: string;
  price: number;
  originalPrice?: number;
  spicyLevel: 1 | 2 | 3;
  category: 'tandoor' | 'asian' | 'burger' | 'pizza' | 'crispy' | 'chowmein';
  isVegAvailable: boolean;
  items: string[];
  description: string;
  serves: string;
  popularBadge?: string;
  imageAlt: string;
}

export type DietaryPreference = 'all' | 'veg' | 'non-veg';

export interface MenuItem {
  id: string;
  name: string;
  category: 'starters' | 'tandoor' | 'pizza_burger' | 'asian' | 'beverages';
  price: number;
  description: string;
  isVeg: boolean;
  isSpicy?: boolean;
  rating?: number;
}

export interface CartItem {
  combo: ComboPack;
  quantity: number;
  variant: 'standard' | 'veg' | 'extra-spicy';
  drinkChoice: string;
  specialInstructions?: string;
}

export interface ReservationRequest {
  id?: string;
  userId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  bookingType: 'dining' | 'ps5' | 'pool' | 'combo_deal';
  poolDuration?: '15min' | '30min';
  date: string;
  timeSlot: string;
  guests: number;
  specialRequests?: string;
  is18Confirmed: boolean;
  voucherCode?: string;
  discountAmount?: number;
  rewardTitle?: string;
  status?: 'Confirmed' | 'Completed' | 'Cancelled';
  createdAt?: string;
}

export interface ChatGroundingLink {
  title: string;
  uri: string;
  source?: 'web' | 'maps';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modeUsed?: 'balanced' | 'fast' | 'search' | 'maps';
  groundingLinks?: ChatGroundingLink[];
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  phoneVerified?: boolean;
  authProvider?: 'email' | 'phone' | 'google';
  address?: string;
  is18Plus?: boolean;
  dietaryPreference?: DietaryPreference;
  loyaltyPoints?: number;
  earnedPoints?: number;
  spentPoints?: number;
  loyaltyTier?: string;
  loyaltyUpdatedAt?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserOrderRecord {
  id: string;
  userId?: string;
  customerName: string;
  phone: string;
  address: string;
  diningMode: 'dine-in' | 'takeaway';
  itemsSummary: string;
  subtotal: number;
  status?: 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Delivered' | 'Cancelled';
  is18Confirmed: boolean;
  createdAt: string;
}

export type LoyaltyRewardCategory = 'dining' | 'ps5' | 'pool' | 'any';

export interface LoyaltyRewardOption {
  id: string;
  title: string;
  category: LoyaltyRewardCategory;
  discountAmount: number;
  pointsCost: number;
  tagline: string;
}

export interface LoyaltyRewardVoucher {
  id: string;
  userId?: string;
  code: string;
  rewardId: string;
  title: string;
  category: LoyaltyRewardCategory;
  discountAmount: number;
  pointsCost: number;
  status: 'active' | 'used';
  redeemedAt: string;
  usedBookingId?: string;
  usedAt?: string;
}

export interface LoyaltySummary {
  earnedPoints: number;
  spentPoints: number;
  availablePoints: number;
  vouchers: LoyaltyRewardVoucher[];
}
