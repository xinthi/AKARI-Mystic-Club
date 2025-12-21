# ARC Implementation Audit Report

**Date:** 2025-01-20  
**Scope:** Complete inventory of ARC (Arena Creator) implementation status

---

## 1. ARC Pages Under `src/web/pages/portal/arc`

### 1.1 `/portal/arc/index.tsx` (ARC Home)
**Purpose:** Main landing page for ARC, displays ARC projects and top projects  
**Renders:**
- ARC projects list (grid view)
- Top projects section (gainers/losers, 24h/7d/30d/90d, cards/treemap view)
- Admin links (if SuperAdmin)

**API Endpoints Called:**
- `GET /api/portal/arc/projects` - Fetch ARC-enabled projects
- `GET /api/portal/arc/top-projects?mode={gainers|losers}&timeframe={24h|7d|30d|90d}&limit=20` - Fetch top projects

**Lines:** 615 total  
**Location:** `src/web/pages/portal/arc/index.tsx:1-615`

---

### 1.2 `/portal/arc/[slug].tsx` (Project Hub)
**Purpose:** Individual ARC project page showing project details, arenas, leaderboard, missions, storyline, and map  
**Renders:**
- Project hero section (banner, name, tagline, stats)
- Tab navigation: Overview, Leaderboard, Missions, Storyline, Map
- Arena list
- Creator leaderboard (filterable by ring, searchable, sortable)
- Mission list (placeholder logic)
- Storyline events (creator join events)
- Creator map (bubble map visualization)

**API Endpoints Called:**
- `GET /api/portal/arc/project/{slug}` - Fetch project by slug (via `project-by-slug.ts`)
- `GET /api/portal/arc/state?projectId={id}` - Fetch unified ARC state
- `GET /api/portal/arc/arenas?projectId={id}` - Fetch arenas for project
- `GET /api/portal/arc/arenas/{arenaSlug}` - Fetch arena details with creators
- `GET /api/portal/arc/projects` - Fetch project settings (meta/tier)
- `POST /api/portal/arc/join-campaign` - Join campaign

**Lines:** 1274 total  
**Location:** `src/web/pages/portal/arc/[slug].tsx:1-1274`

---

### 1.3 `/portal/arc/[slug]/arena/[arenaSlug].tsx` (Arena Details)
**Purpose:** Individual arena page with leaderboard, storyline, map, and admin controls  
**Renders:**
- Arena header (name, description, status, dates, reward depth)
- Tab navigation: Leaderboard, Storyline, Map
- Creator leaderboard (filterable, sortable, searchable)
- Admin modals (Add Creator, Edit Creator, Adjust Points, View History)
- Storyline events
- Creator bubble map
- Sentiment section (beta placeholder)

**API Endpoints Called:**
- `GET /api/portal/arc/arenas/{arenaSlug}` - Fetch arena details with creators and project
- `POST /api/portal/arc/arena-creators-admin` - Add creator
- `PATCH /api/portal/arc/arena-creators-admin` - Edit creator
- `DELETE /api/portal/arc/arena-creators-admin?id={id}` - Remove creator
- `POST /api/portal/arc/admin/point-adjustments` - Create point adjustment
- `GET /api/portal/arc/admin/point-adjustments?arenaId={id}&creatorProfileId={id}` - Fetch adjustment history

**Lines:** 1604 total  
**Location:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:1-1604`

---

### 1.4 `/portal/arc/admin/index.tsx` (Admin Home)
**Purpose:** Admin dashboard listing all ARC-enabled projects  
**Renders:**
- Table of ARC projects with tier, status, security status, arenas count
- Links to per-project admin pages

**API Endpoints Called:**
- Server-side only (via `getServerSideProps`)

**Lines:** ~542 total  
**Location:** `src/web/pages/portal/arc/admin/index.tsx:1-542`

---

### 1.5 `/portal/arc/admin/[projectSlug].tsx` (Arena Manager)
**Purpose:** Per-project arena management interface  
**Renders:**
- Table of arenas for the project
- Create/Edit arena modals
- Arena management (status, dates, reward depth)

**API Endpoints Called:**
- `GET /api/portal/arc/arenas?slug={projectSlug}` - Fetch arenas (refresh)
- `POST /api/portal/arc/arenas-admin` - Create arena
- `PATCH /api/portal/arc/arenas-admin` - Update arena

**Lines:** 707 total  
**Location:** `src/web/pages/portal/arc/admin/[projectSlug].tsx:1-707`

---

### 1.6 Other ARC Pages (Not Detailed)
- `/portal/arc/admin/profiles.tsx` - Profile management
- `/portal/arc/creator/[twitterUsername].tsx` - Creator profile page
- `/portal/arc/creator-manager/*` - Creator manager pages (separate feature)
- `/portal/arc/requests.tsx` - Requests page
- `/portal/arc/project/[projectId].tsx` - Project detail (legacy?)
- `/portal/arc/gamified/[projectId].tsx` - Gamified project view
- `/portal/arc/leaderboard/[projectId].tsx` - Leaderboard page
- `/portal/arc/my-creator-programs*` - Creator programs (separate feature)

---

## 2. ARC API Routes Under `src/web/pages/api/portal/arc`

### 2.1 `/api/portal/arc/arenas/index.ts`
**Method:** GET  
**Query Params:**
- `projectId` (UUID, optional): Filter by project ID
- `slug` (string, optional): Filter by project slug (resolves to project_id)
- At least one required

**Response Shape:**
```typescript
{
  ok: true,
  arenas: Array<{
    id: string;
    project_id: string;
    slug: string;
    name: string;
    description: string | null;
    status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
    starts_at: string | null;
    ends_at: string | null;
    reward_depth: number;
  }>
}
```

**DB Tables:**
- `projects` (SELECT: id)
- `arenas` (SELECT: id, project_id, slug, name, description, status, starts_at, ends_at, reward_depth)

**Lines:** 161 total  
**Location:** `src/web/pages/api/portal/arc/arenas/index.ts:1-161`

---

### 2.2 `/api/portal/arc/arenas/[slug].ts`
**Method:** GET  
**Query Params:**
- `slug` (path param, string): Arena slug

**Response Shape:**
```typescript
{
  ok: true,
  arena: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
    starts_at: string | null;
    ends_at: string | null;
    reward_depth: number;
    settings: Record<string, any>;
  },
  project: {
    id: string;
    name: string;
    twitter_username: string;
    avatar_url: string | null;
  },
  creators: Array<{
    id: string;
    twitter_username: string;
    arc_points: number; // base_points
    adjusted_points: number; // effective_points = base + adjustments_sum
    ring: 'core' | 'momentum' | 'discovery';
    style: string | null;
    meta: Record<string, any>;
    profile_id: string | null;
    joined_at: string | null;
  }>,
  sentiment: {
    enabled: boolean;
    summary: null;
    series: any[];
  }
}
```

**DB Tables:**
- `arenas` (SELECT: id, slug, name, description, status, starts_at, ends_at, reward_depth, settings, project_id)
- `projects` (SELECT: id, name, x_handle, avatar_url)
- `arena_creators` (SELECT: id, twitter_username, arc_points, ring, style, meta, profile_id, created_at)
- `arc_point_adjustments` (SELECT: creator_profile_id, points_delta, arena_id) - via service client

**Special Logic:**
- Calculates `adjusted_points = base_points + SUM(adjustments)` per creator
- Sorts creators by `adjusted_points DESC`

**Lines:** 365 total  
**Location:** `src/web/pages/api/portal/arc/arenas/[slug].ts:1-365`

---

### 2.3 `/api/portal/arc/arena-details.ts`
**Method:** GET  
**Query Params:**
- `arenaId` (UUID, required): Arena ID

**Response Shape:**
```typescript
{
  ok: true,
  arena: { /* arena details */ },
  creators: Array<{ /* creator details */ }>
}
```

**DB Tables:**
- `arenas` (SELECT: id, slug, name, description, status, starts_at, ends_at, reward_depth, settings)
- `arena_creators` (SELECT: id, twitter_username, arc_points, ring, style, meta)

**Note:** Legacy endpoint, does not include adjustments calculation

**Lines:** 161 total  
**Location:** `src/web/pages/api/portal/arc/arena-details.ts:1-161`

---

### 2.4 `/api/portal/arc/admin/arena-creators.ts`
**Method:** GET  
**Query Params:**
- `arenaId` (UUID, required)

**Response Shape:**
```typescript
{
  ok: true,
  creators: Array<{
    profile_id: string | null;
    twitter_username: string;
    base_points: number;
    adjustments_sum: number;
    effective_points: number;
    ring: 'core' | 'momentum' | 'discovery';
    style: string | null;
    meta: Record<string, any>;
    joined_at: string | null;
  }>
}
```

**DB Tables:**
- `akari_user_roles` (SELECT: role) - auth check
- `akari_user_sessions` (SELECT: user_id, expires_at) - auth check
- `arena_creators` (SELECT: twitter_username, arc_points, ring, style, meta, profile_id, created_at)
- `arc_point_adjustments` (SELECT: creator_profile_id, points_delta, arena_id)

**Auth:** SuperAdmin only (DEV MODE bypass)

**Lines:** 259 total  
**Location:** `src/web/pages/api/portal/arc/admin/arena-creators.ts:1-259`

---

### 2.5 `/api/portal/arc/admin/point-adjustments.ts`
**Methods:** POST, GET  
**POST Body:**
```typescript
{
  arenaId: string;
  creatorProfileId: string;
  pointsDelta: number;
  reason: string;
}
```

**GET Query Params:**
- `arenaId` (UUID, required)
- `creatorProfileId` (UUID, optional): Filter by creator

**Response Shape (POST):**
```typescript
{
  ok: true,
  adjustment: {
    id: string;
    arena_id: string;
    creator_profile_id: string;
    points_delta: number;
    reason: string;
    created_by_profile_id: string;
    created_at: string;
    metadata: Record<string, any> | null;
  }
}
```

**Response Shape (GET):**
```typescript
{
  ok: true,
  adjustments: Array<{ /* same as POST adjustment */ }>
}
```

**DB Tables:**
- `akari_user_roles` (SELECT: role) - auth check
- `akari_user_sessions` (SELECT: user_id, expires_at) - auth check
- `akari_user_identities` (SELECT: username) - auth check
- `profiles` (SELECT: id) - auth check
- `arena_creators` (SELECT: id, profile_id) - validation
- `arc_point_adjustments` (INSERT, SELECT)

**Auth:** SuperAdmin only (DEV MODE bypass)

**Lines:** 345 total  
**Location:** `src/web/pages/api/portal/arc/admin/point-adjustments.ts:1-345`

---

### 2.6 `/api/portal/arc/arena-creators-admin.ts`
**Methods:** POST, PATCH, DELETE  
**POST Body:**
```typescript
{
  arenaId: string;
  twitter_username: string;
  arc_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style?: string;
  profile_id?: string | null;
}
```

**PATCH Body:**
```typescript
{
  id: string;
  arc_points?: number;
  ring?: 'core' | 'momentum' | 'discovery';
  style?: string | null;
}
```

**DELETE Query/Body:**
- `id` (UUID, required)

**Response Shape:**
```typescript
{
  ok: true,
  data: { /* arena_creators row */ }
}
```

**DB Tables:**
- `akari_user_roles` (SELECT: role) - auth check
- `akari_user_sessions` (SELECT: user_id, expires_at) - auth check
- `arena_creators` (INSERT, UPDATE, DELETE)

**Auth:** SuperAdmin only (DEV MODE bypass)

**Lines:** 291 total  
**Location:** `src/web/pages/api/portal/arc/arena-creators-admin.ts:1-291`

---

### 2.7 `/api/portal/arc/arenas-admin.ts`
**Methods:** POST, PATCH  
**POST Body:**
```typescript
{
  projectId: string;
  name: string;
  slug: string;
  description?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  reward_depth?: number | null;
  status?: string;
}
```

**PATCH Body:**
```typescript
{
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  reward_depth?: number | null;
  status?: string;
}
```

**Response Shape:**
```typescript
{
  ok: true,
  data: { /* arena row */ }
}
```

**DB Tables:**
- `akari_user_roles` (SELECT: role) - auth check
- `akari_user_sessions` (SELECT: user_id, expires_at) - auth check
- `arenas` (INSERT, UPDATE)

**Auth:** SuperAdmin only (DEV MODE bypass)

**Lines:** ~300 total  
**Location:** `src/web/pages/api/portal/arc/arenas-admin.ts`

---

### 2.8 Other ARC API Routes (Not Detailed)
- `/api/portal/arc/projects.ts` - List ARC projects
- `/api/portal/arc/project-by-slug.ts` - Resolve project by slug (handles slug history)
- `/api/portal/arc/state.ts` - Unified ARC state
- `/api/portal/arc/summary.ts` - ARC summary stats
- `/api/portal/arc/active-arena.ts` - Get active arena
- `/api/portal/arc/arena-creators.ts` - Public arena creators list
- `/api/portal/arc/creator.ts` - Creator profile data
- `/api/portal/arc/join-campaign.ts` - Join campaign
- `/api/portal/arc/top-projects.ts` - Top projects
- `/api/portal/arc/cta-state.ts` - CTA state
- Campaign-related endpoints (separate feature)
- Leaderboard-related endpoints (separate feature)

---

## 3. ARC-Related Database Tables

### 3.1 `arenas`
**Columns Used:**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects.id)
- `slug` (TEXT, UNIQUE)
- `name` (TEXT)
- `description` (TEXT, nullable)
- `status` (TEXT: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled')
- `starts_at` (TIMESTAMPTZ, nullable)
- `ends_at` (TIMESTAMPTZ, nullable)
- `reward_depth` (INTEGER)
- `settings` (JSONB)
- `created_by` (UUID, FK → profiles.id, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Operations:**
- SELECT: All columns (various endpoints)
- INSERT: All columns except created_at/updated_at (arenas-admin.ts POST)
- UPDATE: name, slug, description, starts_at, ends_at, reward_depth, status (arenas-admin.ts PATCH)

**Migration:** `supabase/migrations/20241213_add_arc_tables.sql:35-52`

---

### 3.2 `arena_creators`
**Columns Used:**
- `id` (UUID, PK)
- `arena_id` (UUID, FK → arenas.id)
- `profile_id` (UUID, FK → profiles.id, nullable)
- `twitter_username` (TEXT)
- `arc_points` (NUMERIC(18,4)) - Base points (never updated by adjustments)
- `ring` (TEXT: 'core' | 'momentum' | 'discovery')
- `style` (TEXT, nullable)
- `meta` (JSONB)
- `created_at` (TIMESTAMPTZ) - Mapped to `joined_at` in responses
- `updated_at` (TIMESTAMPTZ)

**Operations:**
- SELECT: All columns (various endpoints)
- INSERT: arena_id, twitter_username, arc_points, ring, style, profile_id (arena-creators-admin.ts POST)
- UPDATE: arc_points, ring, style (arena-creators-admin.ts PATCH)
- DELETE: By id (arena-creators-admin.ts DELETE)

**Note:** `arc_points` is the BASE value. Effective points = `arc_points + SUM(adjustments.points_delta)`.

**Migration:** `supabase/migrations/20241213_add_arc_tables.sql:54-70`

---

### 3.3 `arc_point_adjustments`
**Columns Used:**
- `id` (UUID, PK)
- `arena_id` (UUID, FK → arenas.id)
- `creator_profile_id` (UUID, FK → profiles.id)
- `points_delta` (NUMERIC(18,4)) - Can be negative (slashing)
- `reason` (TEXT) - Required
- `created_by_profile_id` (UUID, FK → profiles.id)
- `created_at` (TIMESTAMPTZ)
- `metadata` (JSONB, nullable)

**Operations:**
- SELECT: All columns (point-adjustments.ts GET, arenas/[slug].ts)
- INSERT: All columns except id/created_at (point-adjustments.ts POST)

**Note:** This is an audit trail. Never directly modify `arena_creators.arc_points` for adjustments.

**Migration:** `supabase/migrations/20250120_arc_task4_slug_history_and_point_adjustments.sql:102-111`

---

### 3.4 `project_arc_settings`
**Columns Used:**
- `project_id` (UUID, PK, FK → projects.id)
- `is_arc_enabled` (BOOLEAN)
- `tier` (TEXT: 'basic' | 'pro' | 'event_host')
- `status` (TEXT: 'inactive' | 'active' | 'suspended')
- `security_status` (TEXT: 'normal' | 'alert' | 'clear')
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Operations:**
- SELECT: All columns (projects.ts, project-settings-admin.ts)

**Migration:** `supabase/migrations/20241213_add_arc_tables.sql:9-17`

---

### 3.5 `project_slug_history`
**Columns Used:**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects.id)
- `slug` (TEXT, UNIQUE)
- `created_at` (TIMESTAMPTZ)

**Operations:**
- SELECT: project_id, slug (project-by-slug.ts via `resolve_project_id_by_slug()` function)
- INSERT: Automatic via trigger on `projects.slug` updates

**Migration:** `supabase/migrations/20250120_arc_task4_slug_history_and_point_adjustments.sql:13-65`

---

### 3.6 Supporting Tables (Used by ARC but not ARC-specific)
- `projects` (id, name, slug, x_handle/twitter_username, avatar_url, profile_type)
- `profiles` (id, username) - For creator lookups
- `akari_user_roles` (user_id, role) - Auth checks
- `akari_user_sessions` (session_token, user_id, expires_at) - Auth checks
- `akari_user_identities` (user_id, username, provider) - Auth checks

---

## 4. Feature Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| **Arena Discovery (List Arenas)** | ✅ Complete | `/portal/arc/[slug]` shows arenas list, `/api/portal/arc/arenas` endpoint |
| **Arena Detail Page** | ✅ Complete | `/portal/arc/[slug]/arena/[arenaSlug]` with leaderboard, storyline, map tabs |
| **Add Creator to Arena** | ✅ Complete | Admin modal + `POST /api/portal/arc/arena-creators-admin` |
| **Edit Creator (ring/style/meta)** | ✅ Complete | Admin modal + `PATCH /api/portal/arc/arena-creators-admin` (updates ring, style, arc_points base) |
| **Adjust Points (+/-)** | ✅ Complete | Admin modal + `POST /api/portal/arc/admin/point-adjustments` (supports negative for slashing) |
| **Adjustment History** | ✅ Complete | History modal + `GET /api/portal/arc/admin/point-adjustments` |
| **Sorting + Filtering** | ✅ Complete | Leaderboard has: search (username/style), ring filter (all/core/momentum/discovery), sort (points_desc/asc, joined_newest/oldest) |
| **Role Gating (SuperAdmin only)** | ✅ Complete | All admin endpoints check `akari_user_roles` for 'super_admin', returns 403 if not |
| **DEV MODE Bypass** | ✅ Complete | `process.env.NODE_ENV === 'development'` bypasses auth in: arena-creators-admin.ts, point-adjustments.ts, arenas-admin.ts, admin/arena-creators.ts |
| **Sentiment Section Integration** | ⚠️ Placeholder | Beta placeholder in arena detail page (lines 1574-1599), returns `{ enabled: true, summary: null, series: [] }` from API |

---

## 5. Implementation Status Summary

### A) What is Complete and Working

1. **Arena Management**
   - ✅ Create/Edit arenas (admin)
   - ✅ List arenas by project
   - ✅ Arena detail page with full UI
   - ✅ Slug-based routing with canonicalization

2. **Creator Management**
   - ✅ Add creators to arenas
   - ✅ Edit creator metadata (ring, style, base points)
   - ✅ Remove creators from arenas
   - ✅ Creator profile pages

3. **Point System**
   - ✅ Base points (stored in `arena_creators.arc_points`)
   - ✅ Point adjustments with audit trail (`arc_point_adjustments`)
   - ✅ Effective points calculation (base + adjustments_sum)
   - ✅ Adjustment history viewing
   - ✅ Support for negative adjustments (slashing)

4. **Leaderboard Features**
   - ✅ Filtering by ring (core/momentum/discovery/all)
   - ✅ Search by username/style
   - ✅ Sorting (points desc/asc, joined newest/oldest)
   - ✅ Display of effective points (adjusted_points)

5. **UI/UX**
   - ✅ Project hub page with tabs (Overview, Leaderboard, Missions, Storyline, Map)
   - ✅ Arena detail page with tabs (Leaderboard, Storyline, Map)
   - ✅ Admin modals for all CRUD operations
   - ✅ Responsive design with error handling
   - ✅ Loading states and error messages

6. **Authentication & Authorization**
   - ✅ SuperAdmin role gating for admin endpoints
   - ✅ DEV MODE bypass for development (NODE_ENV === 'development')
   - ✅ Session validation

7. **Database Schema**
   - ✅ Complete migrations for all tables
   - ✅ Proper foreign keys and constraints
   - ✅ Slug history tracking with redirect support
   - ✅ Point adjustments audit trail

---

### B) What is Partially Implemented

1. **Sentiment Integration**
   - ⚠️ API returns placeholder structure (`{ enabled: true, summary: null, series: [] }`)
   - ⚠️ UI shows "Coming soon" message in collapsible section
   - ❌ No actual sentiment data integration
   - **Location:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:1574-1599`

2. **Missions System**
   - ⚠️ UI shows mission cards with placeholder logic
   - ⚠️ Mission status determined by simple heuristic (points >= 2x reward)
   - ❌ No actual mission tracking or completion logic
   - **Location:** `src/web/pages/portal/arc/[slug].tsx:1083-1172`

3. **Creator Profile Linking**
   - ⚠️ `arena_creators.profile_id` is optional (nullable)
   - ⚠️ Some endpoints may not have profile_id populated
   - ✅ Creator profile page exists but may have incomplete data

4. **Project Slug Resolution**
   - ✅ Slug history table exists
   - ✅ `resolve_project_id_by_slug()` function exists
   - ⚠️ Not all endpoints use slug history (most use current slug only)
   - **Used in:** `project-by-slug.ts`

---

### C) What is Missing

1. **Sentiment Data Integration**
   - No real sentiment analysis data
   - No sentiment charts/graphs
   - No sentiment summary calculations

2. **Mission Tracking**
   - No mission completion tracking
   - No mission reward system
   - No mission validation logic

3. **Automatic Point Calculation**
   - No automated scoring engine integration
   - Points must be manually set/adjusted
   - No real-time point updates from content scoring

4. **Bulk Operations**
   - No bulk creator import
   - No bulk point adjustments
   - No bulk arena operations

5. **Advanced Filtering**
   - No date range filtering for leaderboard
   - No points range filtering
   - No multi-ring filtering

6. **Analytics/Reporting**
   - No arena analytics dashboard
   - No creator performance metrics
   - No project-level ARC analytics

7. **Notifications**
   - No notifications for point adjustments
   - No notifications for arena status changes
   - No creator notifications

8. **Export/Import**
   - No CSV export of leaderboards
   - No bulk import of creators
   - No data export for arenas

9. **Validation & Business Logic**
   - No validation for duplicate creators across arenas (allowed by schema)
   - No validation for arena date conflicts
   - No minimum/maximum point limits

10. **Documentation**
    - No API documentation
    - No user guide
    - Limited inline code comments

---

## 6. Top 10 Next Tasks (In Order)

1. **Integrate Sentiment Data** (High Priority)
   - Connect sentiment API/service to populate real sentiment data
   - Display sentiment charts/graphs in arena detail page
   - Calculate sentiment summary metrics
   - **Files to modify:** `src/web/pages/api/portal/arc/arenas/[slug].ts`, `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

2. **Implement Mission Tracking System** (High Priority)
   - Create mission completion tracking logic
   - Integrate with content scoring system
   - Add mission validation and reward assignment
   - **Files to modify:** `src/web/pages/portal/arc/[slug].tsx`, create new mission tracking endpoints

3. **Automated Point Calculation** (High Priority)
   - Integrate scoring engine to automatically calculate points from content
   - Set up background jobs/cron to update points
   - **New files needed:** Scoring integration service, background job handler

4. **Enhance Profile Linking** (Medium Priority)
   - Ensure all creators have `profile_id` populated
   - Add profile lookup/creation during creator addition
   - **Files to modify:** `src/web/pages/api/portal/arc/arena-creators-admin.ts`

5. **Add Bulk Operations** (Medium Priority)
   - Implement bulk creator import (CSV upload)
   - Add bulk point adjustments
   - **New files needed:** Bulk operations endpoints and UI

6. **Improve Slug History Usage** (Medium Priority)
   - Update all endpoints to use `resolve_project_id_by_slug()` function
   - Add redirects for old slugs
   - **Files to modify:** Multiple endpoints that resolve by slug

7. **Add Advanced Filtering** (Low Priority)
   - Date range filtering for leaderboard
   - Points range filtering
   - Multi-ring filtering
   - **Files to modify:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`, `src/web/pages/api/portal/arc/arenas/[slug].ts`

8. **Create Analytics Dashboard** (Low Priority)
   - Arena performance metrics
   - Creator engagement analytics
   - Project-level ARC statistics
   - **New files needed:** Analytics endpoints and dashboard page

9. **Add Validation & Business Logic** (Low Priority)
   - Validate duplicate creators
   - Validate arena date conflicts
   - Add point limits/validation
   - **Files to modify:** `src/web/pages/api/portal/arc/arena-creators-admin.ts`, `src/web/pages/api/portal/arc/arenas-admin.ts`

10. **Documentation & Testing** (Low Priority)
    - Write API documentation
    - Add inline code comments
    - Create user guide
    - Add unit/integration tests
    - **New files needed:** Documentation files, test files

---

## 7. Key Findings & Recommendations

### Findings

1. **Point System Architecture**
   - ✅ Well-designed: Base points + adjustments = effective points
   - ✅ Audit trail via `arc_point_adjustments` table
   - ⚠️ Manual only - no automated scoring integration yet

2. **Database Schema**
   - ✅ Proper normalization and foreign keys
   - ✅ Slug history for redirects (partially used)
   - ✅ Audit trail for point adjustments
   - ⚠️ `profile_id` nullable in `arena_creators` (could be mandatory)

3. **Authentication**
   - ✅ Consistent SuperAdmin checks
   - ✅ DEV MODE bypass for development
   - ✅ Session validation

4. **API Design**
   - ✅ RESTful endpoints
   - ✅ Consistent error handling
   - ✅ Proper response shapes
   - ⚠️ Some endpoints don't use slug history

5. **UI/UX**
   - ✅ Comprehensive admin interfaces
   - ✅ Good filtering/sorting capabilities
   - ✅ Clear error messages
   - ⚠️ Sentiment section is placeholder only

### Recommendations

1. **Prioritize Sentiment Integration** - This is a key differentiator and currently just a placeholder
2. **Implement Automated Scoring** - Manual point management doesn't scale
3. **Make profile_id mandatory** - Better data integrity and linking
4. **Add comprehensive validation** - Prevent data inconsistencies
5. **Implement bulk operations** - Critical for scaling
6. **Create analytics dashboard** - Essential for project owners to understand performance

---

**End of Report**

