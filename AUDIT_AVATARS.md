# Avatar Audit Guide

This guide shows you how to audit avatar status for all profiles in the ARC leaderboard.

## Option 1: Run Audit Script (Recommended)

### Prerequisites

1. Make sure you have environment variables set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Install dependencies (if not already):
   ```bash
   pnpm install
   ```

### Run the Audit

```bash
# For project: a3256fab-bb9f-4f3a-ad60-bfc28e12dd46 (MYSTIC CLUB)
pnpm arc:audit-avatars a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
```

Or directly with tsx:
```bash
pnpm tsx scripts/audit-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
```

### What the Script Does

1. ✅ Fetches all creators from the project's leaderboard
2. ✅ Checks if each creator exists in the `profiles` table
3. ✅ Checks if avatars exist in:
   - `profiles.profile_image_url` (primary)
   - `project_tweets.author_profile_image_url` (fallback)
   - `tracked_profiles.profile_image_url` (fallback)
4. ✅ Generates a detailed report with:
   - Summary statistics
   - Detailed breakdown per creator
   - List of creators without avatars
   - List of creators missing from profiles table

### Example Output

```
🔍 Auditing avatars for project: a3256fab-bb9f-4f3a-ad60-bfc28e12dd46

📋 Project: MYSTIC CLUB (@mysticheros)
🎯 Arena: MYSTIC CLUB Mindshare (xxx-xxx-xxx)
📊 Found 50 unique creators in leaderboard

🔍 Querying profiles table...
🔍 Querying project_tweets for fallback avatars...
🔍 Querying tracked_profiles for fallback avatars...

📊 AVATAR AUDIT REPORT
================================================================================

📈 SUMMARY

Total creators:           50
With avatars:             35 (70%)
Without avatars:          15 (30%)
Missing from profiles DB: 5
Needs refresh:            10

## ✅ Automatic Profile Sync (NEW)

**IMPORTANT:** As of this implementation, **all sentiment APIs now automatically sync profiles to the database** whenever they fetch from Twitter/X.

This means:
- ✅ Every time `/api/portal/sentiment/profile/[username]` fetches a profile, it's saved to `profiles` table
- ✅ Every time `/api/portal/sentiment/track` tracks a project, the profile is saved to `profiles` table
- ✅ Every time followers are fetched, they're ALL saved to `profiles` table with avatars
- ✅ No manual refresh needed - avatars are populated automatically as profiles are fetched

### How It Works

1. **Profile Sync Helper** (`src/web/lib/portal/profile-sync.ts`):
   - `upsertProfileFromTwitter()`: Syncs a single profile
   - `upsertProfilesFromTwitter()`: Batch syncs multiple profiles
   - Automatically saves `profile_image_url`, `avatar_updated_at`, `needs_avatar_refresh`

2. **Sentiment Endpoints Updated**:
   - `/api/portal/sentiment/profile/[username]`: ✅ Auto-syncs profiles
   - `/api/portal/sentiment/track`: ✅ Auto-syncs profiles and followers

3. **Result**:
   - Every profile fetched from Twitter/X is now in the `profiles` table
   - Every profile has its avatar saved automatically
   - ARC leaderboard can now find avatars in the database

Avatar sources:
  - From profiles table:        30
  - From project_tweets (fallback): 4
  - From tracked_profiles (fallback): 1

================================================================================

📋 DETAILED REPORT

Rank | Username              | Profile | Avatar | Source           | Refresh | Type
--------------------------------------------------------------------------------
   1 | 0x_jhayy              | ✓       | ✓      | profiles         | NO      | AUTO
   2 | muazxinthi            | ✓       | ✗      | none             | YES     | AUTO
...
```

## Option 2: Use Diagnostic API Endpoint

### Call the Endpoint

```bash
# Get your session token first (from browser cookies)
# Then call:
curl "https://akarimystic.club/api/portal/admin/arc/check-avatars?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

Or use the browser console:
```javascript
fetch('/api/portal/admin/arc/check-avatars?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(console.log);
```

### Response Format

```json
{
  "ok": true,
  "projectId": "a3256fab-bb9f-4f3a-ad60-bfc28e12dd46",
  "totalProfiles": 50,
  "profiles": [
    {
      "username": "0x_jhayy",
      "normalizedUsername": "0x_jhayy",
      "hasProfile": true,
      "hasAvatar": true,
      "avatarUrl": "https://pbs.twimg.com/profile_images/...",
      "source": "profiles",
      "needsRefresh": false,
      "avatarUpdatedAt": "2026-01-08T...",
      "isAutoTracked": true,
      "isJoined": false
    }
  ],
  "summary": {
    "withAvatars": 35,
    "withoutAvatars": 15,
    "missingProfiles": 5,
    "needsRefresh": 10
  }
}
```

## Option 3: Direct SQL Query (Advanced)

If you want to check directly in Supabase SQL Editor:

```sql
-- Get all creators in leaderboard and their avatar status
WITH leaderboard_creators AS (
  SELECT DISTINCT
    LOWER(TRIM(REPLACE(ac.twitter_username, '@', ''))) as normalized_username,
    ac.is_auto_tracked,
    ac.profile_id
  FROM arena_creators ac
  INNER JOIN arenas a ON a.id = ac.arena_id
  WHERE a.project_id = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'
  
  UNION
  
  SELECT DISTINCT
    LOWER(TRIM(REPLACE(pc.twitter_username, '@', ''))) as normalized_username,
    FALSE as is_auto_tracked,
    pc.profile_id
  FROM project_creators pc
  WHERE pc.project_id = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'
)
SELECT 
  lc.normalized_username,
  lc.is_auto_tracked,
  CASE WHEN p.id IS NOT NULL THEN TRUE ELSE FALSE END as has_profile,
  CASE WHEN p.profile_image_url IS NOT NULL AND p.profile_image_url LIKE 'http%' THEN TRUE ELSE FALSE END as has_avatar,
  p.profile_image_url,
  p.avatar_updated_at,
  p.needs_avatar_refresh
FROM leaderboard_creators lc
LEFT JOIN profiles p ON LOWER(TRIM(REPLACE(p.username, '@', ''))) = lc.normalized_username
ORDER BY lc.normalized_username;
```

## What to Do After Audit

Based on the audit results:

### If Profiles Are Missing from Database
Run the avatar refresh job to create missing profiles:
```bash
# Via API endpoint (requires SuperAdmin)
curl -X POST "https://akarimystic.club/api/portal/admin/arc/refresh-avatars?limit=100" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

### If Avatars Are Missing
1. **Profiles exist but no avatars:** Run avatar refresh job (see above)
2. **Profiles don't exist:** The refresh job will create them automatically

### If Avatars Are Old
Check `avatar_updated_at` and `needs_avatar_refresh` flags. Profiles with old avatars (>30 days) or `needs_avatar_refresh=true` will be refreshed by the job.

## Next Steps

1. Run the audit to see current status
2. Identify which creators need avatars
3. Run the refresh job to fetch missing avatars
4. Re-run the audit to verify avatars were fetched
