/**
 * Pre-rendered raster PNG overlays using smoothstep alpha ramps.
 * Replacing multi-stop CSS gradient fades & mask-image with static PNGs
 * guarantees 100% pixel parity between Chromium and html2canvas@1.4.1.
 */

const cache = new Map<string, string>();

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function getSmoothstepScrimPng(
  direction: 'to-top' | 'to-bottom' | 'to-right' | 'to-left',
  r: number,
  g: number,
  b: number,
  maxAlpha: number,
  minAlpha = 0,
  steps = 96
): string {
  const key = `scrim:${direction}:${r},${g},${b}:${maxAlpha}:${minAlpha}:${steps}`;
  const existing = cache.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined') return '';

  const horizontal = direction === 'to-right' || direction === 'to-left';
  const canvas = document.createElement('canvas');
  canvas.width = horizontal ? steps : 1;
  canvas.height = horizontal ? 1 : steps;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < steps; i++) {
    const u = i / Math.max(1, steps - 1);
    const t =
      direction === 'to-top' || direction === 'to-left'
        ? smoothstep(u)
        : smoothstep(1 - u);
    const alpha = Math.round((minAlpha + (maxAlpha - minAlpha) * t) * 255);
    const idx = i * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = alpha;
  }

  ctx.putImageData(imgData, 0, 0);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function getDividerLinePng(
  direction: 'ltr' | 'rtl',
  r: number,
  g: number,
  b: number,
  endAlpha = 0.85,
  steps = 128
): string {
  const key = `div:${direction}:${r},${g},${b}:${endAlpha}:${steps}`;
  const existing = cache.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = steps;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(steps, 1);
  const data = imgData.data;

  for (let i = 0; i < steps; i++) {
    const u = i / Math.max(1, steps - 1);
    const s = direction === 'ltr' ? smoothstep(u) : smoothstep(1 - u);
    const idx = i * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = Math.round(s * endAlpha * 255);
  }

  ctx.putImageData(imgData, 0, 0);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
