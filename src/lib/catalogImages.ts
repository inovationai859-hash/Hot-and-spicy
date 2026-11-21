import type { CatalogImageKey } from '../data/catalogData';
import {
  getTransformedImage,
  getTransformedImageUrl,
  type ImageTransformPreset,
  type TransformedImageAsset,
} from './imageTransform';

export function resolveCatalogImage(
  key: CatalogImageKey,
  preset: ImageTransformPreset = 'thumb'
): string {
  return getTransformedImageUrl(key, preset);
}

export function resolveCatalogPicture(
  key: CatalogImageKey,
  preset: ImageTransformPreset = 'thumb'
): TransformedImageAsset {
  return getTransformedImage(key, preset);
}

export const tandooriImg = getTransformedImageUrl('tandoor', 'thumb');
