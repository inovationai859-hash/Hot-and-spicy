import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../types';
import {
  X,
  ShoppingBag,
  Trash2,
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  MapPin,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useToast } from '../context/ToastContext';
import { WhatsAppIcon } from './WhatsAppIcon';
import { playOrderConfirmed, playWhatsAppClick } from '../utils/sound';
import { useDialogKeyboard, scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';
import { calculateOrderPoints } from '../lib/loyalty';
import { normalizeWhatsAppDigits } from '../data/catalogData';

interface OrderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
}

export const OrderDrawer: React.FC<OrderDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { userProfile, saveOrderRecord, openAuthModal } = useAuth();
  const { venueSettings } = useCatalog();
  const { showToast } = useToast();
  const drawerRef = useRef<HTMLDivElement>(null);

  const whatsappDigits = normalizeWhatsAppDigits(venueSettings.whatsappNumber);
  const whatsappDisplay = venueSettings.whatsappNumber;

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [diningMode, setDiningMode] = useState<'dine-in' | 'takeaway'>('takeaway');
  const [is18Confirmed, setIs18Confirmed] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    orderId: string;
    name: string;
    total: number;
    waUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!userProfile) {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setIs18Confirmed(false);
      setConfirmedOrder(null);
      setOrderError('');
      return;
    }

    setOrderError('');
    if (userProfile.name) setCustomerName((prev) => (prev.trim() ? prev : userProfile.name));
    if (userProfile.phone) {
      const stripped = userProfile.phone.replace(/^\+\d+\s*/, '');
      setCustomerPhone((prev) => (prev.trim() ? prev : stripped));
    }
    if (userProfile.address) {
      setCustomerAddress((prev) => (prev.trim() ? prev : userProfile.address!));
    }
    if (userProfile.is18Plus) {
      setIs18Confirmed(true);
    }
  }, [userProfile, isOpen]);

  const subtotal = items.reduce((sum, item) => sum + item.combo.price * item.quantity, 0);

  const handleWhatsAppOrder = async () => {
    setOrderError('');

    if (!userProfile) {
      openAuthModal('signin');
      return;
    }

    if (items.length === 0) {
      setOrderError('Your order bag is empty.');
      return;
    }

    if (!customerName.trim()) {
      setOrderError('Please enter your name.');
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setOrderError('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    if (!customerAddress.trim()) {
      setOrderError('Please enter your delivery address or dining table.');
      return;
    }

    if (!is18Confirmed) {
      setOrderError('You must confirm you are 18 years of age or older to order.');
      return;
    }

    setIsSubmitting(true);
    const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;

    const itemsSummary = items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.combo.name} x${it.quantity} (${it.variant === 'veg' ? 'Pure Veg' : 'Classic'} | ${it.drinkChoice}) - ₹${it.combo.price * it.quantity}${
            it.specialInstructions ? ` [Note: ${it.specialInstructions}]` : ''
          }`
      )
      .join('\n');

    try {
      const orderId = await saveOrderRecord({
        customerName: customerName.trim(),
        phone: formattedPhone,
        address: customerAddress.trim(),
        diningMode,
        itemsSummary,
        subtotal,
        is18Confirmed: true,
      });

      const msg = encodeURIComponent(
        `*HOT & SPICY - FOOD & BEVERAGE ORDER*\n` +
        `Order Ref: #${orderId}\n` +
        `Mode: ${diningMode === 'dine-in' ? 'Dine-In / Lounge Table' : 'Takeaway / Delivery'}\n` +
        `--------------------------------\n` +
        `Customer: ${customerName.trim()}\n` +
        `WhatsApp No: ${formattedPhone}\n` +
        `Address: ${customerAddress.trim()}\n` +
        `18+ Confirmed: YES\n` +
        `--------------------------------\n` +
        `ITEMS:\n${itemsSummary}\n` +
        `--------------------------------\n` +
        `*TOTAL PAYABLE: ₹${subtotal}*\n` +
        `${venueSettings.address} · Kitchen Last Order ${venueSettings.kitchenLastOrder}`
      );

      const directWaUrl = `https://wa.me/${whatsappDigits}?text=${msg}`;

      playOrderConfirmed();
      setConfirmedOrder({
        orderId,
        name: customerName.trim(),
        total: subtotal,
        waUrl: directWaUrl,
      });
      const earnedPts = calculateOrderPoints(subtotal, 'Pending');
      onClearCart();
      showToast({
        variant: 'success',
        title: 'Order Logged',
        description: `Ref #${orderId} · ₹${subtotal} confirmed${
          earnedPts > 0 ? ` (+${earnedPts} Loyalty Pts earned)` : ''
        }.`,
        durationMs: 4500,
      });
    } catch (err: any) {
      setOrderError(err.message || 'Unable to process order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseDrawer = () => {
    setConfirmedOrder(null);
    setOrderError('');
    onClose();
  };

  useDialogKeyboard(isOpen, handleCloseDrawer, drawerRef);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="order-backdrop"
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleCloseDrawer}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[1100] flex justify-end bg-[rgba(0,0,0,0.75)] overscroll-none"
        >
          <motion.div
            ref={drawerRef}
            key="order-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-drawer-title"
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border-l border-neutral-200 h-[100dvh] sm:h-full flex flex-col justify-between shadow-2xl text-black will-change-transform focus:outline-none"
          >
            {/* Header (Crisp White & Black) */}
            <div className="shrink-0 p-4 sm:p-5 bg-white border-b border-neutral-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[40px] rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-black text-xs font-bold cursor-pointer shrink-0"
                  aria-label="Back to menu"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="p-2 rounded-xl bg-neutral-100 border border-neutral-300 text-black shrink-0 hidden min-[360px]:flex">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 id="order-drawer-title" className="font-luxury text-base sm:text-lg font-bold text-black truncate">
                    {confirmedOrder ? 'Order Confirmed' : 'Your Order Cart'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDrawer}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-700 hover:text-black hover:bg-neutral-100 border border-transparent hover:border-neutral-200 cursor-pointer shrink-0"
                aria-label="Close order drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div
              data-lenis-prevent
              data-dialog-scroll
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onFocusCapture={scrollFocusedInputIntoView}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain p-5 space-y-4 bg-white text-black"
            >
              {confirmedOrder ? (
                <div className="py-6 px-3 text-center space-y-5">
                  <div className="w-16 h-16 rounded-full bg-neutral-100 border-2 border-black text-black mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-widest text-neutral-600 font-bold block">
                      Order #{confirmedOrder.orderId}
                    </span>
                    <h4 className="font-luxury text-2xl sm:text-3xl font-bold text-black">
                      Thank You, {confirmedOrder.name}!
                    </h4>
                    <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed max-w-sm mx-auto">
                      Warm greetings from Hot &amp; Spicy! Your order of <strong className="text-black">₹{confirmedOrder.total}</strong> has been logged for fresh preparation in our Bansberia kitchen.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-left text-xs space-y-1.5 text-neutral-700">
                    <div className="flex justify-between">
                      <span>Loyalty Points Earned:</span>
                      <strong className="text-black">
                        +{calculateOrderPoints(confirmedOrder.total, 'Pending')} pts
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Kitchen Last Order:</span>
                      <strong className="text-black">{venueSettings.kitchenLastOrder} Daily</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Admin Direct Line:</span>
                      <strong className="text-black">{whatsappDisplay}</strong>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <a
                      href={confirmedOrder.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => playWhatsAppClick()}
                      className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
                    >
                      <WhatsAppIcon className="w-4 h-4" />
                      <span>Open WhatsApp Dispatch ({whatsappDisplay})</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleCloseDrawer}
                      className="w-full min-h-[44px] rounded-xl bg-white border border-neutral-300 hover:border-black text-black font-semibold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Continue Browsing Menu
                    </button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <ShoppingBag className="w-12 h-12 text-neutral-300 mx-auto" />
                  <p className="text-sm font-semibold text-black">
                    Your order bag is empty
                  </p>
                  <p className="text-xs text-neutral-600 max-w-xs mx-auto">
                    Flip through the Digital Book Menu to add dishes before {venueSettings.kitchenLastOrder} last order.
                  </p>

                  {!userProfile && (
                    <div className="mt-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-left space-y-3">
                      <p className="text-xs text-neutral-700 font-medium text-center">
                        Sign in or verify your phone number to place an order quickly.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openAuthModal('signin')}
                          className="min-h-[42px] px-3 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Sign In
                        </button>
                        <button
                          type="button"
                          onClick={() => openAuthModal('signup')}
                          className="min-h-[42px] px-3 rounded-xl bg-white hover:bg-neutral-100 text-black border border-black text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Sign Up
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-white border border-neutral-300 hover:border-black text-black text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Menu</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-black text-sm font-luxury">
                              {item.combo.name}
                            </h4>
                            <div className="text-[11px] text-neutral-600 mt-0.5">
                              {item.variant === 'veg' ? 'Pure Veg' : 'Classic'} · {item.drinkChoice}
                            </div>
                            {item.specialInstructions && (
                              <div className="text-[10px] text-neutral-700 italic mt-0.5">
                                Note: {item.specialInstructions}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(idx)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-500 hover:text-black hover:bg-[rgba(229,229,229,0.7)] cursor-pointer shrink-0"
                            aria-label={`Remove ${item.combo.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                          <div className="flex items-center gap-2 bg-white border border-neutral-300 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(idx, item.quantity - 1)}
                              className="w-8 h-8 rounded bg-black text-white flex items-center justify-center font-bold cursor-pointer hover:bg-neutral-800"
                              aria-label="Decrease quantity"
                            >
                              -
                            </button>
                            <span className="font-bold text-black px-2 tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(idx, item.quantity + 1)}
                              className="w-8 h-8 rounded bg-black text-white flex items-center justify-center font-bold cursor-pointer hover:bg-neutral-800"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          <div className="font-bold text-black text-sm tabular-nums">
                            ₹{item.combo.price * item.quantity}
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={onClearCart}
                      className="text-[11px] text-neutral-600 hover:text-black underline inline-flex items-center justify-center min-h-[36px] px-3 mx-auto block cursor-pointer"
                    >
                      Clear all items
                    </button>
                  </div>

                  {/* Mandatory Sign In / Sign Up Gate Before Checkout */}
                  {!userProfile ? (
                    <div className="pt-3 border-t border-neutral-200 space-y-3 text-xs">
                      <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-300 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <ShieldCheck className="w-5 h-5 text-black shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-bold text-sm text-black">
                              Sign In or Sign Up First
                            </h4>
                            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                              Please sign in or verify your mobile number before placing your food order. Your cart items will stay saved.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => openAuthModal('signin')}
                            className="min-h-[44px] px-3 rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            Sign In
                          </button>
                          <button
                            type="button"
                            onClick={() => openAuthModal('signup')}
                            className="min-h-[44px] px-3 rounded-xl bg-white hover:bg-neutral-100 text-black border border-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Sign Up
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-neutral-200 space-y-3.5 text-xs">
                      {orderError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{orderError}</span>
                        </div>
                      )}

                      {/* Mode Switcher */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-neutral-700 font-semibold mb-1.5">
                          Dining Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setDiningMode('dine-in')}
                            className={`min-h-[42px] px-3 rounded-xl border font-bold cursor-pointer ${
                              diningMode === 'dine-in'
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-300 bg-white text-neutral-700 hover:border-black hover:text-black'
                            }`}
                          >
                            Dine-In / Lounge
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiningMode('takeaway')}
                            className={`min-h-[42px] px-3 rounded-xl border font-bold cursor-pointer ${
                              diningMode === 'takeaway'
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-300 bg-white text-neutral-700 hover:border-black hover:text-black'
                            }`}
                          >
                            Takeaway / Delivery
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-black font-semibold mb-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-neutral-700" />
                          <span>Your Name *</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="e.g. Suman Sen"
                          className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-black font-semibold mb-1 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-neutral-700" />
                          <span>WhatsApp Number (+91) *</span>
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3.5 text-sm sm:text-xs font-bold text-black pointer-events-none">
                            +91
                          </span>
                          <input
                            type="tel"
                            inputMode="numeric"
                            required
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="9876543210"
                            className="w-full bg-white border border-neutral-300 rounded-xl pl-12 pr-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-black font-semibold mb-1 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-neutral-700" />
                          <span>Delivery / Table Address *</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder="e.g. Boropara More, Dingalhat / Table 4, Bansberia"
                          className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                      </div>

                      <label
                        className={`p-3 rounded-xl border cursor-pointer select-none flex items-center gap-2.5 ${
                          is18Confirmed
                            ? 'bg-neutral-100 border-black text-black'
                            : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={is18Confirmed}
                          onChange={(e) => setIs18Confirmed(e.target.checked)}
                          className="w-4 h-4 accent-black cursor-pointer shrink-0"
                        />
                        <span className="font-bold text-xs text-black">
                          I confirm I am 18 years or older *
                        </span>
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!confirmedOrder && items.length > 0 && (
              <div className="shrink-0 p-5 bg-white border-t border-neutral-200 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600 font-medium">Subtotal</span>
                  <span className="font-bold text-black text-lg tabular-nums">
                    ₹{subtotal}
                  </span>
                </div>

                {!userProfile ? (
                  <button
                    type="button"
                    onClick={() => openAuthModal('signin')}
                    className="w-full min-h-[48px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In / Sign Up to Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleWhatsAppOrder}
                    disabled={isSubmitting}
                    className="w-full min-h-[48px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 text-white" />
                    <span>{isSubmitting ? 'Confirming Order...' : `Order via WhatsApp (${whatsappDisplay})`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <p className="text-[10px] text-center text-neutral-600">
                  {!userProfile
                    ? 'Sign in or create an account to confirm your order.'
                    : 'Opens WhatsApp to send your order.'}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
