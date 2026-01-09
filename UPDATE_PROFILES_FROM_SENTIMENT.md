# Update Profiles from Sentiment Data

## Quick Fix: Update All Profiles from Sentiment

This endpoint updates profiles for all mention authors (auto-tracked creators) from sentiment data stored in `project_tweets`.

### Browser Console Method:

1. Open your leaderboard page: `/portal/arc/mysticheros`
2. Open browser console (F12)
3. Run this:

```javascript
// Update profiles from sentiment data
fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Results:', data);
    console.log(`Total mention authors: ${data.totalMentionAuthors}`);
    console.log(`Profiles created: ${data.profilesCreated}`);
    console.log(`Profiles updated: ${data.profilesUpdated}`);
    console.log(`Profiles skipped: ${data.profilesSkipped}`);
    console.log(`Profiles failed: ${data.profilesFailed}`);
    
    if (data.profilesCreated > 0 || data.profilesUpdated > 0) {
      alert(`✅ Updated ${data.profilesCreated + data.profilesUpdated} profiles! Reload page to see avatars.`);
      location.reload();
    } else {
      alert('⚠️ No profiles were updated. They may already exist with avatars.');
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
    alert('Error updating profiles. Check console.');
  });
```

## What This Does

1. **Finds all mention authors** from `project_tweets` (where `is_official = false`)
2. **Checks existing profiles** to see which ones are missing or don't have avatars
3. **Fetches profiles from Twitter API** for authors needing updates
4. **Saves/updates profiles** in the `profiles` table with avatars
5. **Rate-limit safe** - processes in small batches with delays

## When to Use This

- ✅ After sentiment tracking runs and creates new mentions
- ✅ When auto-tracked creators are missing avatars on leaderboard
- ✅ To backfill profiles for existing mention authors
- ✅ After importing sentiment data from external sources

## Expected Results

After running, you should see:
- `profilesCreated`: New profiles added to database
- `profilesUpdated`: Existing profiles updated with avatars
- `profilesSkipped`: Profiles that already have avatars (no update needed)
- `profilesFailed`: Profiles that couldn't be fetched (rate limits, invalid handles, etc.)

## Notes

- **SuperAdmin only** - Requires SuperAdmin access
- **Rate-limited** - Processes 5 profiles at a time with delays
- **Idempotent** - Safe to run multiple times
- **Non-destructive** - Only updates missing data, doesn't overwrite existing avatars

## Troubleshooting

### If profilesCreated = 0 and profilesUpdated = 0:

1. **Check if profiles already exist:**
   ```sql
   SELECT username, profile_image_url 
   FROM profiles 
   WHERE username IN (
     SELECT DISTINCT author_handle 
     FROM project_tweets 
     WHERE is_official = false 
     LIMIT 10
   );
   ```

2. **Check if mentions exist:**
   ```sql
   SELECT COUNT(DISTINCT author_handle) 
   FROM project_tweets 
   WHERE is_official = false;
   ```

3. **Check Vercel logs** for errors during processing

### If profilesFailed > 0:

- Twitter API rate limits may be hit
- Some handles may be invalid or suspended
- Check the `errors` array in the response for details

## Related Endpoints

- `/api/portal/admin/arc/refresh-all-avatars` - Refresh avatars for all profiles
- `/api/portal/sentiment/track` - Track a new project (saves profiles for mention authors automatically)
