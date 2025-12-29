# TASK 3: UI FIX — TEST CHECKLIST

**Status:** ✅ Step A & B Implementation Complete  
**Date:** 2025-01-XX

---

## DELIVERABLES

### ✅ Files Modified
1. `src/web/pages/portal/arc/[slug].tsx` — Fixed project resolution and added module buttons

### ✅ Root Cause Analysis
**File:** `ARC_TASK3_ROOT_CAUSE.md`

**Root Cause:**
- Page was fetching from `/api/portal/arc/projects` which queries `project_arc_settings.is_arc_enabled`
- Unified state uses `arc_project_features` modules (separate table)
- Projects with modules enabled but no `project_arc_settings` row were not shown

**Fix:**
- Resolve project by slug directly from `projects` table
- Fetch unified state via `/api/portal/arc/state?projectId=<id>`
- Show project if ANY module is enabled

---

## TESTING CHECKLIST

### Test 1: Project with Leaderboard Module Enabled
**Setup:**
- Project: MysticHeroes (slug: `mysticheros`)
- `arc_project_features`: `leaderboard_enabled=true`, valid dates
- Active arena exists with slug `mysticheros-main`

**Test Steps:**
1. Navigate to `/portal/arc/mysticheros`
2. Check unified state API: `GET /api/portal/arc/state?projectId=<id>`

**Expected Results:**
- ✅ Page loads (does NOT show "ARC is not enabled")
- ✅ Unified state API returns `leaderboard.enabled=true`, `leaderboard.active=true`
- ✅ "View Leaderboard" button appears
- ✅ Button links to `/portal/arc/mysticheros/arena/mysticheros-main`
- ✅ Arena page shows creators from `arena_creators` table

---

### Test 2: Project with Multiple Modules Enabled
**Setup:**
- Project with `leaderboard_enabled=true`, `crm_enabled=true`, `gamefi_enabled=true`

**Expected Results:**
- ✅ "View Leaderboard" button appears
- ✅ "Creator Manager" or "Apply as Creator" button appears (depending on user role)
- ✅ "GameFi (Coming soon)" button appears (disabled)
- ✅ All buttons styled correctly

---

### Test 3: Project without arc_project_features Row (Legacy Fallback)
**Setup:**
- Project WITHOUT `arc_project_features` row
- `projects.arc_access_level='leaderboard'`, `arc_active=true`

**Expected Results:**
- ✅ Page loads successfully
- ✅ Unified state API falls back to legacy fields
- ✅ Leaderboard button appears (if legacy indicates enabled)
- ✅ Navigation works correctly

---

### Test 4: Project Admin/SuperAdmin View
**Setup:**
- Project with `leaderboard_enabled=true`
- User is project admin/mod/owner OR superadmin

**Expected Results:**
- ✅ "View Leaderboard" button (public)
- ✅ "Leaderboard Dashboard" button (admin only) → links to `/portal/arc/admin/[slug]`
- ✅ "Creator Manager" button (not "Apply as Creator") if CRM enabled

---

### Test 5: CRM Visibility Modes
**Setup A:** CRM with `visibility='private'`
- ✅ Only project admins/mods/owners and superadmins see "Creator Manager" button
- ✅ Regular users do NOT see CRM button

**Setup B:** CRM with `visibility='public'`
- ✅ All users see "Apply as Creator" button

**Setup C:** CRM with `visibility='hybrid'`
- ✅ All users see "Apply as Creator" button

---

### Test 6: Leaderboard Button - Active Arena Check
**Setup A:** Active arena exists
- ✅ "View Leaderboard" button appears
- ✅ Links to correct arena page

**Setup B:** No active arena (all ended or none exist)
- ✅ "View Leaderboard" button does NOT appear
- ✅ No broken links

**Setup C:** Arena exists but not yet started (future dates)
- ✅ "View Leaderboard" button does NOT appear (arena not active)

---

### Test 7: GameFi Module
**Setup:** Project with `gamefi_enabled=true`

**Expected Results:**
- ✅ "GameFi (Coming soon)" button appears (disabled/grayed out)
- ✅ Button is not clickable
- ✅ Does NOT crash or error

---

### Test 8: No Modules Enabled
**Setup:** Project with all modules disabled OR no `arc_project_features` row and legacy `arc_access_level='none'`

**Expected Results:**
- ✅ Shows "ARC is not enabled for this project" message
- ✅ Does NOT show project content
- ✅ Error message is clear

---

### Test 9: Navigation to Arena Page
**Steps:**
1. Click "View Leaderboard" button
2. Should navigate to `/portal/arc/mysticheros/arena/mysticheros-main`

**Expected Results:**
- ✅ Navigation works
- ✅ Arena page loads
- ✅ Creators list displays from `arena_creators` table
- ✅ Creator points/rankings are visible

---

### Test 10: Backward Compatibility
**Setup:** Legacy projects using old `arc_access_level` system

**Expected Results:**
- ✅ Page still works
- ✅ Falls back to legacy fields correctly
- ✅ Buttons appear based on legacy `arc_access_level` mapping
- ✅ No breaking changes

---

## MANUAL TESTING STEPS

1. **Test MysticHeroes project:**
   ```
   GET /api/portal/arc/state?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
   ```
   - Verify response shows `leaderboard.enabled=true`, `leaderboard.active=true`
   - Navigate to `/portal/arc/mysticheros`
   - Verify page loads (not "ARC is not enabled")
   - Verify "View Leaderboard" button appears
   - Click button → should go to `/portal/arc/mysticheros/arena/mysticheros-main`
   - Verify arena page shows creators from `arena_creators`

2. **Test project without modules:**
   - Navigate to `/portal/arc/[slug]` for project with no enabled modules
   - Verify shows "ARC is not enabled" message

3. **Test admin view:**
   - As superadmin or project admin, verify "Leaderboard Dashboard" button appears
   - Verify "Creator Manager" button shows (not "Apply as Creator")

---

## VERIFICATION CHECKLIST

- [ ] Page resolves project by slug correctly
- [ ] Unified state API is called and used for enablement check
- [ ] "ARC is not enabled" only shows when no modules are enabled
- [ ] "View Leaderboard" button appears when leaderboard module enabled
- [ ] Button links to correct arena page route
- [ ] Arena page displays creators correctly
- [ ] CRM button appears based on visibility mode
- [ ] GameFi button shows as "Coming soon" when enabled
- [ ] Admin buttons appear for project admins/superadmins
- [ ] Backward compatibility maintained (legacy projects work)
- [ ] No linting errors
- [ ] No console errors in browser

---

**END OF TEST CHECKLIST**

