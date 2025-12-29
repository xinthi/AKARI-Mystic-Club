# TASK 3: ROOT CAUSE ANALYSIS

## Issue: "ARC is not enabled" on `/portal/arc/mysticheros`

### Root Cause

**File:** `src/web/pages/portal/arc/[slug].tsx` (lines 179-210)

**Problem:**
The page fetches projects from `/api/portal/arc/projects`, which queries `project_arc_settings.is_arc_enabled`. However:
1. The unified state system uses `arc_project_features` modules (leaderboard_enabled, gamefi_enabled, crm_enabled)
2. These are separate tables with different enablement logic
3. A project can have modules enabled in `arc_project_features` but no row in `project_arc_settings`, causing it to not appear in the list

**Why it fails:**
- Line 190: `fetch('/api/portal/arc/projects')` → queries `project_arc_settings.is_arc_enabled=true`
- Line 199: `data.projects.find((p) => p.slug === slug)` → returns null if project not in list
- Line 529: Shows "ARC is not enabled for this project" when `project` is null

**Fix:**
1. Resolve project by slug directly from `projects` table
2. Fetch unified state via `/api/portal/arc/state?projectId=<id>`
3. Show project if ANY module is enabled (leaderboard, gamefi, or crm)

---

## Additional Issues Found

### Issue 2: Navigation to Placeholder Leaderboard Page
**Location:** Not directly in [slug].tsx, but the page has a "leaderboard" tab that should link to arena page

**Problem:**
- Leaderboard tab content exists inline, but should link to dedicated arena page when clicked
- No direct button to view the full arena leaderboard page

**Fix:**
- Add "View Leaderboard" button that links to `/portal/arc/[slug]/arena/[arenaSlug]`
- Determine active arena for the project and use its slug

---

## Files to Modify

1. **`src/web/pages/portal/arc/[slug].tsx`**
   - Change project fetching logic to resolve by slug and check unified state
   - Add unified state fetching
   - Add "View Leaderboard" button linking to arena page
   - Show module-specific buttons (Leaderboard, CRM, GameFi)

2. **Helper function needed:**
   - Resolve project by slug → project ID
   - Fetch active arena by project ID
   - Check user permissions (project admin/mod/owner)

---

## Implementation Plan

### Step A: Fix Project Resolution & Enablement Check
- Resolve project by slug from `projects` table
- Fetch unified state from `/api/portal/arc/state?projectId=<id>`
- Show project if any module is enabled
- Display enabled modules

### Step B: Fix Leaderboard Navigation
- Fetch active arena for project
- Add "View Leaderboard" button linking to `/portal/arc/[slug]/arena/[arenaSlug]`
- Ensure button shows only when leaderboard module is enabled

---

**END OF ROOT CAUSE ANALYSIS**

