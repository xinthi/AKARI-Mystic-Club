# ARC Ingestion - Correct Deployment Order

## ⚠️ Important: Run Migrations in This Exact Order

The migrations have dependencies. Run them in this order to avoid errors:

### Step 1: Add Meta Column (Required First)
```sql
-- Run this FIRST
\i supabase/migrations/20250209_add_meta_column_to_contributions.sql
```

**Why first?** The seed script and ingestion function need the `meta` column to exist.

### Step 2: Avatar Backfill & Guardrails
```sql
-- Run this second
\i supabase/migrations/20250209_avatar_backfill_and_guardrails.sql
```

**Why second?** Sets up guardrails before we start inserting data.

### Step 3: Ingestion Function
```sql
-- Run this third
\i supabase/migrations/20250209_add_ingest_sentiment_to_arc_function.sql
```

**Why third?** Function needs meta column to exist (though it has fallback).

### Step 4: Manual Seed (Optional - for testing)
```sql
-- Run this last (optional, for testing only)
\i supabase/migrations/20250209_seed_arena_manual_test_data.sql
```

**Why last?** Needs meta column and function to be set up.

### Step 5: Optional Points Column (Optional - future enhancement)
```sql
-- Run this only if you want a dedicated points column
\i supabase/migrations/20250209_OPTIONAL_add_points_column_to_contributions.sql
```

## Quick Fix for Current Errors

If you've already run some migrations and got errors, run this first:

```sql
-- Add meta column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arc_contributions' AND column_name = 'meta'
  ) THEN
    ALTER TABLE arc_contributions 
    ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
```

Then re-run the migrations in order above.

## Verification

After running all migrations, verify:

```sql
-- Check meta column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'arc_contributions' AND column_name = 'meta';

-- Check function exists
\df ingest_sentiment_to_arc

-- Check triggers exist
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name IN (
  'trigger_prevent_avatar_null_overwrite',
  'trigger_prevent_twitter_username_overwrite'
);
```

## Auto-Population (Future)

Once migrations are deployed, the `ingest_sentiment_to_arc` function will automatically populate arenas when:
1. A project's leaderboard is approved (integrate into approval endpoint)
2. A scheduled job runs (set up cron)
3. Manually triggered via admin API

See `ARC_SENTIMENT_INGESTION_IMPLEMENTATION.md` for integration details.
