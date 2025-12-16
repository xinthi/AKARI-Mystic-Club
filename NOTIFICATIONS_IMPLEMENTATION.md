# Creator Manager Notifications System

## Summary

This implementation adds a minimal in-app notification system focused on Creator Manager actions, allowing users to be notified of important events.

## Database Migration

**File:** `supabase/migrations/20241220_add_notifications_table.sql`

Creates `notifications` table with:
- `id` - UUID primary key
- `profile_id` - References profiles(id)
- `type` - Notification type (creator_invited, creator_approved, creator_rejected, mission_submitted, mission_approved, mission_rejected)
- `context` - JSONB for storing programId, missionId, projectId, etc.
- `is_read` - Boolean flag
- `created_at` - Timestamp

**RLS:** Service role has full access. User access is controlled via API endpoints.

## Helper Library

**File:** `src/web/lib/notifications.ts`

### Functions

1. **`createNotification(supabase, profileId, type, context)`**
   - Creates a single notification for a user
   - Returns: `{ success: boolean, error?: string }`

2. **`getProjectTeamMemberProfileIds(supabase, projectId)`**
   - Gets all profile IDs for project owners, admins, and moderators
   - Returns: Array of profile IDs

3. **`notifyProjectTeamMembers(supabase, projectId, type, context)`**
   - Creates notifications for all project team members
   - Used for mission_submitted notifications

## Notification Hooks

### 1. Creator Invited
**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`
- When creators are invited, creates `creator_invited` notification for each invited creator
- Context: `{ programId, projectId }`

### 2. Creator Status Changed
**File:** `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/status.ts`
- When status changes to `approved`: creates `creator_approved` notification
- When status changes to `rejected`: creates `creator_rejected` notification
- Context: `{ programId, projectId }`

### 3. Mission Submitted
**File:** `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`
- When a mission is submitted, notifies all project team members (owners, admins, moderators)
- Type: `mission_submitted`
- Context: `{ missionId, programId, creatorProfileId }`

### 4. Mission Reviewed
**File:** `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`
- When mission is approved: creates `mission_approved` notification for creator
- When mission is rejected: creates `mission_rejected` notification for creator
- Context: `{ missionId, programId, projectId }`

## API Endpoints

### 1. Get Notifications
**File:** `src/web/pages/api/portal/notifications.ts`

**Endpoint:** `GET /api/portal/notifications?limit=50&offset=0`

**Returns:**
```json
{
  "ok": true,
  "notifications": [...],
  "unreadCount": 5
}
```

**Permissions:** Users can only fetch their own notifications

### 2. Mark as Read
**File:** `src/web/pages/api/portal/notifications/mark-read.ts`

**Endpoint:** `POST /api/portal/notifications/mark-read`

**Input:**
```json
{
  "ids": ["uuid1", "uuid2"]  // Optional: if not provided, marks all as read
}
```

**Returns:**
```json
{
  "ok": true,
  "message": "Marked 5 notification(s) as read",
  "marked": 5
}
```

**Permissions:** Users can only mark their own notifications as read

## UI Components

### 1. Notifications Icon
**File:** `src/web/components/portal/NotificationsIcon.tsx`

- Bell icon in Portal header
- Shows unread count badge
- Links to `/portal/notifications`
- Polls for updates every 30 seconds
- Only visible when user is logged in

### 2. Notifications Page
**File:** `src/web/pages/portal/notifications.tsx`

**Features:**
- Lists all notifications (newest first)
- Shows unread count
- "Mark All as Read" button
- Individual "Mark as Read" buttons
- Clickable notifications that link to relevant pages:
  - Creator Manager programs → `/portal/arc/my-creator-programs/[programId]`
  - Mission submissions → `/portal/arc/creator-manager/[programId]?tab=missions`
- Human-readable notification text
- Timestamps

## Notification Types

| Type | Recipient | Trigger |
|------|-----------|---------|
| `creator_invited` | Invited creator | Creator invited to program |
| `creator_approved` | Creator | Creator application approved |
| `creator_rejected` | Creator | Creator application rejected |
| `mission_submitted` | Project team (owners/admins/moderators) | Creator submits mission |
| `mission_approved` | Creator | Mission submission approved |
| `mission_rejected` | Creator | Mission submission rejected |

## Files Created/Updated

**New Files:**
1. `supabase/migrations/20241220_add_notifications_table.sql`
2. `src/web/lib/notifications.ts`
3. `src/web/pages/api/portal/notifications.ts`
4. `src/web/pages/api/portal/notifications/mark-read.ts`
5. `src/web/components/portal/NotificationsIcon.tsx`
6. `src/web/pages/portal/notifications.tsx`
7. `NOTIFICATIONS_IMPLEMENTATION.md`

**Updated Files:**
1. `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts` - Added notification on invite
2. `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/status.ts` - Added notifications on status change
3. `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts` - Added notification on submission
4. `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts` - Added notification on review
5. `src/web/components/portal/PortalLayout.tsx` - Added notifications icon

## How to Test

### 1. Run Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20241220_add_notifications_table.sql
```

### 2. Test Notifications Flow

**Creator Invited:**
1. As admin, invite a creator to a program
2. Check notifications for the invited creator
3. Should see "creator_invited" notification

**Creator Approved:**
1. As admin, approve a creator
2. Check notifications for the creator
3. Should see "creator_approved" notification

**Mission Submitted:**
1. As creator, submit a mission
2. Check notifications for project admins/moderators
3. Should see "mission_submitted" notification

**Mission Approved:**
1. As admin, approve a mission
2. Check notifications for the creator
3. Should see "mission_approved" notification

### 3. Test UI

1. Navigate to any Portal page
2. Check header for notifications bell icon
3. Click icon to go to notifications page
4. Verify unread count badge appears
5. Click "Mark All as Read" or individual mark buttons
6. Verify notifications become read

## Security

- All API endpoints verify user identity via session token
- Users can only fetch/update their own notifications
- RLS policies ensure data isolation
- Server-side permission checks before creating notifications

## Notes

- Notifications are created server-side only (no direct user inserts)
- Unread count is polled every 30 seconds in the icon component
- Notifications link to relevant Creator Manager pages
- Context JSONB allows flexible storage of related IDs
- Future: Can add email/push notifications using the same structure

