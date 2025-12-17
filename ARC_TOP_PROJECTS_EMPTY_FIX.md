# Fix: ARC Top Projects Chart Showing Empty

## Problem
The ARC Top Projects treemap chart on `/portal/arc` is showing an empty chart (just the Recharts SVG surface with no data).

## Root Cause
The ARC Top Projects API endpoint **only includes projects where `profile_type = 'project'`**. If no projects in your database have this classification, the chart will be empty.

**Projects are NOT included if:**
- `profile_type = 'personal'` (personal profiles - default)
- `profile_type IS NULL` (unclassified - also common default)
- `is_active = false` (hidden/inactive projects)

## Solution: Classify Projects

### Step 1: Check Current Classification Status

Run this SQL in your Supabase SQL Editor:

```sql
-- Count projects by profile_type
SELECT 
  profile_type,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count
FROM projects
GROUP BY profile_type
ORDER BY profile_type NULLS FIRST;

-- List active projects that are NOT classified as 'project'
SELECT 
  id,
  name,
  display_name,
  x_handle,
  profile_type,
  is_active
FROM projects
WHERE is_active = true 
  AND (profile_type IS NULL OR profile_type = 'personal')
ORDER BY name
LIMIT 20;
```

### Step 2: Classify Projects via Admin UI (Recommended)

1. **Go to Projects Admin:**
   - Navigate to `/portal/admin/projects`
   - Make sure you're logged in as SuperAdmin

2. **Classify Each Project:**
   - Find a project you want to show in ARC
   - Click the **"Classify"** button (or edit icon)
   - Set **"Ecosystem Type"** to **"Project"**
   - Optionally check **"Is Company"** if it's a company
   - Save the changes

3. **Verify:**
   - Go back to `/portal/arc`
   - Refresh the page
   - The project should now appear in the Top Projects treemap

### Step 3: Bulk Classify via SQL (Quick Fix)

If you want to quickly classify multiple projects at once, you can use SQL:

```sql
-- Classify specific projects by Twitter handle
UPDATE projects 
SET profile_type = 'project'
WHERE x_handle IN ('project1', 'project2', 'project3')
  AND is_active = true;

-- Classify all active projects that have metrics (use carefully!)
UPDATE projects 
SET profile_type = 'project'
WHERE is_active = true
  AND id IN (
    SELECT DISTINCT project_id 
    FROM metrics_daily 
    WHERE date >= NOW() - INTERVAL '30 days'
  )
  AND (profile_type IS NULL OR profile_type = 'personal');
```

**⚠️ Warning:** Be careful with bulk updates! Only classify projects that should actually appear as "projects" in ARC, not personal profiles.

## How It Works

### Classification Flow

1. **Track:** When a user tracks a Twitter profile, a project is created with `profile_type = NULL` (unclassified)

2. **Classify:** A SuperAdmin must classify the project:
   - `profile_type = 'project'` → Appears in ARC Top Projects
   - `profile_type = 'personal'` → Does NOT appear in ARC (personal profile)
   - `profile_type = NULL` → Does NOT appear in ARC (unclassified)

3. **Display:** Only projects with `profile_type = 'project'` AND `is_active = true` appear in:
   - `/portal/arc` (Top Projects treemap)
   - ARC summary counts
   - ARC top-projects API endpoint

### API Endpoint Details

The `/api/portal/arc/top-projects` endpoint queries:

```typescript
supabase
  .from('projects')
  .select('id, display_name, x_handle, arc_access_level, arc_active, profile_type, slug')
  .eq('is_active', true)
  .eq('profile_type', 'project')  // ← This is the key filter
  .order('name', { ascending: true });
```

## Debugging

### Check Browser Console

Open browser DevTools (F12) and check the Console tab for:

```
[ARC top-projects] Found X projects with profile_type='project'
```

If it says `Found 0 projects`, then no projects are classified.

### Check Network Tab

1. Open DevTools → Network tab
2. Reload `/portal/arc`
3. Find the request to `/api/portal/arc/top-projects?...`
4. Check the Response:
   - If `items: []` → No projects classified
   - If `items: [...]` → Projects exist but might not be rendering (different issue)

### Check Server Logs

Look for these log messages:
- `[ARC top-projects] Found X projects with profile_type='project'`
- `[ARC top-projects] No projects found with profile_type='project'`

## Complete Diagnostic Script

Run the full diagnostic script: `supabase/check_arc_projects_classification.sql`

This will show you:
1. Count of projects by classification status
2. List of projects that ARE classified as 'project'
3. List of projects that are NOT classified (won't appear)
4. Which projects have metrics data

## Related Files

- API Endpoint: `src/web/pages/api/portal/arc/top-projects.ts` (line 196)
- Classification Endpoint: `src/web/pages/api/portal/admin/projects/classify.ts`
- Frontend Component: `src/web/components/arc/ArcTopProjectsTreemap.tsx`
- Admin UI: `src/web/pages/portal/admin/projects.tsx`

## Summary

**The chart is empty because no projects are classified as `profile_type = 'project'`.**

**To fix:** Classify projects via `/portal/admin/projects` by setting "Ecosystem Type" to "Project" for each project you want to appear in ARC.

