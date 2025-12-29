# Creator Gamification v1 - Complete Implementation

## ✅ Completed

### Database
- ✅ Migration: `supabase/migrations/20241218_add_creator_gamification_tables.sql`
  - `creator_manager_badges` table
  - `creator_manager_creator_badges` table
  - Indexes and RLS policies

### Helper Library
- ✅ `src/web/lib/creator-gamification.ts`
  - Level calculation functions (1-5 levels based on XP)
  - Class validation
  - Level info with progress calculation
  - TODO: Auto-classification placeholder

### API Endpoints
- ✅ `POST /api/portal/creator-manager/programs/[programId]/creators/[creatorId]/class` - Update creator class
- ✅ `POST /api/portal/creator-manager/missions/[missionId]/approve` - Approve mission and award XP
- ✅ `POST /api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges` - Award badge
- ✅ Updated `GET /api/portal/creator-manager/programs/[programId]/creators` - Now includes `creatorLevel`
- ✅ Updated `GET /api/portal/creator-manager/my-programs` - Now includes `creatorLevel` and `class`

### UI Pages
- ✅ `/portal/arc/creator-manager/[programId]` - Program detail page with Creators tab showing XP, Level, Class
- ✅ `/portal/arc/my-creator-programs` - Creator's programs view with XP, Level, Class, and progress bars

## Files Changed/Created

### New Files
1. `supabase/migrations/20241218_add_creator_gamification_tables.sql`
2. `src/web/lib/creator-gamification.ts`
3. `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/class.ts`
4. `src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`
5. `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges.ts`
6. `src/web/pages/portal/arc/creator-manager/[programId].tsx`
7. `src/web/pages/portal/arc/my-creator-programs.tsx`
8. `CREATOR_GAMIFICATION_IMPLEMENTATION.md`
9. `CREATOR_GAMIFICATION_COMPLETE.md`

### Updated Files
1. `src/web/pages/api/portal/creator-manager/programs/[programId]/creators.ts` - Added `creatorLevel` to response
2. `src/web/pages/api/portal/creator-manager/my-programs.ts` - Added `creatorLevel` and `class` to response

## How to Test

### 1. Run Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20241218_add_creator_gamification_tables.sql
```

### 2. Test Level Calculation
```typescript
import { calculateLevel, getLevelInfo } from '@/lib/creator-gamification';

calculateLevel(0);    // 1
calculateLevel(100);  // 2
calculateLevel(250);  // 3
calculateLevel(500);  // 4
calculateLevel(1000); // 5

getLevelInfo(150); // { level: 2, xp: 150, xpForNextLevel: 250, xpProgress: 50 }
```

### 3. Test Class Update (Admin)
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/programs/PROGRAM_ID/creators/CREATOR_ID/class \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=YOUR_SESSION" \
  -d '{"class": "Vanguard"}'
```

### 4. Test Mission Approval (Admin)
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/missions/MISSION_ID/approve \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=YOUR_SESSION" \
  -d '{"creatorProfileId": "PROFILE_ID"}'
```
- Verify: Mission progress status = "approved"
- Verify: Creator XP increased by `mission.reward_xp`

### 5. Test Badge Award (Admin)
```bash
curl -X POST http://localhost:3000/api/portal/creator-manager/programs/PROGRAM_ID/creators/CREATOR_ID/badges \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=YOUR_SESSION" \
  -d '{"badgeSlug": "narrative_master"}'
```
- Verify: Badge created if doesn't exist
- Verify: Badge linked to creator

### 6. Test UI

**Project Admin:**
1. Navigate to `/portal/arc/creator-manager`
2. Click on a program
3. In Creators tab, verify:
   - XP column shows creator XP
   - Level column shows computed level
   - Class dropdown allows changing class
   - Status and Deal columns work

**Creator:**
1. Navigate to `/portal/arc/my-creator-programs`
2. Verify:
   - XP and Level displayed for each program
   - Class shown if assigned
   - XP progress bar to next level
   - Apply button for available programs

## API Usage Examples

### Update Creator Class
```typescript
const res = await fetch(
  `/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/class`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: 'Vanguard' }),
  }
);
```

### Approve Mission
```typescript
const res = await fetch(
  `/api/portal/creator-manager/missions/${missionId}/approve`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creatorProfileId: '...' }),
  }
);
// Response: { ok: true, xpAwarded: 50, newXp: 150 }
```

### Award Badge
```typescript
const res = await fetch(
  `/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/badges`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ badgeSlug: 'narrative_master' }),
  }
);
```

## TODO Markers

All TODO markers are clearly marked in code with comments:

1. **Auto-classification** - `src/web/lib/creator-gamification.ts`
   - TODO: Implement based on ARC points, mission completion, engagement

2. **Mission Auto-approval** - `src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`
   - TODO: Connect to sentiment/engagement ARC scoring engine
   - TODO: Auto-approve based on engagement metrics

3. **Badge Auto-awarding** - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges.ts`
   - TODO: Add rules for ARC milestones, streaks, engagement, quality scores

## Navigation

Add to Portal menu:
- **For Project Admins**: Link to `/portal/arc/creator-manager` (if user has project admin access)
- **For Creators**: Link to `/portal/arc/my-creator-programs` (if user has creator role)

## Notes

- Levels are computed on-the-fly from XP (no database column)
- Classes are manually assigned by admins (auto-classification coming later)
- XP is awarded when missions are approved
- Badges are manually awarded (auto-awarding coming later)
- All endpoints properly check project permissions
- UI is simple and clean, following existing design patterns

