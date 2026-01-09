# Avatar Matching Fix for Leaderboard

## The Problem

Some profiles on the leaderboard don't have avatars even though they exist in the database. This was caused by:

1. **Case-sensitive matching** - Usernames in database might have different casing
2. **@ prefix issues** - Some usernames stored with @, others without
3. **Inefficient query** - Using `.or()` with multiple conditions wasn't matching correctly

## The Fix

I've improved the profile matching logic in the leaderboard API:

### Before:
- Used `.or()` with multiple conditions in a single query
- Only tried exact matches as fallback
- Could miss profiles due to case/format differences

### After:
- **Individual queries** for each username with case-insensitive matching
- **Multiple matching strategies**: `ilike`, `eq`, with and without `@` prefix
- **Better fallback**: Tries exact matches if case-insensitive fails
- **More reliable**: Processes usernames individually to ensure all are checked

## What Changed

**File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`

**Lines 802-836:** Improved profile querying logic

### New Approach:
1. Query each username individually with case-insensitive matching
2. Try multiple formats: `username.ilike.${u}`, `username.ilike.@${u}`, `username.eq.${u}`, `username.eq.@${u}`
3. Fallback to exact match if no results
4. Better error handling and logging

## Testing

After this fix, the leaderboard should:
- ✅ Find profiles regardless of case (e.g., `0x_jhayy` vs `0X_JHAYY`)
- ✅ Find profiles with or without `@` prefix
- ✅ Match profiles more reliably
- ✅ Show avatars for all creators who have profiles in the database

## Next Steps

If profiles still don't have avatars after this fix:

1. **Run the update-profiles-from-sentiment endpoint** to ensure profiles exist:
   ```javascript
   fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
     method: 'POST',
     credentials: 'include',
   })
   ```

2. **Check Vercel logs** for the leaderboard API to see:
   - How many profiles were found
   - Which usernames are missing
   - Any matching errors

3. **Verify profiles exist in database:**
   ```sql
   SELECT username, profile_image_url 
   FROM profiles 
   WHERE username IN ('0x_jhayy', 'muazxinthi', 'truunik');
   ```

## Related Issues

- Auto-tracked creators might not have profiles yet (run update-profiles-from-sentiment)
- Profiles might exist but without avatars (run refresh-all-avatars)
- Username format mismatches (this fix addresses this)
