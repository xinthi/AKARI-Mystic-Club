# Sentiment Profile Sync Implementation

## Overview

This implementation ensures that **every time** the sentiment section APIs pull profile information from X/Twitter, they also save the profile image (and other profile data) to the `profiles` table in the database.

## Key Changes

### 1. Created Profile Sync Helper

**File:** `src/web/lib/portal/profile-sync.ts`

- `upsertProfileFromTwitter()`: Syncs a single profile from Twitter API to profiles table
- `upsertProfilesFromTwitter()`: Batch syncs multiple profiles
- Automatically saves `profile_image_url`, `avatar_updated_at`, `needs_avatar_refresh`
- Never overwrites `username` (single source of truth)

### 2. Updated Sentiment Endpoints

All sentiment endpoints that fetch from Twitter now automatically sync profiles:

#### `/api/portal/sentiment/profile/[username]`
- ✅ Syncs profile when fetching from Twitter
- ✅ Updates DB avatar after sync

#### `/api/portal/sentiment/track`
- ✅ Syncs main project profile when tracking
- ✅ Syncs profile when refreshing existing project
- ✅ Syncs profile when updating follower count
- ✅ Syncs ALL follower profiles (including avatars) when fetching followers
- ✅ Syncs profile for new project creation

### 3. Profile Sync Behavior

Whenever `getUserProfile()` or `getUserFollowers()` is called:
1. Profile data is fetched from Twitter API
2. **Automatically** saved to `profiles` table via `upsertProfileFromTwitter()`
3. Avatar URL is stored in `profile_image_url`
4. `avatar_updated_at` is set to current timestamp
5. `needs_avatar_refresh` is set to `false`

## How It Works

### Single Profile Sync

```typescript
// Before
const profile = await getUserProfile(username);
// Profile fetched but not saved to profiles table

// After
const profile = await getUserProfile(username);
await upsertProfileFromTwitter(supabase, profile);
// ✅ Profile automatically saved to profiles table with avatar
```

### Batch Profile Sync (Followers)

```typescript
// Before
const followers = await getUserFollowers(username, 200);
// Followers fetched but not saved to profiles table

// After
const followers = await getUserFollowers(username, 200);
const followerProfiles = followers.map(f => ({
  handle: f.username,
  userId: f.id,
  profileImageUrl: f.profileImageUrl,
  // ... other fields
}));
await upsertProfilesFromTwitter(supabase, followerProfiles);
// ✅ All follower profiles automatically saved to profiles table with avatars
```

## Benefits

1. **Automatic Avatar Population**: Every profile fetched from Twitter automatically has its avatar saved
2. **Leaderboard Ready**: ARC leaderboard can now find avatars in profiles table
3. **No Manual Refresh Needed**: Avatars are populated as profiles are fetched naturally
4. **Consistent Data**: All profile data (name, bio, followers, etc.) is kept up-to-date

## Files Modified

1. ✅ `src/web/lib/portal/profile-sync.ts` (NEW)
   - Profile sync helper functions

2. ✅ `src/web/pages/api/portal/sentiment/profile/[username].ts`
   - Added profile sync after fetching from Twitter

3. ✅ `src/web/pages/api/portal/sentiment/track.ts`
   - Added profile sync in multiple places:
     - When fetching project profile
     - When fetching followers
     - When refreshing existing project
     - When creating new project

## Testing

To verify profiles are being synced:

1. Track a new project via `/api/portal/sentiment/track`
2. Check `profiles` table - should see profile with `profile_image_url`
3. Check leaderboard - should show avatar for that profile
4. Fetch profile via `/api/portal/sentiment/profile/[username]`
5. Check `profiles` table - avatar should be updated

## Next Steps

1. ✅ Run the avatar refresh job to populate existing profiles:
   ```bash
   POST /api/portal/admin/arc/refresh-avatars?limit=500
   ```

2. ✅ Monitor logs to ensure profiles are being synced when fetched

3. ✅ Verify leaderboard shows avatars for synced profiles

## Notes

- Profile sync is **non-blocking**: If sync fails, the API request still succeeds
- Sync is **idempotent**: Calling multiple times is safe
- `username` field is **never overwritten**: Single source of truth
- Avatars are validated before saving: Must be HTTP(S) URL
