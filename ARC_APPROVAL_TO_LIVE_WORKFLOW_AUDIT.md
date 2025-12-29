# ARC Approval to Live Leaderboard Workflow Audit

**Date:** 2025-01-XX  
**Issue:** Approved leaderboard requests (e.g., Bitcoin) not showing in Live/Upcoming sections  
**Status:** 🔴 **CRITICAL WORKFLOW GAP IDENTIFIED**

## Executive Summary

**Root Cause:** The approval endpoint does NOT automatically create an `arena` record. The `live-leaderboards` API explicitly requires `arenas.status = 'active'`, so approved projects without an active arena will never appear in the Live/Upcoming sections.

## Current Workflow Analysis

### Step 1: Approval Process
**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`

When a request is approved with `arc_access_level = 'leaderboard'`:

1. ✅ Updates `projects.arc_active = true`
2. ✅ Updates `projects.arc_access_level = 'leaderboard'`
3. ✅ Creates/updates `arc_project_access` with `application_status = 'approved'`
4. ✅ Creates/updates `arc_project_features` with:
   - `option2_normal_unlocked = true`
   - `leaderboard_enabled = true`
   - `leaderboard_start_at` (if provided)
   - `leaderboard_end_at` (if provided)

**MISSING:** ❌ Does NOT create an `arena` record

### Step 2: Live Leaderboards API
**File:** `src/web/pages/api/portal/arc/live-leaderboards.ts`

**Line 66:** Explicitly filters for `arenas.status = 'active'`
```typescript
.eq('status', 'active')
```

**Line 124:** Checks `requireArcAccess(supabase, project.id, 2)` which verifies:
- Project has `arc_project_access.application_status = 'approved'`
- Project has `arc_project_features.option2_normal_unlocked = true`

**Line 131-165:** Uses dates from `arc_project_features` to determine if leaderboard is Live or Upcoming

## The Problem

**Bitcoin (and other approved projects) will NOT appear in Live/Upcoming because:**

1. Approval sets all the right flags ✅
2. But no `arena` is created ❌
3. `live-leaderboards` API queries `arenas` table with `status = 'active'` ❌
4. No arena = no results, regardless of approval status ❌

## Verification Queries

To verify this for Bitcoin (or any approved project):

```sql
-- Check if Bitcoin project exists and is approved
SELECT 
  p.id,
  p.slug,
  p.name,
  p.arc_active,
  p.arc_access_level,
  apa.application_status as access_status,
  apf.option2_normal_unlocked,
  apf.leaderboard_enabled,
  apf.leaderboard_start_at,
  apf.leaderboard_end_at
FROM projects p
LEFT JOIN arc_project_access apa ON apa.project_id = p.id
LEFT JOIN arc_project_features apf ON apf.project_id = p.id
WHERE p.slug = 'bitcoin' OR p.name ILIKE '%bitcoin%';

-- Check if Bitcoin has any arenas
SELECT 
  a.id,
  a.name,
  a.slug,
  a.status,
  a.project_id,
  p.slug as project_slug
FROM arenas a
JOIN projects p ON p.id = a.project_id
WHERE p.slug = 'bitcoin' OR p.name ILIKE '%bitcoin%';
```

## Solutions

### Option 1: Auto-Create Arena on Approval (RECOMMENDED)

**Modify:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`

After approving with `arc_access_level = 'leaderboard'`, automatically create an arena:

```typescript
// After updating arc_project_features (around line 458)
if (arc_access_level === 'leaderboard') {
  // Check if arena already exists for this project
  const { data: existingArena } = await supabase
    .from('arenas')
    .select('id, status')
    .eq('project_id', request.project_id)
    .maybeSingle();

  if (!existingArena) {
    // Get project name for arena name
    const { data: project } = await supabase
      .from('projects')
      .select('name, slug')
      .eq('id', request.project_id)
      .single();

    if (project) {
      // Create default arena
      const arenaSlug = `${project.slug}-leaderboard-${Date.now()}`;
      const { error: arenaError } = await supabase
        .from('arenas')
        .insert({
          project_id: request.project_id,
          name: `${project.name} Leaderboard`,
          slug: arenaSlug,
          status: 'active', // Or 'scheduled' if dates are in future
          starts_at: start_at ? new Date(start_at).toISOString() : null,
          ends_at: end_at ? new Date(end_at).toISOString() : null,
          created_by: adminProfile.profileId,
        });

      if (arenaError) {
        console.error('[Admin Leaderboard Request Update API] Error creating arena:', arenaError);
        // Don't fail the request, but log the error
      } else {
        console.log('[Admin Leaderboard Request Update API] Successfully created arena for project:', request.project_id);
      }
    }
  } else if (existingArena.status !== 'active') {
    // Update existing arena to active
    await supabase
      .from('arenas')
      .update({ status: 'active' })
      .eq('id', existingArena.id);
  }
}
```

### Option 2: Manual Arena Creation Workflow

Keep current behavior but document that admins must:
1. Approve the request (sets flags)
2. Manually create an arena via admin panel
3. Set arena status to 'active'

**Issue:** This is error-prone and creates confusion.

### Option 3: Modify Live Leaderboards API (NOT RECOMMENDED)

Change `live-leaderboards` API to not require arenas, instead query directly from `arc_project_features`.

**Issue:** This breaks the arena-based architecture and may affect other features that depend on arenas.

## Recommended Fix

**Implement Option 1:** Auto-create arena on approval.

**Benefits:**
- Seamless workflow - approval immediately makes project visible
- No manual steps required
- Consistent with "approve = go live" expectation

**Considerations:**
- Arena slug generation must be unique
- Handle case where arena already exists
- Set arena status based on dates (active vs scheduled)
- May want to allow manual arena creation later for customization

## Immediate Action Items

1. ✅ Verify Bitcoin's approval status in database
2. ✅ Check if Bitcoin has an arena record
3. 🔧 Implement auto-arena creation on approval
4. 🔧 Test approval → arena creation → live visibility flow
5. 📝 Document the workflow for admins

## Database Schema Reference

**arenas table:**
- `id` (UUID, PRIMARY KEY)
- `project_id` (UUID, FK → projects.id)
- `slug` (TEXT, UNIQUE)
- `name` (TEXT)
- `status` (TEXT: 'draft', 'scheduled', 'active', 'ended', 'cancelled')
- `starts_at` (TIMESTAMPTZ, nullable)
- `ends_at` (TIMESTAMPTZ, nullable)
- `created_by` (UUID, FK → profiles.id, nullable)

**Required for Live visibility:**
- `status = 'active'`
- `project_id` must match approved project

