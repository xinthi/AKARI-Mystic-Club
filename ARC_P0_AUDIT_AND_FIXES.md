# ARC P0 Audit and Implementation Plan

**Date:** 2025-01-XX  
**Scope:** P0 Production Readiness - DEV_MODE Overrides and Debug UI

---

## Current State Audit

### ✅ Confirmed Working (DO NOT TOUCH)

1. **Treemap Component** - Stable
   - `src/web/components/arc/ArcTopProjectsTreemap.tsx` - CustomCell properly wired
   - `src/web/components/arc/ArcTopProjectsTreemapClient.tsx` - Uses `content={renderContent}` prop
   - `src/web/pages/api/portal/arc/top-projects.ts` - Returns only `profile_type='project'`
   - Visual logic: green/yellow/red based on growth_pct
   - No layout regressions detected

2. **ARC CTA State API** - API-driven, single source of truth
   - `src/web/pages/api/portal/arc/cta-state.ts` - Returns `shouldShowRequestButton`
   - `src/web/pages/portal/sentiment/[slug].tsx` - Renders CTA only from API response
   - Rule: `if (!ctaState) return null` → `if (!ctaState.shouldShowRequestButton) return null`

3. **Database Schema** - Correct
   - `projects.arc_active` (BOOLEAN)
   - `projects.arc_access_level` (TEXT: 'none' | 'creator_manager' | 'leaderboard' | 'gamified')
   - `projects.arc_active_until` (TIMESTAMPTZ) - EXISTS but NOT ENFORCED
   - `projects.profile_type` (TEXT) - Used for treemap filtering

4. **Request Flow** - Implemented
   - `/portal/arc/requests` - User can see requests
   - `/portal/admin/arc/leaderboard-requests` - SuperAdmin reviews
   - `arc_leaderboard_requests` table exists

---

## P0 Issues Found

### Issue 1: DEV_MODE Overrides in Production Code

**Location:** `src/web/pages/api/portal/arc/cta-state.ts` (lines 266-269)
```typescript
// DEV MODE: Always allow in development
if (DEV_MODE) {
  shouldShowRequestButton = arcAccessLevel === 'none' && !arcActive && !existingRequest;
  reason = DEV_MODE ? 'DEV_MODE: allowed' : undefined;
}
```
**Problem:** In production, `NODE_ENV === 'development'` is false, so this is safe. However, the logic is confusing and could be misread. The `reason` field includes 'DEV_MODE: allowed' which could leak to production if misconfigured.

**Risk:** LOW (only triggers in dev mode, but code clarity issue)

---

**Location:** `src/web/pages/portal/arc/index.tsx` (lines 166-167, 575)
```typescript
const isDevMode = process.env.NODE_ENV === 'development';
const canManageArc = isDevMode || userIsSuperAdmin || initialCanManageArc;
```
**Problem:** Client-side check allows ARC access in dev mode. This is fine for development, but should be clearly documented.

**Risk:** LOW (client-side only, server-side still enforces)

---

### Issue 2: Debug Console Logs in Production

**Location:** `src/web/pages/portal/sentiment/[slug].tsx` (lines 1033, 1036)
```typescript
console.log('[ARC CTA] fetch', url);
console.log('[ARC CTA] response', data);
```
**Problem:** These logs are not gated behind `NODE_ENV !== 'production'`, so they will appear in production console.

**Risk:** MEDIUM (performance and security - exposes internal state)

---

### Issue 3: CTA Flashing Potential

**Location:** `src/web/pages/portal/sentiment/[slug].tsx` (lines 1024-1045)
**Current Flow:**
1. Component mounts → `arcCta` is `null`
2. `useEffect` fetches CTA state
3. CTA renders when `arcCta?.shouldShowRequestButton === true`

**Analysis:** 
- Initial state: `arcCta = null` → CTA hidden ✅
- After fetch: `arcCta = { shouldShowRequestButton: true }` → CTA shows ✅
- No flash detected (CTA starts hidden, only shows after API confirms)

**Risk:** NONE (current implementation is correct)

---

## P0 Implementation Plan

### Fix 1: Gate DEV_MODE Logic (Clarify, Don't Remove)

**File:** `src/web/pages/api/portal/arc/cta-state.ts`
- Keep DEV_MODE bypass for development
- Add comment clarifying production behavior
- Ensure `reason` field doesn't leak 'DEV_MODE' in production builds

### Fix 2: Remove Debug Console Logs

**File:** `src/web/pages/portal/sentiment/[slug].tsx`
- Gate console.logs behind `process.env.NODE_ENV !== 'production'`
- Or remove entirely (preferred)

### Fix 3: Verify CTA Never Flashes

**File:** `src/web/pages/portal/sentiment/[slug].tsx`
- Confirm initial state is `null` (CTA hidden)
- Confirm CTA only renders after API response
- Add defensive check: `if (!arcCta || !arcCta.ok) return null`

---

## Remaining Work (P1/P2 - NOT IN SCOPE)

### P1: Tier Gating
- Implement `seer` / `analyst` / `institutional_plus` tier checks
- Enforce on API and page-level (SSR)

### P1: ARC Expiration Logic
- Check `arc_active_until < now` → treat as disabled
- Add cron/worker or server-side enforcement
- Add fallback checks in CTA-state and arc endpoints

### P2: ARC Analytics Dashboard
- Basic v1 metrics

### P2: Notifications on Approval
- In-app banner or email

### P2: Improve Admin UX for Approvals

---

## Files to Modify (P0 Only)

1. `src/web/pages/api/portal/arc/cta-state.ts` - Clarify DEV_MODE logic
2. `src/web/pages/portal/sentiment/[slug].tsx` - Remove/gate debug logs, add defensive check

---

## Testing Checklist

- [ ] CTA does not flash on page load
- [ ] CTA only shows when API returns `shouldShowRequestButton: true`
- [ ] No console logs in production build
- [ ] DEV_MODE still works in development
- [ ] Production behavior unchanged (no regressions)

