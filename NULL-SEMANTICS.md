# NULL Semantics & Value Handling Audit — Hot & Spicy

**Audit Deliverable:** `NULL-SEMANTICS.md`  
**Audit Scope:** Full-stack audit across React 19 UI/state, Express backend & JSON persistence (`server.ts`), and Cloud Firestore (`firebase-blueprint.json`, `firestore.rules`, client SDK).  
**Safety Compliance:** Read-only code audit. Zero source files, database schemas, security rules, configurations, or dependencies were modified.

---

## 1. Project Context

### 1.1 Technology Stack (Verified)
| Layer | Technology / Version | Evidence |
| :--- | :--- | :--- |
| **Runtime & Build** | Node.js ESM (`"type": "module"`), Vite `^8.3.0`, TypeScript `^7.0.2`, `tsx ^4.21.0` | `package.json:5-13, 37, 46-47` |
| **Frontend Framework** | React `^19.0.1`, `react-dom ^19.0.1`, Tailwind CSS `^4.3.3` (`@tailwindcss/vite`), `motion ^12.23.24` | `package.json:22, 32, 34-35`; `src/index.css:1` |
| **Backend Server** | Express `^4.21.2` (`server.ts`, 2,746 lines) serving `/api/*` + Vite dev middleware or `dist/` static SPA | `server.ts:1, 40, 2689-2716`; `package.json:7, 9, 27` |
| **Database & Persistence** | **No SQL RDBMS / No ORM.** Dual persistence:<br>1. **Cloud Firestore** named database `ai-studio-hotspicydigitals-d0bd234c-8d01-411e-81a9-304cfb6afa71` (`firebase ^13.2.0`)<br>2. **Backend JSON flat-file store** `/tmp/hs_venue_store.json` + in-memory `Map`/`Array` structures | `firebase-applet-config.json:6`; `src/firebase.ts:17`; `server.ts:534-540, 683-784` |
| **Authentication** | Custom HMAC-SHA256 customer bearer tokens (`hs_auth_token`, 30-day TTL) + Custom HMAC admin tokens (`hs_admin_token`, 24-hour TTL) + Firebase Phone Auth (`RecaptchaVerifier` / `signInWithPhoneNumber` verified server-side via Identity Toolkit REST API) + 3-step Email OTP Forgot Password (`crypto.randomInt`, single-use `pwd_reset` JWT-like HMAC token) | `server.ts:188-348, 589-613, 789-1194, 1330-1373`; `src/components/AuthModal.tsx:21-26, 251-295` |
| **External Integrations** | `@google/genai ^2.4.0` (`gemini-4-hydrogen`), `nodemailer ^10.6.0` / Resend / SendGrid, Instagram Graph API (`/api/instagram-feed`), ImageMagick `convert` CLI (`src/lib/serverImageTransform.ts`) | `package.json:21, 33`; `server.ts:389-464, 1929-1988, 2378-2440`; `src/lib/serverImageTransform.ts:136` |
| **Validation & Serialization** | Hand-written runtime conditionals (`typeof`, `.trim()`, `Number()`, regex). **Zero** schema validation libraries (no Zod, Joi, Yup, Valibot). Serialization via `express.json({ limit: '1mb' })`, `JSON.stringify` / `JSON.parse`, Firestore SDK, and `firestore.rules` CEL expressions | `server.ts:61, 696, 725`; `firestore.rules:9-91` |
| **Background Tasks & Jobs** | 1 volatile `setInterval` (every 5 minutes) purging expired in-memory rate limits, email OTP challenges, email OTP cooldowns, and password reset tokens. **No** cron jobs or workers exist for the UI-advertised "6-month inactive customer purge" | `server.ts:157-174`; `src/components/Footer.tsx:82`; `src/components/ProfileModal.tsx:678-681` |
| **Automated Tests** | **None.** Zero `*.test.*`, `*.spec.*`, Jest, Vitest, or Cypress/Playwright test files exist in the repository | Verified via workspace traversal; `package.json:6-13` |

### 1.2 Architectural Data Flow
```text
Client Forms / State (React)
  ├─► AuthContext.tsx (Bearer hs_auth_token) ──► Express server.ts (/tmp/hs_venue_store.json + Maps/Arrays)
  ├─► AuthContext.tsx / AdminPortal.tsx / ProfileModal.tsx ──► Cloud Firestore Client SDK (/users, /orders)
  └─► Direct fetches (CatalogContext, OrderDrawer, BookingModal, GamingLounge, SpicyBot, OptimizedImage)
```
**Critical Architectural Observation:** Express endpoints do **not** read from or write to Cloud Firestore (no `firebase-admin` or Firestore REST usage in `server.ts`). Conversely, client components write directly to Firestore (`/users/{uid}`, `/orders/{id}`) and read real-time updates from Firestore (`/orders`) while also reading/writing Express (`/tmp/hs_venue_store.json`). `/bookings/{bookingId}` has a full blueprint and security rules (`firebase-blueprint.json:24-43`, `firestore.rules:51-69, 108-114`), yet **no client or server code ever writes to Firestore `/bookings`**.

---

## 2. Value Semantics Reference

The codebase spans **TypeScript/JavaScript**, **JSON HTTP transport**, **File-system JSON serialization**, and **Cloud Firestore CEL rules**. These layers assign sharply different meanings to each empty/absent state:

| State | JS / Frontend Semantics | JSON Transport & `/tmp` File Store | Cloud Firestore & `firestore.rules` | Actual Project Behavior Summary |
| :--- | :--- | :--- | :--- | :--- |
| **1. DB `NULL` / Firestore `null`** | `null` is falsy (`Boolean(null) === false`). `typeof null === 'object'`. | Preserved in JSON as explicit `null`; treated as missing by `!val` checks. | **Valid typed primitive**, distinct from an absent key. Fails `x is string`, `x is number`, `x is bool`. | Client SDK never intentionally writes `null` to Firestore document fields. Rules reject `null` on all optional fields because rules use `(!('field' in data) \|\| data.field is string)`. |
| **2. Empty string `""`** | Falsy (`!"" === true`), `typeof "" === 'string'`. Rendered blank unless `\|\|` fallback provided. | Preserved verbatim (`""`) in `hs_venue_store.json`. | Allowed for optional string fields **without** `.size() > 0` (`phone`, `address`, `customerEmail`, `itemsSummary`, `specialRequests`, `loyaltyTier`). **Rejected** on required non-empty fields (`uid`, `name`, `email`, `customerName`, `phone` on orders/bookings, `address` on orders). | Heavily overloaded as a "not set" sentinel on `phone`, `address`, `customerEmail`, and `itemsSummary`. Truthiness checks (`!x`, `x \|\| fallback`) conflate `""` with `null` and `undefined`. |
| **3. Whitespace-only (`"   "`, `"\t"`)** | **Truthy** in JS (`Boolean("   ") === true`), length `> 0`. | Survives `if (!field)` guards unless `.trim()` runs **before** presence validation. | `data.field is string && data.field.size() > 0` **accepts** `"   "` (CEL checks length, not trimmed content). | **Asymmetric:** Auth routes `.trim()` before checking emptiness; Order, Reservation, Admin Order, and Chat endpoints check truthiness *before* `.trim()`, saving `""` after validation passes (`ISSUE-04`). |
| **4. Missing field** | Key absent (`!('k' in obj)`), reads as `undefined`. | Omitted by client JSON payloads if optional. Spread `...(x ? { k: x } : {})` conditionally omits keys (`server.ts:2053, 2057`). | Satisfies `!('field' in data)` in `firestore.rules`. Fails `data.keys().hasAll([...])` if required. Query `where('userId', '==', uid)` never returns docs missing `userId`. | Optional fields (`poolDuration`, `voucherCode`, `usedBookingId`, `videoUrl`) are omitted on Express objects when absent, whereas optional profile strings (`phone`, `address`) are normalized to `""`. |
| **5. `undefined`** | Default uninitialized property / optional TS param (`prop?: T`). | **Stripped** by `JSON.stringify()` on objects; serialized as `null` inside arrays. | Client SDK throws or fails schema depending on settings when `undefined` is passed in `setDoc`; this app coerces before calling `setDoc`. | `CatalogItem.inStock === undefined` is intentionally treated as `true` (`inStock !== false`). Passing `undefined` to `PATCH` omits an update (`if (x !== undefined)`). |
| **6. Default value** | Applied via `=`, `??`, `\|\|`, or ternary fallbacks. | Applied eagerly on create/load (`DEFAULT_GAMING_RATES`, `'Pending'`, `'guest'`, `'counter'`, `'07:30 PM'`). | Missing keys on write can be omitted if rules allow; on read in UI (`ProfileModal.tsx:164-172`), missing fields receive client defaults. | Overuse of `\|\|` instead of `??` overrides valid `0` and `""` (`ISSUE-01`, `ISSUE-08`, `ISSUE-13`). |
| **7. Explicit `null`** | Deliberately sent in JSON (e.g., `{"price": null}`). `x !== undefined` is **`true`** for `null`. | Survives `req.body` parsing as `null`. | Rejected by every Firestore rule (`null is string` -> `false`, `null is number` -> `false`, `null is bool` -> `false`). | **Dangerous in Express:** `if (price !== undefined) Number(null)` evaluates `Number(null) === 0`, setting item prices or gaming rates to `₹0` (`ISSUE-06`). In `PATCH /api/auth/profile`, `typeof null !== 'string'` causes explicit `null` to be silently ignored (`no-op`). |
| **8. Zero (`0`)** | **Falsy** in JS (`Boolean(0) === false`, `0 \|\| fallback` skips `0`). | Valid JSON number (`0`). `Number(0)` passes `>= 0`, fails `<= 0`. | Valid `number`. Accepted where `>= 0` (`subtotal`, loyalty points); rejected where `>= 1` (`guests`). | `loyaltyPoints: 0` works via `typeof === 'number'`; `subtotal: 0` fails `isValidOrder` if empty order? Actually `subtotal >= 0` is allowed, `guests: 0` flips to `2`, and **`gamingRates` = `0` is wiped out on reload (`ISSUE-01`)**. |
| **9. `false`** | **Falsy** in JS (`Boolean(false) === false`, `!false === true`). | Valid JSON boolean. Beware `Number(false) === 0` and `String(false) === "false"`. | `is18Plus is bool` accepts `false`; `is18Confirmed == true` rejects `false` on orders/bookings. | `is18Plus` on signup/booking rejects `false`, whereas `PATCH /api/auth/profile` permits setting `is18Plus: false`. `inStock: false` hides items only when strictly `false` (`!== false`). |
| **10. Empty collections (`[]`, `{}`)** | **Truthy** in JS (`Boolean([]) === true`, `Boolean({}) === true`). `req.body \|\| {}` defaults to `{}`. | `mockOrders: []`, `vouchers: []`, `items: []`, `history: []`. | Blueprint/rules store **no arrays or nested maps** in Firestore; documents contain flat scalar fields only. | Empty arrays trigger UI empty states (`length === 0`). Sending `{}` to `PATCH /api/auth/profile` or `PATCH /api/admin/orders/:id` returns HTTP `200 OK` as a silent no-op. |

---

## 3. Database NULL Behavior

### 3.1 Cloud Firestore Semantics (`firestore.rules` & `firebase-blueprint.json`)
Although this application has **no SQL database**, Cloud Firestore exhibits strict three-state key semantics that mirror several SQL NULL traps:

1. **Absent Key vs. Explicit `null` vs. Empty String `""`:**
   - Every optional field validator in `firestore.rules` uses the pattern:
     `(!('field' in data) || (data.field is string && ...))` (`firestore.rules:39-48, 60-68, 78-90`).
   - If a key is **omitted**, `'field' in data` is `false`, so `!('field' in data)` short-circuits to `true`.
   - If a client writes `{ phone: null }`, `'phone' in data` is `true`, and `null is string` evaluates to **`false`**, causing `PERMISSION_DENIED`.
   - Contrast with `{ phone: "" }`: accepted in `/users/{userId}` (`data.phone.size() <= 20`, no `> 0` check), **rejected** in `/orders/{orderId}` (`data.phone.size() > 0`) and `/bookings/{bookingId}` (`data.phone.size() > 0`).
2. **Firestore Security Rule Type Constraints on `poolDuration`:**
   - `firestore.rules:55` includes `'poolDuration'` in `isValidBooking`'s `hasOnly([...])` allowlist, **without any type/size/enum predicate**. If `/bookings` writes were enabled, `poolDuration: null`, `poolDuration: 123`, or `poolDuration: ""` would all pass `isValidBooking`, while `firebase-blueprint.json:24-43` omits `poolDuration` completely.
3. **Rule Updates & `resource == null`:**
   - `/users/{userId}` `allow get: if isValidId(userId) && (isOwner(userId) || resource == null)` (`firestore.rules:95`): an unauthenticated user can probe non-existent user document IDs (`resource == null` returns `{ exists: false }`), whereas reading an existing document fails unless `request.auth.uid == userId` (Firebase Phone Auth). **However**, `/users/{userId}` `allow create` and `allow update` (`firestore.rules:96-104`) do **not** call `isSignedIn()` — allowing custom-token Express users (`u_...` UIDs) to write their profile while blocking them from ever `get()`ing it.
   - `/orders/{orderId}` `allow update` (`firestore.rules:121-123`) requires `incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])`. Writing an entire object with `setDoc(..., { merge: true })` fails if *any* other field differs from the stored Firestore document (e.g., if `address` was modified or `customerEmail` was omitted vs `""` — see **`ISSUE-03`**).
4. **Query & Index Filtering (`where`):**
   - `ProfileModal.tsx:155, 276` queries `query(collection(db, 'orders'), where('userId', '==', userProfile.uid))`.
   - Under `/orders/{orderId}` `allow list: if resource.data.userId is string && resource.data.userId.size() > 0 && resource.data.userId.size() <= 128` (`firestore.rules:119`):
     - Documents where `userId` is `null`, absent, or `""` fail `allow list` if reachable by a broad query and never match `== userProfile.uid` (like SQL `WHERE userId = ?`, where `NULL = ?` yields `UNKNOWN`).
     - Notice that `AuthContext.tsx:450` falls back to `userId: userProfile?.uid || 'guest'`. Since `'guest'` is a non-empty string, any guest order written to Firestore satisfies `allow list` if someone queries `where('userId', '==', 'guest')`.

### 3.2 Backend File Store (`/tmp/hs_venue_store.json`) & Contrast with SQL Three-Valued Logic
- **Storage Mechanism:** Plain JSON serialized with `JSON.stringify(data)` on writes (`server.ts:683-700`) and parsed via `JSON.parse()` on startup (`server.ts:722-782`).
- **Record Truncation & Filtering on Load:**
  - `persistStore()` hard-caps `orders` to `250`, `reservations` to `250`, and `userRewards` to `500` (`server.ts:687-689`).
  - `loadStore()` discards any order, reservation, or reward whose `userId` is missing, `null`, `""`, or `undefined` (`Boolean(o.userId)` at `server.ts:734, 741, 748`).
- **Absence of SQL Constraints:** There are **no** database-level `UNIQUE` constraints, foreign keys, `CHECK` constraints, or transactional locks:
  - Email uniqueness (`findUserByEmail`) and phone uniqueness (`findUserByPhone`) are linear O(n) Map scans inside a single Node.js process (`server.ts:571-587`).
  - SQL three-valued logic (`TRUE` / `FALSE` / `UNKNOWN`), `IS NULL` vs `= NULL`, `COUNT(col)` vs `COUNT(*)`, and `GROUP BY` NULL-grouping do not execute in this codebase; instead, JavaScript's `===`, `!==`, `Boolean()`, and `||` perform analogous role filtering, introducing type-coercion bugs documented in Sections 7 and 9.

---

## 4. Field-Level NULL Matrix

All **74 fields** below were directly verified from `firebase-blueprint.json`, `firestore.rules`, `src/types.ts`, `src/data/catalogData.ts`, `src/context/AuthContext.tsx`, and `server.ts`.

### 4.1 User Fields (`users/{uid}`, `StoredUser`, `UserProfile`) — 16 Fields
| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `user.uid` | Firestore `string` (`1..128`, regex) / JSON `string` | No (FS rejects `null`; `""` rejected) | No | `'u_' + uuid` or Firebase `localId` | Must match path `{userId}` on Firestore create and stay immutable (`incoming().uid == existing().uid`). | `firestore.rules:30,36,96,99`; `server.ts:855,928,981` |
| `user.name` | Firestore `string` (`1..100`) / JSON `string` | No | No in signup/FS; ignored in PATCH | `'Hot & Spicy Guest'` (legacy FB sign-in / FS fallback) | Required `.trim()` on signup/phone reg. `PATCH /api/auth/profile` ignores `""` or whitespace. FS write coerces empty name to `'Hot & Spicy Guest'`. | `firestore.rules:37`; `server.ts:837,884,982,1308`; `AuthContext.tsx:128` |
| `user.email` | Firestore `string` (`1..120`) / JSON `string` | No | **Drift:** `""` impossible via new signup, allowed if coerced to synthetic in FS | `${uid}@guest.local` (Firestore sync only) | Lowercased & trimmed. Must contain `'@'` on signup/signin/OTP reset. `syncUserProfileToFirestore` replaces empty `email` with `${uid}@guest.local` to pass `size() > 0`. | `firestore.rules:38`; `server.ts:840,881,1018`; `AuthContext.tsx:129` |
| `user.phone` | Firestore optional `string` (`0..20`) / JSON `string` | **No** in FS (`null` fails `is string`); ignored if `null` in Express | Yes (`""`) | `""` | Optional on email signup (`String(phone \|\| '').trim()` -> `""`); E.164 formatted `+91 XXXXXXXXXX` on phone auth. `PATCH /api/auth/profile` trims string, allowing `""` to clear it. | `firestore.rules:39`; `server.ts:803,933-935,984,1309`; `AuthContext.tsx:130` |
| `user.phoneVerified` | JSON `boolean` (not in FS blueprint/rules) | Absent in FS; coerced to `false` in Express | N/A | `false` (`Boolean(verifiedPhoneInfo)`) | Set `true` on phone auth. Not synced to Firestore (`hasOnly` omits it). Not cleared when `phone` is emptied in `PATCH /api/auth/profile`. | `server.ts:708,859,936,1309`; `firestore.rules:31-35` |
| `user.address` | Firestore optional `string` (`0..250`) / JSON `string` | **No** in FS (`null` fails `is string`) | Yes (`""`) | `""` | Trimmed on signup/profile edit; empty allowed. Displayed in UI as fallback `"No address saved"`. | `firestore.rules:40`; `server.ts:807,937,1310`; `ProfileModal.tsx:548` |
| `user.is18Plus` | Firestore optional `boolean` / JSON `boolean` | **No** in FS | N/A | `true` on signup; `false` on missing in FS read (`Boolean`) | Signup/phone reg strictly require truthy `is18Plus` (`!is18Plus` rejected); `PATCH /api/auth/profile` accepts `false`. | `firestore.rules:41`; `server.ts:847,891,1311`; `AuthContext.tsx:132` |
| `user.passwordHash` | JSON optional `string` (`salt:hashHex`, never in FS) | Absent on pre-mandatory legacy records | Rejected in `verifyPassword` | None (now mandatory at signup) | Signup & OTP-verified phone reg require non-space `length >= 6 && length <= 128`. Stored in backend only, omitted by `sanitizeUser`. | `server.ts:270-281, 523, 702-720, 843, 887` |
| `user.authProvider` | JSON `'email' \| 'phone' \| 'google'` (not in FS rules) | Absent in FS | No | `'email'` or `'phone'` | `'google'` typed in TS & `server.ts`, though no active Google OAuth login route exists. | `src/types.ts:69`; `server.ts:524,709,863,940` |
| `user.loyaltyPoints` | Firestore optional `number` (`0..1e7`) / JSON `number` | **No** in FS | N/A | `0` | `sanitizeUser` defaults non-number to `0`. `syncUserProfileToFirestore` computes `Math.max(0, Math.floor(Number(...) \|\| 0))`. | `firestore.rules:42`; `server.ts:712`; `AuthContext.tsx:109-118` |
| `user.earnedPoints` | Firestore optional `number` (`0..1e7`) / JSON `number` | **No** in FS | N/A | `0` | Sum of `Math.floor(subtotal / 10)` across non-cancelled orders. `0` is valid and preserved. | `firestore.rules:43`; `server.ts:713`; `src/lib/loyalty.ts:102` |
| `user.spentPoints` | Firestore optional `number` (`0..1e7`) / JSON `number` | **No** in FS | N/A | `0` | Sum of `pointsCost` across `userRewards` for `uid`. Clamped `>= 0`. | `firestore.rules:44`; `server.ts:714`; `src/lib/loyalty.ts:121-125` |
| `user.loyaltyTier` | Firestore optional `string` (`0..40`) / JSON `string` | **No** in FS | Allowed by rule (`size() <= 40`), never written empty | `'Spicy Insider'` (0 pts tier) | Derived via `getLoyaltyTier(earnedPoints).name`. | `firestore.rules:45`; `server.ts:715`; `AuthContext.tsx:119-121` |
| `user.loyaltyUpdatedAt` | Firestore optional `string` (`0..50`) / JSON `string` | **No** in FS | Allowed by rule, coerced to ISO | `createdAt` or `nowIso` | `sanitizeUser` falls back to `u.createdAt`; FS fallback uses `nowIso`. | `firestore.rules:46`; `server.ts:716`; `AuthContext.tsx:137` |
| `user.createdAt` | Firestore optional `string` (`0..50`) / JSON `string` | **No** in FS | Allowed by rule, coerced to ISO | `nowIso` | Set on signup/migration. | `firestore.rules:47`; `server.ts:864,941`; `AuthContext.tsx:138` |
| `user.lastLoginAt` | Firestore optional `string` (`0..50`) / JSON `string` | **No** in FS | Allowed by rule, coerced to ISO | `nowIso` | Updated on signin, phone login, and signup. | `firestore.rules:48`; `server.ts:818,1005`; `AuthContext.tsx:139` |

### 4.2 Order Fields (`orders/{orderId}`, `AdminOrder`, `UserOrderRecord`) — 13 Fields
| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `order.id` | Firestore optional `string` (`1..128`) / JSON `string` | **No** in FS (`isValidId`) | No | `'ORD-' + 6 digits` | Document key in FS; required by `loadStore()` (`o && o.id`). | `firestore.rules:78,118`; `server.ts:734,1506,2154`; `AuthContext.tsx:449` |
| `order.userId` | Firestore optional `string` (`0..128`) / JSON optional `string` | **No** in FS (`null` rejected) | **No** in FS list (`size() > 0`); **dropped** on `loadStore()` | `'guest'` (FS fallback / Admin); `'counter'` (`POST /api/admin/orders`) | `POST /api/orders` requires valid Bearer `uid`. `loadStore()` drops orders with falsy `userId` (`Boolean(o.userId)`). Admin walk-in uses `'counter'`. | `firestore.rules:79,119`; `server.ts:734,1513,2149-2157`; `AuthContext.tsx:450`; `AdminPortal.tsx:398` |
| `order.customerEmail` | Firestore optional `string` (`0..120`) | **No** in FS (`null` rejected) | Yes (`""`) | `""` (`userProfile?.email \|\| ''`) | Written only by `AuthContext.saveOrderRecord` (omitted on Express `AdminOrder` and on `AdminPortal` `setDoc`, creating rule diff!). | `firestore.rules:80`; `AuthContext.tsx:451`; `AdminPortal.tsx:394-411` |
| `order.customerName` | Firestore `string` (`1..100`) / JSON `string` | No | **Bug:** whitespace passes API -> saved as `""`; rejected in FS | None (UI falls back to `userProfile.name`) | `POST /api/orders` & `/api/admin/orders` check `!customerName` *before* `.trim()`. `OrderDrawer` trims on client. | `firestore.rules:81`; `server.ts:1502,1514,2143,2158`; `OrderDrawer.tsx:89` |
| `order.phone` | Firestore `string` (`1..20`) / JSON `string` | No | **Bug:** whitespace passes API -> `""`; rejected in FS | `""` on FS `getDocs` fallback; `userProfile.phone` on `onSnapshot` | Same whitespace bypass on Express; `OrderDrawer` enforces 10 digits `+91 XXXXXXXXXX`. | `firestore.rules:82`; `server.ts:1502,1515,2143,2159`; `ProfileModal.tsx:165,283` |
| `order.address` | Firestore `string` (`1..250`) / JSON `string` | No | **Yes in API (`""`)**; **No in FS (`size() > 0`)** | `""` (`POST /api/orders`); `'Bansberia'` (`AdminPortal` FS); `'Lounge Table'`/`'Takeaway Counter'` (walk-in) | Cross-layer contradiction (`ISSUE-05`): `POST /api/orders` saves `""`, which fails `isValidOrder` in Firestore. | `firestore.rules:83`; `server.ts:1516,2160`; `OrderDrawer.tsx:100`; `AdminPortal.tsx:401` |
| `order.diningMode` | Firestore optional enum / JSON enum | **No** | Coerced | `'takeaway'` | Any value other than `'dine-in'` (including `null`, `""`, `'delivery'`) silently coerced to `'takeaway'`. | `firestore.rules:84`; `server.ts:1517,2161`; `ProfileModal.tsx:167` |
| `order.itemsSummary` | Firestore optional `string` (`0..2000`) / JSON `string` | **No** (`null` fails FS `is string`) | Yes on `/api/orders`; required on `/api/admin/orders` | `""` | `POST /api/admin/orders` checks `!itemsSummary` (whitespace becomes `""`). Regex-parsed for top items in `/api/admin/stats`. | `firestore.rules:85`; `server.ts:1432-1443,1502,1518,2162` |
| `order.subtotal` | Firestore `number` (`0..500000`) / JSON `number` | No | N/A (`""` -> `0`) | `0` | `POST /api/orders` stores `Number(subtotal) \|\| 0` (allows negative!). `PATCH /api/admin/orders/:id` rejects `< 0` & non-numbers. | `firestore.rules:86`; `server.ts:1505,1539,2163` |
| `order.status` | Firestore enum (5 vals) / Express enum (4 vals) | No | Rejected / ignored if invalid | `'Pending'` | Express allows `['Pending', 'Preparing', 'Completed', 'Cancelled']`; FS rules/blueprint & TS `UserOrderRecord` also list `'Delivered'`. | `firestore.rules:87`; `firebase-blueprint.json:58`; `src/types.ts:90`; `server.ts:476,1507,1536` |
| `order.is18Confirmed` | Firestore literal `true` (not stored in Express `AdminOrder`) | No | N/A | `true` (hardcoded on FS write) | Required `== true` by FS `isValidOrder`. Express `/api/orders` does not check or store it; `OrderDrawer` enforces checkbox. | `firestore.rules:88`; `AuthContext.tsx:459`; `AdminPortal.tsx:406`; `OrderDrawer.tsx:105` |
| `order.createdAt` | Firestore optional `string` (`0..50`) / JSON `string` | **No** in FS | Allowed by rule | `new Date().toISOString()` | Generated server-side on Express; passed to FS. | `firestore.rules:89`; `server.ts:1521,2165`; `AuthContext.tsx:460` |
| `order.updatedAt` | Firestore optional `string` (`0..50`) (not on Express `AdminOrder`) | **No** in FS | Allowed by rule | `createdAt` on create; `nowIso` on admin update | One of only two keys permitted on FS order update. | `firestore.rules:90,123`; `AuthContext.tsx:461`; `AdminPortal.tsx:408` |

### 4.3 Booking / Reservation Fields (`bookings/{bookingId}`, `AdminReservation`, `ReservationRequest`) — 17 Fields
*Note: Blueprint + rules exist for Firestore `/bookings/{bookingId}`, but `saveBookingRecord` never writes to Firestore.*

| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `booking.id` | Firestore optional `string` / JSON `string` | No | No | `'BK-' + 6 digits` | Required by `loadStore()` (`r && r.id`). | `firebase-blueprint.json:29`; `server.ts:741,2037` |
| `booking.userId` | Firestore optional `string` (`0..128`) / JSON optional `string` | **No** in FS | **No** in FS (`""` vs `'guest'`) | `'guest'` (anonymous reservation) | Express defaults unauthenticated booking to `'guest'`; authenticated attaches `uid`. | `firestore.rules:65,111`; `server.ts:2012,2048` |
| `booking.name` | Firestore `string` (`1..100`) / JSON `string` | No | **Bug:** whitespace passes API -> `""` | None | `POST /api/reservations` checks `!name` before `.trim()`; `BookingModal` requires `name.trim()`. | `firestore.rules:58`; `server.ts:2000,2049`; `BookingModal.tsx:128` |
| `booking.phone` | Firestore `string` (`1..20`) / JSON `string` | No | **Bug:** whitespace passes API -> `""` | None | Same whitespace bypass on Express; `BookingModal` requires 10 digits. | `firestore.rules:59`; `server.ts:2000,2050`; `BookingModal.tsx:133` |
| `booking.address` | Firestore optional `string` (`0..250`) / JSON `string` | **No** in FS | Yes in Express (`""`) | `""` | Trimmed on Express (`String(address \|\| '').trim()`); required in `BookingModal` UI. | `firestore.rules:60`; `server.ts:2051`; `BookingModal.tsx:139` |
| `booking.bookingType` | Firestore enum / JSON `string` | No | No (`""` -> `'dining'`) | `'dining'` | FS restricts to `['dining', 'ps5', 'pool', 'combo_deal']`; Express accepts arbitrary string if non-empty (`String(bookingType \|\| 'dining')`). | `firestore.rules:61`; `server.ts:2004,2052` |
| `booking.poolDuration` | **Untyped** in FS `hasOnly`; **missing** from Blueprint; JSON `'15min' \| '30min'` | **Absent** if not `'pool'` | Omitted unless `'pool'` & `'15min'/'30min'` | `undefined` (omitted) | Omitted from JSON object unless `bookingType === 'pool'` and value is `'15min'` or `'30min'`. `BookingModal` requires selection when `pool`. | `firestore.rules:55`; `firebase-blueprint.json:24-43`; `server.ts:2005-2008,2053`; `BookingModal.tsx:123` |
| `booking.date` | Firestore `string` (`1..20`) / JSON `string` | No | No (`""` -> today UTC) | Today's UTC `YYYY-MM-DD` | `String(date \|\| today)`. UI defaults to UTC `today`. | `firestore.rules:62`; `server.ts:2054`; `BookingModal.tsx:52` |
| `booking.timeSlot` | Firestore `string` (`1..20`) / JSON `string` | No | No (`""` -> `'07:30 PM'`) | `'07:30 PM'` (server) / `'07:00 PM'` (UI) | Different defaults between backend (`07:30 PM`) and UI (`07:00 PM`). | `firestore.rules:63`; `server.ts:2055`; `BookingModal.tsx:53` |
| `booking.guests` | Firestore optional `number` (`1..30`) / JSON `number` | **No** in FS (`null` fails `is number`) | N/A | `2` (`Number(guests) \|\| 2`) | Express `\|\|` turns `0`, `null`, `""`, `false`, `"abc"` into `2`; passes negative integers (`-5`). UI accepts only `2` or `4` (`null` initial state). | `firestore.rules:66`; `server.ts:2056`; `BookingModal.tsx:54,144` |
| `booking.specialRequests` | Firestore optional `string` (`0..300`); **ignored by Express** | **No** in FS | Yes | None (not saved by Express) | `BookingModal` sends trimmed `specialRequests` in payload, `server.ts:1999` destructures & discards it; only forwarded in WhatsApp text. | `firestore.rules:67`; `server.ts:1999,2046-2066`; `BookingModal.tsx:171,209` |
| `booking.is18Confirmed` | Firestore literal `true`; **ignored by Express** | No | N/A | None (not stored on `AdminReservation`) | Not validated or stored by `POST /api/reservations` (though `AdminPortal` hardcodes rendering `"18+ Verified"`). | `firestore.rules:64`; `server.ts:1999,2046-2066`; `AdminPortal.tsx:1837` |
| `booking.voucherCode` | **Absent** in FS/Blueprint; JSON optional `string` | Omitted if unused | Trimmed uppercase (`""` treated as none) | `undefined` | Validated for ownership (`userId`), `status === 'active'`, and category match. Rejects guest (`401`). | `firestore.rules:53-57`; `server.ts:2014-2035,2059` |
| `booking.discountAmount` | **Absent** in FS/Blueprint; JSON optional `number` | Omitted if no voucher | N/A | `undefined` | Derived from `appliedVoucher.discountAmount` (`50`, `60`, `100`, `150`). | `server.ts:2060`; `ProfileModal.tsx:1054` |
| `booking.rewardTitle` | **Absent** in FS/Blueprint; JSON optional `string` | Omitted if no voucher | N/A | `undefined` | Derived from `appliedVoucher.title`. | `server.ts:2061` |
| `booking.status` | **Absent** in FS/Blueprint; JSON enum (`3` vals) | No | Ignored in PATCH if invalid | `'Confirmed'` | Express sets `'Confirmed'`; Admin PATCH accepts `['Confirmed', 'Completed', 'Cancelled']`. | `firestore.rules:53-57`; `server.ts:494,1561,2064` |
| `booking.createdAt` | Firestore optional `string` (`0..50`) / JSON `string` | **No** in FS | Allowed by rule | `nowIso` | Server-generated ISO timestamp. | `firestore.rules:68`; `server.ts:2065` |

### 4.4 Loyalty Reward Vouchers (`userRewards` / `LoyaltyRewardVoucher`) — 10 Fields
*Note: Stored exclusively in Express `userRewards` array & `/tmp/hs_venue_store.json` (max 500); never stored in Firestore.*

| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `voucher.id` | JSON `string` | No | No | `'REW-' + ts + '-' + hex` | Required by `loadStore()` filter (`v && v.id`). | `server.ts:748,1269` |
| `voucher.userId` | JSON `string` | No | Dropped on `loadStore()` | Authenticated `uid` | Required by `loadStore()` (`Boolean(v.userId)`) and filtered in `computeUserLoyalty`. | `server.ts:641,748,1270` |
| `voucher.code` | JSON `string` | No | No | `'HS-<PREFIX>-<HEX4>'` | Matched case-insensitively on reservation (`trim().toUpperCase()`). | `server.ts:748,1271,2022` |
| `voucher.rewardId` | JSON `string` | No | No | Matched from catalog | Must match `LOYALTY_REWARDS_CATALOG`. | `server.ts:1247,1272` |
| `voucher.category` | JSON `'dining'\|'ps5'\|'pool'\|'any'` | No | No | From catalog | `'any'` matches any `bookingType`; otherwise must equal `normalizedType`. | `server.ts:1274,2030` |
| `voucher.discountAmount` | JSON `number` | No | N/A | From catalog (`50/60/100/150`) | Added to `AdminReservation.discountAmount` on redemption. Rendered with `\|\| 0`. | `server.ts:1275,2060`; `ProfileModal.tsx:1054` |
| `voucher.pointsCost` | JSON `number` | No | N/A | From catalog (`50/60/95/140`) | Deducted via `calculateLoyaltyFromOrders`; guards `availablePoints < pointsCost`. | `server.ts:1253,1276`; `src/lib/loyalty.ts:122` |
| `voucher.status` | JSON `'active' \| 'used'` | No | No | `'active'` | Transitions one-way `'active'` -> `'used'` when reservation commits. | `server.ts:1277,2027,2041` |
| `voucher.usedBookingId` | JSON optional `string` | Absent while `'active'` | Never written empty | `undefined` (omitted) | Set on redemption in `POST /api/reservations`. UI renders `'Booked'` fallback if falsy. | `server.ts:2042`; `ProfileModal.tsx:939` |
| `voucher.usedAt` | JSON optional `string` | Absent while `'active'` | Never written empty | `undefined` (omitted) | ISO timestamp set when status flips to `'used'`. | `server.ts:2043` |

### 4.5 Catalog Items, Gaming Rates & Cart (`CatalogItem`, `GamingRates`, `CartItem`) — 11 Fields
*Note: Stored in Express memory & `/tmp/hs_venue_store.json`; initialized from `src/data/catalogData.ts`.*

| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `catalogItem.name` | JSON `string` | No | No (POST rejects whitespace; PATCH ignores `""`) | None | PATCH skips empty/non-string; POST returns `400` on `!name.trim()`. | `server.ts:1722,1747,1763` |
| `catalogItem.price` | JSON `number` | No | **Bug:** PATCH converts `null`/`""`/`false` -> `0`; POST rejects `<= 0` | None | PATCH checks `price !== undefined` then `Number(price) >= 0`; allows `₹0` or `null`->`0`. | `server.ts:1723-1729, 1750-1753` |
| `catalogItem.description` | JSON `string` | No | Yes in PATCH (`""`); defaulted in POST | `'Freshly prepared to order in our Bansberia kitchen.'` (POST) | `POST` uses `String(description \|\| ...)` (treats `""` as missing); `PATCH` allows `""`. | `server.ts:1730,1765` |
| `catalogItem.isVeg` | JSON `boolean` | No | N/A | `false` (`Boolean(isVeg)`) | PATCH updates only if `typeof isVeg === 'boolean'`. | `server.ts:1734,1766` |
| `catalogItem.isSpicy` | JSON `boolean` (optional in `MenuItem`) | Absent on `MenuItem`, `boolean` on `CatalogItem` | N/A | `false` (`Boolean(isSpicy)`) | `Boolean()` coerces missing/`undefined` to `false`. | `src/types.ts:24`; `server.ts:1735,1767` |
| `catalogItem.inStock` | JSON `boolean` | **No**, though missing treated as `true` | N/A | `true` | Everywhere checked via `it.inStock !== false` (`undefined`/`null` = Available). | `server.ts:1736,1769,1824,1850,1878`; `BookMenu.tsx:103`; `AdminPortal.tsx:2087` |
| `catalogItem.imageKey` | JSON enum (`6` keys) | No | Ignored/defaulted | `chapterMeta.defaultImageKey` | Falls back to chapter default in POST; ignored if invalid in PATCH; client defaults unknown keys to `'tandoor'`. | `server.ts:1737,1756`; `src/lib/imageTransform.ts:132` |
| `gamingRates.pool15Price` | JSON `number` | No | **Bug:** PATCH accepts `null`/`""` as `0`, then **wiped by `\|\|` on reload** | `60` (`DEFAULT_GAMING_RATES`) | `loadStore()` & `CatalogContext.refreshCatalog()` use `Number(...) \|\| 60`, erasing intentional `0`. | `server.ts:757,1790-1796`; `CatalogContext.tsx:48` |
| `gamingRates.pool30Price` | JSON `number` | No | Same `0` / `null` coercion bug | `120` (`DEFAULT_GAMING_RATES`) | Same `\|\|` bug in `loadStore()` & `CatalogContext.refreshCatalog()`. | `server.ts:758,1797-1803`; `CatalogContext.tsx:49` |
| `gamingRates.ps5HourlyPrice` | JSON `number` | No | Same `0` / `null` coercion bug | `200` (`DEFAULT_GAMING_RATES`) | Same `\|\|` bug in `loadStore()` & `CatalogContext.refreshCatalog()`. | `server.ts:759,1804-1810`; `CatalogContext.tsx:50` |
| `cartItem.specialInstructions` | React in-memory state `string \| undefined` | Undefined when omitted | Yes (`""` from ComboCustomizerModal) | `undefined` (BookMenu) / `""` (Customizer) | Truthiness check `it.specialInstructions ? ... : ''` skips empty/undefined cleanly when building order summary. | `src/App.tsx:364-372`; `ComboCustomizerModal.tsx:24,41`; `OrderDrawer.tsx:117` |

### 4.6 Media & Email OTP Challenge Fields (`CustomInstagramVideo`, `EmailOtpChallenge`) — 7 Fields
| Field | Database Type | Nullable | Empty Allowed | Default | Application Behavior | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `customVideo.reelUrl` | JSON `string` | No | No (`""` / invalid scheme rejected `400`) | None | Trimmed; validated with `new URL()` & `http:`/`https:` protocol check. | `server.ts:2464-2477,2496` |
| `customVideo.videoUrl` | JSON optional `string` | Absent when `""`/whitespace/non-string | Coerced to `undefined` | `undefined` (omitted) | Stored only if `typeof videoUrl === 'string' && videoUrl.trim()`. | `server.ts:2497`; `InstagramCarousel.tsx:156` |
| `customVideo.caption` | JSON `string` | No | Replaced with default when `""` or whitespace | `'Fresh kitchen & lounge Reel from @hotandspicy_aa...'` | `String(caption \|\| '').trim() \|\| fallback`. | `server.ts:2498-2500` |
| `customVideo.category` | JSON `string` | No | Replaced with `'Featured Reel'` | `'Featured Reel'` | `String(category \|\| '').trim() \|\| 'Featured Reel'`. Note mapper also has `vid.category \|\| 'Instagram Reel'`. | `server.ts:2360,2501` |
| `customVideo.duration` | JSON optional `string` | No (typed optional, always written) | Replaced with `'0:25'` | `'0:25'` | `parseDurationSeconds(duration)` in UI returns `24` if missing or non-`M:S`. | `server.ts:2502`; `InstagramCarousel.tsx:170-177` |
| `emailOtpChallenge.attempts` | In-memory `Map` integer | No | N/A | `0` (`maxAttempts: 5`) | Incremented on wrong OTP; challenge deleted at `>= maxAttempts` (`429`). | `server.ts:291-292, 1066-1067, 1110-1135` |
| `emailOtpChallenge.expiresAt` | In-memory `Map` epoch ms | No | N/A | `Date.now() + 600000` (10m) | Checked before HMAC compare (`Date.now() > challenge.expiresAt`); purged by 5m interval. | `server.ts:165-167, 295, 1065, 1105-1108` |

---

## 5. API NULL Contracts

### 5.1 Express HTTP Endpoints (`37` API/Health Endpoints + `2` SPA Fallbacks)

#### A. Customer Authentication & Profile Routes
1. **`POST /api/auth/phone`** (`server.ts:789-873`)
   - Request: `{ idToken, mode, name, email, password, address, is18Plus }`. Empty/missing `idToken` -> `400`.
   - New account via `mode: 'signin'` when any of `!cleanName || !cleanEmail || !rawPassword || !is18Plus` -> returns `{ needsRegistration: true, verifiedPhone, uid }` (`200`). Note `!rawPassword` triggers for `""`, `null`, missing, AND whitespace-only? No — `"      "` is truthy in `!rawPassword`, so it bypasses `needsRegistration` and triggers `validateCustomerPassword` (`400`)!
   - Existing account: preserves non-empty `userRecord.name`/`email`/`address`; backfills missing/`""` fields if incoming `cleanName`/`cleanEmail`/`cleanAddress` are truthy (`server.ts:819-821`).
2. **`POST /api/auth/signup`** (`server.ts:875-950`)
   - Request: `{ email, password, name, phone, address, is18Plus, phoneIdToken }`.
   - Mandatory: `email` (trimmed non-empty containing `@`), `name` (trimmed non-empty), `password` (`typeof === 'string' && trim().length >= 6 && length <= 128` — untrimmed spaces allowed around non-space chars and hashed verbatim), `is18Plus` (truthy boolean).
   - Optional: `phone` (coerced to `""` unless `phoneIdToken` provided), `address` (`""`), `phoneIdToken` (if truthy, verified via Firebase REST API).
3. **`POST /api/auth/signin`** (`server.ts:952-1010`)
   - Request: `{ email, password }`. `String(password || '')` rejects empty string `""` (`400`), accepts whitespace-only passwords for verification (`rawPassword` truthy).
4. **`POST /api/auth/forgot-password/request`** (`server.ts:1013-1087`)
   - Request: `{ email }`. Checks `typeof req.body?.email === 'string'` (explicit `null`/number returns `400` rather than `"null"`). Uniform `{ success: true }` response prevents email enumeration for unknown or `PERMANENT_ADMIN_EMAIL` targets.
5. **`POST /api/auth/forgot-password/verify`** (`server.ts:1090-1147`)
   - Request: `{ email, otp }`. Strips non-digits (`otp.replace(/\D/g, '')`), rejects anything not matching `/^\d{6}$/`. Explicit `null`/`""`/non-string returns `400`. Blocks `PERMANENT_ADMIN_EMAIL`.
6. **`POST /api/auth/forgot-password/reset`** (`server.ts:1150-1194`)
   - Request: `{ email, resetToken, newPassword }`. Rejects non-string/`""`/missing fields (`400`); validates `newPassword` via `validateCustomerPassword`; blocks `PERMANENT_ADMIN_EMAIL` (`403`). Consumes single-use `jti` before mutating `passwordHash`.
7. **`GET /api/auth/me`** (`server.ts:1196-1213`)
   - Missing/invalid Bearer token -> `401`. Returns `{ user, bookings, orders, loyalty }`; empty collections returned as `[]`. Syncs `user.*` loyalty properties before `sanitizeUser()`.
8. **`POST /api/auth/loyalty/recalculate`** (`server.ts:1215-1236`)
   - Auth-required (`401`/`404`). Returns freshly recomputed `loyalty` (`{ earnedPoints: 0, ... }` if zero orders), `orders`, and `user`.
9. **`POST /api/rewards/redeem`** (`server.ts:1238-1292`)
   - Request: `{ rewardId }`. Missing/null/empty `rewardId` fails `find()` -> `400 Invalid reward selected.`. Requires backend `availablePoints >= reward.pointsCost`.
10. **`PATCH /api/auth/profile`** (`server.ts:1294-1315`)
    - Request: `{ name, phone, address, is18Plus }`.
    - `name`: updated only if `typeof name === 'string' && name.trim()` (`""`, whitespace, `null`, omitted are **ignored**).
    - `phone` / `address`: updated if `typeof === 'string'` (`""` **clears** existing value; `null` or `undefined` **ignored**; clearing `phone` leaves `phoneVerified: true`).
    - `is18Plus`: updated if `typeof === 'boolean'` (`false` allowed, `null`/`undefined` ignored).

#### B. Admin Auth, Dashboard & Operational Routes
11. **`POST /api/admin/login`** (`server.ts:1330-1356`) — Requires non-empty `email` & `password` (`400` on missing/empty/`null`). No forgot-password flow exists for admin.
12. **`POST /api/admin/change-password`** (`server.ts:1358-1373`) — **No `.trim()`** on `newPassword`: `"      "` (6 spaces) accepted (`ISSUE-04`); non-strings coerced via `String()`.
13. **`GET /api/admin/verify`** (`server.ts:1375-1393`) — Returns `{ authenticated: false }` (`200`) if token missing/invalid/expired; never returns `401`.
14. **`GET /api/admin/stats`** (`server.ts:1396-1493`) — Coerces missing/NaN subtotals via `Number(o.subtotal) || 0`. `avgOrderValue` guards `activeOrders.length > 0 ? ... : 0`. Empty dataset returns `0` counters and `[]` arrays.
15. **`GET /api/admin/orders`** (`server.ts:1496-1498`) — Returns `{ orders: mockOrders }` (`[]` when empty).
16. **`POST /api/admin/orders`** (`server.ts:1500-1527`) — Checks `!customerName || !phone || !itemsSummary` *before* `.trim()` (whitespace stored as `""`). `address` empty -> `'Lounge Table'` or `'Takeaway Counter'`. Invalid `status` -> `'Pending'`. Non-numeric/negative `subtotal` -> `0`. Sets `userId: 'counter'`.
17. **`PATCH /api/admin/orders/:id`** (`server.ts:1529-1547`) — Silently ignores invalid `status`, `null`, negative `subtotal`, or non-numeric `subtotal`; returns `200` on `{}`! Recomputes customer loyalty if `order.userId` is in `customerUsers`.
18. **`GET /api/admin/reservations`** (`server.ts:1550-1552`) — Returns `{ reservations: mockReservations }` (`[]` when empty).
19. **`PATCH /api/admin/reservations/:id`** (`server.ts:1554-1566`) — Ignores any `status` outside `['Confirmed', 'Completed', 'Cancelled']` as a silent `200` no-op.
20. **`GET /api/admin/customers`** (`server.ts:1569-1711`) — Converts `""` phone/address of registered accounts to display literal `'Not provided'` in API response (`server.ts:1605-1606`); guest records with empty phone & empty address receive `'Guest Checkout'`, `'Not provided'`, `'Boropara More, Bansberia'`.
21. **`PATCH /api/admin/catalog/item/:id`** (`server.ts:1714-1743`) — `price !== undefined` allows `price: null`, `""`, `"   "`, `false` -> `Number(price) === 0` (`ISSUE-06`). Empty/whitespace `name` or invalid `imageKey`/`chapter` ignored; `description: ""` clears description.
22. **`POST /api/admin/catalog/item`** (`server.ts:1745-1775`) — Enforces `typeof name === 'string' && name.trim()` and `parsedPrice > 0` (`<= 0` rejected with `400`, unlike PATCH!). Empty `description` replaced with default string.
23. **`DELETE /api/admin/catalog/item/:id`** (`server.ts:1777-1786`) — Returns `404` if missing, `200` + updated catalog otherwise.
24. **`PATCH /api/admin/catalog/gaming`** (`server.ts:1788-1814`) — Same `!== undefined` + `Number()` bug as item PATCH (`null`/`""`/`false` -> `0`, `ISSUE-06`), combined with reload erasure of `0` (`ISSUE-01`).

#### C. Public Catalog, Customer Orders/Bookings, AI Chat, Media & Health Routes
25. **`GET /api/catalog`** (`server.ts:1320-1325`) — Returns `{ items, gamingRates }` (already sanitized through `loadStore()`).
26. **`POST /api/chat`** (`server.ts:1915-1995`) — Checks `!message || typeof message !== 'string'` *before* `.trim()`: `"   "` passes to `buildSmartFallbackReply("")` or Gemini! Invalid/empty `history` turns silently filtered out. Missing `GEMINI_API_KEY` falls back cleanly.
27. **`POST /api/reservations`** (`server.ts:1998-2080`) — Checks `!name || !phone` before `.trim()`. Coerces `address` to `""`, `guests` to `Number(guests) || 2` (`0`/`null`/`false`/`NaN` -> `2`, negatives allowed!), `date` to UTC today, `timeSlot` to `'07:30 PM'`. `voucherCode` empty/missing/non-string skips voucher logic. Unauthenticated requests attach `userId: 'guest'`.
28. **`GET /api/gaming-status`** (`server.ts:2083-2138`) — Treats missing/empty `r.date` as matching today (`!r.date` at `2089`). Compares UTC `todayStr` against IST venue hours (`UTC+5:30`).
29. **`POST /api/orders`** (`server.ts:2141-2180`) — Requires Bearer token (`401`). Checks `!customerName || !phone` before `.trim()`. Allows missing/`""` `address` and `itemsSummary`; allows negative `subtotal` (`Number(-50) || 0 === -50`).
30. **`GET /api/instagram-feed`** (`server.ts:2364-2455`) — Falls back from Graph API (`INSTAGRAM_ACCESS_TOKEN?.trim()`) to `DEFAULT_INSTAGRAM_FEED` on missing token, empty feed, or network failure.
31. **`GET /api/admin/instagram-videos`** (`server.ts:2458-2460`) — Returns `{ videos: customInstagramVideos }`.
32. **`POST /api/admin/instagram-videos`** (`server.ts:2462-2511`) — Empty/invalid `reelUrl` -> `400`. `videoUrl` empty/whitespace/non-string stored as omitted (`undefined`). Empty `caption`, `category`, `duration` fall back to defaults.
33. **`DELETE /api/admin/instagram-videos/:id`** (`server.ts:2513-2523`) — `404` if missing, `200` if deleted.
34. **`GET /api/images/menu/:key`** (`server.ts:2528-2558`) — Unknown key or missing source -> `404`. Query params `w`, `q`, `format` safely clamped/negotiated (`clampWidth(..., 320)`, `clampQuality(..., 82)`, `negotiateFormat(..., accept)` — `null`/`""`/`0` fall back cleanly). ImageMagick failure returns raw JPEG (`res.sendFile`).
35. **`GET /api/images/transform`** (`server.ts:2560-2585`) — Rejects empty `src`, `".."`, `"\0"`, non-allowlisted paths, and non-image extensions with `400`. Same clamped `w` (default `640`), `q` (`82`), `format`.
36. **`GET /healthz`** (`server.ts:2590-2592`) — Always returns `200 { status: 'ok', uptime }`.
37. **`GET /api/health`** (`server.ts:2594-2596`) — Always returns `200 { status: 'ok', uptime }`.
- *Mode-conditional SPA Catch-Alls (`server.ts:2694`, `server.ts:2714`):* Serve `dist/index.html` or transformed dev `index.html` for non-`/api` navigation.

### 5.2 Client-Side Cloud Firestore Operations (6 Code Paths)
1. **`testConnection()`** (`src/firebase.ts:73-86`): `getDocFromServer(doc(db, 'test', 'connection'))` on module load; catches & ignores offline errors (`catch (error)`), ignoring expected `permission-denied` from default-deny rule.
2. **`syncUserProfileToFirestore()`** (`src/context/AuthContext.tsx:95-144`): `setDoc(doc(db, 'users', uid), { ...all 13 allowed keys })` **without `{ merge: true }`**. Coerces empty `name` -> `'Hot & Spicy Guest'`, empty `email` -> `${uid}@guest.local`, empty/undefined `phone`/`address` -> `""`, `is18Plus` -> `Boolean()`, numeric loyalty fields -> `Math.max(0, Math.floor(Number(...) || 0))`. **Fire-and-forget** (`.catch(() => {})`) in `refreshHistory`, `signUpWithEmail`, `saveUserProfile`, `saveBookingRecord`; **awaited & throwing** in `saveOrderRecord`, `recalculateLoyalty`, `redeemReward`.
3. **`saveOrderRecord()`** (`src/context/AuthContext.tsx:446-465`): `await setDoc(doc(db, 'orders', data.orderId), { ...13 keys })`. Uses `userProfile?.uid || 'guest'`, `userProfile?.email || ''`, and raw `order.address` (`""` fails FS `isValidOrder`!). Throws wrapped JSON error string via `handleFirestoreError` on rejection.
4. **`ProfileModal` real-time `onSnapshot`** (`src/components/ProfileModal.tsx:150-187`): Queries `where('userId', '==', userProfile.uid)`. Maps missing `customerName` -> `userProfile.name`, missing `phone` -> `userProfile.phone || ''`, missing `address` -> `userProfile.address || ''`, missing `status` -> `'Pending'`.
5. **`ProfileModal` manual `getDocs`** (`src/components/ProfileModal.tsx:271-302`): Queries same `orders` collection; differs from `onSnapshot` by mapping missing `phone`/`address` -> `''` (never `userProfile`), and invokes `await recalculateLoyalty(docs)` using **only** Firestore docs rather than `mergedOrders`.
6. **`AdminPortal.handleUpdateOrderStatus()`** (`src/components/AdminPortal.tsx:391-415`): Calls `setDoc(doc(db, 'orders', orderId), { ...12 keys }, { merge: true })` substituting `userId: matchedOrder.userId || 'guest'` and `address: matchedOrder.address || 'Bansberia'`. Silently swallows errors (`catch {}`).

---

## 6. Create vs Update Semantics

| Operation | Missing Key Behavior | Explicit `null` Behavior | Empty String `""` Behavior | Whitespace Behavior | Whole-Object vs Partial |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`POST /api/auth/signup`** | Rejects missing `email`, `name`, `password`, `is18Plus` (`400`). Sets `phone`/`address` -> `""`. | Same as missing (`400` for required; `""` for optional `phone`/`address`). | Rejected for `email`/`name`/`password`; stored as `""` for `phone`/`address`. | Rejected for `email`, `name`, `password` (`trim().length < 6`); trimmed to `""` for `phone`/`address`. | Full record create (`StoredUser`). |
| **`PATCH /api/auth/profile`** | Preserves existing field (`undefined` skipped). | Silently ignored (`typeof null !== 'string'` / `'boolean'`). | **Name:** ignored (keeps old). **`phone`/`address`:** overwrites stored value with `""`! | **Name:** ignored (`!name.trim()`). **`phone`/`address`:** trimmed to `""` (`phoneVerified` remains `true`!). | Partial update in Express; triggers **full overwrite** `setDoc` on Firestore `/users/{uid}`. |
| **`POST /api/orders` vs `POST /api/admin/orders`** | User API: rejects missing `customerName`/`phone`, defaults `address`/`itemsSummary` to `""`, `subtotal` to `0`. Admin API: rejects missing `itemsSummary`, defaults `address` by mode. | Treated as missing (`400` on required; `""`/`0` on optional). | Rejected on required (`!x`). User API writes `address: ""` (fails FS). | **Passes `!x` guard** on both endpoints, then `.trim()` writes `""` (`ISSUE-04`). | Full `AdminOrder` create (`userId` = Bearer `uid` vs `'counter'`). |
| **`PATCH /api/admin/orders/:id`** | Preserves existing `status` and `subtotal` (`200` on `{}`). | Ignored safely (`includes(null)` false, `typeof null !== 'number'`). | Ignored safely. | Ignored safely. | Partial Express update; **broken** in `AdminPortal` Firestore `setDoc(..., { merge: true })` (`ISSUE-03`). |
| **`POST /api/reservations` vs `PATCH /api/admin/reservations/:id`** | POST defaults `bookingType` (`'dining'`), `poolDuration` (omitted), `date` (UTC today), `timeSlot` (`'07:30 PM'`), `guests` (`2`), `address` (`""`). | Same as missing (`guests: null` -> `2`, `voucherCode: null` skipped). | Required `name`/`phone` reject `""`; `address: ""` kept; `guests: ""` -> `2`; `date: ""` -> today. | **Passes `!name \|\| !phone`**, stored as `""`. | POST creates full `AdminReservation`; PATCH updates `status` only. |
| **`POST /api/admin/catalog/item` vs `PATCH /api/admin/catalog/item/:id`** | POST requires `name` & `price > 0`; defaults `description` & `isVeg`/`isSpicy`. PATCH updates only `!== undefined` fields. | POST rejects `price: null` (`<= 0`). **PATCH sets `price = 0`** (`Number(null) === 0`)! | POST replaces `description: ""` with default; rejects `name: ""`. **PATCH sets `price = 0`** on `""`, allows `description: ""`, ignores `name: ""`. | POST rejects whitespace `name`. **PATCH turns `"   "` price into `0`** (`Number("   ") === 0`). | POST creates full `CatalogItem`; PATCH mutates provided fields. |
| **`PATCH /api/admin/catalog/gaming`** | Preserves existing rate when `=== undefined`. | **Sets rate to `0`** (`Number(null) === 0`), then erased on restart (`loadStore()` `\|\|`). | **Sets rate to `0`**, then erased on restart (`\|\|`). | **Sets rate to `0`**, then erased on restart (`\|\|`). | Partial update on Express `gamingRates` singleton. |
| **`POST /api/auth/forgot-password/*`** | Rejects (`400`) on `request`/`verify`/`reset`. | Rejected (`400`, uses strict `typeof === 'string'`). | Rejected (`400`). | Rejected (`400` on `email`/`otp`/`newPassword`). | Stateful 3-step challenge -> single-use token -> overwrite `passwordHash`. |

---

## 7. Query & Filtering Risks

1. **`loadStore()` Silent Record Eviction (`server.ts:734, 741, 748`):**
   - `raw.orders.filter(o => o && o.id && Boolean(o.userId) && ...)` (and identically for `reservations` and `userRewards`) silently deletes any persisted record whose `userId` is `""`, `null`, or missing on restart, then re-persists the truncated array (`needsResave = true`).
2. **`/api/gaming-status` Empty-Date Overcounting & UTC/IST Skew (`server.ts:2086-2106`):**
   - `activeBookings = mockReservations.filter((r) => r.status === 'Confirmed' && (r.date === todayStr || !r.date))`. Any reservation with `date: ""` or missing `date` permanently counts as occupying a station on *every* future day.
   - `todayStr` uses UTC (`new Date().toISOString().split('T')[0]`) while `isOpenHours` converts to IST (`UTC+5:30`); between `00:00 IST` and `05:29 IST` (`18:30`–`23:59 UTC`), `todayStr` lags by 1 day compared to IST bookings. Same UTC `todayKey` skew occurs in `/api/admin/stats` (`server.ts:1405-1426`).
3. **`/api/admin/stats` & `/api/admin/customers` Deduplication Collisions (`server.ts:1458-1469, 1620-1656`):**
   - Walk-in orders (`userId: 'counter'`) and guest bookings (`userId: 'guest'`) with short/missing phones (`digits.length < 10`) are keyed by `guest:${name.toLowerCase().trim()}`. Two different guests with whitespace/empty names collide into a single `"guest:"` bucket; `"Rahul"` and `"Rahul "` merge, while `"Rahul Kumar"` stays separate.
   - Top-item analytics parse `itemsSummary` via regex `/^\s*(?:\d+\.\s*)?(.+?)\s+x(\d+).*?-\s*₹(\d+)/i`; custom or manually typed walk-in summaries lacking `xN ... - ₹Total` are silently omitted from `topItems`.
4. **Menu & Chat Stock Filtering (`BookMenu.tsx:103`, `AdminPortal.tsx:2087`, `server.ts:1824, 1850, 1878`):**
   - All layers check `it.inStock !== false`. This consistently treats `true`, `undefined`, and `null` as **In Stock**, avoiding mismatches, though an accidentally non-boolean `"false"` string would remain visible as available.
5. **Identity Lookup Guards (`findUserByEmail`, `findUserByPhone`, `server.ts:571-587`):**
   - `findUserByEmail` checks `if (!clean) return undefined` so empty-email accounts cannot match empty login input (preventing `"" === ""` cross-account takeover).
   - `findUserByPhone` checks `if (target.length < 10) return undefined`, preventing short/empty numbers from colliding.
6. **Firestore Query Scoping (`ProfileModal.tsx:155, 276` & `firestore.rules:119`):**
   - `where('userId', '==', userProfile.uid)` relies on `userProfile.uid` being a non-empty string (`1..128` chars) matching `firestore.rules:119`. If an unauthenticated/null `uid` triggered a query without the `if (!isOpen || !userProfile?.uid) return` guard, Firestore would deny it (`allow list` rejects missing/`""`/`null` `userId`).

---

## 8. Frontend Rendering Semantics

| Component / Location | Input Value States | Rendered / Functional Behavior | Assessment |
| :--- | :--- | :--- | :--- |
| **`ProfileModal.tsx`** (`400-421, 524-550, 632-648, 939, 981-1017, 1040-1055, 1104-1170`) | `phone: ""/undefined`, `address: ""/undefined`, `email: ""`, `availablePoints: 0`, `is18Plus: false`, `usedBookingId: undefined`, `discountAmount: undefined` | Displays `'Not set'` for empty `phone`, `'No address saved'` for empty `address`, `'Not yet confirmed'` for `is18Plus: false`, `0 Pts` properly for zero, `'Booked'` for missing `usedBookingId`, `-₹0` for falsy `discountAmount`. Uses `{effectiveLoyalty.earnedPoints}` (never skips `0`). | **Notice:** At line `420`, `userProfile.email \|\| userProfile.phone \|\| 'Verified Guest'` handles empty email, whereas line `529` renders `{userProfile.email}` raw (blank cell if `""`). Line `793` renders green `<CheckCircle2>` icon even when `rewardFeedback.type === 'error'`. |
| **`AuthModal.tsx`** (`183-204, 307-354, 393-400, 425-511`) | `""`, whitespace, `0`, `false` | Sign-up and new-phone completion enforce `password.trim().length >= 6` & `confirmPassword === password`. Resets all fields on modal open/close; resets Forgot Password state on mode switch. Email Sign-In checks `!password` (truthy whitespace submitted to backend). | Cleanly enforces non-optional password across both Email Signup and Phone-OTP registration. |
| **`OrderDrawer.tsx`** (`62-73, 84-109`) | Prefill `userProfile.X`, `items: []`, `subtotal: 0` | Prefills using `setCustomerName(prev => prev \|\| userProfile.name)` (if user entered `"   "` before signing in, `prev` is truthy so prefill skips!). Guards empty cart (`items.length === 0`) and trimmed fields. WhatsApp button disables while submitting. | Minor prefill quirk with `"   "`; safe against `""`/missing profile fields. |
| **`BookingModal.tsx`** (`47-76, 123-152, 242-249`) | `guests: null \| 2 \| 4`, `poolDuration: '' \| '15min' \| '30min'`, `voucherCode: ''` | Requires explicit selection of `guests` (`2` or `4`, starts `null`) and `poolDuration` when `bookingType === 'pool'`. Automatically clears `selectedVoucherCode` (`''`) if user switches `bookingType` away from a category-locked voucher (`lines 99-103`). Prefills unconditionally on open (`wasOpenRef`). | Strong explicit state checks (`guests !== 2 && guests !== 4`), avoiding `0`/falsy confusion. |
| **`AdminPortal.tsx`** (`1813-1833, 1917-1948, 2087, 2753-2783`) | `gamingRates` = `0`, `order.address` = `""`, `customer.email` = `""` | Gaming inputs use `min={0}` (`line 1917,1932,1947`). Customer directory renders `cust.email \|\| 'Phone-only account'` (`not null-safe if 'Guest Checkout'` string used). Receipt renders `{receiptOrder.address}` blank if empty. | Status badge lookup (`BOOKING_STATUS_BADGE[resv.status]`) assumes valid status enum without fallback. |
| **`CatalogContext.tsx`** (`46-52, 65-70`) | `gamingRates.pool15Price: 0` | `refreshCatalog()` overwrites `0` with `60/120/200` via `Number(...) \|\| DEFAULT`; `applyCatalogSnapshot()` sets `nextRates` directly without `\|\|` — diverging immediately after Admin save vs page reload. | Confirmed Bug (`ISSUE-01`). |
| **`GamingLounge.tsx` & `Footer.tsx`** | `gamingRates.pool15Price: 0`, `gamingStatus` | Displays `₹{gamingRates.pool15Price}` cleanly for `0` when in state; defaults initial `gamingStatus` until `/api/gaming-status` resolves. | Renders `0` properly while snapshot persists. |
| **`InstagramCarousel.tsx`** (`155-184, 320-326, 617`) | `thumbnailUrl: undefined`, `mediaUrl: undefined`, `views: 0 \| undefined`, `duration: undefined` | `typeof post.views === 'number'` properly renders `0` views rather than hiding `0`! `parseDurationSeconds` defaults invalid/missing duration to `24`. | Explicit `typeof === 'number'` check avoids falsy-zero UI drop. |
| **`OptimizedImage.tsx` & `imageTransform.ts`** | Invalid `imageKey`, `preset: undefined`, server `options` | `IMAGE_ASSET_REGISTRY[key] \|\| IMAGE_ASSET_REGISTRY.tandoor` silently substitutes `tandoor` image on bad key; `preset` defaults to `'card'`. `buildServerTransformUrl` uses `??` (`width ?? 640`, `quality ?? 82`), preserving `0` before server clamps `0` back to fallback (`640`). | Safe visual fallback on client; `404` on `/api/images/menu/:key` for bad key. |
| **`ToastContext.tsx` & `ToastViewport.tsx`** | `durationMs: 0 \| undefined`, `description: undefined`, `action: undefined` | `Math.max(1500, options.durationMs ?? 3800)` safely uses `??` so `undefined`->`3800` and `0`->`1500`. Conditionally omits `<p>` and action button when `description`/`action` falsy (`""` or `undefined`). | Proper use of `??` for numeric defaults. |
| **`SpicyBot.tsx`** (`47-84`) | `message: "   "`, failed API `reply: undefined` | Client trims `rawInput.trim()` and aborts if empty (`!text \|\| isLoading`). Falls back to friendly text if response lacks `data.reply`. | Protects UI from whitespace messages (unlike direct `POST /api/chat` callers). |

---

## 9. Identified Issues

### ISSUE-01 — Zero (`0`) Gaming Rates Silently Overwritten by `||` Default Fallbacks
- **Severity:** High
- **Affected Files & Locations:** `server.ts:756-760`; `src/context/CatalogContext.tsx:47-51`
- **Actual Observed Behavior:** When an admin sets `pool15Price`, `pool30Price`, or `ps5HourlyPrice` to `0` (e.g., a free promo tournament) via `PATCH /api/admin/catalog/gaming` (`server.ts:1792` explicitly allows `>= 0` and `AdminPortal.tsx:1917,1932,1947` sets `min={0}`), it saves `0` to `/tmp/hs_venue_store.json`. However, on any client page reload (`CatalogContext.tsx:48-50`) or server restart (`loadStore()` at `server.ts:757-759`), `Number(val) || DEFAULT_GAMING_RATES...` evaluates `0 || 60` -> `60`, silently discarding `0`.
- **Expected Behavior:** Explicit `0` must be preserved via `Number.isFinite(n) && n >= 0` or nullish coalescing (`??`) across both `loadStore()` and `CatalogContext.refreshCatalog()`.
- **Root Cause:** Conflating numeric `0` with `NaN`/`undefined` using JavaScript logical OR (`||`) instead of finiteness + nullish checks.
- **Potential Impact:** Free/zero-rupee promotional gaming sessions revert unannounced to standard paid pricing on browser refresh or server restart, while showing ₹0 during the admin's active tab via `applyCatalogSnapshot`.
- **Supporting Evidence:** `server.ts:757`: `pool15Price: Number(raw.gamingRates.pool15Price) || DEFAULT_GAMING_RATES.pool15Price`; `CatalogContext.tsx:48-50` identical expression; contrast with `server.ts:1792`: `if (!Number.isFinite(val) || val < 0)`.

### ISSUE-02 — Split-Brain Persistence Between Ephemeral `/tmp` Store and Cloud Firestore Causes Loyalty Drift & Redemption Failure
- **Severity:** High
- **Affected Files & Locations:** `server.ts:534, 638-647, 722-751, 1252-1257`; `src/context/AuthContext.tsx:448-510, 515-575`; `src/components/ProfileModal.tsx:189-248, 295`
- **Actual Observed Behavior:**
  1. `ProfileModal` merges backend `userOrders` (`/tmp/hs_venue_store.json`) with Firestore `orders` (`mergedOrders`, `ProfileModal.tsx:189-200`) and automatically pushes the higher calculated points to Firestore `/users/{uid}` (`ProfileModal.tsx:223-248`). Yet `POST /api/rewards/redeem` (`server.ts:1252`) computes `availablePoints` **strictly** from Express `mockOrders`. If `/tmp/hs_venue_store.json` is evicted on container restart (or orders were truncated past the 250-item cap at `server.ts:687`), UI displays positive redeemable points and enables Redeem buttons, while `/api/rewards/redeem` returns HTTP `400 ("You need X more loyalty points...")`.
  2. Furthermore, `handleManualRefreshOrders` (`ProfileModal.tsx:295`) calls `await recalculateLoyalty(docs)` passing **only** Firestore `docs` instead of `mergedOrders`, temporarily overwriting loyalty with Firestore-only totals if any backend order failed to mirror to Firestore.
- **Expected Behavior:** Single authoritative order ledger (or server-side Firestore reconciliation) shared by balance display and voucher redemption, and consistent passing of `mergedOrders` during manual refresh.
- **Root Cause:** Dual write (`fetch('/api/orders')` + client `setDoc(db, 'orders', ...)`) with no backend Firestore read/write integration, combined with ephemeral `/tmp` file storage.
- **Potential Impact:** Customers lose order history/vouchers or receive contradictory "Available Points" vs "Insufficient points" errors after server restarts.
- **Supporting Evidence:** `server.ts:534` (`STORE_FILE = '/tmp/hs_venue_store.json'`), `server.ts:639` (`mockOrders.filter(...)`), `ProfileModal.tsx:189-200` (`mergedOrders`), `ProfileModal.tsx:295` (`await recalculateLoyalty(docs)`).

### ISSUE-03 — `AdminPortal.handleUpdateOrderStatus` Violates Firestore `affectedKeys()` Rule and Fails Silently
- **Severity:** High
- **Affected Files & Locations:** `src/components/AdminPortal.tsx:394-415`; `firestore.rules:121-123`; `src/components/ProfileModal.tsx:194-196`
- **Actual Observed Behavior:** When an admin updates an order status, `AdminPortal.tsx:394-411` performs `setDoc(doc(db, 'orders', orderId), { id, userId: matchedOrder.userId || 'guest', customerName, phone, address: matchedOrder.address || 'Bansberia', diningMode, itemsSummary, subtotal, status, is18Confirmed: true, createdAt, updatedAt }, { merge: true })`. Meanwhile `firestore.rules:123` enforces `incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])`. Whenever the existing Firestore document had `customerEmail` (`""` or non-empty from `AuthContext.tsx:451` — missing from AdminPortal's payload? Wait: `{ merge: true }` preserves omitted `customerEmail`, **but** if `matchedOrder.address` was `""` or differed from stored `address`, or if `matchedOrder` lacked `userId` and substituted `'guest'`, `affectedKeys()` includes `'address'` or `'userId'`!). Firestore rejects the write with `PERMISSION_DENIED`, and the `catch {}` block at `AdminPortal.tsx:413-415` silently ignores it.
- **Expected Behavior:** Partial update touching **only** `{ status, updatedAt }` via `updateDoc` (or matching existing keys identically).
- **Root Cause:** Substituting default fallbacks (`|| 'guest'`, `|| 'Bansberia'`) inside a full-document `setDoc(..., { merge: true })` against a strict `affectedKeys().hasOnly(['status', 'updatedAt'])` security rule.
- **Potential Impact:** Because `ProfileModal` (`194-196`) lets `firestoreOrders` overwrite `userOrders`, customers continue seeing stale `Pending` status in live Firestore tracking even after Admin marked it `Preparing` or `Completed`.
- **Supporting Evidence:** `AdminPortal.tsx:398,401,410,413-415`; `firestore.rules:121-123`.

### ISSUE-04 — Whitespace-Only Strings Bypass Required Presence Checks on Orders, Reservations, Chat, and Admin Password Change
- **Severity:** High
- **Affected Files & Locations:** `server.ts:1360-1370, 1502-1519, 1917-1925, 2000-2051, 2143-2160`
- **Actual Observed Behavior:**
  - `POST /api/orders` (`2143`), `POST /api/reservations` (`2000`), and `POST /api/admin/orders` (`1502`) check `if (!customerName || !phone)` / `if (!name || !phone)` **before** `.trim()`. Sending `{ customerName: "   ", phone: "   " }` passes validation, `.trim()` converts them to `""`, and corrupt blank records are persisted (`mockOrders`/`mockReservations`).
  - `POST /api/chat` (`1917`) checks `if (!message || typeof message !== 'string')` before `.trim()`, passing `""` to Gemini / `buildSmartFallbackReply`.
  - `POST /api/admin/change-password` (`1366-1367`) checks `String(newPassword).length < 6` without `.trim()`, allowing an all-whitespace password like `"      "` (6 spaces) to become the active admin password.
- **Expected Behavior:** Validate trimmed string content (`typeof x === 'string' && x.trim().length > 0`) on all required text inputs, and reject all-whitespace passwords (`trim().length < 6`).
- **Root Cause:** Applying truthiness checks to untrimmed inputs and `.trim()` only afterwards during assignment.
- **Potential Impact:** Corrupted `""` customer/phone records in backend store (and `PERMISSION_DENIED` on Firestore `/orders`), meaningless AI calls, and weak whitespace-only admin credentials.
- **Supporting Evidence:** `server.ts:1502-1515`: `if (!customerName || !phone || !itemsSummary)` followed by `String(customerName).trim()`. Identical pattern at `2000`/`2049`, `2143`/`2158`, `1917`/`1921`, and `1366-1367`.

### ISSUE-05 — `POST /api/orders` Accepts Empty `address` and Negative `subtotal` Rejected by Firestore `isValidOrder`
- **Severity:** High
- **Affected Files & Locations:** `server.ts:2160-2163`; `src/context/AuthContext.tsx:433-465`; `firestore.rules:83, 86`; `OrderDrawer.tsx:100`
- **Actual Observed Behavior:** `POST /api/orders` converts missing/`""` `address` to `""` (`server.ts:2160`) and computes `subtotal: Number(subtotal) || 0` (`server.ts:2163`), which persists negative numbers (e.g., `-500`). Meanwhile `firestore.rules:83` strictly requires `data.address.size() > 0` and `firestore.rules:86` requires `data.subtotal >= 0 && data.subtotal <= 500000`. Note `/api/admin/stats` sums negative `subtotal` directly (`1401`) without `Math.max(0, ...)`.
- **Expected Behavior:** Express `POST /api/orders` should validate non-empty trimmed `address` (`>= 1` char) and finite non-negative bounded `subtotal` (`0 <= subtotal <= 500000`) to match Firestore rules.
- **Root Cause:** Unchecked `Number()` and permissive fallback `""` on Express route compared to strict Firestore CEL rules.
- **Potential Impact:** API vs Firestore partial write failure (order saved to Express store, `setDoc` throws `PERMISSION_DENIED` in `AuthContext.saveOrderRecord`), plus corrupted negative revenue in Admin Analytics if called directly.
- **Supporting Evidence:** `server.ts:2160, 2163`; `firestore.rules:83, 86`; `AuthContext.tsx:454, 457`.

### ISSUE-06 — `Number()` Coerces Explicit `null`, `""`, `"   "`, and `false` to `0` on Admin Price PATCH Endpoints
- **Severity:** Medium
- **Affected Files & Locations:** `server.ts:1723-1729, 1790-1810`
- **Actual Observed Behavior:** `PATCH /api/admin/catalog/item/:id` and `PATCH /api/admin/catalog/gaming` guard updates with `if (price !== undefined)`. When a client sends `null`, `""`, `"   "`, or `false`, `!== undefined` is `true`, and `Number(null) === 0`, `Number("") === 0`, `Number("   ") === 0`, `Number(false) === 0`. All pass `Number.isFinite(val) && val >= 0`, silently changing item prices or gaming rates to `₹0` (while `POST /api/admin/catalog/item` rejects `<= 0`).
- **Expected Behavior:** Reject `null`, booleans, and empty/non-numeric strings (e.g., `typeof val === 'number'` or non-empty numeric string check, returning `400`).
- **Root Cause:** Checking only `!== undefined` and trusting JavaScript's `Number()` conversion on `null`/`""`/`false`.
- **Potential Impact:** Accidental `₹0` menu item pricing via malformed PATCH payloads or API clients sending `null`/`""`.
- **Supporting Evidence:** `server.ts:1723-1725`: `if (price !== undefined) { const parsedPrice = Number(price); if (!Number.isFinite(parsedPrice) || parsedPrice < 0) ... }`. Identical at `1790-1810`.

### ISSUE-07 — Synthetic Email Coercion (`${uid}@guest.local`) Causes Cross-Layer Identity Mismatch
- **Severity:** Medium
- **Affected Files & Locations:** `src/context/AuthContext.tsx:129`; `firestore.rules:38`; `server.ts:980-994`; `src/components/ProfileModal.tsx:529`
- **Actual Observed Behavior:** `firestore.rules:38` requires `data.email is string && data.email.size() > 0`. To satisfy this rule for any user lacking an email string (e.g., legacy/partial records), `syncUserProfileToFirestore` coerces empty `email` into `${profile.uid}@guest.local` in Firestore `/users/{uid}`, while Express `/tmp/hs_venue_store.json` stores `""` and `ProfileModal.tsx:529` renders blank `""`. Conversely, `saveOrderRecord` writes `customerEmail: ""` to `/orders/{orderId}` (`AuthContext.tsx:451`).
- **Expected Behavior:** Express and Firestore schemas should agree on whether `email` is mandatory or nullable/optional, without fabricating undeliverable `.local` addresses.
- **Root Cause:** Rule workaround in client Firestore sync (`129`) to prevent `PERMISSION_DENIED` on legacy empty-email profiles.
- **Potential Impact:** Divergent email representations across Firestore `/users`, Firestore `/orders`, Express store, and React UI.
- **Supporting Evidence:** `AuthContext.tsx:129`: `email: (String(profile.email || '').trim() || \`${profile.uid}@guest.local\`).slice(0, 120)`.

### ISSUE-08 — `POST /api/reservations` Silently Converts `guests: 0`, `null`, `""`, `false`, `"abc"` to `2` and Accepts Negative Counts
- **Severity:** Medium
- **Affected Files & Locations:** `server.ts:2056`; `firestore.rules:66`
- **Actual Observed Behavior:** `guests: Number(guests) || 2` treats `0`, `null`, `""`, `false`, and `NaN` (`"abc"`) identically as `2` guests, while allowing negative numbers like `-5` (because `-5` is truthy!). Meanwhile `firestore.rules:66` enforces `data.guests >= 1 && data.guests <= 30`.
- **Expected Behavior:** Reject invalid or out-of-range guest counts (`< 1` or `> 30` or non-numeric) with `400` when provided, and default only when `guests === undefined`.
- **Root Cause:** Truthy `|| 2` fallback applied to unchecked `Number(guests)`.
- **Potential Impact:** Malformed guest counts (`-5` guests, `"abc"` -> `2`, `0` -> `2`) stored in Express and rendered in `AdminPortal`.
- **Supporting Evidence:** `server.ts:2056`: `guests: Number(guests) || 2`.

### ISSUE-09 — `PATCH /api/auth/profile` Clears `phone` Without Resetting `phoneVerified` and Silently Ignores Empty Name / `null`
- **Severity:** Medium
- **Affected Files & Locations:** `server.ts:1307-1312`; `src/components/ProfileModal.tsx:349-356, 401-405`
- **Actual Observed Behavior:** Sending `{ phone: "" }` or `{ phone: "   " }` in `PATCH /api/auth/profile` clears `matchedUser.phone = ""` **without** setting `matchedUser.phoneVerified = false`. Simultaneously, `ProfileModal.tsx:401` continues rendering the `"Phone Verified"` badge next to an empty/changed phone number! Additionally, `{ name: "" }` or `{ phone: null }` returns `200 OK` while silently ignoring those fields (`typeof null !== 'string'`), and `is18Plus: false` is permitted even though all orders/bookings require `18+`.
- **Expected Behavior:** Reset `phoneVerified = false` whenever `phone` changes or clears; reject invalid empty `name` or explicit `null` with `400` rather than silent `200`.
- **Root Cause:** Missing state-coupling between `phone` and `phoneVerified`, and permissive partial `typeof` checks.
- **Potential Impact:** Misleading `"Phone Verified"` status badge on unverified/empty numbers and silent update drops.
- **Supporting Evidence:** `server.ts:1309`: `if (typeof phone === 'string') matchedUser.phone = phone.trim();` (no `phoneVerified` update); `ProfileModal.tsx:401`.

### ISSUE-10 — Missing or Empty Reservation `date` Always Counts as Occupied in `/api/gaming-status`
- **Severity:** Medium
- **Affected Files & Locations:** `server.ts:2088-2090`
- **Actual Observed Behavior:** `mockReservations.filter((r) => r.status === 'Confirmed' && (r.date === todayStr || !r.date))`. Any confirmed reservation whose `date` is `""`, `null`, or missing matches `!r.date === true` permanently across all future dates. Additionally, `todayStr` uses UTC rather than IST (`UTC+5:30` used at lines `2104-2106`), causing bookings made between `00:00` and `05:29` IST to miss today's capacity count.
- **Expected Behavior:** Enforce non-empty `YYYY-MM-DD` dates aligned to venue timezone (`Asia/Kolkata` / IST) and exclude undated legacy entries.
- **Root Cause:** Fallback `!r.date` clause in filter predicate and mixing UTC `.toISOString()` with IST offset math.
- **Potential Impact:** Phantom occupied Pool tables / PS5 consoles displayed on `GamingLounge` UI.
- **Supporting Evidence:** `server.ts:2086-2106`.

### ISSUE-11 — Unused `/bookings/{bookingId}` Firestore Schema & Rules Drift Against Active Application Data
- **Severity:** Medium
- **Affected Files & Locations:** `src/context/AuthContext.tsx:390-424`; `firebase-blueprint.json:24-43, 58`; `firestore.rules:51-69, 87, 108-114`; `src/types.ts:36-54, 90`
- **Actual Observed Behavior:**
  1. Unlike `saveOrderRecord`, `saveBookingRecord` never writes to Firestore `/bookings/{bookingId}`, leaving that collection empty while security rules and blueprint define it.
  2. `ReservationRequest` & `POST /api/reservations` emit `voucherCode`, `discountAmount`, `rewardTitle`, `status`, and `poolDuration`. Blueprint lacks all 5 fields; `firestore.rules` lacks the first 4 in `hasOnly(...)` and omits type validation on `poolDuration`.
  3. `firebase-blueprint.json:58`, `firestore.rules:87`, and `src/types.ts:90` define order status `'Delivered'`, which Express `AdminOrder` (`server.ts:476, 1507, 1536`) does not accept (ignoring `'Delivered'` in `PATCH`), forcing `ProfileModal.tsx:67` to map `'completed'` -> `'Delivered'`.
- **Expected Behavior:** Synchronize blueprint, rules, Express handlers, and client SDK fields if `/bookings` is intended for Firestore persistence, or remove dead collection drift.
- **Root Cause:** Features added to Express & TypeScript (loyalty vouchers on bookings, `'Completed'` vs `'Delivered'` terminology) without updating `firebase-blueprint.json`, `firestore.rules`, or `AuthContext.saveBookingRecord`.
- **Potential Impact:** Any future code enabling Firestore booking writes for voucher bookings will immediately fail `isValidBooking` `hasOnly()` checks.
- **Supporting Evidence:** `AuthContext.tsx:390-424`; `server.ts:2053-2064`; `firestore.rules:53-57, 87`.

### ISSUE-12 — Asymmetric `ProfileModal` Firestore Mapping & Unhandled Throw vs `.catch(() => {})` on Profile Sync
- **Severity:** Low
- **Affected Files & Locations:** `src/components/ProfileModal.tsx:165-166` vs `283-284`; `src/context/AuthContext.tsx:190, 270, 385, 420` vs `509, 569, 622`
- **Actual Observed Behavior:**
  1. `ProfileModal` `onSnapshot` (`165-166`) falls back missing/empty Firestore `phone`/`address` to `userProfile.phone || ''` and `userProfile.address || ''`, whereas manual `getDocs` (`283-284`) uses `''`.
  2. `AuthContext` silently swallows Firestore sync errors (`.catch(() => {})`) during `refreshHistory`, `signUpWithEmail`, `saveUserProfile`, and `saveBookingRecord`, yet `await`s `syncUserProfileToFirestore` (throwing serialized JSON `handleFirestoreError`) in `saveOrderRecord`, `recalculateLoyalty`, and `redeemReward` — causing an Express-committed order or voucher redemption to surface an error dialog in `OrderDrawer` or `ProfileModal` if Firestore is temporarily unreachable!
- **Expected Behavior:** Consistent order normalization helper and non-fatal Firestore sync error handling once authoritative Express write succeeds.
- **Root Cause:** Inline duplicated mapper callbacks and inconsistent `await` vs `.catch()` across `AuthContext` methods.
- **Potential Impact:** Duplicate/confusing error toast after an order was already logged and charged points on Express.
- **Supporting Evidence:** `ProfileModal.tsx:165-166` vs `283-284`; `AuthContext.tsx:190, 509, 569, 622`.

### ISSUE-13 — Client Form Prefill Whitespace Lock, `CatalogContext` Snapshot Divergence, `Toast` `0ms` Clamp & Image Key Mismatch
- **Severity:** Low
- **Affected Files & Locations:** `src/components/OrderDrawer.tsx:66-70`; `src/context/CatalogContext.tsx:48-50` vs `65-70`; `src/context/ToastContext.tsx:57`; `src/lib/imageTransform.ts:132` vs `server.ts:2530`
- **Actual Observed Behavior:**
  - `OrderDrawer.tsx:66-70` prefills using `setCustomerName(prev => prev || userProfile.name)` so previously typed whitespace `"   "` blocks profile prefill.
  - `CatalogContext.applyCatalogSnapshot` (`65-70`) accepts `0` rates directly, contradicting `refreshCatalog()` (`48-50`) which converts `0` back to defaults.
  - `ToastContext.tsx:57` clamps `durationMs: 0` up to `1500` via `Math.max(1500, 0 ?? 3800)` (intentional minimum visibility, though undocumented).
  - `imageTransform.ts:132` substitutes `'tandoor'` for an unknown `imageKey`, while `GET /api/images/menu/:key` (`server.ts:2530-2533`) returns `404`.
- **Expected Behavior:** Prefill checks `!prev.trim()`, `refreshCatalog` preserves `0`, and image helpers align on valid keys.
- **Root Cause:** Uncoordinated `||` fallbacks and helper duplication.
- **Potential Impact:** Minor UX/UI state inconsistencies.
- **Supporting Evidence:** Exact line references cited above.

---

## 10. Recommended Fixes

*Note: Per audit safety rules, no fixes have been implemented. Confirmed Bugs and Potential Risks are separated clearly.*

### 10.1 Fixes for Confirmed Bugs (`ISSUE-01` through `ISSUE-13`)
1. **`ISSUE-01` (Zero Gaming Rates):** Replace `Number(x) || DEFAULT` in `server.ts:757-759` and `CatalogContext.tsx:48-50` with an explicit helper: `const num = Number(x); return Number.isFinite(num) && num >= 0 ? num : fallback;` (and check `typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')`).
2. **`ISSUE-02` (Loyalty Split-Brain):** Persist orders, reservations, and vouchers via server-side Firebase Admin SDK / Firestore REST API or durable disk outside ephemeral `/tmp`, or reconcile client-reported Firestore orders carefully when computing `redeemReward` eligibility. In `ProfileModal.tsx:295`, build `merged` (`userOrders` + `docs`) before calling `recalculateLoyalty(merged)`.
3. **`ISSUE-03` (Firestore Order Status Sync):** Change `AdminPortal.tsx:394-411` from full-object `setDoc(..., { merge: true })` with synthetic fallbacks to `updateDoc(doc(db, 'orders', orderId), { status, updatedAt: new Date().toISOString() })`, matching `firestore.rules:123` (`hasOnly(['status', 'updatedAt'])`). Inspect permission errors instead of empty `catch {}`.
4. **`ISSUE-04` (Whitespace Bypass):** Validate trimmed strings *before* checking falsiness across `server.ts:1502`, `1917`, `2000`, and `2143` (e.g., `const cleanName = typeof name === 'string' ? name.trim() : ''; if (!cleanName) return 400`). In `POST /api/admin/change-password` (`server.ts:1366`), enforce `validateCustomerPassword(newPassword)` (`.trim().length >= 6`).
5. **`ISSUE-05` (`POST /api/orders` Contract Parity):** Require `cleanAddress.length > 0 && cleanAddress.length <= 250` and `typeof subtotal === 'number' && Number.isFinite(subtotal) && subtotal >= 0 && subtotal <= 500000` in `POST /api/orders` (`server.ts:2141-2166`). Use `Math.max(0, Number(o.subtotal) || 0)` in `/api/admin/stats`.
6. **`ISSUE-06` (`null`/`""`/`false` -> `0` on Admin Price PATCH):** Introduce a strict `parseNonNegativePrice(raw: unknown): number | null` helper rejecting `null`, `boolean`, and `typeof raw === 'string' && !raw.trim()`, only proceeding when `raw !== undefined`.
7. **`ISSUE-07` & `ISSUE-09` (Email Drift & Profile `phoneVerified`):** Decide cleanly if `email` is strictly required across all legacy profiles (if yes, remove `@guest.local` fallback; if no, update `firestore.rules:38` to `size() <= 120`). In `PATCH /api/auth/profile` (`server.ts:1307-1312`), reset `matchedUser.phoneVerified = false` when `phone` is cleared or modified, and return `400` for empty `name` or explicit `null`.
8. **`ISSUE-08` & `ISSUE-10` (Guests & Undated Bookings):** In `POST /api/reservations`, default `guests = 2` **only** when `guests === undefined`, and validate integer `1 <= n <= 30`. In `/api/gaming-status` (`server.ts:2089`), drop `|| !r.date` and compute `todayStr` in `Asia/Kolkata` (`UTC+5:30`).
9. **`ISSUE-11`, `ISSUE-12`, `ISSUE-13`:** Align `Order['status']` enum (`Completed` vs `Delivered`) across Express, Blueprint, and Rules; extract a shared `normalizeFirestoreOrder(docSnap, fallback?)` mapper; surface non-blocking warnings cleanly when Firestore mirror sync fails after Express commit; check `!prev.trim()` in `OrderDrawer.tsx:66-70`.

### 10.2 Mitigations for Architectural Potential Risks (`RISK-01` through `RISK-06`)
1. **`RISK-01` [High] Unauthenticated Write Surface in `firestore.rules`:** `users/{userId}` `allow create`/`update`, `bookings/{bookingId}` `allow create`, and `orders/{orderId}` `allow get`/`list`/`create`/`update` omit `isSignedIn()` (`firestore.rules:96-123`). Anyone knowing a valid `uid` or `orderId` can craft unauthenticated client SDK writes overwriting user loyalty points/profile fields or order statuses directly in Firestore without touching Express! **Fix:** Mint Firebase Custom Tokens on Express (`/api/auth/signin`, `/signup`, `/phone`) or route Firestore writes exclusively through authenticated server endpoints (`firebase-admin`) so client SDK rules require `request.auth != null && request.auth.uid == userId` / admin claim.
2. **`RISK-02` [High] Ephemeral `/tmp/hs_venue_store.json` & Hard Truncation Caps:** Storing primary operational data in `/tmp` risks total loss on container eviction/redeploy, and `.slice(0, 250)` (`server.ts:687-688`) silently drops older orders/reservations (eroding lifetime loyalty points when older orders age out beyond 250 total venue orders!). **Fix:** Move persistence to Firestore via Admin SDK or managed persistent volume.
3. **`RISK-03` [Medium] Missing 6-Month Inactive User Purge Implementation:** `Footer.tsx:82` and `ProfileModal.tsx:678-681` explicitly promise inactive customer data is "automatically deleted/purged after 6 months without activity", yet zero scheduled cleanup exists in `server.ts` or Firestore TTL policies. **Fix:** Implement a periodic purge task checking `lastLoginAt` (>180 days) and anonymizing/deleting expired inactive accounts, or update UI copy.
4. **`RISK-04` [Medium] Non-Transactional Loyalty Redemption Race:** Between checking `availablePoints < reward.pointsCost` (`server.ts:1253`) and appending to `userRewards` + persisting (`1281-1283`), there is no per-user lock; if refactored async in the future, concurrent requests could double-spend points. **Fix:** Keep synchronous atomic reservation or migrate redemption to a Firestore Transaction.
5. **`RISK-05` [Low] `loadStore()` Dropping Missing-`userId` Records & Runtime Fallback Secret:** Restarting without `SESSION_SECRET`/`ADMIN_SESSION_SECRET` generates `RUNTIME_FALLBACK_SECRET` (`server.ts:184`), invalidating all customer/admin sessions and OTP challenges on restart. **Fix:** Configure persistent env secrets in deployment and backfill legacy `'guest'` `userId` safely instead of discarding records.
6. **`RISK-06` [Low] ImageMagick Binary Availability Check:** `serverImageTransform.ts:136` assumes external CLI `convert` is installed; missing `convert` falls back silently on every request to full-resolution `res.sendFile(sourcePath)` (hurting mobile payload savings) with zero startup check. **Fix:** Log startup capability probe or bundle `sharp` if deterministic in-process WebP transforms are desired.

---

## 11. Regression Test Checklist

*Note: Repository currently has **0 automated tests**. The checklist below targets **Vitest + Supertest** (Express API), **Firebase Rules Unit Testing Emulator (`@firebase/rules-unit-testing`)** (`firestore.rules`), and **React Testing Library** (UI/contexts).*

- [ ] **NULL Input:** Send `{ name: null, phone: null, price: null, pool15Price: null, subtotal: null, email: null, otp: null }` across `PATCH /api/auth/profile`, `PATCH /api/admin/catalog/item/:id`, `PATCH /api/admin/catalog/gaming`, `POST /api/orders`, `POST /api/reservations`, and `/api/auth/forgot-password/*`; assert `400` errors on price/required fields and no coercion to `0` or `"null"`.
- [ ] **Empty String `""` Input:** Verify `""` is rejected (`400`) on `signup` (`email`, `name`, `password`), `forgot-password/*`, `POST /api/orders` (`customerName`, `phone`, `address`), `POST /api/reservations` (`name`, `phone`), and `POST /api/admin/catalog/item` (`name`); verify `PATCH /api/auth/profile` clears `phoneVerified` if `phone: ""` is accepted.
- [ ] **Whitespace-Only (`"   "`, `"\t\n"`) Input:** Assert `400` rejection on `POST /api/orders`, `POST /api/reservations`, `POST /api/admin/orders`, `POST /api/chat`, `PATCH /api/admin/catalog/item/:id` (`price: "   "`), and `POST /api/admin/change-password` (`newPassword: "      "`).
- [ ] **Missing Property:** Verify `{}` sent to `PATCH /api/auth/profile`, `PATCH /api/admin/catalog/item/:id`, and `PATCH /api/admin/catalog/gaming` leaves existing values intact; verify missing `guests` defaults to `2` while missing `date` on reservations is not stuck on `/api/gaming-status` permanently.
- [ ] **Explicit `null` in PATCH Requests:** Assert `PATCH /api/admin/catalog/item/:id` (`{ price: null }`) and `PATCH /api/admin/catalog/gaming` (`{ ps5HourlyPrice: null }`) return `400` instead of overwriting prices to `₹0`; assert `PATCH /api/auth/profile` rejects or deterministically handles `null`.
- [ ] **Zero (`0`) and `false` Values:**
  - Set `gamingRates` (`pool15Price: 0`), persist, restart/call `loadStore()` and `CatalogContext.refreshCatalog()`, and assert rate remains `0` (not `60`).
  - Verify `subtotal: 0` yields `0` loyalty points cleanly and `availablePoints: 0` renders `"0 Pts"` in `ProfileModal`.
  - Verify `inStock: false` hides item in `BookMenu`, while `inStock: undefined` displays item; verify `is18Confirmed: false` blocks order & booking creation.
- [ ] **Database / Store Defaults:** Verify `POST /api/orders` sets `status: 'Pending'`, `diningMode: 'takeaway'` when unrecognized; `POST /api/reservations` sets `status: 'Confirmed'`, `userId: 'guest'` when unauthenticated; `POST /api/rewards/redeem` creates `status: 'active'` without `usedBookingId`.
- [ ] **Nullable / Optional Keys in Firestore Rules (Emulator Tests):**
  - Assert `setDoc` on `/users/{uid}` and `/orders/{id}` **rejects** explicit `null` for optional fields (`phone: null`, `address: null`, `itemsSummary: null`) while **accepting** omitted optional keys.
  - Assert `/orders/{id}` `updateDoc` with `{ status: 'Preparing', updatedAt }` succeeds while full-doc `setDoc(..., { merge: true })` changing `address` or `userId` fails `PERMISSION_DENIED`.
- [ ] **Filtering and Searching:** Verify `/api/gaming-status` IST vs UTC midnight boundary (`00:00`–`05:29 IST`) and verify records missing `date` do not block future days; verify `/api/admin/customers` does not collapse two distinct unnamed walk-in customers (`phone: ""`, `name: "   "`).
- [ ] **Serialization & Deserialization:** Verify `undefined` properties (`poolDuration`, `voucherCode`, `videoUrl`) are omitted cleanly in `JSON.stringify` persistence (`hs_venue_store.json`) and survive `loadStore()` round-trip; verify `loadStore()` does not silently drop valid guest/counter orders.
- [ ] **Create and Update Operations:** Test complete Loyalty cycle (`POST /api/orders` -> `PATCH /api/admin/orders/:id` to `Cancelled` -> points drop to `0` -> `POST /api/rewards/redeem` rejects -> `Completed` -> redeem succeeds -> `POST /api/reservations` with `voucherCode` marks voucher `used`).
- [ ] **Uniqueness Behavior:** Test duplicate email case-insensitivity (`User@Test.com` vs `user@test.com`) and formatted phone collision (`+91 9876543210` vs `9876543210`) on `/api/auth/signup` and `/api/auth/phone` (`409 Conflict`).
- [ ] **Frontend Rendering:** Verify `ProfileModal`, `OrderDrawer`, `BookingModal`, `InstagramCarousel`, and `AdminPortal` render cleanly with `phone: ""`, `address: ""`, `views: 0`, `availablePoints: 0`, `vouchers: []`, and `mergedOrders: []` without `undefined`/`NaN` artifacts.
- [ ] **Cross-Layer Consistency:** Place an order via `OrderDrawer`, update its status in `AdminPortal`, reload `ProfileModal`, and verify both Express `/api/auth/me` and Firestore `onSnapshot` show the exact same `status`, `subtotal`, `address`, and `availablePoints`.

---

## 12. Safe Implementation Guidelines

1. **Always Normalize Before Checking Presence:** Trim incoming strings **before** emptiness checks: `const clean = typeof raw === 'string' ? raw.trim() : ''; if (!clean) return res.status(400)...`. Never rely on `if (!raw)` followed later by `.trim()`.
2. **Never Parse Numbers with `Number(x) || fallback`:** JavaScript `Number(null)`, `Number("")`, `Number("   ")`, and `Number(false)` all return `0`, and `0 || fallback` silently discards valid `0`. Always parse with strict type + emptiness checks:
   ```ts
   function parseStrictNonNegativeNumber(raw: unknown): number | null {
     if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
     if (typeof raw === 'string' && raw.trim() !== '') {
       const n = Number(raw.trim());
       return Number.isFinite(n) && n >= 0 ? n : null;
     }
     return null;
   }
   ```
3. **Separate "Omitted (`undefined`)" from "Explicit `null`" in `PATCH` Handlers:** In TypeScript/Express PATCH endpoints, treat `undefined` as "leave field unchanged", reject explicit `null` with `400 Bad Request` on non-nullable fields, and never pass arbitrary `null` through `!== undefined` checks into `Number()` or `setDoc()`.
4. **Match Firestore `setDoc` vs `updateDoc` Semantics to `firestore.rules`:**
   - Because `firestore.rules` enforces `(!('optField' in data) || data.optField is <type>)`, **never** send `null` or `undefined` to Firestore fields — omit optional keys when absent or intentionally store `""` only where documented (`size() <= N` without `size() > 0`).
   - Whenever updating an existing Firestore document constrained by `affectedKeys().hasOnly([...])`, **always** use `updateDoc` with strictly the allowed keys rather than `setDoc(..., { merge: true })` with synthesized defaults.
5. **Single Source of Truth for Loyalty & Enums:** Keep order status enums (`'Pending' | 'Preparing' | 'Completed' | 'Cancelled'`), booking fields (`poolDuration`, voucher metadata), and loyalty order ledgers identical across `src/types.ts`, `firebase-blueprint.json`, `firestore.rules`, `server.ts`, and React contexts.

---

## 13. Unknowns & Limitations

1. **Zero Automated Test Execution:** No unit, integration, or Firestore Rules Emulator tests exist in the repository; all runtime behaviors above were established through static inspection of source, config, and rules files rather than live test execution.
2. **Live Cloud Firestore Database State & Deployment Environment:** Production/preview document contents inside Firestore (`ai-studio-hotspicydigitals-d0bd234c-8d01-411e-81a9-304cfb6afa71`), live `/tmp/hs_venue_store.json` state, and deployed `firestore.rules` version could not be queried from this static audit.
3. **External Provider Runtime Credentials & Binaries:** Delivery behavior of `nodemailer`/Resend/SendGrid (SMTP env vars), Firebase Identity Toolkit Phone Auth quotas, live Instagram Graph API payloads (`INSTAGRAM_ACCESS_TOKEN`), Gemini API responses (`GEMINI_API_KEY`), and availability of the OS-level ImageMagick `convert` binary in the runtime container depend on external environment configuration not present in source control.
4. **Minor Decorative / Presentational Files:** `src/components/HeroAnimatedBackground.tsx`, `src/components/PageLoader.tsx`, `src/components/ScrollToTopButton.tsx`, `src/components/SectionDivider.tsx`, `src/components/WhatsAppFloatingButton.tsx`, `src/components/WhatsAppIcon.tsx`, and `src/lib/revealVariants.ts` were not inspected line-by-line (based on their filenames and imports in `src/App.tsx`, they handle UI layout, static WhatsApp deep-links, and animation presets with no API/Firestore persistence).

---

## 14. Final Audit Summary

| Audit Metric | Verified Count / Assessment | Scope Reference |
| :--- | :--- | :--- |
| **Total Inspected Fields** | **74** fields across 6 entity groups (`User`: 16, `Order`: 13, `Booking`: 17, `LoyaltyVoucher`: 10, `Catalog/Gaming/Cart`: 11, `Media/OTP`: 7) | Section 4 (`4.1`–`4.6`) |
| **Total Inspected Endpoints** | **37** Express HTTP API/health endpoints (`35` `/api/*` + `/healthz` + `/api/health`) + `2` mode-conditional SPA `*` routes, plus **6** client-side Cloud Firestore SDK data operations | Section 5 (`5.1`–`5.2`) |
| **Confirmed Issues** | **13** (`5` High, `5` Medium, `3` Low) — all directly evidenced by source/rule lines | Section 9 (`ISSUE-01`–`ISSUE-13`) |
| **Potential Risks** | **6** (`2` High, `2` Medium, `2` Low) architectural/operational risks | Section 10 (`RISK-01`–`RISK-06`) |
| **Unverified Areas** | Live Firestore documents/rules deployment, external SMTP/API env secrets, ImageMagick `convert` runtime binary, `0` automated tests, `7` minor presentational/animation files | Section 13 |
| **Overall Assessment** | **Moderate-to-Low Cross-Layer NULL Consistency.** Frontend components (especially `BookingModal`, `ToastContext`, `InstagramCarousel`) and customer auth OTP routes handle `undefined`, `0`, and whitespace reasonably well. However, Express business routes, `loadStore()`, `CatalogContext`, `AdminPortal`, and Cloud Firestore rules disagree significantly on whitespace-only strings, explicit `null` coercion via `Number()`, truthiness `\|\|` erasing `0` gaming rates, empty-string `email`/`address` rules, and dual-persistence loyalty reconciliation. | Sections 3–10 |
