# TASK 2: UNIFIED STATE API — TEST CHECKLIST

**Status:** ✅ Implementation Complete  
**Date:** 2025-01-XX

---

## DELIVERABLES

### ✅ Files Created
1. `src/web/lib/arc/unified-state.ts` — Unified state helper library
2. `src/web/pages/api/portal/arc/state.ts` — New unified state API endpoint

### ✅ Files Updated
1. `src/web/pages/api/portal/arc/cta-state.ts` — Uses unified state internally
2. `src/web/pages/api/portal/arc/summary.ts` — Uses unified state logic for counting

---

## TESTING CHECKLIST

### 1. New Unified State API (`/api/portal/arc/state`)

#### Test 1.1: Project with arc_project_features row (all modules enabled)
**Setup:**
- Create project with `arc_project_features` row
- Set `leaderboard_enabled=true`, `gamefi_enabled=true`, `crm_enabled=true`
- Set valid date ranges (current time within start/end)

**Request:**
```bash
GET /api/portal/arc/state?projectId=<project-id>
```

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": true, "active": true, "startAt": "...", "endAt": "..." },
    "gamefi": { "enabled": true, "active": true, "startAt": "...", "endAt": "..." },
    "crm": { "enabled": true, "active": true, "startAt": "...", "endAt": "...", "visibility": "private" }
  },
  "requests": { "pending": false, "lastStatus": null }
}
```

**Verify:**
- ✅ All modules show `enabled=true` and `active=true`
- ✅ Dates are returned correctly
- ✅ CRM visibility is returned

---

#### Test 1.2: Project with arc_project_features row (some modules enabled, some active)
**Setup:**
- Create project with `arc_project_features` row
- Set `leaderboard_enabled=true` with dates in the past (inactive)
- Set `gamefi_enabled=true` with dates in the future (not yet active)
- Set `crm_enabled=true` with current dates (active)

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": true, "active": false, "startAt": "...", "endAt": "...", "reason": "Module ended at ..." },
    "gamefi": { "enabled": true, "active": false, "startAt": "...", "endAt": "...", "reason": "Module starts at ..." },
    "crm": { "enabled": true, "active": true, "startAt": "...", "endAt": "..." }
  }
}
```

**Verify:**
- ✅ Leaderboard: `enabled=true`, `active=false` (past dates)
- ✅ GameFi: `enabled=true`, `active=false` (future dates)
- ✅ CRM: `enabled=true`, `active=true` (current dates)
- ✅ Reasons are included for inactive modules

---

#### Test 1.3: Project without arc_project_features row (legacy fallback)
**Setup:**
- Create project WITHOUT `arc_project_features` row
- Set `projects.arc_access_level='leaderboard'`
- Set `projects.arc_active=true`
- Set `projects.arc_active_until=null` (or future date)

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": true, "active": true, "startAt": null, "endAt": null },
    "gamefi": { "enabled": false, "active": false, "startAt": null, "endAt": null },
    "crm": { "enabled": false, "active": false, "startAt": null, "endAt": null, "visibility": "private" }
  }
}
```

**Verify:**
- ✅ Falls back to legacy fields correctly
- ✅ Maps `arc_access_level='leaderboard'` to `leaderboard.enabled=true`
- ✅ Uses `arc_active` and `arc_active_until` for active state
- ✅ Other modules are disabled

---

#### Test 1.4: Project with invalid dates (enabled but inactive)
**Setup:**
- Create project with `arc_project_features` row
- Set `leaderboard_enabled=true`
- Set `leaderboard_start_at=null` or `leaderboard_end_at=null`

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": true, "active": false, "startAt": null, "endAt": null, "reason": "Module enabled but dates missing" }
  }
}
```

**Verify:**
- ✅ `enabled=true` but `active=false`
- ✅ Reason explains why inactive

---

#### Test 1.5: Request status (authenticated user)
**Setup:**
- Create project with `arc_project_features` row
- Create `arc_leaderboard_requests` entry for current user with `status='pending'`

**Request:**
```bash
GET /api/portal/arc/state?projectId=<project-id>
# With valid session cookie
```

**Expected Response:**
```json
{
  "ok": true,
  "modules": { ... },
  "requests": { "pending": true, "lastStatus": "pending" }
}
```

**Verify:**
- ✅ Request status is returned correctly
- ✅ Works for pending, approved, rejected statuses

---

#### Test 1.6: Request status (unauthenticated user)
**Setup:**
- Create project with `arc_project_features` row
- Create `arc_leaderboard_requests` entry for another user

**Request:**
```bash
GET /api/portal/arc/state?projectId=<project-id>
# Without session cookie
```

**Expected Response:**
```json
{
  "ok": true,
  "modules": { ... },
  "requests": { "pending": false, "lastStatus": null }
}
```

**Verify:**
- ✅ No request status returned (user not authenticated)

---

### 2. Updated CTA State API (`/api/portal/arc/cta-state`)

#### Test 2.1: Uses unified state (project with arc_project_features)
**Setup:**
- Create project with `arc_project_features` row
- Set modules enabled with valid dates

**Request:**
```bash
GET /api/portal/arc/cta-state?projectId=<project-id>
```

**Expected Response:**
```json
{
  "ok": true,
  "arcAccessLevel": "leaderboard", // Derived from unified state
  "arcActive": true, // Derived from unified state
  ...
}
```

**Verify:**
- ✅ Response format unchanged (backward compatible)
- ✅ Values derived from unified state logic
- ✅ Works with both new and legacy data

---

#### Test 2.2: Fallback to legacy (project without arc_project_features)
**Setup:**
- Create project WITHOUT `arc_project_features` row
- Set `projects.arc_access_level='gamified'`, `arc_active=true`

**Verify:**
- ✅ Falls back to legacy fields correctly
- ✅ Returns correct `arcAccessLevel` and `arcActive`
- ✅ Other fields (existingRequest, shouldShowRequestButton) work correctly

---

### 3. Updated Summary API (`/api/portal/arc/summary`)

#### Test 3.1: Counts projects with enabled modules
**Setup:**
- Create multiple projects:
  - Project A: `arc_project_features` with `leaderboard_enabled=true` (active dates)
  - Project B: `arc_project_features` with `gamefi_enabled=true` (active dates)
  - Project C: `arc_project_features` with `crm_enabled=true` (active dates)
  - Project D: Legacy project with `arc_access_level='leaderboard'`, `arc_active=true`
  - Project E: No ARC enabled

**Request:**
```bash
GET /api/portal/arc/summary
```

**Expected Response:**
```json
{
  "ok": true,
  "summary": {
    "arcEnabled": 4, // Projects A, B, C, D
    ...
  }
}
```

**Verify:**
- ✅ Counts projects with active modules from `arc_project_features`
- ✅ Counts legacy projects with `arc_active=true` and `arc_access_level != 'none'`
- ✅ Does not double-count projects
- ✅ Excludes projects with no enabled modules

---

#### Test 3.2: Excludes expired/inactive modules
**Setup:**
- Create projects with enabled but inactive modules:
  - Project A: `leaderboard_enabled=true` but dates in the past
  - Project B: `gamefi_enabled=true` but dates in the future

**Verify:**
- ✅ These projects are NOT counted in `arcEnabled`
- ✅ Only projects with active modules are counted

---

### 4. Edge Cases

#### Test 4.1: Missing project ID
**Request:**
```bash
GET /api/portal/arc/state
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "projectId is required"
}
```

**Verify:**
- ✅ Returns 400 with error message

---

#### Test 4.2: Invalid project ID
**Request:**
```bash
GET /api/portal/arc/state?projectId=invalid-uuid
```

**Verify:**
- ✅ Handles gracefully (database will return error, API should handle it)

---

#### Test 4.3: Non-existent project
**Request:**
```bash
GET /api/portal/arc/state?projectId=<non-existent-uuid>
```

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": false, "active": false, "startAt": null, "endAt": null },
    ...
  }
}
```

**Verify:**
- ✅ Returns all modules disabled (safe default)

---

#### Test 4.4: Date validation (end_at <= start_at)
**Setup:**
- Create project with `arc_project_features` row
- Set `leaderboard_start_at` > `leaderboard_end_at` (invalid)

**Expected Response:**
```json
{
  "ok": true,
  "modules": {
    "leaderboard": { "enabled": true, "active": false, "reason": "Invalid date range (end_at <= start_at)" }
  }
}
```

**Verify:**
- ✅ Module is enabled but inactive
- ✅ Reason explains the issue

---

### 5. Performance Tests

#### Test 5.1: Summary API performance
**Setup:**
- Create 100+ projects with various module configurations

**Verify:**
- ✅ API responds within reasonable time (< 2 seconds)
- ✅ Queries are efficient (no N+1 problems)

---

#### Test 5.2: State API performance
**Setup:**
- Create project with all modules enabled

**Verify:**
- ✅ API responds quickly (< 500ms)
- ✅ Single database query (or minimal queries)

---

## MANUAL TESTING STEPS

1. **Test unified state API:**
   - Call `/api/portal/arc/state?projectId=<id>` for various project configurations
   - Verify response matches expected format
   - Check that active state is calculated correctly

2. **Test CTA state API:**
   - Verify it still works as before
   - Check that it uses unified state internally
   - Test with both new and legacy projects

3. **Test summary API:**
   - Verify `arcEnabled` count is correct
   - Check that it includes both new and legacy projects
   - Verify no double-counting

4. **Test backward compatibility:**
   - Ensure existing UI still works
   - No breaking changes to response formats
   - Legacy projects still work correctly

---

## VERIFICATION CHECKLIST

- [ ] Unified state API returns correct module states
- [ ] Unified state API handles missing `arc_project_features` rows
- [ ] Unified state API falls back to legacy fields correctly
- [ ] Unified state API calculates active state correctly (date range checks)
- [ ] Unified state API returns request status for authenticated users
- [ ] CTA state API uses unified state internally
- [ ] CTA state API maintains backward compatibility
- [ ] Summary API counts enabled projects correctly
- [ ] Summary API includes both new and legacy projects
- [ ] Summary API excludes inactive/expired modules
- [ ] All edge cases handled gracefully
- [ ] No linting errors
- [ ] No breaking changes to existing functionality

---

**END OF TEST CHECKLIST**

