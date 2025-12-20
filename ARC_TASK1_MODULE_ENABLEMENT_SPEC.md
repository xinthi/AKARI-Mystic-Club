# TASK 1: ARC MODULE ENABLEMENT MODEL — SPECIFICATION

**Date:** 2025-01-XX  
**Status:** PROPOSAL (Pending Approval)

---

## EXECUTIVE SUMMARY

This specification defines the database schema and logic to support **combinable ARC modules** (Leaderboard, GameFi, CRM) with per-module enablement and date ranges, replacing the current single-choice `arc_access_level` model.

**Key Design Decisions:**
- **Table:** `arc_project_features` (preferred, currently unused)
- **Backward Compatibility:** Maintain `projects.arc_access_level`, `arc_active`, `arc_active_until` as fallback reads during migration period
- **Validation:** Each enabled module requires valid `start_at` and `end_at` dates (`end_at > start_at`)

---

## 1. DATABASE SCHEMA CHANGES

### 1.1 Table: `arc_project_features`

**Current State:**
- Table exists but is **UNUSED** (confirmed in ARC_INVENTORY_REPORT.md)
- Current columns: `project_id`, `option1_crm_unlocked`, `option2_normal_unlocked`, `option3_gamified_unlocked`, `unlocked_at`, `created_at`, `updated_at`

**Proposed Changes:**
- **Add new columns** for module enablement (keep existing columns for future cleanup)
- Each module gets: `{module}_enabled`, `{module}_start_at`, `{module}_end_at`
- CRM module also gets: `crm_visibility` (for private/public/hybrid mode)

### 1.2 SQL Migration Proposal

```sql
-- =============================================================================
-- Migration: Add ARC Module Enablement to arc_project_features
-- Purpose: Support combinable modules (Leaderboard, GameFi, CRM) with date ranges
-- Date: 2025-01-XX
-- =============================================================================

-- Add Leaderboard module columns
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leaderboard_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leaderboard_end_at TIMESTAMPTZ;

-- Add GameFi module columns
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS gamefi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gamefi_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gamefi_end_at TIMESTAMPTZ;

-- Add CRM module columns (including visibility)
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS crm_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crm_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (crm_visibility IN ('private', 'public', 'hybrid'));

-- Add check constraints to enforce date validation
-- Rule: If {module}_enabled = true, then {module}_start_at and {module}_end_at must be NOT NULL
-- Rule: {module}_end_at > {module}_start_at

-- Leaderboard constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_leaderboard_dates_valid
    CHECK (
      (leaderboard_enabled = false) OR
      (leaderboard_start_at IS NOT NULL AND 
       leaderboard_end_at IS NOT NULL AND 
       leaderboard_end_at > leaderboard_start_at)
    );

-- GameFi constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_gamefi_dates_valid
    CHECK (
      (gamefi_enabled = false) OR
      (gamefi_start_at IS NOT NULL AND 
       gamefi_end_at IS NOT NULL AND 
       gamefi_end_at > gamefi_start_at)
    );

-- CRM constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_crm_dates_valid
    CHECK (
      (crm_enabled = false) OR
      (crm_start_at IS NOT NULL AND 
       crm_end_at IS NOT NULL AND 
       crm_end_at > crm_start_at)
    );

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_arc_project_features_leaderboard_enabled 
  ON arc_project_features(leaderboard_enabled, leaderboard_start_at, leaderboard_end_at) 
  WHERE leaderboard_enabled = true;

CREATE INDEX IF NOT EXISTS idx_arc_project_features_gamefi_enabled 
  ON arc_project_features(gamefi_enabled, gamefi_start_at, gamefi_end_at) 
  WHERE gamefi_enabled = true;

CREATE INDEX IF NOT EXISTS idx_arc_project_features_crm_enabled 
  ON arc_project_features(crm_enabled, crm_start_at, crm_end_at) 
  WHERE crm_enabled = true;

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- Backward Compatibility:
-- - Existing code continues to use projects.arc_access_level during migration
-- - New code should prefer arc_project_features for module enablement
-- - Migration path: Projects with arc_access_level != 'none' should have
--   corresponding modules enabled in arc_project_features (migration script TBD)
--
-- Data Integrity:
-- - All enabled modules MUST have valid start_at and end_at dates
-- - Modules can be enabled independently (combinable)
-- - A project can have Leaderboard + GameFi + CRM all enabled simultaneously
-- - If enabled=true but dates are invalid, treat module as inactive (defensive check)
```

---

## 2. ENABLEMENT LOGIC SPECIFICATION

### 2.1 Module Active State Calculation

A module is considered **active** if:
1. `{module}_enabled = true` AND
2. `{module}_start_at IS NOT NULL` AND
3. `{module}_end_at IS NOT NULL` AND
4. `NOW() >= {module}_start_at` AND
5. `NOW() <= {module}_end_at`

**Implementation Note:**
- If `enabled=true` but dates are invalid (NULL or `end_at <= start_at`), treat as **inactive**
- This is a defensive check to handle data inconsistencies

### 2.2 Module Enablement Fields

| Module | Enablement Field | Start Date | End Date | Additional Fields |
|--------|-----------------|------------|----------|-------------------|
| **Leaderboard** | `leaderboard_enabled` | `leaderboard_start_at` | `leaderboard_end_at` | None |
| **GameFi** | `gamefi_enabled` | `gamefi_start_at` | `gamefi_end_at` | None |
| **CRM** | `crm_enabled` | `crm_start_at` | `crm_end_at` | `crm_visibility` (private/public/hybrid) |

### 2.3 CRM Visibility Modes

| Mode | Description |
|------|-------------|
| `private` | Only participants + project admins/mods + SuperAdmins can see |
| `public` | Creators can apply, limited public visibility |
| `hybrid` | Public ranks visible, private performance metrics |

---

## 3. BACKWARD COMPATIBILITY STRATEGY

### 3.1 Existing Fields (Keep for Fallback)

**`projects` table:**
- `arc_access_level` (TEXT) — Keep as-is
- `arc_active` (BOOLEAN) — Keep as-is
- `arc_active_until` (TIMESTAMPTZ) — Keep as-is

**Usage:**
- During migration period, code should check `arc_project_features` first
- Fallback to `projects.arc_access_level` if `arc_project_features` row doesn't exist
- After migration is complete, deprecate `arc_access_level` (future task)

### 3.2 Migration Mapping (Future Work)

**Old → New Mapping:**
- `arc_access_level = 'leaderboard'` → `leaderboard_enabled = true`
- `arc_access_level = 'gamified'` → `gamefi_enabled = true`
- `arc_access_level = 'creator_manager'` → `crm_enabled = true`
- `arc_access_level = 'none'` → All modules disabled

**Note:** Migration script is **NOT** included in this task. This is only the enablement spec.

---

## 4. CODE FILES IMPACTED

### 4.1 Files That Read `arc_access_level` / `arc_active`

**API Routes:**
1. `src/web/pages/api/portal/arc/summary.ts` — Reads `arc_access_level`, `arc_active`, `arc_active_until`
2. `src/web/pages/api/portal/arc/cta-state.ts` — Reads `arc_access_level`, `arc_active`, `arc_active_until`
3. `src/web/pages/api/portal/arc/top-projects.ts` — Reads `arc_access_level`, `arc_active`
4. `src/web/pages/api/portal/arc/projects.ts` — Reads via `project_arc_settings` join
5. `src/web/pages/api/portal/arc/project/[projectId].ts` — Likely reads ARC state
6. `src/web/pages/api/portal/arc/my-projects.ts` — Likely reads ARC state
7. `src/web/pages/api/portal/admin/projects/[id].ts` — Updates `arc_access_level`, `arc_active`
8. `src/web/pages/api/portal/admin/projects/classify.ts` — Updates `arc_access_level`, `arc_active`
9. `src/web/pages/api/portal/admin/projects/index.ts` — Reads `arc_access_level`, `arc_active`

**UI Pages:**
10. `src/web/pages/portal/admin/projects.tsx` — Displays/edits `arc_access_level`, `arc_active`
11. `src/web/pages/portal/arc/index.tsx` — Uses `arc_access_level` for routing
12. `src/web/pages/portal/arc/project/[projectId].tsx` — Uses ARC state
13. `src/web/pages/portal/arc/admin/index.tsx` — Uses ARC settings

**Components:**
14. `src/web/components/arc/ArcTopProjectsTreemap.tsx` — Uses `arc_access_level`, `arc_active` for clickability
15. `src/web/components/arc/ArcTopProjectsTreemapClient.tsx` — Uses ARC state
16. `src/web/components/arc/ArcTopProjectsCards.tsx` — Uses ARC state
17. `src/web/components/arc/ArcTopProjectsMosaic.tsx` — Uses ARC state
18. `src/web/components/arc/ArcProjectsTreemapV2.tsx` — Uses ARC state
19. `src/web/components/arc/ArcProjectsTreemapV3.tsx` — Uses ARC state

**Libraries:**
20. `src/web/lib/arc/expiration.ts` — Reads `arc_active`, `arc_active_until`
21. `src/web/lib/arc/access-policy.ts` — Likely uses ARC state

**Other:**
22. `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts` — Reads ARC state
23. `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` — Reads ARC state
24. `src/web/pages/api/portal/arc/leaderboard-requests.ts` — Reads ARC state
25. `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` — Uses ARC state
26. `src/web/pages/portal/arc/requests.tsx` — Uses ARC state

### 4.2 Files That Will Need Updates (Phase 2: Unified State API)

All files listed above will eventually use the new unified state API (`/api/portal/arc/state`), but for **Task 1**, we only need to:
1. Propose the schema (this document)
2. **NOT implement code changes yet**

---

## 5. VALIDATION RULES

### 5.1 Database Constraints

1. **Date Required When Enabled:**
   - If `{module}_enabled = true`, then `{module}_start_at` and `{module}_end_at` must be NOT NULL
   - Enforced via CHECK constraints

2. **Valid Date Range:**
   - `{module}_end_at > {module}_start_at`
   - Enforced via CHECK constraints

3. **CRM Visibility:**
   - `crm_visibility` must be one of: `'private'`, `'public'`, `'hybrid'`
   - Enforced via CHECK constraint

### 5.2 Application-Level Validation

1. **Defensive Checks:**
   - If `enabled=true` but dates are NULL or invalid → treat module as **inactive**
   - Log warning for data inconsistencies

2. **UI Validation:**
   - Admin UI should require dates when enabling a module
   - Display warning if dates are missing or invalid

---

## 6. TESTING CHECKLIST (For Implementation Phase)

### 6.1 Database Tests

- [ ] Constraint prevents enabling module without dates
- [ ] Constraint prevents `end_at <= start_at`
- [ ] Indexes improve query performance for enabled modules
- [ ] RLS policies allow appropriate access

### 6.2 Integration Tests

- [ ] Module active calculation works correctly (current time within range)
- [ ] Module inactive when current time before start_at
- [ ] Module inactive when current time after end_at
- [ ] Module inactive when enabled=false
- [ ] Multiple modules can be enabled simultaneously
- [ ] Backward compatibility: fallback to `arc_access_level` works

### 6.3 User Role Tests

- [ ] Normal user: sees public modules only
- [ ] Project admin/mod: sees project dashboards for enabled modules
- [ ] SuperAdmin: sees everything
- [ ] CRM visibility modes work correctly (private/public/hybrid)

---

## 7. MIGRATION NOTES

### 7.1 Safe Deployment Strategy

1. **Phase 1 (This Task):** Deploy schema changes only (no code changes)
   - Add columns with defaults (all disabled)
   - Add constraints
   - Add indexes
   - **No breaking changes**

2. **Phase 2 (Task 2):** Implement unified state API
   - Read from `arc_project_features` first
   - Fallback to `projects.arc_access_level` if row missing
   - Return module state in new format

3. **Phase 3 (Future):** Migrate existing data
   - Create `arc_project_features` rows for projects with `arc_access_level != 'none'`
   - Map old values to new module enablements
   - Set appropriate date ranges

4. **Phase 4 (Future):** Deprecate old fields
   - After all code uses new system, mark `arc_access_level` as deprecated
   - Eventually remove (separate migration)

### 7.2 Rollback Plan

If issues arise, can rollback by:
1. Dropping new columns: `ALTER TABLE arc_project_features DROP COLUMN ...`
2. All existing code continues to work (uses fallback fields)
3. No data loss

---

## 8. OPEN QUESTIONS

1. **Default Date Ranges:** When enabling a module, what should default `start_at` and `end_at` be?
   - Proposal: `start_at = NOW()`, `end_at = NOW() + 90 days` (or configurable)

2. **Migration Script:** Should we include a data migration script now, or defer?
   - Proposal: **Defer** (separate task)

3. **CRM Visibility Default:** Is `'private'` the correct default?
   - Proposal: Yes (most restrictive, safest)

4. **Existing `option*_unlocked` Columns:** Should we remove them or keep for compatibility?
   - Proposal: **Keep for now** (cleanup in future task)

---

## 9. APPROVAL CHECKLIST

- [ ] Schema changes reviewed
- [ ] SQL migration syntax validated
- [ ] Backward compatibility strategy approved
- [ ] Impact assessment complete
- [ ] Migration plan approved
- [ ] Rollback plan approved

---

**END OF TASK 1 SPECIFICATION**

