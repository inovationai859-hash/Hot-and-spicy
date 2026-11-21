// Client-side Image Transformation Utility for responsive WebP & mobile-optimized delivery
import tandooriJpg from '../assets/images/menu_tandoori_tikka_1794548029028.jpg';
import momosJpg from '../assets/images/menu_spicy_momos_1794548027720.jpg';
import pizzaJpg from '../assets/images/menu_artisan_pizza_1794548027765.jpg';
import burgerJpg from '../assets/images/menu_loaded_burger_1794548027906.jpg';
import noodlesJpg from '../assets/images/menu_hakka_noodles_1794548028123.jpg';
import frappeJpg from '../assets/images/menu_cafe_frappe_1794548027702.jpg';
import poolJpg from '../assets/images/gaming_pool_lounge_1793424411695.jpg';
import ps5Jpg from '../assets/images/gaming_ps5_arena_1793424413824.jpg';
import storeJpg from '../assets/images/hero_hot_and_spicy_1793424411924.jpg';
import combosJpg from '../assets/images/signature_combos_feast_1793424412499.jpg';

import tandoor320 from '../assets/images/webp/tandoor-320.webp';
import tandoor640 from '../assets/images/webp/tandoor-640.webp';
import tandoor1080 from '../assets/images/webp/tandoor-1080.webp';

import momos320 from '../assets/images/webp/momos-320.webp';
import momos640 from '../assets/images/webp/momos-640.webp';
import momos1080 from '../assets/images/webp/momos-1080.webp';

import pizza320 from '../assets/images/webp/pizza-320.webp';
import pizza640 from '../assets/images/webp/pizza-640.webp';
import pizza1080 from '../assets/images/webp/pizza-1080.webp';

import burger320 from '../assets/images/webp/burger-320.webp';
import burger640 from '../assets/images/webp/burger-640.webp';
import burger1080 from '../assets/images/webp/burger-1080.webp';

import noodles320 from '../assets/images/webp/noodles-320.webp';
import noodles640 from '../assets/images/webp/noodles-640.webp';
import noodles1080 from '../assets/images/webp/noodles-1080.webp';

import frappe320 from '../assets/images/webp/frappe-320.webp';
import frappe640 from '../assets/images/webp/frappe-640.webp';
import frappe1080 from '../assets/images/webp/frappe-1080.webp';

import pool320 from '../assets/images/webp/pool-320.webp';
import pool640 from '../assets/images/webp/pool-640.webp';
import pool1080 from '../assets/images/webp/pool-1080.webp';

import ps5320 from '../assets/images/webp/ps5-320.webp';
import ps5640 from '../assets/images/webp/ps5-640.webp';
import ps51080 from '../assets/images/webp/ps5-1080.webp';

import store320 from '../assets/images/webp/store-320.webp';
import store640 from '../assets/images/webp/store-640.webp';
import store1080 from '../assets/images/webp/store-1080.webp';

import combos320 from '../assets/images/webp/combos-320.webp';
import combos640 from '../assets/images/webp/combos-640.webp';
import combos1080 from '../assets/images/webp/combos-1080.webp';

export type VenueImageKey =
  | 'momos'
  | 'tandoor'
  | 'pizza'
  | 'burger'
  | 'noodles'
  | 'frappe'
  | 'pool'
  | 'ps5'
  | 'store'
  | 'combos';

export type ImageTransformPreset = 'thumb' | 'card' | 'full';

export interface TransformedImageAsset {
  src: string;
  webpSrcSet: string;
  fallbackSrc: string;
  webp: {
    w320: string;
    w640: string;
    w1080: string;
  };
}

const IMAGE_ASSET_REGISTRY: Record<
  VenueImageKey,
  { jpg: string; w320: string; w640: string; w1080: string }
> = {
  tandoor: { jpg: tandooriJpg, w320: tandoor320, w640: tandoor640, w1080: tandoor1080 },
  momos: { jpg: momosJpg, w320: momos320, w640: momos640, w1080: momos1080 },
  pizza: { jpg: pizzaJpg, w320: pizza320, w640: pizza640, w1080: pizza1080 },
  burger: { jpg: burgerJpg, w320: burger320, w640: burger640, w1080: burger1080 },
  noodles: { jpg: noodlesJpg, w320: noodles320, w640: noodles640, w1080: noodles1080 },
  frappe: { jpg: frappeJpg, w320: frappe320, w640: frappe640, w1080: frappe1080 },
  pool: { jpg: poolJpg, w320: pool320, w640: pool640, w1080: pool1080 },
  ps5: { jpg: ps5Jpg, w320: ps5320, w640: ps5640, w1080: ps51080 },
  store: { jpg: storeJpg, w320: store320, w640: store640, w1080: store1080 },
  combos: { jpg: combosJpg, w320: combos320, w640: combos640, w1080: combos1080 },
};

let cachedWebpSupport: boolean | null = null;

/**
 * Synchronously detects browser WebP encoding support once and caches the result.
 */
export function supportsWebP(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext) {
      cachedWebpSupport = true;
      return true;
    }
    cachedWebpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    return cachedWebpSupport;
  } catch {
    cachedWebpSupport = true;
    return true;
  }
}

function pickWebpByPreset(
  entry: { w320: string; w640: string; w1080: string },
  preset: ImageTransformPreset
): string {
  if (preset === 'thumb') return entry.w320;
  if (preset === 'card') return entry.w640;
  return entry.w1080;
}

/**
 * Returns full responsive WebP srcSet, preset WebP URL, and JPEG fallback for any menu/venue asset.
 */
export function getTransformedImage(
  key: VenueImageKey,
  preset: ImageTransformPreset = 'card'
): TransformedImageAsset {
  const entry = IMAGE_ASSET_REGISTRY[key] || IMAGE_ASSET_REGISTRY.tandoor;
  const preferredWebp = pickWebpByPreset(entry, preset);

  return {
    src: supportsWebP() ? preferredWebp : entry.jpg,
    webpSrcSet: `${entry.w320} 320w, ${entry.w640} 640w, ${entry.w1080} 1080w`,
    fallbackSrc: entry.jpg,
    webp: {
      w320: entry.w320,
      w640: entry.w640,
      w1080: entry.w1080,
    },
  };
}

/**
 * Returns a single best-fit transformed image URL (WebP when supported, JPEG fallback otherwise).
 */
export function getTransformedImageUrl(
  key: VenueImageKey,
  preset: ImageTransformPreset = 'card'
): string {
  return getTransformedImage(key, preset).src;
}

/**
 * Builds a dynamic server-side WebP transformation URL for public or menu assets
 * via `/api/images/transform`, supporting automatic width & quality optimization for mobile.
 */
export function buildServerTransformUrl(
  srcPath: string,
  options: { width?: number; quality?: number; format?: 'webp' | 'auto' | 'jpeg' } = {}
): string {
  const width = options.width ?? 640;
  const quality = options.quality ?? 82;
  const format = options.format ?? (supportsWebP() ? 'webp' : 'auto');
  const params = new URLSearchParams({
    src: srcPath,
    w: String(width),
    q: String(quality),
    format,
  });
  return `/api/images/transform?${params.toString()}`;
}
