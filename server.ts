import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import zlib from 'zlib';
import nodemailer from 'nodemailer';
import {
  parseStrictNonNegativeNumber,
  resolveNonNegativeRate,
  getIstDateString,
} from './src/lib/orderNormalizer';
import {
  DEFAULT_CATALOG_ITEMS,
  DEFAULT_GAMING_RATES,
  DEFAULT_VENUE_SETTINGS,
  CATALOG_CHAPTERS,
  formatOperatingHours,
  type CatalogItem,
  type GamingRates,
  type VenueSettings,
} from './src/data/catalogData';
import {
  MENU_SOURCE_MAP,
  clampWidth,
  clampQuality,
  negotiateFormat,
  resolveAllowlistedSourcePath,
  transformImageToBuffer,
} from './src/lib/serverImageTransform';
import {
  calculateLoyaltyFromOrders,
  getLoyaltyTier,
  LOYALTY_REWARDS_CATALOG,
} from './src/lib/loyalty';
import type { LoyaltyRewardVoucher, LoyaltySummary } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
// Respect --port CLI arg first; in dev default strictly to 3000 so container PORT=8080 (nginx) never collides
function resolveServerPort(): number {
  const portFlagIdx = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const portEqArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (portEqArg) {
    const parsed = Number(portEqArg.split('=')[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const parsed = Number(process.env.PORT);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}
const PORT = resolveServerPort();

app.use(express.json({ limit: '8mb' }));

// Reject malformed non-object JSON payloads on /api/* (e.g. arrays, primitives, null)
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    req.method !== 'OPTIONS' &&
    req.body !== undefined &&
    (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body))
  ) {
    return res.status(400).json({ error: 'Invalid request payload format.' });
  }
  next();
});

function renderSanitizedErrorHtml(statusCode: 404 | 500): string {
  const is404 = statusCode === 404;
  const title = is404 ? 'Page Unavailable' : 'Temporary Interruption';
  const heading = is404 ? "We Couldn't Find That Page" : 'Something Went Briefly Off-Script';
  const body = is404
    ? 'The link you followed may have moved or is no longer active. Return to the Hot & Spicy main dining and lounge menu below.'
    : 'A brief service interruption occurred while processing your request. Please refresh or return to the Hot & Spicy home page.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Hot & Spicy · ${title}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#E4D6C3;color:#14100B;font-family:system-ui,-apple-system,sans-serif;}
    .card{max-width:460px;width:100%;background:#EFE5D6;border:1px solid #C2AD93;border-radius:18px;padding:36px 28px;text-align:center;box-shadow:0 20px 44px -18px rgba(20,16,11,.25);}
    .badge{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#5C4008;margin-bottom:10px;}
    h1{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;line-height:1.2;}
    p{font-size:14px;color:#3B3126;line-height:1.6;margin:0 0 24px;}
    .actions{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 22px;border-radius:12px;background:#8D6613;color:#FAF2E6;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:none;cursor:pointer;}
    .btn:hover{background:#73520D;}
    .btn-sec{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 20px;border-radius:12px;background:#E4D6C3;color:#14100B;border:1px solid #C2AD93;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}
    .btn-sec:hover{background:#D9C7B0;}
    .foot{margin-top:22px;padding-top:16px;border-top:1px solid #C2AD93;font-size:12px;color:#574939;}
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Hot &amp; Spicy · ${is404 ? '404' : '500'}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <div class="actions">
      <button type="button" class="btn-sec" onclick="if(window.history.length>1){window.history.back()}else{window.location.href='/'}">Go Back</button>
      <a class="btn" href="/">Back to Home</a>
    </div>
    <div class="foot">Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia · +91 7605857713</div>
  </main>
</body>
</html>`;
}

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/server\.(ts|js|mjs)$/i,
  /^\/firebase[-_].*\.(json|xml)$/i,
  /^\/firestore\.rules$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/tsconfig\.json$/i,
  /^\/NULL-SEMANTICS\.md$/i,
  /^\/security_spec\.md$/i,
  /^\/tests(\/|$)/i,
  /^\/skills(\/|$)/i,
  /^\/data(\/|$)/i,
];

app.use((req: Request, res: Response, next: NextFunction) => {
  const p = req.path || '';
  const isViteFirebaseConfigImport =
    process.env.NODE_ENV !== 'production' &&
    p === '/firebase-applet-config.json' &&
    Object.prototype.hasOwnProperty.call(req.query, 'import');
  if (isViteFirebaseConfigImport) {
    return next();
  }
  const blockedProdSrc = process.env.NODE_ENV === 'production' && p.startsWith('/src/');
  if (blockedProdSrc || SENSITIVE_PATH_PATTERNS.some((rx) => rx.test(p))) {
    if (req.headers.accept?.includes('application/json') && !req.headers.accept?.includes('text/html')) {
      return res.status(404).json({ error: 'Resource unavailable.' });
    }
    return res.status(404).type('html').send(renderSanitizedErrorHtml(404));
  }
  next();
});

// Fast built-in gzip compression for JSON & text responses (skips binary/video/range requests)
app.use((req: Request, res: Response, next: NextFunction) => {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip') || req.headers.range) {
    return next();
  }
  const origSend = res.send.bind(res);
  res.send = ((body?: any) => {
    const contentType = String(res.getHeader('Content-Type') || '');
    const isCompressible =
      typeof body === 'string' ||
      Buffer.isBuffer(body)
        ? /json|text|javascript|xml|svg/i.test(contentType) || !contentType
        : true;

    if (!isCompressible || res.headersSent || res.getHeader('Content-Encoding')) {
      return origSend(body);
    }

    const raw =
      typeof body === 'string'
        ? Buffer.from(body, 'utf8')
        : Buffer.isBuffer(body)
        ? body
        : body !== undefined
        ? Buffer.from(JSON.stringify(body), 'utf8')
        : null;

    if (!raw || raw.length < 1024) {
      return origSend(body);
    }

    try {
      const zipped = zlib.gzipSync(raw, { level: 6 });
      if (zipped.length < raw.length) {
        if (!contentType && typeof body === 'string') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.removeHeader('Content-Length');
        return origSend(zipped);
      }
    } catch {
      // Fallback to uncompressed response seamlessly
    }
    return origSend(body);
  }) as any;
  next();
});

// -------------------------------------------------------------
// Security & Rate Limiting System (In-Memory Sliding Window)
// -------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const authRateLimitMap = new Map<string, RateLimitRecord>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 80;
const AUTH_MAX_REQUESTS = Number(process.env.RATE_LIMIT_AUTH_MAX) || 12;

function isTestEnvironment(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

function rateLimiter(isAuth: boolean = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isTestEnvironment()) {
      return next();
    }
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown-ip';
    const store = isAuth ? authRateLimitMap : rateLimitMap;
    const max = isAuth ? AUTH_MAX_REQUESTS : MAX_REQUESTS;
    const now = Date.now();

    const record = store.get(ip);
    if (!record || now > record.resetAt) {
      store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    if (record.count >= max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: retryAfter,
      });
    }

    record.count += 1;
    next();
  };
}

// Clean up stale rate limit and OTP challenge entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitMap.entries()) {
    if (now > rec.resetAt) rateLimitMap.delete(ip);
  }
  for (const [ip, rec] of authRateLimitMap.entries()) {
    if (now > rec.resetAt) authRateLimitMap.delete(ip);
  }
  for (const [emailKey, rec] of emailOtpChallenges.entries()) {
    if (now > rec.expiresAt) emailOtpChallenges.delete(emailKey);
  }
  for (const [emailKey, until] of emailOtpCooldowns.entries()) {
    if (now > until) emailOtpCooldowns.delete(emailKey);
  }
  for (const [jti, exp] of activePasswordResetTokens.entries()) {
    if (now > exp) activePasswordResetTokens.delete(jti);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

// Apply general rate limit to all /api routes
app.use('/api', rateLimiter(false));

// -------------------------------------------------------------
// Secure Backend Secrets & Token Verification (Zero Frontend Exposure)
// -------------------------------------------------------------
const PERMANENT_ADMIN_EMAIL = 'smdasif665@gmail.com';
const INITIAL_ADMIN_PASSWORD = 'hotspicy098765';
let persistedAdminSecret = crypto.randomBytes(32).toString('hex');
let persistedCustomerSecret = crypto.randomBytes(32).toString('hex');

function getAdminSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || persistedAdminSecret;
}

function getCustomerSecret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || persistedCustomerSecret;
}

function generateAdminToken(): string {
  const payload = {
    role: 'admin',
    email: PERMANENT_ADMIN_EMAIL,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getAdminSecret()).update(str).digest('hex');
  return `${str}.${signature}`;
}

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getAdminSecret()).update(str).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;

  try {
    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return false;
    if (payload.role !== 'admin') return false;
    if (String(payload.email || '').toLowerCase().trim() !== PERMANENT_ADMIN_EMAIL) return false;
    return true;
  } catch {
    return false;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function generateCustomerToken(uid: string): string {
  const payload = {
    uid,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getCustomerSecret()).update(str).digest('hex');
  return `${str}.${signature}`;
}

function verifyCustomerToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getCustomerSecret()).update(str).digest('hex');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp || !payload.uid) return null;
    return String(payload.uid);
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt?: string): string {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return `${useSalt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) return false;
  const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex');
  if (derivedHex.length !== hashHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(derivedHex, 'hex'), Buffer.from(hashHex, 'hex'));
}

function validateCustomerPassword(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return 'Password is required.';
  }
  if (raw.trim().length < 6) {
    return 'Password must be at least 6 non-space characters.';
  }
  if (raw.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  return null;
}

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;



const CANONICAL_OTP_SENDER_EMAIL = 'smdasif665@gmail.com';

// -------------------------------------------------------------
// Secure Email OTP Password Reset System (Customers Only — Zero Admin Reset)
// -------------------------------------------------------------
interface EmailOtpChallenge {
  uid: string;
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
}

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const EMAIL_OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
const PASSWORD_RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const emailOtpChallenges = new Map<string, EmailOtpChallenge>(); // keyed by lowercased email
const emailOtpCooldowns = new Map<string, number>(); // keyed by lowercased email -> epoch ms
const activePasswordResetTokens = new Map<string, number>(); // keyed by jti -> epoch ms

function hashEmailOtp(uid: string, email: string, otp: string): string {
  return crypto
    .createHmac('sha256', getCustomerSecret())
    .update(`email-otp:${uid}:${email}:${otp}`)
    .digest('hex');
}

function generatePasswordResetToken(uid: string, email: string): string {
  const jti = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + PASSWORD_RESET_TOKEN_TTL_MS;
  activePasswordResetTokens.set(jti, exp);
  const payload = {
    purpose: 'pwd_reset',
    uid,
    email,
    jti,
    exp,
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getCustomerSecret()).update(str).digest('hex');
  return `${str}.${signature}`;
}

function verifyPasswordResetToken(
  token: string,
  expectedEmail: string
): { uid: string; jti: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getCustomerSecret()).update(str).digest('hex');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (payload.purpose !== 'pwd_reset' || !payload.uid || !payload.jti) return null;
    if (Date.now() > Number(payload.exp)) return null;
    if (String(payload.email || '').toLowerCase().trim() !== expectedEmail) return null;
    const storedExp = activePasswordResetTokens.get(String(payload.jti));
    if (!storedExp || Date.now() > storedExp) return null;
    return { uid: String(payload.uid), jti: String(payload.jti) };
  } catch {
    return null;
  }
}

function hasEmailOtpTransport(): boolean {
  if (process.env.RESEND_API_KEY) return true;
  if (process.env.SENDGRID_API_KEY) return true;
  if (process.env.GMAIL_APP_PASSWORD) return true;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return true;
  return false;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendResetOtpEmail(
  toEmail: string,
  userName: string,
  otp: string,
  purpose: 'reset' | 'admin-2fa' = 'reset'
): Promise<void> {
  const safeName = escapeHtml(userName || 'Guest');
  const gmailUser = (process.env.GMAIL_USER || CANONICAL_OTP_SENDER_EMAIL).trim();
  const fromAddress =
    process.env.EMAIL_FROM || `Hot & Spicy <${CANONICAL_OTP_SENDER_EMAIL}>`;
  const isAdmin2fa = purpose === 'admin-2fa';
  const subject = isAdmin2fa
    ? 'Hot & Spicy Admin Portal — Two-Factor Verification Code'
    : 'Hot & Spicy — Password Reset Verification Code';
  const text = isAdmin2fa
    ? `Hello Administrator,\n\nYour 6-digit Admin Portal 2FA verification code is: ${otp}\n\nThis code expires in 5 minutes and was dispatched via ${CANONICAL_OTP_SENDER_EMAIL}.\n\n— Hot & Spicy Security`
    : `Hello ${userName || 'Guest'},\n\nYour 6-digit password reset verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request a password reset, please ignore this email.\n\n— Hot & Spicy Kitchen & Gaming Lounge, Bansberia`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 12px; background: #ffffff; color: #111111;">
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #000000;">${
        isAdmin2fa ? 'Admin Two-Factor Verification' : 'Password Reset Verification'
      }</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #404040;">Hello ${safeName},</p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #404040;">${
        isAdmin2fa
          ? 'Use the 6-digit verification code below to complete your Admin Portal login:'
          : 'Use the 6-digit verification code below to reset your Hot &amp; Spicy account password:'
      }</p>
      <div style="margin: 20px 0; padding: 16px; background: #f5f5f5; border: 1px solid #d4d4d4; border-radius: 10px; text-align: center; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #000000;">
        ${otp}
      </div>
      <p style="margin: 0 0 8px; font-size: 12px; color: #525252;">This code expires in <strong>${
        isAdmin2fa ? '5 minutes' : '10 minutes'
      }</strong> and can only be used once.</p>
      <p style="margin: 0; font-size: 12px; color: #737373;">Sent by Hot &amp; Spicy (${CANONICAL_OTP_SENDER_EMAIL}). If you did not request this code, you can safely ignore this email.</p>
    </div>
  `;

  if (process.env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: fromAddress,
      replyTo: CANONICAL_OTP_SENDER_EMAIL,
      to: toEmail,
      subject,
      text,
      html,
    });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: CANONICAL_OTP_SENDER_EMAIL,
        to: [toEmail],
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`Resend API error (${resp.status}): ${errBody.slice(0, 140)}`);
    }
    return;
  }

  if (process.env.SENDGRID_API_KEY) {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: CANONICAL_OTP_SENDER_EMAIL, name: 'Hot & Spicy' },
        reply_to: { email: CANONICAL_OTP_SENDER_EMAIL, name: 'Hot & Spicy' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`SendGrid API error (${resp.status}): ${errBody.slice(0, 140)}`);
    }
    return;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: fromAddress,
      replyTo: CANONICAL_OTP_SENDER_EMAIL,
      to: toEmail,
      subject,
      text,
      html,
    });
    return;
  }

  throw new Error('EMAIL_TRANSPORT_NOT_CONFIGURED');
}

// In-Memory Database Stores for Admin
interface AdminOrder {
  id: string;
  userId?: string;
  customerName: string;
  phone: string;
  address: string;
  diningMode: 'dine-in' | 'takeaway';
  itemsSummary: string;
  subtotal: number;
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';
  is18Confirmed?: boolean;
  createdAt: string;
}

interface AdminReservation {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  address: string;
  bookingType: string;
  poolDuration?: string;
  date: string;
  timeSlot: string;
  guests: number;
  specialRequests?: string;
  is18Confirmed?: boolean;
  voucherCode?: string;
  discountAmount?: number;
  rewardTitle?: string;
  status: 'Confirmed' | 'Completed' | 'Cancelled';
  createdAt: string;
}

const LEGACY_DEMO_ORDER_IDS = new Set([
  'ORD-781290',
  'ORD-654129',
  'ORD-892341',
  'ORD-510482',
]);
const LEGACY_DEMO_RESERVATION_IDS = new Set(['BK-482910', 'BK-339102']);

const mockOrders: AdminOrder[] = [];

const mockReservations: AdminReservation[] = [];

const userRewards: LoyaltyRewardVoucher[] = [];

// -------------------------------------------------------------
// Backend Customer User Store, Live Catalog & File Persistence
// -------------------------------------------------------------
interface StoredUser {
  uid: string;
  name: string;
  email: string;
  phone: string;
  phoneVerified?: boolean;
  address: string;
  is18Plus: boolean;
  dietaryPreference?: 'all' | 'veg' | 'non-veg';
  passwordHash?: string;
  authProvider: 'email' | 'phone' | 'google';
  loyaltyPoints?: number;
  earnedPoints?: number;
  spentPoints?: number;
  loyaltyTier?: string;
  loyaltyUpdatedAt?: string;
  createdAt: string;
  lastLoginAt: string;
  lastIp?: string;
  ipAutoLoginDisabled?: boolean;
}

const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'venue_store.json');
const BACKUP_STORE_FILE = path.join(DATA_DIR, 'venue_store.backup.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_TMP_STORE_FILE = '/tmp/hs_venue_store.json';

const customerUsers = new Map<string, StoredUser>(); // keyed by uid
let catalogItems: CatalogItem[] = DEFAULT_CATALOG_ITEMS.map((item) => ({ ...item }));
let gamingRates: GamingRates = { ...DEFAULT_GAMING_RATES };
let venueSettings: VenueSettings = { ...DEFAULT_VENUE_SETTINGS };
let loungePerfMonitorEnabled = false;
let hiddenInstagramIds: string[] = [];
let adminPasswordHash: string = hashPassword(INITIAL_ADMIN_PASSWORD);
const ADMIN_PASSWORD_VERSION = 3;

function ensureDataDirs() {
  if (isTestEnvironment()) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {}
}

function isValidCatalogImageUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return true; // empty string clears back to preset imageKey
  if (s.length > 600) return false;
  if (/^(\/api\/uploads\/[a-zA-Z0-9._-]+|\/assets\/[a-zA-Z0-9/._-]+)$/i.test(s)) {
    return true;
  }
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidExternalHttpUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s || s.length > 500) return false;
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizeVenueSettings(raw: any): VenueSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VENUE_SETTINGS };
  const handleRaw = typeof raw.instagramHandle === 'string' ? raw.instagramHandle.trim() : '';
  const cleanHandle = handleRaw
    ? handleRaw.startsWith('@')
      ? handleRaw.slice(0, 60)
      : `@${handleRaw.slice(0, 59)}`
    : DEFAULT_VENUE_SETTINGS.instagramHandle;

  return {
    openingTime:
      typeof raw.openingTime === 'string' && raw.openingTime.trim()
        ? raw.openingTime.trim().slice(0, 40)
        : DEFAULT_VENUE_SETTINGS.openingTime,
    closingTime:
      typeof raw.closingTime === 'string' && raw.closingTime.trim()
        ? raw.closingTime.trim().slice(0, 40)
        : DEFAULT_VENUE_SETTINGS.closingTime,
    kitchenLastOrder:
      typeof raw.kitchenLastOrder === 'string' && raw.kitchenLastOrder.trim()
        ? raw.kitchenLastOrder.trim().slice(0, 40)
        : DEFAULT_VENUE_SETTINGS.kitchenLastOrder,
    whatsappNumber:
      typeof raw.whatsappNumber === 'string' && raw.whatsappNumber.trim()
        ? raw.whatsappNumber.trim().slice(0, 32)
        : DEFAULT_VENUE_SETTINGS.whatsappNumber,
    address:
      typeof raw.address === 'string' && raw.address.trim()
        ? raw.address.trim().slice(0, 220)
        : DEFAULT_VENUE_SETTINGS.address,
    instagramHandle: cleanHandle,
    instagramUrl: isValidExternalHttpUrl(raw.instagramUrl)
      ? raw.instagramUrl.trim()
      : DEFAULT_VENUE_SETTINGS.instagramUrl,
    youtubeUrl: isValidExternalHttpUrl(raw.youtubeUrl)
      ? raw.youtubeUrl.trim()
      : DEFAULT_VENUE_SETTINGS.youtubeUrl,
    facebookUrl: isValidExternalHttpUrl(raw.facebookUrl)
      ? raw.facebookUrl.trim()
      : DEFAULT_VENUE_SETTINGS.facebookUrl,
  };
}

function resolveFirebaseWebApiKey(): string {
  const envKey = process.env.FIREBASE_API_KEY;
  if (envKey && envKey !== 'YOUR_FIREBASE_API_KEY') return envKey;
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey) {
        return parsed.apiKey;
      }
    }
  } catch {}
  return '';
}

const FIREBASE_WEB_API_KEY = resolveFirebaseWebApiKey();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
  const raw = fwd || req.ip || req.socket?.remoteAddress || '';
  let clean = raw.replace(/^::ffff:/i, '').trim();
  if (clean === '::1') clean = '127.0.0.1';
  return clean;
}

function findUserByEmail(email: string): StoredUser | undefined {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return undefined;
  for (const u of customerUsers.values()) {
    if ((u.email || '').toLowerCase().trim() === clean) return u;
  }
  return undefined;
}

function findMostRecentUserByIp(ip: string): StoredUser | undefined {
  if (!ip || ip === 'unknown') return undefined;
  let best: StoredUser | undefined;
  let bestTime = -1;
  for (const u of customerUsers.values()) {
    if (u.lastIp === ip && !u.ipAutoLoginDisabled) {
      const ts = new Date(u.lastLoginAt || u.createdAt || 0).getTime() || 0;
      if (!best || ts >= bestTime) {
        best = u;
        bestTime = ts;
      }
    }
  }
  return best;
}

function normPhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

async function verifyFirebaseGoogleIdToken(
  idToken: string
): Promise<{ firebaseUid: string; email: string; name: string; emailVerified: boolean } | null> {
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const fbUser = Array.isArray(data?.users) ? data.users[0] : null;
    const cleanEmail = String(fbUser?.email || '').toLowerCase().trim();
    if (!fbUser?.localId || !VALID_EMAIL_REGEX.test(cleanEmail)) return null;
    return {
      firebaseUid: String(fbUser.localId),
      email: cleanEmail,
      name: String(fbUser.displayName || '').trim() || cleanEmail.split('@')[0] || 'Hot & Spicy Guest',
      emailVerified: Boolean(fbUser.emailVerified),
    };
  } catch {
    return null;
  }
}

interface CustomInstagramVideo {
  id: string;
  imageKey:
    | 'tandoor'
    | 'momos'
    | 'pizza'
    | 'burger'
    | 'noodles'
    | 'frappe'
    | 'pool'
    | 'ps5'
    | 'combos'
    | 'store';
  reelUrl: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  caption: string;
  category: string;
  duration?: string;
  createdAt: string;
}

let customInstagramVideos: CustomInstagramVideo[] = [];
let reelPosterOverrides: Record<string, string> = {};

function computeUserLoyalty(uid: string): LoyaltySummary {
  const userOrderHistory = mockOrders.filter((o) => o.userId === uid);
  const vouchers = userRewards
    .filter((v) => v.userId === uid)
    .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

  const { earnedPoints, spentPoints, availablePoints } = calculateLoyaltyFromOrders(
    userOrderHistory,
    vouchers
  );

  return {
    earnedPoints,
    spentPoints,
    availablePoints,
    vouchers,
  };
}

function syncUserLoyaltyInStore(uid: string, persist = true): LoyaltySummary {
  const summary = computeUserLoyalty(uid);
  const matchedUser = customerUsers.get(uid);
  if (matchedUser) {
    const tierName = getLoyaltyTier(summary.earnedPoints).name;
    const changed =
      matchedUser.loyaltyPoints !== summary.availablePoints ||
      matchedUser.earnedPoints !== summary.earnedPoints ||
      matchedUser.spentPoints !== summary.spentPoints ||
      matchedUser.loyaltyTier !== tierName;

    matchedUser.loyaltyPoints = summary.availablePoints;
    matchedUser.earnedPoints = summary.earnedPoints;
    matchedUser.spentPoints = summary.spentPoints;
    matchedUser.loyaltyTier = tierName;
    if (changed || !matchedUser.loyaltyUpdatedAt) {
      matchedUser.loyaltyUpdatedAt = new Date().toISOString();
    }
    customerUsers.set(uid, matchedUser);
    if (persist && changed) {
      persistStore();
    }
  }
  return summary;
}

function persistStore() {
  if (isTestEnvironment()) return;
  try {
    ensureDataDirs();
    const data = {
      users: Array.from(customerUsers.values()),
      orders: mockOrders,
      reservations: mockReservations,
      userRewards,
      catalogItems,
      gamingRates,
      venueSettings,
      loungePerfMonitorEnabled,
      customInstagramVideos,
      hiddenInstagramIds,
      reelPosterOverrides,
      adminPasswordHash,
      adminPasswordVersion: ADMIN_PASSWORD_VERSION,
      persistedAdminSecret,
      persistedCustomerSecret,
    };
    const serialized = JSON.stringify(data, null, 2);
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, serialized, 'utf8');
    if (fs.existsSync(STORE_FILE)) {
      try {
        const currentContent = fs.readFileSync(STORE_FILE, 'utf8');
        JSON.parse(currentContent);
        fs.writeFileSync(BACKUP_STORE_FILE, currentContent, 'utf8');
      } catch {}
    }
    fs.renameSync(tmpFile, STORE_FILE);
  } catch {
    // Non-fatal in read-only containers
  }
}

function sanitizeUser(u: StoredUser) {
  return {
    uid: u.uid,
    name: u.name,
    email: u.email,
    phone: u.phone,
    phoneVerified: Boolean(u.phoneVerified),
    authProvider: u.authProvider,
    address: u.address,
    is18Plus: Boolean(u.is18Plus),
    ...(u.dietaryPreference === 'all' ||
    u.dietaryPreference === 'veg' ||
    u.dietaryPreference === 'non-veg'
      ? { dietaryPreference: u.dietaryPreference }
      : {}),
    loyaltyPoints: typeof u.loyaltyPoints === 'number' ? u.loyaltyPoints : 0,
    earnedPoints: typeof u.earnedPoints === 'number' ? u.earnedPoints : 0,
    spentPoints: typeof u.spentPoints === 'number' ? u.spentPoints : 0,
    loyaltyTier: u.loyaltyTier || getLoyaltyTier(u.earnedPoints || 0).name,
    loyaltyUpdatedAt: u.loyaltyUpdatedAt || u.createdAt,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function loadStore() {
  ensureDataDirs();
  let raw: any = null;
  let needsResave = false;

  const tryReadJson = (filePath: string): any => {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  };

  raw = tryReadJson(STORE_FILE);
  if (!raw && fs.existsSync(BACKUP_STORE_FILE)) {
    raw = tryReadJson(BACKUP_STORE_FILE);
    if (raw) needsResave = true;
  }
  if (!raw && fs.existsSync(LEGACY_TMP_STORE_FILE)) {
    raw = tryReadJson(LEGACY_TMP_STORE_FILE);
    if (raw) needsResave = true;
  }

  if (!raw) {
    // Write initial store so generated secrets persist cleanly across restarts
    persistStore();
    return;
  }

  try {
    if (typeof raw.persistedAdminSecret === 'string' && raw.persistedAdminSecret.length >= 32) {
      persistedAdminSecret = raw.persistedAdminSecret;
    } else {
      needsResave = true;
    }
    if (typeof raw.persistedCustomerSecret === 'string' && raw.persistedCustomerSecret.length >= 32) {
      persistedCustomerSecret = raw.persistedCustomerSecret;
    } else {
      needsResave = true;
    }
    if (Array.isArray(raw.users)) {
      for (const u of raw.users) {
        if (u?.uid) customerUsers.set(String(u.uid), u);
      }
    }
    if (Array.isArray(raw.orders)) {
      const realOrders = raw.orders
        .filter((o: AdminOrder) => o && o.id && !LEGACY_DEMO_ORDER_IDS.has(o.id))
        .map((o: AdminOrder) => {
          if (!o.userId) {
            needsResave = true;
            return { ...o, userId: 'guest' };
          }
          return o;
        });
      if (realOrders.length !== raw.orders.length) needsResave = true;
      mockOrders.splice(0, mockOrders.length, ...realOrders);
    }
    if (Array.isArray(raw.reservations)) {
      const realReservations = raw.reservations
        .filter((r: AdminReservation) => r && r.id && !LEGACY_DEMO_RESERVATION_IDS.has(r.id))
        .map((r: AdminReservation) => {
          if (!r.userId) {
            needsResave = true;
            return { ...r, userId: 'guest' };
          }
          return r;
        });
      if (realReservations.length !== raw.reservations.length) needsResave = true;
      mockReservations.splice(0, mockReservations.length, ...realReservations);
    }
    if (Array.isArray(raw.userRewards)) {
      const validRewards = raw.userRewards.filter(
        (v: LoyaltyRewardVoucher) => v && v.id && v.code && Boolean(v.userId)
      );
      userRewards.splice(0, userRewards.length, ...validRewards);
    }
    if (Array.isArray(raw.catalogItems) && raw.catalogItems.length > 0) {
      catalogItems = raw.catalogItems.map((item: CatalogItem) => ({
        ...item,
        ...(typeof item.imageUrl === 'string' && item.imageUrl.trim() && isValidCatalogImageUrl(item.imageUrl)
          ? { imageUrl: item.imageUrl.trim() }
          : {}),
      }));
    }
    if (raw.gamingRates && typeof raw.gamingRates === 'object') {
      gamingRates = {
        pool15Price: resolveNonNegativeRate(raw.gamingRates.pool15Price, DEFAULT_GAMING_RATES.pool15Price),
        pool30Price: resolveNonNegativeRate(raw.gamingRates.pool30Price, DEFAULT_GAMING_RATES.pool30Price),
        ps5HourlyPrice: resolveNonNegativeRate(raw.gamingRates.ps5HourlyPrice, DEFAULT_GAMING_RATES.ps5HourlyPrice),
      };
    }
    if (raw.venueSettings && typeof raw.venueSettings === 'object') {
      venueSettings = sanitizeVenueSettings(raw.venueSettings);
    }
    if (typeof raw.loungePerfMonitorEnabled === 'boolean') {
      loungePerfMonitorEnabled = raw.loungePerfMonitorEnabled;
    }
    if (Array.isArray(raw.customInstagramVideos)) {
      customInstagramVideos = raw.customInstagramVideos;
    }
    if (Array.isArray(raw.hiddenInstagramIds)) {
      hiddenInstagramIds = raw.hiddenInstagramIds
        .filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
        .map((id: string) => id.trim());
    }
    if (raw.reelPosterOverrides && typeof raw.reelPosterOverrides === 'object') {
      const sanitizedOverrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw.reelPosterOverrides)) {
        if (
          typeof k === 'string' &&
          k.trim() &&
          typeof v === 'string' &&
          v.trim() &&
          isValidCatalogImageUrl(v)
        ) {
          sanitizedOverrides[k.trim()] = v.trim();
        }
      }
      reelPosterOverrides = sanitizedOverrides;
    }
    if (raw.adminPasswordVersion === ADMIN_PASSWORD_VERSION && typeof raw.adminPasswordHash === 'string' && raw.adminPasswordHash.includes(':')) {
      adminPasswordHash = raw.adminPasswordHash;
    }
    for (const uid of customerUsers.keys()) {
      const prev = customerUsers.get(uid);
      const beforePoints = prev?.loyaltyPoints;
      const summary = syncUserLoyaltyInStore(uid, false);
      if (beforePoints !== summary.availablePoints) {
        needsResave = true;
      }
    }
    if (needsResave) {
      persistStore();
    }
  } catch {
    // Preserve loaded partial state safely
  }
}

if (!isTestEnvironment()) {
  loadStore();
}

export function resetStoreForTesting() {
  customerUsers.clear();
  mockOrders.splice(0, mockOrders.length);
  mockReservations.splice(0, mockReservations.length);
  userRewards.splice(0, userRewards.length);
  catalogItems = DEFAULT_CATALOG_ITEMS.map((item) => ({ ...item }));
  gamingRates = { ...DEFAULT_GAMING_RATES };
  venueSettings = { ...DEFAULT_VENUE_SETTINGS };
  loungePerfMonitorEnabled = false;
  customInstagramVideos = [];
  hiddenInstagramIds = [];
  reelPosterOverrides = {};
  instagramFeedCache = null;
  adminPasswordHash = hashPassword(INITIAL_ADMIN_PASSWORD);
  emailOtpChallenges.clear();
  emailOtpCooldowns.clear();
  activePasswordResetTokens.clear();
  rateLimitMap.clear();
  authRateLimitMap.clear();
}

// -------------------------------------------------------------
// Customer Authentication Routes (Google + Email/Password)
// -------------------------------------------------------------
app.post('/api/auth/signup', rateLimiter(true), async (req: Request, res: Response) => {
  const { email, password, name, address, is18Plus, phone } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const rawPassword = typeof password === 'string' ? password : '';
  const cleanName = String(name || '').trim();
  const rawPhone = typeof phone === 'string' ? phone.trim() : '';
  const phoneDigits = rawPhone.replace(/\D/g, '').slice(-10);
  const cleanPhone =
    phoneDigits.length === 10 ? `+91 ${phoneDigits}` : rawPhone.slice(0, 20);

  if (!cleanEmail || !VALID_EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (!cleanName || cleanName.length > 100) {
    return res.status(400).json({ error: 'Please enter a valid full name (1 to 100 characters).' });
  }
  const pwdError = validateCustomerPassword(rawPassword);
  if (pwdError) {
    return res.status(400).json({ error: pwdError });
  }
  if (is18Plus !== true) {
    return res.status(400).json({ error: 'Please confirm you are 18 years or older.' });
  }
  if (findUserByEmail(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  let firebaseSignUpUid: string | undefined;
  // Optional server-side Firebase Identity Toolkit registration (key stays strictly on server)
  if (FIREBASE_WEB_API_KEY) {
    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_WEB_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: rawPassword, returnSecureToken: false }),
        }
      );
      if (fbRes.ok) {
        const fbData: any = await fbRes.json();
        if (typeof fbData?.localId === 'string' && fbData.localId) {
          firebaseSignUpUid = fbData.localId;
        }
      }
    } catch {
      // Continue with backend store seamlessly
    }
  }

  const nowIso = new Date().toISOString();
  const uid = firebaseSignUpUid || 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 18);
  const clientIp = getClientIp(req);
  const newUser: StoredUser = {
    uid,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    phoneVerified: false,
    address: String(address || '').trim().slice(0, 250),
    is18Plus: true,
    passwordHash: hashPassword(rawPassword),
    authProvider: 'email',
    createdAt: nowIso,
    lastLoginAt: nowIso,
    ...(clientIp ? { lastIp: clientIp } : {}),
    ipAutoLoginDisabled: false,
  };

  customerUsers.set(uid, newUser);
  persistStore();

  const token = generateCustomerToken(uid);
  return res.status(201).json({
    token,
    user: sanitizeUser(newUser),
    firebaseCreated: Boolean(firebaseSignUpUid),
  });
});

// Unified Google Sign-In & Sign-Up endpoint (both tabs; enforces 18+ confirmation for new Google accounts)
app.post('/api/auth/google', rateLimiter(true), async (req: Request, res: Response) => {
  const { idToken, is18Plus, mode } = req.body || {};
  const tokenStr = typeof idToken === 'string' ? idToken.trim() : '';
  if (!tokenStr) {
    return res.status(400).json({ error: 'Google verification token is required.' });
  }

  const verifiedGoogle = await verifyFirebaseGoogleIdToken(tokenStr);
  if (!verifiedGoogle) {
    return res.status(401).json({
      error: 'Google account verification could not be confirmed. Please try again.',
    });
  }

  const nowIso = new Date().toISOString();
  const clientIp = getClientIp(req);
  const existing =
    customerUsers.get(verifiedGoogle.firebaseUid) || findUserByEmail(verifiedGoogle.email);

  if (existing) {
    existing.lastLoginAt = nowIso;
    if (clientIp) existing.lastIp = clientIp;
    existing.ipAutoLoginDisabled = false;
    if (!existing.name) existing.name = verifiedGoogle.name;
    customerUsers.set(existing.uid, existing);
    persistStore();
    const token = generateCustomerToken(existing.uid);
    return res.json({ token, user: sanitizeUser(existing), isNewUser: false });
  }

  if (is18Plus !== true) {
    if (mode === 'signin') {
      return res.json({
        needsAgeConfirmation: true,
        googleEmail: verifiedGoogle.email,
        googleName: verifiedGoogle.name,
      });
    }
    return res.status(400).json({
      error: 'Please confirm that you are 18 years or older before creating an account with Google.',
    });
  }

  const newUser: StoredUser = {
    uid: verifiedGoogle.firebaseUid,
    name: verifiedGoogle.name.slice(0, 100),
    email: verifiedGoogle.email,
    phone: '',
    phoneVerified: false,
    address: '',
    is18Plus: true,
    authProvider: 'google',
    createdAt: nowIso,
    lastLoginAt: nowIso,
    ...(clientIp ? { lastIp: clientIp } : {}),
    ipAutoLoginDisabled: false,
  };

  customerUsers.set(newUser.uid, newUser);
  persistStore();
  const token = generateCustomerToken(newUser.uid);
  return res.status(201).json({ token, user: sanitizeUser(newUser), isNewUser: true });
});

app.post('/api/auth/signin', rateLimiter(true), async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const rawPassword = String(password || '');

  if (!cleanEmail || !rawPassword) {
    return res.status(400).json({ error: 'Please enter your email and password.' });
  }

  let existing = findUserByEmail(cleanEmail);
  let verified = existing?.passwordHash ? verifyPassword(rawPassword, existing.passwordHash) : false;

  // Check server-side Firebase Auth if user registered earlier before backend store
  if (!verified && FIREBASE_WEB_API_KEY) {
    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: rawPassword, returnSecureToken: false }),
        }
      );
      if (fbRes.ok) {
        const fbData: any = await fbRes.json();
        verified = true;
        if (!existing) {
          const nowIso = new Date().toISOString();
          const migrated: StoredUser = {
            uid: fbData.localId || 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 18),
            name: fbData.displayName || 'Hot & Spicy Guest',
            email: cleanEmail,
            phone: '',
            address: '',
            is18Plus: true,
            passwordHash: hashPassword(rawPassword),
            authProvider: 'email',
            createdAt: nowIso,
            lastLoginAt: nowIso,
          };
          customerUsers.set(migrated.uid, migrated);
          existing = migrated;
        }
      }
    } catch {
      // Ignore upstream errors
    }
  }

  if (!verified || !existing) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const clientIp = getClientIp(req);
  existing.lastLoginAt = new Date().toISOString();
  if (clientIp) existing.lastIp = clientIp;
  existing.ipAutoLoginDisabled = false;
  persistStore();

  const token = generateCustomerToken(existing.uid);
  return res.json({ token, user: sanitizeUser(existing) });
});

// 1. Request Email OTP for Customer Password Reset (Explicitly blocks admin email)
app.post(
  '/api/auth/forgot-password/request',
  rateLimiter(true),
  async (req: Request, res: Response) => {
    const cleanEmail = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!hasEmailOtpTransport()) {
      return res.status(503).json({
        error: 'Password reset emails are temporarily unavailable right now. Please try again later.',
      });
    }

    const now = Date.now();
    const cooldownUntil = emailOtpCooldowns.get(cleanEmail) || 0;
    if (now < cooldownUntil) {
      const waitSeconds = Math.ceil((cooldownUntil - now) / 1000);
      return res.status(429).json({
        error: `Please wait ${waitSeconds}s before requesting another OTP.`,
        retryAfterSeconds: waitSeconds,
      });
    }

    // Enforce cooldown regardless of account existence to prevent email enumeration
    emailOtpCooldowns.set(cleanEmail, now + EMAIL_OTP_COOLDOWN_MS);

    // Strictly forbid resetting the permanent admin email via customer flow
    if (cleanEmail === PERMANENT_ADMIN_EMAIL) {
      return res.json({
        success: true,
        message: 'If an account exists for that email, a 6-digit verification OTP has been sent.',
        cooldownSeconds: Math.ceil(EMAIL_OTP_COOLDOWN_MS / 1000),
      });
    }

    const matchedUser = findUserByEmail(cleanEmail);
    if (!matchedUser) {
      return res.json({
        success: true,
        message: 'If an account exists for that email, a 6-digit verification OTP has been sent.',
        cooldownSeconds: Math.ceil(EMAIL_OTP_COOLDOWN_MS / 1000),
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const challenge: EmailOtpChallenge = {
      uid: matchedUser.uid,
      email: cleanEmail,
      otpHash: hashEmailOtp(matchedUser.uid, cleanEmail, otp),
      expiresAt: now + EMAIL_OTP_TTL_MS,
      attempts: 0,
      maxAttempts: 5,
    };

    try {
      await sendResetOtpEmail(cleanEmail, matchedUser.name, otp);
      emailOtpChallenges.set(cleanEmail, challenge);
    } catch (err) {
      emailOtpCooldowns.delete(cleanEmail);
      console.error('[Auth] Failed to deliver password reset OTP email:', err instanceof Error ? err.message : err);
      return res.status(502).json({
        error: 'Unable to send OTP email right now. Please verify email server settings or try again shortly.',
      });
    }

    return res.json({
      success: true,
      message: 'If an account exists for that email, a 6-digit verification OTP has been sent.',
      cooldownSeconds: Math.ceil(EMAIL_OTP_COOLDOWN_MS / 1000),
    });
  }
);

// 2. Verify Email OTP and Issue Short-Lived Single-Use Reset Token
app.post('/api/auth/forgot-password/verify', rateLimiter(true), (req: Request, res: Response) => {
  const cleanEmail = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const cleanOtp = typeof req.body?.otp === 'string' ? req.body.otp.replace(/\D/g, '') : '';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Please provide your email address.' });
  }
  if (!/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit OTP.' });
  }
  if (cleanEmail === PERMANENT_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Invalid or expired OTP. Please request a fresh code.' });
  }

  const challenge = emailOtpChallenges.get(cleanEmail);
  if (!challenge || Date.now() > challenge.expiresAt) {
    emailOtpChallenges.delete(cleanEmail);
    return res.status(400).json({ error: 'OTP has expired or is invalid. Please request a new code.' });
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    emailOtpChallenges.delete(cleanEmail);
    return res.status(429).json({
      error: 'Too many incorrect OTP attempts. Please request a fresh verification code.',
    });
  }

  const candidateHash = hashEmailOtp(challenge.uid, cleanEmail, cleanOtp);
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const expectedBuf = Buffer.from(challenge.otpHash, 'hex');
  const isMatch =
    candidateBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(candidateBuf, expectedBuf);

  if (!isMatch) {
    challenge.attempts += 1;
    const remaining = challenge.maxAttempts - challenge.attempts;
    if (remaining <= 0) {
      emailOtpChallenges.delete(cleanEmail);
      return res.status(429).json({
        error: 'Too many incorrect OTP attempts. Please request a fresh verification code.',
      });
    }
    return res.status(400).json({
      error: `Incorrect OTP code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    });
  }

  // Single-use OTP: invalidate challenge immediately upon successful verification
  emailOtpChallenges.delete(cleanEmail);
  const resetToken = generatePasswordResetToken(challenge.uid, cleanEmail);

  return res.json({
    success: true,
    resetToken,
    message: 'OTP verified. You may now set your new password.',
  });
});

// 3. Complete Customer Password Reset Using Verified Single-Use Reset Token
app.post('/api/auth/forgot-password/reset', rateLimiter(true), (req: Request, res: Response) => {
  const cleanEmail = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const resetToken = typeof req.body?.resetToken === 'string' ? req.body.resetToken.trim() : '';
  const rawNewPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Email address is required.' });
  }
  if (!resetToken) {
    return res.status(400).json({ error: 'Verification session expired. Please verify your OTP again.' });
  }
  if (cleanEmail === PERMANENT_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Operation not permitted for this account.' });
  }

  const pwdError = validateCustomerPassword(rawNewPassword);
  if (pwdError) {
    return res.status(400).json({ error: pwdError });
  }

  const verifiedToken = verifyPasswordResetToken(resetToken, cleanEmail);
  if (!verifiedToken) {
    return res.status(401).json({
      error: 'Password reset session has expired or was already used. Please request a new OTP.',
    });
  }

  const matchedUser = customerUsers.get(verifiedToken.uid);
  if (!matchedUser || (matchedUser.email || '').toLowerCase().trim() !== cleanEmail) {
    activePasswordResetTokens.delete(verifiedToken.jti);
    return res.status(404).json({ error: 'Account not found.' });
  }

  // Consume token immediately before updating password
  activePasswordResetTokens.delete(verifiedToken.jti);
  emailOtpChallenges.delete(cleanEmail);
  matchedUser.passwordHash = hashPassword(rawNewPassword);
  customerUsers.set(matchedUser.uid, matchedUser);
  persistStore();

  return res.json({
    success: true,
    message: 'Password updated successfully. You can now sign in with your new password.',
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) {
    return res.status(401).json({ error: 'Session expired' });
  }

  const matchedUser = customerUsers.get(uid);
  if (!matchedUser) {
    return res.status(401).json({ error: 'Session not found' });
  }

  const clientIp = getClientIp(req);
  if (clientIp && !matchedUser.lastIp) {
    matchedUser.lastIp = clientIp;
    persistStore();
  }

  const bookings = mockReservations.filter((r) => (r as any).userId === uid);
  const orders = mockOrders.filter((o) => (o as any).userId === uid);
  const loyalty = syncUserLoyaltyInStore(uid, true);
  return res.json({ user: sanitizeUser(matchedUser), bookings, orders, loyalty });
});

app.get('/api/auth/ip-session', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const matched = findMostRecentUserByIp(clientIp);
  if (!matched) {
    return res.json({ autoLoggedIn: false });
  }

  matched.lastLoginAt = new Date().toISOString();
  persistStore();

  const uid = matched.uid;
  const bookings = mockReservations.filter((r) => (r as any).userId === uid);
  const orders = mockOrders.filter((o) => (o as any).userId === uid);
  const loyalty = syncUserLoyaltyInStore(uid, true);
  const token = generateCustomerToken(uid);

  return res.json({
    autoLoggedIn: true,
    token,
    user: sanitizeUser(matched),
    bookings,
    orders,
    loyalty,
  });
});

app.post('/api/auth/signout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (uid) {
    const matched = customerUsers.get(uid);
    if (matched) {
      matched.ipAutoLoginDisabled = true;
      customerUsers.set(uid, matched);
      persistStore();
    }
  }
  return res.json({ success: true });
});

// Silent Firebase ID token -> backend session recovery (prevents Cart auth desync after reload/restart)
app.post('/api/auth/firebase-session', rateLimiter(true), async (req: Request, res: Response) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
  if (!idToken) {
    return res.status(400).json({ error: 'Firebase session token is required.' });
  }

  const verified = await verifyFirebaseGoogleIdToken(idToken);
  if (!verified) {
    return res.status(401).json({ error: 'Session verification failed. Please sign in again.' });
  }

  const nowIso = new Date().toISOString();
  const clientIp = getClientIp(req);
  let matched = customerUsers.get(verified.firebaseUid) || findUserByEmail(verified.email);

  if (!matched) {
    matched = {
      uid: verified.firebaseUid,
      name: verified.name.slice(0, 100),
      email: verified.email,
      phone: '',
      phoneVerified: false,
      address: '',
      is18Plus: true,
      authProvider: 'email',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      ...(clientIp ? { lastIp: clientIp } : {}),
      ipAutoLoginDisabled: false,
    };
    customerUsers.set(matched.uid, matched);
  } else {
    matched.lastLoginAt = nowIso;
    if (clientIp) matched.lastIp = clientIp;
    matched.ipAutoLoginDisabled = false;
    customerUsers.set(matched.uid, matched);
  }

  const uid = matched.uid;
  const bookings = mockReservations.filter((r) => (r as any).userId === uid);
  const orders = mockOrders.filter((o) => (o as any).userId === uid);
  const loyalty = syncUserLoyaltyInStore(uid, false);
  persistStore();

  return res.json({
    token: generateCustomerToken(uid),
    user: sanitizeUser(matched),
    bookings,
    orders,
    loyalty,
  });
});

app.post('/api/auth/link-firebase', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const oldUid = verifyCustomerToken(token);
  if (!oldUid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const currentUser = customerUsers.get(oldUid);
  if (!currentUser) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
  const verified = await verifyFirebaseGoogleIdToken(idToken);
  if (!verified || verified.email !== (currentUser.email || '').toLowerCase().trim()) {
    return res.status(401).json({ error: 'Account link verification failed.' });
  }

  const newUid = verified.firebaseUid;
  if (newUid === oldUid) {
    return res.json({ token: generateCustomerToken(oldUid), user: sanitizeUser(currentUser) });
  }

  if (customerUsers.has(newUid)) {
    const target = customerUsers.get(newUid)!;
    return res.json({ token: generateCustomerToken(newUid), user: sanitizeUser(target) });
  }

  customerUsers.delete(oldUid);
  currentUser.uid = newUid;
  customerUsers.set(newUid, currentUser);

  for (const order of mockOrders) {
    if ((order as any).userId === oldUid) (order as any).userId = newUid;
  }
  for (const reservation of mockReservations) {
    if ((reservation as any).userId === oldUid) (reservation as any).userId = newUid;
  }
  for (const voucher of userRewards) {
    if (voucher.userId === oldUid) voucher.userId = newUid;
  }

  persistStore();
  return res.json({
    token: generateCustomerToken(newUid),
    user: sanitizeUser(currentUser),
  });
});

app.post('/api/auth/loyalty/recalculate', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) {
    return res.status(401).json({ error: 'Session expired' });
  }

  const matchedUser = customerUsers.get(uid);
  if (!matchedUser) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const loyalty = syncUserLoyaltyInStore(uid, true);
  const orders = mockOrders.filter((o) => (o as any).userId === uid);
  return res.json({
    success: true,
    user: sanitizeUser(matchedUser),
    loyalty,
    orders,
  });
});

app.post('/api/rewards/redeem', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid || !customerUsers.has(uid)) {
    return res.status(401).json({ error: 'Please sign in to redeem loyalty rewards.' });
  }

  const rewardId = String(req.body?.rewardId || '').trim();
  const reward = LOYALTY_REWARDS_CATALOG.find((r) => r.id === rewardId);
  if (!reward) {
    return res.status(400).json({ error: 'Invalid reward selected.' });
  }

  const currentLoyalty = syncUserLoyaltyInStore(uid, false);
  if (currentLoyalty.availablePoints < reward.pointsCost) {
    return res.status(400).json({
      error: `You need ${reward.pointsCost - currentLoyalty.availablePoints} more loyalty points to claim this reward.`,
    });
  }

  const prefix =
    reward.category === 'dining'
      ? 'DIN'
      : reward.category === 'pool'
      ? 'POL'
      : reward.category === 'ps5'
      ? 'PS5'
      : 'VIP';
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const voucher: LoyaltyRewardVoucher = {
    id: `REW-${Date.now().toString(36).toUpperCase()}-${suffix}`,
    userId: uid,
    code: `HS-${prefix}-${suffix}`,
    rewardId: reward.id,
    title: reward.title,
    category: reward.category,
    discountAmount: reward.discountAmount,
    pointsCost: reward.pointsCost,
    status: 'active',
    redeemedAt: new Date().toISOString(),
  };

  userRewards.unshift(voucher);
  const updatedLoyalty = syncUserLoyaltyInStore(uid, true);
  persistStore();
  const matchedUser = customerUsers.get(uid)!;

  return res.json({
    success: true,
    voucher,
    loyalty: updatedLoyalty,
    user: sanitizeUser(matchedUser),
  });
});

app.patch('/api/auth/profile', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const matchedUser = customerUsers.get(uid);
  if (!matchedUser) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const { name, phone, address, is18Plus, dietaryPreference } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be a non-empty string (up to 100 characters).' });
    }
    matchedUser.name = name.trim();
  }
  if (phone !== undefined) {
    if (typeof phone !== 'string') {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }
    const nextPhone = phone.trim().slice(0, 20);
    if (nextPhone !== (matchedUser.phone || '') || nextPhone === '') {
      matchedUser.phoneVerified = false;
    }
    matchedUser.phone = nextPhone;
  }
  if (address !== undefined) {
    if (typeof address !== 'string') {
      return res.status(400).json({ error: 'Invalid address format.' });
    }
    matchedUser.address = address.trim().slice(0, 250);
  }
  if (is18Plus !== undefined) {
    if (typeof is18Plus !== 'boolean') {
      return res.status(400).json({ error: 'Invalid 18+ confirmation value.' });
    }
    matchedUser.is18Plus = is18Plus;
  }
  if (dietaryPreference !== undefined) {
    if (
      dietaryPreference !== 'all' &&
      dietaryPreference !== 'veg' &&
      dietaryPreference !== 'non-veg'
    ) {
      return res.status(400).json({ error: 'Dietary preference must be all, veg, or non-veg.' });
    }
    matchedUser.dietaryPreference = dietaryPreference;
  }

  persistStore();
  return res.json({ user: sanitizeUser(matchedUser) });
});

// -------------------------------------------------------------
// Live Menu Catalog & Gaming Lounge Rates (Public + Admin Sync)
// -------------------------------------------------------------
app.get('/api/catalog', (_req: Request, res: Response) => {
  res.json({
    items: catalogItems,
    gamingRates,
    venueSettings,
    loungePerfMonitorEnabled,
  });
});

// Public Google Maps JS API Key Endpoint (domain-restricted client key)
app.get('/api/maps-config', (_req: Request, res: Response) => {
  const apiKey = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
  res.json({ apiKey });
});

// -------------------------------------------------------------
// Admin Auth Route
// -------------------------------------------------------------
app.post('/api/admin/login', rateLimiter(true), async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const rawPassword = String(password || '');

  if (!cleanEmail || !rawPassword) {
    return res.status(400).json({ error: 'Both administrator email and password are required.' });
  }

  const emailBuf = Buffer.from(cleanEmail, 'utf8');
  const targetBuf = Buffer.from(PERMANENT_ADMIN_EMAIL, 'utf8');
  const emailMatch =
    emailBuf.length === targetBuf.length && crypto.timingSafeEqual(emailBuf, targetBuf);
  const passMatch = verifyPassword(rawPassword, adminPasswordHash);

  if (!emailMatch || !passMatch) {
    return res.status(401).json({ error: 'Invalid administrator email or password.' });
  }

  const token = generateAdminToken();
  return res.json({
    success: true,
    token,
    admin: { name: 'Hot & Spicy Administrator', email: PERMANENT_ADMIN_EMAIL },
  });
});

app.post('/api/admin/change-password', requireAdmin, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (!verifyPassword(String(currentPassword), adminPasswordHash)) {
    return res.status(401).json({ error: 'Current password does not match.' });
  }
  const pwdError = validateCustomerPassword(newPassword);
  if (pwdError) {
    return res.status(400).json({ error: pwdError });
  }
  adminPasswordHash = hashPassword(String(newPassword));
  persistStore();
  return res.json({ success: true, message: 'Administrator password updated cleanly.' });
});

app.get('/api/admin/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ valid: false });
  }
  return res.json({ valid: true });
});

function estimateReservationValue(r: AdminReservation): number {
  if (r.status === 'Cancelled') return 0;
  if (r.bookingType === 'pool') {
    return r.poolDuration === '15min' ? gamingRates.pool15Price : gamingRates.pool30Price;
  }
  if (r.bookingType === 'ps5') {
    return gamingRates.ps5HourlyPrice;
  }
  return 0;
}

// Admin Stats & Analytics Endpoint
app.get('/api/admin/stats', requireAdmin, (_req: Request, res: Response) => {
  const activeOrders = mockOrders.filter((o) => o.status !== 'Cancelled');
  const completedOrders = mockOrders.filter((o) => o.status === 'Completed');
  const pendingOrPrepOrders = mockOrders.filter(
    (o) => o.status === 'Pending' || o.status === 'Preparing' || o.status === 'Ready'
  );

  const safeSum = (list: AdminOrder[]) =>
    list.reduce((sum, o) => sum + Math.max(0, Number(o.subtotal) || 0), 0);

  const totalRevenue = safeSum(activeOrders);
  const completedRevenue = safeSum(completedOrders);
  const pendingRevenue = safeSum(pendingOrPrepOrders);

  const todayKey = getIstDateString();
  const todayRevenue = safeSum(
    activeOrders.filter((o) => getIstDateString(new Date(o.createdAt)) === todayKey)
  );

  const avgOrderValue = activeOrders.length > 0 ? Math.round(totalRevenue / activeOrders.length) : 0;
  const estimatedGamingRevenue = mockReservations.reduce((sum, r) => sum + estimateReservationValue(r), 0);

  // 7-day daily revenue buckets (IST calendar dates)
  const dailyRevenue: Array<{ date: string; label: string; revenue: number; ordersCount: number }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const dateKey = getIstDateString(d);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    const dayOrders = activeOrders.filter((o) => getIstDateString(new Date(o.createdAt)) === dateKey);
    const daySum = safeSum(dayOrders);
    dailyRevenue.push({
      date: dateKey,
      label,
      revenue: daySum,
      ordersCount: dayOrders.length,
    });
  }

  // Top ordered products parsed from itemsSummary
  const itemCounts = new Map<string, { name: string; count: number; revenue: number }>();
  for (const order of activeOrders) {
    const lines = String(order.itemsSummary || '').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(?:\d+\.\s*)?(.+?)\s+x(\d+).*?-\s*₹(\d+)/i);
      if (!m) continue;
      const itemName = m[1].trim();
      const qty = Number(m[2]) || 1;
      const lineTotal = Number(m[3]) || 0;
      const prev = itemCounts.get(itemName) || { name: itemName, count: 0, revenue: 0 };
      prev.count += qty;
      prev.revenue += lineTotal;
      itemCounts.set(itemName, prev);
    }
  }
  const topItems = Array.from(itemCounts.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const uniqueCustomers = new Set<string>();
  const registeredUids = new Set<string>();
  const registeredPhones = new Set<string>();
  for (const u of customerUsers.values()) {
    registeredUids.add(u.uid);
    uniqueCustomers.add(`uid:${u.uid}`);
    const p = (u.phone || '').replace(/\D/g, '').slice(-10);
    if (p.length >= 10) registeredPhones.add(p);
  }
  for (const o of mockOrders) {
    if (o.userId && registeredUids.has(o.userId)) continue;
    const digits = (o.phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length >= 10 && registeredPhones.has(digits)) continue;
    const cleanName = (o.customerName || '').toLowerCase().trim();
    uniqueCustomers.add(
      digits.length >= 10
        ? `phone:${digits}`
        : cleanName
        ? `guest:${cleanName}`
        : `guest-rec:${o.id}`
    );
  }
  for (const r of mockReservations) {
    if (r.userId && registeredUids.has(r.userId)) continue;
    const digits = (r.phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length >= 10 && registeredPhones.has(digits)) continue;
    const cleanName = (r.name || '').toLowerCase().trim();
    uniqueCustomers.add(
      digits.length >= 10
        ? `phone:${digits}`
        : cleanName
        ? `guest:${cleanName}`
        : `guest-rec:${r.id}`
    );
  }

  res.json({
    totalRevenue,
    completedRevenue,
    pendingRevenue,
    todayRevenue,
    avgOrderValue,
    estimatedGamingRevenue,
    combinedVenueRevenue: totalRevenue + estimatedGamingRevenue,
    totalOrders: mockOrders.length,
    pendingOrdersCount: mockOrders.filter((o) => o.status === 'Pending').length,
    preparingOrdersCount: mockOrders.filter((o) => o.status === 'Preparing').length,
    readyOrdersCount: mockOrders.filter((o) => o.status === 'Ready').length,
    completedOrdersCount: completedOrders.length,
    cancelledOrdersCount: mockOrders.filter((o) => o.status === 'Cancelled').length,
    dineInCount: activeOrders.filter((o) => o.diningMode === 'dine-in').length,
    takeawayCount: activeOrders.filter((o) => o.diningMode === 'takeaway').length,
    activeBookings: mockReservations.filter((b) => b.status === 'Confirmed').length,
    totalBookings: mockReservations.length,
    totalCustomers: uniqueCustomers.size,
    dailyRevenue,
    topItems,
    recentOrders: mockOrders.slice(0, 5),
  });
});

// Admin Orders Management
app.get('/api/admin/orders', requireAdmin, (_req: Request, res: Response) => {
  res.json({ orders: mockOrders });
});

app.post('/api/admin/orders', requireAdmin, (req: Request, res: Response) => {
  const { customerName, phone, address, diningMode, itemsSummary, subtotal, status } = req.body || {};
  const cleanName = typeof customerName === 'string' ? customerName.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanItems = typeof itemsSummary === 'string' ? itemsSummary.trim() : '';
  if (!cleanName || !cleanPhone || !cleanItems) {
    return res.status(400).json({ error: 'Customer name, phone, and ordered items are required.' });
  }
  const parsedSubtotal = parseStrictNonNegativeNumber(subtotal);
  if (subtotal !== undefined && (parsedSubtotal === null || parsedSubtotal > 500000)) {
    return res.status(400).json({ error: 'Subtotal must be between ₹0 and ₹5,00,000.' });
  }
  const cleanSubtotal = parsedSubtotal === null ? 0 : Math.round(parsedSubtotal);
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const validStatus: AdminOrder['status'] = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(status)
    ? status
    : 'Pending';

  const newOrder: AdminOrder = {
    id: orderId,
    userId: 'counter',
    customerName: cleanName,
    phone: cleanPhone,
    address:
      typeof address === 'string' && address.trim()
        ? address.trim()
        : diningMode === 'dine-in'
        ? 'Lounge Table'
        : 'Takeaway Counter',
    diningMode: diningMode === 'dine-in' ? 'dine-in' : 'takeaway',
    itemsSummary: cleanItems,
    subtotal: cleanSubtotal,
    status: validStatus,
    is18Confirmed: true,
    createdAt: new Date().toISOString(),
  };

  mockOrders.unshift(newOrder);
  persistStore();
  return res.status(201).json({ success: true, order: newOrder });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, subtotal } = req.body || {};
  const order = mockOrders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(status)) {
    order.status = status;
  }
  if (subtotal !== undefined) {
    const parsedSub = parseStrictNonNegativeNumber(subtotal);
    if (parsedSub === null || parsedSub > 500000) {
      return res.status(400).json({ error: 'Subtotal must be between ₹0 and ₹5,00,000.' });
    }
    order.subtotal = Math.round(parsedSub);
  }
  if (order.userId && customerUsers.has(order.userId)) {
    syncUserLoyaltyInStore(order.userId, false);
  }
  persistStore();
  res.json({ success: true, order });
});

// Admin Reservations Management
app.get('/api/admin/reservations', requireAdmin, (_req: Request, res: Response) => {
  res.json({ reservations: mockReservations });
});

app.patch('/api/admin/reservations/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const resv = mockReservations.find((r) => r.id === id);
  if (!resv) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  if (['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    resv.status = status;
  }
  persistStore();
  res.json({ success: true, reservation: resv });
});

// Admin Unified Customers & Order/Bill History Directory
app.get('/api/admin/customers', requireAdmin, (_req: Request, res: Response) => {
  interface AggregatedCustomer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    is18Plus: boolean;
    authProvider: 'email' | 'phone' | 'google' | 'guest';
    createdAt: string;
    lastActivityAt: string;
    orders: AdminOrder[];
    bookings: AdminReservation[];
    totalOrders: number;
    completedOrders: number;
    totalBookings: number;
    totalSpent: number;
  }

  const byKey = new Map<string, AggregatedCustomer>();
  const uidToKey = new Map<string, string>();
  const phoneToKey = new Map<string, string>();

  const normPhone = (raw: string) => raw.replace(/\D/g, '').slice(-10);

  // Seed with registered accounts first
  for (const u of customerUsers.values()) {
    const key = `user:${u.uid}`;
    uidToKey.set(u.uid, key);
    const p = normPhone(u.phone || '');
    if (p.length >= 10) phoneToKey.set(p, key);

    byKey.set(key, {
      id: u.uid,
      name: u.name,
      email: u.email,
      phone: u.phone || 'Not provided',
      address: u.address || 'Not provided',
      is18Plus: Boolean(u.is18Plus),
      authProvider: u.authProvider,
      createdAt: u.createdAt,
      lastActivityAt: u.lastLoginAt || u.createdAt,
      orders: [],
      bookings: [],
      totalOrders: 0,
      completedOrders: 0,
      totalBookings: 0,
      totalSpent: 0,
    });
  }

  const resolveOrCreateGuestKey = (
    userId: string | undefined,
    name: string,
    phone: string,
    address: string,
    createdAt: string
  ): string => {
    if (userId && userId !== 'guest' && userId !== 'counter' && uidToKey.has(userId)) {
      return uidToKey.get(userId)!;
    }
    const p = normPhone(phone);
    if (p.length >= 10 && phoneToKey.has(p)) {
      return phoneToKey.get(p)!;
    }
    const cleanGuestName = (name || '').toLowerCase().trim();
    const guestKey =
      p.length >= 10
        ? `phone:${p}`
        : cleanGuestName
        ? `guest:${cleanGuestName}`
        : `guest-rec:${createdAt}`;
    if (!byKey.has(guestKey)) {
      if (p.length >= 10) phoneToKey.set(p, guestKey);
      byKey.set(guestKey, {
        id: guestKey,
        name: name || 'Walk-In Guest',
        email: 'Guest Checkout',
        phone: phone || 'Not provided',
        address: address || 'Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia',
        is18Plus: true,
        authProvider: 'guest',
        createdAt,
        lastActivityAt: createdAt,
        orders: [],
        bookings: [],
        totalOrders: 0,
        completedOrders: 0,
        totalBookings: 0,
        totalSpent: 0,
      });
    }
    return guestKey;
  };

  for (const order of mockOrders) {
    const key = resolveOrCreateGuestKey(
      order.userId,
      order.customerName,
      order.phone,
      order.address,
      order.createdAt
    );
    const cust = byKey.get(key)!;
    cust.orders.push(order);
    cust.totalOrders += 1;
    if (order.status === 'Completed') cust.completedOrders += 1;
    if (order.status !== 'Cancelled') {
      cust.totalSpent += Number(order.subtotal) || 0;
    }
    if (order.address && cust.address === 'Not provided') {
      cust.address = order.address;
    }
    if (order.phone && cust.phone === 'Not provided') {
      cust.phone = order.phone;
    }
    if (new Date(order.createdAt).getTime() > new Date(cust.lastActivityAt).getTime()) {
      cust.lastActivityAt = order.createdAt;
    }
  }

  for (const resv of mockReservations) {
    const key = resolveOrCreateGuestKey(
      resv.userId,
      resv.name,
      resv.phone,
      resv.address,
      resv.createdAt
    );
    const cust = byKey.get(key)!;
    cust.bookings.push(resv);
    cust.totalBookings += 1;
    if (resv.address && cust.address === 'Not provided') {
      cust.address = resv.address;
    }
    if (resv.phone && cust.phone === 'Not provided') {
      cust.phone = resv.phone;
    }
    if (new Date(resv.createdAt).getTime() > new Date(cust.lastActivityAt).getTime()) {
      cust.lastActivityAt = resv.createdAt;
    }
  }

  const customers = Array.from(byKey.values()).sort(
    (a, b) => b.totalSpent - a.totalSpent || b.totalOrders - a.totalOrders
  );

  res.json({ customers });
});

// Admin Dish Photo Upload & Static Serving
app.post('/api/admin/upload-image', requireAdmin, (req: Request, res: Response) => {
  const { dataUrl, filename } = req.body || {};
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    return res.status(400).json({ error: 'Image file data is required.' });
  }
  const match = dataUrl.trim().match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
  }
  const rawSubtype = match[1].toLowerCase();
  const ext = rawSubtype === 'jpeg' ? 'jpg' : rawSubtype;
  const base64Body = match[2];
  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0 || buffer.length > 2.5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Uploaded image must be between 1 byte and 2.5 MB.' });
  }

  ensureDataDirs();
  const baseSlug = String(filename || 'dish')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'dish';
  const savedName = `${baseSlug}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  const targetPath = path.join(UPLOADS_DIR, savedName);
  fs.writeFileSync(targetPath, buffer);

  return res.status(201).json({
    success: true,
    imageUrl: `/api/uploads/${savedName}`,
  });
});

app.get('/api/uploads/:filename', (req: Request, res: Response) => {
  const filename = String(req.params.filename || '').trim();
  if (!/^[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(filename)) {
    return res.status(404).json({ error: 'Image not found.' });
  }
  const resolved = path.resolve(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Image not found.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  return res.sendFile(resolved);
});

// Admin Catalog & Pricing Management (Synced Live Across Website)
app.patch('/api/admin/catalog/item/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const item = catalogItems.find((it) => it.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Catalog item not found.' });
  }

  const { name, price, description, chapter, isVeg, isSpicy, inStock, imageKey, imageUrl } = req.body || {};
  if (typeof name === 'string' && name.trim()) item.name = name.trim();
  if (price !== undefined) {
    const parsedPrice = parseStrictNonNegativeNumber(price);
    if (parsedPrice === null) {
      return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
    }
    item.price = Math.round(parsedPrice);
  }
  if (typeof description === 'string') item.description = description.trim();
  if (typeof chapter === 'string' && CATALOG_CHAPTERS.some((c) => c.chapter === chapter)) {
    item.chapter = chapter;
  }
  if (typeof isVeg === 'boolean') item.isVeg = isVeg;
  if (typeof isSpicy === 'boolean') item.isSpicy = isSpicy;
  if (typeof inStock === 'boolean') item.inStock = inStock;
  if (['momos', 'tandoor', 'pizza', 'burger', 'noodles', 'frappe'].includes(imageKey)) {
    item.imageKey = imageKey;
  }
  if (imageUrl !== undefined) {
    if (imageUrl === null || imageUrl === '') {
      delete item.imageUrl;
    } else if (typeof imageUrl === 'string' && isValidCatalogImageUrl(imageUrl)) {
      item.imageUrl = imageUrl.trim();
    } else {
      return res.status(400).json({ error: 'Please provide a valid http/https image URL or upload an image.' });
    }
  }

  persistStore();
  return res.json({ success: true, item, items: catalogItems, gamingRates, venueSettings });
});

app.post('/api/admin/catalog/item', requireAdmin, (req: Request, res: Response) => {
  const { name, price, description, chapter, isVeg, isSpicy, imageKey, imageUrl } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Item name is required.' });
  }
  const parsedPrice = parseStrictNonNegativeNumber(price);
  if (parsedPrice === null || parsedPrice <= 0) {
    return res.status(400).json({ error: 'Valid positive item price (₹) is required.' });
  }
  if (imageUrl !== undefined && imageUrl !== null && imageUrl !== '' && !isValidCatalogImageUrl(imageUrl)) {
    return res.status(400).json({ error: 'Please provide a valid http/https image URL or upload an image.' });
  }

  const chapterMeta = CATALOG_CHAPTERS.find((c) => c.chapter === chapter) || CATALOG_CHAPTERS[0];
  const validImageKey = ['momos', 'tandoor', 'pizza', 'burger', 'noodles', 'frappe'].includes(imageKey)
    ? imageKey
    : chapterMeta.defaultImageKey;

  const trimmedImageUrl = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : undefined;

  const newItem: CatalogItem = {
    id: 'bm-' + Date.now().toString(36),
    chapter: chapterMeta.chapter,
    name: name.trim(),
    price: Math.round(parsedPrice),
    description:
      typeof description === 'string' && description.trim()
        ? description.trim()
        : 'Freshly prepared to order in our Bansberia kitchen.',
    isVeg: Boolean(isVeg),
    isSpicy: Boolean(isSpicy),
    imageKey: validImageKey,
    ...(trimmedImageUrl ? { imageUrl: trimmedImageUrl } : {}),
    inStock: true,
  };

  catalogItems.push(newItem);
  persistStore();
  return res.status(201).json({ success: true, item: newItem, items: catalogItems, gamingRates, venueSettings });
});

app.delete('/api/admin/catalog/item/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = catalogItems.findIndex((it) => it.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Catalog item not found.' });
  }
  catalogItems.splice(idx, 1);
  persistStore();
  return res.json({ success: true, items: catalogItems, gamingRates, venueSettings });
});

app.patch('/api/admin/catalog/gaming', requireAdmin, (req: Request, res: Response) => {
  const { pool15Price, pool30Price, ps5HourlyPrice } = req.body || {};
  if (pool15Price !== undefined) {
    const val = parseStrictNonNegativeNumber(pool15Price);
    if (val === null) {
      return res.status(400).json({ error: 'Invalid 15-min pool rate.' });
    }
    gamingRates.pool15Price = Math.round(val);
  }
  if (pool30Price !== undefined) {
    const val = parseStrictNonNegativeNumber(pool30Price);
    if (val === null) {
      return res.status(400).json({ error: 'Invalid 30-min pool rate.' });
    }
    gamingRates.pool30Price = Math.round(val);
  }
  if (ps5HourlyPrice !== undefined) {
    const val = parseStrictNonNegativeNumber(ps5HourlyPrice);
    if (val === null) {
      return res.status(400).json({ error: 'Invalid PS5 hourly rate.' });
    }
    gamingRates.ps5HourlyPrice = Math.round(val);
  }

  persistStore();
  return res.json({ success: true, gamingRates, items: catalogItems, venueSettings });
});

app.patch('/api/admin/settings/venue', requireAdmin, (req: Request, res: Response) => {
  const body = req.body || {};
  const socialFields: Array<keyof Pick<VenueSettings, 'instagramUrl' | 'youtubeUrl' | 'facebookUrl'>> = [
    'instagramUrl',
    'youtubeUrl',
    'facebookUrl',
  ];
  for (const field of socialFields) {
    if (body[field] !== undefined && !isValidExternalHttpUrl(body[field])) {
      return res.status(400).json({ error: `Please enter a valid http/https URL for ${field}.` });
    }
  }

  const next = sanitizeVenueSettings({
    ...venueSettings,
    ...(typeof body.openingTime === 'string' && body.openingTime.trim()
      ? { openingTime: body.openingTime.trim() }
      : {}),
    ...(typeof body.closingTime === 'string' && body.closingTime.trim()
      ? { closingTime: body.closingTime.trim() }
      : {}),
    ...(typeof body.kitchenLastOrder === 'string' && body.kitchenLastOrder.trim()
      ? { kitchenLastOrder: body.kitchenLastOrder.trim() }
      : {}),
    ...(typeof body.whatsappNumber === 'string' && body.whatsappNumber.trim()
      ? { whatsappNumber: body.whatsappNumber.trim() }
      : {}),
    ...(typeof body.address === 'string' && body.address.trim()
      ? { address: body.address.trim() }
      : {}),
    ...(typeof body.instagramHandle === 'string' && body.instagramHandle.trim()
      ? { instagramHandle: body.instagramHandle.trim() }
      : {}),
    ...(typeof body.instagramUrl === 'string' && body.instagramUrl.trim()
      ? { instagramUrl: body.instagramUrl.trim() }
      : {}),
    ...(typeof body.youtubeUrl === 'string' && body.youtubeUrl.trim()
      ? { youtubeUrl: body.youtubeUrl.trim() }
      : {}),
    ...(typeof body.facebookUrl === 'string' && body.facebookUrl.trim()
      ? { facebookUrl: body.facebookUrl.trim() }
      : {}),
  });

  venueSettings = next;
  instagramFeedCache = null;
  persistStore();
  return res.json({ success: true, venueSettings });
});

app.patch('/api/admin/settings/perf-monitor', requireAdmin, (req: Request, res: Response) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean.' });
  }
  loungePerfMonitorEnabled = enabled;
  persistStore();
  return res.json({ success: true, loungePerfMonitorEnabled });
});

// Customer & Admin data stay strictly on the backend (no API keys exposed to client)

// -------------------------------------------------------------
// AI Chatbot Assistant Endpoint
// -------------------------------------------------------------
function buildDynamicSystemInstruction(): string {
  const menuLines = CATALOG_CHAPTERS.map((ch) => {
    const chItems = catalogItems
      .filter((it) => it.chapter === ch.chapter && it.inStock !== false)
      .map((it) => `${it.name} [${it.isVeg ? 'Veg' : 'Non-Veg'}] (₹${it.price})`)
      .join(', ');
    return `  • ${ch.title}: ${chItems || 'Seasonal availability'}`;
  }).join('\n');

  return `You are SpicyBot, the warm, polite, and knowledgeable concierge for "Hot & Spicy" — a restaurant, cafe, and 18+ gaming lounge located at ${venueSettings.address}.

Complete Venue & Menu Details:
- Address: ${venueSettings.address} (5 mins from Bansberia Station, 15 mins from Bandel Junction).
- Hours: Open daily from ${venueSettings.openingTime} to ${venueSettings.closingTime}. Kitchen Last Order: ${venueSettings.kitchenLastOrder}.
- Direct Counter / WhatsApp: ${venueSettings.whatsappNumber}. Instagram: ${venueSettings.instagramHandle} | YouTube: ${venueSettings.youtubeUrl} | Facebook: ${venueSettings.facebookUrl}.
- Policy: 18+ confirmation required for gaming lounge bookings and orders.
- Gaming Lounge:
  1. 8-Ball Championship Pool: Valley slate table, emerald felt, ash cues (₹${gamingRates.pool15Price} / 15 mins, ₹${gamingRates.pool30Price} / 30 mins).
  2. PlayStation 5 Arena: 4K 120Hz HDR displays, DualSense co-op controllers, plush seating (₹${gamingRates.ps5HourlyPrice}/hr). Installed titles: EA Sports FC 25, Tekken 8, GTA V, Spider-Man 2, Mortal Kombat 1.
- Live Menu Catalog:
${menuLines}

Guidelines:
- Answer the user's specific question directly, accurately, and naturally. Never repeat generic canned greetings if they asked a specific question.
- Keep responses concise (2–4 helpful sentences) in plain conversational text without markdown asterisks (**).`;
}

function formatChapterItemsSummary(chapterName: string): string {
  return catalogItems
    .filter((it) => it.chapter === chapterName && it.inStock !== false)
    .map((it) => `${it.name} (₹${it.price})`)
    .join(', ');
}

function buildSmartFallbackReply(rawMessage: string): string {
  const q = rawMessage.toLowerCase();

  if (q.includes('pizza') || q.includes('cheese') || q.includes('garlic bread')) {
    return `Our 10" stone-baked Artisan Pizzas include ${formatChapterItemsSummary('Pizzas')}. You can add them directly from the Menu Book.`;
  }
  if (q.includes('momo') || q.includes('dumpling') || q.includes('dragon chicken') || q.includes('starter')) {
    return `For starters, guests love ${formatChapterItemsSummary('Momos')}. Open Chapter 1 of the Menu Book to add them to your bag.`;
  }
  if (q.includes('tandoor') || q.includes('tikka') || q.includes('murgh') || q.includes('kebab') || q.includes('naan')) {
    return `Fresh from our charcoal clay oven: ${formatChapterItemsSummary('Tandoor')}.`;
  }
  if (q.includes('burger') || q.includes('fries') || q.includes('paneer burger')) {
    return `Our toasted brioche burgers include ${formatChapterItemsSummary('Burgers')}.`;
  }
  if (q.includes('noodle') || q.includes('chowmein') || q.includes('roll') || q.includes('kathi') || q.includes('wok')) {
    return `From the high-flame wok counter, we serve ${formatChapterItemsSummary('Wok & Rolls')}.`;
  }
  if (q.includes('drink') || q.includes('coffee') || q.includes('frappe') || q.includes('mojito') || q.includes('shake') || q.includes('cafe') || q.includes('beverage')) {
    return `At our Café bar, try ${formatChapterItemsSummary('Café')}.`;
  }
  if (q.includes('veg') || q.includes('vegetarian')) {
    const vegList = catalogItems
      .filter((it) => it.isVeg && it.inStock !== false)
      .slice(0, 5)
      .map((it) => `${it.name} (₹${it.price})`)
      .join(', ');
    return `Top vegetarian picks include ${vegList}.`;
  }
  if (q.includes('ps5') || q.includes('playstation') || q.includes('fifa') || q.includes('fc 25') || q.includes('tekken') || q.includes('gta') || q.includes('console')) {
    return `Our PlayStation 5 Arena runs on 4K 120Hz displays with sanitized DualSense controllers at ₹${gamingRates.ps5HourlyPrice}/hour (solo or co-op). Popular titles include EA Sports FC 25, Tekken 8, GTA V, Spider-Man 2, and Mortal Kombat 1.`;
  }
  if (q.includes('pool') || q.includes('8-ball') || q.includes('billiard') || q.includes('snooker') || q.includes('cue')) {
    return `The 8-Ball Championship Pool lounge features a Valley slate table with precision ash cues at ₹${gamingRates.pool15Price} for 15 minutes or ₹${gamingRates.pool30Price} for 30 minutes, with table-side snack and drink service.`;
  }
  if (q.includes('book') || q.includes('reserve') || q.includes('slot') || q.includes('table')) {
    return `You can reserve an 8-Ball Pool table or PS5 gaming slot anytime via the "Book Slot" button at the top of the page, or message our desk on WhatsApp at ${venueSettings.whatsappNumber}.`;
  }
  if (q.includes('staff') || q.includes('about') || q.includes('service') || q.includes('hygiene') || q.includes('family')) {
    return 'Hot & Spicy is built around polite, unhurried hospitality—our staff keeps gaming stations sanitized, cooks every dish fresh to order, and maintains a welcoming atmosphere for families and friends.';
  }
  if (q.includes('menu') || q.includes('food') || q.includes('price') || q.includes('cost') || q.includes('combo') || q.includes('eat')) {
    return 'Our Menu Book covers 6 chapters: Momos & Starters, Clay Oven Tandoor, Artisan Pizzas, Loaded Burgers, Wok & Kathi Rolls, and Café Coolers. Ask me about any category for live pricing!';
  }
  if (q.includes('location') || q.includes('address') || q.includes('where') || q.includes('reach') || q.includes('station') || q.includes('parking')) {
    return `We are located at ${venueSettings.address} (5 minutes by auto from Bansberia Station, 15 minutes from Bandel Junction) with street-front two-wheeler and four-wheeler parking.`;
  }
  if (q.includes('hour') || q.includes('time') || q.includes('open') || q.includes('close') || q.includes('last order')) {
    return `Hot & Spicy is open daily from ${venueSettings.openingTime} to ${venueSettings.closingTime} for dining, pool, and PS5 gaming. Please note our Kitchen Last Order closes at ${venueSettings.kitchenLastOrder}.`;
  }
  if (q.includes('contact') || q.includes('phone') || q.includes('call') || q.includes('whatsapp') || q.includes('instagram') || q.includes('youtube') || q.includes('facebook')) {
    return `You can call or WhatsApp our counter directly at ${venueSettings.whatsappNumber}, or follow us on Instagram (${venueSettings.instagramHandle}), YouTube, and Facebook.`;
  }
  if (q.includes('hi') || q.includes('hello') || q.includes('hey') || q.includes('namaste')) {
    return 'Hello and welcome to Hot & Spicy! Ask me about any dish in our Menu Book, 8-Ball Pool or PS5 rates, gaming bookings, or our Boropara More, Dingalhat (Near Azdan Moto Hub) location.';
  }

  return `I can help you with live dishes and prices from our Menu Book (Tandoor, Momos, Pizzas, Burgers, Wok, Café Shakes), PS5 & 8-Ball Pool rates, reservations, or directions to ${venueSettings.address}. What would you like to know?`;
}

app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, history, mode, userLocation } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const trimmedMessage = message.trim();
  const lowerMsg = trimmedMessage.toLowerCase();
  const explicitMode =
    mode === 'fast' || mode === 'search' || mode === 'maps' ? mode : 'balanced';
  const inferredMode: 'balanced' | 'fast' | 'search' | 'maps' =
    explicitMode !== 'balanced'
      ? explicitMode
      : /\b(near|nearby|landmark|directions?|route|map|station|bansberia|hooghly|distance|how to reach)\b/i.test(
          lowerMsg
        )
      ? 'maps'
      : /\b(weather|traffic|news|reviews?|today)\b/i.test(lowerMsg)
      ? 'search'
      : 'balanced';
  const chatMode = inferredMode;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return res.json({ reply: buildSmartFallbackReply(trimmedMessage), modeUsed: chatMode });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Sanitize multi-turn history: must start with 'user' and alternate 'user'/'model'
    const rawHistory = Array.isArray(history)
      ? history
          .filter(
            (h: unknown): h is { role: string; text: string } =>
              Boolean(h && typeof h === 'object' && typeof (h as any).text === 'string' && (h as any).text.trim())
          )
          .map((h) => ({
            role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.text.trim() }],
          }))
      : [];

    while (rawHistory.length > 0 && rawHistory[0].role !== 'user') {
      rawHistory.shift();
    }

    const alternatingHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const turn of rawHistory) {
      const role = turn.role as 'user' | 'model';
      const last = alternatingHistory[alternatingHistory.length - 1];
      if (!last || last.role !== role) {
        alternatingHistory.push({ role, parts: turn.parts });
      }
    }

    const lastTurn = alternatingHistory[alternatingHistory.length - 1];
    if (lastTurn && lastTurn.role === 'user') {
      alternatingHistory.pop();
    }

    const baseInstruction = buildDynamicSystemInstruction();
    let reply = '';
    const groundingLinks: Array<{
      title: string;
      uri: string;
      source: 'web' | 'maps';
      reviewSnippet?: string;
    }> = [];

    if (chatMode === 'search' || chatMode === 'maps') {
      const lat =
        userLocation && Number.isFinite(Number(userLocation.lat))
          ? Number(userLocation.lat)
          : 22.9718;
      const lng =
        userLocation && Number.isFinite(Number(userLocation.lng))
          ? Number(userLocation.lng)
          : 88.3994;

      const config: Record<string, any> = {
        systemInstruction: baseInstruction,
        tools: chatMode === 'search' ? [{ googleSearch: {} }] : [{ googleMaps: {} }],
      };
      if (chatMode === 'maps') {
        config.toolConfig = {
          retrievalConfig: {
            latLng: { latitude: lat, longitude: lng },
          },
        };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          ...alternatingHistory,
          { role: 'user', parts: [{ text: trimmedMessage }] },
        ],
        config,
      });

      reply = response.text?.trim() || '';
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        const seen = new Set<string>();
        for (const chunk of chunks) {
          if (chatMode === 'search' && chunk?.web?.uri && !seen.has(chunk.web.uri)) {
            seen.add(chunk.web.uri);
            groundingLinks.push({
              title: chunk.web.title || 'Web Source',
              uri: chunk.web.uri,
              source: 'web',
            });
          } else if (chatMode === 'maps' && chunk?.maps?.uri && !seen.has(chunk.maps.uri)) {
            seen.add(chunk.maps.uri);
            const rawSnippet = chunk.maps?.placeAnswerSources?.reviewSnippets?.[0] as
              | Record<string, unknown>
              | undefined;
            const snippet =
              typeof rawSnippet?.content === 'string'
                ? rawSnippet.content
                : typeof rawSnippet?.text === 'string'
                ? rawSnippet.text
                : undefined;
            groundingLinks.push({
              title: chunk.maps.title || 'Place Details',
              uri: chunk.maps.uri,
              source: 'maps',
              ...(snippet ? { reviewSnippet: snippet } : {}),
            });
          }
        }
      }
    } else if (chatMode === 'fast') {
      const chat = ai.chats.create({
        model: 'gemini-3.1-flash-lite',
        history: alternatingHistory,
        config: {
          systemInstruction: baseInstruction,
        },
      });
      const response = await chat.sendMessage({ message: trimmedMessage });
      reply = response.text?.trim() || '';
    } else {
      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: alternatingHistory,
        config: {
          systemInstruction: baseInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const response = await chat.sendMessage({ message: trimmedMessage });
      reply = response.text?.trim() || '';
    }

    if (!reply) {
      return res.json({ reply: buildSmartFallbackReply(trimmedMessage), modeUsed: chatMode });
    }

    return res.json({
      reply,
      modeUsed: chatMode,
      ...(groundingLinks.length > 0 ? { groundingLinks } : {}),
    });
  } catch (error) {
    console.error('Gemini chat error:', error);
    return res.json({
      reply: buildSmartFallbackReply(trimmedMessage),
      modeUsed: chatMode,
    });
  }
});

// Audio Transcription Endpoint (gemini-3.5-transcribe)
app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
  const { audioBase64, mimeType } = req.body || {};
  const cleanAudio = typeof audioBase64 === 'string' ? audioBase64.trim() : '';
  const cleanMime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'audio/webm';
  if (!cleanAudio) {
    return res.status(400).json({ error: 'Audio recording payload is required.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return res.status(503).json({ error: 'Voice transcription is currently unavailable.' });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: cleanAudio } },
          { text: 'Transcribe the spoken customer question cleanly in English without extra commentary.' },
        ],
      },
    });
    const text = (response.text || '').trim();
    if (!text) {
      return res.status(422).json({ error: 'Could not transcribe clear speech. Please try speaking again.' });
    }
    return res.json({ text });
  } catch (err) {
    console.error('Gemini transcribe error:', err);
    return res.status(502).json({ error: 'Unable to transcribe audio right now.' });
  }
});

// Text-to-Speech Endpoint (gemini-3.8-flash-lite-tts) — Unary returns complete WAV with 44-byte RIFF header
app.post('/api/ai/tts', async (req: Request, res: Response) => {
  const { text, voiceName } = req.body || {};
  const cleanText = typeof text === 'string' ? text.trim().slice(0, 1200) : '';
  if (!cleanText) {
    return res.status(400).json({ error: 'Text is required for speech playback.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return res.status(503).json({ error: 'Voice synthesis is currently unavailable.' });
  }

  const allowedVoices = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Zephyr']);
  const cleanVoice = typeof voiceName === 'string' && allowedVoices.has(voiceName) ? voiceName : 'Kore';

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: cleanVoice },
          },
        },
      },
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const rawBase64 = inlineData?.data;
    if (!rawBase64) {
      return res.status(502).json({ error: 'No audio returned by voice engine.' });
    }

    const buf = Buffer.from(rawBase64, 'base64');
    const isRiffWav = buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'RIFF';
    const outMime = isRiffWav ? 'audio/wav' : inlineData?.mimeType || 'audio/wav';
    return res.json({ audioBase64: rawBase64, mimeType: outMime });
  } catch (err) {
    console.error('Gemini TTS error:', err);
    return res.status(502).json({ error: 'Unable to synthesize speech right now.' });
  }
});

// Customer Reservations API
app.post('/api/reservations', (req: Request, res: Response) => {
  const {
    name,
    phone,
    address,
    bookingType,
    poolDuration,
    date,
    timeSlot,
    guests,
    specialRequests,
    is18Confirmed,
    voucherCode,
  } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (!cleanName || !cleanPhone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  if (is18Confirmed !== undefined && is18Confirmed !== true) {
    return res.status(400).json({ error: 'You must confirm you are 18 years or older to reserve.' });
  }

  let validGuests = 2;
  if (guests !== undefined) {
    const parsedGuests = Number(guests);
    if (!Number.isInteger(parsedGuests) || parsedGuests < 1 || parsedGuests > 30) {
      return res.status(400).json({ error: 'Guest count must be a whole number between 1 and 30.' });
    }
    validGuests = parsedGuests;
  }

  const normalizedType = String(bookingType || 'dining');
  const validPoolDuration =
    normalizedType === 'pool' && (poolDuration === '15min' || poolDuration === '30min')
      ? poolDuration
      : undefined;

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token) || 'guest';

  const cleanVoucherCode = typeof voucherCode === 'string' ? voucherCode.trim().toUpperCase() : '';
  let appliedVoucher: LoyaltyRewardVoucher | undefined;

  if (cleanVoucherCode) {
    if (uid === 'guest') {
      return res.status(401).json({ error: 'Please sign in to apply a loyalty reward voucher.' });
    }
    appliedVoucher = userRewards.find(
      (v) => v.userId === uid && v.code.toUpperCase() === cleanVoucherCode
    );
    if (!appliedVoucher) {
      return res.status(400).json({ error: 'Selected loyalty reward voucher was not found.' });
    }
    if (appliedVoucher.status !== 'active') {
      return res.status(400).json({ error: 'This loyalty reward voucher has already been used.' });
    }
    if (appliedVoucher.category !== 'any' && appliedVoucher.category !== normalizedType) {
      return res.status(400).json({
        error: `Voucher ${appliedVoucher.code} is only valid for ${appliedVoucher.category.toUpperCase()} bookings.`,
      });
    }
  }

  const reservationId = 'BK-' + Math.floor(100000 + Math.random() * 900000);
  const nowIso = new Date().toISOString();

  if (appliedVoucher) {
    appliedVoucher.status = 'used';
    appliedVoucher.usedBookingId = reservationId;
    appliedVoucher.usedAt = nowIso;
  }

  const cleanDate = typeof date === 'string' && date.trim() ? date.trim() : getIstDateString();
  const cleanSpecial = typeof specialRequests === 'string' ? specialRequests.trim().slice(0, 300) : '';

  const newRecord: AdminReservation & { userId?: string } = {
    id: reservationId,
    userId: uid,
    name: cleanName,
    phone: cleanPhone,
    address: typeof address === 'string' ? address.trim().slice(0, 250) : '',
    bookingType: normalizedType,
    ...(validPoolDuration ? { poolDuration: validPoolDuration } : {}),
    date: cleanDate,
    timeSlot: typeof timeSlot === 'string' && timeSlot.trim() ? timeSlot.trim() : '07:30 PM',
    guests: validGuests,
    ...(cleanSpecial ? { specialRequests: cleanSpecial } : {}),
    is18Confirmed: true,
    ...(appliedVoucher
      ? {
          voucherCode: appliedVoucher.code,
          discountAmount: appliedVoucher.discountAmount,
          rewardTitle: appliedVoucher.title,
        }
      : {}),
    status: 'Confirmed',
    createdAt: nowIso,
  };

  mockReservations.unshift(newRecord);
  const matchedUser = uid !== 'guest' ? customerUsers.get(uid) : undefined;
  if (matchedUser) {
    let userUpdated = false;
    if (cleanPhone && (!matchedUser.phone || !matchedUser.phoneVerified)) {
      const formattedPhone = cleanPhone.slice(0, 20);
      if (matchedUser.phone !== formattedPhone) {
        matchedUser.phone = formattedPhone;
        userUpdated = true;
      }
    }
    if (newRecord.address && !matchedUser.address) {
      matchedUser.address = newRecord.address;
      userUpdated = true;
    }
    if (cleanName && !matchedUser.name) {
      matchedUser.name = cleanName.slice(0, 100);
      userUpdated = true;
    }
    if (userUpdated) {
      customerUsers.set(uid, matchedUser);
    }
  }
  const updatedLoyalty = uid !== 'guest' ? syncUserLoyaltyInStore(uid, false) : undefined;
  persistStore();

  return res.json({
    success: true,
    reservationId,
    details: newRecord,
    ...(appliedVoucher ? { appliedVoucher } : {}),
    ...(updatedLoyalty ? { loyalty: updatedLoyalty } : {}),
    ...(matchedUser ? { user: sanitizeUser(matchedUser) } : {}),
    message: `Reservation confirmed for ${cleanName}! Reference: #${reservationId}`,
  });
});

app.patch('/api/reservations/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) {
    return res.status(401).json({ error: 'Please sign in to cancel a reservation.' });
  }

  const resv = mockReservations.find((r) => r.id === id);
  if (!resv) {
    return res.status(404).json({ error: 'Reservation not found.' });
  }
  if ((resv as AdminReservation & { userId?: string }).userId !== uid) {
    return res.status(403).json({ error: 'You can only cancel your own reservations.' });
  }
  if (resv.status === 'Completed') {
    return res.status(400).json({ error: 'Completed reservations cannot be cancelled.' });
  }
  if (resv.status !== 'Cancelled') {
    resv.status = 'Cancelled';
    persistStore();
  }

  return res.json({
    success: true,
    reservation: resv,
  });
});

function parseTimeLabelToMinutes(label: string, fallbackMinutes: number): number {
  const m = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return fallbackMinutes;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const period = m[3].toUpperCase();
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 1 || hh > 12 || mm < 0 || mm > 59) {
    return fallbackMinutes;
  }
  if (period === 'AM' && hh === 12) hh = 0;
  if (period === 'PM' && hh !== 12) hh += 12;
  return hh * 60 + mm;
}

// Real-Time Gaming Lounge Station Availability API
app.get('/api/gaming-status', (_req: Request, res: Response) => {
  const POOL_TOTAL = 2;
  const PS5_TOTAL = 3;
  const todayStr = getIstDateString();

  const activeBookings = mockReservations.filter(
    (r) => r.status === 'Confirmed' && r.date === todayStr
  );

  const poolBooked = Math.min(
    POOL_TOTAL,
    activeBookings.filter((r) => r.bookingType === 'pool').length
  );
  const ps5Booked = Math.min(
    PS5_TOTAL,
    activeBookings.filter((r) => r.bookingType === 'ps5').length
  );

  // Compute IST hour (UTC+5:30) using live Venue Settings operating hours
  const nowUtcMs = Date.now();
  const istDate = new Date(nowUtcMs + 5.5 * 60 * 60 * 1000);
  const istMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  const openMin = parseTimeLabelToMinutes(venueSettings.openingTime, 13 * 60 + 30);
  const closeMin = parseTimeLabelToMinutes(venueSettings.closingTime, 22 * 60);
  const isOpenHours =
    openMin <= closeMin
      ? istMinutes >= openMin && istMinutes <= closeMin
      : istMinutes >= openMin || istMinutes <= closeMin;

  const poolAvailable = Math.max(0, POOL_TOTAL - poolBooked);
  const ps5Available = Math.max(0, PS5_TOTAL - ps5Booked);

  res.json({
    isOpenHours,
    operatingHours: formatOperatingHours(venueSettings),
    venueSettings,
    pool: {
      total: POOL_TOTAL,
      occupied: poolBooked,
      available: poolAvailable,
      status:
        poolAvailable === 0
          ? 'All Tables Booked'
          : poolAvailable === 1
          ? '1 Table Left'
          : 'Available Now',
    },
    ps5: {
      total: PS5_TOTAL,
      occupied: ps5Booked,
      available: ps5Available,
      status:
        ps5Available === 0
          ? 'All Consoles Busy'
          : ps5Available === 1
          ? '1 Console Left'
          : 'Available Now',
    },
    updatedAt: new Date().toISOString(),
  });
});

// Customer Orders API
app.post('/api/orders', (req: Request, res: Response) => {
  const { customerName, phone, address, diningMode, itemsSummary, subtotal, is18Confirmed } = req.body || {};
  const cleanName = typeof customerName === 'string' ? customerName.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanAddress = typeof address === 'string' ? address.trim() : '';
  const cleanItems = typeof itemsSummary === 'string' ? itemsSummary.trim() : '';

  if (!cleanName || !cleanPhone) {
    return res.status(400).json({ error: 'Customer name and phone are required' });
  }
  if (!cleanAddress) {
    return res.status(400).json({ error: 'Delivery address or dining table is required' });
  }
  if (!cleanItems) {
    return res.status(400).json({ error: 'Order items cannot be empty' });
  }
  if (is18Confirmed !== undefined && is18Confirmed !== true) {
    return res.status(400).json({ error: 'You must confirm you are 18 years or older to order.' });
  }
  const parsedSubtotal = parseStrictNonNegativeNumber(subtotal);
  if (parsedSubtotal === null || parsedSubtotal > 500000) {
    return res.status(400).json({ error: 'Order subtotal must be between ₹0 and ₹5,00,000.' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) {
    return res.status(401).json({ error: 'Please sign in or sign up before placing an order.' });
  }

  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const newOrder: AdminOrder & { userId?: string } = {
    id: orderId,
    userId: uid,
    customerName: cleanName,
    phone: cleanPhone,
    address: cleanAddress,
    diningMode: diningMode === 'dine-in' ? 'dine-in' : 'takeaway',
    itemsSummary: cleanItems,
    subtotal: Math.round(parsedSubtotal),
    status: 'Pending',
    is18Confirmed: true,
    createdAt: new Date().toISOString(),
  };

  mockOrders.unshift(newOrder);
  const matchedUser = customerUsers.get(uid);
  if (matchedUser) {
    let userUpdated = false;
    if (cleanPhone && (!matchedUser.phone || !matchedUser.phoneVerified)) {
      const formattedPhone = cleanPhone.slice(0, 20);
      if (matchedUser.phone !== formattedPhone) {
        matchedUser.phone = formattedPhone;
        userUpdated = true;
      }
    }
    if (cleanAddress && (!matchedUser.address || newOrder.diningMode !== 'dine-in')) {
      const formattedAddr = cleanAddress.slice(0, 250);
      if (matchedUser.address !== formattedAddr) {
        matchedUser.address = formattedAddr;
        userUpdated = true;
      }
    }
    if (cleanName && !matchedUser.name) {
      matchedUser.name = cleanName.slice(0, 100);
      userUpdated = true;
    }
    if (userUpdated) {
      customerUsers.set(uid, matchedUser);
    }
  }
  const updatedLoyalty = syncUserLoyaltyInStore(uid, false);
  persistStore();

  return res.json({
    success: true,
    orderId,
    details: newOrder,
    loyalty: updatedLoyalty,
    ...(matchedUser ? { user: sanitizeUser(matchedUser) } : {}),
  });
});

// -------------------------------------------------------------
// Instagram Social Feed & Reels/Video Endpoints (@hotandspicy_aa)
// -------------------------------------------------------------
type FeedImageKey =
  | 'tandoor'
  | 'momos'
  | 'pizza'
  | 'burger'
  | 'noodles'
  | 'frappe'
  | 'pool'
  | 'ps5'
  | 'combos'
  | 'store';

interface InstagramFeedItem {
  id: string;
  imageKey: FeedImageKey;
  mediaType: 'IMAGE' | 'VIDEO' | 'REEL';
  mediaUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  duration?: string;
  views?: number;
  isCustom?: boolean;
  caption: string;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  category: string;
}

function buildInstagramEmbedUrl(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.toLowerCase().includes('instagram.com')) return undefined;
    const match = parsed.pathname.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return undefined;
    const typeSegment = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
    const shortcode = match[2];
    return `https://www.instagram.com/${typeSegment}/${shortcode}/embed/`;
  } catch {
    return undefined;
  }
}

const DEFAULT_INSTAGRAM_FEED: InstagramFeedItem[] = [
  {
    id: 'ig-reel-1',
    imageKey: 'tandoor',
    mediaType: 'REEL',
    duration: '0:24',
    views: 2480,
    caption:
      'Live charcoal tandoor flame reel — smoky Chicken & Paneer Tikka skewers sizzling straight off the embers.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    likes: 612,
    comments: 47,
    category: 'Tandoor Flame Reel',
  },
  {
    id: 'ig-reel-2',
    imageKey: 'pool',
    mediaType: 'REEL',
    duration: '0:19',
    views: 1920,
    caption:
      'Clean 8-Ball break shot at our Boropara More championship pool lounge — rack em up tonight after 6 PM.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    likes: 504,
    comments: 38,
    category: '8-Ball Break Reel',
  },
  {
    id: 'ig-reel-3',
    imageKey: 'momos',
    mediaType: 'REEL',
    duration: '0:21',
    views: 2150,
    caption:
      'High-flame wok toss: fiery Schezwan Pan-Tossed Momos glazed with roasted garlic and spring onions.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 579,
    comments: 44,
    category: 'Wok Toss Reel',
  },
  {
    id: 'ig-reel-4',
    imageKey: 'ps5',
    mediaType: 'REEL',
    duration: '0:28',
    views: 2690,
    caption:
      'Last-minute EA Sports FC 25 & Tekken 8 tournament highlights from our 4K 120Hz PS5 gaming booths.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 645,
    comments: 53,
    category: 'PS5 Arena Reel',
  },
  {
    id: 'ig-reel-5',
    imageKey: 'frappe',
    mediaType: 'REEL',
    duration: '0:16',
    views: 1580,
    caption:
      'Slow-motion iced hazelnut mocha frappe swirl topped with velvety whipped cream & dark cocoa dust.',
    permalink: 'https://www.instagram.com/hotandspicy_aa/reels/',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 438,
    comments: 27,
    category: 'Café Pour Reel',
  },
  {
    id: 'ig-1',
    imageKey: 'combos',
    mediaType: 'IMAGE',
    caption:
      'Weekend table spread at Boropara More — spicy platters, grilled kebabs, and chilled coolers.',
    permalink: 'https://instagram.com/hotandspicy_aa',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 532,
    comments: 41,
    category: 'Signature Combos',
  },
  {
    id: 'ig-2',
    imageKey: 'pizza',
    mediaType: 'IMAGE',
    caption:
      'Hand-stretched wood-fired crust loaded with blistered veggies, fresh basil, and melted mozzarella.',
    permalink: 'https://instagram.com/hotandspicy_aa',
    timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 394,
    comments: 19,
    category: 'Artisan Pizza',
  },
  {
    id: 'ig-3',
    imageKey: 'burger',
    mediaType: 'IMAGE',
    caption:
      'Double-stacked smoky peri-peri crunch burger served with seasoned fries and house garlic dip.',
    permalink: 'https://instagram.com/hotandspicy_aa',
    timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 379,
    comments: 25,
    category: 'Gourmet Burgers',
  },
];

let instagramFeedCache: {
  source: 'live' | 'curated';
  posts: InstagramFeedItem[];
  fetchedAt: number;
} | null = null;

function applyReelPosterOverride(item: InstagramFeedItem): InstagramFeedItem {
  const overrideUrl = reelPosterOverrides[item.id];
  const resolvedPoster =
    overrideUrl && isValidCatalogImageUrl(overrideUrl)
      ? overrideUrl
      : item.thumbnailUrl && isValidCatalogImageUrl(item.thumbnailUrl)
      ? item.thumbnailUrl
      : undefined;

  if (!resolvedPoster) return item;
  return {
    ...item,
    thumbnailUrl: resolvedPoster,
    ...(item.mediaType === 'IMAGE'
      ? { mediaUrl: resolvedPoster }
      : item.mediaUrl
      ? {}
      : { mediaUrl: resolvedPoster }),
  };
}

function mapCustomVideosToFeedItems(): InstagramFeedItem[] {
  return customInstagramVideos.map((vid, idx) =>
    applyReelPosterOverride({
      id: vid.id,
      imageKey: vid.imageKey,
      mediaType: 'REEL',
      videoUrl: vid.videoUrl,
      ...(typeof vid.thumbnailUrl === 'string' &&
      vid.thumbnailUrl.trim() &&
      isValidCatalogImageUrl(vid.thumbnailUrl)
        ? { thumbnailUrl: vid.thumbnailUrl.trim() }
        : {}),
      embedUrl: buildInstagramEmbedUrl(vid.reelUrl),
      duration: vid.duration || '0:25',
      views: 1200 + idx * 180,
      isCustom: true,
      caption: vid.caption,
      permalink: vid.reelUrl,
      timestamp: vid.createdAt,
      likes: 310 + idx * 35,
      comments: 24 + idx * 4,
      category: vid.category || 'Instagram Reel',
    })
  );
}

function filterVisibleInstagramPosts(basePosts: InstagramFeedItem[]): InstagramFeedItem[] {
  const hiddenSet = new Set(hiddenInstagramIds);
  return basePosts.filter((p) => !hiddenSet.has(p.id)).map(applyReelPosterOverride);
}

function getInstagramMeta() {
  const cleanHandle = venueSettings.instagramHandle.replace(/^@/, '') || 'hotandspicy_aa';
  const profileUrl = venueSettings.instagramUrl || `https://instagram.com/${cleanHandle}`;
  const normalizedBase = profileUrl.replace(/\/+$/, '');
  return {
    handle: cleanHandle,
    profileUrl,
    reelsUrl: `${normalizedBase}/reels/`,
  };
}

function buildUnifiedAdminInstagramList(): InstagramFeedItem[] {
  const customItems = mapCustomVideosToFeedItems();
  const visibleDefaults = filterVisibleInstagramPosts(DEFAULT_INSTAGRAM_FEED);
  return [...customItems, ...visibleDefaults];
}

app.get('/api/instagram-feed', async (_req: Request, res: Response) => {
  const customItems = mapCustomVideosToFeedItems();
  const meta = getInstagramMeta();
  const now = Date.now();

  if (instagramFeedCache && now - instagramFeedCache.fetchedAt < 10 * 60 * 1000) {
    return res.json({
      ...meta,
      source: instagramFeedCache.source,
      posts: [...customItems, ...filterVisibleInstagramPosts(instagramFeedCache.posts)],
    });
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (accessToken) {
    try {
      const apiUrl = `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=14&access_token=${encodeURIComponent(
        accessToken
      )}`;
      const upstream = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      if (upstream.ok) {
        const json = (await upstream.json()) as {
          data?: Array<{
            id: string;
            caption?: string;
            media_type?: string;
            media_product_type?: string;
            media_url?: string;
            thumbnail_url?: string;
            permalink?: string;
            timestamp?: string;
            like_count?: number;
            comments_count?: number;
          }>;
        };
        const livePosts: InstagramFeedItem[] = (json.data || [])
          .filter((item) => item.media_url || item.thumbnail_url)
          .slice(0, 12)
          .map((item, idx) => {
            const isVideo = item.media_type === 'VIDEO';
            const isReel = isVideo && (item.media_product_type === 'REELS' || item.permalink?.includes('/reel/'));
            const permalink = item.permalink || meta.profileUrl;
            return {
              id: item.id,
              imageKey: DEFAULT_INSTAGRAM_FEED[idx % DEFAULT_INSTAGRAM_FEED.length].imageKey,
              mediaType: isReel ? 'REEL' : isVideo ? 'VIDEO' : 'IMAGE',
              mediaUrl: isVideo ? item.thumbnail_url || item.media_url : item.media_url,
              videoUrl: isVideo ? item.media_url : undefined,
              thumbnailUrl: isVideo ? item.thumbnail_url : undefined,
              embedUrl: buildInstagramEmbedUrl(permalink),
              caption:
                (item.caption || '').trim() ||
                DEFAULT_INSTAGRAM_FEED[idx % DEFAULT_INSTAGRAM_FEED.length].caption,
              permalink,
              timestamp: item.timestamp || new Date().toISOString(),
              likes: typeof item.like_count === 'number' ? item.like_count : 120 + idx * 24,
              comments: typeof item.comments_count === 'number' ? item.comments_count : 8 + idx * 3,
              category: isReel ? 'Instagram Reel' : isVideo ? 'Instagram Video' : 'Instagram Post',
            };
          });

        if (livePosts.length > 0) {
          instagramFeedCache = { source: 'live', posts: livePosts, fetchedAt: now };
          return res.json({
            ...meta,
            source: 'live',
            posts: [...customItems, ...filterVisibleInstagramPosts(livePosts)],
          });
        }
      }
    } catch {
      // Fall back cleanly to curated @hotandspicy_aa feed assets
    }
  }

  instagramFeedCache = {
    source: 'curated',
    posts: DEFAULT_INSTAGRAM_FEED,
    fetchedAt: now,
  };

  return res.json({
    ...meta,
    source: 'curated',
    posts: [...customItems, ...filterVisibleInstagramPosts(DEFAULT_INSTAGRAM_FEED)],
  });
});

// Admin Instagram Reel/Video Management Endpoints
app.get('/api/admin/instagram-videos', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    videos: customInstagramVideos,
    allReels: buildUnifiedAdminInstagramList(),
    hiddenDefaultCount: hiddenInstagramIds.length,
  });
});

app.post('/api/admin/instagram-videos', requireAdmin, (req: Request, res: Response) => {
  const { reelUrl, videoUrl, thumbnailUrl, caption, category, imageKey, duration } = req.body || {};
  const cleanReelUrl = String(reelUrl || '').trim();

  if (!cleanReelUrl) {
    return res.status(400).json({ error: 'Instagram Reel or video URL is required.' });
  }

  try {
    const parsed = new URL(cleanReelUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'URL must start with https:// or http://.' });
    }
  } catch {
    return res.status(400).json({ error: 'Please enter a valid Instagram Reel URL.' });
  }

  const rawPoster = typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '';
  if (rawPoster && !isValidCatalogImageUrl(rawPoster)) {
    return res.status(400).json({
      error: 'Custom poster must be an uploaded image or valid http/https image URL.',
    });
  }

  const allowedKeys: FeedImageKey[] = [
    'tandoor',
    'momos',
    'pizza',
    'burger',
    'noodles',
    'frappe',
    'pool',
    'ps5',
    'combos',
    'store',
  ];
  const resolvedKey: FeedImageKey = allowedKeys.includes(imageKey) ? imageKey : 'tandoor';

  const newVideo: CustomInstagramVideo = {
    id: 'ig-vid-' + Date.now().toString(36),
    imageKey: resolvedKey,
    reelUrl: cleanReelUrl,
    videoUrl: typeof videoUrl === 'string' && videoUrl.trim() ? videoUrl.trim() : undefined,
    ...(rawPoster ? { thumbnailUrl: rawPoster } : {}),
    caption:
      String(caption || '').trim() ||
      `Fresh kitchen & lounge Reel from ${venueSettings.instagramHandle} at ${venueSettings.address}.`,
    category: String(category || '').trim() || 'Featured Reel',
    duration: String(duration || '').trim() || '0:25',
    createdAt: new Date().toISOString(),
  };

  customInstagramVideos.unshift(newVideo);
  instagramFeedCache = null;
  persistStore();

  return res.status(201).json({
    success: true,
    video: newVideo,
    videos: customInstagramVideos,
    allReels: buildUnifiedAdminInstagramList(),
    hiddenDefaultCount: hiddenInstagramIds.length,
  });
});

app.patch('/api/admin/instagram-videos/:id/poster', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const rawPoster = typeof req.body?.thumbnailUrl === 'string' ? req.body.thumbnailUrl.trim() : '';

  if (rawPoster && !isValidCatalogImageUrl(rawPoster)) {
    return res.status(400).json({
      error: 'Custom poster must be an uploaded image or valid http/https image URL.',
    });
  }

  const customIdx = customInstagramVideos.findIndex((v) => v.id === id);
  if (customIdx !== -1) {
    if (rawPoster) {
      customInstagramVideos[customIdx] = {
        ...customInstagramVideos[customIdx],
        thumbnailUrl: rawPoster,
      };
    } else {
      const updated = { ...customInstagramVideos[customIdx] };
      delete updated.thumbnailUrl;
      customInstagramVideos[customIdx] = updated;
    }
    delete reelPosterOverrides[id];
    instagramFeedCache = null;
    persistStore();
    return res.json({
      success: true,
      videos: customInstagramVideos,
      allReels: buildUnifiedAdminInstagramList(),
      hiddenDefaultCount: hiddenInstagramIds.length,
    });
  }

  const existsInDefaults = DEFAULT_INSTAGRAM_FEED.some((item) => item.id === id);
  const existsInCache = Boolean(instagramFeedCache?.posts.some((item) => item.id === id));
  if (existsInDefaults || existsInCache) {
    if (rawPoster) {
      reelPosterOverrides[id] = rawPoster;
    } else {
      delete reelPosterOverrides[id];
    }
    instagramFeedCache = null;
    persistStore();
    return res.json({
      success: true,
      videos: customInstagramVideos,
      allReels: buildUnifiedAdminInstagramList(),
      hiddenDefaultCount: hiddenInstagramIds.length,
    });
  }

  return res.status(404).json({ error: 'Instagram reel or post entry not found.' });
});

app.delete('/api/admin/instagram-videos/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = customInstagramVideos.findIndex((v) => v.id === id);
  if (idx !== -1) {
    customInstagramVideos.splice(idx, 1);
    delete reelPosterOverrides[id];
    instagramFeedCache = null;
    persistStore();
    return res.json({
      success: true,
      videos: customInstagramVideos,
      allReels: buildUnifiedAdminInstagramList(),
      hiddenDefaultCount: hiddenInstagramIds.length,
    });
  }

  const existsInDefaults = DEFAULT_INSTAGRAM_FEED.some((item) => item.id === id);
  const existsInCache = Boolean(instagramFeedCache?.posts.some((item) => item.id === id));
  if (existsInDefaults || existsInCache) {
    if (!hiddenInstagramIds.includes(id)) {
      hiddenInstagramIds.push(id);
    }
    instagramFeedCache = null;
    persistStore();
    return res.json({
      success: true,
      videos: customInstagramVideos,
      allReels: buildUnifiedAdminInstagramList(),
      hiddenDefaultCount: hiddenInstagramIds.length,
    });
  }

  return res.status(404).json({ error: 'Instagram video entry not found.' });
});

app.post('/api/admin/instagram-videos/restore-defaults', requireAdmin, (_req: Request, res: Response) => {
  hiddenInstagramIds = [];
  instagramFeedCache = null;
  persistStore();
  return res.json({
    success: true,
    videos: customInstagramVideos,
    allReels: buildUnifiedAdminInstagramList(),
    hiddenDefaultCount: 0,
  });
});

// -------------------------------------------------------------
// Image Transformation Utility Routes (WebP / Responsive Mobile)
// -------------------------------------------------------------
app.get('/api/images/menu/:key', async (req: Request, res: Response) => {
  const key = String(req.params.key || '').trim().toLowerCase();
  const filename = MENU_SOURCE_MAP[key];
  if (!filename) {
    return res.status(404).json({ error: 'Menu image key not found.' });
  }

  const sourcePath = path.resolve(__dirname, 'src', 'assets', 'images', filename);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Source image missing.' });
  }

  const width = clampWidth(req.query.w, 320);
  const quality = clampQuality(req.query.q, 82);
  const format = negotiateFormat(req.query.format, req.headers.accept);

  try {
    const result = await transformImageToBuffer({ sourcePath, width, quality, format });
    res.setHeader('Content-Type', result.mime);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    if (req.headers['if-none-match'] === result.etag) {
      return res.status(304).end();
    }
    return res.status(200).send(result.buffer);
  } catch (err) {
    console.error('Image transform error:', err);
    return res.sendFile(sourcePath);
  }
});

app.get('/api/images/transform', async (req: Request, res: Response) => {
  const srcParam = String(req.query.src || '');
  const sourcePath = resolveAllowlistedSourcePath(__dirname, srcParam);
  if (!sourcePath) {
    return res.status(400).json({ error: 'Invalid or unsupported image source path.' });
  }

  const width = clampWidth(req.query.w, 640);
  const quality = clampQuality(req.query.q, 82);
  const format = negotiateFormat(req.query.format, req.headers.accept);

  try {
    const result = await transformImageToBuffer({ sourcePath, width, quality, format });
    res.setHeader('Content-Type', result.mime);
    res.setHeader('ETag', result.etag);
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    if (req.headers['if-none-match'] === result.etag) {
      return res.status(304).end();
    }
    return res.status(200).send(result.buffer);
  } catch (err) {
    console.error('Dynamic image transform error:', err);
    return res.sendFile(sourcePath);
  }
});

// -------------------------------------------------------------
// Health Check Endpoints for Deployment Readiness
// -------------------------------------------------------------
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// JSON 404 catch-all for unknown /api/* endpoints (before static/Vite fallback)
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Requested service endpoint is unavailable.' });
});

// -------------------------------------------------------------
// Global Sanitized Server Error Handler (Zero Code/Stack/Key Leakage)
// -------------------------------------------------------------
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err instanceof Error ? err.message : 'Error');
  if (req.path.startsWith('/api/') || (!req.headers.accept?.includes('text/html') && req.headers.accept?.includes('application/json'))) {
    return res.status(500).json({
      error: 'Something went wrong while processing your request.',
    });
  }
  return res.status(500).type('html').send(renderSanitizedErrorHtml(500));
});

// Keep deployed Node server resilient against unexpected async errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// -------------------------------------------------------------
// Dynamic Canonical & Social Meta URL Injection (SSR/Crawler Safe)
// -------------------------------------------------------------
const BASE_META_ORIGIN = 'https://hotandspicybansberia.in';

function resolveRequestOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const forwardedProto = req.headers['x-forwarded-proto']?.toString().split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'https';
  const host = req.headers['x-forwarded-host']?.toString().split(',')[0].trim() || req.get('host');
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return BASE_META_ORIGIN;
}

function injectDynamicHeadMeta(html: string, req: Request): string {
  const origin = resolveRequestOrigin(req);
  const rawPath = req.path === '/index.html' ? '/' : req.path || '/';
  const normalizedPath = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
  const canonicalUrl = `${origin}${normalizedPath}`;

  return html
    .replaceAll(BASE_META_ORIGIN, origin)
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    );
}

function setupLiveVoiceWebSocket(httpServer: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname !== '/live') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Live voice concierge is unavailable right now.' }));
      clientWs.close();
      return;
    }

    let liveSession: any = null;
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: buildDynamicSystemInstruction(),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready' }));
            }
          },
          onmessage: (msg: any) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const sc = msg?.serverContent;
            if (!sc) return;

            if (sc.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (sc.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ type: 'input_transcript', text: String(sc.inputTranscription.text) })
              );
            }
            if (sc.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ type: 'output_transcript', text: String(sc.outputTranscription.text) })
              );
            }
            const parts = sc.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith('audio/')) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType,
                    })
                  );
                }
              }
            }
            if (sc.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turn_complete' }));
            }
          },
          onerror: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'error', message: 'Live voice connection interrupted.' }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      console.error('Gemini Live WS connect error:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Unable to start live voice session.' }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim(),
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close?.();
      } catch {}
      liveSession = null;
    });
  });
}

// -------------------------------------------------------------
// Vite Dev Server / Static Production Server Setup
// -------------------------------------------------------------
async function startServer() {
  const httpServer = http.createServer(app);
  setupLiveVoiceWebSocket(httpServer);
  const distDir = path.resolve(__dirname, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const publicDir = path.resolve(__dirname, 'public');
  const hasBuiltDist = fs.existsSync(distIndex);

  if (fs.existsSync(publicDir)) {
    app.use(
      '/assets/webp',
      express.static(path.join(publicDir, 'assets', 'webp'), {
        maxAge: '7d',
        immutable: true,
        etag: true,
      })
    );
    app.use(
      '/assets/aistudio',
      express.static(path.join(publicDir, 'assets', 'aistudio'), {
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h',
        acceptRanges: true,
        etag: true,
        lastModified: true,
      })
    );
  }

  if (process.env.NODE_ENV === 'production' && hasBuiltDist) {
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { maxAge: '7d', immutable: true })
    );
    app.use(express.static(distDir, { maxAge: '1h', index: false }));
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir, { maxAge: '1h', index: false }));
    }
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
      if (req.path !== '/' && req.path !== '/index.html') {
        return res.status(404).type('html').send(renderSanitizedErrorHtml(404));
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      try {
        const html = fs.readFileSync(distIndex, 'utf8');
        res.status(200).set({ 'Content-Type': 'text/html' }).send(injectDynamicHeadMeta(html, req));
      } catch {
        res.sendFile(distIndex);
      }
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/@') ||
        req.path.startsWith('/src/') ||
        path.extname(req.path) !== ''
      ) {
        return next();
      }
      if (req.path !== '/' && req.path !== '/index.html') {
        return res.status(404).type('html').send(renderSanitizedErrorHtml(404));
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(indexPath, 'utf8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        template = injectDynamicHeadMeta(template, req);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Hot & Spicy server active on port ${PORT} (mode=${process.env.NODE_ENV || 'development'}, dist=${hasBuiltDist})`);
  });
}

if (!isTestEnvironment()) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
} else {
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Requested service endpoint is unavailable.' });
    }
    return res.status(404).type('html').send(renderSanitizedErrorHtml(404));
  });
}

export { app };
