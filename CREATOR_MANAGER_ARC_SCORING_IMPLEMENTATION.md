# Creator Manager ARC Scoring Integration

## Summary

This implementation connects the existing ARC scoring engine to Creator Manager programs, allowing automatic calculation and updating of ARC points for creators based on their mission submissions and post engagement.

## Database Migration

**File:** `supabase/migrations/20241219_add_creator_manager_post_fields.sql`

Adds to `creator_manager_mission_progress`:
- `post_url TEXT` - URL of the post/tweet
- `post_tweet_id TEXT` - Tweet ID for engagement fetching
- Indexes for efficient lookups

## Core Library

**File:** `src/web/lib/arc/creator-manager-scoring.ts`

### Functions

1. **`calculateArcPointsForCreatorManager(input)`**
   - Wraps existing `scorePost()` function
   - Formula: `base * sentiment_multiplier * (1 + engagement_bonus)`
   - Returns: ARC points to award

2. **`calculateArcPointsDetailed(input)`**
   - Returns detailed scoring breakdown for debugging
   - Includes: basePoints, sentimentMultiplier, engagementScore, deltaPoints

3. **`addArcPointsForCreatorManager(programId, creatorProfileId, pointsToAdd)`**
   - Increments `creator_manager_creators.arc_points`
   - Returns: success status, points awarded, new total

4. **`scoreAndAddArcPoints(programId, creatorProfileId, input)`**
   - Convenience function: calculates and adds in one call

### TODO Functions (Placeholders)

- `fetchEngagementMetrics(tweetId, postUrl)` - Fetch from X API or project_tweets
- `classifyPostForCreatorManager(tweetId, text)` - Classify content type and sentiment

## Cron Job

**File:** `src/web/pages/api/cron/creator-manager-arc.ts`

**Endpoint:** `GET/POST /api/cron/creator-manager-arc`

**Security:** Requires `x-akari-cron-secret` header (or dev mode)

**Process:**
1. Finds all active Creator Manager programs
2. For each program, finds mission progress with `post_tweet_id`
3. Fetches engagement metrics (TODO: integrate with X API)
4. Classifies posts (TODO: integrate with sentiment analysis)
5. Calculates ARC points
6. Updates `creator_manager_creators.arc_points`

**To Add to Vercel Cron:**
```json
{
  "path": "/api/cron/creator-manager-arc",
  "schedule": "0 */6 * * *"  // Every 6 hours
}
```

## Test Endpoint

**File:** `src/web/pages/api/portal/creator-manager/test/score.ts`

**Endpoint:** `POST /api/portal/creator-manager/test/score`

**Security:** SuperAdmin only

**Input:**
```json
{
  "programId": "uuid",
  "creatorProfileId": "uuid",
  "engagementScore": 100,  // Optional: legacy mode
  "likes": 50,              // Optional: full mode
  "retweets": 10,
  "quotes": 5,
  "replies": 20,
  "contentType": "thread",  // Optional
  "sentiment": "positive"   // Optional
}
```

**Response:**
```json
{
  "ok": true,
  "pointsAwarded": 120,
  "newTotalPoints": 500,
  "breakdown": {
    "basePoints": 40,
    "sentimentMultiplier": 1.2,
    "engagementScore": 2.5,
    "finalPoints": 120
  }
}
```

## UI Updates

### Admin Side
- **`/portal/arc/creator-manager/[programId]`** - Creators tab
  - ARC Points column now shows "(inside this program)" label
  - Clear indication that points are program-specific

### Creator Side
- **`/portal/arc/my-creator-programs`** - Programs list
  - ARC Points now shows "in this program" label
  - Clear indication of program-specific points

## How to Test

### 1. Run Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20241219_add_creator_manager_post_fields.sql
```

### 2. Test Scoring Function
```typescript
import { calculateArcPointsForCreatorManager } from '@/lib/arc/creator-manager-scoring';

const points = calculateArcPointsForCreatorManager({
  contentType: 'thread',
  sentiment: 'positive',
  engagement: {
    likes: 100,
    retweets: 20,
    quotes: 5,
    replies: 10,
  },
});
// Returns: calculated ARC points
```

### 3. Test SuperAdmin Endpoint
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/test/score \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=YOUR_SESSION" \
  -d '{
    "programId": "PROGRAM_ID",
    "creatorProfileId": "PROFILE_ID",
    "contentType": "thread",
    "sentiment": "positive",
    "likes": 100,
    "retweets": 20,
    "quotes": 5,
    "replies": 10
  }'
```

### 4. Test Cron Job (Dev Mode)
```bash
curl http://localhost:3000/api/cron/creator-manager-arc
```

## Integration Points

### Current State
- ✅ Scoring formula implemented (reuses existing ARC scoring)
- ✅ Database structure ready (post_url, post_tweet_id)
- ✅ Cron job structure ready
- ✅ Test endpoint for manual testing

### TODO: X API Integration
1. **Engagement Fetching:**
   - Check `project_tweets` table first
   - If not found, fetch from X API using existing Twitter client
   - Store in `project_tweets` for future use

2. **Content Classification:**
   - Use existing sentiment analysis
   - Detect content type (thread, deep_dive, meme, etc.)
   - Check `project_tweets` for existing classification

3. **Mission Progress Linking:**
   - When creator submits mission, capture `post_tweet_id` or `post_url`
   - Store in `creator_manager_mission_progress`
   - Cron job will process these posts

## Scoring Formula

The existing ARC scoring formula is:
```
ARC_points = base * sentiment_multiplier * (1 + engagement_bonus)
```

Where:
- `base` = Content type base points (thread: 40, deep_dive: 80, meme: 25, etc.)
- `sentiment_multiplier` = positive: 1.2, neutral: 1.0, negative: 0.5
- `engagement_bonus` = log2(likes + retweets*2 + quotes*2 + replies + 1) / 4

This formula is reused exactly as-is for Creator Manager scoring.

## Security

- Cron job requires `CRON_SECRET` (or dev mode)
- Test endpoint requires SuperAdmin role
- All endpoints check permissions before updating data
- No breaking changes to existing ARC campaign logic

## Notes

- ARC points in Creator Manager are program-specific (separate from arena ARC points)
- Points are cumulative (incremented, not replaced)
- Mission progress must have `post_tweet_id` to be scored
- Engagement data fetching is placeholder (TODO markers in code)

