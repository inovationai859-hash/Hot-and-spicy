import React, { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, Download, Sparkles, Calendar } from 'lucide-react';
import type { ReservationRequest, UserProfile } from '../types';
import { isUpcomingBooking } from './ReservationHistory';

interface LoungeCheckInQrCardProps {
  userProfile: UserProfile;
  tierName: string;
  availablePoints: number;
  bookings?: ReservationRequest[];
}

export const LoungeCheckInQrCard: React.FC<LoungeCheckInQrCardProps> = ({
  userProfile,
  tierName,
  availablePoints,
  bookings = [],
}) => {
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState(false);

  const upcomingBookings = useMemo(
    () => bookings.filter((b) => Boolean(b.id) && isUpcomingBooking(b)),
    [bookings]
  );

  const [selectedBookingId, setSelectedBookingId] = useState<string>('member');

  const activeBooking = useMemo(
    () => upcomingBookings.find((b) => b.id === selectedBookingId) ?? null,
    [upcomingBookings, selectedBookingId]
  );

  const checkInCode = useMemo(() => {
    if (activeBooking?.id) {
      return `HS-${activeBooking.id}`;
    }
    const cleanUid = String(userProfile.uid || 'GUEST')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toUpperCase();
    return `HS-VIP-${cleanUid || 'GUEST'}`;
  }, [activeBooking, userProfile.uid]);

  const qrPayload = useMemo(() => {
    return JSON.stringify({
      v: 1,
      venue: 'Hot & Spicy Boropara',
      code: checkInCode,
      uid: userProfile.uid,
      name: userProfile.name,
      phone: userProfile.phone || '',
      tier: tierName,
      pts: availablePoints,
      ...(activeBooking
        ? {
            bookingId: activeBooking.id,
            type: activeBooking.bookingType,
            date: activeBooking.date,
            timeSlot: activeBooking.timeSlot,
            guests: activeBooking.guests,
          }
        : {}),
    });
  }, [checkInCode, userProfile.uid, userProfile.name, userProfile.phone, tierName, availablePoints, activeBooking]);

  const handleCopyCheckInCode = () => {
    try {
      navigator.clipboard?.writeText(checkInCode);
    } catch {}
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 1800);
  };

  const handleDownloadQr = () => {
    const svgEl = qrWrapperRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${checkInCode.toLowerCase()}-checkin-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section
      aria-label="Quick lounge check-in QR pass"
      className="p-4 rounded-xl bg-[#0E2947] border border-[rgba(56,189,248,0.45)] space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#081A2E] border border-[#38BDF8] flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-[#38BDF8]" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#F0F9FF]">
              Express Lounge Check-In QR
            </h4>
            <p className="text-[10px] text-[#BAE6FD]">
              Show at the Boropara counter for instant table or gaming check-in
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[rgba(16,185,129,0.16)] border border-[rgba(52,211,153,0.4)] text-emerald-200 text-[10px] font-mono font-bold">
          <Sparkles className="w-2.5 h-2.5 text-emerald-300" />
          {checkInCode}
        </span>
      </div>

      {upcomingBookings.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSelectedBookingId('member')}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap cursor-pointer ${
              selectedBookingId === 'member'
                ? 'bg-[#E0F2FE] border-[#E0F2FE] text-[#081A2E]'
                : 'bg-[#081A2E] border-[#25578A] text-[#BAE6FD] hover:border-[#38BDF8]'
            }`}
          >
            Guest VIP Pass
          </button>
          {upcomingBookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBookingId(b.id || 'member')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap cursor-pointer ${
                selectedBookingId === b.id
                  ? 'bg-[#E0F2FE] border-[#E0F2FE] text-[#081A2E]'
                  : 'bg-[#081A2E] border-[#25578A] text-[#BAE6FD] hover:border-[#38BDF8]'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>
                #{b.id} · {b.timeSlot}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl bg-[#081A2E] border border-[#25578A]">
        <div
          ref={qrWrapperRef}
          className="p-2.5 rounded-xl bg-[#FFFFFF] border-2 border-[#38BDF8] shadow-md shrink-0"
          aria-label={`QR code for ${checkInCode}`}
        >
          <QRCodeSVG
            value={qrPayload}
            size={124}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#081A2E"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#7DD3FC] font-bold block">
              {activeBooking
                ? `${activeBooking.bookingType.toUpperCase()} Slot Check-In`
                : `${tierName} Member Pass`}
            </span>
            <p className="text-sm font-bold text-[#F0F9FF] truncate">{userProfile.name}</p>
            <p className="text-[11px] text-[#BAE6FD]">
              {activeBooking
                ? `${activeBooking.date} · ${activeBooking.timeSlot} · ${activeBooking.guests} Guests`
                : `${availablePoints} Loyalty Pts · ${userProfile.phone || userProfile.email}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopyCheckInCode}
              className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg bg-[#0E2947] border border-[#25578A] hover:border-[#38BDF8] text-[#E0F2FE] text-[11px] font-semibold cursor-pointer"
            >
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
              )}
              <span>{copiedId ? 'Code Copied' : 'Copy Code'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[11px] font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save QR Pass</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
