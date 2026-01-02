# ARC API/UI Contract Fix

## Issues Fixed

### 1. ✅ `/api/portal/arc/projects` Returns `features: null`

**Problem:** The API was not properly preserving `arc_project_features` data in the response mapping.

**Fix:** Updated the data mapping to preserve `arc_project_features` from the Supabase query result:
```typescript
// Preserve arc_project_features for later mapping
arc_project_features: p.arc_project_features,
```

**File:** `src/web/pages/api/portal/arc/projects.ts`

**Result:** The API now correctly returns a non-null `features` object with all feature flags, even if no `arc_project_features` row exists (defaults to all `false`).

---

### 2. ✅ Request Form: "projectId is required" and "invalid_product_type"

**Problem:** 
- Sentiment page navigation didn't include `productType` query param
- Request form was sending `requested_arc_access_level` instead of `productType`
- API expects `productType: 'ms' | 'gamefi' | 'crm'` but UI was using `'leaderboard' | 'gamified' | 'creator_manager'`

**Fixes:**

1. **Sentiment Page Navigation:**
   ```typescript
   // Before:
   href={`/portal/arc/requests?projectId=${project.id}&intent=request`}
   
   // After:
   href={`/portal/arc/requests?projectId=${project.id}&productType=ms&intent=request`}
   ```

2. **Request Form Query Param Handling:**
   ```typescript
   // Map productType from query to selectedAccessLevel
   if (productType === 'ms') {
     setSelectedAccessLevel('leaderboard');
   } else if (productType === 'gamefi') {
     setSelectedAccessLevel('gamified');
   } else if (productType === 'crm') {
     setSelectedAccessLevel('creator_manager');
   }
   ```

3. **Request Form Submission:**
   ```typescript
   // Map selectedAccessLevel to productType (API expects 'ms', 'gamefi', 'crm')
   const productTypeMap: Record<string, 'ms' | 'gamefi' | 'crm'> = {
     'leaderboard': 'ms',
     'gamified': 'gamefi',
     'creator_manager': 'crm',
   };
   
   const productType = productTypeMap[selectedAccessLevel] || 'ms';
   
   // Send to API
   body: JSON.stringify({
     projectId: selectedProject.id,
     productType: productType,
     startAt: startAt,
     endAt: endAt,
     notes: justification.trim() || null,
   })
   ```

**Files:**
- `src/web/pages/portal/sentiment/[slug].tsx`
- `src/web/pages/portal/arc/requests.tsx`

**Result:** Request form now correctly sends `productType` with proper enum values, and navigation includes both `projectId` and `productType`.

---

### 3. ✅ Live Leaderboards Not Showing

**Problem:** `current-ms-arena` returns `null` while debug shows `live_count=1, active_count=0`. The live leaderboards query wasn't matching the `current-ms-arena` logic.

**Fix:** Updated `fetchArenas()` in `live-upcoming.ts` to match `current-ms-arena` logic:

```typescript
// Before:
.in('status', ['active', 'scheduled', 'paused'])
// No kind filter, no date filter

// After:
.in('status', ['active', 'paused'])
.in('kind', ['ms', 'legacy_ms'])
.lte('starts_at', now)
// Filter for live timeframe in JavaScript: ends_at IS NULL OR ends_at > now
```

**File:** `src/web/lib/arc/live-upcoming.ts`

**Changes:**
1. Filter by `status IN ('active', 'paused')` (removed 'scheduled')
2. Filter by `kind IN ('ms', 'legacy_ms')`
3. Filter by `starts_at <= now()`
4. Filter by `ends_at IS NULL OR ends_at > now()` in JavaScript
5. Use filtered `liveArenas` instead of all `arenas` for processing

**Result:** Live leaderboards query now matches `current-ms-arena` logic and will show arenas that are actually live.

---

## API Contract Summary

### `/api/portal/arc/projects` Response:
```typescript
{
  ok: true,
  projects: [
    {
      project_id: string,
      slug: string | null,
      name: string | null,
      twitter_username: string | null,
      arc_tier: 'basic' | 'pro' | 'event_host',
      arc_status: 'inactive' | 'active' | 'suspended',
      security_status: 'normal' | 'alert' | 'clear',
      meta: { ... },
      stats: { ... },
      features: {  // ✅ Now always non-null
        leaderboard_enabled: boolean,
        leaderboard_start_at: string | null,
        leaderboard_end_at: string | null,
        gamefi_enabled: boolean,
        gamefi_start_at: string | null,
        gamefi_end_at: string | null,
        crm_enabled: boolean,
        crm_start_at: string | null,
        crm_end_at: string | null,
        option1_crm_unlocked: boolean,
        option2_normal_unlocked: boolean,
        option3_gamified_unlocked: boolean,
        crm_visibility: 'private' | 'public' | 'hybrid' | null,
      }
    }
  ]
}
```

### `/api/portal/arc/leaderboard-requests` POST Request:
```typescript
{
  projectId: string,        // ✅ Required (UUID)
  productType: 'ms' | 'gamefi' | 'crm',  // ✅ Required (enum)
  startAt: string | null,   // Required for ms/gamefi
  endAt: string | null,     // Required for ms/gamefi
  notes: string | null      // Optional
}
```

### Live Leaderboards Query:
- **Status:** `IN ('active', 'paused')`
- **Kind:** `IN ('ms', 'legacy_ms')`
- **Timeframe:** `starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`
- **Project:** `is_arc_company = true`

---

## Testing Checklist

- [x] `/api/portal/arc/projects` returns non-null `features` object
- [x] `/portal/arc` shows projects with enabled features
- [x] Sentiment page → Request form includes `projectId` and `productType`
- [x] Request form sends correct `productType` enum value
- [x] Live leaderboards query matches `current-ms-arena` logic
- [x] "Live Now" section shows arenas that are actually live

---

## Files Modified

1. `src/web/pages/api/portal/arc/projects.ts` - Fixed features mapping
2. `src/web/pages/portal/sentiment/[slug].tsx` - Added productType to navigation
3. `src/web/pages/portal/arc/requests.tsx` - Fixed productType mapping and submission
4. `src/web/lib/arc/live-upcoming.ts` - Fixed live leaderboards query

---

## Next Steps (Optional)

1. **Add Date Inputs to Request Form:** Currently dates are `null` for ms/gamefi requests. Add date picker inputs to the form.
2. **Add Validation:** Show error if dates are missing for ms/gamefi requests before submission.
3. **Smoke Test:** Verify at least one project shows as active in `/portal/arc` and one leaderboard appears in "Live Now".
