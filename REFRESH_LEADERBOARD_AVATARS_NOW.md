# Refresh Missing Avatars on Leaderboard

## 🚀 NEW: Refresh ALL Avatars (Recommended)

**For refreshing avatars across ALL projects and ALL places**, use the comprehensive endpoint:

See `REFRESH_ALL_AVATARS_GUIDE.md` for the complete solution that refreshes:
- ✅ All ARC leaderboards (all projects)
- ✅ All Sentiment pages
- ✅ All Creator Manager programs
- ✅ All profiles missing avatars

**Quick browser console method:**
```javascript
fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Results:', data);
    alert(`Refreshed ${data.totalSucceeded} avatars!`);
  });
```

---

## Quick Fix: Refresh Avatars for Single Project

Some profiles on the leaderboard are missing avatars (like `0x_jhayy`). Here's how to fix it:

### Option 1: Browser Console (Easiest)

1. Open your leaderboard page: `/portal/arc/mysticheros` (or your project)
2. Open browser console (F12)
3. Get your project ID from the URL or page
4. Run this:

```javascript
// Replace with your actual project ID
const projectId = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'; // MYSTIC CLUB

fetch(`/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=${projectId}&batchSize=5`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Refresh Results:', data);
    console.log(`Processed: ${data.processed}, Succeeded: ${data.succeeded}, Failed: ${data.failed}`);
    if (data.succeeded > 0) {
      console.log('🔄 Refresh the page to see updated avatars!');
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

### Option 2: Command Line Script

```bash
# Set your session token first
export AKARI_SESSION_TOKEN=your_session_token_here

# Run the script
pnpm tsx scripts/refresh-leaderboard-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
```

### Option 3: Direct API Call (cURL)

```bash
curl -X POST "https://akarimystic.club/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46&batchSize=5" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

## What This Does

1. ✅ Finds all creators in the project's leaderboard
2. ✅ Identifies which ones are missing avatars
3. ✅ Fetches their profile images from Twitter API
4. ✅ Saves them to the `profiles` table
5. ✅ Updates `avatar_updated_at` timestamp

## Expected Results

```
✅ Refresh completed!
Results:
  - Processed: 15
  - Succeeded: 10
  - Failed: 0
  - Skipped: 5 (already had avatars)
  - Duration: 12.34s
```

## After Refresh

1. **Refresh your browser page** to see the updated avatars
2. The leaderboard API will automatically pick up the new avatars from the database
3. No more manual seeding needed - avatars will be pulled automatically going forward

## Future: Auto-Population

Once you integrate the `ingest_sentiment_to_arc` function (see `ARC_INGESTION_NEXT_STEPS.md`), avatars will be automatically pulled when:
- Projects are approved
- New contributors are discovered
- The ingestion function runs

The ingestion function already includes logic to pull and save avatars when creating profiles!
