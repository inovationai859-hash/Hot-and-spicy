import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const MENU_SOURCE_MAP: Record<string, string> = {
  tandoor: 'menu_tandoori_tikka_1794548029028.jpg',
  momos: 'menu_spicy_momos_1794548027720.jpg',
  pizza: 'menu_artisan_pizza_1794548027765.jpg',
  burger: 'menu_loaded_burger_1794548027906.jpg',
  noodles: 'menu_hakka_noodles_1794548028123.jpg',
  frappe: 'menu_cafe_frappe_1794548027702.jpg',
  pool: 'gaming_pool_lounge_1793424411695.jpg',
  ps5: 'gaming_ps5_arena_1793424413824.jpg',
  store: 'hero_hot_and_spicy_1793424411924.jpg',
  combos: 'signature_combos_feast_1793424412499.jpg',
};

const CACHE_DIR = '/tmp/hs_img_cache';
try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {
  // Ignore if tmp dir already exists or read-only
}

const inflightTransforms = new Map<string, Promise<{ buffer: Buffer; mime: string; etag: string }>>();

export interface TransformParams {
  sourcePath: string;
  width: number;
  quality: number;
  format: 'webp' | 'jpeg';
}

export function clampWidth(rawWidth: unknown, fallback = 640): number {
  const n = Number(rawWidth);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(1440, Math.max(64, Math.round(n / 16) * 16));
}

export function clampQuality(rawQuality: unknown, fallback = 82): number {
  const n = Number(rawQuality);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(95, Math.max(40, Math.round(n)));
}

export function negotiateFormat(
  requestedFormat: unknown,
  acceptHeader: string | undefined
): 'webp' | 'jpeg' {
  const f = String(requestedFormat || 'auto').trim().toLowerCase();
  if (f === 'webp') return 'webp';
  if (f === 'jpeg' || f === 'jpg') return 'jpeg';
  return String(acceptHeader || '').toLowerCase().includes('image/webp') ? 'webp' : 'jpeg';
}

export function resolveAllowlistedSourcePath(
  rootDir: string,
  srcParam: string
): string | null {
  const clean = String(srcParam || '').trim().split('?')[0];
  if (!clean || clean.includes('..') || clean.includes('\0')) return null;

  const normalized = clean.startsWith('/') ? clean.slice(1) : clean;
  const srcImagesDir = path.resolve(rootDir, 'src', 'assets', 'images');
  const publicAssetsDir = path.resolve(rootDir, 'public', 'assets');
  const publicDir = path.resolve(rootDir, 'public');

  let candidate: string | null = null;
  if (normalized.startsWith('assets/')) {
    candidate = path.resolve(publicDir, normalized);
  } else if (normalized.startsWith('src/assets/images/')) {
    candidate = path.resolve(rootDir, normalized);
  } else if (normalized === 'og-share.jpg' || normalized === 'og-lounge.jpg') {
    candidate = path.resolve(publicDir, normalized);
  }

  if (!candidate) return null;

  const isAllowed =
    candidate.startsWith(srcImagesDir + path.sep) ||
    candidate.startsWith(publicAssetsDir + path.sep) ||
    candidate === path.join(publicDir, 'og-share.jpg') ||
    candidate === path.join(publicDir, 'og-lounge.jpg');

  if (!isAllowed || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return null;
  }
  const ext = path.extname(candidate).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return null;

  return candidate;
}

export async function transformImageToBuffer(
  params: TransformParams
): Promise<{ buffer: Buffer; mime: string; etag: string }> {
  const stat = fs.statSync(params.sourcePath);
  const hashInput = `${params.sourcePath}|${stat.mtimeMs}|${stat.size}|w=${params.width}|q=${params.quality}|f=${params.format}`;
  const cacheKey = crypto.createHash('sha1').update(hashInput).digest('hex');
  const ext = params.format === 'webp' ? 'webp' : 'jpg';
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.${ext}`);
  const mime = params.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const etag = `"${cacheKey}"`;

  if (fs.existsSync(cachePath)) {
    const buffer = await fs.promises.readFile(cachePath);
    return { buffer, mime, etag };
  }

  const existingJob = inflightTransforms.get(cacheKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    const tmpOut = path.join(CACHE_DIR, `${cacheKey}.${process.pid}.tmp.${ext}`);
    const args = [
      params.sourcePath,
      '-auto-orient',
      '-strip',
      '-resize',
      `${params.width}x${params.width}>`,
      '-quality',
      String(params.quality),
    ];
    if (params.format === 'webp') {
      args.push('-define', 'webp:method=6', '-define', 'webp:auto-filter=true');
    } else {
      args.push('-sampling-factor', '4:2:0', '-interlace', 'Plane');
    }
    args.push(`${params.format}:${tmpOut}`);

    try {
      await execFileAsync('convert', args, { timeout: 10000 });
      await fs.promises.rename(tmpOut, cachePath);
      const buffer = await fs.promises.readFile(cachePath);
      return { buffer, mime, etag };
    } catch (err) {
      try {
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      } catch {}
      throw err;
    } finally {
      inflightTransforms.delete(cacheKey);
    }
  })();

  inflightTransforms.set(cacheKey, job);
  return job;
}
