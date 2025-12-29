# TASK 1 COMPLETE: MODULE ENABLEMENT SPECIFICATION

**Status:** ✅ COMPLETE (Specification Only)  
**Date:** 2025-01-XX

---

## DELIVERABLES

### ✅ 1. Enablement Specification
**File:** `ARC_TASK1_MODULE_ENABLEMENT_SPEC.md`

Comprehensive specification document covering:
- Database schema changes
- Module enablement logic
- Backward compatibility strategy
- Validation rules
- Testing checklist
- Migration notes

### ✅ 2. SQL Migration Proposal
**File:** `supabase/migrations/PROPOSED_202501XX_add_arc_module_enablement.sql`

Complete SQL migration script (PROPOSED, not applied):
- Adds module enablement columns to `arc_project_features`
- Adds date validation constraints
- Adds performance indexes
- Includes rollback script reference

### ✅ 3. Impacted Files List
**File:** `ARC_TASK1_IMPACTED_FILES.md`

Detailed list of 26 code files that will need updates:
- 15 API routes
- 6 UI pages
- 5 components
- 2 libraries
- Priority categorization (High/Medium/Low)

---

## KEY DECISIONS

### ✅ Table Choice
- **Selected:** `arc_project_features` (currently unused, preferred option)
- **Alternative:** `project_arc_settings` (exists but serves different purpose)
- **Rationale:** `arc_project_features` is unused and can be repurposed cleanly

### ✅ Schema Design
- **Approach:** Add new columns (keep existing for future cleanup)
- **Modules:** Leaderboard, GameFi, CRM
- **Fields per module:** `{module}_enabled`, `{module}_start_at`, `{module}_end_at`
- **CRM special field:** `crm_visibility` (private/public/hybrid)

### ✅ Backward Compatibility
- **Strategy:** Keep existing `projects.arc_access_level`, `arc_active`, `arc_active_until`
- **Migration path:** New code checks `arc_project_features` first, falls back to old fields
- **Timeline:** Deprecate old fields in future task (after migration complete)

### ✅ Validation Rules
- **Date requirement:** If `enabled=true`, dates must be NOT NULL and `end_at > start_at`
- **Enforcement:** Database CHECK constraints + application-level defensive checks
- **Active state:** Module is active only if `enabled=true` AND current time within date range

---

## NEXT STEPS (NOT IN TASK 1)

### Task 2: Unified State API
- Implement `GET /api/portal/arc/state?projectId=...`
- Return module states with backward compatibility fallback
- All ARC APIs should use this for consistent state

### Task 3: UI / Navigation
- Update navigation structure with submenus
- Add SSR guards and permission checks
- Implement module-specific pages

### Task 4-6: Performance Dashboards, Slashing, Scoring
- See main implementation prompt for details

---

## APPROVAL REQUIRED

Before proceeding to Task 2, please review and approve:

- [ ] Schema changes (specification document)
- [ ] SQL migration syntax (migration file)
- [ ] Backward compatibility strategy
- [ ] Impact assessment (impacted files list)
- [ ] Migration timeline/plan

---

## FILES CREATED

1. `ARC_TASK1_MODULE_ENABLEMENT_SPEC.md` — Full specification
2. `supabase/migrations/PROPOSED_202501XX_add_arc_module_enablement.sql` — SQL migration
3. `ARC_TASK1_IMPACTED_FILES.md` — Code files analysis
4. `ARC_TASK1_SUMMARY.md` — This summary

---

**TASK 1 STATUS: ✅ COMPLETE (Specification Phase)**

No code implementation in Task 1 — only specification and SQL proposal for approval.

