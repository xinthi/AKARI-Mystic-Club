# ARC Audit Inventory - Ground Truth Map

**Date:** 2025-01-XX  
**Auditor:** Staff-level ARC Audit Task Force  
**Purpose:** Comprehensive inventory of ARC UI pages, APIs, and code paths

---

## STEP 0: INVENTORY

### 1. ARC UI Pages + APIs Called

#### Option 1: Creator Manager (CRM)

**Pages:**
1. **`/portal/arc/creator-manager`** (Home)
   - File: `src/web/pages/portal/arc/creator-manager/index.tsx`
   - API: `GET /api/portal/creator-manager/projects`
   - Auth: Portal user required
   - Components: Project list with programs

2. **`/portal/arc/creator-manager/[programId]`** (Program Detail)
   - File: `src/web/pages/portal/arc/creator-manager/[programId].tsx`
   - APIs: Program detail, creators, deals, missions APIs
   - Auth: Project permissions (owner/admin/moderator)
   - Components: Tabs (Overview, Creators, Deals, Missions)

3. **`/portal/arc/creator-manager/create`** (Create Program)
   - File: `src/web/pages/portal/arc/creator-manager/create.tsx`
   - API: `POST /api/portal/creator-manager/programs`
   - Auth: Project permissions required

4. **`/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]`** (Creator Detail)
   - File: `src/web/pages/portal/arc/creator-manager/[programId]/creators/[creatorProfileId].tsx`
   - APIs: Creator detail, mission progress APIs
   - Auth: Project permissions required

#### Option 2: Mindshare Leaderboard

**Pages:**
1. **`/portal/arc/leaderboard/[projectId]`** (Legacy Redirect)
   - File: `src/web/pages/portal/arc/leaderboard/[projectId].tsx`
   - APIs: `/api/portal/arc/state`, `/api/portal/arc/active-arena`, `/api/portal/arc/project/[projectId]`
   - Auth: Portal user required
   - Behavior: Redirects to `/portal/arc/[slug]/arena/[arenaSlug]`

2. **`/portal/arc/[slug]/arena/[arenaSlug]`** (Arena Details - PRIMARY)
   - File: `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`
   - APIs: 
     - `GET /api/portal/arc/arenas/[slug]` (arena details)
     - `GET /api/portal/arc/arenas/[slug]/leaderboard` (leaderboard entries)
     - `GET /api/portal/arc/quests` (quests list)
     - `GET /api/portal/arc/quests/[id]/leaderboard` (quest leaderboards)
   - Auth: Portal user required
   - Components: Leaderboard table, Quests tab, Storyline, Map

3. **`/portal/arc/project/[projectId]`** (Project Leaderboard Page)
   - File: `src/web/pages/portal/arc/project/[projectId].tsx`
   - APIs: `GET /api/portal/arc/leaderboard/[projectId]`
   - Auth: Portal user required
   - Components: Leaderboard table with join flow

#### Option 3: Gamified

**Pages:**
1. **`/portal/arc/gamified/[projectId]`** (Gamified Leaderboard - LEGACY)
   - File: `src/web/pages/portal/arc/gamified/[projectId].tsx`
   - APIs: `GET /api/portal/arc/gamified/[projectId]`
   - Auth: Portal user, Option 3 access required
   - Status: ⚠️ Legacy - routes now go to arena page instead

#### General ARC Pages

1. **`/portal/arc`** (Home)
   - File: `src/web/pages/portal/arc/index.tsx`
   - APIs: 
     - `GET /api/portal/arc/top-projects`
     - `GET /api/portal/arc/live-leaderboards`
   - Auth: Portal user, tier check
   - Components: Live/Upcoming sections, LiveItemCard

2. **`/portal/arc/[slug]`** (Project Hub)
   - File: `src/web/pages/portal/arc/[slug].tsx`
   - APIs:
     - `GET /api/portal/arc/state` (unified state)
     - `GET /api/portal/arc/arenas` (arenas list)
     - Leaderboard APIs
   - Auth: Portal user required
   - Components: Tabs (Leaderboard, CRM, GameFi)

3. **`/portal/arc/creator/[twitterUsername]`** (Creator Profile)
   - File: `src/web/pages/portal/arc/creator/[twitterUsername].tsx`
   - APIs: `GET /api/portal/arc/creator?twitterUsername=...`
   - Auth: Portal user required
   - Components: Creator stats, arena entries

#### Admin Pages

1. **`/portal/admin/arc/leaderboard-requests`**
   - File: `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
   - APIs:
     - `GET /api/portal/admin/arc/leaderboard-requests`
     - `PATCH /api/portal/admin/arc/leaderboard-requests/[id]`
     - `POST /api/portal/admin/arc/backfill-live-items`
     - `POST /api/portal/admin/arc/live-item/action`
   - Auth: SuperAdmin required
   - Components: Requests table, Approve/Reject modals

2. **`/portal/admin/arc/reports`**
   - File: `src/web/pages/portal/admin/arc/reports/index.tsx`
   - APIs: `GET /api/portal/admin/arc/reports-list`
   - Auth: SuperAdmin or Project Admin
   - Components: Reports list

3. **`/portal/admin/arc/[projectSlug]`** (Arena Manager)
   - File: `src/web/pages/portal/arc/admin/[projectSlug].tsx`
   - APIs: Arena admin APIs
   - Auth: Project permissions required

---

### 2. Scoring + Aggregation Code Paths

#### Leaderboard Calculation Functions

**Primary Leaderboard APIs:**

1. **`/api/portal/arc/arenas/[slug]/leaderboard`**
   - File: `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - Functions:
     - `calculateAutoTrackedPoints()` - Calculates points from `project_tweets`
     - `buildCreatorPostMetrics()` - Builds metrics for signal/noise calculation
   - Tables Read:
     - `project_tweets` (mentions only, `is_official = false`)
     - `arena_creators` (joined creators)
     - `profiles` (avatar URLs)
     - `smart_account_scores` (smart score)
   - Multiplier Logic:
     - `multiplier = (isJoined && followVerified) ? 1.5 : 1.0`
     - Applied in: Line 747
   - Signal/Noise:
     - Uses `calculateCreatorSignalScore()` from `@/server/arc/signal-score`
     - Calculates signal, noise, engagement types from tweet content

2. **`/api/portal/arc/leaderboard/[projectId]`**
   - File: `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - Functions:
     - `calculateAutoTrackedPoints()` - Same as above
     - `buildCreatorPostMetrics()` - Same as above
   - Tables Read:
     - `project_tweets` (mentions)
     - `arena_creators` (joined creators, for multiplier)
   - Multiplier Logic:
     - Same as above: 1.5x if joined AND follow verified
   - Merging:
     - Merges auto-tracked + joined creators
     - Base points = joined points + auto-tracked points (if both exist)

3. **`/api/portal/arc/gamified/[projectId]`**
   - File: `src/web/pages/api/portal/arc/gamified/[projectId].ts`
   - Reuses leaderboard calculation logic
   - Additional: Fetches `arc_quests` for quest list

**Quest Leaderboard:**

4. **`/api/portal/arc/quests/[id]/leaderboard`**
   - File: `src/web/pages/api/portal/arc/quests/[id]/leaderboard.ts`
   - Tables Read:
     - `arc_contributions` (primary)
     - `project_tweets` (fallback)
   - Time Window: Quest `starts_at` to `ends_at`
   - Scoring: `likes + replies*2 + retweets*3` (same formula)

**Scoring Formula (Standard):**
```
engagement_points = likes + (replies * 2) + (retweets * 3)
base_points = SUM(engagement_points) per creator
multiplier = (isJoined && followVerified) ? 1.5 : 1.0
final_score = floor(base_points * multiplier)
```

**Signal/Noise Calculation:**
- Function: `calculateCreatorSignalScore()` from `@/server/arc/signal-score`
- Input: `CreatorPostMetrics[]` (tweets with engagement, sentiment, smart scores)
- Output: `{ signal, noise, engagementTypes }`
- Uses: Smart score, sentiment, content classification (threader/video/clipper/meme)

**Tables Involved:**
- `project_tweets` - Source of truth for mentions/engagement
- `arena_creators` - Joined creators (multiplier eligibility)
- `profiles` - User profiles (avatar URLs, usernames)
- `smart_account_scores` - Smart follower scores
- `arc_contributions` - Quest-specific contributions
- `arc_quests` - Quest definitions

---

## Next Steps

1. Run quality gates (lint, build)
2. Execute UI QA runbook
3. Test admin actions
4. Verify API contracts
5. Check UI polish

