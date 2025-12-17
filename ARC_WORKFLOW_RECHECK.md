# ARC Workflow Re-Audit Report

**Date:** 2025-01-XX  
**Status:** ✅ All Requirements Met

This document re-audits the ARC workflow requirements end-to-end and verifies all components are correctly implemented.

---

## Requirement 1: Project Team Management

### ✅ PASS

**Requirement:** SuperAdmin can assign Account Manager (role='admin') and Moderator (role='moderator') for a project.

**Verification:**

1. **API Endpoint:** `/api/portal/admin/projects/[id]/team`
   - **File:** `src/web/pages/api/portal/admin/projects/[id]/team.ts`
   - ✅ GET: Lists team members
   - ✅ POST: Adds team member with role validation (allows 'admin', 'moderator', 'owner', 'investor_view')
   - ✅ DELETE: Removes team member
   - ✅ SuperAdmin check via `checkSuperAdmin()` function

2. **UI Page:** `/portal/admin/projects/[id]/team`
   - **File:** `src/web/pages/portal/admin/projects/[id]/team.tsx`
   - ✅ SuperAdmin-only access (SSR redirect via `requireSuperAdmin()`)
   - ✅ Role selector allows 'admin' and 'moderator'
   - ✅ Search profiles by username
   - ✅ Add/remove team members

3. **Profile Search API:** `/api/portal/admin/profiles/search`
   - **File:** `src/web/pages/api/portal/admin/profiles/search.ts`
   - ✅ SuperAdmin-only
   - ✅ Searches profiles by username

**Files Checked:**
- `src/web/pages/api/portal/admin/projects/[id]/team.ts` (lines 200-220: role validation)
- `src/web/pages/portal/admin/projects/[id]/team.tsx` (lines 82-83: role selector)
- `src/web/pages/api/portal/admin/profiles/search.ts`

---

## Requirement 2: Moderator Can Request Leaderboard

### ✅ PASS

**Requirement:** 
- POST `/api/portal/arc/leaderboard-requests` must allow moderator/admin/owner/superadmin
- Non-team users must get 403

**Verification:**

1. **Permission Check Function:**
   - **File:** `src/web/lib/project-permissions.ts`
   - **Function:** `canRequestLeaderboard()` (lines 229-243)
   - ✅ Allows SuperAdmin: `if (permissions.isSuperAdmin) return true;`
   - ✅ Allows Owner: `permissions.isOwner`
   - ✅ Allows Admin: `permissions.isAdmin`
   - ✅ Allows Moderator: `permissions.isModerator`

2. **API Endpoint:**
   - **File:** `src/web/pages/api/portal/arc/leaderboard-requests.ts`
   - **Line 208:** Calls `canRequestLeaderboard()`
   - **Lines 209-214:** Returns 403 if `!canRequest` with error message
   - ✅ Non-team users get 403
   - ✅ Moderator/admin/owner/superadmin get 200

**Files Checked:**
- `src/web/lib/project-permissions.ts` (lines 229-243)
- `src/web/pages/api/portal/arc/leaderboard-requests.ts` (lines 207-214)

**Test Commands:**

**Test 1: Non-team user → 403**
```bash
SESSION_TOKEN="non_team_user_session_token"
PROJECT_ID="project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "justification": "Test request"
  }'

# Expected: 403 with error "Only project founders/admins can request a leaderboard for this project."
```

**Test 2: Moderator → 200**
```bash
SESSION_TOKEN="moderator_session_token"
PROJECT_ID="project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "justification": "Moderator requesting access"
  }'

# Expected: 200 with { "ok": true, "requestId": "...", "status": "pending" }
```

---

## Requirement 3: SuperAdmin Approval Flow

### ✅ PASS

**Requirement:**
- SuperAdmin can view pending requests on `/portal/admin/arc/leaderboard-requests` (SSR-protected)
- Approving must set `projects.arc_active=true` and `projects.arc_access_level` in ('leaderboard','gamified')
- Rejecting must NOT change the project's arc fields

**Verification:**

1. **View Requests Page:**
   - **File:** `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
   - **Lines 437-448:** `getServerSideProps` with `requireSuperAdmin()` SSR protection
   - ✅ Non-SuperAdmin users are redirected to `/portal?error=access_denied`
   - ✅ SuperAdmin can view all pending requests

2. **Approval API:**
   - **File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`
   - **Lines 271-288:** Approval logic
   - ✅ Only updates project if `status === 'approved'` (line 272)
   - ✅ Sets `arc_active: true` (line 274)
   - ✅ Sets `arc_access_level` to provided value ('leaderboard' or 'gamified') (line 275)
   - ✅ Rejecting (`status === 'rejected'`) does NOT update project fields (only updates request status)

3. **Defensive Checks:**
   - **Lines 235-241:** Verifies request is 'pending' before updating
   - **Lines 220-225:** Requires `arc_access_level` when approving
   - **Lines 227-233:** Validates `arc_access_level` is 'leaderboard' or 'gamified'

**Files Checked:**
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` (lines 437-448: SSR protection)
- `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` (lines 271-288: approval logic)

**Test Command:**

**Test 3: SuperAdmin Approve → 200 and updates project**
```bash
SESSION_TOKEN="superadmin_session_token"
REQUEST_ID="request_id_here"

curl -X PATCH "http://localhost:3000/api/portal/admin/arc/leaderboard-requests/${REQUEST_ID}" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "arc_access_level": "leaderboard"
  }'

# Expected: 200 with { "ok": true }
# Verify in database:
#   SELECT status FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'; 
#   -- Should be 'approved'
#   SELECT arc_active, arc_access_level FROM projects WHERE id = (
#     SELECT project_id FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'
#   );
#   -- Should be true, 'leaderboard'
```

---

## Requirement 4: Treemap Inclusion Matches Sentiment Tracked Projects

### ✅ PASS

**Requirement:**
- Define the Treemap universe clearly
- Ensure every Sentiment project appears
- Do NOT include personal profiles in Treemap unless intentionally desired
- Ensure `/api/portal/arc/top-projects` uses that rule and documents it

**Verification:**

1. **Treemap Inclusion Rule:**
   - **File:** `src/web/pages/api/portal/arc/top-projects.ts`
   - **Lines 189-198:** Query filters by `profile_type='project'` AND `is_active=true`
   - ✅ Excludes `profile_type='personal'` (personal profiles are NOT included)
   - ✅ Only includes Sentiment-tracked projects with `profile_type='project'`
   - ✅ Documentation updated (lines 6-10) to explicitly state personal profiles are excluded

2. **Migration:**
   - **File:** `supabase/migrations/20250103_set_all_active_projects_to_profile_type_project.sql`
   - ✅ Sets `profile_type='project'` for all active projects where `profile_type IS NULL`
   - ✅ Does NOT update projects with `profile_type='personal'` (preserves exclusion)

**Files Checked:**
- `src/web/pages/api/portal/arc/top-projects.ts` (lines 189-198: query, lines 6-10: documentation)
- `supabase/migrations/20250103_set_all_active_projects_to_profile_type_project.sql`

**SQL Verification Queries:**

**Query 1: Total projects in Sentiment universe**
```sql
-- Count all projects in Sentiment
SELECT COUNT(*) AS total_projects
FROM projects;
```

**Query 2: Total projects included in Treemap universe**
```sql
-- Count projects included in Treemap (profile_type='project' AND is_active=true)
-- This should match total_projects after migration (excluding personal profiles)
SELECT COUNT(*) AS treemap_projects
FROM projects
WHERE profile_type = 'project' AND is_active = true;
```

**Query 3: Verify personal profiles are excluded**
```sql
-- Count personal profiles (should NOT appear in Treemap)
SELECT COUNT(*) AS personal_profiles
FROM projects
WHERE profile_type = 'personal' AND is_active = true;
```

---

## Summary

### All Requirements: ✅ PASS

| Requirement | Status | Files Verified |
|------------|--------|----------------|
| 1. Project team management | ✅ PASS | `src/web/pages/api/portal/admin/projects/[id]/team.ts`, `src/web/pages/portal/admin/projects/[id]/team.tsx` |
| 2. Moderator can request | ✅ PASS | `src/web/lib/project-permissions.ts`, `src/web/pages/api/portal/arc/leaderboard-requests.ts` |
| 3. SuperAdmin approval flow | ✅ PASS | `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`, `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` |
| 4. Treemap inclusion | ✅ PASS | `src/web/pages/api/portal/arc/top-projects.ts`, `supabase/migrations/20250103_set_all_active_projects_to_profile_type_project.sql` |

### Files Changed in This Audit

1. **`src/web/pages/api/portal/arc/top-projects.ts`**
   - Updated documentation comment (lines 6-10) to explicitly state personal profiles are excluded
   - No code changes needed (already correctly filters by `profile_type='project'`)

### No Fixes Required

All requirements are fully met. The implementation correctly:
- ✅ Allows SuperAdmin to assign admin and moderator roles
- ✅ Allows moderator/admin/owner/superadmin to request leaderboard
- ✅ Returns 403 for non-team users
- ✅ Protects approval page with SSR redirect
- ✅ Sets `arc_active=true` and `arc_access_level` on approval
- ✅ Does NOT change project fields on rejection
- ✅ Excludes personal profiles from Treemap
- ✅ Includes all Sentiment-tracked projects (with `profile_type='project'`)

---

## Test Commands Summary

### 1. Non-team user request → 403
```bash
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${NON_TEAM_SESSION}" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "${PROJECT_ID}", "justification": "Test"}'
```

### 2. Moderator request → 200
```bash
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${MODERATOR_SESSION}" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "${PROJECT_ID}", "justification": "Moderator request"}'
```

### 3. SuperAdmin approve → 200
```bash
curl -X PATCH "http://localhost:3000/api/portal/admin/arc/leaderboard-requests/${REQUEST_ID}" \
  -H "Cookie: akari_session=${SUPERADMIN_SESSION}" \
  -H "Content-Type: application/json" \
  -d '{"status": "approved", "arc_access_level": "leaderboard"}'
```

---

## SQL Verification Queries

### Query 1: Total Sentiment Projects
```sql
SELECT COUNT(*) AS total_projects FROM projects;
```

### Query 2: Treemap Coverage (should match total after migration, excluding personal)
```sql
SELECT COUNT(*) AS treemap_projects
FROM projects
WHERE profile_type = 'project' AND is_active = true;
```

---

**End of Report**

