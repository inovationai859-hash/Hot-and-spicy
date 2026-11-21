import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  CATALOG_CHAPTERS,
  DEFAULT_CATALOG_ITEMS,
  DEFAULT_GAMING_RATES,
  DEFAULT_VENUE_SETTINGS,
  CatalogChapterMeta,
  CatalogItem,
  GamingRates,
  VenueSettings,
} from '../data/catalogData';
import { resolveNonNegativeRate } from '../lib/orderNormalizer';

export interface CatalogChapterGroup extends CatalogChapterMeta {
  items: CatalogItem[];
}

interface CatalogContextValue {
  items: CatalogItem[];
  chapters: CatalogChapterGroup[];
  gamingRates: GamingRates;
  venueSettings: VenueSettings;
  loungePerfMonitorEnabled: boolean;
  loading: boolean;
  refreshCatalog: () => Promise<void>;
  applyCatalogSnapshot: (
    nextItems: CatalogItem[],
    nextRates?: GamingRates,
    nextVenueSettings?: VenueSettings
  ) => void;
  applyVenueSettingsSnapshot: (nextVenueSettings: VenueSettings) => void;
  setLoungePerfMonitorLocal: (enabled: boolean) => void;
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

function buildChapterGroups(items: CatalogItem[]): CatalogChapterGroup[] {
  return CATALOG_CHAPTERS.map((meta) => ({
    ...meta,
    items: items.filter((item) => item.chapter === meta.chapter),
  }));
}

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CatalogItem[]>(DEFAULT_CATALOG_ITEMS);
  const [gamingRates, setGamingRates] = useState<GamingRates>(DEFAULT_GAMING_RATES);
  const [venueSettings, setVenueSettings] = useState<VenueSettings>(DEFAULT_VENUE_SETTINGS);
  const [loungePerfMonitorEnabled, setLoungePerfMonitorEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setItems(data.items);
        }
        if (typeof data.loungePerfMonitorEnabled === 'boolean') {
          setLoungePerfMonitorEnabled(data.loungePerfMonitorEnabled);
        }
        if (data.gamingRates) {
          setGamingRates({
            pool15Price: resolveNonNegativeRate(
              data.gamingRates.pool15Price,
              DEFAULT_GAMING_RATES.pool15Price
            ),
            pool30Price: resolveNonNegativeRate(
              data.gamingRates.pool30Price,
              DEFAULT_GAMING_RATES.pool30Price
            ),
            ps5HourlyPrice: resolveNonNegativeRate(
              data.gamingRates.ps5HourlyPrice,
              DEFAULT_GAMING_RATES.ps5HourlyPrice
            ),
          });
        }
        if (data.venueSettings && typeof data.venueSettings === 'object') {
          setVenueSettings({ ...DEFAULT_VENUE_SETTINGS, ...data.venueSettings });
        }
      }
    } catch {
      // Keep default catalog silently on transient network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  const applyCatalogSnapshot = useCallback(
    (nextItems: CatalogItem[], nextRates?: GamingRates, nextVenueSettings?: VenueSettings) => {
      setItems(nextItems);
      if (nextRates) {
        setGamingRates(nextRates);
      }
      if (nextVenueSettings) {
        setVenueSettings({ ...DEFAULT_VENUE_SETTINGS, ...nextVenueSettings });
      }
    },
    []
  );

  const applyVenueSettingsSnapshot = useCallback((nextVenueSettings: VenueSettings) => {
    setVenueSettings({ ...DEFAULT_VENUE_SETTINGS, ...nextVenueSettings });
  }, []);

  const setLoungePerfMonitorLocal = useCallback((enabled: boolean) => {
    setLoungePerfMonitorEnabled(enabled);
  }, []);

  const chapters = buildChapterGroups(items);

  return (
    <CatalogContext.Provider
      value={{
        items,
        chapters,
        gamingRates,
        venueSettings,
        loungePerfMonitorEnabled,
        loading,
        refreshCatalog,
        applyCatalogSnapshot,
        applyVenueSettingsSnapshot,
        setLoungePerfMonitorLocal,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
};

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return ctx;
}
