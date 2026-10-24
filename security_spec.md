# Security Specification for Hearbor Anime Tracker

## 1. Data Invariants
- Users can only read and write their own profile (`/users/{userId}` where `userId == request.auth.uid`).
- Favorites belong to the user's subcollection (`/users/{userId}/favorites/{favoriteId}`) and must match `incoming().userId == request.auth.uid`.
- Progress tracking belongs to the user's subcollection (`/users/{userId}/progress/{progressId}`) and must match `incoming().userId == request.auth.uid`.
- Unauthenticated users cannot read or write user profiles, favorites, or progress.
- Public diagnostics document `/test/connection` is readable for connection validation.
- All IDs must be alphanumeric or hyphen/underscore and size <= 128.
- Default deny on any unknown or unmatched collections.

## 2. The "Dirty Dozen" Payloads (Designed to Fail)
1. **Unauthenticated Profile Read**: Reading `/users/user123` with `auth == null`.
2. **Foreign Profile Read**: User `alice` reading `/users/bob`.
3. **Foreign Profile Overwrite**: User `alice` writing to `/users/bob`.
4. **Identity Spoofing on Create**: User `alice` creating `/users/alice` with `incoming().id = "bob"`.
5. **PII Email Poisoning**: User writing oversized string (>128 chars) into `email`.
6. **Unauthenticated Favorite Write**: Writing to `/users/alice/favorites/naruto` without authentication.
7. **Cross-User Favorite Injection**: User `bob` writing to `/users/alice/favorites/naruto`.
8. **Invalid Favorite ID / Path Poisoning**: Writing with doc ID containing illegal characters `/users/alice/favorites/../../../evil`.
9. **Oversized Field Denial-of-Wallet**: Writing titleEn string longer than 200 characters.
10. **Progress Subcollection Hijack**: User `bob` modifying Alice's watch progress `/users/alice/progress/one-piece_1`.
11. **Negative Watch Position**: Setting `position = -50` or non-numeric value.
12. **Root Document Catch-All Breach**: Attempting write to arbitrary root collection `/admin/settings` or `/system/keys`.

## 3. Test Runner Definition (firestore.rules.test.ts)
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// All 12 Dirty Dozen payloads must assertFails()
describe('Firestore Security Rules Matrix', () => {
  it('rejects unauthenticated profile reads', async () => { /* assertFails */ });
  it('rejects cross-user profile write', async () => { /* assertFails */ });
  it('rejects cross-user favorites writes', async () => { /* assertFails */ });
  it('rejects oversized inputs and invalid path ids', async () => { /* assertFails */ });
});
```
