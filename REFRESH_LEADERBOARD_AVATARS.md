# Refresh Leaderboard Avatars

This endpoint refreshes missing avatars for all creators in a project's leaderboard. It uses the same Twitter API client as sentiment tracking to fetch profile images.

## Endpoint

`POST /api/portal/admin/arc/refresh-leaderboard-avatars?projectId=xxx&batchSize=5`

**Parameters:**
- `projectId` (required): The project ID to refresh avatars for
- `batchSize` (optional): Number of profiles to fetch per batch (default: 5, max: 20)

**Authentication:** SuperAdmin only

## How It Works

1. Gets all creators from the project's leaderboard (from `arena_creators` and `project_creators`)
2. Identifies which ones are missing avatars in the database (`profiles.profile_image_url` is null or invalid)
3. Fetches their profiles from Twitter API using `getUserProfile` (same as sentiment track)
4. Saves profiles to database using `upsertProfileFromTwitter` (same as sentiment track)
5. Rate-limit safe: processes in batches with 2-second delays between batches

## Usage Methods

### Method 1: Using the Script (Recommended)

```bash
# Set your session token (get it from browser cookies when logged in)
export AKARI_SESSION_TOKEN=your_session_token

# Set the base URL (optional, defaults to http://localhost:3000)
export NEXT_PUBLIC_BASE_URL=https://akarimystic.club

# Run the script
pnpm tsx scripts/refresh-leaderboard-avatars.ts <projectId>
```

**Example:**
```bash
pnpm tsx scripts/refresh-leaderboard-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
```

### Method 2: Browser Console

1. Open your browser on `https://akarimystic.club`
2. Open Developer Console (F12)
3. Make sure you're logged in as SuperAdmin
4. Run this command:

```javascript
const projectId = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'; // Replace with your project ID
const batchSize = 5; // Optional: adjust batch size

fetch(`/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=${projectId}&batchSize=${batchSize}`, {
  method: 'POST',
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      console.log('✅ Refresh completed!');
      console.log(`   - Processed: ${data.processed}`);
      console.log(`   - Succeeded: ${data.succeeded}`);
      console.log(`   - Failed: ${data.failed}`);
      console.log(`   - Skipped: ${data.skipped}`);
      console.log(`   - Duration: ${(data.duration / 1000).toFixed(2)}s`);
      
      if (data.errors && data.errors.length > 0) {
        console.log('\n❌ Errors:');
        data.errors.forEach(err => {
          console.log(`   - @${err.username}: ${err.error}`);
        });
      }
    } else {
      console.error('❌ Error:', data.error);
    }
    return data;
  });
```

### Method 3: cURL

```bash
curl -X POST "https://akarimystic.club/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46&batchSize=5" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.'
```

## Response Format

```json
{
  "ok": true,
  "projectId": "a3256fab-bb9f-4f3a-ad60-bfc28e12dd46",
  "processed": 15,
  "succeeded": 12,
  "failed": 2,
  "skipped": 3,
  "duration": 45000,
  "errors": [
    {
      "username": "example_user",
      "error": "Profile not found"
    }
  ]
}
```

**Fields:**
- `ok`: Whether the request succeeded
- `projectId`: The project ID that was processed
- `processed`: Number of profiles that needed avatar refresh
- `succeeded`: Number of profiles successfully fetched and saved
- `failed`: Number of profiles that failed to fetch/save
- `skipped`: Number of profiles that already had avatars (skipped)
- `duration`: Total time in milliseconds
- `errors`: Array of errors (only present if `failed > 0`)

## Before Running

You can check which profiles are missing avatars first:

### Check Avatar Status

```javascript
// In browser console
fetch('/api/portal/admin/arc/check-avatars?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => {
    console.log('📊 AVATAR AUDIT RESULTS');
    console.log('Summary:', data.summary);
    console.log('\n📋 Profiles WITHOUT avatars:');
    const withoutAvatars = data.profiles.filter(p => !p.hasAvatar);
    withoutAvatars.forEach((p, i) => {
      console.log(`${i + 1}. @${p.username} (${p.isAutoTracked ? 'AUTO' : 'JOINED'})`);
    });
  });
```

## Notes

- **Rate Limiting**: The endpoint processes profiles in batches and waits 2 seconds between batches to avoid rate limits
- **Database First**: The endpoint only fetches profiles that are missing avatars in the database
- **Same as Sentiment Track**: Uses the same Twitter API client (`getUserProfile`) and profile sync helper (`upsertProfileFromTwitter`) as sentiment tracking
- **Auto-Sync**: When sentiment APIs fetch profiles, they now automatically save avatars to the database using `upsertProfileFromTwitter`

## Troubleshooting

### 401 Unauthorized
- Make sure you're logged in as SuperAdmin
- Check that your session token is valid

### 403 Forbidden
- Only SuperAdmin users can run this endpoint
- Check your user role in `akari_user_roles` or `profiles.real_roles`

### Rate Limit Errors
- Reduce `batchSize` (default is 5, try 3 or 2)
- The endpoint already includes 2-second delays between batches

### Profile Not Found Errors
- Some Twitter usernames may be invalid or deleted
- These will be reported in the `errors` array in the response
