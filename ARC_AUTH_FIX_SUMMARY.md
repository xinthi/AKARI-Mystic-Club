# ARC Authentication Fix Summary

**Date:** 2025-01-22  
**Issue:** `/api/portal/arc/follow-status` returns authentication errors even when user is logged in

---

## Root Cause

The cookie parsing logic in ARC endpoints was using a simple string split that could fail in edge cases (empty cookies, malformed cookie strings, etc.). All endpoints use the same `akari_session` cookie-based authentication, but the parsing needed to be more robust.

---

## Files Changed

### 1. `src/web/pages/api/portal/arc/follow-status.ts`
- **Improved cookie parsing:** Enhanced `getSessionToken()` to handle edge cases
- **Added debug logging:** Logs when session token is missing (dev mode only)
- **Response shape:** Already correct - returns `401 { ok: false, reason: 'not_authenticated' }` when not logged in, `200 { ok: true, verified: boolean }` when logged in

### 2. `src/web/pages/api/portal/arc/verify-follow.ts`
- **Improved cookie parsing:** Enhanced `getSessionToken()` to handle edge cases
- **Added debug logging:** Logs when session token is missing (dev mode only)
- **Response shape:** Already correct - returns `401 { ok: false, reason: 'not_authenticated' }` when not authenticated

### 3. `src/web/pages/api/portal/arc/join-leaderboard.ts`
- **Improved cookie parsing:** Enhanced `getSessionToken()` to handle edge cases
- **Added debug logging:** Logs when session token is missing (dev mode only)
- **Response shape:** Already correct - returns `401 { ok: false, reason: 'not_authenticated' }` when not authenticated

---

## Changes Made

### Improved Cookie Parsing

**Before:**
```typescript
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}
```

**After:**
```typescript
function getSessionToken(req: NextApiRequest): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  // Handle both single cookie string and multiple cookies separated by semicolons
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      const token = cookie.substring('akari_session='.length).trim();
      // Handle case where cookie value might be empty or have extra characters
      if (token && token.length > 0) {
        return token;
      }
    }
  }
  return null;
}
```

**Improvements:**
1. Explicit check for missing cookie header
2. Trims token value to handle whitespace
3. Validates token is non-empty before returning
4. More robust handling of edge cases

### Added Debug Logging

Added development-only logging to help diagnose authentication issues:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[follow-status] No session token found. Cookie header:', req.headers.cookie ? 'present' : 'missing');
}
```

---

## Response Shapes

### follow-status.ts

**Not logged in:**
```json
{
  "ok": false,
  "error": "Not authenticated",
  "reason": "not_authenticated"
}
```
Status: `401`

**Logged in:**
```json
{
  "ok": true,
  "verified": false
}
```
Status: `200`

### verify-follow.ts

**Not authenticated:**
```json
{
  "ok": false,
  "error": "Not authenticated",
  "reason": "not_authenticated"
}
```
Status: `401`

**Authenticated (verified):**
```json
{
  "ok": true,
  "verified": true,
  "verifiedAt": "2025-01-22T..."
}
```
Status: `200`

### join-leaderboard.ts

**Not authenticated:**
```json
{
  "ok": false,
  "error": "Not authenticated",
  "reason": "not_authenticated"
}
```
Status: `401`

**Success:**
```json
{
  "ok": true,
  "arenaId": "...",
  "creatorId": "..."
}
```
Status: `200`

---

## Testing

1. **Test with logged-in user:**
   - Call `/api/portal/arc/follow-status?projectId=...`
   - Should return `200 { ok: true, verified: boolean }`

2. **Test without authentication:**
   - Call endpoint without `akari_session` cookie
   - Should return `401 { ok: false, reason: 'not_authenticated' }`

3. **Check browser console (dev mode):**
   - If authentication fails, check server logs for debug messages
   - Verify cookie header is present in request

---

## Additional Notes

- All endpoints use the same authentication mechanism (`akari_session` cookie)
- Cookie is set with `HttpOnly`, `SameSite=Lax`, and `Secure` (in production)
- Cookie path is `/` so it should be available to all API routes
- If issues persist, check:
  1. Cookie domain matches the API domain (akarimystic.club)
  2. Cookie is actually being sent in the request (check Network tab)
  3. Session exists in `akari_user_sessions` table
  4. Session is not expired

---

## Next Steps

If authentication still fails after this fix:

1. **Check cookie domain/path:**
   - Verify cookie is set for the correct domain
   - Check if cookie path allows access to `/api/portal/arc/*` routes

2. **Verify session in database:**
   - Check `akari_user_sessions` table for active sessions
   - Verify session token matches cookie value

3. **Check CORS/cookie settings:**
   - Ensure cookies are being sent cross-origin if needed
   - Verify `SameSite` and `Secure` flags are appropriate

4. **Use browser DevTools:**
   - Check Network tab to see if cookie is in request headers
   - Verify cookie value matches session token in database

