# Sentiment Avatar Implementation Summary

## Overview
All Sentiment APIs and UI components now use DB-only avatar fetching from the `profiles` table. No live Twitter/X API calls are made during render paths.

## Changes Made

### 1. Helper Functions (`src/web/lib/portal/avatar-helper.ts`)
- **`normalizeTwitterUsername()`**: Normalizes usernames (strip @, lowercase, trim) for consistent matching
- **`fetchAvatarsFromProfiles()`**: Batch fetches avatar URLs from profiles table
- **`fetchAvatarForUsername()`**: Fetches avatar for a single username
- **`checkNeedsAvatarRefresh()`**: Checks if a profile needs avatar refresh

### 2. Updated API Endpoints

#### `/api/portal/sentiment/[slug].ts`
- ✅ Enriches tweet authors with avatars from profiles table (DB-only)
- ✅ Enriches influencers with avatars from profiles table if missing
- ✅ Uses normalized username matching
- ✅ Added logging: `✓ DB-only avatar fetching - no live X API calls`

#### `/api/portal/sentiment/profile/[username].ts`
- ✅ Checks DB first for avatar before calling Twitter API
- ✅ Prefers DB avatar over API avatar
- ✅ Still calls Twitter API for other profile data (bio, followers, etc.) but avatar comes from DB

#### `/api/portal/sentiment/competitors.ts`
- ✅ Already returns `avatar_url` from projects table
- ✅ No changes needed

#### `/api/portal/sentiment/[slug]/competitors.ts`
- ✅ Already returns `avatar_url` from projects table
- ✅ Already returns `profile_image_url` for common profiles
- ✅ No changes needed

#### `/api/portal/sentiment/watchlist/index.ts`
- ✅ Already returns `avatar_url` from projects table
- ✅ No changes needed

### 3. New Endpoint

#### `POST /api/portal/avatars/mark-refresh`
- Marks profiles for avatar refresh by setting `needs_avatar_refresh=true`
- Input: `{ usernames: string[] }`
- Output: `{ ok: true, marked: number, total: number }`
- Lightweight - doesn't overwrite existing profile data
- Rate-limited: max 1000 usernames per request

### 4. UI Components

#### Sentiment Overview (`src/web/pages/portal/sentiment/index.tsx`)
- ✅ Already uses `AvatarWithFallback` component
- ✅ Handles image load errors with fallback to initials
- ✅ No changes needed

#### Sentiment Detail (`src/web/pages/portal/sentiment/[slug].tsx`)
- ✅ Already uses `AvatarWithFallback` component
- ✅ Handles image load errors with fallback to initials
- ✅ No changes needed

## Avatar Population Strategy

### How to Populate Avatars

1. **SuperAdmin runs refresh job:**
   ```bash
   POST /api/portal/admin/arc/refresh-avatars
   Query params: ?limit=100&batchSize=10
   ```
   - Finds profiles where `avatar_url IS NULL` OR `avatar_updated_at < now() - 30d` OR `needs_avatar_refresh = true`
   - Fetches avatars from Twitter API in batches
   - Updates `profiles` table with `avatar_url`, `avatar_updated_at`, `needs_avatar_refresh=false`

2. **Optional: Schedule daily refresh**
   - Set up a cron job to call `/api/portal/admin/arc/refresh-avatars` daily
   - This ensures avatars stay up-to-date

3. **Mark specific profiles for refresh:**
   ```bash
   POST /api/portal/avatars/mark-refresh
   Body: { usernames: ["username1", "username2", ...] }
   ```
   - Sets `needs_avatar_refresh=true` for specified profiles
   - Next refresh job will update them

## Database Schema

The `profiles` table includes:
- `profile_image_url` (TEXT) - Avatar URL from Twitter
- `avatar_updated_at` (TIMESTAMPTZ) - When avatar was last updated
- `needs_avatar_refresh` (BOOLEAN) - Flag for manual refresh requests

Migration: `supabase/migrations/20250208_add_avatar_refresh_fields.sql`

## Verification

### Logging
All Sentiment endpoints log:
- `✓ DB-only avatar fetching - no live X API calls` (sentiment/[slug].ts)
- Avatar enrichment counts (how many avatars found in DB)

### Testing
1. Check Vercel logs for Sentiment API calls
2. Verify no `taioGetUserInfo` or `getUserProfile` calls in sentiment render paths
3. Verify avatars load from DB (check network tab - should see `profiles` table queries)

## Benefits

1. **Faster Response Times**: No blocking on external API calls
2. **Better UX**: Consistent initials fallback for missing avatars
3. **Scalable**: Separate refresh job can run on schedule
4. **Rate-Limit Safe**: Refresh job includes delays between requests
5. **Maintainable**: Clear separation between read (APIs) and write (refresh job) operations

## Migration Notes

- Run migration: `supabase/migrations/20250208_add_avatar_refresh_fields.sql`
- Initial avatar population: Run `/api/portal/admin/arc/refresh-avatars` once
- Optional: Set up daily cron job for ongoing updates
