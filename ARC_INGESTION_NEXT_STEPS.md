# ARC Ingestion - Next Steps Guide

## ✅ Current Status

All migrations have been successfully deployed:
- ✅ Meta column added to `arc_contributions`
- ✅ Avatar backfill and guardrails in place
- ✅ Ingestion function `ingest_sentiment_to_arc` created
- ✅ Seed script ready (optional)

## Step 1: Test Manual Seed (Optional - Recommended)

Test the seed script to verify everything works:

```sql
-- Run the seed script
\i supabase/migrations/20250209_seed_arena_manual_test_data.sql
```

**Verify the results:**
```sql
-- Check creators were inserted
SELECT 
  ac.twitter_username,
  ac.arc_points,
  ac.ring,
  COUNT(contrib.id) as contribution_count,
  SUM(
    COALESCE(
      (contrib.meta->>'points')::NUMERIC,
      (contrib.engagement_json->>'points')::NUMERIC,
      0
    )
  ) as total_points
FROM arena_creators ac
LEFT JOIN arc_contributions contrib ON 
  contrib.arena_id = ac.arena_id 
  AND contrib.twitter_username = ac.twitter_username
WHERE ac.arena_id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26'
GROUP BY ac.id, ac.twitter_username, ac.arc_points, ac.ring
ORDER BY ac.arc_points DESC;
```

**Expected:** 4 creators (muazxinthi, beemzzllx, truunik, hopesvl) with 3 contributions each, totaling 35 points per creator.

## Step 2: Test Ingestion Function Manually

Test the ingestion function with a real arena:

```sql
-- Replace with your actual arena_id and project_id
SELECT * FROM ingest_sentiment_to_arc(
  'f16454be-b0fd-471e-8b84-fc2a8d615c26'::UUID, -- arena_id
  'YOUR_PROJECT_ID'::UUID, -- project_id (get from arenas table)
  NULL -- since timestamp (defaults to arena.starts_at)
);
```

**Expected output:**
```
creators_processed | contributions_inserted | profiles_created | errors
-------------------+------------------------+------------------+--------
        15         |          42            |        3         |  {}
```

## Step 3: Integrate into Approval Flow (Critical)

This is the **most important step** - it enables auto-population when projects are approved.

### Option A: Add to Leaderboard Approval Endpoint

**File:** `src/web/pages/api/portal/arc/admin/approve-leaderboard.ts` (or similar)

**Add this code after approving the leaderboard:**

```typescript
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// After approving leaderboard request
async function onLeaderboardApproved(projectId: string, arenaId: string) {
  const supabase = getSupabaseAdmin();
  
  // Get arena to find starts_at
  const { data: arena, error: arenaError } = await supabase
    .from('arenas')
    .select('starts_at')
    .eq('id', arenaId)
    .single();
  
  if (arenaError || !arena) {
    console.error('[Ingest] Error fetching arena:', arenaError);
    return; // Don't fail approval if ingestion fails
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
      creators: data?.[0]?.creators_processed || 0,
      contributions: data?.[0]?.contributions_inserted || 0,
      profiles: data?.[0]?.profiles_created || 0,
      errors: data?.[0]?.errors || []
    });
  }
}
```

### Option B: Create Manual Trigger API (For Testing)

**File:** `src/web/pages/api/portal/admin/arc/ingest-sentiment.ts` (new file)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const portalUser = await requirePortalUser(req, res);
  if (!portalUser) return;

  // TODO: Add super admin check here
  // if (!isSuperAdmin(portalUser)) {
  //   return res.status(403).json({ ok: false, error: 'Forbidden' });
  // }

  const { arenaId, projectId, since } = req.query;

  if (!arenaId || !projectId) {
    return res.status(400).json({
      ok: false,
      error: 'arenaId and projectId required as query parameters'
    });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('ingest_sentiment_to_arc', {
    p_arena_id: arenaId as string,
    p_project_id: projectId as string,
    p_since: since ? new Date(since as string).toISOString() : null
  });

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      details: error
    });
  }

  return res.status(200).json({
    ok: true,
    result: data?.[0] || {
      creators_processed: 0,
      contributions_inserted: 0,
      profiles_created: 0,
      errors: []
    }
  });
}
```

**Usage:**
```bash
curl -X POST "https://akarimystic.club/api/portal/admin/arc/ingest-sentiment?arenaId=xxx&projectId=yyy" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

## Step 4: Set Up Scheduled Job (Optional)

For periodic syncing of new contributions, create a cron endpoint:

**File:** `src/web/pages/api/portal/cron/ingest-sentiment-to-arc.ts` (new file)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify CRON_SECRET
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();

  // Find active arenas that need ingestion
  const { data: arenas, error: arenasError } = await supabase
    .from('arenas')
    .select('id, project_id, starts_at, status')
    .eq('status', 'active')
    .not('starts_at', 'is', null);

  if (arenasError) {
    return res.status(500).json({
      ok: false,
      error: arenasError.message
    });
  }

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

**Vercel Cron Configuration** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/portal/cron/ingest-sentiment-to-arc?secret=YOUR_CRON_SECRET",
    "schedule": "0 * * * *"
  }]
}
```

This runs every hour. Adjust schedule as needed.

## Step 5: Monitor and Verify

### Check Ingestion Stats

```sql
-- View recent ingestion results
SELECT 
  arena_id,
  COUNT(DISTINCT twitter_username) as creators,
  COUNT(*) as contributions,
  SUM(
    COALESCE(
      (meta->>'points')::NUMERIC,
      (engagement_json->>'points')::NUMERIC,
      0
    )
  ) as total_points
FROM arc_contributions
WHERE meta->>'source' = 'sentiment_ingestion'
   OR engagement_json->>'source' = 'sentiment_ingestion'
GROUP BY arena_id
ORDER BY total_points DESC;
```

### Check Arena Creators

```sql
-- View arena creators with their points
SELECT 
  ac.twitter_username,
  ac.arc_points,
  ac.ring,
  COUNT(contrib.id) as contribution_count
FROM arena_creators ac
LEFT JOIN arc_contributions contrib ON 
  contrib.arena_id = ac.arena_id 
  AND contrib.twitter_username = ac.twitter_username
WHERE ac.arena_id = 'YOUR_ARENA_ID'
GROUP BY ac.id, ac.twitter_username, ac.arc_points, ac.ring
ORDER BY ac.arc_points DESC
LIMIT 50;
```

## Summary Checklist

- [ ] ✅ All migrations deployed
- [ ] Test manual seed (optional)
- [ ] Test ingestion function manually
- [ ] Integrate into approval flow (Step 3)
- [ ] Test auto-population on approval
- [ ] Set up scheduled job (optional, Step 4)
- [ ] Monitor results and adjust as needed

## Troubleshooting

### No Creators Appearing

1. Check if `project_tweets` has data:
   ```sql
   SELECT COUNT(*) 
   FROM project_tweets 
   WHERE project_id = 'YOUR_PROJECT_ID' 
     AND is_official = false;
   ```

2. Check if arena exists and is active:
   ```sql
   SELECT id, project_id, status, starts_at 
   FROM arenas 
   WHERE id = 'YOUR_ARENA_ID';
   ```

3. Check function logs (if available in Supabase dashboard)

### Points Not Calculating

1. Verify contributions have points:
   ```sql
   SELECT 
     post_id,
     meta->>'points' as meta_points,
     engagement_json->>'points' as json_points
   FROM arc_contributions
   WHERE arena_id = 'YOUR_ARENA_ID'
   LIMIT 10;
   ```

2. Recompute points manually:
   ```sql
   UPDATE arena_creators ac
   SET arc_points = COALESCE((
     SELECT SUM(
       COALESCE(
         (meta->>'points')::NUMERIC,
         (engagement_json->>'points')::NUMERIC,
         0
       )
     )
     FROM arc_contributions contrib
     WHERE contrib.arena_id = ac.arena_id
       AND contrib.twitter_username = ac.twitter_username
   ), 0)
   WHERE ac.arena_id = 'YOUR_ARENA_ID';
   ```

## Next: Auto-Population is Ready! 🎉

Once Step 3 is complete, **no more manual seeding needed**. The system will automatically:
- ✅ Ingest contributors when projects are approved
- ✅ Sync new contributions periodically (if cron is set up)
- ✅ Keep arena leaderboards up-to-date

See `ARC_SENTIMENT_INGESTION_IMPLEMENTATION.md` for detailed integration examples.
