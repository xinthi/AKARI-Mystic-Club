# Sentiment Profile Sync Fix - Auto-Tracked Creators

## The Problem

**Auto-tracked creators** (users who mention projects but aren't logged into AKARI) were missing avatars because:

1. ✅ Sentiment tracking **DOES** pull profiles from Twitter/X API
2. ✅ Sentiment tracking **DOES** save profiles for:
   - The project being tracked
   - Inner circle followers
3. ❌ Sentiment tracking **DID NOT** save profiles for **mention authors** (auto-tracked creators)

## The Solution

I've updated `/api/portal/sentiment/track` to:

1. **Save profiles for mention authors** after fetching mentions
2. **Use profile image from mention data** if available
3. **Fetch full profile from Twitter API** if mention doesn't have profile image
4. **Create profiles in `profiles` table** so they appear on leaderboards with avatars

## What Changed

### File: `src/web/pages/api/portal/sentiment/track.ts`

**Added after saving mentions to `project_tweets`:**

```typescript
// IMPORTANT: Save profiles for mention authors (auto-tracked creators)
// This ensures they have profiles with avatars in the database for leaderboards
if (mentions.length > 0) {
  // Collect unique mention authors
  // Save profiles for each (using profile image from mention or fetching from Twitter)
  // Creates profiles in profiles table
}
```

## How It Works Now

### When Sentiment Tracking Runs:

1. **Fetches mentions** from Twitter API (tweets mentioning the project)
2. **Saves mentions** to `project_tweets` table
3. **NEW: Saves profiles** for mention authors to `profiles` table:
   - Uses `authorProfileImageUrl` from mention if available
   - OR fetches full profile from Twitter API if missing
   - Creates/updates profile in `profiles` table
   - Sets `avatar_updated_at` timestamp
   - Sets `needs_avatar_refresh = false`

### Result:

- ✅ Auto-tracked creators now have profiles in `profiles` table
- ✅ Profiles include avatars from Twitter/X
- ✅ Leaderboard can find avatars from `profiles` table
- ✅ No more missing avatars for auto-tracked creators!

## Testing

### To Test:

1. **Track a project** that has mentions:
   ```
   POST /api/portal/sentiment/track
   { "username": "mysticheros" }
   ```

2. **Check Vercel logs** for:
   ```
   [Track] Saving profiles for X mention authors...
   [Track] ✓ Saved profile for mention author @username
   ```

3. **Check database:**
   ```sql
   SELECT username, profile_image_url, avatar_updated_at
   FROM profiles
   WHERE username IN (
     SELECT DISTINCT author_handle
     FROM project_tweets
     WHERE project_id = 'your-project-id'
     AND is_official = false
   );
   ```

4. **Check leaderboard** - auto-tracked creators should now have avatars!

## Future Improvements

1. **Batch profile fetching** - Currently fetches one at a time, could batch for efficiency
2. **Rate limiting** - Add delays between profile fetches to avoid Twitter API limits
3. **Error handling** - Better retry logic for failed profile fetches
4. **Update `processProject.ts`** - If still used, apply same fix there

## Related Files

- `src/web/pages/api/portal/sentiment/track.ts` - ✅ Fixed
- `src/web/lib/portal/profile-sync.ts` - Helper for saving profiles
- `src/web/lib/twitter/twitter.ts` - Twitter API client
- `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` - Uses profiles table for avatars
