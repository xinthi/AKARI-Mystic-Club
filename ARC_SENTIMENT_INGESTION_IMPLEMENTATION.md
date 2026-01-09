# ARC Sentiment Ingestion Implementation Plan

## Overview

This document describes how to automatically ingest qualified contributors from Sentiment tables into ARC when a project's leaderboard is approved.

## Goal A: Manual Seed (✅ Complete)

**File:** `supabase/migrations/20250209_seed_arena_manual_test_data.sql`

**Usage:**
```sql
-- Run in Supabase SQL Editor
\i supabase/migrations/20250209_seed_arena_manual_test_data.sql
```

**What it does:**
1. Upserts profiles for test handles: `['muazxinthi', 'beemzzllx', 'truunik', 'hopesvl']`
2. Inserts creators into `arena_creators` for arena `f16454be-b0fd-471e-8b84-fc2a8d615c26`
3. Inserts 3 test contributions per creator into `arc_contributions` with points (10, 20, 5)
4. Updates `arena_creators.arc_points` as SUM of contribution points

**Idempotent:** Safe to run multiple times (uses `ON CONFLICT` and deterministic `seed_key` in meta)

## Goal B: Real Ingestion (Implementation Plan)

### Database Function

**File:** `supabase/migrations/20250209_add_ingest_sentiment_to_arc_function.sql`

**Function Signature:**
```sql
ingest_sentiment_to_arc(
  p_arena_id UUID,
  p_project_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  creators_processed INTEGER,
  contributions_inserted INTEGER,
  profiles_created INTEGER,
  errors TEXT[]
)
```

### How It Works

1. **Query Sentiment Source Tables:**
   - Queries `project_tweets` for non-official tweets (mentions) since `p_since` (default: arena.starts_at)
   - Quality threshold: `author_handle IS NOT NULL AND author_handle != ''`

2. **Normalize Handles:**
   - Uses `normalize_username()` helper: `lower(trim(regexp_replace(username, '^@+', '', 'g')))`
   - Tolerates leading `@` and case variations

3. **Upsert Profiles:**
   - Finds existing profile by normalized username
   - Prefers canonical lowercase profile (`username = lower(trim(username))`)
   - Creates minimal profile if missing (never creates duplicates)
   - Updates `profile_image_url` if NULL and we have one from tweet

4. **Insert/Update Arena Creators:**
   - Uses `ON CONFLICT (arena_id, twitter_username)` for idempotency
   - Sets `profile_id` if available
   - Default ring: `'discovery'` (can be enhanced based on points/engagement)

5. **Insert Contributions:**
   - Uses deterministic uniqueness: `UNIQUE (project_id, post_id)`
   - Stores points in `meta->>'points'` (calculated from engagement)
   - Formula: `likes + replies*2 + retweets*3` (matches quest leaderboard)
   - Stores source marker: `meta->>'source' = 'sentiment_ingestion'`

6. **Recompute Points:**
   - Updates `arena_creators.arc_points` as `SUM(meta->>'points')` from contributions

### Guardrails

✅ **Never overwrite non-empty `projects.twitter_username`** (trigger enforced)
✅ **Never overwrite non-null `profile_image_url` with NULL** (trigger enforced)
✅ **Prefer canonical lowercase profile** when duplicates exist
✅ **Deterministic uniqueness** prevents duplicate contributions

### Triggering the Function

#### Option 1: On Leaderboard Approval (Recommended)

**Location:** `src/web/pages/api/portal/arc/admin/approve-leaderboard.ts` or similar

**Pseudocode:**
```typescript
// After approving leaderboard request
async function onLeaderboardApproved(projectId: string, arenaId: string) {
  const supabase = getSupabaseAdmin();
  
  // Get arena to find starts_at
  const { data: arena } = await supabase
    .from('arenas')
    .select('starts_at')
    .eq('id', arenaId)
    .single();
  
  if (!arena) {
    throw new Error('Arena not found');
  }
  
  // Call ingestion function
  const { data, error } = await supabase.rpc('ingest_sentiment_to_arc', {
    p_arena_id: arenaId,
    p_project_id: projectId,
    p_since: arena.starts_at || null
  });
  
  if (error) {
    console.error('[Ingest] Error:', error);
    // Log but don't fail approval
  } else {
    console.log('[Ingest] Success:', {
      creators: data[0]?.creators_processed,
      contributions: data[0]?.contributions_inserted,
      profiles: data[0]?.profiles_created,
      errors: data[0]?.errors
    });
  }
}
```

#### Option 2: Scheduled Job (Cron)

**Location:** `src/web/pages/api/portal/cron/ingest-sentiment-to-arc.ts` (new file)

**Pseudocode:**
```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify CRON_SECRET
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  
  const supabase = getSupabaseAdmin();
  
  // Find active arenas that need ingestion
  const { data: arenas } = await supabase
    .from('arenas')
    .select('id, project_id, starts_at, status')
    .eq('status', 'active')
    .not('starts_at', 'is', null);
  
  const results = [];
  
  for (const arena of arenas || []) {
    try {
      const { data, error } = await supabase.rpc('ingest_sentiment_to_arc', {
        p_arena_id: arena.id,
        p_project_id: arena.project_id,
        p_since: arena.starts_at
      });
      
      results.push({
        arena_id: arena.id,
        project_id: arena.project_id,
        success: !error,
        result: data?.[0],
        error: error?.message
      });
    } catch (err: any) {
      results.push({
        arena_id: arena.id,
        project_id: arena.project_id,
        success: false,
        error: err.message
      });
    }
  }
  
  return res.status(200).json({
    ok: true,
    processed: arenas?.length || 0,
    results
  });
}
```

**Schedule:** Run every hour or daily via Vercel Cron or external scheduler

#### Option 3: Manual Trigger (Admin API)

**Location:** `src/web/pages/api/portal/admin/arc/ingest-sentiment.ts` (new file)

**Endpoint:** `POST /api/portal/admin/arc/ingest-sentiment?arenaId=xxx&projectId=xxx`

**Usage:**
```bash
curl -X POST "https://akarimystic.club/api/portal/admin/arc/ingest-sentiment?arenaId=f16454be-b0fd-471e-8b84-fc2a8d615c26&projectId=xxx" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

### Required Queries for Ingestion

The function queries `project_tweets` with these filters:

```sql
SELECT 
  pt.tweet_id,
  pt.author_handle,
  pt.created_at,
  pt.text,
  pt.likes,
  pt.replies,
  pt.retweets,
  pt.quote_count,
  pt.sentiment_score,
  pt.author_profile_image_url
FROM project_tweets pt
WHERE pt.project_id = p_project_id
  AND pt.is_official = false  -- Only mentions, not official tweets
  AND pt.created_at >= v_since_timestamp
  AND pt.author_handle IS NOT NULL
  AND pt.author_handle != ''
ORDER BY pt.created_at DESC
```

**Indexes Added:**
- `idx_project_tweets_project_created_author` on `(project_id, created_at DESC, author_handle)` where `is_official = false`

### Points Calculation

**Current Formula (Simple):**
```sql
points = likes + replies*2 + retweets*3
```

**Future Enhancement (Full ARC Formula):**
Should use the full ARC scoring formula from `src/web/lib/arc/scoring.ts`:
```typescript
base * sentiment_multiplier * (1 + engagement_bonus)
where engagement_bonus = log2(likes + retweets*2 + quotes*3 + replies*4 + 1) / 4
```

**To Enhance:**
1. Add `points` column to `arc_contributions` table
2. Update function to calculate using full formula
3. Store base points, multipliers, and final points separately

### Ring Assignment

**Current:** Default `'discovery'` for all creators

**Future Enhancement:**
- `'core'`: Top 10% by points
- `'momentum'`: Next 20% by points
- `'discovery'`: Remaining 70%

**To Enhance:**
Add ring calculation after points are computed:
```sql
WITH ranked_creators AS (
  SELECT 
    id,
    arc_points,
    PERCENT_RANK() OVER (ORDER BY arc_points DESC) as percentile
  FROM arena_creators
  WHERE arena_id = p_arena_id
)
UPDATE arena_creators ac
SET ring = CASE
  WHEN rc.percentile <= 0.1 THEN 'core'
  WHEN rc.percentile <= 0.3 THEN 'momentum'
  ELSE 'discovery'
END
FROM ranked_creators rc
WHERE ac.id = rc.id;
```

## Goal C: Avatar Backfill (✅ Complete)

**File:** `supabase/migrations/20250209_avatar_backfill_and_guardrails.sql`

**What it does:**
1. **Backfill Query:** Fills missing `profile_image_url` from duplicates of same normalized username
   - Prefers canonical lowercase profile
   - Prefers most recently updated
   - Only fills if currently NULL or empty

2. **Guardrail Triggers:**
   - `prevent_avatar_null_overwrite`: Prevents overwriting non-null `profile_image_url` with NULL
   - `prevent_twitter_username_overwrite`: Prevents overwriting non-empty `projects.twitter_username`

**Usage:**
```sql
-- Run in Supabase SQL Editor
\i supabase/migrations/20250209_avatar_backfill_and_guardrails.sql
```

## Deployment Steps

### 1. Run Migrations

```bash
# In Supabase Dashboard > SQL Editor, run in order:
1. supabase/migrations/20250209_seed_arena_manual_test_data.sql (optional, for testing)
2. supabase/migrations/20250209_add_ingest_sentiment_to_arc_function.sql
3. supabase/migrations/20250209_avatar_backfill_and_guardrails.sql
```

### 2. Test Manual Seed (Optional)

```sql
-- Verify seed data
SELECT 
  ac.twitter_username,
  ac.arc_points,
  ac.ring,
  COUNT(contrib.id) as contribution_count
FROM arena_creators ac
LEFT JOIN arc_contributions contrib ON 
  contrib.arena_id = ac.arena_id 
  AND contrib.twitter_username = ac.twitter_username
WHERE ac.arena_id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26'
GROUP BY ac.id, ac.twitter_username, ac.arc_points, ac.ring
ORDER BY ac.arc_points DESC;
```

### 3. Test Ingestion Function

```sql
-- Test ingestion for an arena
SELECT * FROM ingest_sentiment_to_arc(
  'f16454be-b0fd-471e-8b84-fc2a8d615c26'::UUID, -- arena_id
  'YOUR_PROJECT_ID'::UUID, -- project_id
  NULL -- since (defaults to arena.starts_at)
);
```

### 4. Integrate into Approval Flow

Add call to `ingest_sentiment_to_arc` in the leaderboard approval endpoint (see Option 1 above).

### 5. Set Up Scheduled Job (Optional)

Create cron job to run ingestion periodically for active arenas (see Option 2 above).

## Indexes Added

1. `idx_arena_creators_arena_profile` on `arena_creators(arena_id, profile_id)`
2. `idx_arc_contributions_arena_profile` on `arc_contributions(arena_id, profile_id)`
3. `idx_profiles_username_normalized` on `profiles(lower(trim(username)))`
4. `idx_project_tweets_project_created_author` on `project_tweets(project_id, created_at DESC, author_handle)` where `is_official = false`

## Constraints and Safety

✅ **Idempotent:** Safe to run multiple times
✅ **Deterministic Uniqueness:** Uses `(project_id, post_id)` for contributions
✅ **Guardrails:** Triggers prevent data loss
✅ **Case-Insensitive:** Handles username variations
✅ **Profile Preservation:** Never overwrites existing non-empty data

## Future Enhancements

1. **Full ARC Scoring:** Use complete formula from `scoring.ts`
2. **Ring Assignment:** Auto-assign rings based on percentile
3. **Style Detection:** Classify creators as 'threader', 'video', 'clipper', 'meme'
4. **Incremental Updates:** Only process new tweets since last ingestion
5. **Quality Thresholds:** Filter by engagement/sentiment thresholds
6. **Batch Processing:** Process in chunks for large projects

## Monitoring

**Key Metrics to Track:**
- Number of creators processed per ingestion
- Number of contributions inserted
- Number of profiles created
- Error rate and types
- Processing time

**Logging:**
The function returns errors in the `errors` array. Log these in your application for monitoring.
