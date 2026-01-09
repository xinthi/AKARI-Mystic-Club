# Execute Update Profiles from Sentiment - Quick Guide

## Option 1: Browser Console (Easiest - Recommended)

1. **Open your leaderboard page**: `/portal/arc/mysticheros`
2. **Open browser console** (F12)
3. **Copy and paste this:**

```javascript
// Update profiles from sentiment data
fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Update Results:', data);
    console.log(`Total mention authors: ${data.totalMentionAuthors}`);
    console.log(`Profiles created: ${data.profilesCreated}`);
    console.log(`Profiles updated: ${data.profilesUpdated}`);
    console.log(`Profiles skipped: ${data.profilesSkipped}`);
    console.log(`Profiles failed: ${data.profilesFailed}`);
    
    if (data.profilesCreated > 0 || data.profilesUpdated > 0) {
      alert(`✅ Updated ${data.profilesCreated + data.profilesUpdated} profiles!\n\nNext: Run refresh-all-avatars to fetch avatars.`);
    } else {
      alert('ℹ️ No profiles updated. They may already exist.\n\nNext: Run refresh-all-avatars to ensure avatars are fetched.');
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
    alert('Error updating profiles. Check console for details.');
  });
```

4. **Wait for completion** (30-60 seconds depending on number of profiles)
5. **After it completes, run the refresh avatars script:**

```javascript
// Refresh avatars for all profiles
fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
  method: 'POST',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Refresh Results:', data);
    if (data.totalSucceeded > 0) {
      alert(`✅ Refreshed ${data.totalSucceeded} avatars! Reloading page...`);
      setTimeout(() => location.reload(), 2000);
    }
  });
```

## Option 2: Command Line Script

1. **Get your session token:**
   - Open browser console on the leaderboard page
   - Run: `document.cookie.split("; ").find(c => c.startsWith("akari_session="))?.split("=")[1]`
   - Copy the token

2. **Run the script:**
   ```bash
   cd src/web
   AKARI_SESSION_TOKEN=your_token_here pnpm tsx ../../scripts/update-profiles-from-sentiment.ts
   ```

3. **Then refresh avatars:**
   ```bash
   AKARI_SESSION_TOKEN=your_token_here pnpm tsx ../../scripts/refresh-all-avatars.ts
   ```

## Option 3: Direct cURL (Advanced)

```bash
# Get session token from browser console first
SESSION_TOKEN="your_token_here"

# Update profiles
curl -X POST "https://akarimystic.club/api/portal/admin/arc/update-profiles-from-sentiment" \
  -H "Cookie: akari_session=$SESSION_TOKEN" \
  -H "Content-Type: application/json"

# Refresh avatars
curl -X POST "https://akarimystic.club/api/portal/admin/arc/refresh-all-avatars?batchSize=5" \
  -H "Cookie: akari_session=$SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

## What This Does

1. **update-profiles-from-sentiment:**
   - Finds all mention authors from `project_tweets`
   - Checks which ones need profiles or avatar updates
   - Fetches profiles from Twitter API
   - Creates/updates profiles in database

2. **refresh-all-avatars:**
   - Finds all profiles missing avatars
   - Fetches avatars from Twitter API
   - Updates `profile_image_url` in database

## Expected Results

After running both:

- ✅ Profiles created/updated for all mention authors
- ✅ Avatars fetched and saved to database
- ✅ Leaderboard should show avatars for all creators

## Troubleshooting

### If you get "Unauthorized" (401):
- Make sure you're logged in
- Check that your session token is valid
- Try refreshing the page and getting a new token

### If you get "Forbidden" (403):
- SuperAdmin access is required
- Contact an admin to run this

### If profiles are created but avatars still missing:
- Run the refresh-all-avatars endpoint
- Check Vercel logs for errors
- Some profiles might be rate-limited by Twitter API
