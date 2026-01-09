# Fix Auto-Tracked Creator Avatars - Step by Step

## The Problem

Auto-tracked creators (like `0x_jhayy`) don't have avatars because:

1. **They're discovered from `project_tweets`** (mentions), not from `arena_creators` or `project_creators`
2. **Their tweets may not have `author_profile_image_url`** in the database
3. **They may not have profiles** in the `profiles` table yet
4. **The old refresh endpoint missed them** (now fixed)

## The Solution

I've made **two fixes**:

### ✅ Fix 1: Updated Refresh Endpoints
- `refresh-leaderboard-avatars` now includes auto-tracked creators from `project_tweets`
- `refresh-all-avatars` now includes auto-tracked creators from `project_tweets`

### ✅ Fix 2: Improved Leaderboard API
- Better case-insensitive matching for profiles
- More robust avatar lookup for auto-tracked creators

## How to Fix It Now

### Step 1: Run the Refresh (Required)

**Browser Console Method:**

```javascript
// Refresh ALL avatars (includes auto-tracked creators)
fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Results:', data);
    console.log(`Processed: ${data.totalProcessed}`);
    console.log(`Succeeded: ${data.totalSucceeded}`);
    console.log(`Failed: ${data.totalFailed}`);
    if (data.totalSucceeded > 0) {
      alert(`Refreshed ${data.totalSucceeded} avatars! Reload page.`);
      location.reload();
    } else {
      alert('No avatars needed refreshing, or refresh failed. Check console.');
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
    alert('Error refreshing avatars. Check console.');
  });
```

**What this does:**
1. Finds all auto-tracked creators from `project_tweets`
2. Fetches their avatars from Twitter API
3. Creates profiles in `profiles` table if they don't exist
4. Saves avatars to the database
5. Updates `avatar_updated_at` timestamp

### Step 2: Verify It Worked

After running the refresh, check the console output:
- `Succeeded: X` - number of avatars successfully refreshed
- `Failed: Y` - number that failed (check errors array)

Then **reload your leaderboard page** - avatars should appear!

## Why Auto-Tracked Creators Were Missing Avatars

### The Flow:

1. **Auto-tracked creators** are calculated from `project_tweets` (mentions)
2. They appear on the leaderboard with `is_auto_tracked: true`
3. But they're **not in `arena_creators` or `project_creators`** tables
4. The old refresh endpoint only checked those tables
5. So auto-tracked creators were **missed**

### Now Fixed:

- ✅ Refresh endpoints now query `project_tweets` for auto-tracked creators
- ✅ Leaderboard API has better profile matching
- ✅ Avatars will be pulled and saved to database

## Future: Automatic Population

Once you integrate `ingest_sentiment_to_arc` function:

1. ✅ Auto-tracked creators will get profiles automatically
2. ✅ Avatars will be pulled from `project_tweets.author_profile_image_url`
3. ✅ Or fetched from Twitter API if missing
4. ✅ Saved to `profiles` table
5. ✅ No more missing avatars!

## Troubleshooting

### Still Missing After Refresh?

1. **Check Vercel logs** for errors during refresh
2. **Check if profile exists:**
   ```sql
   SELECT username, profile_image_url 
   FROM profiles 
   WHERE username ILIKE '0x_jhayy';
   ```
3. **Check if tweets have avatars:**
   ```sql
   SELECT author_handle, author_profile_image_url 
   FROM project_tweets 
   WHERE author_handle ILIKE '0x_jhayy' 
   LIMIT 5;
   ```

### Profile Exists But No Avatar?

Run the refresh again - it will fetch from Twitter API and update the profile.

### Profile Doesn't Exist?

The refresh endpoint will create it automatically when fetching from Twitter API.
