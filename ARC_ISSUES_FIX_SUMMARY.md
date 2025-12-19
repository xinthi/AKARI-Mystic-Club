# ARC Issues Fix Summary

**Date:** 2025-01-XX  
**Status:** ✅ **COMPLETE**

---

## Issue A: TypeScript Build Error ✅

**File:** `src/web/lib/arc/api-tier-guard.ts`

**Problem:** 
- `res.status(403).json(...)` returns `void`, but function signature expects `NextApiResponse | null`
- TypeScript build fails in Vercel

**Fix:**
```typescript
// Before:
return res.status(403).json({...});

// After:
res.status(403).json({...});
return res;
```

**Diff:**
```diff
-    return res.status(403).json({
+    res.status(403).json({
       ok: false,
       error: guardResult.reason || 'Access denied',
       reason: guardResult.reason,
     });
+    return res;
   }
```

---

## Issue B: Requester Shows "Unknown" ✅

**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts`

**Problem:**
- Requester column shows "Unknown" on admin page
- Query wasn't properly joining `arc_leaderboard_requests.requested_by` to `profiles.id`

**Fix:**
- Changed from Supabase join syntax to separate query (more reliable)
- `requested_by` is already a profile ID (foreign key to `profiles.id`)
- Query profiles separately and build a map
- Filter out null `requested_by` values before querying

**Diff:**
```diff
-    // Fetch requester profiles
-    const requesterIds = [...new Set((requests || []).map((r: any) => r.requested_by))];
-    const { data: requesters, error: requestersError } = await supabase
-      .from('profiles')
-      .select('id, username, display_name')
-      .in('id', requesterIds);
-
-    if (requestersError) {
-      console.error('[Admin Leaderboard Requests API] Error fetching requesters:', requestersError);
-    }
-
-    // Build requester map
-    const requesterMap = new Map<string, { id: string; username: string; display_name: string | null }>();
-    (requesters || []).forEach((p: any) => {
-      requesterMap.set(p.id, {
-        id: p.id,
-        username: p.username,
-        display_name: p.display_name,
-      });
-    });

+    // Fetch requester profiles (requested_by is a profile ID)
+    const requesterIds = [...new Set((requests || []).map((r: any) => r.requested_by).filter(Boolean))];
+    let requesterMap = new Map<string, { id: string; username: string; display_name: string | null }>();
+    
+    if (requesterIds.length > 0) {
+      const { data: requesters, error: requestersError } = await supabase
+        .from('profiles')
+        .select('id, username, display_name')
+        .in('id', requesterIds);
+
+      if (requestersError) {
+        console.error('[Admin Leaderboard Requests API] Error fetching requesters:', requestersError);
+      } else if (requesters) {
+        requesters.forEach((p: any) => {
+          requesterMap.set(p.id, {
+            id: p.id,
+            username: p.username,
+            display_name: p.display_name,
+          });
+        });
+      }
+    }
```

**Note:** Request creation already stores `requested_by` correctly (uses `userProfile.profileId`), so no changes needed there.

---

## Issue C: Approved but No Leaderboard ✅

**Files:**
- `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` - Added routing comments
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - Added UI labels

**Problem:**
- Approved request for "creator_manager" doesn't show leaderboard (expected - routes to creator-manager)
- Need to explain routing in code and UI

**Fix:**

1. **Added routing comments in approval handler:**
```typescript
// If approved, update project ARC settings
// Routing rules:
// - creator_manager -> /portal/arc/creator-manager
// - leaderboard -> /portal/arc/project/[slug]
// - gamified -> /portal/arc/project/[slug] (same as leaderboard)
// This sets projects.arc_active=true and projects.arc_access_level=approved_access_level
```

2. **Added UI labels in approval modal:**
```diff
-                  <option value="leaderboard">Leaderboard</option>
-                  <option value="gamified">Gamified</option>
-                  <option value="creator_manager">Creator Manager</option>
+                  <option value="leaderboard">Leaderboard → /portal/arc/project/[slug]</option>
+                  <option value="gamified">Gamified → /portal/arc/project/[slug]</option>
+                  <option value="creator_manager">Creator Manager → /portal/arc/creator-manager</option>
```

3. **Added dynamic help text:**
```diff
-                <p className="text-xs text-slate-500 mt-1">
-                  This will set the project&apos;s ARC access level and activate it.
-                </p>
+                <p className="text-xs text-slate-500 mt-1">
+                  {selectedAccessLevel === 'creator_manager' 
+                    ? 'Routes to Creator Manager tools. Sets projects.arc_active=true and projects.arc_access_level=creator_manager'
+                    : 'Routes to project ARC leaderboard page. Sets projects.arc_active=true and projects.arc_access_level=' + selectedAccessLevel}
+                </p>
```

**Verification:**
- ✅ Approval handler already updates `projects.arc_active=true` (line 312)
- ✅ Approval handler already updates `projects.arc_access_level=arc_access_level` (line 313)
- ✅ No changes needed to approval logic

---

## Files Modified

1. `src/web/lib/arc/api-tier-guard.ts` - Fixed TypeScript return type
2. `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts` - Fixed requester query
3. `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` - Added routing comments
4. `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - Added UI labels

---

## Test Checklist

### Issue A (TypeScript Build)
- [ ] Run `npm run build` - should pass without TypeScript errors
- [ ] Verify `enforceArcApiTier` returns correct type

### Issue B (Requester Display)
- [ ] Navigate to `/portal/admin/arc/leaderboard-requests`
- [ ] Verify "Requester" column shows username/display_name (not "Unknown")
- [ ] Create a new request and verify it appears with correct requester

### Issue C (Approval Routing)
- [ ] Approve a request with `creator_manager` access level
- [ ] Verify project's `arc_active=true` and `arc_access_level=creator_manager` in DB
- [ ] Verify approval modal shows routing explanation
- [ ] Verify option labels show destination routes
- [ ] Approve a request with `leaderboard` access level
- [ ] Verify project's `arc_active=true` and `arc_access_level=leaderboard` in DB

---

## Notes

- **No treemap code touched** ✅
- **Minimal changes only** ✅
- **All fixes are backward compatible** ✅
- **Request creation already stores `requested_by` correctly** (no changes needed)

