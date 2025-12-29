# ARC Smart Followers & Mindshare Implementation Status
**Date:** 2025-01-29  
**Status:** Core Systems Implemented - Integration Pending

---

## ✅ COMPLETED

### 1. Ground Truth Inventory
- ✅ Mapped all 3 ARC leaderboard options (CRM, Mindshare, Gamified)
- ✅ Documented routes, APIs, DB tables, scoring locations
- ✅ Created `ARC_GROUND_TRUTH_INVENTORY.md`

### 2. Smart Followers Database Schema
- ✅ Created migration: `supabase/migrations/20250129_add_smart_followers_tables.sql`
- ✅ Tables created:
  - `tracked_profiles` - Universe of tracked profiles
  - `x_follow_edges` - Directed graph edges (who follows whom)
  - `smart_account_scores` - Daily PageRank, bot risk, smart score snapshots
  - `smart_followers_snapshots` - Daily Smart Followers counts per entity
- ✅ Helper functions: `get_smart_followers_count()`, `get_smart_followers_pct()`
- ✅ RLS policies configured

### 3. Smart Followers Calculation System
- ✅ Created: `src/server/smart-followers/calculate.ts`
- ✅ Features:
  - Graph-based calculation (when graph data available)
  - Fallback "Smart Audience Estimate" (using high-trust engagers)
  - Delta calculation (7d, 30d)
  - `is_estimate` flag to track fallback mode

### 4. Project Mindshare Calculation
- ✅ Created: `src/server/mindshare/calculate.ts`
- ✅ Features:
  - BPS normalization to 10,000 per window
  - Log-scaled core inputs (posts, creators, engagement, CT heat)
  - Quality multipliers (bounded floors/caps)
  - Keyword relevance matching
  - Smart Followers boost
  - Window support: 24h, 48h, 7d, 30d

### 5. Creator Signal Score
- ✅ Created: `src/server/arc/signal-score.ts`
- ✅ Features:
  - Recency-weighted scoring (exponential decay)
  - Content type weights (thread > analysis > meme > retweet)
  - Originality penalty (duplicate detection)
  - Authenticity weight (smart score + audience org)
  - Sentiment weight (bounded)
  - Join weight bonus
  - Trust bands: A (≥80), B (≥60), C (≥40), D (<40)

### 6. API Response Types Updated
- ✅ Updated `LeaderboardEntry` interface in `/api/portal/arc/arenas/[slug]/leaderboard.ts`
- ✅ Added fields: `smart_followers_count`, `smart_followers_pct`, `signal_score`, `trust_band`
- ✅ Placeholder values set to `null` (ready for integration)

---

## ⏳ PENDING INTEGRATION

### 1. API Integration
- ⏳ Update `/api/portal/arc/arenas/[slug]/leaderboard.ts`:
  - Call `getSmartFollowers()` for each creator
  - Call `calculateCreatorSignalScore()` for each creator
  - Populate new fields in response

- ⏳ Update `/api/portal/arc/leaderboard/[projectId].ts`:
  - Add same Smart Followers + Signal Score fields

- ⏳ Update `/api/portal/sentiment/index.ts` or create new endpoint:
  - Add `mindshare_bps` per window (24h, 48h, 7d, 30d)
  - Add `delta_bps_1d`, `delta_bps_7d`
  - Add `smart_followers_count`, `smart_followers_pct`, `smart_followers_delta_7d`, `smart_followers_delta_30d`

- ⏳ Update `/api/portal/sentiment/profile/[username].ts` (if exists):
  - Add Smart Followers + deltas

### 2. Graph Ingestion Job (Cron)
- ⏳ Create script: `scripts/smart-followers/ingest-graph.ts`
  - Build tracked universe from:
    - `project_tweets` authors (last 30d)
    - `arena_creators`
    - `creator_manager_creators`
    - `arc_quest_completions`
    - Project official X handles
  - Fetch following lists (if X API available)
  - Store edges in `x_follow_edges` (only if both src and dst in tracked_profiles)

- ⏳ Create script: `scripts/smart-followers/calculate-pagerank.ts`
  - Build directed graph from `x_follow_edges`
  - Run PageRank algorithm
  - Calculate bot risk
  - Calculate smart score = pagerank * (1 - bot_risk)
  - Mark top N or top pct as `is_smart = true`
  - Store in `smart_account_scores`

- ⏳ Create script: `scripts/smart-followers/snapshot.ts`
  - Calculate Smart Followers for all projects and creators
  - Store daily snapshots in `smart_followers_snapshots`

### 3. Mindshare Snapshot Job (Cron)
- ⏳ Create script: `scripts/mindshare/snapshot.ts`
  - Calculate mindshare for all projects per window
  - Normalize to 10,000 bps per window
  - Store snapshots (new table needed: `project_mindshare_snapshots`)
  - Calculate deltas

### 4. UI Integration
- ⏳ Sentiment page (`/portal/sentiment`):
  - Add mindshare_bps column (with window switcher)
  - Add Smart Followers count + growth indicators
  - Add deltas (delta_bps_1d, delta_bps_7d)

- ⏳ ARC Leaderboards (`/portal/arc/leaderboard/[projectId]`, `/portal/arc/[slug]/arena/[arenaSlug]`):
  - Add Smart Followers column
  - Add Trust Band badge (A/B/C/D)
  - Add Signal Score display

- ⏳ Creator Profile (`/portal/arc/creator/[twitterUsername]`):
  - Add Smart Followers count + deltas

- ⏳ Project Pages (`/portal/arc/[slug]`):
  - Add Active Quests panel (right rail desktop, collapsible mobile)

### 5. Tests
- ⏳ Unit tests:
  - `sum(mindshare_bps) == 10000` per window
  - Identical attention_value → identical bps (with remainder distribution)
  - Log scaling prevents whale domination
  - Bot penalty reduces score
  - Smart followers count equals incoming smart edges

- ⏳ API contract tests:
  - Response includes all new fields
  - Field types match interface

---

## 🔧 REQUIRED ENV VARS

### Smart Followers
```
SMART_FOLLOWERS_TOP_N=1000                    # Top N accounts marked as smart
SMART_FOLLOWERS_TOP_PCT=0.1                  # Top 10% marked as smart
BOT_RISK_THRESHOLD=0.5                        # Bot risk threshold
MIN_ACCOUNT_AGE_DAYS=90                       # Minimum account age
```

### Mindshare
```
MINDSHARE_W1_POSTS=0.25                       # Weight for posts/mentions
MINDSHARE_W2_CREATORS=0.25                    # Weight for unique creators
MINDSHARE_W3_ENGAGEMENT=0.30                  # Weight for engagement
MINDSHARE_W4_CT_HEAT=0.20                     # Weight for CT heat

MINDSHARE_CREATOR_ORG_FLOOR=0.5               # Creator organic score floor
MINDSHARE_CREATOR_ORG_CAP=1.5                 # Creator organic score cap
MINDSHARE_AUDIENCE_ORG_FLOOR=0.5              # Audience organic score floor
MINDSHARE_AUDIENCE_ORG_CAP=1.5                # Audience organic score cap
MINDSHARE_ORIGINALITY_FLOOR=0.7               # Originality score floor
MINDSHARE_ORIGINALITY_CAP=1.3                 # Originality score cap
MINDSHARE_SENTIMENT_FLOOR=0.8                 # Sentiment multiplier floor
MINDSHARE_SENTIMENT_CAP=1.2                   # Sentiment multiplier cap
MINDSHARE_SMART_FOLLOWERS_FLOOR=1.0           # Smart followers boost floor
MINDSHARE_SMART_FOLLOWERS_CAP=1.5             # Smart followers boost cap
```

### Signal Score
```
SIGNAL_RECENCY_HALFLIFE_24H=12                # Half-life in hours for 24h window
SIGNAL_RECENCY_HALFLIFE_7D=84                 # Half-life in hours for 7d window
SIGNAL_RECENCY_HALFLIFE_30D=360               # Half-life in hours for 30d window

SIGNAL_CONTENT_WEIGHT_THREAD=2.0              # Thread content weight
SIGNAL_CONTENT_WEIGHT_ANALYSIS=1.8            # Analysis content weight
SIGNAL_CONTENT_WEIGHT_MEME=0.8                # Meme content weight
SIGNAL_CONTENT_WEIGHT_QUOTE_RT=1.0            # Quote RT content weight
SIGNAL_CONTENT_WEIGHT_RETWEET=0.3             # Retweet content weight
SIGNAL_CONTENT_WEIGHT_REPLY=0.5               # Reply content weight

SIGNAL_AUTH_WEIGHT_FLOOR=0.5                  # Authenticity weight floor
SIGNAL_AUTH_WEIGHT_CAP=2.0                    # Authenticity weight cap
SIGNAL_SENTIMENT_WEIGHT_FLOOR=0.7             # Sentiment weight floor
SIGNAL_SENTIMENT_WEIGHT_CAP=1.3               # Sentiment weight cap
SIGNAL_JOIN_WEIGHT_MAX=1.5                    # Join weight maximum

SIGNAL_TRUST_BAND_A_MIN=80                    # Trust band A minimum
SIGNAL_TRUST_BAND_B_MIN=60                    # Trust band B minimum
SIGNAL_TRUST_BAND_C_MIN=40                    # Trust band C minimum
```

**Where to set:** Vercel Environment Variables (for API routes) and Supabase Secrets (for cron jobs)

---

## 📝 NEXT STEPS

1. **Run DB Migration:**
   ```sql
   -- Execute in Supabase SQL Editor:
   -- supabase/migrations/20250129_add_smart_followers_tables.sql
   ```

2. **Integrate Smart Followers into Leaderboard API:**
   - Import `getSmartFollowers` in leaderboard endpoints
   - Call for each creator
   - Populate response fields

3. **Integrate Signal Score into Leaderboard API:**
   - Import `calculateCreatorSignalScore`
   - Build `CreatorPostMetrics[]` from `project_tweets`
   - Call for each creator
   - Populate response fields

4. **Create Graph Ingestion Cron Job:**
   - Build tracked universe
   - Fetch following lists (if available)
   - Store edges

5. **Create PageRank Calculation Cron Job:**
   - Run PageRank on graph
   - Calculate bot risk
   - Mark smart accounts

6. **Create Snapshot Cron Jobs:**
   - Smart Followers snapshots (daily)
   - Mindshare snapshots (per window, daily)

7. **Update UI Components:**
   - Add new columns/fields to leaderboards
   - Add mindshare display to sentiment page
   - Add Smart Followers to creator profiles

8. **Add Tests:**
   - Unit tests for calculations
   - API contract tests

---

## 🚨 SECURITY NOTES

- ✅ All weights, thresholds, floors, caps are in env vars (not committed)
- ✅ No raw scoring internals returned to client
- ✅ Only public-safe derived fields exposed (mindshare_bps, signal_score, trust_band)
- ✅ Server-side only modules marked with ⚠️ CONFIDENTIAL

---

## 📊 FILES CREATED

1. `supabase/migrations/20250129_add_smart_followers_tables.sql`
2. `src/server/smart-followers/calculate.ts`
3. `src/server/mindshare/calculate.ts`
4. `src/server/arc/signal-score.ts`
5. `ARC_GROUND_TRUTH_INVENTORY.md`
6. `ARC_IMPLEMENTATION_STATUS.md` (this file)

---

**Last Updated:** 2025-01-29  
**Status:** Core systems ready - Integration and cron jobs pending

