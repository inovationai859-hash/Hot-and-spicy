import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MapPin, Navigation, Clock, Phone, Car, Train, ExternalLink } from 'lucide-react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import {
  VIEWPORT_CONFIG,
  createStaggerContainer,
  createRevealItem,
} from '../lib/revealVariants';
import { useCatalog } from '../context/CatalogContext';
import { formatOperatingHours, normalizeWhatsAppDigits } from '../data/catalogData';

const VENUE_POSITION = { lat: 22.9718, lng: 88.3994 };

export const LocationSection: React.FC = () => {
  const { venueSettings } = useCatalog();
  const operatingHoursLabel = formatOperatingHours(venueSettings);
  const phoneDigits = normalizeWhatsAppDigits(venueSettings.whatsappNumber);
  const prefersReduced = useReducedMotion() ?? false;
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => {
    const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    return typeof envKey === 'string' ? envKey.trim() : '';
  });
  const [keyResolved, setKeyResolved] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => {
    try {
      return Boolean(window.__hsGmpQuotaExceeded);
    } catch {
      return false;
    }
  });
  const [infoOpen, setInfoOpen] = useState(true);
  const [markerRef, marker] = useAdvancedMarkerRef();

  useEffect(() => {
    let active = true;
    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const serverKey = typeof data?.apiKey === 'string' ? data.apiKey.trim() : '';
        if (serverKey) {
          setMapsApiKey(serverKey);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setKeyResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onQuotaExceeded = () => {
      setQuotaExceeded(true);
    };
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const headerContainer = createStaggerContainer(0.09, 0.02, prefersReduced);
  const headerItem = createRevealItem({ y: 20, duration: 0.55, reduced: prefersReduced });
  const leftColumnContainer = createStaggerContainer(0.12, 0.06, prefersReduced);
  const infoCardItem = createRevealItem({ y: 26, scale: 0.98, duration: 0.56, reduced: prefersReduced });
  const commuteListContainer = createStaggerContainer(0.07, 0.12, prefersReduced);
  const commuteRowItem = createRevealItem({ x: -10, y: 8, duration: 0.42, reduced: prefersReduced });
  const mapPanelVariant = createRevealItem({ y: 24, scale: 0.96, duration: 0.62, delay: 0.14, reduced: prefersReduced });

  const directMapUrl =
    'https://www.google.com/maps/search/?api=1&query=Boropara+More+Dingalhat+Near+Azdan+Moto+Hub+Bansberia+Hooghly+West+Bengal';

  const canRenderInteractiveMap = Boolean(mapsApiKey) && !quotaExceeded;

  return (
    <section
      id="location"
      className="py-16 sm:py-20 bg-[#E4D6C3] dark:bg-[#120E0A] relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          data-ink-reveal="true"
          variants={headerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_CONFIG}
          className="max-w-3xl mb-10 sm:mb-12 space-y-2"
        >
          <motion.h2
            data-ink-reveal="true"
            variants={headerItem}
            className="font-luxury text-3xl min-[380px]:text-4xl sm:text-5xl font-bold tracking-tight text-[#14100B] dark:text-[#F0E6D8] text-balance"
          >
            Location &amp; Operating Hours
          </motion.h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <motion.div
            data-ink-reveal="true"
            variants={leftColumnContainer}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_CONFIG}
            className="lg:col-span-5 space-y-5"
          >
            <motion.div
              data-ink-reveal="true"
              variants={infoCardItem}
              whileHover={prefersReduced ? undefined : { y: -3 }}
              className="group p-6 rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[rgba(141,102,19,0.75)] dark:hover:border-[rgba(216,180,103,0.6)] space-y-4 shadow-sm hover:shadow-lg will-change-transform"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-[#8D6613] text-[#FAF2E6] shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-luxury text-2xl font-bold text-[#14100B] dark:text-[#F0E6D8]">
                    Hot &amp; Spicy
                  </h3>
                  <p className="text-sm text-[#3B3126] dark:text-[#D4C5B3] mt-1.5 leading-relaxed">
                    {venueSettings.address}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#C2AD93] dark:border-[#3D2F20] flex flex-col sm:flex-row gap-2.5">
                <motion.a
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  href={directMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Get Directions</span>
                  <ExternalLink className="w-3 h-3" />
                </motion.a>

                <motion.a
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  href={`tel:+${phoneDigits}`}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-[rgba(20,16,11,0.25)] dark:border-[#3D2F20] bg-[#E4D6C3] dark:bg-[#120E0A] hover:border-[#8D6613] dark:hover:border-[#D8B467] text-[#14100B] dark:text-[#F0E6D8] font-bold text-xs"
                >
                  <Phone className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467]" />
                  <span>{venueSettings.whatsappNumber}</span>
                </motion.a>
              </div>
            </motion.div>

            <motion.div
              data-ink-reveal="true"
              variants={infoCardItem}
              whileHover={prefersReduced ? undefined : { y: -3 }}
              className="p-6 rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[rgba(141,102,19,0.75)] dark:hover:border-[rgba(216,180,103,0.6)] space-y-3 text-xs text-[#3B3126] dark:text-[#D4C5B3] shadow-sm hover:shadow-lg will-change-transform"
            >
              <div className="flex items-center gap-2 text-[#14100B] dark:text-[#F0E6D8] font-bold text-sm">
                <Clock className="w-4 h-4 text-[#8D6613] dark:text-[#D8B467]" />
                <span>Operating Hours</span>
              </div>
              <div className="space-y-2.5 pt-1 border-t border-[#C2AD93] dark:border-[#3D2F20]">
                <div className="flex justify-between gap-2">
                  <span>Monday – Sunday</span>
                  <span className="text-[#14100B] dark:text-[#F0E6D8] font-bold tabular-nums">{operatingHoursLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Gaming Arena &amp; Pool</span>
                  <span className="text-[#14100B] dark:text-[#F0E6D8] font-bold tabular-nums">{operatingHoursLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Kitchen Last Order</span>
                  <span className="text-[#5C4008] dark:text-[#D8B467] font-bold tabular-nums">{venueSettings.kitchenLastOrder}</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              data-ink-reveal="true"
              variants={infoCardItem}
              whileHover={prefersReduced ? undefined : { y: -3 }}
              className="p-6 rounded-2xl bg-[rgba(239,229,214,0.96)] dark:bg-[rgba(31,23,16,0.96)] border border-[#C2AD93] dark:border-[#3D2F20] hover:border-[rgba(141,102,19,0.75)] dark:hover:border-[rgba(216,180,103,0.6)] space-y-3 text-xs text-[#3B3126] dark:text-[#D4C5B3] shadow-sm hover:shadow-lg will-change-transform"
            >
              <div className="font-bold text-[#14100B] dark:text-[#F0E6D8] text-sm flex items-center gap-2">
                <Car className="w-4 h-4 text-[#8D6613] dark:text-[#D8B467]" />
                <span>How to Reach</span>
              </div>
              <motion.ul variants={commuteListContainer} className="space-y-2 leading-relaxed">
                <motion.li data-ink-reveal="true" variants={commuteRowItem} className="flex items-start gap-2">
                  <Train className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#14100B] dark:text-[#F0E6D8]">Bansberia Station:</strong> 5 mins · <strong className="text-[#14100B] dark:text-[#F0E6D8]">Bandel Junction:</strong> 15 mins
                  </span>
                </motion.li>
                <motion.li data-ink-reveal="true" variants={commuteRowItem} className="flex items-start gap-2">
                  <Car className="w-3.5 h-3.5 text-[#8D6613] dark:text-[#D8B467] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#14100B] dark:text-[#F0E6D8]">Parking:</strong> Street-front parking available
                  </span>
                </motion.li>
              </motion.ul>
            </motion.div>
          </motion.div>

          <motion.div
            data-ink-reveal="true"
            variants={mapPanelVariant}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_CONFIG}
            className="lg:col-span-7 will-change-transform"
          >
            <div className="relative rounded-2xl overflow-hidden border border-[#C2AD93] dark:border-[#3D2F20] bg-[#EFE5D6] dark:bg-[#1F1710] h-[340px] sm:h-[440px] lg:h-[490px] shadow-md">
              {canRenderInteractiveMap ? (
                <APIProvider apiKey={mapsApiKey}>
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    defaultCenter={VENUE_POSITION}
                    defaultZoom={16}
                    gestureHandling="cooperative"
                    disableDefaultUI={false}
                    className="w-full h-full"
                  >
                    <AdvancedMarker
                      ref={markerRef}
                      position={VENUE_POSITION}
                      onClick={() => setInfoOpen((prev) => !prev)}
                      title="Hot & Spicy · Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia"
                    >
                      <Pin
                        background="#8D6613"
                        borderColor="#14100B"
                        glyphColor="#FAF2E6"
                      />
                    </AdvancedMarker>
                    {infoOpen && marker && (
                      <InfoWindow
                        anchor={marker}
                        onCloseClick={() => setInfoOpen(false)}
                      >
                        <div className="p-1 text-[#14100B] text-xs space-y-1 max-w-[210px]">
                          <div className="font-bold text-sm">Hot &amp; Spicy</div>
                          <div className="text-neutral-700">
                            {venueSettings.address}
                          </div>
                          <div className="text-[11px] font-semibold text-[#8D6613]">
                            Open Daily {operatingHoursLabel}
                          </div>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-[#E8DAC5] dark:bg-[#19130D] space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#8D6613] text-[#FAF2E6] flex items-center justify-center shadow-md">
                    <MapPin className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <h3 className="font-luxury text-2xl font-bold text-[#14100B] dark:text-[#F0E6D8]">
                      Hot &amp; Spicy · Bansberia
                    </h3>
                    <p className="text-xs sm:text-sm text-[#3B3126] dark:text-[#D4C5B3]">
                      {venueSettings.address}
                      <span className="block mt-1 font-mono text-[11px] text-[#5C4008] dark:text-[#D8B467]">
                        22.9718° N, 88.3994° E
                      </span>
                    </p>
                    {!keyResolved ? (
                      <p className="text-[11px] text-[#5E5042] dark:text-[#B5A594]">
                        Loading interactive map...
                      </p>
                    ) : null}
                  </div>
                  <a
                    href={directMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] font-bold text-xs uppercase tracking-wider shadow-sm"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
