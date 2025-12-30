# ARC Leaderboard Truth Table

**Evidence-Based Mapping:** Route → API → Tables → Functions → Output

---

## Option 2: Mindshare Leaderboard

### Route 1: `/portal/arc/[slug]/arena/[arenaSlug]` (PRIMARY)

**UI File:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

**API Called:**
- **Endpoint:** `GET /api/portal/arc/arenas/[slug]/leaderboard?page=1`
- **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
- **Line:** 447-449 (fetch call)

**Tables Read (Evidence):**
1. `arenas` - Line 393-397: Find arena by slug
2. `projects` - Line 404-408: Get project for access check
3. `project_tweets` - Line 254: Calculate auto-tracked points
4. `arena_creators` - Line 580: Get joined creators (for multiplier)
5. `profiles` - Line 659-662: Get avatar URLs
6. `smart_account_scores` - Line 173: Get smart score (for signal calculation)

**Scoring Functions (Evidence):**

1. **`calculateAutoTrackedPoints()`**
   - **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - **Lines:** 239-366
   - **Input:** `projectId: string`
   - **Reads:** `project_tweets` where `is_official = false`
   - **Calculation:**
     ```typescript
     // Line 222: engagement = likes + replies*2 + retweets*3
     const engagement = (mention.likes || 0) + (mention.replies || 0) * 2 + (mention.retweets || 0) * 3;
     // Line 224: Aggregate per creator
     basePoints += engagement;
     ```
   - **Also calculates (lines 275-366):**
     - `sentiment`: Average sentiment score
     - `ctHeat`: CT Heat score (recency-weighted)
     - `signal`: Signal score (threader/video with engagement > 10)
     - `noise`: Noise score (engagement < 5 or sentiment < 30)
     - `engagementTypes`: { threader, video, clipper, meme } counts
     - `mindshare`: Total mindshare points
   - **Output:** `Map<username, { basePoints, sentiment, ctHeat, signal, noise, engagementTypes, mindshare }>`

2. **Multiplier Application**
   - **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - **Line:** 747
   - **Code:**
     ```typescript
     const multiplier = (isJoined && followVerified) ? 1.5 : 1.0;
     const score = data.basePoints * multiplier;
     ```
   - **Evidence:** Line 747 shows exact multiplier logic

3. **Merging Joined + Auto-Tracked**
   - **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - **Lines:** 741-824
   - **Logic:**
     - Line 576: Calculate auto-tracked points
     - Line 580: Get joined creators from `arena_creators`
     - Line 741-748: For each auto-tracked username:
       - Check if joined (line 742)
       - If joined: use joined data, apply multiplier if follow verified (line 747)
       - If not joined: use auto-tracked only, multiplier = 1.0
   - **Evidence:** Lines 741-824 show complete merging logic

4. **Signal/Noise Calculation**
   - **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
   - **Lines:** 779-797
   - **Function:** `calculateCreatorSignalScore()` from `@/server/arc/signal-score`
   - **Input:** `CreatorPostMetrics[]` (from `buildCreatorPostMetrics()`)
   - **Called:** Per creator, after merging
   - **Evidence:** Line 785 shows function call, line 15 shows import

**Output Fields (Evidence from lines 799-823):**
```typescript
{
  rank: number,                    // Set after sorting (line 830-832)
  twitter_username: string,        // Line 801
  avatar_url: string | null,       // Line 802
  base_points: number,              // Line 803
  multiplier: number,               // Line 804
  score: number,                    // Line 805 (base_points * multiplier)
  is_joined: boolean,               // Line 806
  follow_verified: boolean,         // Line 807
  ring: 'core'|'momentum'|'discovery'|null, // Line 808
  joined_at: string | null,         // Line 809
  sentiment: number | null,         // Line 811
  ct_heat: number | null,           // Line 812
  signal: number | null,             // Line 813
  noise: number | null,              // Line 814
  engagement_types: {...},          // Line 815
  mindshare: number,                // Line 816
  smart_followers_count: number | null,    // Line 818
  smart_followers_pct: number | null,     // Line 819
  signal_score: number | null,      // Line 821
  trust_band: 'A'|'B'|'C'|'D'|null // Line 822
}
```

---

### Route 2: `/portal/arc/leaderboard/[projectId]`

**UI File:** `src/web/pages/portal/arc/leaderboard/[projectId].tsx`

**API Called:**
- **Endpoint:** `GET /api/portal/arc/leaderboard/[projectId]`
- **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
- **Line:** 269 (fetch call)

**Tables Read (Evidence):**
1. `projects` - Line 53: Get project
2. `arenas` - Line 272: Find active arena
3. `arena_creators` - Line 299: Get joined creators
4. `project_tweets` - Line 205: Calculate auto-tracked points
5. `profiles` - Line 507: Get avatar URLs
6. `smart_account_scores` - Line 133: Get smart score

**Scoring Functions (Evidence):**

1. **`calculateAutoTrackedPoints()`**
   - **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - **Lines:** 199-228
   - **Same calculation as Route 1** - engagement = likes + replies*2 + retweets*3

2. **Multiplier Application**
   - **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - **Line:** 366
   - **Code:**
     ```typescript
     const multiplier = followVerified ? 1.5 : 1.0;
     const score = Math.floor(basePoints * multiplier);
     ```
   - **Note:** Only for joined creators (auto-tracked get 1.0x)

3. **Merging Logic**
   - **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - **Lines:** 340-488
   - **Step 1 (lines 340-423):** Process joined creators
     - Base points = `arc_points + adjustments` (line 364)
     - Apply multiplier if follow verified (line 366)
   - **Step 2 (lines 425-488):** Add auto-tracked
     - If not already joined: add as new entry with `multiplier = 1.0` (line 470)
     - If already joined: add auto-tracked points to `base_points`, recalculate score (lines 483-486)
   - **Evidence:** Lines 483-486 show merging:
     ```typescript
     entry.base_points += points;
     entry.score = Math.floor(entry.base_points * entry.multiplier);
     ```

4. **Signal/Noise Calculation**
   - **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
   - **Lines:** 391-398 (joined), 450-457 (auto-tracked)
   - **Function:** `calculateCreatorSignalScore()` (imported line 20)

**Output Fields (Evidence from lines 406-422, 465-481):**
```typescript
{
  twitter_username: string,
  avatar_url: string | null,
  rank: number,
  base_points: number,
  multiplier: number,
  score: number,
  is_joined: boolean,
  is_auto_tracked: boolean,  // Different from Route 1
  follow_verified: boolean,
  ring: 'core'|'momentum'|'discovery'|null,
  joined_at: string | null,
  smart_followers_count: number | null,
  smart_followers_pct: number | null,
  signal_score: number | null,
  trust_band: 'A'|'B'|'C'|'D'|null
}
```

---

## Option 3: Gamified

### Route: `/portal/arc/gamified/[projectId]` (LEGACY - routes to arena now)

**UI File:** `src/web/pages/portal/arc/gamified/[projectId].tsx`

**API Called:**
- **Endpoint:** `GET /api/portal/arc/gamified/[projectId]`
- **File:** `src/web/pages/api/portal/arc/gamified/[projectId].ts`
- **Line:** 199 (fetch call)

**Tables Read (Evidence):**
1. `projects` - Get project
2. `arenas` - Line 91-98: Find active arena
3. `arena_creators` - Line 118: Get joined creators
4. `project_tweets` - (via leaderboard calculation reuse)
5. `arc_quests` - Line 197-201: Get quests for arena

**Scoring Functions:**
- **Reuses:** Same as Option 2 leaderboard calculation
- **Additional:** Fetches `arc_quests` for quest list

**Output Fields:**
- Same as Option 2 leaderboard entries
- Plus: `quests: Quest[]` array

---

## Signal/Noise Calculation Details

**Function:** `calculateCreatorSignalScore()`

**File:** `src/server/arc/signal-score.ts`

**Import Evidence:**
- `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts` line 15
- `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` line 20

**Input:** `CreatorPostMetrics[]` (from `buildCreatorPostMetrics()`)

**Called:** Per creator, after merging joined + auto-tracked

**Output:** `{ signal_score: number, trust_band: 'A'|'B'|'C'|'D' }`

**Evidence:** Function exists and is imported (verified via grep)

---

## Summary

**Engagement Points Formula (PROVEN):**
```typescript
engagement = likes + (replies * 2) + (retweets * 3)
```
**Evidence:** Line 222 in `arenas/[slug]/leaderboard.ts`, Line 222 in `leaderboard/[projectId].ts`

**Multiplier Formula (PROVEN):**
```typescript
multiplier = (isJoined && followVerified) ? 1.5 : 1.0
score = base_points * multiplier
```
**Evidence:** Line 747 in `arenas/[slug]/leaderboard.ts`, Line 366 in `leaderboard/[projectId].ts`

**Merging Logic (PROVEN):**
- Joined creators: Use `arena_creators.arc_points` + adjustments, apply multiplier
- Auto-tracked: Use `project_tweets` engagement, multiplier = 1.0
- If both exist: Add auto-tracked to joined base_points, recalculate score
**Evidence:** Lines 741-824 in `arenas/[slug]/leaderboard.ts`, Lines 340-488 in `leaderboard/[projectId].ts`

**Signal/Noise (PROVEN):**
- Function exists: `calculateCreatorSignalScore()` imported
- Called per creator after merging
- Uses `CreatorPostMetrics[]` from `buildCreatorPostMetrics()`
**Evidence:** Import statements, function calls in code

