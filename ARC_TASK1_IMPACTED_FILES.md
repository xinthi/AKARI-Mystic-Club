# TASK 1: IMPACTED CODE FILES

**Purpose:** List of all code files that currently use `arc_access_level` or `arc_active` and will need updates when implementing the unified module enablement system.

**Status:** For reference only - no code changes in Task 1 (specification phase)

## SUMMARY

- **Total Files:** 26 code files
- **API Routes:** 15 files
- **UI Pages:** 6 files
- **Components:** 5 files
- **Libraries:** 2 files
- **Database Migrations:** 1 file (existing)

## DETAILED LIST

### 1. API Routes (15 files)

#### ARC State & Summary
1. **`src/web/pages/api/portal/arc/summary.ts`**
   - Reads: `arc_access_level`, `arc_active`, `arc_active_until`
   - Usage: Calculates ARC enabled projects count
   - Impact: High - needs to check module enablements instead

2. **`src/web/pages/api/portal/arc/cta-state.ts`**
   - Reads: `arc_access_level`, `arc_active`, `arc_active_until`
   - Usage: Returns CTA state for project pages
   - Impact: High - needs to check module enablements

3. **`src/web/pages/api/portal/arc/top-projects.ts`**
   - Reads: `arc_access_level`, `arc_active`
   - Usage: Determines project clickability in heatmap
   - Impact: Medium - needs module-based clickability logic

4. **`src/web/pages/api/portal/arc/projects.ts`**
   - Reads: Via `project_arc_settings` join
   - Usage: Lists ARC projects
   - Impact: Medium - may need to join `arc_project_features`

5. **`src/web/pages/api/portal/arc/project/[projectId].ts`**
   - Likely reads: ARC state
   - Impact: Medium - needs verification

6. **`src/web/pages/api/portal/arc/my-projects.ts`**
   - Likely reads: ARC state
   - Impact: Medium - needs verification

#### Admin APIs
7. **`src/web/pages/api/portal/admin/projects/[id].ts`**
   - Updates: `arc_access_level`, `arc_active`
   - Usage: Updates project ARC settings
   - Impact: High - needs to update `arc_project_features` instead

8. **`src/web/pages/api/portal/admin/projects/classify.ts`**
   - Updates: `arc_access_level`, `arc_active`, `arc_active_until`
   - Usage: Classifies projects and sets ARC settings
   - Impact: High - needs to update module enablements

9. **`src/web/pages/api/portal/admin/projects/index.ts`**
   - Reads: `arc_access_level`, `arc_active`
   - Usage: Lists projects for admin
   - Impact: Low - display only, may add module info

#### Leaderboard Requests
10. **`src/web/pages/api/portal/admin/arc/leaderboard-requests.ts`**
    - Likely reads: ARC state
    - Impact: Low - needs verification

11. **`src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`**
    - Reads: `arc_project_features` (option*_unlocked fields)
    - Usage: Approves/rejects leaderboard requests
    - Impact: Medium - may need to use new module fields

12. **`src/web/pages/api/portal/arc/leaderboard-requests.ts`**
    - Likely reads: ARC state
    - Impact: Low - needs verification

#### Other ARC APIs
13. **`src/web/pages/api/portal/admin/arc/profiles.ts`**
    - Likely uses: ARC state
    - Impact: Low - needs verification

14. **`src/web/pages/api/portal/admin/arc/profiles/[profileId].ts`**
    - Likely uses: ARC state
    - Impact: Low - needs verification

15. **`src/web/pages/api/portal/arc/projects/[projectId]/leaderboard.ts`**
    - Likely uses: ARC state
    - Impact: Medium - needs verification

### 2. UI Pages (6 files)

#### Admin Pages
16. **`src/web/pages/portal/admin/projects.tsx`**
    - Reads/Writes: `arc_access_level`, `arc_active`, `arc_active_until`
    - Usage: Admin table with inline editing of ARC fields
    - Impact: High - needs UI for module enablement

17. **`src/web/pages/portal/arc/admin/index.tsx`**
    - Uses: ARC settings
    - Impact: Medium - needs to display module states

18. **`src/web/pages/portal/admin/arc/leaderboard-requests.tsx`**
    - Uses: ARC state
    - Impact: Low - display only

#### Public/User Pages
19. **`src/web/pages/portal/arc/index.tsx`**
    - Uses: `arc_access_level` for routing
    - Usage: Routes to correct ARC page based on access level
    - Impact: High - needs module-based routing logic

20. **`src/web/pages/portal/arc/project/[projectId].tsx`**
    - Uses: ARC state
    - Impact: High - main project hub page

21. **`src/web/pages/portal/arc/requests.tsx`**
    - Uses: ARC state
    - Impact: Low - display only

### 3. Components (5 files)

22. **`src/web/components/arc/ArcTopProjectsTreemap.tsx`**
    - Uses: `arc_access_level`, `arc_active`
    - Usage: Determines project clickability and routing
    - Impact: High - core treemap component

23. **`src/web/components/arc/ArcTopProjectsTreemapClient.tsx`**
    - Uses: ARC state
    - Impact: Medium - client-side treemap

24. **`src/web/components/arc/ArcTopProjectsCards.tsx`**
    - Uses: ARC state
    - Impact: Medium - cards display

25. **`src/web/components/arc/ArcTopProjectsMosaic.tsx`**
    - Uses: ARC state
    - Impact: Medium - mosaic display

26. **`src/web/components/arc/ArcProjectsTreemapV2.tsx`**
    - Uses: ARC state
    - Impact: Low - legacy component

27. **`src/web/components/arc/ArcProjectsTreemapV3.tsx`**
    - Uses: ARC state
    - Impact: Medium - treemap variant

### 4. Libraries (2 files)

28. **`src/web/lib/arc/expiration.ts`**
    - Reads: `arc_active`, `arc_active_until`
    - Usage: Checks if ARC access has expired
    - Impact: High - may need module-specific expiration logic

29. **`src/web/lib/arc/access-policy.ts`**
    - Likely uses: ARC state
    - Impact: High - needs verification, may need module-based policies

### 5. Database Migrations (1 file)

30. **`supabase/migrations/20241222_add_arc_access_level.sql`**
    - Creates: `arc_access_level`, `arc_active`, `arc_active_until` columns
    - Status: Existing migration (keep for backward compatibility)
    - Impact: None - historical migration, no changes needed

## IMPACT PRIORITY

### HIGH PRIORITY (Core Functionality)
Files that directly read/write ARC enablement state:
- API: `summary.ts`, `cta-state.ts`, `admin/projects/[id].ts`, `admin/projects/classify.ts`
- UI: `admin/projects.tsx`, `arc/index.tsx`, `arc/project/[projectId].tsx`
- Components: `ArcTopProjectsTreemap.tsx`
- Libraries: `expiration.ts`, `access-policy.ts`

### MEDIUM PRIORITY (Secondary Features)
Files that use ARC state but may have fallbacks:
- API: `top-projects.ts`, `projects.ts`, `project/[projectId].ts`, `my-projects.ts`
- UI: `arc/admin/index.tsx`
- Components: `ArcTopProjectsTreemapClient.tsx`, `ArcTopProjectsCards.tsx`, `ArcTopProjectsMosaic.tsx`

### LOW PRIORITY (Display/Reference)
Files that only read ARC state for display:
- API: `admin/arc/leaderboard-requests.ts`, `arc/leaderboard-requests.ts`
- UI: `admin/arc/leaderboard-requests.tsx`, `arc/requests.tsx`
- Components: Legacy treemap variants

## MIGRATION STRATEGY (For Task 2+)

1. **Phase 1:** Create unified state API (`/api/portal/arc/state`)
   - Reads from `arc_project_features` first
   - Falls back to `projects.arc_access_level` if row missing
   - Returns standardized module state

2. **Phase 2:** Update high-priority files to use unified state API
   - Start with API routes (easier to test)
   - Then UI pages
   - Then components

3. **Phase 3:** Update medium/low priority files
   - Gradual migration
   - Test after each change

4. **Phase 4:** Remove fallback logic (future)
   - After all code uses new system
   - Deprecate `arc_access_level`

**END OF IMPACTED FILES LIST**
