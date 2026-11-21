import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ComboPack, CartItem } from '../types';
import { X, Check, ShoppingBag } from 'lucide-react';
import { useDialogKeyboard, scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';

interface ComboCustomizerModalProps {
  combo: ComboPack | null;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ComboCustomizerModal: React.FC<ComboCustomizerModalProps> = ({
  combo,
  onClose,
  onAddToCart,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(Boolean(combo), onClose, dialogRef);

  const [variant, setVariant] = useState<'standard' | 'veg' | 'extra-spicy'>('standard');
  const [drinkChoice, setDrinkChoice] = useState('Chilled Coke (250ml)');
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const drinkOptions = [
    'Chilled Coke (250ml)',
    'Sprite (250ml)',
    'Thums Up (250ml)',
    'Lemon Iced Tea',
    'Chilled Mineral Water',
  ];

  const handleAdd = () => {
    if (!combo) return;
    onAddToCart({
      combo,
      quantity,
      variant,
      drinkChoice,
      specialInstructions,
    });
    onClose();
  };

  const totalPrice = combo ? combo.price * quantity : 0;

  return (
    <AnimatePresence>
      {combo && (
        <motion.div
          key="customizer-backdrop"
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
            key="customizer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customizer-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-2xl bg-[rgba(8,26,46,0.98)] border border-[rgba(56,189,248,0.35)] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90dvh] flex flex-col text-[#F0F9FF] focus:outline-none"
          >
            {/* Header */}
            <div className="shrink-0 p-5 bg-[rgba(14,41,71,0.9)] border-b border-[#25578A] flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#BAE6FD] font-semibold">
              Customize Order Item
            </div>
            <h3 id="customizer-modal-title" className="font-luxury text-xl font-bold text-[#F0F9FF] mt-0.5">
              {combo.name}
            </h3>
            <p className="text-xs text-[#38BDF8] font-bold tabular-nums mt-0.5">
              ₹{combo.price}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customizer modal"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#BAE6FD] hover:text-white hover:bg-[#13355B] cursor-pointer"
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
          className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain space-y-5 text-xs"
        >
          {combo.isVegAvailable && (
            <div>
              <label className="block text-[#BAE6FD] font-semibold mb-2 uppercase tracking-wider text-[11px]">
                Preparation Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVariant('standard')}
                  className={`min-h-[44px] p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                    variant === 'standard'
                      ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] font-bold'
                      : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD]'
                  }`}
                >
                  <span>Classic Non-Veg</span>
                  {variant === 'standard' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setVariant('veg')}
                  className={`min-h-[44px] p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                    variant === 'veg'
                      ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] font-bold'
                      : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD]'
                  }`}
                >
                  <span>Pure Veg</span>
                  {variant === 'veg' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[#BAE6FD] font-semibold mb-2 uppercase tracking-wider text-[11px]">
              Beverage Pairing
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {drinkOptions.map((drink) => (
                <button
                  key={drink}
                  type="button"
                  onClick={() => setDrinkChoice(drink)}
                  className={`min-h-[40px] px-3 rounded-xl border text-left text-xs cursor-pointer ${
                    drinkChoice === drink
                      ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] font-bold'
                      : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD]'
                  }`}
                >
                  {drink}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#BAE6FD] font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
              Kitchen Notes (Optional)
            </label>
            <input
              type="text"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Extra mint dip, mild spice"
              className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] placeholder-[rgba(186,230,253,0.4)] focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#25578A]">
            <span className="text-[#F0F9FF] font-semibold text-xs uppercase tracking-wider">
              Quantity
            </span>
            <div className="flex items-center gap-3 bg-[#0E2947] border border-[#25578A] rounded-xl p-1">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-[#13355B] text-[#E0F2FE] flex items-center justify-center font-bold text-sm hover:bg-[#1D4ED8] cursor-pointer"
              >
                -
              </button>
              <span className="font-bold text-[#F0F9FF] tabular-nums px-2 text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-[#13355B] text-[#E0F2FE] flex items-center justify-center font-bold text-sm hover:bg-[#1D4ED8] cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-5 bg-[#0E2947] border-t border-[#25578A] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[#BAE6FD]">Total</div>
            <div className="text-xl font-bold text-[#38BDF8] tabular-nums">
              ₹{totalPrice}
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="px-6 min-h-[46px] rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-xs uppercase tracking-wider shadow-md flex items-center gap-2 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Order</span>
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
