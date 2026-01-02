# ARC Access Rules Summary

**Date:** 2025-02-02  
**Purpose:** Document the new ARC access rules after implementing `is_arc_company` and separating READ vs MANAGE access

---

## Overview

ARC (Akari Reputation Circuit) has three product options:
- **Option 1 = CRM (Creator Manager)**: `arc_project_features.option1_crm_unlocked`
- **Option 2 = Normal Leaderboard (Mindshare)**: `arc_project_features.option2_normal_unlocked`
- **Option 3 = Gamified (GameFi)**: `arc_project_features.option3_gamified_unlocked`

Only **company/project profiles** (`projects.is_arc_company = true`) can participate in ARC leaderboards.

---

## 1. What Unlocks ARC Products (GET /api/portal/arc/projects)

**Requirements:**
- `arc_project_access.application_status = 'approved'`
- `projects.is_arc_company = true`

**Response:**
- Always returns a non-null `features` object (never null)
- If no `arc_project_features` row exists, returns all fields as `false`/`null`
- Features object includes:
  - `leaderboard_enabled`, `leaderboard_start_at`, `leaderboard_end_at`
  - `gamefi_enabled`, `gamefi_start_at`, `gamefi_end_at`
  - `crm_enabled`, `crm_start_at`, `crm_end_at`
  - `option1_crm_unlocked`, `option2_normal_unlocked`, `option3_gamified_unlocked`
  - `crm_visibility`

**Filtering:**
- Only returns projects where `is_arc_company = true`
- Only returns projects with approved ARC access

---

## 2. What Unlocks Arena READ Access

**Function:** `requireArcArenaReadAccess(arenaSlug)`

**Requirements:**
- Arena status is `'active'` OR `'ended'`
- Project `is_arc_company = true`
- Optionally blocks if `project_arc_settings.security_status` is `'blocked'` or `'suspended'`

**Use Cases:**
- GET `/api/portal/arc/arenas/[slug]` - View arena details
- Public read access for active/ended arenas
- No approval required for reading

**Note:** This allows public read access to active/ended arenas as long as the project is ARC-eligible, without requiring ARC approval.

---

## 3. What Unlocks Arena MANAGE Access (Create/Edit/End)

**Function:** `requireArcManageAccess(projectId, userId?)`

**Requirements:**
- `arc_project_access.application_status = 'approved'`
- `projects.is_arc_company = true`
- User has admin/moderator/owner role OR is superadmin (if `userId` provided)

**Use Cases:**
- POST `/api/portal/arc/arenas-admin` - Create arena
- PATCH `/api/portal/arc/arenas-admin` - Edit arena
- End arena actions - End/pause/restart arena
- Any management operations on arenas

**Note:** Management actions require both ARC approval AND project management permissions.

---

## 4. Leaderboard Request Submission

**Requirements:**
- `projects.is_arc_company = true`
- User must have project role (admin/moderator/owner)

**Enforcement:**
- POST `/api/portal/arc/leaderboard-requests` checks `is_arc_company` before allowing submission
- Returns 403 if project is not ARC-eligible

---

## 5. Approval Process

**RPC:** `arc_admin_approve_leaderboard_request(p_request_id, p_admin_profile_id)`

**Validation:**
- Checks `projects.is_arc_company = true` before approving
- Throws `'project_not_arc_company'` error if project is not eligible
- Only approves requests for ARC-eligible projects

**Error Handling:**
- API endpoint maps `'project_not_arc_company'` to 400 status code

---

## 6. Arena List Endpoints

**Filtering:**
- GET `/api/portal/arc/arenas?projectId=...` - Only returns arenas for projects with `is_arc_company = true`
- GET `/api/portal/arc/projects/[projectId]/current-ms-arena` - Only returns arena if `is_arc_company = true`
- GET `/api/portal/arc/active-arena?projectId=...` - Only returns arena if `is_arc_company = true`
- `getArcLiveItems()` helper - Only includes arenas from projects with `is_arc_company = true`

---

## Summary Table

| Action | Requirement | Check Location |
|--------|-------------|----------------|
| **View ARC Products** | `is_arc_company = true` + `application_status = 'approved'` | GET `/api/portal/arc/projects` |
| **Read Arena Details** | `is_arc_company = true` + arena status `'active'`/`'ended'` | GET `/api/portal/arc/arenas/[slug]` |
| **Manage Arena** | `is_arc_company = true` + `application_status = 'approved'` + user role | POST/PATCH `/api/portal/arc/arenas-admin` |
| **Submit Request** | `is_arc_company = true` + user role | POST `/api/portal/arc/leaderboard-requests` |
| **Approve Request** | `is_arc_company = true` (checked in RPC) | RPC `arc_admin_approve_leaderboard_request` |
| **List Arenas** | `is_arc_company = true` | All arena list endpoints |

---

## Migration

**File:** `supabase/migrations/20250202_add_is_arc_company_to_projects.sql`

Adds:
- `projects.is_arc_company BOOLEAN NOT NULL DEFAULT false`
- Index on `is_arc_company` for efficient filtering

**Note:** Existing projects will have `is_arc_company = false` by default. SuperAdmin must manually set `is_arc_company = true` for eligible projects.

---

## Key Changes

1. **Separated READ vs MANAGE access**: Arena details are publicly readable (if project is ARC-eligible), but management requires approval + permissions
2. **Added `is_arc_company` gate**: Only company/project profiles can participate in ARC
3. **Fixed features object**: Always returns non-null features object in projects endpoint
4. **Consistent filtering**: All arena endpoints filter by `is_arc_company = true`
