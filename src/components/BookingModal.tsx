import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Calendar,
  Clock,
  Users,
  Phone,
  User,
  MapPin,
  CheckCircle2,
  Gamepad2,
  Trophy,
  AlertCircle,
  Ticket,
} from 'lucide-react';
import { ReservationRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useToast } from '../context/ToastContext';
import { WhatsAppIcon } from './WhatsAppIcon';
import { playOrderConfirmed, playWhatsAppClick } from '../utils/sound';
import { useDialogKeyboard, scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';
import { getIstDateString } from '../lib/orderNormalizer';
import { normalizeWhatsAppDigits } from '../data/catalogData';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillType?: 'dining' | 'ps5' | 'pool';
  prefillVoucherCode?: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  prefillType = 'ps5',
  prefillVoucherCode,
}) => {
  const { userProfile, saveBookingRecord, loyalty } = useAuth();
  const { gamingRates, venueSettings } = useCatalog();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);

  const whatsappDigits = normalizeWhatsAppDigits(venueSettings.whatsappNumber);
  const whatsappDisplay = venueSettings.whatsappNumber;

  const [bookingType, setBookingType] = useState<'ps5' | 'pool'>(
    prefillType === 'pool' ? 'pool' : 'ps5'
  );
  const [poolDuration, setPoolDuration] = useState<'15min' | '30min' | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(() => getIstDateString());
  const [timeSlot, setTimeSlot] = useState('07:00 PM');
  const [guests, setGuests] = useState<2 | 4 | null>(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string>('');
  const [is18Confirmed, setIs18Confirmed] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string; waUrl: string; summary?: string } | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!userProfile) {
      setName('');
      setPhone('');
      setAddress('');
      setIs18Confirmed(false);
      setConfirmation(null);
      setSelectedVoucherCode('');
      return;
    }
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    if (userProfile.name) setName(userProfile.name);
    if (userProfile.phone) {
      setPhone(userProfile.phone.replace(/^\+\d+\s*/, ''));
    }
    if (userProfile.address) setAddress(userProfile.address);
    if (userProfile.is18Plus) setIs18Confirmed(true);
  }, [userProfile, isOpen]);

  useEffect(() => {
    const resolved = prefillType === 'pool' ? 'pool' : 'ps5';
    setBookingType(resolved);
    if (resolved !== 'pool') {
      setPoolDuration('');
    }
  }, [prefillType]);

  useEffect(() => {
    if (!isOpen) return;
    if (prefillVoucherCode) {
      setSelectedVoucherCode(prefillVoucherCode);
    }
  }, [isOpen, prefillVoucherCode]);

  const compatibleVouchers = React.useMemo(
    () =>
      loyalty.vouchers.filter(
        (v) => v.status === 'active' && (v.category === 'any' || v.category === bookingType)
      ),
    [loyalty.vouchers, bookingType]
  );

  useEffect(() => {
    if (selectedVoucherCode && !compatibleVouchers.some((v) => v.code === selectedVoucherCode)) {
      setSelectedVoucherCode('');
    }
  }, [compatibleVouchers, selectedVoucherCode]);

  const selectedVoucher = compatibleVouchers.find((v) => v.code === selectedVoucherCode);

  // Accurate venue hours: 1:30 PM – 10:00 PM (Kitchen last order: 9:30 PM)
  const timeSlots = [
    '01:30 PM',
    '02:30 PM',
    '04:00 PM',
    '05:30 PM',
    '07:00 PM',
    '08:00 PM',
    '09:00 PM',
    '09:30 PM',
  ];

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (bookingType === 'pool' && !poolDuration) {
      setValidationError('Please select your 8-Ball Pool duration (15 min or 30 min).');
      return;
    }

    if (!name.trim()) {
      setValidationError('Please enter your full name.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setValidationError('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    if (!address.trim()) {
      setValidationError('Please enter your address / locality.');
      return;
    }

    if (guests !== 2 && guests !== 4) {
      setValidationError('Please select the number of guests (2 or 4 people).');
      return;
    }

    if (!is18Confirmed) {
      setValidationError('You must confirm you are 18 years or older to reserve.');
      return;
    }

    setIsSubmitting(true);
    const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;

    const selectedPoolDuration =
      bookingType === 'pool' && (poolDuration === '15min' || poolDuration === '30min')
        ? poolDuration
        : undefined;

    const bookingPayload: ReservationRequest = {
      name: name.trim(),
      phone: formattedPhone,
      address: address.trim(),
      bookingType,
      poolDuration: selectedPoolDuration,
      date,
      timeSlot,
      guests,
      specialRequests: specialRequests.trim(),
      is18Confirmed: true,
      ...(selectedVoucher ? { voucherCode: selectedVoucher.code } : {}),
    };

    try {
      const bookingId = await saveBookingRecord(bookingPayload);

      const experienceLabel =
        bookingType === 'pool' ? '8-Ball Pool Table' : 'PS5 Arena Gaming Slot';

      const poolDurationLabel =
        selectedPoolDuration === '15min'
          ? `15 Minutes (₹${gamingRates.pool15Price})`
          : selectedPoolDuration === '30min'
          ? `30 Minutes (₹${gamingRates.pool30Price})`
          : '';

      const whatsappText = encodeURIComponent(
        `*HOT & SPICY - RESERVATION BOOKING*\n` +
        `Ref: #${bookingId}\n` +
        `Experience: ${experienceLabel}\n` +
        (poolDurationLabel ? `Pool Duration: ${poolDurationLabel}\n` : '') +
        (selectedVoucher
          ? `Loyalty Reward Applied: ${selectedVoucher.title} (-₹${selectedVoucher.discountAmount}, Code: ${selectedVoucher.code})\n`
          : '') +
        `--------------------------------\n` +
        `Name: ${name.trim()}\n` +
        `WhatsApp: ${formattedPhone}\n` +
        `Address: ${address.trim()}\n` +
        `Date: ${date}\n` +
        `Time Slot: ${timeSlot}\n` +
        `Guests: ${guests}\n` +
        `18+ Confirmed: YES\n` +
        (specialRequests ? `Note: ${specialRequests.trim()}\n` : '') +
        `--------------------------------\n` +
        `Please confirm our slot booking!`
      );

      const directWaUrl = `https://wa.me/${whatsappDigits}?text=${whatsappText}`;

      playOrderConfirmed();
      const baseSummary = poolDurationLabel
        ? `${experienceLabel} — ${poolDurationLabel}`
        : experienceLabel;
      const summaryText = selectedVoucher
        ? `${baseSummary} · Reward ${selectedVoucher.code} (-₹${selectedVoucher.discountAmount})`
        : baseSummary;
      setConfirmation({
        id: bookingId,
        waUrl: directWaUrl,
        summary: summaryText,
      });
      setSelectedVoucherCode('');
      showToast({
        variant: 'booking',
        title: 'Booking Confirmed',
        description: `${summaryText} on ${date} at ${timeSlot} (Ref #${bookingId})`,
        durationMs: 4800,
      });
    } catch (err: any) {
      setValidationError(err.message || 'Failed to submit reservation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setConfirmation(null);
    setValidationError('');
    setPoolDuration('');
    setGuests(null);
    setSelectedVoucherCode('');
    onClose();
  };

  useDialogKeyboard(isOpen, handleReset, dialogRef);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="booking-backdrop"
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleReset}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4 bg-[rgba(3,11,22,0.9)] overscroll-none"
        >
          <motion.div
            ref={dialogRef}
            key="booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl rounded-2xl bg-[rgba(8,26,46,0.98)] border border-[rgba(56,189,248,0.35)] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90dvh] flex flex-col text-[#F0F9FF] focus:outline-none"
          >
            {/* Header (Atlantic Blue & Soft Sky Glass) */}
            <div className="shrink-0 p-5 sm:p-6 bg-[rgba(14,41,71,0.9)] border-b border-[#25578A] flex items-center justify-between">
          <div>
            <h3 id="booking-modal-title" className="font-luxury text-xl sm:text-2xl font-bold text-[#F0F9FF]">
              Reserve Your Slot
            </h3>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#BAE6FD] hover:text-white hover:bg-[#13355B] cursor-pointer"
            aria-label="Close modal"
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
          className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain space-y-5"
        >
          {confirmation ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#13355B] border-2 border-[#38BDF8] text-[#38BDF8] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-[#7DD3FC] font-mono font-bold tracking-wider block">
                  REFERENCE #{confirmation.id}
                </span>
                <h4 className="font-luxury text-2xl sm:text-3xl font-bold text-[#F0F9FF]">
                  Welcome, {name}! Your Booking is Logged
                </h4>
                <p className="text-xs sm:text-sm text-[#BAE6FD] pt-1 max-w-md mx-auto leading-relaxed">
                  Our floor team at {venueSettings.address} looks forward to hosting you on <strong className="text-white">{date}</strong> at <strong className="text-white">{timeSlot}</strong>
                  {confirmation.summary ? (
                    <>
                      {' '}for <strong className="text-[#38BDF8]">{confirmation.summary}</strong>
                    </>
                  ) : null}
                  .
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <a
                  href={confirmation.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playWhatsAppClick()}
                  className="inline-flex items-center justify-center gap-2 px-5 min-h-[46px] rounded-xl bg-[#25D366] hover:bg-[#1EB954] text-white font-bold text-xs uppercase tracking-wider shadow-md"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Open WhatsApp ({whatsappDisplay})</span>
                </a>
                <button
                  onClick={handleReset}
                  className="px-5 min-h-[46px] rounded-xl border border-[#25578A] bg-[#0E2947] text-[#E0F2FE] font-semibold text-xs uppercase tracking-wider hover:border-[#38BDF8] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBookingSubmit} className="space-y-4 text-xs">
              {validationError && (
                <div className="p-3 rounded-xl bg-[#13355B] border border-[#38BDF8] text-[#E0F2FE] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Experience Type (Gaming Slots Only) */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#BAE6FD] mb-2">
                  1. Select Experience
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <motion.button
                    type="button"
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setBookingType('ps5');
                      setPoolDuration('');
                      setValidationError('');
                    }}
                    className={`min-h-[52px] p-3 rounded-xl border text-xs font-semibold flex sm:flex-col items-center justify-center gap-2 sm:gap-1 cursor-pointer ${
                      bookingType === 'ps5'
                        ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E]'
                        : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD] hover:border-[rgba(56,189,248,0.6)] hover:text-white'
                    }`}
                  >
                    <Gamepad2 className="w-4 h-4" />
                    <span>PS5 Arena</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setBookingType('pool');
                      setValidationError('');
                    }}
                    className={`min-h-[52px] p-3 rounded-xl border text-xs font-semibold flex sm:flex-col items-center justify-center gap-2 sm:gap-1 cursor-pointer ${
                      bookingType === 'pool'
                        ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E]'
                        : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD] hover:border-[rgba(56,189,248,0.6)] hover:text-white'
                    }`}
                  >
                    <Trophy className="w-4 h-4" />
                    <span>8-Ball Pool</span>
                  </motion.button>
                </div>
              </div>

              {/* 8-Ball Pool Session Duration Selector */}
              <AnimatePresence initial={false}>
                {bookingType === 'pool' && (
                  <motion.div
                    key="pool-duration-picker"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3.5 rounded-xl bg-[rgba(14,41,71,0.9)] border border-[rgba(56,189,248,0.4)] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs uppercase tracking-wider font-semibold text-[#E0F2FE] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
                          <span>How long would you like to play? *</span>
                        </label>
                        <span className="text-[10px] font-mono text-[#7DD3FC] uppercase">
                          15m or 30m
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <motion.button
                          type="button"
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setPoolDuration('15min');
                            setValidationError('');
                          }}
                          aria-pressed={poolDuration === '15min'}
                          className={`p-3 rounded-xl border text-left cursor-pointer flex items-center justify-between gap-2 ${
                            poolDuration === '15min'
                              ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] shadow-md'
                              : 'border-[#25578A] bg-[rgba(8,26,46,0.8)] text-[#BAE6FD] hover:border-[rgba(56,189,248,0.6)] hover:text-white'
                          }`}
                        >
                          <div>
                            <span className="block font-bold text-xs sm:text-sm">15 Minutes</span>
                            <span
                              className={`block text-[10px] ${
                                poolDuration === '15min' ? 'text-[rgba(14,41,71,0.8)]' : 'text-[#7DD3FC]'
                              }`}
                            >
                              Quick match
                            </span>
                          </div>
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              poolDuration === '15min' ? 'text-[#081A2E]' : 'text-[#38BDF8]'
                            }`}
                          >
                            ₹{gamingRates.pool15Price}
                          </span>
                        </motion.button>

                        <motion.button
                          type="button"
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setPoolDuration('30min');
                            setValidationError('');
                          }}
                          aria-pressed={poolDuration === '30min'}
                          className={`p-3 rounded-xl border text-left cursor-pointer flex items-center justify-between gap-2 ${
                            poolDuration === '30min'
                              ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] shadow-md'
                              : 'border-[#25578A] bg-[rgba(8,26,46,0.8)] text-[#BAE6FD] hover:border-[rgba(56,189,248,0.6)] hover:text-white'
                          }`}
                        >
                          <div>
                            <span className="block font-bold text-xs sm:text-sm">30 Minutes</span>
                            <span
                              className={`block text-[10px] ${
                                poolDuration === '30min' ? 'text-[rgba(14,41,71,0.8)]' : 'text-[#7DD3FC]'
                              }`}
                            >
                              Extended session
                            </span>
                          </div>
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              poolDuration === '30min' ? 'text-[#081A2E]' : 'text-[#38BDF8]'
                            }`}
                          >
                            ₹{gamingRates.pool30Price}
                          </span>
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs text-[#BAE6FD] font-semibold mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Full Name *</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Suman Sen"
                    className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] placeholder-[rgba(186,230,253,0.4)] focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#BAE6FD] font-semibold mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>WhatsApp Number (+91) *</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-sm sm:text-xs font-bold text-[#38BDF8] pointer-events-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl pl-12 pr-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] placeholder-[rgba(186,230,253,0.4)] focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#BAE6FD] font-semibold mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>Address / Locality *</span>
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Boropara More, Dingalhat, Bansberia"
                  className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] placeholder-[rgba(186,230,253,0.4)] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              {/* Date & Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#BAE6FD] font-semibold mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Date *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#BAE6FD] font-semibold mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Time Slot *</span>
                  </label>
                  <select
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] focus:outline-none focus:border-[#38BDF8]"
                  >
                    {timeSlots.map((ts) => (
                      <option key={ts} value={ts} className="bg-[#0E2947] text-[#F0F9FF]">
                        {ts}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Guests (2 or 4 People) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs text-[#BAE6FD] font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>How many guests? *</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#7DD3FC] uppercase">
                    2 or 4 People
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {([2, 4] as const).map((count) => {
                    const isSelected = guests === count;
                    return (
                      <motion.button
                        key={count}
                        type="button"
                        whileHover={{ y: -2, scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setGuests(count);
                          setValidationError('');
                        }}
                        aria-pressed={isSelected}
                        className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer flex items-center justify-center gap-2 ${
                          isSelected
                            ? 'border-[#E0F2FE] bg-[#E0F2FE] text-[#081A2E] shadow-md'
                            : 'border-[#25578A] bg-[#0E2947] text-[#BAE6FD] hover:border-[rgba(56,189,248,0.6)] hover:text-white'
                        }`}
                      >
                        <Users className={`w-3.5 h-3.5 ${isSelected ? 'text-[#081A2E]' : 'text-[#38BDF8]'}`} />
                        <span>{count} People</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {compatibleVouchers.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#0E2947] border border-[rgba(56,189,248,0.45)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-[#F0F9FF] flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-amber-300" />
                      <span>Apply Loyalty Reward Voucher</span>
                    </label>
                    <span className="text-[10px] text-emerald-300 font-semibold">
                      {compatibleVouchers.length} available
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {compatibleVouchers.map((v) => {
                      const active = selectedVoucherCode === v.code;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() =>
                            setSelectedVoucherCode((curr) => (curr === v.code ? '' : v.code))
                          }
                          className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                            active
                              ? 'border-emerald-400 bg-[rgba(16,185,129,0.2)] text-white'
                              : 'border-[#25578A] bg-[rgba(8,26,46,0.8)] text-[#BAE6FD] hover:border-[#38BDF8]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#38BDF8]">
                              {v.code}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-300">
                              -₹{v.discountAmount}
                            </span>
                          </div>
                          <span className="block text-[11px] font-semibold text-[#F0F9FF] truncate mt-0.5">
                            {v.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#BAE6FD] font-semibold mb-1">
                  Notes / Preferred Game (Optional)
                </label>
                <input
                  type="text"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="e.g. FC 25 co-op, quiet corner table"
                  className="w-full bg-[#0E2947] border border-[#25578A] rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-[#F0F9FF] placeholder-[rgba(186,230,253,0.4)] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <label
                className={`p-3 rounded-xl border cursor-pointer select-none flex items-center gap-2.5 ${
                  is18Confirmed
                    ? 'bg-[#13355B] border-[#38BDF8] text-[#F0F9FF]'
                    : 'bg-[#0E2947] border-[#25578A] text-[#BAE6FD]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={is18Confirmed}
                  onChange={(e) => setIs18Confirmed(e.target.checked)}
                  className="w-4 h-4 accent-[#38BDF8] cursor-pointer shrink-0"
                />
                <span className="font-bold text-xs text-[#F0F9FF]">
                  I confirm I am 18 years or older *
                </span>
              </label>

              <motion.button
                whileHover={isSubmitting ? undefined : { y: -1.5, scale: 1.01 }}
                whileTap={isSubmitting ? undefined : { scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 text-white font-bold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#E0F2FE]" />
                <span>{isSubmitting ? 'Confirming...' : `Book via WhatsApp (${whatsappDisplay})`}</span>
              </motion.button>
            </form>
          )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
