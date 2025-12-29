# ARC P1 + P1.5 Implementation Summary

**Date:** 2025-01-XX  
**Status:** ✅ **PARTIALLY COMPLETE** - Core infrastructure done, remaining pages/APIs need guards

---

## What Was Implemented

### ✅ P1: Tier Gating Infrastructure

1. **Policy Map Created** (`src/web/lib/arc/access-policy.ts`)
   - Single source of truth for tier requirements
   - Defines minimum tier for each ARC route and API
   - Helper functions for route matching

2. **SSR Helper Created** (`src/web/lib/server-auth.ts`)
   - `getUserTierServerSide()` - Computes tier from feature grants
   - `requireArcTier()` - SSR guard that redirects if tier insufficient
   - SuperAdmin bypass built-in

3. **API Helper Created** (`src/web/lib/arc/api-tier-guard.ts`)
   - `checkArcApiTier()` - Checks tier for API routes
   - `enforceArcApiTier()` - Returns 403 if access denied
   - SuperAdmin bypass built-in

4. **Applied to:**
   - ✅ `/portal/arc/index.tsx` - SSR guard added
   - ✅ `/api/portal/arc/projects` - Tier guard + expiration check
   - ✅ `/api/portal/arc/summary` - Tier guard + expiration check
   - ✅ `/api/portal/arc/cta-state` - Tier guard + expiration check

### ✅ P1.5: ARC Expiration

1. **Expiration Helper Created** (`src/web/lib/arc/expiration.ts`)
   - `checkArcExpiration()` - Checks if ARC has expired
   - `getEffectiveArcActive()` - Returns effective arc_active (considering expiration)
   - Virtual disable: No DB update, just treat as disabled

2. **Applied to:**
   - ✅ `/api/portal/arc/cta-state` - Checks expiration before returning state
   - ✅ `/api/portal/arc/summary` - Filters expired projects from count
   - ⚠️ `/api/portal/arc/top-projects` - **NOT NEEDED** (doesn't filter by arc_active for inclusion)
   - ⚠️ `/api/portal/arc/projects` - Uses different table (`project_arc_settings`), may need separate logic

---

## Tier Gating Policy Table

| Route/API | Required Tier | Status |
|-----------|--------------|--------|
| `/portal/arc` | `seer` | ✅ Applied |
| `/portal/arc/[slug]` | `analyst` | ⏳ **TODO** |
| `/portal/arc/gamified/[projectId]` | `analyst` | ⏳ **TODO** |
| `/portal/arc/creator-manager` | `analyst` | ⏳ **TODO** |
| `/portal/arc/requests` | `seer` | ⏳ **TODO** |
| `/portal/arc/admin/*` | `institutional_plus` | ⏳ **TODO** (also needs super_admin) |
| `/api/portal/arc/top-projects` | `seer` | ⏳ **TODO** |
| `/api/portal/arc/projects` | `seer` | ✅ Applied |
| `/api/portal/arc/summary` | `seer` | ✅ Applied |
| `/api/portal/arc/cta-state` | `seer` | ✅ Applied |
| `/api/portal/arc/leaderboard-requests` | `seer` | ⏳ **TODO** |
| `/api/portal/arc/project/[projectId]` | `analyst` | ⏳ **TODO** |
| `/api/portal/arc/leaderboard/[projectId]` | `analyst` | ⏳ **TODO** |
| `/api/portal/arc/gamified/[projectId]` | `analyst` | ⏳ **TODO** |
| `/api/portal/admin/arc/*` | `institutional_plus` | ⏳ **TODO** (also needs super_admin) |

---

## Remaining Work

### P1: Apply SSR Guards to Remaining Pages

**Files to modify:**
1. `src/web/pages/portal/arc/[slug].tsx` - Add `requireArcTier(context, 'analyst', '/portal/arc/[slug]')`
2. `src/web/pages/portal/arc/gamified/[projectId].tsx` - Add `requireArcTier(context, 'analyst', '/portal/arc/gamified/[projectId]')`
3. `src/web/pages/portal/arc/creator-manager/index.tsx` - Add `requireArcTier(context, 'analyst', '/portal/arc/creator-manager')`
4. `src/web/pages/portal/arc/requests.tsx` - Add `requireArcTier(context, 'seer', '/portal/arc/requests')`
5. `src/web/pages/portal/arc/admin/*.tsx` - Add `requireArcTier(context, 'institutional_plus', route)` (in addition to super_admin check)

**Pattern:**
```typescript
import { requireArcTier } from '@/lib/server-auth';
import { getRequiredTierForPage } from '@/lib/arc/access-policy';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const route = context.resolvedUrl || context.req.url || '';
  const requiredTier = getRequiredTierForPage(route);
  
  if (requiredTier) {
    const tierCheck = await requireArcTier(context, requiredTier, route);
    if (tierCheck) {
      return tierCheck; // Redirect to pricing/portal
    }
  }
  
  // ... rest of SSR logic
};
```

### P1: Apply API Guards to Remaining APIs

**Files to modify:**
1. `src/web/pages/api/portal/arc/top-projects.ts` - Add `enforceArcApiTier(req, res, '/api/portal/arc/top-projects')`
2. `src/web/pages/api/portal/arc/leaderboard-requests.ts` - Add `enforceArcApiTier(req, res, '/api/portal/arc/leaderboard-requests')`
3. `src/web/pages/api/portal/arc/project/[projectId].ts` - Add `enforceArcApiTier(req, res, '/api/portal/arc/project/[projectId]')`
4. `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` - Add `enforceArcApiTier(req, res, '/api/portal/arc/leaderboard/[projectId]')`
5. `src/web/pages/api/portal/arc/gamified/[projectId].ts` - Add `enforceArcApiTier(req, res, '/api/portal/arc/gamified/[projectId]')`
6. All `/api/portal/admin/arc/*` - Add `enforceArcApiTier(req, res, '/api/portal/admin/arc/*')` (in addition to super_admin check)

**Pattern:**
```typescript
import { enforceArcApiTier } from '@/lib/arc/api-tier-guard';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enforce tier guard
  const tierCheck = await enforceArcApiTier(req, res, '/api/portal/arc/your-route');
  if (tierCheck) {
    return tierCheck; // Returns 403 response
  }
  
  // ... rest of handler
}
```

### P1.5: Expiration Edge Cases

**Edge Cases Handled:**
1. ✅ `arc_active_until` is `null` → ARC active (no expiration)
2. ✅ `arc_active_until` is in future → ARC active
3. ✅ `arc_active_until` is in past → ARC disabled (virtual)
4. ✅ `arc_active` is `false` → ARC disabled (regardless of expiration)
5. ⚠️ `arc_active_until` is invalid date → Should be treated as `null` (not implemented yet)

**Recommended Addition:**
```typescript
// In expiration.ts, add validation:
function isValidDate(date: string | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

// Use in checkArcExpiration:
if (arcActiveUntil && !isValidDate(arcActiveUntil)) {
  // Treat invalid date as null (no expiration)
  return checkArcExpiration(arcActive, null);
}
```

---

## Testing Checklist

### Tier Gating
- [ ] Seer user can access `/portal/arc` (treemap view)
- [ ] Seer user CANNOT access `/portal/arc/[slug]` (redirects to pricing)
- [ ] Analyst user CAN access `/portal/arc/[slug]`
- [ ] Analyst user CAN access `/portal/arc/gamified/[projectId]`
- [ ] Seer user CAN access `/api/portal/arc/top-projects` (API)
- [ ] Seer user CANNOT access `/api/portal/arc/project/[projectId]` (403)
- [ ] SuperAdmin bypasses all tier checks

### Expiration
- [ ] Project with `arc_active=true, arc_active_until=null` → Active
- [ ] Project with `arc_active=true, arc_active_until=future` → Active
- [ ] Project with `arc_active=true, arc_active_until=past` → Disabled (virtual)
- [ ] Project with `arc_active=false` → Disabled (regardless of expiration)
- [ ] CTA state API respects expiration
- [ ] Summary API excludes expired projects from count

---

## Files Created

1. `src/web/lib/arc/access-policy.ts` - Policy map
2. `src/web/lib/arc/api-tier-guard.ts` - API tier guard helpers
3. `src/web/lib/arc/expiration.ts` - Expiration check helpers

## Files Modified

1. `src/web/lib/server-auth.ts` - Added `getUserTierServerSide()` and `requireArcTier()`
2. `src/web/pages/portal/arc/index.tsx` - Added SSR tier guard
3. `src/web/pages/api/portal/arc/cta-state.ts` - Added tier guard + expiration check
4. `src/web/pages/api/portal/arc/summary.ts` - Added tier guard + expiration check
5. `src/web/pages/api/portal/arc/projects.ts` - Added tier guard

---

## Next Steps

1. **Apply SSR guards** to remaining ARC pages (5 files)
2. **Apply API guards** to remaining ARC APIs (6+ files)
3. **Add expiration validation** for invalid dates
4. **Test** tier gating and expiration in dev environment
5. **Document** any edge cases found during testing

---

## Notes

- **SuperAdmin bypass**: All tier checks automatically allow SuperAdmins (they get `institutional_plus` tier)
- **DEV MODE**: Tier checks are bypassed in development (`NODE_ENV === 'development'`)
- **Virtual disable**: Expiration doesn't update DB, just treats as disabled in queries
- **No DB migration needed**: Expiration uses existing `arc_active_until` field

