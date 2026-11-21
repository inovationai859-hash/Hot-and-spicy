# Security Specification — Hot & Spicy Cloud Firestore

## 1. Data Invariants
1. **User Profile Integrity:** Every `/users/{userId}` document must validate strict allowlisted keys (`uid`, `name`, `email`, `phone`, `phoneVerified`, `authProvider`, `address`, `is18Plus`, `dietaryPreference`, `loyaltyPoints`, `earnedPoints`, `spentPoints`, `loyaltyTier`, `loyaltyUpdatedAt`, `createdAt`, `lastLoginAt`), enforce `dietaryPreference in ['all', 'veg', 'non-veg']` when present, enforce `incoming().uid == userId` on create, keep `uid` immutable on update, and restrict single-document `get`/`delete` to owners or admins.
2. **Booking Integrity:** Every `/bookings/{bookingId}` document must have non-empty `name`, `phone`, valid `bookingType` (`dining`, `ps5`, `pool`, `combo_deal`), valid `date` and `timeSlot`, optional bounded `guests` (1–30), optional `poolDuration` (`15min`, `30min`), and explicit `is18Confirmed == true`.
3. **Order Integrity:** Every `/orders/{orderId}` document must have non-empty `customerName`, `phone`, `address`, bounded non-negative `subtotal` (`0 <= subtotal <= 500000`), valid `status` (`Pending`, `Preparing`, `Ready`, `Completed`, `Delivered`, `Cancelled`), and `is18Confirmed == true`.
4. **Order State Update Guard:** Updates to `/orders/{orderId}` can only mutate `['status', 'updatedAt']` (plus `isValidOrder(incoming())`), preventing tampering with `subtotal`, `userId`, `itemsSummary`, or `customerName`, and locking terminal `Cancelled`/`Delivered` transitions except via admin.
5. **Path Hardening:** Document IDs across `/users`, `/bookings`, `/orders` must match `^[a-zA-Z0-9_\-]+$` with length `1..128`, blocking path poisoning and unbounded strings.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow/Ghost Field on User Create:** `{ "uid": "u1", "name": "A", "email": "a@b.com", "isAdmin": true }` -> Rejected by `data.keys().hasOnly(...)`.
2. **UID Spoofing on User Create:** Writing to `/users/victim` with `{ "uid": "attacker", "name": "X", "email": "x@y.com" }` -> Rejected by `incoming().uid == userId`.
3. **Mutating Immutable UID on Update:** Updating `/users/u1` changing `uid` -> Rejected by `incoming().uid == existing().uid`.
4. **Cross-User Profile Read/Delete:** User A reading/deleting `/users/userB` -> Rejected by `isOwner(userId)`.
5. **Invalid Dietary Preference Injection:** Updating `/users/u1` with `{ "dietaryPreference": "vegan-unlimited-10kb..." }` -> Rejected by `data.dietaryPreference in ['all', 'veg', 'non-veg']`.
6. **Blanket Unscoped List on Orders:** Querying `collection(db, 'orders')` without `where('userId', '==', uid)` where a doc lacks valid `userId` -> Rejected by `allow list` resource constraint.
7. **Negative Order Subtotal:** Creating `/orders/ORD-1` with `{ "subtotal": -500, ... }` -> Rejected by `data.subtotal >= 0`.
8. **Unconfirmed Age Verification on Order/Booking:** Creating `/orders/ORD-2` or `/bookings/BK-2` with `{ "is18Confirmed": false }` -> Rejected by `data.is18Confirmed == true`.
9. **Order Tampering via Update (Free Meal Attack):** Updating `/orders/ORD-1` changing `subtotal` or `itemsSummary` -> Rejected by `affectedKeys().hasOnly(['status', 'updatedAt'])`.
10. **Invalid Order Status Injection:** Updating `/orders/ORD-1` with `{ "status": "FREE" }` -> Rejected by `data.status in [...]`.
11. **Path ID Poisoning:** Writing `/orders/..%2Fadmin` or `/orders/` + 200 chars -> Rejected by `isValidId(orderId)`.
12. **Unbounded Guest Count / String Exhaustion on Booking:** Creating `/bookings/BK-9` with `{ "guests": 9999 }` or 10KB `specialRequests` -> Rejected by `guests <= 30` & `size() <= 300`.
13. **Arbitrary Collection Write:** Writing `/admins/attacker` or `/vouchers/free` -> Rejected by default-deny `match /{document=**} { allow read, write: if false; }`.
