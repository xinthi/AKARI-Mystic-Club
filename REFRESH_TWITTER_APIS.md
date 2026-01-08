# Refresh All Twitter APIs

This guide explains how to trigger and refresh all Twitter API data.

## Available Refresh Endpoints

### 1. Avatar Refresh
**Endpoint:** `POST /api/portal/admin/arc/refresh-avatars`  
**Auth:** SuperAdmin required  
**Purpose:** Refreshes profile avatars from Twitter API

**Parameters:**
- `limit` (query, default: 100, max: 500) - Maximum profiles to process
- `batchSize` (query, default: 10, max: 50) - Batch size for processing

**What it does:**
- Finds profiles where:
  - `avatar_url IS NULL` OR
  - `avatar_updated_at < now() - 30 days` OR
  - `needs_avatar_refresh = true`
- Fetches avatars from Twitter API in batches
- Updates `profiles` table with new avatars
- Rate-limited: 200ms delay between requests

### 2. Sentiment Refresh (Full)
**Endpoint:** `GET /api/portal/cron/sentiment-refresh-all?secret=CRON_SECRET`  
**Auth:** CRON_SECRET required  
**Purpose:** Full sentiment refresh for all active projects

**What it does:**
- Fetches profile, tweets, mentions, followers from Twitter API
- Calculates sentiment, CT Heat, and AKARI scores
- Updates `metrics_daily` and `project_tweets`
- Rate-limited: 2 second delay between projects

### 3. Sentiment Refresh (Smart)
**Endpoint:** `GET /api/portal/cron/sentiment-smart-refresh?secret=CRON_SECRET`  
**Auth:** CRON_SECRET required  
**Purpose:** Smart refresh - only refreshes projects that need it

**What it does:**
- Checks `project_refresh_state` to determine which projects need refresh
- Only refreshes projects that haven't been updated recently
- More efficient than full refresh

## Quick Start

### Option 1: Using the Script (Recommended)

#### TypeScript/Node.js:
```bash
# Install dependencies if needed
npm install node-fetch @types/node-fetch

# Set environment variables
export NEXT_PUBLIC_BASE_URL="https://yourdomain.com"
export AKARI_SESSION_TOKEN="your-session-token"  # For avatar refresh
export CRON_SECRET="your-cron-secret"  # For sentiment refresh

# Run the script
npx ts-node scripts/refresh-all-twitter-apis.ts

# Or run specific refresh:
npx ts-node scripts/refresh-all-twitter-apis.ts avatars
npx ts-node scripts/refresh-all-twitter-apis.ts sentiment
npx ts-node scripts/refresh-all-twitter-apis.ts smart
```

#### Bash:
```bash
# Make executable
chmod +x scripts/refresh-all-twitter-apis.sh

# Set environment variables
export NEXT_PUBLIC_BASE_URL="https://yourdomain.com"
export AKARI_SESSION_TOKEN="your-session-token"
export CRON_SECRET="your-cron-secret"

# Run the script
./scripts/refresh-all-twitter-apis.sh

# Or run specific refresh:
./scripts/refresh-all-twitter-apis.sh avatars
./scripts/refresh-all-twitter-apis.sh sentiment
./scripts/refresh-all-twitter-apis.sh smart
```

### Option 2: Direct API Calls

#### Refresh Avatars (cURL):
```bash
curl -X POST \
  "https://yourdomain.com/api/portal/admin/arc/refresh-avatars?limit=500&batchSize=10" \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

#### Refresh Sentiment (cURL):
```bash
curl -X GET \
  "https://yourdomain.com/api/portal/cron/sentiment-refresh-all?secret=YOUR_CRON_SECRET"
```

#### Smart Refresh Sentiment (cURL):
```bash
curl -X GET \
  "https://yourdomain.com/api/portal/cron/sentiment-smart-refresh?secret=YOUR_CRON_SECRET"
```

### Option 3: From Browser Console (Development)

If you're logged in as SuperAdmin, you can run this in the browser console:

```javascript
// Refresh avatars
fetch('/api/portal/admin/arc/refresh-avatars?limit=500&batchSize=10', {
  method: 'POST',
  credentials: 'include'
})
.then(r => r.json())
.then(console.log);

// Refresh sentiment (requires CRON_SECRET in query)
fetch('/api/portal/cron/sentiment-smart-refresh?secret=YOUR_CRON_SECRET', {
  method: 'GET'
})
.then(r => r.json())
.then(console.log);
```

## Getting Authentication Tokens

### SuperAdmin Session Token (for Avatar Refresh)

1. Log in to the portal as SuperAdmin
2. Open browser DevTools → Application/Storage → Cookies
3. Copy the value of `akari_session` cookie
4. Use it as `AKARI_SESSION_TOKEN` environment variable

### CRON Secret (for Sentiment Refresh)

1. Check your environment variables or `.env` file
2. Look for `CRON_SECRET` variable
3. Use it in the API call or set as environment variable

## Response Examples

### Avatar Refresh Response:
```json
{
  "ok": true,
  "processed": 150,
  "succeeded": 142,
  "failed": 5,
  "skipped": 3,
  "duration": 45230
}
```

### Sentiment Refresh Response:
```json
{
  "ok": true,
  "message": "Refresh completed",
  "startedAt": "2025-01-08T12:00:00.000Z",
  "completedAt": "2025-01-08T12:15:30.000Z",
  "durationMs": 930000,
  "totalProjects": 50,
  "successCount": 48,
  "failCount": 2,
  "results": [...]
}
```

## Scheduling Automatic Refreshes

### Vercel Cron Jobs

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/portal/admin/arc/refresh-avatars?limit=500&batchSize=10",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/portal/cron/sentiment-smart-refresh?secret=YOUR_CRON_SECRET",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### Manual Cron (Linux/Mac)

Add to crontab (`crontab -e`):

```bash
# Refresh avatars daily at 2 AM
0 2 * * * curl -X POST "https://yourdomain.com/api/portal/admin/arc/refresh-avatars?limit=500&batchSize=10" -H "Cookie: akari_session=YOUR_SESSION_TOKEN"

# Smart refresh sentiment daily at 8 AM
0 8 * * * curl -X GET "https://yourdomain.com/api/portal/cron/sentiment-smart-refresh?secret=YOUR_CRON_SECRET"
```

## Troubleshooting

### Avatar Refresh Fails with 401/403
- **Issue:** Not authenticated as SuperAdmin
- **Solution:** 
  - Log in as SuperAdmin
  - Get session token from cookies
  - Set `AKARI_SESSION_TOKEN` environment variable

### Sentiment Refresh Fails with 401
- **Issue:** CRON_SECRET missing or incorrect
- **Solution:** Check `CRON_SECRET` environment variable matches the one in your API

### Rate Limiting
- **Issue:** Too many requests too fast
- **Solution:** 
  - Reduce `batchSize` parameter
  - Add delays between requests
  - Use smart refresh instead of full refresh

### No Profiles Found
- **Issue:** No profiles match the refresh criteria
- **Solution:** This is normal if all avatars are up-to-date. Check logs for details.

## Monitoring

Check Vercel logs or your server logs to monitor:
- Number of profiles processed
- Success/failure rates
- Duration of operations
- Any errors or warnings

## Best Practices

1. **Start with Smart Refresh**: Use `smart-refresh` for sentiment to save API calls
2. **Batch Size**: Use smaller batch sizes (10-20) to avoid rate limits
3. **Schedule Off-Peak**: Run refreshes during off-peak hours (2-4 AM)
4. **Monitor Logs**: Check logs after each refresh to ensure success
5. **Incremental**: Don't refresh everything at once - use limits and batch sizes
