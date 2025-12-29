# ARC Mindshare Auto-Attribution Implementation

## Overview

This feature enhances the Mindshare Leaderboard to automatically include creators who generate signal for a project, even if they haven't explicitly joined. It also rewards creators who join and follow with a points multiplier.

## What Was Implemented

### 1. Database Schema

**Migration:** `supabase/migrations/20250123_add_mindshare_autoattribution.sql`

- Added `arc_keywords` field to `projects` table (TEXT[] array) for keyword matching
- Created `arc_mindshare_events` table (fallback for future signal tracking)
- Added indexes to `project_tweets` for efficient mindshare queries

### 2. Leaderboard API Endpoint

**File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`

**Changes:**
- Calculates auto-tracked participants from `project_tweets` (mentions only, `is_official = false`)
- Merges auto-tracked participants with joined participants from `arena_creators`
- Applies multiplier logic: 1.5x for joined + follow verified, 1.0x otherwise
- Returns combined leaderboard with new fields:
  - `base_points`: Raw points earned
  - `multiplier`: 1.0 or 1.5
  - `score`: `base_points * multiplier` (final displayed score)
  - `is_joined`: Boolean indicating if creator explicitly joined
  - `is_auto_tracked`: Boolean indicating if creator was auto-tracked
  - `follow_verified`: Boolean indicating if follow is verified

### 3. UI Updates

**File:** `src/web/pages/portal/arc/project/[projectId].tsx`

**Changes:**
- Added banner: "We auto-track public CT signal. Join and follow to boost your points."
- Updated leaderboard table to show:
  - Base Points column
  - Multiplier column (shows "1.5x" badge if multiplier > 1.0)
  - Score column (final displayed score)
  - Status column with pills:
    - "Auto-tracked" pill for auto-tracked, non-joined creators
    - "Join to boost points" CTA button (only for logged-in users viewing their own entry)
    - "Boost active" pill for joined + follow verified creators
    - Ring badge (if applicable)

## Scoring Formula

### Auto-Tracked Points Calculation

For each mention (non-official tweet) in `project_tweets`:
```
engagement_points = likes + (replies * 2) + (retweets * 3)
```

Points are aggregated per creator (normalized twitter_username):
```
base_points = SUM(engagement_points) for all mentions by creator
```

### Multiplier Logic

```
if (is_joined && follow_verified):
  multiplier = 1.5
else:
  multiplier = 1.0
```

### Final Score

```
score = floor(base_points * multiplier)
```

### Merging Rules

1. **Identity Key:** Normalized twitter_username (lowercase, no @)
2. **If creator is both auto-tracked and joined:**
   - Mark as `is_joined: true`
   - `base_points` = joined points (from `arena_creators.arc_points` + adjustments) + auto-tracked points
   - Apply multiplier if follow verified
3. **If creator is only auto-tracked:**
   - Mark as `is_auto_tracked: true`
   - `base_points` = auto-tracked points only
   - `multiplier` = 1.0

## Key Rules

1. **Auto-tracked users do NOT get admin abilities** or unlock Quest Leaderboard
2. **Auto-tracked users can appear even if not authenticated**
3. **Only authenticated users can join** and trigger follow verification flows
4. **Multiplier only applies to Mindshare Leaderboard**, not Quest Leaderboard
5. **Normalization:** All twitter_usernames are normalized (lowercase, no @, trimmed)

## Security

- All endpoints use `requireArcAccess()` for authorization
- All authenticated fetches use `credentials: 'include'`
- No private data (emails, profile IDs) exposed in leaderboard response
- `arc_mindshare_events` table has RLS enabled (no public read access)

## How to Test Manually

### 1. Test Auto-Tracking

1. Find a project with ARC access enabled (Mindshare Leaderboard)
2. Ensure there are mentions in `project_tweets` table for that project (`is_official = false`)
3. Visit `/portal/arc/project/[projectId]`
4. Verify that creators who mentioned the project appear in the leaderboard with:
   - "Auto-tracked" pill
   - Base points > 0
   - Multiplier = 1.0x
   - Score = base_points

### 2. Test Join + Follow Verification

1. As a logged-in user, find yourself in the auto-tracked list
2. Click "Join to boost points" button
3. If not following, verify follow first
4. After joining, verify that:
   - "Auto-tracked" pill is gone
   - "Boost active" pill appears (if follow verified)
   - Multiplier shows as 1.5x
   - Score = base_points * 1.5

### 3. Test Multiplier Application

1. Join a project's Mindshare Leaderboard
2. Verify follow
3. Check that:
   - `follow_verified: true` in API response
   - `multiplier: 1.5` in API response
   - `score = base_points * 1.5` (rounded down)
   - UI shows "Boost active" pill

### 4. Test Edge Cases

1. **Creator appears in both lists:**
   - Should show as joined (not auto-tracked)
   - Base points should include both joined points and auto-tracked points
   - Multiplier applies if follow verified

2. **No arena exists:**
   - Should return empty leaderboard (no joined creators)
   - Auto-tracked creators should still appear

3. **Normalization:**
   - Test with usernames like "@Creator", "Creator", "CREATOR"
   - All should be treated as the same user

## Database Queries for Verification

### Check auto-tracked points for a project:
```sql
SELECT 
  author_handle,
  COUNT(*) as mention_count,
  SUM(likes + replies * 2 + retweets * 3) as total_points
FROM project_tweets
WHERE project_id = '<project_id>'
  AND is_official = false
GROUP BY author_handle
ORDER BY total_points DESC;
```

### Check joined creators with follow status:
```sql
SELECT 
  ac.twitter_username,
  ac.arc_points,
  CASE WHEN apf.verified_at IS NOT NULL THEN true ELSE false END as follow_verified
FROM arena_creators ac
LEFT JOIN arc_project_follows apf 
  ON apf.project_id = '<project_id>'
  AND LOWER(REPLACE(apf.twitter_username, '@', '')) = LOWER(REPLACE(ac.twitter_username, '@', ''))
WHERE ac.arena_id IN (
  SELECT id FROM arenas WHERE project_id = '<project_id>' AND status = 'active'
);
```

## Files Changed

1. `supabase/migrations/20250123_add_mindshare_autoattribution.sql` - Database schema
2. `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` - API endpoint
3. `src/web/pages/portal/arc/project/[projectId].tsx` - UI component
4. `ARC_MINDSHARE_AUTOATTRIBUTION.md` - This documentation

## Future Enhancements

- Tiered multiplier system (1.2x for joined only, 1.5x for joined + follow, 1.8x for consistent activity)
- Keyword matching for project keywords
- Sentiment-based scoring adjustments
- Time-decay for older mentions
- Integration with `arc_mindshare_events` table for additional signal sources

