export interface InkShaderParams {
  tendril: number;
  noiseScale: number;
  softness: number;
  drift: number;
}

export const INK_DURATION_S = 2.2;
export const CANVAS_FADE_OUT_S = 0.15;
export const CSS_FADE_FALLBACK_MS = 450;

export const DEFAULT_INK_PARAMS: InkShaderParams = {
  tendril: 1,
  noiseScale: 1,
  softness: 1.4,
  drift: 1,
};

/**
 * GSAP power3.out equivalent: 1 - (1 - t)^3
 */
export function power3Out(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  const inv = 1 - c;
  return 1 - inv * inv * inv;
}

/**
 * Furthest Euclidean distance from (cx, cy) to any corner of the viewport [0..vw, 0..vh].
 */
export function computeMaxDist(cx: number, cy: number, vw: number, vh: number): number {
  const d00 = Math.hypot(cx, cy);
  const d10 = Math.hypot(vw - cx, cy);
  const d01 = Math.hypot(cx, vh - cy);
  const d11 = Math.hypot(vw - cx, vh - cy);
  return Math.max(1, d00, d10, d01, d11);
}

/**
 * Computes the normalized linear time in [0, 1] at which the ink front radius
 * R(t) = power3Out(t) * 0.7 * maxDist reaches distance `dBtn` from the click point.
 */
export function computeArrivalLinear(
  cx: number,
  cy: number,
  bx: number,
  by: number,
  maxDist: number
): number {
  const dBtn = Math.hypot(bx - cx, by - cy);
  if (dBtn <= 4) return 0;
  const maxR = Math.max(1, 0.7 * maxDist);
  const targetProgress = Math.min(0.95, Math.max(0, dBtn / maxR));
  return Math.min(0.92, Math.max(0, 1 - Math.cbrt(Math.max(0, 1 - targetProgress))));
}
