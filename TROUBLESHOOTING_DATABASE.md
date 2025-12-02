# Database Connection Troubleshooting Guide

## Quick Diagnostic

Since you've already updated the port to 6543, let's verify everything is correct:

### Step 1: Check Vercel Environment Variable

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `DATABASE_URL`
3. Click "Reveal" to see the actual value
4. Verify it contains:
   - ✅ Port `6543` (not 5432)
   - ✅ `pgbouncer=true` parameter
   - ✅ `sslmode=require` parameter
   - ✅ `connect_timeout=10` parameter

**Expected format:**
```
postgresql://postgres.dosalyqfzynurisjmknw:YOUR_PASSWORD@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connect_timeout=10
```

### Step 2: Test Database Connection

I've created a diagnostic endpoint. After deploying, visit:

```
https://play.akarimystic.club/api/debug/db-connection
```

This will show:
- Connection string details (masked for security)
- Connection test results
- Any errors

### Step 3: Check Vercel Logs

1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/profile` (or any failing endpoint)
3. Check the "Logs" tab
4. Look for:
   - Connection errors
   - The actual connection string being used (masked)
   - Retry attempts

## Common Issues After Port Update

### Issue 1: Environment Variable Not Applied

**Symptom:** Still seeing port 5432 in logs

**Fix:**
1. Double-check the environment variable in Vercel
2. Make sure it's saved (not just typed)
3. **Redeploy** after updating (Vercel doesn't auto-apply env changes to running functions)
4. Clear build cache if needed

### Issue 2: Missing pgbouncer Parameter

**Symptom:** Connection works but queries fail

**Fix:**
- Ensure `&pgbouncer=true` is in the connection string
- The code now auto-adds it, but it's better to have it in the env var

### Issue 3: Connection Timeout

**Symptom:** Requests timeout after 10 seconds

**Fix:**
- Increase `connect_timeout` to 15 or 20
- Check Supabase dashboard for any service issues

### Issue 4: Prisma Client Caching

**Symptom:** Old connection string still being used

**Fix:**
1. Redeploy without cache:
   - Vercel Dashboard → Deployments
   - Click three dots on latest deployment
   - "Redeploy" → Uncheck "Use existing Build Cache"
2. Or push a new commit to trigger fresh build

## Verification Checklist

After updating DATABASE_URL:

- [ ] Environment variable saved in Vercel
- [ ] Port is 6543 (not 5432)
- [ ] Contains `pgbouncer=true`
- [ ] Contains `sslmode=require`
- [ ] Contains `connect_timeout=10`
- [ ] Redeployed application
- [ ] Checked Vercel logs for connection success
- [ ] Tested profile page

## Still Not Working?

1. **Check Supabase Dashboard:**
   - Is the database running?
   - Any service alerts?
   - Connection pooling enabled?

2. **Try Direct Connection (Temporary):**
   - Use port `5432` (direct connection)
   - Remove `pgbouncer=true`
   - This is less efficient but helps verify the issue

3. **Check Network:**
   - Vercel might have network restrictions
   - Supabase might have IP allowlist (check settings)

4. **Contact Support:**
   - Vercel support for deployment issues
   - Supabase support for database issues

## Next Steps

1. Visit the diagnostic endpoint to see what's happening
2. Check Vercel logs for specific error messages
3. Verify the connection string format matches exactly
4. Try a fresh redeploy without cache

