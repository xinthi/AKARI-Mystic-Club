# ARC Leaderboard System - Technical Documentation
**Version:** 1.0  
**Date:** 2025-01-31  
**Status:** Production  
**Confidential:** Internal Use Only - Do Not Publish to GitHub

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Leaderboard Types](#leaderboard-types)
4. [Request & Approval Flow](#request--approval-flow)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [UI Components & User Flows](#ui-components--user-flows)
8. [Access Control System](#access-control-system)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## Executive Summary

The ARC (Akari Reputation Circuit) system provides **three distinct leaderboard modules** for projects:

1. **Option 1: Creator Manager (CRM)** - Private creator management with optional public visibility
2. **Option 2: Mindshare Leaderboard** - Public arena-based contribution tracking
3. **Option 3: Gamified Leaderboard** - RPG-style quest system with XP and levels

All leaderboards require:
- **Request submission** by project admins/moderators
- **SuperAdmin approval** with access level selection
- **Feature unlock** in `arc_project_features` table
- **Entity creation** (arenas, campaigns, or programs)

---

## System Architecture Overview

### High-Level Flow

```
User Request → Admin Approval → Database Updates → Entity Creation → Live Display
```

### Core Components

1. **Request System** (`arc_leaderboard_requests`)
   - Users submit requests with justification
   - SuperAdmins approve/reject with access level
   - Tracks request lifecycle

2. **Access Control** (`arc_project_access`, `arc_project_features`)
   - Two-tier approval system
   - Feature-level unlocks per option
   - Date-based enablement

3. **Entity Management**
   - **Option 1:** `arc_campaigns` (CRM campaigns)
   - **Option 2:** `arenas` (Mindshare leaderboards)
   - **Option 3:** `creator_manager_programs` + `arenas` (Gamified)

4. **Display System** (`/portal/arc`)
   - Live/Upcoming sections
   - Access-controlled visibility
   - SuperAdmin bypass

---

## Leaderboard Types

### Option 1: Creator Manager (CRM)

**Purpose:** Private creator management with deal tracking and mission assignments

**Access Level:** `creator_manager`  
**Unlock Field:** `option1_crm_unlocked`  
**Database Tables:**
- `arc_campaigns` (type='crm')
- `arc_campaign_participants`
- `creator_manager_programs` (legacy)
- `creator_manager_deals`
- `creator_manager_missions`

**Features:**
- Invitation-based participation
- Deal tiers (Bronze, Silver, Gold, Platinum)
- Mission tracking
- Optional public leaderboard visibility
- X engagement tracking via `user_ct_activity`

**Scoring:**
- Based on `user_ct_activity` table
- Engagement metrics: likes, replies, retweets, quotes
- Content classification: thread, deep_dive, meme, etc.
- Sentiment analysis integration

**API Endpoints:**
- `GET /api/portal/arc/campaigns/[id]/leaderboard`
- `POST /api/portal/arc/campaigns/[id]/participants`
- `GET /api/portal/arc/campaigns/[id]`

**UI Pages:**
- `/portal/arc/creator-manager` (admin)
- `/portal/arc/my-creator-programs` (creator view)

---

### Option 2: Mindshare Leaderboard (Normal)

**Purpose:** Public arena-based contribution tracking with X engagement scoring

**Access Level:** `leaderboard`  
**Unlock Field:** `option2_normal_unlocked`  
**Database Tables:**
- `arenas` (primary entity)
- `arena_creators` (participants + scores)
- `project_tweets` (X mentions tracking)
- `user_ct_activity` (engagement data)

**Features:**
- Arena-based contests (multiple arenas per project)
- Auto-tracked participants (mentions without joining)
- Joined participants (with multiplier if follow-verified)
- Base points × multiplier = final score
- Real-time X engagement tracking

**Scoring Formula:**
```
Base Points = (likes × 1) + (replies × 2) + (retweets × 3) + (quotes × 4)
Multiplier = 1.0 (auto-tracked) or 1.5 (joined + follow-verified)
Final Score = Base Points × Multiplier
```

**API Endpoints:**
- `GET /api/portal/arc/leaderboard/[projectId]` (project-level)
- `GET /api/portal/arc/arenas/[slug]/leaderboard` (arena-specific)
- `GET /api/portal/arc/live-leaderboards` (Live/Upcoming)

**UI Pages:**
- `/portal/arc` (Live/Upcoming sections)
- `/portal/arc/[slug]/arena/[arenaSlug]` (arena detail)
- `/portal/arc/project/[projectId]` (project leaderboard)

**Auto-Creation:**
When a request is approved with `arc_access_level='leaderboard'`:
1. Arena is automatically created
2. Slug pattern: `${projectSlug}-leaderboard-${requestIdShort}`
3. Status: `active`
4. Dates: `starts_at` and `ends_at` from approval (or null for always-live)

---

### Option 3: Gamified Leaderboard

**Purpose:** RPG-style quest system with XP, levels, and rank badges

**Access Level:** `gamified`  
**Unlock Fields:** `option2_normal_unlocked` + `option3_gamified_unlocked`  
**Database Tables:**
- `creator_manager_programs` (gamified programs)
- `creator_manager_program_creators` (participants)
- `arc_quests` (quests/missions)
- `arc_contributions` (quest completions)
- `arenas` (base leaderboard - also created)

**Features:**
- Quest/mission-based progression
- XP (experience points) system
- Level calculation: `floor(totalXP / 100)`
- Rank badges: Bronze (≥0), Silver (≥500), Gold (≥2000), Legend (≥10000)
- Aggregated across all programs for a project
- UTM link generation for creator tracking

**Scoring:**
- XP from quest completion
- Quest types: content creation, engagement, referrals
- Bonus multipliers for streak/completion
- Leaderboard shows: XP, Level, Rank Badge

**API Endpoints:**
- `GET /api/portal/arc/projects/[projectId]/leaderboard` (gamified)
- `GET /api/portal/arc/creator-manager/programs/[programId]`
- `POST /api/portal/arc/creator-manager/programs/[programId]/links` (UTM)

**UI Pages:**
- `/portal/arc/gamified/[projectId]` (gamified leaderboard)
- `/portal/arc/creator-manager/[programId]` (program detail)
- `/portal/arc/my-creator-programs/[programId]` (creator view)

**Auto-Creation:**
When a request is approved with `arc_access_level='gamified'`:
1. Arena is created (for base leaderboard)
2. `creator_manager_program` is created (for gamified features)
3. Both use same project and dates

---

## Request & Approval Flow

### Step 1: User Request Submission

**Endpoint:** `POST /api/portal/arc/leaderboard-requests`

**Request Body:**
```typescript
{
  projectId: string;                    // UUID of project
  justification?: string;                // Optional reason
  requested_arc_access_level?: 'creator_manager' | 'leaderboard' | 'gamified';
}
```

**Validation:**
1. User must be authenticated
2. User must have permission (owner/admin/moderator or superadmin)
3. No existing pending request for same project
4. Project must exist

**Database Insert:**
```sql
INSERT INTO arc_leaderboard_requests (
  project_id,
  requested_by,
  justification,
  requested_arc_access_level,
  status,
  created_at
) VALUES (...)
```

**Response:**
```typescript
{
  ok: true,
  requestId: string,
  status: 'pending' | 'existing'
}
```

**UI Location:**
- `/portal/arc/requests` - User can submit requests
- Project profile pages - "Request Leaderboard" button

---

### Step 2: SuperAdmin Review

**UI Location:** `/portal/admin/arc/leaderboard-requests`

**Display:**
- All requests with status (pending/approved/rejected)
- Project info, requester, justification
- Current live status (LIVE/MISSING/ENDED)
- Action buttons (Approve/Reject/Fix)

**Request Details Shown:**
- Project name, slug, Twitter handle
- Requester username
- Requested access level
- Justification text
- Created date
- Current status

---

### Step 3: SuperAdmin Approval

**Endpoint:** `PUT /api/portal/admin/arc/leaderboard-requests/[id]`

**Request Body:**
```typescript
{
  status: 'approved' | 'rejected',
  arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified',
  start_at?: string,           // ISO date string (optional)
  end_at?: string,             // ISO date string (optional)
  discount_percent?: number,     // 0-100 (optional)
  discount_notes?: string        // Optional
}
```

**Approval Process (when status='approved'):**

#### 3.1 Update Request Status
```sql
UPDATE arc_leaderboard_requests
SET 
  status = 'approved',
  decided_by = adminProfileId,
  decided_at = NOW()
WHERE id = requestId
```

#### 3.2 Update Legacy Project Fields
```sql
UPDATE projects
SET 
  arc_active = true,
  arc_access_level = arc_access_level  -- 'leaderboard', 'gamified', or 'creator_manager'
WHERE id = projectId
```

#### 3.3 Create/Update ARC Access Record
```sql
-- Upsert arc_project_access
INSERT INTO arc_project_access (
  project_id,
  application_status,
  approved_at,
  approved_by
) VALUES (
  projectId,
  'approved',
  NOW(),
  adminProfileId
)
ON CONFLICT (project_id) DO UPDATE SET
  application_status = 'approved',
  approved_at = NOW(),
  approved_by = adminProfileId
```

#### 3.4 Create/Update Feature Unlocks
```sql
-- Upsert arc_project_features
INSERT INTO arc_project_features (
  project_id,
  option1_crm_unlocked,           -- true if creator_manager
  option2_normal_unlocked,         -- true if leaderboard or gamified
  option3_gamified_unlocked,       -- true if gamified
  leaderboard_enabled,             -- true if leaderboard or gamified
  gamefi_enabled,                  -- true if gamified
  leaderboard_start_at,            -- from start_at
  leaderboard_end_at,              -- from end_at
  gamefi_start_at,                 -- from start_at (if gamified)
  gamefi_end_at                    -- from end_at (if gamified)
) VALUES (...)
ON CONFLICT (project_id) DO UPDATE SET ...
```

**Critical Fields:**
- `option2_normal_unlocked = true` → Required for Option 2 (leaderboard)
- `option3_gamified_unlocked = true` → Required for Option 3 (gamified)
- `option1_crm_unlocked = true` → Required for Option 1 (CRM)

#### 3.5 Create Billing Record
```sql
INSERT INTO arc_billing_records (
  request_id,
  project_id,
  access_level,
  base_price_usd,
  discount_percent,
  final_price_usd,
  currency,
  payment_status,
  created_by
) VALUES (...)
```

#### 3.6 Auto-Create Entities

**For Option 2 (leaderboard):**
```sql
INSERT INTO arenas (
  project_id,
  name,                    -- "${project.display_name} Leaderboard"
  slug,                    -- "${projectSlug}-leaderboard-${requestIdShort}"
  status,                  -- 'active'
  starts_at,               -- from start_at (or null)
  ends_at,                 -- from end_at (or null)
  created_by               -- adminProfileId
) VALUES (...)
```

**For Option 3 (gamified):**
1. Create arena (same as Option 2)
2. Create creator_manager_program:
```sql
INSERT INTO creator_manager_programs (
  project_id,
  name,
  status,
  starts_at,
  ends_at,
  created_by
) VALUES (...)
```

**For Option 1 (CRM):**
- No auto-creation (campaigns are manually created by admins)

---

### Step 4: Live Display

**Endpoint:** `GET /api/portal/arc/live-leaderboards`

**Process:**
1. Fetch all arenas with status `active`, `scheduled`, or `paused`
2. For each arena:
   - Check access: `requireArcAccess(projectId, 2)`
   - Classify status: `determineStatus(starts_at, ends_at, now)`
   - Add to `live` or `upcoming` arrays
3. Deduplicate by `arena.id` and `projectId + kind`
4. Sort by start date
5. Apply limit (default 15, max 20)

**Access Check Logic:**
```typescript
// Check 1: Project exists
const project = await supabase.from('projects').select('id').eq('id', projectId).single();

// Check 2: ARC access approved
const access = await supabase
  .from('arc_project_access')
  .select('application_status')
  .eq('project_id', projectId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!access || access.application_status !== 'approved') {
  return { ok: false, error: 'ARC access not approved', code: 'not_approved' };
}

// Check 3: Option unlocked
const features = await supabase
  .from('arc_project_features')
  .select('option2_normal_unlocked')
  .eq('project_id', projectId)
  .maybeSingle();

if (!features || !features.option2_normal_unlocked) {
  return { ok: false, error: 'Option 2 not unlocked', code: 'option_locked' };
}

// Success
return { ok: true, approved: true, optionUnlocked: true };
```

**SuperAdmin Bypass:**
- If user is superadmin, `bypassAccessCheck = true`
- All arenas are included regardless of access status
- Logged as: `🔓 SuperAdmin detected - bypassing access checks`

**Status Classification:**
```typescript
function determineStatus(startsAt: string | null, endsAt: string | null, now: Date): 'live' | 'upcoming' | null {
  // No start date = always live (unless ended)
  if (!startsAt) {
    if (endsAt && new Date(endsAt) < now) return null; // Ended
    return 'live';
  }
  
  const startDate = new Date(startsAt);
  
  // Future start = upcoming
  if (startDate > now) return 'upcoming';
  
  // Past start, check end date
  if (endsAt) {
    const endDate = new Date(endsAt);
    if (endDate < now) return null; // Ended
    return 'live'; // Within range
  }
  
  // Started, no end = live
  return 'live';
}
```

**Deduplication:**
1. Remove duplicates by `arena.id` (same arena appearing multiple times)
2. Remove duplicates by `projectId + kind` (same project with multiple arenas of same kind)
3. Keep first occurrence, log skipped items

---

## Database Schema

### Core Tables

#### `arc_leaderboard_requests`
```sql
CREATE TABLE arc_leaderboard_requests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  requested_by UUID REFERENCES profiles(id),
  justification TEXT,
  requested_arc_access_level TEXT,  -- 'creator_manager' | 'leaderboard' | 'gamified'
  status TEXT,                       -- 'pending' | 'approved' | 'rejected'
  decided_by UUID REFERENCES profiles(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  UNIQUE(project_id, status) WHERE status = 'pending'  -- Only one pending per project
);
```

#### `arc_project_access`
```sql
CREATE TABLE arc_project_access (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) UNIQUE,
  application_status TEXT,            -- 'pending' | 'approved' | 'rejected'
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ
);
```

#### `arc_project_features`
```sql
CREATE TABLE arc_project_features (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  option1_crm_unlocked BOOLEAN DEFAULT false,
  option2_normal_unlocked BOOLEAN DEFAULT false,
  option3_gamified_unlocked BOOLEAN DEFAULT false,
  leaderboard_enabled BOOLEAN DEFAULT false,
  gamefi_enabled BOOLEAN DEFAULT false,
  crm_enabled BOOLEAN DEFAULT false,
  leaderboard_start_at TIMESTAMPTZ,
  leaderboard_end_at TIMESTAMPTZ,
  gamefi_start_at TIMESTAMPTZ,
  gamefi_end_at TIMESTAMPTZ,
  crm_start_at TIMESTAMPTZ,
  crm_end_at TIMESTAMPTZ
);
```

#### `arenas`
```sql
CREATE TABLE arenas (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT,                       -- 'active' | 'scheduled' | 'paused' | 'ended'
  starts_at TIMESTAMPTZ,             -- null = always live
  ends_at TIMESTAMPTZ,               -- null = no end date
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `arena_creators`
```sql
CREATE TABLE arena_creators (
  id UUID PRIMARY KEY,
  arena_id UUID REFERENCES arenas(id),
  profile_id UUID REFERENCES profiles(id),
  twitter_username TEXT,
  arc_points NUMERIC DEFAULT 0,
  multiplier NUMERIC DEFAULT 1.0,
  ring TEXT,                         -- 'inner' | 'outer'
  style TEXT,                        -- 'auto' | 'joined'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(arena_id, profile_id)
);
```

#### `arc_campaigns` (Option 1)
```sql
CREATE TABLE arc_campaigns (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  type TEXT DEFAULT 'crm',
  participation_mode TEXT,           -- 'invite_only' | 'public' | 'hybrid'
  leaderboard_visibility TEXT,      -- 'public' | 'private'
  name TEXT NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT,                       -- 'draft' | 'live' | 'paused' | 'ended'
  created_by_profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ
);
```

#### `creator_manager_programs` (Option 3)
```sql
CREATE TABLE creator_manager_programs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  status TEXT,                       -- 'active' | 'paused' | 'ended'
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ
);
```

#### `arc_quests` (Option 3)
```sql
CREATE TABLE arc_quests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  arena_id UUID REFERENCES arenas(id),
  name TEXT NOT NULL,
  description TEXT,
  xp_reward INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT,                       -- 'active' | 'paused' | 'ended'
  created_at TIMESTAMPTZ
);
```

---

## API Endpoints

### Request Management

#### `POST /api/portal/arc/leaderboard-requests`
**Purpose:** Submit a new leaderboard request  
**Auth:** Required (portal user)  
**Body:**
```typescript
{
  projectId: string;
  justification?: string;
  requested_arc_access_level?: 'creator_manager' | 'leaderboard' | 'gamified';
}
```
**Response:**
```typescript
{
  ok: true,
  requestId: string,
  status: 'pending' | 'existing'
} | { ok: false, error: string }
```

#### `GET /api/portal/admin/arc/leaderboard-requests`
**Purpose:** List all requests (superadmin only)  
**Auth:** SuperAdmin required  
**Response:**
```typescript
{
  ok: true,
  requests: Array<{
    id: string;
    project: { id, name, slug, x_handle };
    requester: { username, profile_id };
    justification: string;
    status: 'pending' | 'approved' | 'rejected';
    requested_arc_access_level: string;
    created_at: string;
    liveStatus?: 'live' | 'missing' | 'ended';
    liveItemId?: string;
  }>
}
```

#### `PUT /api/portal/admin/arc/leaderboard-requests/[id]`
**Purpose:** Approve/reject a request  
**Auth:** SuperAdmin required  
**Body:**
```typescript
{
  status: 'approved' | 'rejected';
  arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified';
  start_at?: string;        // ISO date
  end_at?: string;          // ISO date
  discount_percent?: number;
  discount_notes?: string;
}
```
**Response:**
```typescript
{ ok: true } | { ok: false, error: string }
```

**Side Effects:**
- Updates `arc_leaderboard_requests.status`
- Updates `projects.arc_active` and `projects.arc_access_level`
- Creates/updates `arc_project_access` (status='approved')
- Creates/updates `arc_project_features` (unlocks options)
- Creates `arc_billing_records`
- **Auto-creates `arenas`** (for Option 2/3)
- **Auto-creates `creator_manager_programs`** (for Option 3)

---

### Leaderboard Data

#### `GET /api/portal/arc/live-leaderboards`
**Purpose:** Get live and upcoming items for ARC home page  
**Auth:** Optional (superadmin bypass)  
**Query:**
- `limit?: number` (default 15, max 20)

**Response:**
```typescript
{
  ok: true,
  leaderboards: Array<{
    arenaId?: string;
    arenaName?: string;
    arenaSlug?: string;
    projectId: string;
    projectName: string;
    projectSlug: string | null;
    xHandle: string | null;
    creatorCount: number;
    startAt: string | null;
    endAt: string | null;
    title: string;
    kind: 'arena' | 'campaign' | 'gamified';
    status?: 'live' | 'upcoming' | 'paused' | 'ended';
  }>,
  upcoming: Array<...>  // Same structure
}
```

**Process:**
1. Check if user is superadmin → set `bypassAccessCheck = true`
2. Call `getArcLiveItems(supabase, limit, bypassAccessCheck)`
3. Fetch arenas, campaigns, quests
4. For each item:
   - Run access check (unless bypassed)
   - Classify status (live/upcoming/ended)
   - Add to appropriate array
5. Deduplicate
6. Sort and limit
7. Return formatted response

#### `GET /api/portal/arc/leaderboard/[projectId]`
**Purpose:** Get mindshare leaderboard for a project (Option 2)  
**Auth:** Required  
**Response:**
```typescript
{
  ok: true,
  entries: Array<{
    rank: number;
    twitterUsername: string;
    arcPoints: number;
    multiplier: number;
    basePoints: number;
    postsCount: number;
    viewsCount: number;
    smartFollowersCount: number | null;
    smartFollowersPct: number | null;
    joined: boolean;
    followVerified: boolean;
  }>
}
```

**Scoring:**
- Fetches `arena_creators` for all active arenas of project
- Aggregates points by `twitter_username`
- Includes Smart Followers data
- Sorts by `arc_points` descending

#### `GET /api/portal/arc/arenas/[slug]/leaderboard`
**Purpose:** Get leaderboard for a specific arena  
**Auth:** Required  
**Response:** Same as above, but filtered to single arena

#### `GET /api/portal/arc/projects/[projectId]/leaderboard`
**Purpose:** Get gamified leaderboard (Option 3)  
**Auth:** Required  
**Response:**
```typescript
{
  ok: true,
  entries: Array<{
    rank: number;
    twitterUsername: string;
    xp: number;
    level: number;
    class: string | null;  // 'bronze' | 'silver' | 'gold' | 'legend'
    programs: Array<{
      programId: string;
      programName: string;
      xp: number;
    }>;
  }>
}
```

---

### Diagnostic Endpoints

#### `GET /api/portal/admin/arc/test-live-items`
**Purpose:** Comprehensive debug output for live items  
**Auth:** SuperAdmin only  
**Response:**
```typescript
{
  ok: true,
  summary: {
    totalArenas: number;
    totalLive: number;
    totalUpcoming: number;
    totalExcluded: number;
  },
  detailedArenas: Array<{
    arena: { id, name, slug, project_id, starts_at, ends_at, status };
    project: { id, name, slug, twitter_username } | null;
    leaderboardRequests: Array<{ id, status, approved_at, requested_by }>;
    accessCheck: { ok, approved, optionUnlocked, error, code };
    classification: { status, reason, now, startDate, endDate, startInFuture, endInPast };
    includedInResponse: { inLive, inUpcoming, reason };
  }>,
  duplicates: Array<{ projectName, projectId, arenaIds, arenaNames }>,
  processedLive: Array<...>,
  processedUpcoming: Array<...>
}
```

#### `GET /api/portal/admin/arc/debug-project?projectId=xxx`
**Purpose:** Debug a specific project's ARC status  
**Auth:** SuperAdmin only  
**Response:**
```typescript
{
  ok: true,
  project: { id, name, slug, twitter_username, arc_active, arc_access_level },
  arcProjectAccess: { id, application_status, created_at, approved_at } | null,
  arcProjectFeatures: { option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked } | null,
  arenas: Array<{ id, name, slug, status, starts_at, ends_at }>,
  accessCheck: { ok, approved, optionUnlocked, error, code },
  diagnostics: {
    hasArena: boolean;
    arenaStatus: string | null;
    hasApproval: boolean;
    approvalStatus: string | null;
    hasFeatures: boolean;
    option2Unlocked: boolean;
    accessCheckPassed: boolean;
    issues: string[];
  }
}
```

#### `POST /api/portal/admin/arc/backfill-live-items`
**Purpose:** Create/activate missing arenas for approved requests  
**Auth:** SuperAdmin only  
**Body:**
```typescript
{
  dryRun?: boolean;      // If true, only report what would be done
  limit?: number;       // Max requests to process (default 100)
  requestId?: string;   // If provided, only process this request
}
```
**Response:**
```typescript
{
  ok: true,
  dryRun: boolean,
  summary: {
    totalEligible: number;
    scannedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: Array<{ projectSlug, projectId, requestId, message }>;
    warnings: Array<{ projectSlug, projectId, requestId, message }>;
  }
}
```

---

## UI Components & User Flows

### User Request Flow

**Page:** `/portal/arc/requests`

**Components:**
- Request form with project selector
- Justification textarea
- Access level selector (if multiple options available)
- Submit button

**Flow:**
1. User selects project (filtered to projects they have access to)
2. User enters justification
3. User selects access level (if applicable)
4. Submit → `POST /api/portal/arc/leaderboard-requests`
5. Success → Show request ID and status
6. Error → Show error message

**Permission Check:**
- User must be project owner/admin/moderator OR superadmin
- Checked via `canRequestLeaderboard(supabase, userId, projectId)`

---

### Admin Approval Flow

**Page:** `/portal/admin/arc/leaderboard-requests`

**Components:**
- Request table with filters
- Status badges (PENDING/APPROVED/REJECTED)
- Live status indicators (LIVE/MISSING/ENDED)
- Action buttons (Approve/Reject/Fix)

**Request Table Columns:**
- PROJECT (name, slug, Twitter handle)
- REQUESTER (username)
- ACCESS (requested level)
- JUSTIFICATION
- STATUS (pending/approved/rejected)
- CREATED (date)
- ACTIONS (buttons)

**Live Status Detection:**
```typescript
// For each request, check:
1. Is request approved? → Check arc_leaderboard_requests.status
2. Does arena exist? → Check arenas table for project_id
3. Is arena active? → Check arenas.status = 'active'
4. Is arena live? → Check dates (starts_at, ends_at) vs now

Result:
- LIVE: Approved + arena exists + active + dates valid
- MISSING: Approved + no arena exists
- ENDED: Approved + arena exists + ended (past end date)
```

**Approve Modal:**
- Access level selector (creator_manager/leaderboard/gamified)
- Start date picker (optional)
- End date picker (optional)
- Discount percentage (optional)
- Discount notes (optional)
- Submit → `PUT /api/portal/admin/arc/leaderboard-requests/[id]`

**Fix Button:**
- Only shown for MISSING status
- Calls `POST /api/portal/admin/arc/backfill-live-items` with `requestId`
- Creates missing arena
- Reloads request list

---

### Live Display Flow

**Page:** `/portal/arc`

**Components:**
- Live Now section
- Upcoming section
- Filters (kind, time)
- Search bar

**Data Fetching:**
```typescript
// Hook: useArcLiveItems()
const { liveItems, upcomingItems, loading, error } = useArcLiveItems();

// Fetches: GET /api/portal/arc/live-leaderboards?limit=15
// Normalizes response to LiveItem format
// Handles client-side filtering
```

**LiveItem Format:**
```typescript
interface LiveItem {
  id: string;
  kind: 'arena' | 'campaign' | 'gamified';
  title: string;
  project: {
    id: string;
    name: string;
    slug: string | null;
    xHandle: string | null;
    accessLevel: string | null;
  };
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
  statusLabel: 'Live' | 'Upcoming' | 'Paused' | 'Ended';
  arenaId?: string;
  arenaSlug?: string;
  campaignId?: string;
}
```

**Rendering:**
- Each item shows: project name, title, creator count, time remaining
- Click → Navigate to arena/campaign detail page
- Filters applied client-side
- Search filters by project name/title

---

## Access Control System

### Two-Tier Approval System

**Tier 1: Project Approval** (`arc_project_access`)
- Global approval for project to use ARC
- `application_status = 'approved'` required
- One row per project (latest determines status)

**Tier 2: Feature Unlock** (`arc_project_features`)
- Per-option unlock flags
- `option1_crm_unlocked`, `option2_normal_unlocked`, `option3_gamified_unlocked`
- Date-based enablement (`leaderboard_start_at`, `leaderboard_end_at`, etc.)

### Access Check Function

**Location:** `src/web/lib/arc-access.ts`

**Function:** `requireArcAccess(supabase, projectId, option)`

**Process:**
1. Check project exists
2. Check `arc_project_access.application_status = 'approved'`
3. Check `arc_project_features.option{1|2|3}_unlocked = true`
4. If features row missing, fallback to legacy `projects.arc_access_level`

**Return:**
```typescript
{
  ok: true,
  approved: boolean,
  optionUnlocked: boolean
} | {
  ok: false,
  error: string,
  code: 'not_approved' | 'option_locked' | 'project_not_found'
}
```

### SuperAdmin Bypass

**Implementation:**
- `GET /api/portal/arc/live-leaderboards` checks if user is superadmin
- If superadmin: `bypassAccessCheck = true`
- Passed to `getArcLiveItems(supabase, limit, bypassAccessCheck)`
- All arenas included regardless of access status

**Check:**
```typescript
const sessionToken = getSessionToken(req);
const userId = await getUserIdFromSession(sessionToken);
const isSuperAdmin = await isSuperAdminServerSide(userId);
bypassAccessCheck = isSuperAdmin;
```

---

## Data Flow Diagrams

### Request → Approval → Live Display

```
┌─────────────┐
│ User Request│
│  (POST)     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ arc_leaderboard_    │
│ requests (pending)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ SuperAdmin Approves │
│  (PUT /[id])       │
└──────┬──────────────┘
       │
       ├─► Update projects.arc_active = true
       ├─► Update projects.arc_access_level
       ├─► Create arc_project_access (approved)
       ├─► Create arc_project_features (unlocks)
       ├─► Create arc_billing_records
       └─► Auto-create arenas (Option 2/3)
           │
           ▼
┌─────────────────────┐
│ Arena Created       │
│ status = 'active'   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ GET /live-          │
│ leaderboards        │
└──────┬──────────────┘
       │
       ├─► Fetch arenas (status = active/scheduled/paused)
       ├─► Check access (requireArcAccess)
       ├─► Classify status (live/upcoming/ended)
       ├─► Deduplicate
       └─► Return to UI
           │
           ▼
┌─────────────────────┐
│ /portal/arc         │
│ Live Now Section    │
└─────────────────────┘
```

### Access Check Flow

```
┌─────────────────────┐
│ requireArcAccess()  │
│ (projectId, option) │
└──────┬──────────────┘
       │
       ├─► Check project exists
       │   └─► If not: return { ok: false, code: 'project_not_found' }
       │
       ├─► Check arc_project_access
       │   └─► application_status = 'approved'?
       │       └─► If not: return { ok: false, code: 'not_approved' }
       │
       └─► Check arc_project_features
           └─► option{1|2|3}_unlocked = true?
               ├─► If yes: return { ok: true, approved: true, optionUnlocked: true }
               └─► If no: return { ok: false, code: 'option_locked' }
```

---

## Troubleshooting Guide

### Issue: Request Approved but Not Showing in Live Now

**Checklist:**
1. ✅ Is arena created? → Check `arenas` table for `project_id`
2. ✅ Is arena status `active`? → Check `arenas.status`
3. ✅ Are dates valid? → Check `starts_at` (null or past), `ends_at` (null or future)
4. ✅ Is access approved? → Check `arc_project_access.application_status = 'approved'`
5. ✅ Is option unlocked? → Check `arc_project_features.option2_normal_unlocked = true`
6. ✅ Is access check passing? → Use debug endpoint

**Debug Steps:**
```bash
# 1. Check test endpoint
GET /api/portal/admin/arc/test-live-items
# Look for the arena in detailedArenas array
# Check includedInResponse.reason

# 2. Check project debug
GET /api/portal/admin/arc/debug-project?projectSlug=uniswap
# Check diagnostics.issues array

# 3. Check server logs
# Look for [getArcLiveItems] logs
# Check access check results
```

**Common Causes:**
- Arena not created (use Fix button or backfill)
- Access check failing (missing `arc_project_features` row)
- Future start date (classified as "upcoming")
- Past end date (classified as "ended")
- Duplicate filtering (check deduplication logs)

---

### Issue: Duplicate Items in Live Now

**Cause:** Multiple arenas for same project or same arena appearing twice

**Fix:**
- Deduplication logic already in place
- Removes duplicates by `arena.id`
- Removes duplicates by `projectId + kind`
- Check logs for deduplication messages

**Debug:**
```bash
GET /api/portal/admin/arc/test-live-items
# Check duplicates array
# Shows projects with multiple arenas
```

---

### Issue: "No arena exists for this project"

**Cause:** Arena creation failed during approval

**Fix:**
1. Use "Fix" button in admin requests page
2. Or use backfill endpoint:
```bash
POST /api/portal/admin/arc/backfill-live-items
Body: { requestId: "xxx", dryRun: false }
```

**Prevention:**
- Approval API has retry logic for arena creation
- Fallback slug generation if project fetch fails
- Emergency fallback with timestamped slug

---

### Issue: Access Check Failing

**Symptoms:**
- Arena exists but not showing
- Debug endpoint shows `accessCheck.ok = false`

**Common Causes:**
1. Missing `arc_project_access` row
   - Fix: Re-approve request or manually insert
2. Missing `arc_project_features` row
   - Fix: Re-approve request or manually insert with `option2_normal_unlocked = true`
3. Wrong `application_status`
   - Fix: Update `arc_project_access.application_status = 'approved'`

**Manual Fix (SQL):**
```sql
-- Check current status
SELECT * FROM arc_project_access WHERE project_id = 'xxx';
SELECT * FROM arc_project_features WHERE project_id = 'xxx';

-- Fix access
UPDATE arc_project_access
SET application_status = 'approved', approved_at = NOW()
WHERE project_id = 'xxx';

-- Fix features
INSERT INTO arc_project_features (project_id, option2_normal_unlocked, leaderboard_enabled)
VALUES ('xxx', true, true)
ON CONFLICT (project_id) DO UPDATE SET
  option2_normal_unlocked = true,
  leaderboard_enabled = true;
```

---

## Summary

### Key Takeaways

1. **Three Leaderboard Types:**
   - Option 1: CRM (campaigns, private management)
   - Option 2: Mindshare (arenas, public tracking)
   - Option 3: Gamified (quests, XP system)

2. **Request Flow:**
   - User submits → SuperAdmin approves → Entities created → Live display

3. **Access Control:**
   - Two-tier: Project approval + Feature unlock
   - SuperAdmin bypass for visibility

4. **Auto-Creation:**
   - Option 2: Arena created on approval
   - Option 3: Arena + Program created on approval
   - Option 1: Manual campaign creation

5. **Live Display:**
   - Fetches arenas → Access check → Status classification → Deduplication → Return

6. **Debugging:**
   - Use `/api/portal/admin/arc/test-live-items` for comprehensive debug
   - Use `/api/portal/admin/arc/debug-project` for project-specific issues
   - Check server logs for detailed processing steps

---

**End of Document**
