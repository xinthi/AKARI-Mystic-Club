# ARC Avatar Schema Alignment

## Schema Verification

### Profiles Table Schema
Based on `supabase/migrations/002_sentiment_v2_schema.sql`:

- **Handle Column:** `profiles.username` (TEXT, NOT NULL, UNIQUE)
  - Stores Twitter handle without @ prefix
  - This is the single source of truth for Twitter usernames
  
- **Avatar Column:** `profiles.profile_image_url` (TEXT)
  - Stores avatar URL from Twitter
  - Can be NULL

- **Additional Fields (from migration 20250208):**
  - `avatar_updated_at` (TIMESTAMPTZ) - When avatar was last updated
  - `needs_avatar_refresh` (BOOLEAN, DEFAULT FALSE) - Flag for manual refresh

## Code Alignment

### ✅ Correct Usage

All ARC code now correctly uses:
- `profiles.username` (not `profiles.twitter_username`)
- `profiles.profile_image_url` (not `profiles.avatar_url`)

### Files Verified

1. **`src/web/lib/portal/avatar-helper.ts`**
   - ✅ Uses `profiles.username` in queries
   - ✅ Uses `profiles.profile_image_url` in queries
   - ✅ Normalizes usernames consistently

2. **`src/web/pages/api/portal/arc/leaderboard/[projectId].ts`**
   - ✅ Queries `profiles.username` for avatar lookups
   - ✅ Uses `profiles.profile_image_url` for avatar URLs
   - ✅ DB-only - no live Twitter API calls

3. **`src/web/pages/api/portal/admin/arc/refresh-avatars.ts`**
   - ✅ Queries `profiles.username` 
   - ✅ Updates `profiles.profile_image_url`
   - ✅ Updates `avatar_updated_at` and `needs_avatar_refresh`
   - ✅ Never overwrites `username` field (single source of truth)
   - ✅ Only updates existing profiles (query finds existing profiles)

4. **`supabase/migrations/20250208_add_avatar_refresh_fields.sql`**
   - ✅ Uses `profiles.profile_image_url` (correct column name)
   - ✅ Adds `avatar_updated_at` and `needs_avatar_refresh` fields

5. **`src/web/pages/api/portal/avatars/mark-refresh.ts`**
   - ✅ Uses `profiles.username` for matching
   - ✅ Updates `needs_avatar_refresh` flag

## Key Principles

1. **Single Source of Truth:** `profiles.username` is the primary identifier and should NEVER be overwritten
2. **Normalization:** All username comparisons use `normalizeTwitterUsername()` (lowercase, strip @, trim)
3. **DB-Only:** Leaderboard and Sentiment endpoints never call live Twitter API during render
4. **Profile Creation:** Refresh-avatars only updates existing profiles (from query results). If a profile doesn't exist, it won't be in the query results, so we won't try to refresh it.

## Migration Status

✅ Migration `20250208_add_avatar_refresh_fields.sql` is correct:
- Uses `profile_image_url` (correct column name)
- Adds `avatar_updated_at` and `needs_avatar_refresh` fields
- Does NOT add duplicate handle column

## Testing Checklist

- [ ] Run migration: `20250208_add_avatar_refresh_fields.sql`
- [ ] Verify `profiles` table has: `username`, `profile_image_url`, `avatar_updated_at`, `needs_avatar_refresh`
- [ ] Test leaderboard endpoint - should return avatars from DB
- [ ] Test refresh-avatars endpoint - should update existing profiles
- [ ] Verify no `profiles.twitter_username` references in code
