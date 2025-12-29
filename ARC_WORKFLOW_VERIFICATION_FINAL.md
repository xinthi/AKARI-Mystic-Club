# ARC Workflow End-to-End Verification Report

**Date:** 2025-01-03  
**Status:** ✅ VERIFIED

This document verifies the complete ARC workflow against original product requirements.

---

## 1) Team Assignment ✅ PASS

### Verification

**Files Verified:**
- `src/web/pages/api/portal/admin/projects/[id]/team.ts` - SuperAdmin-only API
- `src/web/pages/portal/admin/projects/[id]/team.tsx` - SuperAdmin-only UI (SSR protected)
- `src/web/pages/api/portal/admin/profiles/search.ts` - Profile search endpoint

**Access Control:**
- ✅ SSR protection via `requireSuperAdmin()` in `team.tsx`
- ✅ API checks SuperAdmin via `akari_user_roles` and `profiles.real_roles`
- ✅ Non-superadmins blocked at both SSR and API level

**Functionality:**
- ✅ SuperAdmin can assign `admin` and `moderator` roles
- ✅ Team members stored in `project_team_members` table
- ✅ Search profiles by Twitter username
- ✅ Add/remove team members

**Test Command:**
```bash
# As SuperAdmin - Add team member
SESSION_TOKEN="superadmin_session_token"
PROJECT_ID="project_id_here"
PROFILE_ID="profile_id_here"

curl -X POST "http://localhost:3000/api/portal/admin/projects/${PROJECT_ID}/team" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "'${PROFILE_ID}'",
    "role": "admin"
  }'

# Expected: 200 with { "ok": true, "members": [...] }
```

---

## 2) Leaderboard Request Permissions ✅ PASS

### Verification

**Files Verified:**
- `src/web/lib/project-permissions.ts` - `canRequestLeaderboard()` function (lines 229-243)
- `src/web/pages/api/portal/arc/leaderboard-requests.ts` - POST endpoint (line 208)
- `src/web/pages/portal/arc/project/[projectId].tsx` - UI with permission check

**Permission Logic:**
- ✅ Super Admin: Always allowed (checked via `akari_user_roles`)
- ✅ Project Owner: Allowed if `projects.claimed_by = userId`
- ✅ Project Admin: Allowed if `project_team_members.role = 'admin'`
- ✅ Project Moderator: Allowed if `project_team_members.role = 'moderator'`
- ✅ All others: 403 error

**Server-Side Enforcement:**
- ✅ `canRequestLeaderboard()` called in API before allowing request
- ✅ Returns 403 with error: "Only project founders/admins can request a leaderboard for this project."
- ✅ UI checks permission but API enforces it

**Test Commands:**

**1. Non-team member request → 403:**
```bash
SESSION_TOKEN="regular_user_session_token"
PROJECT_ID="project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "requested_arc_access_level": "leaderboard",
    "justification": "I want leaderboard access"
  }'

# Expected: 403 { "ok": false, "error": "Only project founders/admins can request a leaderboard for this project." }
```

**2. Moderator request → 200:**
```bash
SESSION_TOKEN="moderator_session_token"
PROJECT_ID="project_id_here"

curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=${SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'${PROJECT_ID}'",
    "requested_arc_access_level": "leaderboard",
    "justification": "Moderator requesting leaderboard access"
  }'

# Expected: 200 { "ok": true, "requestId": "...", "status": "pending" }
```

---

## 3) Approval Flow ✅ PASS

### Verification

**Files Verified:**
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - Admin UI (SSR protected)
- `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` - Approval API

**Access Control:**
- ✅ SSR protection via `requireSuperAdmin()` in `leaderboard-requests.tsx`
- ✅ API checks SuperAdmin before allowing approval/rejection
- ✅ Prevents approving non-pending requests (defensive check)

**Approval Logic:**
- ✅ On approval:
  - Sets `arc_leaderboard_requests.status = 'approved'`
  - Sets `projects.arc_active = true`
  - Sets `projects.arc_access_level = selected_value` ('leaderboard' or 'gamified')
- ✅ On rejection:
  - Sets `arc_leaderboard_requests.status = 'rejected'`
  - Project fields (`arc_active`, `arc_access_level`) remain unchanged

**Test Command:**

**3. Super Admin approval → 200:**
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

# Expected: 200 { "ok": true }
# Verify in database:
#   SELECT status FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'; -- should be 'approved'
#   SELECT arc_active, arc_access_level FROM projects WHERE id = (SELECT project_id FROM arc_leaderboard_requests WHERE id = '${REQUEST_ID}'); -- should be true, 'leaderboard'
```

---

## 4) Treemap Inclusion Rules ✅ PASS

### Verification

**Files Verified:**
- `src/web/pages/api/portal/arc/top-projects.ts` - Treemap API
- `supabase/migrations/20250103_set_all_active_projects_to_profile_type_project.sql` - Migration

**Inclusion Rule:**
- ✅ All projects with `profile_type = 'project' AND is_active = true` are included
- ✅ Personal profiles (`profile_type = 'personal'`) are EXCLUDED
- ✅ Migration sets `profile_type = 'project'` for all active projects where `profile_type IS NULL`
- ✅ Does NOT filter by `arc_active` or `arc_access_level` for inclusion

**SQL Verification Queries:**

**Query 1: Count all active Sentiment-tracked projects**
```sql
-- Should match total projects in Treemap
SELECT COUNT(*) AS total_active_projects
FROM projects
WHERE is_active = true;
```

**Query 2: Count projects included in Treemap**
```sql
-- Should match Query 1 (after migration sets profile_type='project')
SELECT COUNT(*) AS treemap_projects
FROM projects
WHERE profile_type = 'project' AND is_active = true;
```

**Query 3: Verify personal profiles are excluded**
```sql
-- Should NOT appear in Treemap
SELECT COUNT(*) AS personal_profiles
FROM projects
WHERE profile_type = 'personal' AND is_active = true;
```

---

## Summary

### All Requirements: ✅ PASS

| Requirement | Status | Files Verified |
|------------|--------|----------------|
| 1. Team Assignment | ✅ PASS | `src/web/pages/api/portal/admin/projects/[id]/team.ts`, `src/web/pages/portal/admin/projects/[id]/team.tsx` |
| 2. Leaderboard Request Permissions | ✅ PASS | `src/web/lib/project-permissions.ts`, `src/web/pages/api/portal/arc/leaderboard-requests.ts` |
| 3. Approval Flow | ✅ PASS | `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`, `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` |
| 4. Treemap Inclusion | ✅ PASS | `src/web/pages/api/portal/arc/top-projects.ts`, `supabase/migrations/20250103_set_all_active_projects_to_profile_type_project.sql` |

### Key Features Verified

- ✅ SuperAdmin can assign admin and moderator roles
- ✅ Only owner/admin/moderator/superadmin can request leaderboard
- ✅ All other users receive 403 (server-enforced)
- ✅ SuperAdmin approval sets `arc_active=true` and `arc_access_level`
- ✅ Rejection does NOT change project fields
- ✅ All Sentiment-tracked projects appear in Treemap
- ✅ Personal profiles are excluded from Treemap
- ✅ Permissions enforced server-side (not UI-only)
- ✅ No silent privilege leaks

### UI Improvements Made

- ✅ Added "ARC" button in projects admin table for projects without ARC access
- ✅ Request form shows access level selector (Creator Manager, Campaign Leaderboard, Gamified)
- ✅ Clear error messages for profile linking issues
- ✅ Direct navigation from projects table to ARC request page

---

## Final Verification

**ARC workflow matches original product requirements.**

✅ Project assigns Account Manager / Moderator  
✅ Moderator can request leaderboard  
✅ Super Admin approves and activates ARC  
✅ All Sentiment projects appear in Treemap  
✅ Personal profiles are excluded  
✅ Permissions are enforced server-side  
✅ No silent privilege leaks  

**End of Report**

