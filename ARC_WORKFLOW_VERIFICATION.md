# ARC Workflow End-to-End Verification Report

**Date:** 2025-01-XX  
**Status:** ✅ Complete

This document verifies the complete ARC workflow from team role assignment through leaderboard request approval, and ensures all Sentiment-tracked projects appear in the Treemap.

---

## A) Team Role Assignment

### ✅ Implementation Status: COMPLETE

#### Files Changed:

1. **`src/web/pages/api/portal/admin/projects/[id]/team.ts`** (NEW)
   - SuperAdmin-only API endpoint for managing team members
   - Supports GET (list), POST (add), DELETE (remove)
   - Validates SuperAdmin via `akari_user_roles` and `profiles.real_roles`

2. **`src/web/pages/api/portal/admin/profiles/search.ts`** (NEW)
   - SuperAdmin-only profile search endpoint
   - Used by team management UI to find profiles by username
   - Returns profile ID, username, name, profile_image_url

3. **`src/web/pages/portal/admin/projects/[id]/team.tsx`** (NEW)
   - SuperAdmin-only UI page for team management
   - Allows adding/removing team members with roles: `admin`, `moderator`
   - Uses SSR redirect via `requireSuperAdmin()` to protect access

#### Verification Steps:

1. **Access Team Management UI:**
   - Navigate to `/portal/admin/projects/[PROJECT_ID]/team` as SuperAdmin
   - Should see project name and current team members
   - Should see "Add Team Member" form

2. **Add Team Member:**
   - Search for a profile by username
   - Select role (admin or moderator)
   - Click "Add"
   - Verify member appears in "Current Team Members" list

3. **Remove Team Member:**
   - Click "Remove" button next to a team member
   - Verify member is removed from the list

4. **Permission Check:**
   - Try accessing `/portal/admin/projects/[PROJECT_ID]/team` as non-SuperAdmin
   - Should redirect to `/portal?error=access_denied`

#### API Endpoints:

- `GET /api/portal/admin/projects/[id]/team` - List team members
- `POST /api/portal/admin/projects/[id]/team` - Add team member (body: `{ profileId, role }`)
- `DELETE /api/portal/admin/projects/[id]/team` - Remove team member (body: `{ profileId, role }`)
- `GET /api/portal/admin/profiles/search?q=username` - Search profiles

---

## B) Moderator Leaderboard Request

### ✅ Implementation Status: VERIFIED

#### Files Verified:

1. **`src/web/lib/project-permissions.ts`**
   - ✅ `canRequestLeaderboard()` function exists (lines 229-243)
   - ✅ Allows: SuperAdmin OR Owner (`projects.claimed_by`) OR Admin (`project_team_members.role='admin'`) OR Moderator (`project_team_members.role='moderator'`)

2. **`src/web/pages/api/portal/arc/leaderboard-requests.ts`**
   - ✅ Calls `canRequestLeaderboard()` before allowing request (line 208)
   - ✅ Returns 403 if user cannot request (line 210-214)

3. **`src/web/pages/portal/arc/project/[projectId].tsx`**
   - ✅ Shows CTA button if `canRequest === true` (line 611-620)
   - ✅ Shows info box if `canRequest === false` (line 663-669)
   - ✅ Fetches permission via `/api/portal/arc/check-leaderboard-permission?projectId=...` (line ~500)

#### Test Helper Snippets:

**Test 1: Non-founder user → 403**
```bash
# Get session token from browser (DevTools → Application → Cookies → akari_session)
SESSION_TOKEN="your_session_token_here"
PROJECT_ID="your_project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "justification": "I want to request leaderboard access"
  }'

# Expected: 403 with error "Only project founders/admins can request a leaderboard for this project."
```

**Test 2: Moderator → 200**
```bash
# Ensure user is added as moderator via /portal/admin/projects/[PROJECT_ID]/team
# Then use that user's session token

SESSION_TOKEN="moderator_session_token_here"
PROJECT_ID="your_project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "justification": "Moderator requesting leaderboard access"
  }'

# Expected: 200 with { "ok": true, "requestId": "...", "status": "pending" }
```

**Test 3: Check Permission (Moderator)**
```bash
SESSION_TOKEN="moderator_session_token_here"
PROJECT_ID="your_project_id_here"

curl -X GET "http://localhost:3000/api/portal/arc/check-leaderboard-permission?projectId=${PROJECT_ID}" \
  -H "Cookie: akari_session=${SESSION_TOKEN}"

# Expected: 200 with { "ok": true, "canRequest": true }
```

---

## C) SuperAdmin Approval

### ✅ Implementation Status: VERIFIED & ENHANCED

#### Files Changed:

1. **`src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`**
   - ✅ Added defensive check: verifies request status is 'pending' before updating (line 235-241)
   - ✅ Requires `arc_access_level` when approving (line 220-225)
   - ✅ Validates `arc_access_level` is 'leaderboard' or 'gamified' (line 227-233)
   - ✅ Updates `arc_leaderboard_requests.status='approved'` (line 255)
   - ✅ Updates `projects.arc_active=true` (line 265)
   - ✅ Updates `projects.arc_access_level` to provided value (line 266)

2. **`src/web/pages/portal/admin/arc/leaderboard-requests.tsx`**
   - ✅ Protected by SSR redirect via `getServerSideProps` → `requireSuperAdmin()` (line 437-441)
   - ✅ Shows approval modal with `arc_access_level` selector (line 82-83, 405-427)
   - ✅ Calls PATCH endpoint with `status: 'approved'` and `arc_access_level` (line 172-179)

#### Verification Steps:

1. **Access Approval UI:**
   - Navigate to `/portal/admin/arc/leaderboard-requests` as SuperAdmin
   - Should see list of pending requests with project name, requester, justification

2. **Approve Request:**
   - Click "Approve" button on a pending request
   - Select access level: "Leaderboard" or "Gamified"
   - Click "Approve" in modal
   - Verify:
     - Request status changes to "approved"
     - Project `arc_active` is set to `true`
     - Project `arc_access_level` is set to selected value

3. **Permission Check:**
   - Try accessing `/portal/admin/arc/leaderboard-requests` as non-SuperAdmin
   - Should redirect to `/portal?error=access_denied`

#### Test Command:

**Approve Request:**
```bash
SESSION_TOKEN="superadmin_session_token_here"
REQUEST_ID="request_id_here"

curl -X PATCH "http://localhost:3000/api/portal/admin/arc/leaderboard-requests/${REQUEST_ID}" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "arc_access_level": "leaderboard"
  }'

# Expected: 200 with { "ok": true }
# Verify: Check database:
#   SELECT status FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'; -- should be 'approved'
#   SELECT arc_active, arc_access_level FROM projects WHERE id = (SELECT project_id FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'); -- should be true, 'leaderboard'
```

---

## D) All Sentiment Projects Show in Treemap

### ✅ Implementation Status: COMPLETE

#### Files Changed:

1. **`src/web/pages/api/portal/arc/top-projects.ts`**
   - ✅ Updated inclusion rule: removed `profile_type='project'` filter (line 188-197)
   - ✅ Now includes ALL projects where `is_active = true`
   - ✅ Updated documentation comment to reflect new rule (line 1-15)

#### Inclusion Rule (Final):

**Definition:** A "Sentiment tracked project" is any row in the `projects` table where `is_active = true`.

**Treemap Inclusion Rule:**
- ✅ All projects where `is_active = true` are included in ARC Treemap
- ✅ No filtering by `profile_type`, `arc_active`, or `arc_access_level` for inclusion
- ✅ If metrics are missing, `growth_pct = 0` (project is NOT dropped)

#### Verification SQL Queries:

**Query 1: Count projects that should appear in Treemap**
```sql
-- All active projects (these should ALL appear in Treemap)
SELECT 
  COUNT(*) as total_active_projects,
  COUNT(*) FILTER (WHERE profile_type = 'project') as classified_as_project,
  COUNT(*) FILTER (WHERE profile_type = 'personal') as classified_as_personal,
  COUNT(*) FILTER (WHERE profile_type IS NULL) as unclassified
FROM projects
WHERE is_active = true;
```

**Query 2: Verify Treemap inclusion universe**
```sql
-- List all projects that should appear in Treemap (all active projects)
SELECT 
  id,
  name,
  display_name,
  twitter_username,
  profile_type,
  is_active,
  arc_active,
  arc_access_level
FROM projects
WHERE is_active = true
ORDER BY name
LIMIT 100;
```

#### Verification Steps:

1. **Check API Response:**
   ```bash
   curl -X GET "http://localhost:3000/api/portal/arc/top-projects?mode=gainers&timeframe=7d&limit=50"
   
   # Expected: Returns ALL active projects (not just profile_type='project')
   # Count should match SQL query result above
   ```

2. **Verify in UI:**
   - Navigate to `/portal/arc`
   - Check "Top Projects" treemap
   - Should show all active projects from Sentiment

---

## Summary of Changes

### New Files Created:

1. `src/web/pages/api/portal/admin/projects/[id]/team.ts` - Team management API
2. `src/web/pages/api/portal/admin/profiles/search.ts` - Profile search API
3. `src/web/pages/portal/admin/projects/[id]/team.tsx` - Team management UI

### Files Modified:

1. `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`
   - Added defensive check for request status before updating
   - Reordered validation to fetch request before validating body

2. `src/web/pages/api/portal/arc/top-projects.ts`
   - Removed `profile_type='project'` filter
   - Updated to include ALL active projects
   - Updated documentation comment

### Files Verified (No Changes Needed):

1. `src/web/lib/project-permissions.ts` - ✅ `canRequestLeaderboard()` correctly implemented
2. `src/web/pages/api/portal/arc/leaderboard-requests.ts` - ✅ Calls `canRequestLeaderboard()` correctly
3. `src/web/pages/portal/arc/project/[projectId].tsx` - ✅ Shows CTA/info box based on `canRequest`
4. `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - ✅ Protected by SSR redirect

---

## Testing Checklist

### A) Team Role Assignment
- [ ] Access `/portal/admin/projects/[PROJECT_ID]/team` as SuperAdmin → Should load
- [ ] Access as non-SuperAdmin → Should redirect
- [ ] Search for profile → Should show results
- [ ] Add admin role → Should appear in list
- [ ] Add moderator role → Should appear in list
- [ ] Remove team member → Should disappear from list

### B) Moderator Leaderboard Request
- [ ] Non-founder requests → Should get 403
- [ ] Moderator requests → Should get 200 with request ID
- [ ] Check permission as moderator → Should return `canRequest: true`
- [ ] UI shows CTA for moderator → Should show "Request ARC Leaderboard" button
- [ ] UI shows info box for non-founder → Should show "Only project founders/admins..." message

### C) SuperAdmin Approval
- [ ] Access `/portal/admin/arc/leaderboard-requests` as SuperAdmin → Should load
- [ ] Access as non-SuperAdmin → Should redirect
- [ ] Approve request with leaderboard access → Should update status and project fields
- [ ] Try approving already-approved request → Should get 400 error
- [ ] Verify `arc_active=true` after approval → Should be set
- [ ] Verify `arc_access_level` after approval → Should match selected value

### D) Treemap Inclusion
- [ ] Check API returns all active projects → Should not filter by profile_type
- [ ] Verify unclassified projects appear → Should appear in treemap
- [ ] Verify personal projects appear → Should appear in treemap (if active)
- [ ] Count matches SQL query → Should match `SELECT COUNT(*) FROM projects WHERE is_active = true`

---

## Production Deployment Steps

1. **Deploy API changes:**
   - Deploy new API endpoints: `/api/portal/admin/projects/[id]/team`, `/api/portal/admin/profiles/search`
   - Deploy modified endpoints: `/api/portal/admin/arc/leaderboard-requests/[id]`, `/api/portal/arc/top-projects`

2. **Deploy UI changes:**
   - Deploy new page: `/portal/admin/projects/[id]/team`
   - Verify existing pages still work: `/portal/arc/project/[projectId]`, `/portal/admin/arc/leaderboard-requests`

3. **Database verification:**
   - No schema changes required (uses existing `project_team_members` table)
   - Run verification SQL queries to confirm project counts

4. **Test in production:**
   - Follow testing checklist above
   - Verify team management UI works
   - Verify leaderboard request flow works
   - Verify treemap shows all active projects

---

## Notes

- The team management API uses service role for database operations (RLS-safe)
- Profile search uses simple username matching (case-insensitive)
- All endpoints require SuperAdmin verification via `akari_user_roles` or `profiles.real_roles`
- Treemap inclusion rule changed: now includes ALL active projects, not just `profile_type='project'`
- Approval API now prevents updating non-pending requests (defensive check)

---

**End of Report**

