# Refresh ALL Avatars - Complete Guide

## Overview

This guide shows you how to refresh avatars for **ALL projects and ALL places** where profiles appear:
- ✅ ARC Leaderboards (all projects)
- ✅ Sentiment Pages (influencers, inner circle, tweet authors)
- ✅ Creator Manager Programs
- ✅ Any profiles missing avatars in the database

## Quick Start

### Option 1: Browser Console (Easiest)

1. Open any page on your site (logged in as SuperAdmin)
2. Open browser console (F12)
3. Run this:

```javascript
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
    console.log(`Skipped: ${data.totalSkipped}`);
    if (data.totalSucceeded > 0) {
      alert(`Refreshed ${data.totalSucceeded} avatars! Reload pages to see them.`);
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

### Option 2: Command Line Script

```bash
# Set your session token
export AKARI_SESSION_TOKEN=your_session_token_here

# Run the script
pnpm tsx scripts/refresh-all-avatars.ts

# Or with custom batch size
pnpm tsx scripts/refresh-all-avatars.ts --batch-size=10
```

### Option 3: Direct API Call (cURL)

```bash
curl -X POST "https://akarimystic.club/api/portal/admin/arc/refresh-all-avatars?batchSize=5" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

## What Gets Refreshed

### 1. ARC Leaderboards
- All creators in `arena_creators` table
- All creators in `project_creators` table
- **Covers:** All ARC project leaderboards

### 2. Sentiment Pages
- All influencers in `project_influencers` table
- All tweet authors from `project_tweets` (non-official tweets)
- **Covers:** Sentiment pages, inner circle, influencer lists

### 3. Creator Manager
- All creators in `creator_manager_creators` table
- **Covers:** Creator Manager program pages

### 4. All Profiles Missing Avatars
- Any profile in `profiles` table with NULL or empty `profile_image_url`
- **Covers:** Any other place profiles are shown

## Expected Results

```
✅ Refresh completed!

📊 Results:
  - Total Processed: 45
  - Succeeded: 38
  - Failed: 2
  - Skipped: 120 (already had avatars)
  - Duration: 45.67s

📋 Sources:
  - ARC Leaderboards: 25 processed
  - Sentiment Influencers: 15
  - Creator Manager: 8
  - All Profiles (missing avatars): 12
```

## Rate Limiting

- **Batch Size:** Default 5 profiles per batch (safe for Twitter API)
- **Delay:** 2 seconds between batches
- **Max Batch Size:** 20 (use with caution)

**Example:** 50 profiles with batch size 5 = ~10 batches = ~20 seconds + API call time

## After Refresh

1. **Refresh your browser pages** to see updated avatars:
   - ARC Leaderboards: `/portal/arc/[projectSlug]`
   - Sentiment Pages: `/portal/sentiment/[slug]`
   - Creator Manager: `/portal/arc/creator-manager/[programId]`

2. Avatars are now in the database and will be shown automatically

3. No more manual seeding needed - avatars persist in the database

## Troubleshooting

### "SuperAdmin only" Error

Make sure you're logged in as a SuperAdmin user. Check your `profiles.real_roles` or `akari_user_roles`.

### Rate Limit Errors

- Reduce batch size: `?batchSize=3`
- Wait a few minutes and retry
- The script automatically handles rate limits with delays

### Some Avatars Still Missing

1. Check if the username exists on Twitter
2. Check Vercel logs for specific errors
3. Some profiles might be suspended/deleted on Twitter

### Large Number of Profiles

For 100+ profiles, this will take several minutes. The script shows progress in the console.

## Future: Auto-Population

Once you integrate the `ingest_sentiment_to_arc` function (see `ARC_INGESTION_NEXT_STEPS.md`), avatars will be automatically pulled when:
- Projects are approved
- New contributors are discovered
- The ingestion function runs
- Sentiment tracking runs (already pulls avatars)

## Comparison: Refresh Options

| Endpoint | Scope | Use Case |
|----------|-------|----------|
| `/refresh-all-avatars` | **ALL** projects & sources | Initial setup, comprehensive refresh |
| `/refresh-leaderboard-avatars?projectId=xxx` | Single project leaderboard | Quick refresh for one project |
| `/refresh-avatars` | Profiles with `needs_avatar_refresh=true` | Targeted refresh for flagged profiles |

**Recommendation:** Use `/refresh-all-avatars` for initial setup, then use targeted endpoints for specific needs.
