# ARC Company Eligibility Implementation

**Date:** 2025-02-02  
**Purpose:** Enforce that only company/project profiles can have ARC leaderboards/arenas

---

## Summary of Changes

### 1. Database Migration

**File:** `supabase/migrations/20250202_add_is_arc_company_to_projects.sql`

```sql
-- Add is_arc_company column to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_arc_company BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_projects_is_arc_company 
  ON projects(is_arc_company) 
  WHERE is_arc_company = true;

-- Add comment
COMMENT ON COLUMN projects.is_arc_company IS 
  'Whether this project is eligible for ARC leaderboards. Only projects with is_arc_company=true can submit leaderboard requests, be approved, and have arenas.';
```

**Key Points:**
- `is_arc_company` is the single source of truth for ARC eligibility
- Defaults to `false` for existing projects
- Indexed for efficient filtering

---

### 2. Updated RPC: `arc_admin_approve_leaderboard_request`

**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Change:** Added validation after loading project:

```sql
-- Step 3: Fetch project info (for arena name/slug) and validate is_arc_company
SELECT id, name, slug, is_arc_company
INTO v_project
FROM projects
WHERE id = v_request.project_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'project_not_found';
END IF;

-- Validate project is ARC-eligible (is_arc_company must be true)
-- Use COALESCE to handle NULL values (treat NULL as false)
IF COALESCE(v_project.is_arc_company, false) = false THEN
  RAISE EXCEPTION 'project_not_arc_company';
END IF;
```

**Key Points:**
- Prevents approvals for non-company projects at the DB level
- Uses `COALESCE` to handle NULL values safely
- Throws `'project_not_arc_company'` error

---

### 3. Updated GET /api/portal/arc/projects

**File:** `src/web/pages/api/portal/arc/projects.ts`

**Query Changes:**
1. Filters by `is_arc_company = true`
2. Filters by `arc_project_access.application_status = 'approved'`
3. Filters by at least one feature enabled: `leaderboard_enabled OR gamefi_enabled OR crm_enabled`

**Key Code:**
```typescript
// Get approved projects
const { data: approvedAccess } = await supabase
  .from('arc_project_access')
  .select('project_id')
  .eq('application_status', 'approved');

const approvedProjectIds = approvedAccess?.map(a => a.project_id) || [];

// Get projects with is_arc_company = true
const { data: projectsData } = await supabase
  .from('projects')
  .select(`...`)
  .in('id', approvedProjectIds)
  .eq('is_arc_company', true);

// Filter by at least one feature enabled
const projects = data
  .map(...)
  .filter((project: ArcProject) => 
    project.features.leaderboard_enabled || 
    project.features.gamefi_enabled || 
    project.features.crm_enabled
  );
```

**Response:**
- Always returns non-null `features` object (defaults to all `false` if no row exists)
- Only returns projects that meet all three criteria

---

### 4. Updated GET /api/portal/arc/arenas/[slug]

**File:** `src/web/pages/api/portal/arc/arenas/[slug].ts`

**Change:** Uses `requireArcArenaReadAccess()` which checks:
- `projects.is_arc_company = true`
- `arc_project_access.application_status = 'approved'`
- Arena status is `'active'` or `'ended'`

**Error Handling:**
```typescript
const accessCheck = await requireArcArenaReadAccess(supabaseAdmin, normalizedSlug);
if (!accessCheck.ok) {
  const statusCode = accessCheck.code === 'not_arc_company' 
    ? 403 
    : accessCheck.code === 'not_approved'
    ? 403
    : 404;
  
  return res.status(statusCode).json({
    ok: false,
    error: accessCheck.error,
    code: accessCheck.code,
  });
}
```

**Clear Error Messages:**
- `not_arc_company`: "Project is not eligible for ARC"
- `not_approved`: "ARC access not approved for this project"

---

### 5. Updated Live List Query

**File:** `src/web/lib/arc/live-upcoming.ts`

**Changes:**
1. `fetchArenas()` already filters by `is_arc_company = true`
2. Added batch filtering in `getArcLiveItems()`:
   - Checks `arc_project_access.application_status = 'approved'` for all arenas
   - Checks at least one feature enabled (`leaderboard_enabled OR gamefi_enabled OR crm_enabled`)

**Key Code:**
```typescript
// Get approved project IDs and their enabled features
const approvedProjectIds = new Set<string>();
const projectFeaturesMap = new Map<string, {...}>();

// Batch query approved access
const { data: approvedAccess } = await supabase
  .from('arc_project_access')
  .select('project_id')
  .in('project_id', uniqueProjectIds)
  .eq('application_status', 'approved');

// Batch query features
const { data: features } = await supabase
  .from('arc_project_features')
  .select('project_id, leaderboard_enabled, gamefi_enabled, crm_enabled')
  .in('project_id', Array.from(approvedProjectIds));

// Filter arenas
for (const arena of arenasResult) {
  if (!approvedProjectIds.has(arena.projectId)) continue;
  
  const features = projectFeaturesMap.get(arena.projectId);
  if (!features || (!features.leaderboard_enabled && !features.gamefi_enabled && !features.crm_enabled)) {
    continue;
  }
  // ... add to live/upcoming
}
```

**Result:** Live list never shows arenas that will 403 when opened

---

### 6. Updated Arena Read Access Helper

**File:** `src/web/lib/arc-access.ts`

**Function:** `requireArcArenaReadAccess(arenaSlug)`

**Requirements:**
1. `projects.is_arc_company = true`
2. `arc_project_access.application_status = 'approved'`
3. Arena status is `'active'` or `'ended'`

**Error Codes:**
- `not_arc_company`: Project is not eligible for ARC
- `not_approved`: ARC access not approved
- `project_not_found`: Arena/project not found

---

### 7. Updated Other Endpoints

**Files Updated:**
- `src/web/pages/api/portal/arc/arenas/index.ts` - Checks `is_arc_company` before returning arenas
- `src/web/pages/api/portal/arc/active-arena.ts` - Checks `is_arc_company` before returning active arena
- `src/web/pages/api/portal/arc/projects/[projectId]/current-ms-arena.ts` - Checks `is_arc_company` before returning current arena
- `src/web/pages/api/portal/arc/leaderboard-requests.ts` - Checks `is_arc_company` before allowing submission

---

## Filtering Rules Summary

### ARC Products (GET /api/portal/arc/projects)
**Requirements:**
- `projects.is_arc_company = true`
- `arc_project_access.application_status = 'approved'`
- At least one feature enabled: `leaderboard_enabled OR gamefi_enabled OR crm_enabled`

### Arena Read Access (GET /api/portal/arc/arenas/[slug])
**Requirements:**
- `projects.is_arc_company = true`
- `arc_project_access.application_status = 'approved'`
- Arena status is `'active'` or `'ended'`

### Live List (getArcLiveItems)
**Requirements:**
- `projects.is_arc_company = true` (filtered in `fetchArenas()`)
- `arc_project_access.application_status = 'approved'` (filtered in processing loop)
- At least one feature enabled (filtered in processing loop)

### Arena Management
**Requirements:**
- `projects.is_arc_company = true`
- `arc_project_access.application_status = 'approved'`
- User has admin/moderator/owner role OR is superadmin

---

## Error Messages

| Error Code | Message | Status Code |
|------------|---------|-------------|
| `not_arc_company` | "Project is not eligible for ARC" | 403 |
| `not_approved` | "ARC access not approved for this project" | 403 |
| `project_not_found` | "Arena not found" / "Project not found" | 404 |
| `option_locked` | "Arena not available" | 403 |

---

## Testing Checklist

- [ ] Migration applies successfully
- [ ] RPC throws `project_not_arc_company` for non-company projects
- [ ] GET /api/portal/arc/projects only returns eligible projects
- [ ] GET /api/portal/arc/arenas/[slug] returns clear errors
- [ ] Live list never shows arenas that 403
- [ ] Leaderboard request submission checks `is_arc_company`
- [ ] All arena list endpoints filter by `is_arc_company`

---

## Important Notes

1. **Single Source of Truth**: `projects.is_arc_company` is the ONLY field that determines ARC eligibility
2. **No Product Type Dependency**: Don't rely on `product_type` alone - always check `is_arc_company`
3. **Default Behavior**: Existing projects have `is_arc_company = false` by default
4. **SuperAdmin Override**: Some endpoints support `bypassAccessCheck` for superadmin testing
