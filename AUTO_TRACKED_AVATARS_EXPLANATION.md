# Why Auto-Tracked Profiles Don't Have Avatars (And How to Fix It)

## The Problem

**Auto-tracked creators** are different from **joined creators**:

### Joined Creators
- ✅ Explicitly joined the arena (in `arena_creators` or `project_creators` table)
- ✅ Usually have profiles in `profiles` table
- ✅ Avatars are easier to find

### Auto-Tracked Creators
- ⚠️ **Automatically discovered** from `project_tweets` (mentions of the project)
- ⚠️ **Not in `arena_creators` or `project_creators`** tables
- ⚠️ **May not have profiles** in `profiles` table yet
- ⚠️ **May not have avatars** in `project_tweets.author_profile_image_url`

## Why This Happens

1. **Auto-tracked creators** are calculated on-the-fly from `project_tweets` mentions
2. They don't have entries in `arena_creators` or `project_creators` until they join
3. The old refresh endpoint only looked at `arena_creators` and `project_creators`
4. So auto-tracked creators were **missed** during avatar refresh

## The Fix

I've updated both refresh endpoints to **include auto-tracked creators**:

### ✅ Updated: `refresh-leaderboard-avatars`
- Now also queries `project_tweets` for auto-tracked creators
- Includes them in the refresh process

### ✅ Updated: `refresh-all-avatars`
- Now also queries `project_tweets` for auto-tracked creators across all projects
- Includes them in the comprehensive refresh

## How to Fix It Now

### Option 1: Refresh All Avatars (Recommended)

This will refresh avatars for **ALL** creators including auto-tracked ones:

```javascript
// Browser console
fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Results:', data);
    console.log(`Succeeded: ${data.totalSucceeded}`);
    if (data.totalSucceeded > 0) {
      alert(`Refreshed ${data.totalSucceeded} avatars! Reload page.`);
      location.reload();
    }
  });
```

### Option 2: Refresh Single Project

```javascript
// Replace with your project ID
const projectId = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46';

fetch(`/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=${projectId}&batchSize=5`, {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Results:', data);
    if (data.succeeded > 0) {
      alert(`Refreshed ${data.succeeded} avatars! Reload page.`);
      location.reload();
    }
  });
```

## Future: Auto-Population

Once you integrate the `ingest_sentiment_to_arc` function (see `ARC_INGESTION_NEXT_STEPS.md`):

1. ✅ **Auto-tracked creators will get profiles** when ingestion runs
2. ✅ **Avatars will be pulled** from `project_tweets.author_profile_image_url`
3. ✅ **Profiles will be created** in the `profiles` table
4. ✅ **No more missing avatars** for auto-tracked creators

The ingestion function already includes logic to:
- Create profiles for auto-tracked creators
- Pull avatars from `project_tweets.author_profile_image_url`
- Update existing profiles if avatars are missing

## Summary

**Before:** Refresh endpoints only looked at joined creators → auto-tracked creators missed

**After:** Refresh endpoints now include auto-tracked creators from `project_tweets` → all creators covered

**Next:** Run the refresh to fix existing missing avatars, then integrate ingestion function for automatic population going forward.
