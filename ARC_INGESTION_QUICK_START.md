# ARC Sentiment Ingestion - Quick Start Guide

## Prerequisites

- Supabase database access
- SQL Editor access in Supabase Dashboard

## Step 1: Run Migrations

Run these migrations in order in Supabase SQL Editor:

### 1.1 Manual Seed (Optional - for testing)
```sql
-- Copy and paste contents of:
-- supabase/migrations/20250209_seed_arena_manual_test_data.sql
```

**Or run via psql:**
```bash
psql $DATABASE_URL -f supabase/migrations/20250209_seed_arena_manual_test_data.sql
```

### 1.2 Ingestion Function
```sql
-- Copy and paste contents of:
-- supabase/migrations/20250209_add_ingest_sentiment_to_arc_function.sql
```

### 1.3 Avatar Backfill & Guardrails
```sql
-- Copy and paste contents of:
-- supabase/migrations/20250209_avatar_backfill_and_guardrails.sql
```

## Step 2: Verify Setup

### Check Function Exists
```sql
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'ingest_sentiment_to_arc';
```

### Check Indexes Created
```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_arena_creators_arena_profile',
  'idx_arc_contributions_arena_profile',
  'idx_profiles_username_normalized',
  'idx_project_tweets_project_created_author'
);
```

### Check Triggers Created
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_prevent_avatar_null_overwrite',
  'trigger_prevent_twitter_username_overwrite'
);
```

## Step 3: Test Manual Seed (Optional)

```sql
-- Verify seed data was created
SELECT 
  ac.twitter_username,
  ac.arc_points,
  ac.ring,
  COUNT(contrib.id) as contribution_count,
  SUM((contrib.meta->>'points')::NUMERIC) as total_points
FROM arena_creators ac
LEFT JOIN arc_contributions contrib ON 
  contrib.arena_id = ac.arena_id 
  AND contrib.twitter_username = ac.twitter_username
WHERE ac.arena_id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26'
GROUP BY ac.id, ac.twitter_username, ac.arc_points, ac.ring
ORDER BY ac.arc_points DESC;
```

**Expected Result:**
- 4 creators (muazxinthi, beemzzllx, truunik, hopesvl)
- Each with 3 contributions
- Total points: 35 (10 + 20 + 5 per creator)

## Step 4: Test Ingestion Function

```sql
-- Test ingestion for a real arena
SELECT * FROM ingest_sentiment_to_arc(
  'f16454be-b0fd-471e-8b84-fc2a8d615c26'::UUID, -- Replace with your arena_id
  'YOUR_PROJECT_ID'::UUID, -- Replace with your project_id
  NULL -- since timestamp (defaults to arena.starts_at)
);
```

**Expected Output:**
```
creators_processed | contributions_inserted | profiles_created | errors
-------------------+------------------------+------------------+--------
        15         |          42            |        3         |  {}
```

## Step 5: Integrate into Code

### Option A: On Leaderboard Approval

Add to your approval endpoint (e.g., `src/web/pages/api/portal/arc/admin/approve-leaderboard.ts`):

```typescript
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// After approving leaderboard
const { data, error } = await supabase.rpc('ingest_sentiment_to_arc', {
  p_arena_id: arenaId,
  p_project_id: projectId,
  p_since: arena.starts_at || null
});

if (error) {
  console.error('[Ingest] Error:', error);
} else {
  console.log('[Ingest] Success:', data?.[0]);
}
```

### Option B: Manual Trigger API

Create `src/web/pages/api/portal/admin/arc/ingest-sentiment.ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const portalUser = await requirePortalUser(req, res);
  if (!portalUser) return;

  // Check super admin (add your check here)
  
  const { arenaId, projectId, since } = req.query;
  
  if (!arenaId || !projectId) {
    return res.status(400).json({ ok: false, error: 'arenaId and projectId required' });
  }

  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase.rpc('ingest_sentiment_to_arc', {
    p_arena_id: arenaId as string,
    p_project_id: projectId as string,
    p_since: since ? new Date(since as string).toISOString() : null
  });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({
    ok: true,
    result: data?.[0]
  });
}
```

## Step 6: Monitor Results

### Check Ingestion Stats
```sql
-- View recent ingestion results (if you log them)
SELECT 
  arena_id,
  COUNT(DISTINCT twitter_username) as creators,
  COUNT(*) as contributions,
  SUM((meta->>'points')::NUMERIC) as total_points
FROM arc_contributions
WHERE meta->>'source' = 'sentiment_ingestion'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY arena_id;
```

### Check Avatar Backfill
```sql
-- Check profiles still missing avatars
SELECT 
  COUNT(*) as missing_avatars,
  COUNT(DISTINCT lower(trim(regexp_replace(username, '^@+', '', 'g')))) as unique_normalized
FROM profiles
WHERE (profile_image_url IS NULL OR profile_image_url = '')
  AND username IS NOT NULL;
```

## Troubleshooting

### Function Not Found
```sql
-- Check if function exists
\df ingest_sentiment_to_arc
```

### Permission Denied
```sql
-- Grant execute permission
GRANT EXECUTE ON FUNCTION ingest_sentiment_to_arc(UUID, UUID, TIMESTAMPTZ) TO service_role;
```

### Duplicate Contributions
The function uses `ON CONFLICT (project_id, post_id)` to prevent duplicates. If you see duplicates, check:
```sql
-- Find duplicate post_ids
SELECT project_id, post_id, COUNT(*)
FROM arc_contributions
GROUP BY project_id, post_id
HAVING COUNT(*) > 1;
```

### Missing Profiles
```sql
-- Check for profiles that should exist
SELECT DISTINCT twitter_username
FROM arc_contributions
WHERE profile_id IS NULL
  AND arena_id = 'YOUR_ARENA_ID';
```

## Next Steps

1. ✅ Run migrations
2. ✅ Test manual seed (optional)
3. ✅ Test ingestion function
4. ⏳ Integrate into approval flow
5. ⏳ Set up scheduled job (optional)
6. ⏳ Monitor and adjust thresholds

For detailed implementation, see `ARC_SENTIMENT_INGESTION_IMPLEMENTATION.md`.
