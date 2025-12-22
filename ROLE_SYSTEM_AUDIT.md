# Role System Audit Report

**Date:** 2025-01-20  
**Scope:** Complete inventory of existing user role system

---

## 1. Roles List (Exact String Values)

### 1.1 Global Roles (`akari_user_roles` table)
**Exact strings:** `'user'`, `'analyst'`, `'admin'`, `'super_admin'`

**Evidence:**
- `supabase/create_akari_auth_tables.sql:29` - CHECK constraint: `role IN ('user', 'analyst', 'admin', 'super_admin')`
- `src/web/lib/permissions.ts:12` - Type definition: `export type Role = 'user' | 'analyst' | 'admin' | 'super_admin';`
- `src/web/lib/permissions.ts:307` - Hierarchy: `['super_admin', 'admin', 'analyst', 'user']`

### 1.2 Profile Roles (`profiles.real_roles` column)
**Exact strings:** `'user'`, `'creator'`, `'project_admin'`, `'super_admin'`, `'institutional'`

**Evidence:**
- `supabase/migrations/20241216_add_project_claiming_fields.sql:78` - CHECK constraint: `real_roles <@ ARRAY['user', 'creator', 'project_admin', 'super_admin', 'institutional']::TEXT[]`
- `src/web/lib/project-permissions.ts:19` - Type definition: `export type ProfileRealRole = 'user' | 'creator' | 'project_admin' | 'super_admin' | 'institutional';`

### 1.3 Project Team Roles (`project_team_members.role` column)
**Exact strings:** `'owner'`, `'admin'`, `'moderator'`, `'investor_view'`

**Evidence:**
- `supabase/migrations/20241216_add_project_claiming_fields.sql:94` - CHECK constraint: `role IN ('owner', 'admin', 'moderator', 'investor_view')`
- `src/web/lib/project-permissions.ts:18` - Type definition: `export type ProjectTeamRole = 'owner' | 'admin' | 'moderator' | 'investor_view';`

### 1.4 Additional Role References
**NOT FOUND:** The following are referenced in code but do NOT exist as actual role values:
- `'founder'` - NOT FOUND in any schema or migration
- Other roles referenced in documentation but not in actual schema

---

## 2. Database Tables Involved (Schema Summary)

### 2.1 `akari_user_roles`
**Schema:**
```sql
CREATE TABLE akari_user_roles (
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'analyst', 'admin', 'super_admin')),
  PRIMARY KEY (user_id, role)
);
```

**Columns:**
- `user_id` (UUID, FK → `akari_users.id`)
- `role` (TEXT, CHECK constraint: 'user' | 'analyst' | 'admin' | 'super_admin')

**Evidence:**
- `supabase/create_akari_auth_tables.sql:27-31`
- `supabase/akari_auth_schema.sql:57-65`

**Indexes:**
- `idx_akari_user_roles_user_id` on `user_id`
- `idx_akari_user_roles_role` on `role`

---

### 2.2 `profiles.real_roles`
**Schema:**
```sql
ALTER TABLE profiles ADD COLUMN real_roles TEXT[] DEFAULT ARRAY['user']::TEXT[];

ALTER TABLE profiles ADD CONSTRAINT profiles_real_roles_check 
  CHECK (
    real_roles <@ ARRAY['user', 'creator', 'project_admin', 'super_admin', 'institutional']::TEXT[]
  );
```

**Columns:**
- `real_roles` (TEXT[], default: `['user']`, CHECK constraint for valid values)

**Evidence:**
- `supabase/migrations/20241216_add_project_claiming_fields.sql:72-84`

**Indexes:**
- `idx_profiles_real_roles` using GIN index (for array queries)

---

### 2.3 `project_team_members`
**Schema:**
```sql
CREATE TABLE project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator', 'investor_view')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, profile_id, role)
);
```

**Columns:**
- `id` (UUID, PK)
- `project_id` (UUID, FK → `projects.id`)
- `profile_id` (UUID, FK → `profiles.id`)
- `role` (TEXT, CHECK constraint: 'owner' | 'admin' | 'moderator' | 'investor_view')
- `created_at` (TIMESTAMPTZ)

**Evidence:**
- `supabase/migrations/20241216_add_project_claiming_fields.sql:90-99`

**Indexes:**
- `idx_project_team_members_project` on `project_id`
- `idx_project_team_members_profile` on `profile_id`
- `idx_project_team_members_role` on `(project_id, role)`

---

### 2.4 `projects.claimed_by`
**Schema:**
```sql
ALTER TABLE projects ADD COLUMN claimed_by UUID REFERENCES akari_users(id) ON DELETE SET NULL;
```

**Note:** This is not a role table, but stores project ownership (equivalent to 'owner' role for the claiming user).

**Evidence:**
- `supabase/migrations/20241216_add_project_claiming_fields.sql:30-32`

---

## 3. Role-Check Helpers (File Path + Functions + Logic)

### 3.1 Client-Side (Frontend)

#### `isSuperAdmin(user: AkariUser | null): boolean`
**File:** `src/web/lib/permissions.ts:299-301`

**Logic:**
```typescript
export function isSuperAdmin(user: Pick<AkariUser, 'realRoles'> | null): boolean {
  return user?.realRoles?.includes('super_admin') ?? false;
}
```

**Usage:** Checks if user's `realRoles` array includes `'super_admin'`  
**Evidence:** `src/web/lib/permissions.ts:299-301`

---

### 3.2 Server-Side (API Routes / SSR)

#### `isSuperAdminServerSide(userId: string): Promise<boolean>`
**File:** `src/web/lib/server-auth.ts:70-123`

**Logic:**
1. Check `akari_user_roles` table for `user_id = userId AND role = 'super_admin'`
2. If not found, check `profiles.real_roles` array for `'super_admin'` (via Twitter username lookup)

**Evidence:**
- `src/web/lib/server-auth.ts:70-123`
- Code flow:
  - Line 75-79: Query `akari_user_roles`
  - Line 84-85: Return true if found
  - Line 88-116: Fallback to check `profiles.real_roles` via `akari_user_identities` join

**Used in:** 50+ API routes (see section 4)

---

#### `requireSuperAdmin(context: GetServerSidePropsContext)`
**File:** `src/web/lib/server-auth.ts:133-187`

**Logic:**
1. Check for session token
2. Get user ID from session
3. Call `isSuperAdminServerSide(userId)`
4. Return redirect if not SuperAdmin, null if authorized

**Evidence:** `src/web/lib/server-auth.ts:133-187`

**Used in:** SSR pages (see section 5)

---

#### `checkProjectPermissions(supabase, userId, projectId): Promise<ProjectPermissionCheck>`
**File:** `src/web/lib/project-permissions.ts:92-188`

**Logic:**
1. Check if SuperAdmin (via `akari_user_roles` only)
2. Check if Owner (`projects.claimed_by === userId`)
3. Get Twitter username → profile_id
4. Check `project_team_members` for `admin`/`moderator`/`investor_view` roles
5. Check `profiles.real_roles` for `project_admin`
6. Check `akari_user_roles` for `project_admin` (global role)

**Returns:**
```typescript
{
  canManage: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isInvestorView: boolean;
  isSuperAdmin: boolean;
  hasProjectAdminRole: boolean;
}
```

**Evidence:** `src/web/lib/project-permissions.ts:92-188`

---

#### Database Functions (PostgreSQL)

##### `is_user_super_admin(profile_id UUID): boolean`
**File:** `supabase/migrations/20250104_add_arc_crm_tables.sql:313-322`

**Logic:**
```sql
SELECT 1 FROM profiles
WHERE id = profile_id
AND real_roles @> ARRAY['super_admin']::text[]
```

**Evidence:** `supabase/migrations/20250104_add_arc_crm_tables.sql:313-322`

**Used in:** RLS policies for ARC tables

---

##### `is_user_project_admin(profile_id UUID, project_id UUID): boolean`
**File:** `supabase/migrations/20250104_add_arc_crm_tables.sql:325-336`

**Logic:**
```sql
SELECT 1 FROM project_team_members
WHERE profile_id = $1
AND project_id = $2
AND role IN ('admin', 'moderator', 'owner')
```

**Evidence:** `supabase/migrations/20250104_add_arc_crm_tables.sql:325-336`

**Used in:** RLS policies for ARC CRM tables

---

### 3.3 Inline Check Functions (API Routes)

Many API routes define local `checkSuperAdmin()` functions that duplicate the logic from `isSuperAdminServerSide()`.

**Pattern:**
```typescript
async function checkSuperAdmin(supabase, userId: string): Promise<boolean> {
  // Check akari_user_roles
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');
  return (roles?.length ?? 0) > 0;
}
```

**Some routes also check `profiles.real_roles` as fallback** (e.g., `admin/projects/index.ts`, `admin/projects/[id]/team.ts`)

**Evidence:** Found in 40+ API route files (see section 4)

---

## 4. Endpoints Gated by Roles

### 4.1 SuperAdmin-Only Endpoints

| Route | Method | Required Role | Check Location | Evidence |
|-------|--------|---------------|----------------|----------|
| `/api/portal/admin/*` | ALL | `super_admin` | Inline `checkSuperAdmin()` | `src/web/pages/api/portal/admin/*.ts` |
| `/api/portal/arc/admin/*` | ALL | `super_admin` | Inline `checkSuperAdmin()` | `src/web/pages/api/portal/arc/admin/*.ts` |
| `/api/portal/arc/arenas-admin` | POST, PATCH | `super_admin` | `arenas-admin.ts:79-87` | `src/web/pages/api/portal/arc/arenas-admin.ts:79-87` |
| `/api/portal/arc/arena-creators-admin` | POST, PATCH, DELETE | `super_admin` | `arena-creators-admin.ts:74-82` | `src/web/pages/api/portal/arc/arena-creators-admin.ts:74-82` |
| `/api/portal/arc/admin/point-adjustments` | POST, GET | `super_admin` | `point-adjustments.ts:80-91` | `src/web/pages/api/portal/arc/admin/point-adjustments.ts:80-91` |
| `/api/portal/arc/admin/arena-creators` | GET | `super_admin` | `arena-creators.ts:66-77` | `src/web/pages/api/portal/arc/admin/arena-creators.ts:66-77` |
| `/api/portal/arc/project-settings-admin` | GET, PATCH | `super_admin` | `project-settings-admin.ts:65-73` | `src/web/pages/api/portal/arc/project-settings-admin.ts:65-73` |
| `/api/portal/admin/arc/profiles` | GET, POST | `super_admin` | `profiles.ts:67-100` | `src/web/pages/api/portal/admin/arc/profiles.ts:67-100` |
| `/api/portal/admin/arc/profiles/[profileId]` | GET, PATCH | `super_admin` | `profiles/[profileId].ts:76-109` | `src/web/pages/api/portal/admin/arc/profiles/[profileId].ts:76-109` |
| `/api/portal/admin/arc/leaderboard-requests` | GET, POST | `super_admin` | `leaderboard-requests.ts:71-121` | `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts:71-121` |
| `/api/portal/admin/arc/leaderboard-requests/[id]` | PATCH | `super_admin` | `leaderboard-requests/[id].ts:70-103` | `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts:70-103` |
| `/api/portal/admin/arc/requests` | GET | `super_admin` | `requests.ts:59-69` | `src/web/pages/api/portal/admin/arc/requests.ts:59-69` |
| `/api/portal/admin/arc/requests/[id]` | PATCH | `super_admin` | `requests/[id].ts:41-100` | `src/web/pages/api/portal/admin/arc/requests/[id].ts:41-100` |
| `/api/portal/admin/projects` | GET | `super_admin` | `projects/index.ts:82-133` | `src/web/pages/api/portal/admin/projects/index.ts:82-133` |
| `/api/portal/admin/projects/[id]` | PATCH | `super_admin` | `projects/[id].ts:89-97` | `src/web/pages/api/portal/admin/projects/[id].ts:89-97` |
| `/api/portal/admin/projects/[id]/team` | ALL | `super_admin` | `projects/[id]/team.ts:78-126` | `src/web/pages/api/portal/admin/projects/[id]/team.ts:78-126` |
| `/api/portal/admin/projects/[id]/refresh` | POST | `super_admin` | `projects/[id]/refresh.ts:62-70` | `src/web/pages/api/portal/admin/projects/[id]/refresh.ts:62-70` |
| `/api/portal/admin/projects/classify` | POST | `super_admin` | `projects/classify.ts:72-105` | `src/web/pages/api/portal/admin/projects/classify.ts:72-105` |
| `/api/portal/admin/users/*` | ALL | `super_admin` | Various inline checks | `src/web/pages/api/portal/admin/users/*.ts` |
| `/api/portal/admin/access/*` | ALL | `super_admin` | Inline checks | `src/web/pages/api/portal/admin/access/*.ts` |
| `/api/portal/admin/overview` | GET | `super_admin` | `overview.ts:76-84` | `src/web/pages/api/portal/admin/overview.ts:76-84` |
| `/api/portal/admin/profiles/search` | GET | `super_admin` | `profiles/search.ts:60-69` | `src/web/pages/api/portal/admin/profiles/search.ts:60-69` |

**Total SuperAdmin-gated routes:** ~50+ endpoints

---

### 4.2 Project-Scoped Role Endpoints

| Route | Method | Required Role(s) | Check Location | Evidence |
|-------|--------|------------------|----------------|----------|
| `/api/portal/projects/team-members` | GET, POST, PATCH, DELETE | `super_admin` OR `owner` (claimed_by) OR `admin` (project_team_members) | `team-members.ts:124-176` | `src/web/pages/api/portal/projects/team-members.ts:124-176` |
| `/api/portal/projects/claim` | POST | None (public, but adds `owner` to `project_team_members`) | `claim.ts` | `src/web/pages/api/portal/projects/claim.ts` |
| `/api/portal/arc/cta-state` | GET | `super_admin` OR `admin`/`moderator` (project_team_members) OR `owner` (claimed_by) | `cta-state.ts:169-176` | `src/web/pages/api/portal/arc/cta-state.ts:169-176` |
| `/api/portal/creator-manager/programs/[programId]/*` | Various | `super_admin` OR `owner` OR `admin` OR `moderator` (via `checkProjectPermissions()`) | `project-permissions.ts:92-188` | `src/web/lib/project-permissions.ts:92-188` |
| `/api/portal/arc/join-campaign` | POST | Checks `super_admin` but allows all users | `join-campaign.ts:64-72` | `src/web/pages/api/portal/arc/join-campaign.ts:64-72` |

**Note:** Project-scoped roles checked via:
- `checkProjectPermissions()` helper
- Direct `project_team_members` queries
- `projects.claimed_by` checks

---

### 4.3 Endpoints with Tier-Based Access (Not Role-Based)
**NOT FOUND:** Role-based tier checks. Tier system uses feature grants, not roles.

---

## 5. Pages Gated by Roles

### 5.1 SuperAdmin-Only Pages (SSR Protection)

| Page Route | Required Role | Check Location | Evidence |
|------------|---------------|----------------|----------|
| `/portal/arc/admin` | `super_admin` | `requireSuperAdmin()` | `src/web/pages/portal/arc/admin/index.tsx:424` |
| `/portal/arc/admin/profiles` | `super_admin` | `requireSuperAdmin()` | `src/web/pages/portal/arc/admin/profiles.tsx:424` |
| `/portal/arc/admin/[projectSlug]` | `super_admin` | Client-side `isSuperAdmin()` + access denied UI | `src/web/pages/portal/arc/admin/[projectSlug].tsx:248-266` |
| `/portal/admin/arc/leaderboard-requests` | `super_admin` | `requireSuperAdmin()` | `src/web/pages/portal/admin/arc/leaderboard-requests.tsx:466` |
| `/portal/admin/*` | `super_admin` | Various `requireSuperAdmin()` calls | `src/web/pages/portal/admin/*.tsx` |

---

### 5.2 Pages with Client-Side Role Checks (UI Conditional)

| Page Route | Check | Purpose | Evidence |
|------------|-------|---------|----------|
| `/portal/arc/index` | `isSuperAdmin()` | Show admin links, top projects section | `src/web/pages/portal/arc/index.tsx:166,358` |
| `/portal/arc/[slug]` | `isSuperAdmin()` | Show admin buttons | `src/web/pages/portal/arc/[slug].tsx:288` |
| `/portal/arc/[slug]/arena/[arenaSlug]` | `isSuperAdmin()` | Show admin modals (Add/Edit/Adjust) | `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:94,954,1089` |

**Note:** These pages are NOT SSR-protected but hide admin features for non-SuperAdmins.

---

## 6. How SuperAdmin is Determined (Exact Logic)

### 6.1 Client-Side Check
**Function:** `isSuperAdmin(user: AkariUser | null)`

**Logic:**
1. Check if `user.realRoles` array includes `'super_admin'`
2. Returns `false` if user is null

**Code:**
```typescript
return user?.realRoles?.includes('super_admin') ?? false;
```

**Evidence:** `src/web/lib/permissions.ts:299-301`

**Data Source:** `user.realRoles` comes from `profiles.real_roles` array (populated from auth session)

---

### 6.2 Server-Side Check (Primary)
**Function:** `isSuperAdminServerSide(userId: string)`

**Logic (Step-by-Step):**

1. **Primary Check:** Query `akari_user_roles` table
   ```typescript
   const { data: userRoles } = await supabase
     .from('akari_user_roles')
     .select('role')
     .eq('user_id', userId)
     .eq('role', 'super_admin');
   ```
   - If `userRoles.length > 0`, return `true`

2. **Fallback Check:** Query `profiles.real_roles` array
   - Get Twitter username from `akari_user_identities` (provider = 'x')
   - Look up profile by username
   - Check if `profile.real_roles` array includes `'super_admin'`
   - If yes, return `true`

3. Return `false` if neither check succeeds

**Evidence:** `src/web/lib/server-auth.ts:70-123`

**Note:** Some API routes use simplified version that only checks `akari_user_roles` (no fallback).

---

### 6.3 Database Function Check (RLS Policies)
**Function:** `is_user_super_admin(profile_id UUID)`

**Logic:**
```sql
SELECT 1 FROM profiles
WHERE id = profile_id
AND real_roles @> ARRAY['super_admin']::text[]
```

**Evidence:** `supabase/migrations/20250104_add_arc_crm_tables.sql:313-322`

**Used in:** RLS policies for ARC tables (e.g., `arc_point_adjustments`, `arc_project_access`)

---

## 7. How Project-Scoped Roles Are Handled Today

### 7.1 Project Owner
**Determined by:** `projects.claimed_by === userId` (akari_users.id)

**Evidence:**
- `src/web/lib/project-permissions.ts:124-128`
- `supabase/migrations/20241216_add_project_claiming_fields.sql:30-32`

**NOT stored in:** `project_team_members` (ownership is separate from team membership)

---

### 7.2 Project Admin / Moderator / Investor View
**Determined by:** `project_team_members.role` column

**Valid values:** `'admin'`, `'moderator'`, `'investor_view'`, `'owner'`

**Lookup Process:**
1. Get user's Twitter username from `akari_user_identities`
2. Look up `profiles.id` by username
3. Query `project_team_members` where `project_id = X AND profile_id = Y`

**Evidence:**
- `src/web/lib/project-permissions.ts:142-158`
- `supabase/migrations/20241216_add_project_claiming_fields.sql:90-99`

---

### 7.3 Global Project Admin Role
**Determined by:** 
- `profiles.real_roles` array includes `'project_admin'`
- OR `akari_user_roles.role = 'project_admin'` (global, not project-specific)

**Evidence:**
- `src/web/lib/project-permissions.ts:160-185`
- `supabase/migrations/20241216_add_project_claiming_fields.sql:78` (includes 'project_admin')

**Note:** Global `project_admin` role in `akari_user_roles` is mentioned in code but **NOT FOUND** in schema CHECK constraints. The schema only allows: `('user', 'analyst', 'admin', 'super_admin')`.

**Gap:** `project_admin` is referenced but not a valid value in `akari_user_roles` table CHECK constraint.

---

### 7.4 Permission Hierarchy (Project-Scoped)

**Order of precedence:**
1. **SuperAdmin** (global) - can manage all projects
2. **Owner** (`projects.claimed_by`) - can manage the project they own
3. **Admin** (`project_team_members.role = 'admin'`) - can manage the project
4. **Moderator** (`project_team_members.role = 'moderator'`) - limited permissions
5. **Investor View** (`project_team_members.role = 'investor_view'`) - read-only
6. **Global Project Admin** (`profiles.real_roles` includes `'project_admin'`) - can manage (but note schema gap above)

**Evidence:** `src/web/lib/project-permissions.ts:92-188`

---

## 8. Gaps / Not Found Items (Explicit)

### 8.1 Schema Gaps

1. **`project_admin` in `akari_user_roles`**
   - **Status:** Referenced in code but NOT in schema CHECK constraint
   - **Evidence:** 
     - Code references: `src/web/lib/project-permissions.ts:175-185`
     - Schema constraint: `supabase/create_akari_auth_tables.sql:29` only allows `('user', 'analyst', 'admin', 'super_admin')`
   - **Impact:** Attempts to insert `project_admin` into `akari_user_roles` would fail

2. **`founder` role**
   - **Status:** NOT FOUND in any schema or migration
   - **Impact:** Referenced in some documentation but not implemented

---

### 8.2 Logic Inconsistencies

1. **SuperAdmin Check Variations**
   - Some routes check both `akari_user_roles` AND `profiles.real_roles` (e.g., `server-auth.ts`)
   - Some routes only check `akari_user_roles` (e.g., many inline `checkSuperAdmin()` functions)
   - **Impact:** Potential inconsistency if user has SuperAdmin in `profiles.real_roles` but not `akari_user_roles`

2. **Project Admin Role Ambiguity**
   - Code checks for `project_admin` in `akari_user_roles` but schema doesn't allow it
   - Code also checks `profiles.real_roles` for `project_admin` (which IS valid)
   - **Impact:** The `akari_user_roles` check would never succeed

---

### 8.3 Missing Features

1. **Role Hierarchy Enforcement**
   - **Status:** NOT FOUND - No database-level enforcement of role hierarchy
   - **Evidence:** Roles are flat values, hierarchy exists only in TypeScript types

2. **Role Assignment API**
   - **Status:** NOT FOUND - No public API endpoints for assigning roles (SuperAdmin only, manual DB operations)

3. **Role Audit Trail**
   - **Status:** NOT FOUND - No history table tracking role changes

4. **Role Expiration**
   - **Status:** NOT FOUND - Roles are permanent (unlike feature grants which have `starts_at`/`ends_at`)

---

## 9. Summary Table

| Role System Component | Status | Location |
|----------------------|--------|----------|
| **Global Roles** (`akari_user_roles`) | ✅ Complete | `supabase/create_akari_auth_tables.sql:27-31` |
| **Profile Roles** (`profiles.real_roles`) | ✅ Complete | `supabase/migrations/20241216_add_project_claiming_fields.sql:72-84` |
| **Project Team Roles** (`project_team_members.role`) | ✅ Complete | `supabase/migrations/20241216_add_project_claiming_fields.sql:90-99` |
| **SuperAdmin Check (Client)** | ✅ Complete | `src/web/lib/permissions.ts:299-301` |
| **SuperAdmin Check (Server)** | ✅ Complete | `src/web/lib/server-auth.ts:70-123` |
| **SuperAdmin Check (DB Function)** | ✅ Complete | `supabase/migrations/20250104_add_arc_crm_tables.sql:313-322` |
| **Project Permission Check** | ✅ Complete | `src/web/lib/project-permissions.ts:92-188` |
| **Project Admin Check (DB Function)** | ✅ Complete | `supabase/migrations/20250104_add_arc_crm_tables.sql:325-336` |
| **SSR Role Protection** | ✅ Complete | `src/web/lib/server-auth.ts:133-187` |
| **`project_admin` in `akari_user_roles`** | ❌ Schema Gap | Referenced but not in CHECK constraint |
| **`founder` role** | ❌ NOT FOUND | Not in any schema |

---

**End of Report**




