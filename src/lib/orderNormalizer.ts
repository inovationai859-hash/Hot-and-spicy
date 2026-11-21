import type { UserOrderRecord } from '../types';

export const ALLOWED_ORDER_STATUSES = [
  'Pending',
  'Preparing',
  'Ready',
  'Completed',
  'Delivered',
  'Cancelled',
] as const;

export type CanonicalOrderStatus = (typeof ALLOWED_ORDER_STATUSES)[number];

/**
 * Strictly parses a finite non-negative number (`>= 0`).
 * Rejects `null`, `undefined`, booleans, empty/whitespace strings, `NaN`, `Infinity`, and negatives.
 * Preserves numeric `0` and `"0"` cleanly.
 */
export function parseStrictNonNegativeNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/**
 * Resolves a non-negative pricing rate, preserving `0` rather than falling back via `||`.
 */
export function resolveNonNegativeRate(raw: unknown, fallback: number): number {
  const parsed = parseStrictNonNegativeNumber(raw);
  return parsed !== null ? parsed : fallback;
}

/**
 * Computes YYYY-MM-DD in India Standard Time (Asia/Kolkata, UTC+5:30).
 */
export function getIstDateString(dateInput?: Date | number): string {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  let baseMs: number;
  if (dateInput instanceof Date) {
    baseMs = Number.isFinite(dateInput.getTime()) ? dateInput.getTime() : Date.now();
  } else if (typeof dateInput === 'number' && Number.isFinite(dateInput)) {
    baseMs = dateInput;
  } else {
    baseMs = Date.now();
  }
  return new Date(baseMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Normalizes order status values against the canonical 6-state lifecycle.
 */
export function normalizeOrderStatus(raw: unknown): CanonicalOrderStatus {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    const matched = ALLOWED_ORDER_STATUSES.find((s) => s.toLowerCase() === trimmed);
    if (matched) return matched;
  }
  return 'Pending';
}

function cleanString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Safely normalizes an untyped Firestore/JSON order record without truthiness bugs.
 */
export function normalizeFirestoreOrder(
  raw: Record<string, unknown>,
  docId: string,
  fallbackProfile?: { uid?: string; name?: string; phone?: string } | null
): UserOrderRecord {
  const parsedSubtotal = parseStrictNonNegativeNumber(raw?.subtotal);
  const diningMode = raw?.diningMode === 'dine-in' ? 'dine-in' : 'takeaway';

  return {
    id: cleanString(raw?.id) || cleanString(docId),
    userId: cleanString(raw?.userId) || cleanString(fallbackProfile?.uid) || undefined,
    customerName:
      cleanString(raw?.customerName) ||
      cleanString(fallbackProfile?.name) ||
      'Hot & Spicy Guest',
    phone: cleanString(raw?.phone) || cleanString(fallbackProfile?.phone) || '',
    address: cleanString(raw?.address) || '',
    diningMode,
    itemsSummary: cleanString(raw?.itemsSummary) || '',
    subtotal: parsedSubtotal !== null ? parsedSubtotal : 0,
    status: normalizeOrderStatus(raw?.status),
    is18Confirmed: raw?.is18Confirmed === true,
    createdAt: cleanString(raw?.createdAt) || new Date().toISOString(),
  };
}
