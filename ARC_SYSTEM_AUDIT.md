# ARC System Audit Report

**Date:** 2024-12-26  
**Scope:** Complete audit of ARC (Access, Recognition, Community) system functionality

---

## Executive Summary

The ARC system has foundational infrastructure in place, but **two critical features are missing**:
1. **No UI/API for users to request leaderboard access** - Users cannot request to open a leaderboard for a project
2. **No dedicated UI for Super Admin to select heatmap projects** - Heatmap selection is done through general project classification, not a dedicated interface

Additionally, the leaderboard pages show "Coming Soon" placeholders, indicating the actual leaderboard functionality is not yet implemented.

---

## 1. Current Working Features ✅

### 1.1 ARC Access Level System
- **Status:** ✅ **WORKING**
- **Location:** `projects.arc_access_level` field
- **Values:** `none`, `creator_manager`, `leaderboard`, `gamified`
- **Implementation:**
  - Database field exists with proper constraints
  - Super Admin can set via `/portal/admin/projects` page
  - Inline editing in projects table works
  - Classification modal supports setting arc_access_level
- **Files:**
  - `supabase/migrations/20241222_add_arc_access_level.sql`
  - `src/web/pages/portal/admin/projects.tsx` (lines 589-620)
  - `src/web/pages/api/portal/admin/projects/[id].ts`

### 1.2 ARC Active Toggle
- **Status:** ✅ **WORKING**
- **Location:** `projects.arc_active` field
- **Implementation:**
  - Super Admin can toggle via checkbox in projects table
  - Inline updates work correctly
  - Supports `arc_active_until` date field
- **Files:**
  - `src/web/pages/portal/admin/projects.tsx` (lines 622-651)

### 1.3 Project Classification
- **Status:** ✅ **WORKING**
- **Location:** `/portal/admin/projects` → "Classify" button
- **Functionality:**
  - Super Admin can classify projects as `project` or `personal`
  - Setting `profile_type = 'project'` makes projects appear in heatmap
  - Classification modal includes ARC settings
- **Files:**
  - `src/web/pages/portal/admin/projects.tsx` (lines 687-786)
  - `src/web/pages/api/portal/admin/projects/classify.ts`

### 1.4 Heatmap Display
- **Status:** ✅ **WORKING** (with limitations)
- **Location:** `/portal/arc` → Top Projects Treemap
- **Filtering Logic:**
  - Only shows projects where `profile_type = 'project'`
  - Does NOT filter by `arc_active` or `arc_access_level` for inclusion
  - Projects appear even if `arc_active = false` (they just show as locked)
- **Files:**
  - `src/web/pages/api/portal/arc/top-projects.ts` (line 195: `.eq('profile_type', 'project')`)
  - `src/web/components/arc/ArcTopProjectsTreemap.tsx`

### 1.5 Project Navigation
- **Status:** ✅ **WORKING**
- **Routing Logic:**
  - `arc_access_level = 'creator_manager'` → `/portal/arc/creator-manager?projectId=...`
  - `arc_access_level = 'leaderboard'` or `'gamified'` → `/portal/arc/project/[projectId]`
  - `arc_access_level = 'none'` → Project is locked (not clickable)
- **Files:**
  - `src/web/pages/portal/arc/index.tsx` (lines 905-913)
  - `src/web/components/arc/ArcTopProjectsTreemap.tsx` (lines 296-350)

---

## 2. Missing Features ❌

### 2.1 Leaderboard Request System

**Status:** ❌ **NOT IMPLEMENTED**

**Problem:** Users cannot request to open a leaderboard for a project. There is no UI or API endpoint for this functionality.

**What Exists:**
- `akari_access_requests` table exists for feature access requests (Deep Explorer, Institutional Plus)
- Access request API exists at `/api/portal/access/request` but only supports `deep.explorer` and `institutional.plus` features

**What's Missing:**
1. **No UI Component** for requesting leaderboard access
   - No button/form on project pages
   - No button on ARC home page
   - No dedicated request page

2. **No API Endpoint** for leaderboard requests
   - Current `/api/portal/access/request` only accepts `deep.explorer` and `institutional.plus`
   - No endpoint like `/api/portal/arc/request-leaderboard`

3. **No Database Schema** for leaderboard requests
   - Could extend `akari_access_requests` to support project-specific requests
   - Or create new table like `arc_leaderboard_requests`

4. **No Admin UI** to view/approve leaderboard requests
   - `/portal/admin/access` only shows Deep Explorer/Institutional Plus requests

**Recommended Implementation:**
```typescript
// New API endpoint: /api/portal/arc/request-leaderboard
POST {
  projectId: string;
  justification?: string;
}

// Extend akari_access_requests or create arc_leaderboard_requests table
// Add UI button on project pages when arc_access_level = 'none'
// Add admin page to view/approve requests
```

**Files to Create/Modify:**
- `src/web/pages/api/portal/arc/request-leaderboard.ts` (NEW)
- `src/web/pages/portal/arc/project/[projectId].tsx` (ADD request button)
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` (NEW)
- `supabase/migrations/YYYYMMDD_add_arc_leaderboard_requests.sql` (NEW, optional)

---

### 2.2 Dedicated Heatmap Project Selection UI

**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Problem:** Super Admin can control which projects appear in the heatmap, but there's no dedicated UI specifically for "choosing projects to show in heatmap". It's done through the general project classification modal.

**Current Workflow:**
1. Go to `/portal/admin/projects`
2. Click "Classify" on a project
3. Set "Ecosystem Type" to "Project"
4. Project appears in heatmap (if `profile_type = 'project'`)

**What's Missing:**
1. **No Dedicated Heatmap Management Page**
   - No page like `/portal/admin/arc/heatmap` to manage heatmap visibility
   - No bulk selection interface
   - No visual preview of which projects are in heatmap

2. **No Separate Field for Heatmap Visibility**
   - Currently uses `profile_type = 'project'` which also affects other parts of the system
   - Could benefit from dedicated `show_in_heatmap` boolean field

3. **No Quick Toggle**
   - Must open classification modal to change heatmap visibility
   - No inline toggle in projects table

**Recommended Implementation:**
```typescript
// Option 1: Add dedicated field
ALTER TABLE projects ADD COLUMN show_in_heatmap BOOLEAN DEFAULT false;

// Option 2: Add dedicated admin page
/portal/admin/arc/heatmap
- List all projects with profile_type = 'project'
- Toggle show_in_heatmap for each
- Bulk select/deselect
- Preview of heatmap

// Option 3: Add inline toggle in projects table
// Add "Show in Heatmap" column with checkbox
```

**Files to Create/Modify:**
- `src/web/pages/portal/admin/arc/heatmap.tsx` (NEW, optional)
- `src/web/pages/portal/admin/projects.tsx` (ADD heatmap toggle column)
- `supabase/migrations/YYYYMMDD_add_show_in_heatmap.sql` (NEW, optional)

**Note:** The current system works, but a dedicated UI would improve UX. This is a **nice-to-have** enhancement, not a critical missing feature.

---

### 2.3 Actual Leaderboard Functionality

**Status:** ❌ **NOT IMPLEMENTED**

**Problem:** Leaderboard pages show "Coming Soon" placeholders. The actual leaderboard data and UI are not implemented.

**Current State:**
- Project pages with `arc_access_level = 'leaderboard'` or `'gamified'` show:
  ```
  📊 Leaderboard Coming Soon
  The leaderboard for this project is currently under development. Check back soon!
  ```

**What's Missing:**
1. **No Leaderboard Data**
   - No API to fetch leaderboard rankings
   - No calculation of creator scores/points per project
   - No arena/creator participation tracking

2. **No Leaderboard UI**
   - No table/list of ranked creators
   - No filtering/sorting options
   - No pagination

3. **No Integration with Creator Manager**
   - Creator Manager exists but leaderboards aren't connected
   - No way to see creator rankings from missions/arenas

**Files Showing Placeholder:**
- `src/web/pages/portal/arc/project/[projectId].tsx` (lines 277-285)

**Note:** This is a major feature that requires significant development. It's separate from the "request leaderboard" feature.

---

## 3. Feature Status Matrix

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| ARC Access Level (none/creator_manager/leaderboard/gamified) | ✅ Working | `/portal/admin/projects` | Can set via inline dropdown or classification modal |
| ARC Active Toggle | ✅ Working | `/portal/admin/projects` | Inline checkbox updates immediately |
| Project Classification | ✅ Working | `/portal/admin/projects` → Classify | Sets profile_type and ARC settings |
| Heatmap Display | ✅ Working | `/portal/arc` | Shows projects where profile_type = 'project' |
| Project Navigation | ✅ Working | ARC home & treemap | Routes based on arc_access_level |
| **Leaderboard Request (User)** | ❌ **MISSING** | N/A | No UI or API for users to request |
| **Leaderboard Request (Admin)** | ❌ **MISSING** | N/A | No admin page to view/approve requests |
| **Dedicated Heatmap Selection UI** | ⚠️ Partial | `/portal/admin/projects` | Works but no dedicated interface |
| **Actual Leaderboard Pages** | ❌ **MISSING** | `/portal/arc/project/[id]` | Shows "Coming Soon" placeholder |

---

## 4. Database Schema Review

### 4.1 Existing Tables

**`projects` table:**
- ✅ `arc_access_level` (TEXT) - Working
- ✅ `arc_active` (BOOLEAN) - Working
- ✅ `arc_active_until` (TIMESTAMPTZ) - Working
- ✅ `profile_type` (TEXT) - Used for heatmap filtering

**`akari_access_requests` table:**
- ✅ Exists and works for Deep Explorer/Institutional Plus
- ❌ Does NOT support project-specific leaderboard requests

### 4.2 Missing Tables/Schema

**Option 1: Extend `akari_access_requests`**
```sql
ALTER TABLE akari_access_requests 
  ADD COLUMN project_id UUID REFERENCES projects(id),
  ADD COLUMN request_type TEXT CHECK (request_type IN ('feature', 'leaderboard'));
```

**Option 2: Create `arc_leaderboard_requests`**
```sql
CREATE TABLE arc_leaderboard_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES akari_users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Optional: Add `show_in_heatmap` field**
```sql
ALTER TABLE projects 
  ADD COLUMN show_in_heatmap BOOLEAN DEFAULT false;
```

---

## 5. API Endpoints Review

### 5.1 Existing Endpoints ✅

- `GET /api/portal/arc/top-projects` - Returns projects for heatmap (working)
- `GET /api/portal/arc/summary` - Returns ARC statistics (working)
- `GET /api/portal/arc/projects` - Returns ARC projects (working)
- `POST /api/portal/arc/join-campaign` - Join campaign (working)
- `PATCH /api/portal/admin/projects/[id]` - Update project ARC fields (working)
- `POST /api/portal/admin/projects/classify` - Classify project (working)

### 5.2 Missing Endpoints ❌

- `POST /api/portal/arc/request-leaderboard` - Request leaderboard access (MISSING)
- `GET /api/portal/admin/arc/leaderboard-requests` - List requests (MISSING)
- `PATCH /api/portal/admin/arc/leaderboard-requests/[id]` - Approve/reject (MISSING)
- `GET /api/portal/arc/project/[id]/leaderboard` - Get leaderboard data (MISSING)

---

## 6. UI Components Review

### 6.1 Existing Components ✅

- `ArcTopProjectsTreemap` - Heatmap visualization (working)
- `TopProjectsListFallback` - List fallback (working)
- Project classification modal (working)
- ARC field inline editors (working)

### 6.2 Missing Components ❌

- Leaderboard request button/form (MISSING)
- Leaderboard request admin page (MISSING)
- Actual leaderboard display component (MISSING)
- Dedicated heatmap management page (MISSING, optional)

---

## 7. Recommendations

### 7.1 Critical (Must Have)

1. **Implement Leaderboard Request System**
   - Add request button on project pages when `arc_access_level = 'none'`
   - Create API endpoint for requests
   - Create admin page to view/approve requests
   - When approved, Super Admin can set `arc_access_level = 'leaderboard'` or `'gamified'`

2. **Implement Actual Leaderboard Pages**
   - Build leaderboard data aggregation
   - Create leaderboard UI component
   - Connect to Creator Manager/arenas data

### 7.2 Important (Should Have)

3. **Add Dedicated Heatmap Management**
   - Add `show_in_heatmap` field (optional, can keep using `profile_type`)
   - Add inline toggle in projects table
   - Or create dedicated `/portal/admin/arc/heatmap` page

### 7.3 Nice to Have (Enhancements)

4. **Improve UX**
   - Add bulk operations for heatmap selection
   - Add visual indicators for which projects are in heatmap
   - Add request status indicators on project pages

---

## 8. Implementation Priority

1. **HIGH:** Leaderboard Request System (users need a way to request)
2. **HIGH:** Actual Leaderboard Functionality (core feature)
3. **MEDIUM:** Dedicated Heatmap Management UI (current system works)
4. **LOW:** UX enhancements

---

## 9. Files That Need Changes

### For Leaderboard Requests:
- `src/web/pages/api/portal/arc/request-leaderboard.ts` (NEW)
- `src/web/pages/portal/arc/project/[projectId].tsx` (MODIFY - add request button)
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` (NEW)
- `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts` (NEW)
- `supabase/migrations/YYYYMMDD_add_arc_leaderboard_requests.sql` (NEW)

### For Heatmap Management:
- `src/web/pages/portal/admin/projects.tsx` (MODIFY - add heatmap column)
- `src/web/pages/portal/admin/arc/heatmap.tsx` (NEW, optional)
- `supabase/migrations/YYYYMMDD_add_show_in_heatmap.sql` (NEW, optional)

### For Actual Leaderboards:
- `src/web/pages/api/portal/arc/project/[id]/leaderboard.ts` (NEW)
- `src/web/pages/portal/arc/project/[projectId].tsx` (MODIFY - replace placeholder)
- `src/web/components/arc/ArcLeaderboard.tsx` (NEW)

---

## 10. Conclusion

The ARC system has a solid foundation with working access level management, project classification, and heatmap display. However, **two critical user-facing features are missing**:

1. **No way for users to request leaderboard access** - This is a blocker for projects that want to enable leaderboards
2. **No actual leaderboard functionality** - Pages show "Coming Soon" placeholders

The heatmap project selection works through the existing classification system, but a dedicated UI would improve the admin experience.

**Next Steps:**
1. Implement leaderboard request system (API + UI)
2. Build actual leaderboard pages with data
3. Consider adding dedicated heatmap management UI

