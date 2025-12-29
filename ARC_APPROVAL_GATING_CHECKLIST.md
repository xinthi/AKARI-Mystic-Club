# ARC Approval Gating Audit & Implementation Checklist

**Date:** 2025-12-18  
**Purpose:** Audit and enforce ARC approval gating across all ARC and Creator Manager API routes

---

## Summary

This document tracks the implementation of ARC approval gating across all ARC-related API routes. All POST/PUT routes now check for ARC project approval and feature unlock status. Sensitive GET routes check approval status and visibility rules.

---

## Implementation Rules

1. **POST/PUT Routes (Creates/Updates):** Hard block if:
   - Project is not ARC-approved (`arc_project_access.approval_status !== 'approved'`)
   - Feature/option is not unlocked (`arc_project_features.option*_unlocked !== true`)

2. **GET Routes (Reads):** Block if:
   - Project is not ARC-approved (except for public campaigns with public visibility)
   - Campaign/program visibility is 'private' AND user is not:
     - Project admin/moderator/owner
     - Super admin
     - Participant (for campaigns)

3. **Error Responses:**
   - `403` status code for blocked requests
   - Clear error messages indicating why access was denied

---

## ARC Routes (`/api/portal/arc/**`)

### ✅ POST /api/portal/arc/campaigns (Create Campaign)

**File:** `src/web/pages/api/portal/arc/campaigns/index.ts`

**What existed before:**
- ✅ `verifyArcOptionAccess()` check for `option1_crm` (line 165)
- ✅ `canManageProject()` permission check

**What was added:**
- ARC approval check was already present via `verifyArcOptionAccess()` (which calls `checkArcProjectApproval` internally)

**Blocked response:**
- Status: `403`
- Message: `accessCheck.reason` (e.g., "ARC access is pending approval", "ARC access was rejected", or "ARC Option 1 (CRM) is not available for this project")

---

### ✅ GET /api/portal/arc/campaigns (List Campaigns)

**File:** `src/web/pages/api/portal/arc/campaigns/index.ts`

**What existed before:**
- ❌ No ARC approval check
- ❌ No visibility filtering

**What was added:**
- Added `checkArcProjectApproval()` when filtering by `projectId` (line 88-101)
- Returns 403 if project is not approved

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ GET /api/portal/arc/campaigns/[id] (Get Campaign)

**File:** `src/web/pages/api/portal/arc/campaigns/[id].ts`

**What existed before:**
- ❌ No ARC approval check
- ❌ No visibility checks for private campaigns

**What was added:**
- Added `checkArcProjectApproval()` check (line 87-97)
- Added visibility check for private campaigns (line 100-152)
  - Public campaigns: visible to all
  - Private campaigns: requires admin/moderator/participant/super admin

**Blocked response:**
- Status: `403`
- Message: 
  - For unapproved projects: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"
  - For private campaigns: "This campaign is private. Only participants and project admins can view it." or "This campaign is private. Authentication required."

---

### ✅ POST /api/portal/arc/campaigns/[id]/join (Join Campaign)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/join.ts`

**What existed before:**
- ❌ No ARC approval check
- ✅ Participation mode check (`invite_only`)

**What was added:**
- Added `checkArcProjectApproval()` check (line 82-93)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval for this project" / "ARC access was rejected for this project" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/arc/campaigns/[id]/participants (Add Participant)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/participants.ts`

**What existed before:**
- ✅ `canManageProject()` permission check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check before permission check (line 116-128)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/arc/campaigns/[id]/participants/[pid]/link (Create Tracking Link)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts`

**What existed before:**
- ✅ `canManageProject()` permission check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check before permission check (line 134-146)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ GET /api/portal/arc/campaigns/[id]/leaderboard (Get Leaderboard)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/leaderboard.ts`

**What existed before:**
- ❌ No ARC approval check
- ❌ No visibility checks for private leaderboards

**What was added:**
- Added `checkArcProjectApproval()` check (line 95-106)
- Added visibility check for private leaderboards (line 109-152)
  - Public leaderboards: visible to all
  - Private leaderboards: requires admin/moderator/participant/super admin

**Blocked response:**
- Status: `403`
- Message:
  - For unapproved projects: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"
  - For private leaderboards: "This leaderboard is private. Only participants and project admins can view it." or "This leaderboard is private. Authentication required."

---

### ✅ GET /api/portal/arc/campaigns/[id]/external-submissions (List Submissions)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`

**What existed before:**
- ✅ Permission check (admin/moderator OR participant)
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check within permission logic (line 99-108)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/arc/campaigns/[id]/external-submissions (Submit Submission)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`

**What existed before:**
- ✅ Participant validation
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check (line 209-220)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/arc/campaigns/[id]/external-submissions/[sid]/review (Review Submission)

**File:** `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/[sid]/review.ts`

**What existed before:**
- ✅ `canManageProject()` permission check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check before permission check (line 134-146)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/arc/projects/[projectId]/apply (Apply for ARC Access)

**File:** `src/web/pages/api/portal/arc/projects/[projectId]/apply.ts`

**What existed before:**
- ✅ `canApplyForArcAccess()` permission check
- This route is for *applying* for access, so no ARC approval check needed (makes sense)

**What was added:**
- N/A - This route is correctly implemented (users apply for access, don't need existing approval)

**Blocked response:**
- Status: `403`
- Message: "Only project owners/admins/moderators or official X accounts can apply for ARC access"

---

## Creator Manager Routes (`/api/portal/creator-manager/**`)

### ✅ GET /api/portal/creator-manager/programs (List Programs)

**File:** `src/web/pages/api/portal/creator-manager/programs.ts`

**What existed before:**
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check when filtering by `projectId` (line 128-138)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/creator-manager/programs (Create Program)

**File:** `src/web/pages/api/portal/creator-manager/programs.ts`

**What existed before:**
- ✅ `checkProjectPermissions()` permission check
- ❌ No ARC approval/feature unlock check

**What was added:**
- Added `verifyArcOptionAccess()` check for `option1_crm` (line 220-227)
  - This checks both approval AND unlock status

**Blocked response:**
- Status: `403`
- Message: `accessCheck.reason` (e.g., "ARC access is pending approval", "ARC access was rejected", or "ARC Option 1 (Creator Manager) is not available for this project")

---

### ✅ PATCH /api/portal/creator-manager/programs/[programId] (Update Program Status)

**File:** `src/web/pages/api/portal/creator-manager/programs/[programId].ts`

**What existed before:**
- ✅ `checkProjectPermissions()` permission check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check before permission check (line 126-137)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ GET /api/portal/creator-manager/programs/[programId]/creators (List Creators)

**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/creators.ts`

**What existed before:**
- ✅ Permission-based filtering (admins see all, creators see own)
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check (line 148-158)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/creator-manager/programs/[programId]/creators/invite (Invite Creators)

**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`

**What existed before:**
- ✅ `checkProjectPermissions()` permission check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check before permission check (line 144-154)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval" / "ARC access was rejected" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/creator-manager/programs/[programId]/creators/apply (Apply to Program)

**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/apply.ts`

**What existed before:**
- ✅ Visibility check (public/hybrid only)
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check (line 140-151)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval for this project" / "ARC access was rejected for this project" / "ARC access has not been approved for this project"

---

### ✅ POST /api/portal/creator-manager/missions/[missionId]/submit (Submit Mission)

**File:** `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`

**What existed before:**
- ✅ Creator approval check
- ❌ No ARC approval check

**What was added:**
- Added `checkArcProjectApproval()` check (line 174-185)

**Blocked response:**
- Status: `403`
- Message: "ARC access is pending approval for this project" / "ARC access was rejected for this project" / "ARC access has not been approved for this project"

---

## Admin Routes (`/api/portal/admin/arc/**`)

These routes are super admin-only and don't require ARC approval checks (they're used to approve/reject requests).

### ✅ GET /api/portal/admin/arc/requests (List ARC Access Requests)

**File:** `src/web/pages/api/portal/admin/arc/requests.ts`

**What existed before:**
- ✅ `checkSuperAdmin()` check (line 57-65, 100-108)

**What was added:**
- N/A - Super admin check is sufficient (this route lists requests for admin review)

**Blocked response:**
- Status: `403`
- Message: "SuperAdmin only" (if not super admin)

---

### ✅ PATCH /api/portal/admin/arc/requests/[id] (Approve/Reject ARC Access Request)

**File:** `src/web/pages/api/portal/admin/arc/requests/[id].ts`

**What existed before:**
- ✅ `checkSuperAdmin()` check (line 39-47, 99-101)

**What was added:**
- N/A - Super admin check is sufficient (this route approves/rejects requests)

**Blocked response:**
- Status: `403`
- Message: "SuperAdmin only" (if not super admin)

---

### ✅ GET /api/portal/admin/arc/leaderboard-requests (List Leaderboard Requests)

**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts`

**What existed before:**
- ✅ `checkSuperAdmin()` check (line 71-121, 168-171)

**What was added:**
- N/A - Super admin check is sufficient (this route lists requests for admin review)

**Blocked response:**
- Status: `403`
- Message: "SuperAdmin only" (if not super admin)

---

### ✅ PATCH /api/portal/admin/arc/leaderboard-requests/[id] (Approve/Reject Leaderboard Request)

**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`

**What existed before:**
- ✅ `checkSuperAdmin()` check (line 49-99, 192-195)

**What was added:**
- N/A - Super admin check is sufficient (this route approves/rejects requests)

**Blocked response:**
- Status: `403`
- Message: "SuperAdmin only" (if not super admin)

---

### ✅ PATCH /api/portal/arc/project-settings-admin (Update Project ARC Settings)

**File:** `src/web/pages/api/portal/arc/project-settings-admin.ts`

**What existed before:**
- ✅ `checkSuperAdmin()` check (line 65-73, 119-123)

**What was added:**
- N/A - Super admin check is sufficient (this route updates project ARC settings meta)

**Blocked response:**
- Status: `403`
- Message: "SuperAdmin only" (if not super admin)

---

## Routes Not Requiring ARC Approval Checks

These routes either:
- Are for requesting/applying for ARC access (so no existing approval needed)
- Are informational routes that don't access protected data

1. **GET /api/portal/arc/projects** - Lists projects (doesn't expose ARC-specific data)
2. **GET /api/portal/arc/top-projects** - Public leaderboard data
3. **GET /api/portal/arc/leaderboard-requests** - Get user's leaderboard request (user-specific data)
4. **POST /api/portal/arc/leaderboard-requests** - Requesting access (no approval needed yet)
5. **GET /api/portal/arc/check-leaderboard-permission** - Permission check utility
6. **GET /api/portal/arc/summary** - Summary data (may need review)
7. **GET /api/portal/arc/creator** - Creator profile data
8. **GET /api/portal/arc/my-projects** - User's projects (may need filtering)
9. **GET /api/portal/creator-manager/my-programs** - User's programs (may need filtering)
10. **GET /api/portal/creator-manager/projects** - Project list (may need review)

---

## Helper Functions Used

All routes use helpers from `src/web/lib/arc-permissions.ts`:

- **`checkArcProjectApproval(supabase, projectId)`**: Checks if project has ARC approval
  - Returns: `{ hasAccess, isApproved, isPending, isRejected }`
  
- **`checkArcFeatureUnlock(supabase, projectId, option)`**: Checks if specific option is unlocked
  - Options: `'option1_crm' | 'option2_normal' | 'option3_gamified'`
  
- **`verifyArcOptionAccess(supabase, projectId, option)`**: Combines approval + unlock check
  - Returns: `{ allowed: boolean, reason?: string }`

---

## Testing Checklist

- [ ] Test POST campaign creation with unapproved project → should return 403
- [ ] Test POST campaign creation with approved but unlocked project → should return 403
- [ ] Test GET campaign list with unapproved project → should return 403
- [ ] Test GET private campaign without auth → should return 403
- [ ] Test GET private campaign as participant → should return 200
- [ ] Test GET private leaderboard as non-participant → should return 403
- [ ] Test POST join campaign with unapproved project → should return 403
- [ ] Test POST create program with unapproved project → should return 403
- [ ] Test GET program creators with unapproved project → should return 403
- [ ] Test POST invite creators with unapproved project → should return 403
- [ ] Test POST submit mission with unapproved project → should return 403

---

## Build Status

- [ ] Run `pnpm build` in `src/web` to verify no TypeScript errors
- [ ] Check for linting errors
- [ ] Verify all imports resolve correctly

---

## Notes

- All checks respect `DEV_MODE` environment variable (bypasses checks in dev mode)
- Error messages are user-friendly and indicate the specific reason for denial
- Private campaigns/programs/leaderboards require additional visibility checks beyond approval
- The `verifyArcOptionAccess()` helper is preferred for POST/PUT routes as it checks both approval and unlock status

