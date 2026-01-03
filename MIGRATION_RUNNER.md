# Safe Migration Runner

## Overview

This project uses Supabase migrations stored in `supabase/migrations/`. To run migrations safely without exposing secrets, use one of the methods below.

## ⚠️ Security Note

**NEVER commit or share:**
- `.env` file
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` with passwords
- Any connection strings with credentials

## Method 1: Supabase Dashboard (Recommended - Safest)

This is the safest method as it doesn't require exposing any credentials:

1. **Go to Supabase Dashboard:**
   - Navigate to your project
   - Click **SQL Editor** in the left sidebar

2. **Run migrations:**
   - Click **New Query**
   - Copy the contents of each migration file from `supabase/migrations/`
   - Paste and click **Run**
   - Repeat for each migration file in order

3. **Migration files to run:**
   - `20250202_add_arena_kind_and_constraint.sql` (most recent)
   - `20250131_arc_admin_approve_rpc.sql` (if not already applied)

## Method 2: Supabase CLI (If Installed)

If you have Supabase CLI installed locally:

```bash
# Link to your project (uses Supabase Dashboard login, no keys exposed)
supabase link --project-ref your-project-ref

# Run migrations
supabase migration up
```

**Note:** This requires Supabase CLI to be installed and authenticated via the dashboard.

## Method 3: Manual SQL Execution (For Production)

For production/Vercel deployments, run migrations via Supabase Dashboard SQL Editor:

1. **Get migration SQL:**
   ```bash
   # View migration file
   cat supabase/migrations/20250202_add_arena_kind_and_constraint.sql
   ```

2. **Copy to Supabase Dashboard:**
   - Go to Supabase Dashboard → SQL Editor
   - Paste the SQL
   - Click Run

## Environment Variables Required

For local development (stored in `.env`, never committed):

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OR use direct database connection
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

## Verification

After running migrations, verify in Supabase SQL Editor:

```sql
-- Check if kind column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'arenas' AND column_name = 'kind';

-- Check if constraint exists
SELECT indexname 
FROM pg_indexes 
WHERE indexname = 'uniq_ms_arena_per_project';

-- Check RPC function exists
SELECT proname 
FROM pg_proc 
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

## Troubleshooting

### "Migration already applied"
- This is safe to ignore if the migration was already run
- Check the verification queries above to confirm

### "Permission denied"
- Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
- Or use Supabase Dashboard SQL Editor (uses your account permissions)

### "Connection refused"
- Check that `SUPABASE_URL` is correct
- For direct database connection, use the non-pooler connection string
- Pooler connections (`pooler.supabase.com`) may not work for migrations

## Important Files

- **Migrations:** `supabase/migrations/*.sql`
- **Environment:** `.env` (gitignored, never commit)
- **Example:** `env.example` (safe to commit, no real values)

## Next Steps

After migrations are applied:
1. Verify using the SQL queries above
2. Test the approval flow in the UI
3. Check that constraint violations no longer occur
