import React, { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { playWhatsAppClick } from '../utils/sound';
import { useCatalog } from '../context/CatalogContext';
import { formatOperatingHours, normalizeWhatsAppDigits } from '../data/catalogData';

export const WhatsAppFloatingButton: React.FC = () => {
  const { venueSettings } = useCatalog();
  const [showTooltip, setShowTooltip] = useState(false);
  const whatsappDigits = normalizeWhatsAppDigits(venueSettings.whatsappNumber);
  const operatingHours = formatOperatingHours(venueSettings);
  const defaultMessage = encodeURIComponent(
    `Hello Hot & Spicy! I would like to inquire about PS5 slots, 8-Ball Pool, or food orders (Admin ${venueSettings.whatsappNumber}).`
  );
  const whatsappUrl = `https://wa.me/${whatsappDigits}?text=${defaultMessage}`;

  return (
    <div data-ink-live="true" className="fixed bottom-4 left-3.5 sm:bottom-6 sm:left-6 z-[1001] flex items-center">
      {showTooltip && (
        <div className="hidden sm:block absolute left-16 bottom-1 bg-[#14100B] border border-[#8D6613] text-[#EDE8E4] px-3.5 py-2 rounded-xl text-xs whitespace-nowrap shadow-xl">
          <div className="font-semibold text-[#EDE8E4] flex items-center gap-1.5">
            <CheckCheck className="w-3.5 h-3.5 text-[#25D366]" />
            <span>Direct WhatsApp ({venueSettings.whatsappNumber})</span>
          </div>
          <div className="text-[11px] text-[#D8B467]">
            Open {operatingHours} · Direct Desk
          </div>
        </div>
      )}

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => playWhatsAppClick()}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center justify-center w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#25D366] hover:bg-[#1EB954] text-white shadow-xl hover:scale-105 active:scale-95 transition-transform border-2 border-[#EFE5D6] dark:border-[#1F1710]"
        aria-label="Direct WhatsApp Chat with Hot and Spicy"
      >
        <WhatsAppIcon className="w-6 h-6 sm:w-7 sm:h-7" />
      </a>
    </div>
  );
};
