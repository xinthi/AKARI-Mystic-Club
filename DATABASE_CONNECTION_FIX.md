# Database Connection Fix for Vercel

## Issue
Vercel deployments are failing with database connection errors:
- "Can't reach database server at `aws-1-eu-north-1.pooler.supabase.com`:`5432`"

## Root Cause
1. **Wrong Port**: Using port `5432` (direct connection) instead of `6543` (pooler)
2. **Missing Connection Parameters**: Supabase pooler needs `pgbouncer=true` parameter
3. **Connection Timeout**: Serverless functions need connection timeout settings

## Solution

### 1. Update DATABASE_URL in Vercel

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

**Current (WRONG):**
```
postgresql://user:pass@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Correct (for Supabase Pooler):**
```
postgresql://postgres.dosalyqfzynurisjmknw:Persevere2-Starter8-Little6-Slighted5-Surging6@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connect_timeout=10
```

**Key Changes:**
- Port: `5432` → `6543` (pooler port)
- Add: `&pgbouncer=true` (required for Supabase pooler)
- Add: `&connect_timeout=10` (connection timeout)

### 2. Alternative: Use Direct Connection (Less Efficient)

If pooler doesn't work, use direct connection:
```
postgresql://postgres.dosalyqfzynurisjmknw:Persevere2-Starter8-Little6-Slighted5-Surging6@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=10
```

**Note:** Direct connection (port 5432) works but is less efficient for serverless.

### 3. Get Correct Connection String from Supabase

1. Go to Supabase Dashboard → Your Project → Settings → Database
2. Under "Connection string", select "Connection pooling" tab
3. Copy the connection string (should use port 6543)
4. Add `&pgbouncer=true&connect_timeout=10` to the end

### 4. Updated Code

The code has been updated to:
- Automatically add `pgbouncer=true` if using port 6543
- Add connection timeout parameters
- Improved retry logic with exponential backoff
- Better error handling for connection issues

## Verification

After updating DATABASE_URL in Vercel:

1. **Redeploy** your application
2. **Check Vercel logs** - should see successful connections
3. **Test API endpoints** - should return 200 instead of 500

## Troubleshooting

### Still Getting Connection Errors?

1. **Verify DATABASE_URL format:**
   - Must include `?sslmode=require`
   - Must use port `6543` for pooler
   - Must include `&pgbouncer=true` for pooler

2. **Check Supabase Status:**
   - Go to Supabase Dashboard
   - Check if database is running
   - Verify connection pooling is enabled

3. **Test Connection Locally:**
   ```bash
   # Test with pooler
   psql "postgresql://user:pass@host:6543/postgres?sslmode=require&pgbouncer=true"
   
   # Test direct
   psql "postgresql://user:pass@host:5432/postgres?sslmode=require"
   ```

4. **Check Vercel Environment Variables:**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Verify `DATABASE_URL` is set correctly
   - Make sure it's set for "Production" environment
   - Redeploy after updating

## Next Steps

1. ✅ Code updated with better connection handling
2. ⚠️ **YOU NEED TO**: Update `DATABASE_URL` in Vercel environment variables
3. ⚠️ **YOU NEED TO**: Redeploy the application
4. ✅ Monitor Vercel logs for connection success

