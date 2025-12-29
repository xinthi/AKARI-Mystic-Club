# ARC Smart Followers & Mindshare Implementation Status

**Date:** 2025-01-29  
**Status:** In Progress - Core Implementation Complete, Integration Needed

---

## Executive Summary

This document tracks the implementation status of Smart Followers and Project Mindshare features for ARC leaderboards. Most core logic is implemented, but several integration points and data pipeline jobs need completion.

---

## STEP 0: GROUND TRUTH INVENTORY ✅

### Option 1: CRM (Creator Manager)
- **Routes:** `/portal/arc/[slug]` (project hub), `/portal/arc/campaigns/[id]`
- **API:** `/api/portal/arc/campaigns/[id]/leaderboard`
- **Core Tables:** `arc_campaigns`, `arc_campaign_participants`, `user_ct_activity`
- **Scoring Location:** `src/web/lib/arc/creator-manager-scoring.ts` → `src/web/lib/arc/scoring.ts`

### Option 2: Mindshare Leaderboard (formerly "Arenas")
- **Routes:** `/portal/arc/[slug]/arena/[arenaSlug]`
- **API:** `/api/portal/arc/arenas/[slug]/leaderboard`
- **Core Tables:** `arenas`, `arena_creators`, `project_tweets`, `arc_project_follows`
- **Scoring Location:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts` (lines 239-366)
- **Signal Score:** `src/server/arc/signal-score.ts` ✅

### Option 3: Gamified Quests
- **Routes:** `/portal/arc/gamified/[projectId]`
- **API:** `/api/portal/arc/gamified/[projectId]`, `/api/portal/arc/quests/[id]/leaderboard`
- **Core Tables:** `creator_manager_programs`, `creator_manager_creators`, `creator_manager_missions`, `creator_manager_mission_progress`
- **Scoring Location:** `src/web/pages/api/portal/arc/gamified/[projectId].ts`

---

## STEP 1: END-TO-END QA ⚠️ PENDING

**Status:** Not yet run. Need to:
- [ ] Run `pnpm lint`
- [ ] Run `pnpm build`
- [ ] Run `pnpm test` (if exists)
- [ ] Create QA checklist document
- [ ] Test `/portal/arc` loads treemap + live/upcoming
- [ ] Test leaderboards load for all 3 options
- [ ] Test admin action buttons
- [ ] Test end action navigation

---

## STEP 2: SMART FOLLOWERS SYSTEM

### Database Tables ✅
**Status:** All tables exist via migration `20250129_add_smart_followers_tables.sql`

- ✅ `tracked_profiles` - Universe of profiles to track
- ✅ `x_follow_edges` - Directed graph edges (who follows whom)
- ✅ `smart_account_scores` - Daily PageRank, bot_risk, smart_score, is_smart
- ✅ `smart_followers_snapshots` - Daily snapshots per entity (project/creator)

### Core Calculation Logic ✅
**File:** `src/server/smart-followers/calculate.ts`

- ✅ `getSmartFollowers()` - Gets smart followers count/pct from snapshots or graph
- ✅ `getSmartFollowersDeltas()` - Calculates 7d and 30d deltas
- ✅ Fallback to "Smart Audience Estimate" if graph unavailable
- ✅ Bot risk calculation with configurable heuristics
- ✅ PageRank integration (via scripts)

### Data Pipeline Jobs ⚠️ PARTIAL

**Scripts exist:**
- ✅ `scripts/smart-followers/ingest-graph.ts` - Graph ingestion (needs X API integration)
- ✅ `scripts/smart-followers/calculate-pagerank.ts` - PageRank computation
- ✅ `scripts/smart-followers/snapshot.ts` - Daily snapshot computation

**Missing:**
- [ ] Tracked universe build job (populate `tracked_profiles` from existing data)
- [ ] Graph ingestion cron job setup (depends on X API following list access)
- [ ] PageRank computation cron job setup
- [ ] Snapshot computation cron job setup

**Note:** If X following API is not available, system falls back to "Smart Audience Estimate" mode automatically.

---

## STEP 3: PROJECT MINDSHARE (BPS NORMALIZED)

### Database Tables ✅
**Status:** Tables exist via migration `20250129_add_project_mindshare_snapshots.sql`

- ✅ `project_mindshare_snapshots` - Daily snapshots per window (24h, 48h, 7d, 30d)
- ✅ Helper function `get_mindshare_delta()` for delta calculations

### Core Calculation Logic ✅
**File:** `src/server/mindshare/calculate.ts`

- ✅ `calculateProjectMindshare()` - Calculates attention_value and gets BPS from snapshots
- ✅ `normalizeMindshareBPS()` - Normalizes all projects to sum to 10,000 bps
- ✅ Log-scaled core inputs (posts, creators, engagement, ct_heat)
- ✅ Quality multipliers (creator_organic, audience_organic, originality, sentiment, smart_followers)
- ✅ Keyword relevance filtering (uses `projects.arc_keywords`)
- ✅ Smart Followers boost integration ✅ (just added)
- ✅ Quality score calculations ✅ (just improved)

**Improvements Made:**
- ✅ Now uses snapshots for normalized BPS (instead of raw attention_value)
- ✅ Calculates creator_organic_score from profiles.authenticity_score
- ✅ Calculates originality_score from content uniqueness
- ✅ Integrates smart_followers_pct for boost calculation

### Data Pipeline Jobs ⚠️ PARTIAL

**Script exists:**
- ✅ `scripts/mindshare/snapshot.ts` - Calculates and stores daily snapshots

**Missing:**
- [ ] Cron job setup to run snapshot script daily
- [ ] Ensure snapshot runs before API queries (or API gracefully handles missing snapshots)

---

## STEP 4: CREATOR SIGNAL SCORE ✅

### Implementation ✅
**File:** `src/server/arc/signal-score.ts`

- ✅ `calculateCreatorSignalScore()` - Complete implementation
- ✅ Recency weighting (half-life decay)
- ✅ Content type weights (thread > analysis > meme > reply > retweet)
- ✅ Originality penalty for duplicates
- ✅ Authenticity weight (smart_score + audience_org)
- ✅ Sentiment weight (bounded)
- ✅ Join weight (bonus for joined creators)
- ✅ Trust band calculation (A/B/C/D)
- ✅ All tunables in env vars

### Integration ✅
**File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`

- ✅ Already integrated (lines 779-797)
- ✅ Returns `signal_score` and `trust_band` in leaderboard entries

---

## STEP 5: API + UI INTEGRATION

### APIs Status

#### `/api/portal/sentiment/projects?window=24h|48h|7d|30d` ✅
**File:** `src/web/pages/api/portal/sentiment/projects.ts`

- ✅ Already calls `calculateProjectMindshare()`
- ✅ Already calls `getSmartFollowers()` and `getSmartFollowersDeltas()`
- ✅ Returns: `mindshare_bps`, `delta_bps_1d`, `delta_bps_7d`, `smart_followers_count`, `smart_followers_pct`, `smart_followers_delta_7d`, `smart_followers_delta_30d`

#### `/api/portal/arc/arenas/[slug]/leaderboard` ✅
**File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`

- ✅ Already includes `smart_followers_count`, `smart_followers_pct`
- ✅ Already includes `signal_score`, `trust_band`
- ✅ Returns in `LeaderboardEntry` interface (lines 41-45)

#### `/api/portal/arc/leaderboard/[projectId]` ⚠️ NEEDS CHECK
**Status:** Unknown - need to verify if it includes new fields

#### `/api/portal/sentiment/profile/[username]` ⚠️ NEEDS CHECK
**Status:** Unknown - need to verify if it includes smart followers

### UI Status ⚠️ PARTIAL

#### Sentiment Page (Projects) ⚠️
**File:** `src/web/pages/portal/sentiment/index.tsx`

- ✅ API returns new fields
- ⚠️ UI may need updates to display:
  - [ ] mindshare_bps with window switcher
  - [ ] deltas (delta_bps_1d, delta_bps_7d)
  - [ ] smart_followers_count + growth indicators
  - [ ] smart_followers_pct

#### ARC Leaderboards ✅
**File:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

- ✅ API returns new fields
- ⚠️ UI may need updates to display:
  - [ ] Smart Followers column
  - [ ] Trust band badge
  - [ ] Signal score display

#### Creator Profile ⚠️ NEEDS CHECK
**Status:** Unknown - need to verify if profile page exists and displays smart followers

#### Project Pages (Active Quests Panel) ⚠️
**Status:** Need to add right rail panel for desktop, collapsible section for mobile

---

## STEP 6: TESTS ⚠️ PENDING

**Missing:**
- [ ] Unit test: `sum(mindshare_bps) == 10000` per window
- [ ] Unit test: identical attention_value → identical bps (with remainder distribution)
- [ ] Unit test: whale engagement doesn't dominate (log scaling)
- [ ] Unit test: bot penalty reduces score
- [ ] Unit test: smart_followers_count equals incoming smart edges on toy graph
- [ ] API contract tests (if possible)

---

## STEP 7: ENVIRONMENT VARIABLES

### Smart Followers Env Vars
- `SMART_FOLLOWERS_TOP_N` - Top N accounts to mark as smart (default: 1000)
- `SMART_FOLLOWERS_TOP_PCT` - Top percentage to mark as smart (default: 0.1)
- `BOT_RISK_THRESHOLD` - Bot risk threshold (default: 0.5)
- `MIN_ACCOUNT_AGE_DAYS` - Minimum account age in days (default: 90)

### Mindshare Env Vars
- `MINDSHARE_W1_POSTS` - Weight for posts/mentions (default: 0.25)
- `MINDSHARE_W2_CREATORS` - Weight for unique creators (default: 0.25)
- `MINDSHARE_W3_ENGAGEMENT` - Weight for engagement total (default: 0.30)
- `MINDSHARE_W4_CT_HEAT` - Weight for CT heat (default: 0.20)
- `MINDSHARE_CREATOR_ORG_FLOOR` - Creator organic floor (default: 0.5)
- `MINDSHARE_CREATOR_ORG_CAP` - Creator organic cap (default: 1.5)
- `MINDSHARE_AUDIENCE_ORG_FLOOR` - Audience organic floor (default: 0.5)
- `MINDSHARE_AUDIENCE_ORG_CAP` - Audience organic cap (default: 1.5)
- `MINDSHARE_ORIGINALITY_FLOOR` - Originality floor (default: 0.7)
- `MINDSHARE_ORIGINALITY_CAP` - Originality cap (default: 1.3)
- `MINDSHARE_SENTIMENT_FLOOR` - Sentiment floor (default: 0.8)
- `MINDSHARE_SENTIMENT_CAP` - Sentiment cap (default: 1.2)
- `MINDSHARE_SMART_FOLLOWERS_FLOOR` - Smart followers boost floor (default: 1.0)
- `MINDSHARE_SMART_FOLLOWERS_CAP` - Smart followers boost cap (default: 1.5)

### Signal Score Env Vars
- `SIGNAL_RECENCY_HALFLIFE_24H` - Half-life for 24h window (default: 12)
- `SIGNAL_RECENCY_HALFLIFE_7D` - Half-life for 7d window (default: 84)
- `SIGNAL_RECENCY_HALFLIFE_30D` - Half-life for 30d window (default: 360)
- `SIGNAL_CONTENT_WEIGHT_THREAD` - Thread weight (default: 2.0)
- `SIGNAL_CONTENT_WEIGHT_ANALYSIS` - Analysis weight (default: 1.8)
- `SIGNAL_CONTENT_WEIGHT_MEME` - Meme weight (default: 0.8)
- `SIGNAL_CONTENT_WEIGHT_QUOTE_RT` - Quote RT weight (default: 1.0)
- `SIGNAL_CONTENT_WEIGHT_RETWEET` - Retweet weight (default: 0.3)
- `SIGNAL_CONTENT_WEIGHT_REPLY` - Reply weight (default: 0.5)
- `SIGNAL_AUTH_WEIGHT_FLOOR` - Auth weight floor (default: 0.5)
- `SIGNAL_AUTH_WEIGHT_CAP` - Auth weight cap (default: 2.0)
- `SIGNAL_SENTIMENT_WEIGHT_FLOOR` - Sentiment floor (default: 0.7)
- `SIGNAL_SENTIMENT_WEIGHT_CAP` - Sentiment cap (default: 1.3)
- `SIGNAL_JOIN_WEIGHT_MAX` - Join weight max (default: 1.5)
- `SIGNAL_TRUST_BAND_A_MIN` - Trust band A minimum (default: 80)
- `SIGNAL_TRUST_BAND_B_MIN` - Trust band B minimum (default: 60)
- `SIGNAL_TRUST_BAND_C_MIN` - Trust band C minimum (default: 40)

**Where to set:** Vercel (project settings → Environment Variables) and/or Supabase (Project Settings → API → Secrets)

---

## PRIORITY ACTIONS

### High Priority (Blocking Production)
1. ✅ **DONE:** Fix mindshare calculation to use snapshots
2. ✅ **DONE:** Improve quality score calculations in mindshare
3. ✅ **DONE:** Integrate smart followers boost in mindshare
4. ⚠️ **TODO:** Set up cron jobs for snapshot computations
5. ⚠️ **TODO:** Verify UI displays new fields correctly
6. ⚠️ **TODO:** Run end-to-end QA

### Medium Priority (Enhancements)
1. ⚠️ **TODO:** Build tracked universe job (populate tracked_profiles from existing data)
2. ⚠️ **TODO:** Set up graph ingestion (if X API available)
3. ⚠️ **TODO:** Add unit tests
4. ⚠️ **TODO:** Add Active Quests panel to project pages

### Low Priority (Nice to Have)
1. ⚠️ **TODO:** Enhance audience_organic_score calculation
2. ⚠️ **TODO:** Add API contract tests
3. ⚠️ **TODO:** Performance optimization for large datasets

---

## NOTES

- All algorithm tunables are in env vars (no hardcoded values)
- Formulas/weights are NOT committed in readable form (server-side only)
- Smart Followers falls back gracefully to "Smart Audience Estimate" if graph unavailable
- Mindshare calculation returns 0 BPS if no snapshot exists (triggers snapshot computation)
- APIs gracefully handle missing data (null values)

