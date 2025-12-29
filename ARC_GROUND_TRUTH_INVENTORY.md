# ARC Leaderboard Ground Truth Inventory
**Date:** 2025-01-29  
**Purpose:** Complete mapping of all ARC leaderboard routes, APIs, DB tables, and scoring locations

---

## OPTION 1: Creator Manager (CRM)

**Routes:**
- `/portal/arc/creator-manager` - List all CRM programs
- `/portal/arc/creator-manager/[programId]` - Program details with leaderboard
- `/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]` - Creator profile

**API Endpoints:**
- `GET /api/portal/arc/campaigns/[id]/leaderboard` - Campaign leaderboard
- `GET /api/portal/arc/campaigns` - List campaigns
- `POST /api/portal/arc/campaigns` - Create campaign

**Database Tables:**
- `arc_campaigns` - Campaign definitions
- `arc_campaign_participants` - Participants in campaigns
- `user_ct_activity` - X engagement tracking (primary scoring source)
- `creator_manager_programs` - Legacy program table
- `creator_manager_creators` - Legacy creator assignments

**Scoring Location:**
- **File:** `src/web/pages/api/portal/arc/campaigns/[id]/leaderboard.ts`
- **Function:** `calculateScore()` (lines 50-62)
- **Formula:** `tweet_count + (total_likes * 0.1) + (total_retweets * 0.5) + (total_replies * 0.2)`
- **Data Source:** `user_ct_activity` table filtered by campaign dates

---

## OPTION 2: Mindshare Leaderboard

**Routes:**
- `/portal/arc/leaderboard/[projectId]` - Project mindshare leaderboard
- `/portal/arc/[slug]/arena/[arenaSlug]` - Arena-specific leaderboard
- `/portal/arc/[slug]` - Project hub (shows live/upcoming arenas)

**API Endpoints:**
- `GET /api/portal/arc/leaderboard/[projectId]` - Mindshare leaderboard by project
- `GET /api/portal/arc/arenas/[slug]/leaderboard` - Paginated arena leaderboard
- `GET /api/portal/arc/verify-follow` - Verify user follows project
- `POST /api/portal/arc/join-leaderboard` - Join leaderboard

**Database Tables:**
- `arenas` - Arena definitions (multiple per project)
- `arena_creators` - Joined creators with `arc_points`, `ring`
- `project_tweets` - All tweets/mentions (primary scoring source)
- `arc_project_follows` - Follow verification status
- `arc_point_adjustments` - Manual point adjustments

**Scoring Locations:**
1. **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - **Function:** `calculateAutoTrackedPoints()` (lines 58-87)
   - **Formula:** `SUM(likes + replies*2 + retweets*3)` per creator from `project_tweets`
   - **Multiplier:** 1.5x if `is_joined && follow_verified`, else 1.0x

2. **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - **Function:** `calculateAutoTrackedPoints()` (lines 98-225)
   - **Formula:** Same as above, plus additional metrics:
     - `sentiment` (average sentiment_score)
     - `ctHeat` (recency-weighted engagement)
     - `signal` vs `noise` (filtered engagement)
     - `engagementTypes` (threader, video, clipper, meme counts)

---

## OPTION 3: Gamified Quests

**Routes:**
- `/portal/arc/gamified/[projectId]` - Full gamified leaderboard page
- `/portal/arc/[slug]/arena/[arenaSlug]` - Quests tab within arena

**API Endpoints:**
- `GET /api/portal/arc/projects/[projectId]/leaderboard` - Gamified leaderboard (XP + levels)
- `GET /api/portal/arc/gamified/[projectId]` - Quest list and completions
- `POST /api/portal/arc/quests/completions` - Submit quest completion

**Database Tables:**
- `creator_manager_programs` - Programs (legacy, used for gamified)
- `creator_manager_creators` - Creators with `arc_points`, `xp`, `class`
- `arc_quests` - Quest definitions
- `arc_quest_completions` - Quest completion records

**Scoring Location:**
- **File:** `src/web/pages/api/portal/arc/projects/[projectId]/leaderboard.ts`
- **Function:** Aggregates `arc_points` and `xp` across all programs (lines 129-192)
- **Formula:** 
  - `total_arc_points = SUM(arc_points)` per creator
  - `total_xp = SUM(xp)` per creator
  - `level = floor(total_xp / 100)`
  - Rank badges: Bronze ≥0, Silver ≥500, Gold ≥2000, Legend ≥10000

---

## UNIFIED ARC HOME FEED

**Route:**
- `/portal/arc` - ARC home page

**API Endpoints:**
- `GET /api/portal/arc/summary` - ARC summary (treemap data)
- `GET /api/portal/arc/top-projects` - Top projects
- `GET /api/portal/arc/projects` - All ARC projects

**Live Items Feed:**
- **Hook:** `useArcLiveItems()` in `src/web/lib/arc/useArcLiveItems.ts`
- **Returns:** All 3 kinds of ARC items (campaigns, arenas, quests)
- **UI:** `src/web/pages/portal/arc/index.tsx` - Displays treemap + live/upcoming items

---

## KEY FINDINGS

1. **Option 2 has TWO leaderboard endpoints:**
   - `/api/portal/arc/leaderboard/[projectId]` - Simple mindshare
   - `/api/portal/arc/arenas/[slug]/leaderboard` - Enhanced with sentiment/CT heat

2. **Scoring is NOT unified:**
   - Option 1 uses `user_ct_activity`
   - Option 2 uses `project_tweets`
   - Option 3 aggregates from `creator_manager_creators`

3. **Keyword relevance is NOT implemented:**
   - `projects.arc_keywords` field exists (TEXT[])
   - No usage in scoring functions
   - No UI for setting keywords

4. **Smart Followers does NOT exist:**
   - No graph tables
   - No PageRank calculation
   - No smart account scoring

5. **Project Mindshare (BPS normalized) does NOT exist:**
   - No mindshare_bps calculation
   - No window-based snapshots (24h, 48h, 7d, 30d)
   - No delta calculations

---

## NEXT STEPS

1. ✅ Ground truth inventory complete
2. ⏳ Run QA audit (lint/build/test)
3. ⏳ Create Smart Followers DB tables
4. ⏳ Implement Smart Followers graph system
5. ⏳ Implement Project Mindshare (BPS normalized)
6. ⏳ Implement Creator Signal Score
7. ⏳ Update APIs and UI

