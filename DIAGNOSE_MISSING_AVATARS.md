# Diagnose Missing Avatars for Auto-Tracked Creators

## Quick Fix: Run Avatar Refresh

**The fastest way to fix this is to refresh avatars for all auto-tracked creators:**

### Browser Console Method:

1. Open your leaderboard page: `/portal/arc/mysticheros`
2. Open browser console (F12)
3. Run this:

```javascript
// Refresh ALL avatars (includes auto-tracked creators from project_tweets)
fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Refresh Results:', data);
    console.log(`Processed: ${data.totalProcessed}`);
    console.log(`Succeeded: ${data.totalSucceeded}`);
    console.log(`Failed: ${data.totalFailed}`);
    if (data.totalSucceeded > 0) {
      alert(`✅ Refreshed ${data.totalSucceeded} avatars! Reload page to see them.`);
      location.reload();
    } else {
      alert('⚠️ No avatars refreshed. Check console for details.');
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
    alert('Error refreshing avatars. Check console.');
  });
```

## Diagnostic Steps

### Step 1: Check What the API Returns

1. Open browser console (F12)
2. Go to Network tab
3. Reload the leaderboard page
4. Find the request: `/api/portal/arc/leaderboard/[projectId]`
5. Check the Response - look for entries with `is_auto_tracked: true`
6. Check if they have `avatar_url: null` or `avatar_url: "..."`

**Example check:**
```javascript
// In browser console after page loads
fetch('/api/portal/arc/leaderboard/a3256fab-bb9f-4f3a-ad60-bfc28e12dd46', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => {
    const autoTracked = data.creators.filter(c => c.is_auto_tracked);
    console.log('Auto-tracked creators:', autoTracked.length);
    const withAvatars = autoTracked.filter(c => c.avatar_url);
    const withoutAvatars = autoTracked.filter(c => !c.avatar_url);
    console.log('With avatars:', withAvatars.length);
    console.log('Without avatars:', withoutAvatars.length);
    console.log('Missing avatars for:', withoutAvatars.map(c => c.twitter_username));
  });
```

### Step 2: Check Database

**Check if profiles exist for auto-tracked creators:**

```sql
-- Find auto-tracked creators from project_tweets
SELECT DISTINCT 
  pt.author_handle,
  p.username,
  p.profile_image_url,
  p.avatar_updated_at,
  p.needs_avatar_refresh
FROM project_tweets pt
LEFT JOIN profiles p ON LOWER(TRIM(REPLACE(pt.author_handle, '@', ''))) = LOWER(TRIM(REPLACE(p.username, '@', '')))
WHERE pt.project_id = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'
  AND pt.is_official = false
ORDER BY pt.author_handle
LIMIT 20;
```

**Check specific creators:**
```sql
-- Check specific auto-tracked creators
SELECT username, profile_image_url, avatar_updated_at, needs_avatar_refresh
FROM profiles
WHERE username IN ('0x_jhayy', 'muazxinthi', 'truunik')
ORDER BY username;
```

### Step 3: Check Vercel Logs

Look for these log messages in Vercel:

```
[ARC Leaderboard] Avatar Status Summary (DB-only):
[ARC Leaderboard] Auto-tracked creators missing avatars: X
[ARC Leaderboard] Missing avatars for: username1, username2, ...
```

## Common Issues & Solutions

### Issue 1: Profiles Don't Exist

**Symptom:** API returns `avatar_url: null` for auto-tracked creators

**Solution:** Run the refresh endpoint - it will create profiles automatically

### Issue 2: Profiles Exist But No Avatars

**Symptom:** Profile exists in DB but `profile_image_url` is NULL

**Solution:** Run the refresh endpoint - it will fetch avatars from Twitter API

### Issue 3: Username Mismatch

**Symptom:** Profile exists but API can't match it (case sensitivity, @ prefix)

**Solution:** The API now uses case-insensitive matching, but if still failing, check:
- Profile username format (with/without @)
- Case differences (0x_jhayy vs 0X_JHAYY)

### Issue 4: Sentiment Tracking Hasn't Run

**Symptom:** No profiles created because sentiment tracking hasn't fetched mentions yet

**Solution:** 
1. Manually trigger sentiment tracking for the project
2. Or wait for scheduled refresh
3. The new code will automatically save profiles for mention authors

## Manual Profile Creation (If Needed)

If refresh doesn't work, manually create profiles:

```sql
-- Create profile for auto-tracked creator (example)
INSERT INTO profiles (
  username,
  name,
  profile_image_url,
  created_at,
  updated_at
)
VALUES (
  '0x_jhayy',  -- normalized username (lowercase, no @)
  NULL,
  NULL,  -- Will be populated by refresh endpoint
  NOW(),
  NOW()
)
ON CONFLICT (username) DO NOTHING;
```

Then run the refresh endpoint again.

## Verify Fix

After running refresh:

1. **Check database:**
   ```sql
   SELECT username, profile_image_url 
   FROM profiles 
   WHERE username IN ('0x_jhayy', 'muazxinthi', 'truunik');
   ```

2. **Reload leaderboard page**

3. **Check browser console** for image load errors

4. **Check Network tab** - avatars should load from `pbs.twimg.com`

## Still Not Working?

1. Check Vercel logs for errors during refresh
2. Verify Twitter API key is set: `TWITTERAPIIO_API_KEY`
3. Check rate limits - Twitter API might be rate-limited
4. Check browser console for CORS or image loading errors
