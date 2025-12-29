# Creator Manager Mission Submission & Approval Flow

## Summary

This implementation adds a complete mission submission and approval workflow for Creator Manager programs, allowing creators to submit missions and moderators to review and approve/reject them.

## Database

The `creator_manager_mission_progress` table already has the required fields from previous migrations:
- `post_url TEXT` - Added in migration `20241219_add_creator_manager_post_fields.sql`
- `post_tweet_id TEXT` - Added in migration `20241219_add_creator_manager_post_fields.sql`
- `status` - Already exists with values: 'in_progress', 'submitted', 'approved', 'rejected'

## API Endpoints

### 1. Mission Submission (Creator)
**File:** `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`

**Endpoint:** `POST /api/portal/creator-manager/missions/[missionId]/submit`

**Input:**
```json
{
  "postUrl": "https://x.com/username/status/...",
  "postTweetId": "1234567890",
  "notes": "Optional notes"
}
```

**Behavior:**
- Verifies user is an approved creator in the program
- Creates or updates mission progress with status = "submitted"
- Stores post_url and post_tweet_id for future ARC scoring

**Permissions:** Only approved creators can submit

### 2. Mission Review (Moderator)
**File:** `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`

**Endpoint:** `POST /api/portal/creator-manager/missions/[missionId]/review`

**Input:**
```json
{
  "creatorProfileId": "uuid",
  "action": "approve" | "reject"
}
```

**Behavior:**
- If approve:
  - Sets status = "approved"
  - Awards XP from `mission.reward_xp`
  - Awards ARC points from `mission.reward_arc_min` (using shared scoring helper)
  - Updates `creator_manager_creators.xp` and `arc_points`
- If reject:
  - Sets status = "rejected"

**Permissions:** Only project owner/admin/moderator can review

### 3. Get Submissions (Moderator)
**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/submissions.ts`

**Endpoint:** `GET /api/portal/creator-manager/programs/[programId]/missions/submissions`

**Returns:** All mission submissions for the program with creator info

**Permissions:** Only project owner/admin/moderator can view

### 4. Get My Progress (Creator)
**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/my-progress.ts`

**Endpoint:** `GET /api/portal/creator-manager/programs/[programId]/missions/my-progress`

**Returns:** Mission progress for the current creator

**Permissions:** Only the creator themselves can view their progress

## UI Pages

### Creator Side

**File:** `src/web/pages/portal/arc/my-creator-programs/[programId].tsx`

**Features:**
- Lists all active missions for the program
- Shows mission status for each mission:
  - Not started
  - In progress
  - Submitted (awaiting review)
  - Approved
  - Rejected
- "Submit Mission" button opens modal with:
  - Post URL input
  - Tweet ID input
- Shows XP and ARC rewards for each mission
- Link from main my-programs page to view missions

### Moderator Side

**File:** `src/web/pages/portal/arc/creator-manager/[programId].tsx` (Missions tab)

**Features:**
- Lists all missions with stats:
  - Total submissions count
  - Approved count
- "View Submissions" button for each mission
- Submissions panel shows:
  - Creator handle
  - Submission status
  - Post URL (clickable link)
  - Tweet ID
  - Submission timestamp
- Approve/Reject buttons for submitted missions
- Real-time updates after review

## Permission Checks

All endpoints verify:
- **Submission:** User must be approved creator in `creator_manager_creators`
- **Review:** User must be project owner/admin/moderator (via `checkProjectPermissions`)
- **View Submissions:** User must be project owner/admin/moderator
- **View My Progress:** User must be the creator themselves

## Integration Points

### ARC Scoring
- When mission is approved, ARC points are awarded using `addArcPointsForCreatorManager()`
- Uses `mission.reward_arc_min` as base ARC amount
- TODO: Enhance to use full scoring formula with engagement metrics

### XP Rewards
- When mission is approved, XP is awarded directly from `mission.reward_xp`
- Updates `creator_manager_creators.xp`
- Level is computed on-the-fly from XP

## Files Created/Updated

**New Files:**
1. `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`
2. `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`
3. `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/submissions.ts`
4. `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/my-progress.ts`
5. `src/web/pages/portal/arc/my-creator-programs/[programId].tsx`

**Updated Files:**
1. `src/web/pages/portal/arc/creator-manager/[programId].tsx` - Added submissions view in Missions tab
2. `src/web/pages/portal/arc/my-creator-programs.tsx` - Added link to view missions

## How to Test

### 1. Creator Submission
1. Log in as a creator
2. Navigate to `/portal/arc/my-creator-programs`
3. Click "View Missions" on an approved program
4. Click "Submit Mission" on an active mission
5. Enter post URL or tweet ID
6. Submit and verify status changes to "Submitted"

### 2. Moderator Review
1. Log in as project admin/moderator
2. Navigate to `/portal/arc/creator-manager/[programId]`
3. Go to Missions tab
4. Click "View Submissions" on a mission with submissions
5. Click "Approve" or "Reject" on a submission
6. Verify:
   - Status updates
   - Creator XP increases (if approved)
   - Creator ARC points increase (if approved)

### 3. API Testing

**Submit Mission:**
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/missions/MISSION_ID/submit \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=..." \
  -d '{"postUrl": "https://x.com/user/status/123", "postTweetId": "123"}'
```

**Review Mission:**
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/missions/MISSION_ID/review \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=..." \
  -d '{"creatorProfileId": "PROFILE_ID", "action": "approve"}'
```

## Notes

- Mission progress is created on first submission (upsert pattern)
- Submissions can be updated by resubmitting
- Only active missions can be submitted
- Approved creators can only submit missions for programs they're approved in
- ARC points use simple `reward_arc_min` for now (can be enhanced with full scoring)
- XP is awarded directly from `reward_xp`
- All permission checks use existing `checkProjectPermissions` helper

