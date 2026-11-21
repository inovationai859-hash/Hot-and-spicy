import React from 'react';
import { motion } from 'motion/react';
import {
  Phone,
  Instagram,
  Facebook,
  Youtube,
  Calendar,
} from 'lucide-react';
import { useCatalog } from '../context/CatalogContext';
import { normalizeWhatsAppDigits } from '../data/catalogData';

interface FooterProps {
  onOpenBooking: () => void;
  onOpenAdmin: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenBooking, onOpenAdmin }) => {
  const { venueSettings } = useCatalog();
  const phoneDigits = normalizeWhatsAppDigits(venueSettings.whatsappNumber);
  const igLabel = venueSettings.instagramHandle.replace(/^@/, '') || 'hotandspicy_aa';
  return (
    <footer className="bg-[#14100B] dark:bg-[#0B0805] border-t border-[rgba(141,102,19,0.4)] dark:border-[#3D2F20] pt-12 pb-24 sm:pb-12 text-xs text-[#D8C7B4] overflow-hidden">
      <motion.div
        data-ink-reveal="true"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 pb-8 border-b border-[#2C2217]">
          {/* Brand Column */}
          <div className="sm:col-span-2 space-y-4">
            <div className="font-brand text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EDE8E4]">
              Hot &amp; Spicy
            </div>

            {/* Official Social Handles */}
            <div className="flex flex-wrap items-center gap-2.5">
              <motion.a
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                href={venueSettings.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-[#221A11] border border-[rgba(141,102,19,0.4)] text-[#EDE8E4] hover:border-[#D8B467] hover:bg-[#2C2217] text-xs font-semibold"
                aria-label={`Instagram ${igLabel}`}
              >
                <Instagram className="w-4 h-4 text-[#D8B467]" />
                <span>{igLabel}</span>
              </motion.a>
              <motion.a
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                href={venueSettings.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-[#221A11] border border-[rgba(141,102,19,0.4)] text-[#EDE8E4] hover:border-[#D8B467] hover:bg-[#2C2217] text-xs font-semibold"
                aria-label="YouTube @Hotandspicyaa"
              >
                <Youtube className="w-4 h-4 text-[#D8B467]" />
                <span>@Hotandspicyaa</span>
              </motion.a>
              <motion.a
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                href={venueSettings.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-[#221A11] border border-[rgba(141,102,19,0.4)] text-[#EDE8E4] hover:border-[#D8B467] hover:bg-[#2C2217] text-xs font-semibold"
                aria-label="Facebook Hot & Spicy"
              >
                <Facebook className="w-4 h-4 text-[#D8B467]" />
                <span>Facebook</span>
              </motion.a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-[#EDE8E4] text-xs uppercase tracking-wider">
              Explore
            </h4>
            <ul className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-1 text-xs">
              <li>
                <a href="#home" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  Home
                </a>
              </li>
              <li>
                <a href="#book-menu" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  Menu Book
                </a>
              </li>
              <li>
                <a href="#about" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  About Us
                </a>
              </li>
              <li>
                <a href="#gaming" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  Gaming Lounge
                </a>
              </li>
              <li>
                <a href="#location" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  Location
                </a>
              </li>
              <li>
                <a href="#instagram" className="inline-flex items-center min-h-[36px] hover:text-[#D8B467]">
                  Instagram
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Quick Action */}
          <div className="space-y-3">
            <h4 className="font-bold text-[#EDE8E4] text-xs uppercase tracking-wider">
              Contact &amp; Booking
            </h4>
            <div className="space-y-2.5 text-xs">
              <a
                href={`tel:+${phoneDigits}`}
                className="inline-flex items-center gap-2 min-h-[40px] text-[#EDE8E4] hover:text-[#D8B467] font-semibold"
              >
                <Phone className="w-4 h-4 text-[#D8B467] shrink-0" />
                <span>{venueSettings.whatsappNumber}</span>
              </a>
              <div>
                <button
                  type="button"
                  onClick={onOpenBooking}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Book Gaming Slot</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Copyright Row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#D8C7B4]">
          <p>© {new Date().getFullYear()} Hot &amp; Spicy. All rights reserved.</p>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center min-h-[40px] px-3 text-[rgba(216,199,180,0.85)] hover:text-[#D8B467] font-medium cursor-pointer"
          >
            Admin Portal
          </button>
        </div>
      </motion.div>
    </footer>
  );
};
