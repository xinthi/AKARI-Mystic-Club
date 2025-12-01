# Database Migration Instructions

## Issue
Prisma migrations are failing due to database connection issues with the pooler connection string.

## Solution Options

### Option 1: Run SQL Directly in Supabase (Recommended)
1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `prisma/add_indexes.sql`
4. Click **Run** to execute

This will create all the performance indexes directly.

### Option 2: Use Direct Connection String
If you have a direct connection string (not pooler) from Supabase:

1. Get the direct connection string from Supabase Dashboard:
   - Go to **Settings** → **Database**
   - Copy the **Connection string** (not the pooler one)
   - It should look like: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`

2. Temporarily update your `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
   ```

3. Run the migration:
   ```bash
   npx prisma migrate dev --name add_performance_indexes
   ```

4. Switch back to pooler connection for production

### Option 3: Retry Later
The connection issue might be temporary. Try again in a few minutes:
```bash
npx prisma migrate dev --name add_performance_indexes
```

## Verify Indexes Were Created

After running the SQL or migration, verify indexes exist:

```sql
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE tablename IN ('Bet', 'Campaign', 'CampaignUserProgress', 'MystTransaction')
ORDER BY tablename, indexname;
```

You should see these indexes:
- `Bet_predictionId_idx`
- `Bet_userId_createdAt_idx`
- `Campaign_status_idx`
- `Campaign_endsAt_idx`
- `CampaignUserProgress_campaignId_userId_idx`
- `CampaignUserProgress_userId_completed_idx`
- `MystTransaction_userId_type_idx`
- `MystTransaction_userId_createdAt_idx`

## Notes

- **Pooler vs Direct**: The pooler connection (`pooler.supabase.com`) is optimized for serverless but may not work for migrations
- **Direct Connection**: Direct connections work better for migrations but should not be used in production
- **No Data Loss**: These are index-only changes, no data will be lost
- **Backward Compatible**: All changes are backward compatible

