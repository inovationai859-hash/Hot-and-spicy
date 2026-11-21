import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeOrderStatus,
  normalizeFirestoreOrder,
  parseStrictNonNegativeNumber,
  resolveNonNegativeRate,
  getIstDateString,
} from '../src/lib/orderNormalizer';
import { app, resetStoreForTesting } from '../server';

const ADMIN_EMAIL = 'smdasif665@gmail.com';
const ADMIN_PASS = 'hotspicy098765';

describe('NULL-SEMANTICS Normalizer & Strict Numeric Helpers', () => {
  it('parseStrictNonNegativeNumber preserves 0 and rejects whitespace, negatives, booleans, and non-finite numbers', () => {
    expect(parseStrictNonNegativeNumber(0)).toBe(0);
    expect(parseStrictNonNegativeNumber('0')).toBe(0);
    expect(parseStrictNonNegativeNumber(' 149.5 ')).toBe(149.5);
    expect(parseStrictNonNegativeNumber(-1)).toBeNull();
    expect(parseStrictNonNegativeNumber('-50')).toBeNull();
    expect(parseStrictNonNegativeNumber('   ')).toBeNull();
    expect(parseStrictNonNegativeNumber('')).toBeNull();
    expect(parseStrictNonNegativeNumber(null)).toBeNull();
    expect(parseStrictNonNegativeNumber(undefined)).toBeNull();
    expect(parseStrictNonNegativeNumber(true)).toBeNull();
    expect(parseStrictNonNegativeNumber(Number.NaN)).toBeNull();
    expect(parseStrictNonNegativeNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('resolveNonNegativeRate preserves explicit 0 rate instead of falling back (ISSUE-01)', () => {
    expect(resolveNonNegativeRate(0, 60)).toBe(0);
    expect(resolveNonNegativeRate('0', 120)).toBe(0);
    expect(resolveNonNegativeRate(undefined, 150)).toBe(150);
    expect(resolveNonNegativeRate('   ', 150)).toBe(150);
    expect(resolveNonNegativeRate(-20, 150)).toBe(150);
  });

  it('normalizeOrderStatus accepts canonical statuses case-insensitively and preserves Ready', () => {
    expect(normalizeOrderStatus('preparing')).toBe('Preparing');
    expect(normalizeOrderStatus(' Ready ')).toBe('Ready');
    expect(normalizeOrderStatus('DELIVERED')).toBe('Delivered');
    expect(normalizeOrderStatus('Completed')).toBe('Completed');
    expect(normalizeOrderStatus('cancelled')).toBe('Cancelled');
    expect(normalizeOrderStatus(null)).toBe('Pending');
    expect(normalizeOrderStatus('unknown_state')).toBe('Pending');
  });

  it('normalizeFirestoreOrder sanitizes null/undefined/whitespace fields cleanly', () => {
    const normalized = normalizeFirestoreOrder(
      {
        id: '  ',
        customerName: null,
        phone: undefined,
        address: '  Boropara  ',
        diningMode: 'invalid',
        itemsSummary: '  1x Momo ',
        subtotal: '0',
        status: 'READY',
        is18Confirmed: 'yes',
        createdAt: null,
      },
      'DOC-991',
      { uid: 'usr-1', name: 'Guest Name', phone: '+91 9876543210' }
    );

    expect(normalized.id).toBe('DOC-991');
    expect(normalized.userId).toBe('usr-1');
    expect(normalized.customerName).toBe('Guest Name');
    expect(normalized.phone).toBe('+91 9876543210');
    expect(normalized.address).toBe('Boropara');
    expect(normalized.diningMode).toBe('takeaway');
    expect(normalized.itemsSummary).toBe('1x Momo');
    expect(normalized.subtotal).toBe(0);
    expect(normalized.status).toBe('Ready');
    expect(normalized.is18Confirmed).toBe(false);
    expect(normalized.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('getIstDateString formats UTC+5:30 calendar date accurately around UTC midnight', () => {
    // 2026-11-17T20:00:00.000Z is 2026-11-18 01:30:00 IST
    const utcEvening = new Date('2026-11-17T20:00:00.000Z');
    expect(getIstDateString(utcEvening)).toBe('2026-11-18');
  });
});

describe('API NULL-Semantics, Direct Admin Auth, Google Sign-Up 18+ Gate & Error Sanitization', () => {
  beforeEach(() => {
    resetStoreForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects whitespace/negative subtotals on /api/orders and whitespace on /api/reservations', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Test Diner',
      email: 'diner@example.com',
      password: 'Password123',
      is18Plus: true,
    });
    expect(signupRes.status).toBe(201);
    const token = signupRes.body.token as string;

    const badOrderNegative = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Test Diner',
        phone: '+91 9876543210',
        address: 'Table 4',
        diningMode: 'dine-in',
        itemsSummary: '1x Crispy Corn',
        subtotal: -50,
        is18Confirmed: true,
      });
    expect(badOrderNegative.status).toBe(400);

    const badOrderWhitespace = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: '   ',
        phone: '+91 9876543210',
        address: 'Table 4',
        diningMode: 'dine-in',
        itemsSummary: '1x Crispy Corn',
        subtotal: 180,
        is18Confirmed: true,
      });
    expect(badOrderWhitespace.status).toBe(400);

    const zeroOrderOk = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Test Diner',
        phone: '+91 9876543210',
        address: 'Table 4',
        diningMode: 'dine-in',
        itemsSummary: '1x Tasting Sample',
        subtotal: 0,
        is18Confirmed: true,
      });
    expect(zeroOrderOk.status).toBe(200);
    expect(zeroOrderOk.body.details.subtotal).toBe(0);

    const badReservationWhitespace = await request(app)
      .post('/api/reservations')
      .send({
        name: '   ',
        phone: '   ',
        bookingType: 'dining',
        is18Confirmed: true,
      });
    expect(badReservationWhitespace.status).toBe(400);
  });

  async function loginAdminDirect(): Promise<{ token: string }> {
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.requiresTwoFactor).toBeUndefined();
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.admin?.email).toBe(ADMIN_EMAIL);
    return { token: loginRes.body.token as string };
  }

  it('persists explicit 0 rates on /api/admin/catalog/gaming (ISSUE-01)', async () => {
    const { token: adminToken } = await loginAdminDirect();

    const patchRes = await request(app)
      .patch('/api/admin/catalog/gaming')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pool15Price: 0, pool30Price: 120, ps5HourlyPrice: 0 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.gamingRates.pool15Price).toBe(0);
    expect(patchRes.body.gamingRates.pool30Price).toBe(120);
    expect(patchRes.body.gamingRates.ps5HourlyPrice).toBe(0);

    const catalogRes = await request(app).get('/api/catalog');
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.gamingRates.pool15Price).toBe(0);
    expect(catalogRes.body.gamingRates.ps5HourlyPrice).toBe(0);
  });

  it('removes /api/auth/phone service and persists dietaryPreference on /api/auth/profile', async () => {
    const phoneRes = await request(app)
      .post('/api/auth/phone')
      .send({ idToken: 'fake', mode: 'signin' });
    expect(phoneRes.status).toBe(404);

    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Dietary Diner',
      email: 'veg@example.com',
      password: 'Password123',
      is18Plus: true,
    });
    expect(signupRes.status).toBe(201);
    const token = signupRes.body.token as string;

    const invalidPref = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ dietaryPreference: 'vegan-invalid' });
    expect(invalidPref.status).toBe(400);

    const vegPref = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ dietaryPreference: 'veg' });
    expect(vegPref.status).toBe(200);
    expect(vegPref.body.user.dietaryPreference).toBe('veg');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.dietaryPreference).toBe('veg');
  });

  it('enforces 18+ confirmation on /api/auth/google across Sign In and Sign Up modes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('identitytoolkit.googleapis.com')) {
        return new Response(
          JSON.stringify({
            users: [
              {
                localId: 'google-uid-123',
                email: 'googleuser@example.com',
                displayName: 'Google User',
                emailVerified: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const signupDeniedRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'fake-google-id-token', mode: 'signup', is18Plus: false });
    expect(signupDeniedRes.status).toBe(400);

    const signinNeedsAgeRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'fake-google-id-token', mode: 'signin', is18Plus: false });
    expect(signinNeedsAgeRes.status).toBe(200);
    expect(signinNeedsAgeRes.body.needsAgeConfirmation).toBe(true);
    expect(signinNeedsAgeRes.body.googleEmail).toBe('googleuser@example.com');

    const okRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'fake-google-id-token', mode: 'signin', is18Plus: true });
    expect(okRes.status).toBe(201);
    expect(okRes.body.isNewUser).toBe(true);
    expect(okRes.body.user.authProvider).toBe('google');
    expect(okRes.body.user.is18Plus).toBe(true);

    const existingSignInRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'fake-google-id-token', mode: 'signin' });
    expect(existingSignInRes.status).toBe(200);
    expect(existingSignInRes.body.isNewUser).toBe(false);
    expect(existingSignInRes.body.token).toBeTruthy();
  });

  it('authenticates Admin Portal directly with unchanged credentials and removes 2FA routes', async () => {
    const badRes = await request(app)
      .post('/api/admin/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' });
    expect(badRes.status).toBe(401);

    const { token } = await loginAdminDirect();
    expect(token).toBeTruthy();

    const oldStatusRes = await request(app)
      .get('/api/admin/2fa/status')
      .set('Authorization', `Bearer ${token}`);
    expect(oldStatusRes.status).toBe(404);

    const oldVerifyRes = await request(app)
      .post('/api/admin/login/2fa')
      .send({ challengeToken: 'none', code: '000000' });
    expect(oldVerifyRes.status).toBe(404);

    // Admin-only 3D Lounge FPS monitor toggle
    const unauthToggleRes = await request(app)
      .patch('/api/admin/settings/perf-monitor')
      .send({ enabled: true });
    expect(unauthToggleRes.status).toBe(401);

    const enableRes = await request(app)
      .patch('/api/admin/settings/perf-monitor')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.loungePerfMonitorEnabled).toBe(true);

    const catAfterEnable = await request(app).get('/api/catalog');
    expect(catAfterEnable.status).toBe(200);
    expect(catAfterEnable.body.loungePerfMonitorEnabled).toBe(true);

    const disableRes = await request(app)
      .patch('/api/admin/settings/perf-monitor')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.loungePerfMonitorEnabled).toBe(false);
  });

  it('serves sanitized HTML 404 without code, stack traces, keys, or admin hints', async () => {
    for (const targetPath of ['/.env', '/server.ts', '/firestore.rules', '/nonexistent']) {
      const res = await request(app).get(targetPath).set('Accept', 'text/html');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Hot &amp; Spicy');
      expect(res.text).toContain('Go Back');
      expect(res.text).not.toContain('GEMINI_API_KEY');
      expect(res.text).not.toContain('ADMIN_SESSION_SECRET');
      expect(res.text).not.toContain('#admin');
      expect(res.text).not.toContain('/app/applet');
      expect(res.text).not.toContain('SyntaxError');
      expect(res.text).not.toContain('ReferenceError');
    }
  });

  it('auto-logs in returning user from same IP, respects explicit signout opt-out, and re-enables on signin', async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({
        name: 'IP Returner',
        email: 'ipuser@example.com',
        password: 'Password123',
        is18Plus: true,
      });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.lastIp).toBeUndefined();
    expect(signupRes.body.user.passwordHash).toBeUndefined();
    const firstToken = signupRes.body.token as string;

    const ipSessionRes = await request(app)
      .get('/api/auth/ip-session')
      .set('X-Forwarded-For', '203.0.113.42');
    expect(ipSessionRes.status).toBe(200);
    expect(ipSessionRes.body.autoLoggedIn).toBe(true);
    expect(ipSessionRes.body.token).toBeTruthy();
    expect(ipSessionRes.body.user.email).toBe('ipuser@example.com');
    expect(ipSessionRes.body.user.lastIp).toBeUndefined();

    // Different IP should not auto-login this account
    const otherIpRes = await request(app)
      .get('/api/auth/ip-session')
      .set('X-Forwarded-For', '198.51.100.77');
    expect(otherIpRes.status).toBe(200);
    expect(otherIpRes.body.autoLoggedIn).toBe(false);

    // Explicit signout prevents automatic IP login until explicit sign-in
    const signoutRes = await request(app)
      .post('/api/auth/signout')
      .set('Authorization', `Bearer ${firstToken}`)
      .set('X-Forwarded-For', '203.0.113.42');
    expect(signoutRes.status).toBe(200);
    expect(signoutRes.body.success).toBe(true);

    const blockedIpRes = await request(app)
      .get('/api/auth/ip-session')
      .set('X-Forwarded-For', '203.0.113.42');
    expect(blockedIpRes.status).toBe(200);
    expect(blockedIpRes.body.autoLoggedIn).toBe(false);

    // Signing back in re-enables same-IP session restore
    const signinRes = await request(app)
      .post('/api/auth/signin')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({
        email: 'ipuser@example.com',
        password: 'Password123',
      });
    expect(signinRes.status).toBe(200);
    expect(signinRes.body.token).toBeTruthy();

    const restoredIpRes = await request(app)
      .get('/api/auth/ip-session')
      .set('X-Forwarded-For', '203.0.113.42');
    expect(restoredIpRes.status).toBe(200);
    expect(restoredIpRes.body.autoLoggedIn).toBe(true);
    expect(restoredIpRes.body.user.email).toBe('ipuser@example.com');
  });

  it('retains > 260 orders without truncation across /api/admin/orders and /api/admin/stats', async () => {
    const { token: adminToken } = await loginAdminDirect();

    for (let i = 0; i < 265; i += 1) {
      const res = await request(app)
        .post('/api/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: `Bulk Guest ${i}`,
          phone: '+91 9876543210',
          address: `Table ${i % 10 + 1}`,
          diningMode: 'dine-in',
          itemsSummary: '1. Steamed Chicken Momos x1 - ₹120',
          subtotal: 120,
          status: 'Completed',
        });
      expect(res.status).toBe(201);
    }

    const ordersRes = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ordersRes.status).toBe(200);
    expect(ordersRes.body.orders.length).toBe(265);

    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalOrders).toBe(265);
    expect(statsRes.body.totalRevenue).toBe(265 * 120);
  });

  it('supports Admin Dish imageUrl PATCH/POST/reset and upload-image endpoint', async () => {
    const { token: adminToken } = await loginAdminDirect();

    // 1x1 transparent PNG data URL
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const uploadRes = await request(app)
      .post('/api/admin/upload-image')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: 'test-momo.png',
        dataUrl: `data:image/png;base64,${tinyPngBase64}`,
      });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.imageUrl).toMatch(/^\/api\/uploads\/test-momo-/);

    const uploadedFileRes = await request(app).get(uploadRes.body.imageUrl);
    expect(uploadedFileRes.status).toBe(200);
    expect(uploadedFileRes.headers['content-type']).toMatch(/image\/png/);

    // Patch first catalog item with uploaded imageUrl
    const initialCat = await request(app).get('/api/catalog');
    const firstItem = initialCat.body.items[0];
    expect(firstItem).toBeTruthy();

    const patchImgRes = await request(app)
      .patch(`/api/admin/catalog/item/${firstItem.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl: uploadRes.body.imageUrl });
    expect(patchImgRes.status).toBe(200);
    expect(patchImgRes.body.item.imageUrl).toBe(uploadRes.body.imageUrl);

    // Clear imageUrl override cleanly
    const resetImgRes = await request(app)
      .patch(`/api/admin/catalog/item/${firstItem.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl: '' });
    expect(resetImgRes.status).toBe(200);
    expect(resetImgRes.body.item.imageUrl).toBeUndefined();

    // Create dish with external HTTPS imageUrl
    const createRes = await request(app)
      .post('/api/admin/catalog/item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Peri Peri Tikka Wrap',
        chapter: 'Wok & Rolls',
        price: 199,
        isVeg: false,
        isSpicy: true,
        description: 'Grilled smoky roll.',
        imageUrl: 'https://example.com/wrap.jpg',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.item.imageUrl).toBe('https://example.com/wrap.jpg');

    const uploadedFileName = path.basename(uploadRes.body.imageUrl as string);
    const uploadedDiskPath = path.join(process.cwd(), 'data', 'uploads', uploadedFileName);
    if (fs.existsSync(uploadedDiskPath)) {
      fs.unlinkSync(uploadedDiskPath);
    }
  });

  it('allows deleting built-in Instagram reels and restoring defaults', async () => {
    const { token: adminToken } = await loginAdminDirect();

    const initialFeed = await request(app).get('/api/instagram-feed');
    expect(initialFeed.status).toBe(200);
    expect(initialFeed.body.posts.some((p: { id: string }) => p.id === 'ig-reel-1')).toBe(true);

    const delRes = await request(app)
      .delete('/api/admin/instagram-videos/ig-reel-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.hiddenDefaultCount).toBe(1);
    expect(delRes.body.allReels.some((p: { id: string }) => p.id === 'ig-reel-1')).toBe(false);

    const updatedFeed = await request(app).get('/api/instagram-feed');
    expect(updatedFeed.status).toBe(200);
    expect(updatedFeed.body.posts.some((p: { id: string }) => p.id === 'ig-reel-1')).toBe(false);

    const restoreRes = await request(app)
      .post('/api/admin/instagram-videos/restore-defaults')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.hiddenDefaultCount).toBe(0);
    expect(restoreRes.body.allReels.some((p: { id: string }) => p.id === 'ig-reel-1')).toBe(true);
  });

  it('updates venueSettings via /api/admin/settings/venue and reflects across public endpoints', async () => {
    const { token: adminToken } = await loginAdminDirect();

    const updateRes = await request(app)
      .patch('/api/admin/settings/venue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        openingTime: '12:00 PM',
        closingTime: '11:00 PM',
        kitchenLastOrder: '10:30 PM',
        whatsappNumber: '+91 9000011111',
        address: 'Boropara Station Square, Bansberia 712502',
        instagramHandle: '@hotspicy_live',
        instagramUrl: 'https://instagram.com/hotspicy_live',
        youtubeUrl: 'https://www.youtube.com/@Hotandspicyaa',
        facebookUrl: 'https://facebook.com/hotspicy',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.venueSettings.openingTime).toBe('12:00 PM');
    expect(updateRes.body.venueSettings.kitchenLastOrder).toBe('10:30 PM');

    const catRes = await request(app).get('/api/catalog');
    expect(catRes.status).toBe(200);
    expect(catRes.body.venueSettings.whatsappNumber).toBe('+91 9000011111');
    expect(catRes.body.venueSettings.address).toBe('Boropara Station Square, Bansberia 712502');

    const statusRes = await request(app).get('/api/gaming-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.operatingHours).toBe('12:00 PM – 11:00 PM');

    const feedRes = await request(app).get('/api/instagram-feed');
    expect(feedRes.status).toBe(200);
    expect(feedRes.body.handle).toBe('hotspicy_live');
    expect(feedRes.body.profileUrl).toBe('https://instagram.com/hotspicy_live');
  });

  it('recovers backend session token cleanly via /api/auth/firebase-session for cart checkout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('identitytoolkit.googleapis.com')) {
        return new Response(
          JSON.stringify({
            users: [
              {
                localId: 'fb-uid-recovery-1',
                email: 'cartuser@example.com',
                displayName: 'Cart Recovery Diner',
                emailVerified: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const syncRes = await request(app)
      .post('/api/auth/firebase-session')
      .send({ idToken: 'fake-firebase-token' });
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.token).toBeTruthy();
    expect(syncRes.body.user.email).toBe('cartuser@example.com');

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${syncRes.body.token}`)
      .send({
        customerName: 'Cart Recovery Diner',
        phone: '+91 9876543210',
        address: 'Table 3',
        diningMode: 'dine-in',
        itemsSummary: '1. Smoked Chicken Wings x1 - ₹249',
        subtotal: 249,
        is18Confirmed: true,
      });
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.success).toBe(true);
    expect(orderRes.body.orderId).toMatch(/^ORD-/);
    expect(orderRes.body.user.phone).toBe('+91 9876543210');
    expect(orderRes.body.user.address).toBe('Table 3');
  });

  it('persists email, phone, and address across signup, profile update, reservations, orders, and /api/admin/customers', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Bansberia Regular',
      email: 'regular@example.com',
      password: 'Password123',
      phone: '9830011223',
      address: 'Dingalhat Main Road, Bansberia',
      is18Plus: true,
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.phone).toBe('+91 9830011223');
    expect(signupRes.body.user.address).toBe('Dingalhat Main Road, Bansberia');

    // Second user signs up without phone/address, then books + orders
    const blankSignup = await request(app).post('/api/auth/signup').send({
      name: 'Backfill Diner',
      email: 'backfill@example.com',
      password: 'Password123',
      is18Plus: true,
    });
    expect(blankSignup.status).toBe(201);
    const token = blankSignup.body.token as string;

    const bookRes = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Backfill Diner',
        phone: '+91 9123456789',
        address: 'Boropara More, Bansberia',
        bookingType: 'ps5',
        date: '2026-11-22',
        timeSlot: '07:00 PM',
        guests: 2,
        is18Confirmed: true,
      });
    expect(bookRes.status).toBe(200);
    expect(bookRes.body.user.phone).toBe('+91 9123456789');
    expect(bookRes.body.user.address).toBe('Boropara More, Bansberia');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('backfill@example.com');
    expect(meRes.body.user.phone).toBe('+91 9123456789');
    expect(meRes.body.user.address).toBe('Boropara More, Bansberia');

    const { token: adminToken } = await loginAdminDirect();
    const custRes = await request(app)
      .get('/api/admin/customers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(custRes.status).toBe(200);
    const regularCust = custRes.body.customers.find(
      (c: { email: string }) => c.email === 'regular@example.com'
    );
    expect(regularCust).toBeTruthy();
    expect(regularCust.phone).toBe('+91 9830011223');
    expect(regularCust.address).toBe('Dingalhat Main Road, Bansberia');

    const backfillCust = custRes.body.customers.find(
      (c: { email: string }) => c.email === 'backfill@example.com'
    );
    expect(backfillCust).toBeTruthy();
    expect(backfillCust.phone).toBe('+91 9123456789');
    expect(backfillCust.address).toBe('Boropara More, Bansberia');
  });

  it('exposes updated Boropara More, Dingalhat, Near Azdan Moto Hub address and Facebook URL in defaults', async () => {
    const catRes = await request(app).get('/api/catalog');
    expect(catRes.status).toBe(200);
    expect(catRes.body.venueSettings.address).toContain('Boropara More, Dingalhat, Near Azdan Moto Hub');
    expect(catRes.body.venueSettings.facebookUrl).toBe(
      'https://www.facebook.com/profile.php?id=61594005043419'
    );
  });

  it('supports adding, updating, and clearing custom posters on custom and built-in Instagram reels', async () => {
    const { token: adminToken } = await loginAdminDirect();

    const invalidCreate = await request(app)
      .post('/api/admin/instagram-videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reelUrl: 'https://www.instagram.com/reel/Cxyz12345/',
        thumbnailUrl: 'javascript:alert(1)',
      });
    expect(invalidCreate.status).toBe(400);

    const createRes = await request(app)
      .post('/api/admin/instagram-videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reelUrl: 'https://www.instagram.com/reel/Cxyz12345/',
        category: 'Hot & Spicy Promo',
        thumbnailUrl: '/api/uploads/reel-cover.jpg',
      });
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.video.id as string;
    expect(createRes.body.video.thumbnailUrl).toBe('/api/uploads/reel-cover.jpg');

    const updateBuiltinRes = await request(app)
      .patch('/api/admin/instagram-videos/ig-reel-1/poster')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thumbnailUrl: 'https://cdn.example.com/tandoor-poster.webp' });
    expect(updateBuiltinRes.status).toBe(200);

    const feedRes = await request(app).get('/api/instagram-feed');
    expect(feedRes.status).toBe(200);
    const customFeedItem = feedRes.body.posts.find((p: { id: string }) => p.id === createdId);
    const builtinFeedItem = feedRes.body.posts.find((p: { id: string }) => p.id === 'ig-reel-1');
    expect(customFeedItem?.thumbnailUrl).toBe('/api/uploads/reel-cover.jpg');
    expect(builtinFeedItem?.thumbnailUrl).toBe('https://cdn.example.com/tandoor-poster.webp');

    const clearBuiltinRes = await request(app)
      .patch('/api/admin/instagram-videos/ig-reel-1/poster')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thumbnailUrl: '' });
    expect(clearBuiltinRes.status).toBe(200);

    const feedAfterClear = await request(app).get('/api/instagram-feed');
    const clearedBuiltin = feedAfterClear.body.posts.find((p: { id: string }) => p.id === 'ig-reel-1');
    expect(clearedBuiltin?.thumbnailUrl).toBeUndefined();
  });
});


