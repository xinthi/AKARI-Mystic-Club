# TASK 3: UI FIX — IMPLEMENTATION SUMMARY

**Status:** ✅ COMPLETE (Steps A & B)  
**Date:** 2025-01-XX

---

## ROOT CAUSE ANALYSIS

**File:** `ARC_TASK3_ROOT_CAUSE.md`

**Issue:** `/portal/arc/mysticheros` showed "ARC is not enabled" even though unified state API returned `leaderboard.enabled=true`.

**Root Cause:**
- Page fetched from `/api/portal/arc/projects` which queries `project_arc_settings.is_arc_enabled`
- Unified state uses `arc_project_features` modules (different table)
- Projects with modules enabled but no `project_arc_settings` row were not found

---

## CHANGES MADE

### File: `src/web/pages/portal/arc/[slug].tsx`

#### Step A: Fixed Project Resolution & Enablement Check

**Changes:**
1. **Resolve project by slug directly:**
   - Changed from fetching all projects and filtering by slug
   - Now uses `/api/portal/arc/project/[slug]` to get project directly

2. **Fetch unified state:**
   - Added call to `/api/portal/arc/state?projectId=<id>`
   - Checks if any module is enabled before showing project
   - Falls back gracefully if unified state API fails

3. **Updated state management:**
   - Added `projectId` state to store resolved project ID
   - Added `unifiedState` state to store module enablement state
   - Added `isProjectAdmin` state for permission checks

**Code Changes:**
- Lines 178-295: Updated `fetchProject` useEffect to:
  - Resolve project by slug via API
  - Fetch unified state
  - Check module enablement
  - Build `ArcProject` object from resolved project data

---

#### Step B: Fixed Leaderboard Navigation & Added Module Buttons

**Changes:**
1. **Added "View Leaderboard" button:**
   - Shows when `leaderboard.enabled=true` AND active arena exists
   - Links to `/portal/arc/[slug]/arena/[arenaSlug]`
   - Finds active arena by checking `status='active'` and date range

2. **Added CRM button:**
   - Shows "Creator Manager" for project admins/superadmins
   - Shows "Apply as Creator" for regular users (if visibility is public/hybrid)
   - Links to `/portal/arc/creator-manager?projectId=<id>`

3. **Added GameFi button:**
   - Shows "GameFi (Coming soon)" when `gamefi_enabled=true`
   - Disabled/grayed out (not clickable)

4. **Added admin dashboard button:**
   - "Leaderboard Dashboard" for project admins/superadmins
   - Links to `/portal/arc/admin/[slug]`
   - Only shows when leaderboard module is enabled

**Code Changes:**
- Lines 706-803: Updated CTA buttons section to include:
  - Module-specific buttons based on unified state
  - Admin buttons based on user permissions
  - Original CTA buttons (Follow/Join/View missions)

---

#### Additional Fixes

1. **Updated arenas fetch:**
   - Uses `projectId` instead of relying on slug only
   - More reliable project resolution

2. **Updated user status fetch:**
   - Uses `projectId` for consistency

3. **Updated join campaign handler:**
   - Uses `projectId` for consistency

4. **Updated error display:**
   - Shows error message from unified state check
   - Only shows "ARC not enabled" when no modules are enabled

---

## KEY FEATURES

### Module Button Logic

**Leaderboard:**
- Visible when: `unifiedState.modules.leaderboard.enabled === true`
- Requires: Active arena exists (status='active' and dates valid)
- Links to: `/portal/arc/[slug]/arena/[arenaSlug]`

**CRM:**
- Visible when: `unifiedState.modules.crm.enabled === true`
- AND: `isProjectAdmin === true` OR `crm.visibility !== 'private'`
- Links to: `/portal/arc/creator-manager?projectId=<id>`
- Text: "Creator Manager" (admin) or "Apply as Creator" (public)

**GameFi:**
- Visible when: `unifiedState.modules.gamefi.enabled === true`
- Always disabled: "GameFi (Coming soon)"

**Admin Dashboard:**
- Visible when: `isProjectAdmin === true` AND `leaderboard.enabled === true`
- Links to: `/portal/arc/admin/[slug]`

---

## ACTIVE ARENA DETECTION

**Logic:**
```typescript
const activeArena = arenas.find(a => 
  a.status === 'active' && 
  (!a.starts_at || new Date(a.starts_at) <= new Date()) && 
  (!a.ends_at || new Date(a.ends_at) >= new Date())
);
```

**Requirements:**
- Arena status must be `'active'`
- Current time must be >= `starts_at` (if set)
- Current time must be <= `ends_at` (if set)

---

## PERMISSION CHECKS

**Current Implementation:**
- `isProjectAdmin`: Checks if user is super admin (using `isSuperAdmin()` helper)
- Can be expanded later to check project owner/admin/mod roles

**Future Enhancement:**
- Add API endpoint or client-side check for project team roles
- Use `checkProjectPermissions()` helper for full permission check

---

## BACKWARD COMPATIBILITY

✅ **Maintained:**
- Projects without `arc_project_features` rows fall back to legacy fields
- Unified state API handles missing rows gracefully
- Existing UI components still work
- No breaking changes to routes or APIs

---

## TESTING NOTES

### Manual Test Required:
1. Navigate to `/portal/arc/mysticheros`
2. Verify page loads (not "ARC not enabled")
3. Verify "View Leaderboard" button appears
4. Click button → verify navigates to arena page
5. Verify arena page shows creators

### Expected Behavior:
- ✅ Unified state API called: `/api/portal/arc/state?projectId=<id>`
- ✅ Response shows `leaderboard.enabled=true`, `leaderboard.active=true`
- ✅ Page displays project content
- ✅ "View Leaderboard" button visible and functional

---

## KNOWN LIMITATIONS

1. **Permission Check:**
   - Currently only checks `isSuperAdmin()`
   - Does not check project owner/admin/mod roles yet
   - Admin buttons may not show for project owners/admins who aren't superadmins

2. **GameFi:**
   - Button shows but feature not implemented (as expected)
   - Tables don't exist yet (not in scope)

3. **CRM Visibility:**
   - Visibility check is basic (only checks if admin OR visibility !== 'private')
   - Full participant check not implemented (would require checking `arc_campaign_participants`)

---

## FILES MODIFIED

1. `src/web/pages/portal/arc/[slug].tsx`
   - Updated project fetching logic
   - Added unified state fetching
   - Added module-specific buttons
   - Updated navigation logic

---

## NEXT STEPS (NOT IN TASK 3)

- Expand permission checks to include project owner/admin/mod roles
- Implement GameFi tables and features (separate task)
- Add participant check for CRM visibility (check if user is in campaign)

---

**END OF IMPLEMENTATION SUMMARY**

