# Creator Gamification v1 Implementation

## Summary

This implementation adds a basic gamification layer to Creator Manager with levels, classes, XP rewards, and badges.

## Database Migration

**File:** `supabase/migrations/20241218_add_creator_gamification_tables.sql`

Creates 2 tables:
- `creator_manager_badges` - Badge definitions
- `creator_manager_creator_badges` - Badge awards to creators

## Helper Library

**File:** `src/web/lib/creator-gamification.ts`

Provides:
- `calculateLevel(xp)` - Calculate level from XP (1-5)
- `getLevelInfo(xp)` - Get detailed level info with progress
- `CREATOR_CLASSES` - Valid class enum
- `isValidClass()` - Validate class
- `getSuggestedClass()` - TODO: Auto-classification (placeholder)

### Level Mapping
- Level 1: 0-99 XP
- Level 2: 100-249 XP
- Level 3: 250-499 XP
- Level 4: 500-999 XP
- Level 5: 1000+ XP

## API Endpoints

### Class Management
- **POST** `/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/class`
  - Update creator class (admin/moderator only)
  - Input: `{ class: "Vanguard" | "Analyst" | "Amplifier" | "Explorer" | null }`

### Mission Approval (XP Reward)
- **POST** `/api/portal/creator-manager/missions/[missionId]/approve`
  - Approve mission and award XP
  - Input: `{ creatorProfileId: string }`
  - Behavior: Sets mission progress to "approved" and adds `reward_xp` to creator's XP
  - TODO: Connect to sentiment/engagement ARC scoring engine

### Badge Management
- **POST** `/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges`
  - Award badge to creator
  - Input: `{ badgeSlug: string }`
  - Behavior: Creates badge if doesn't exist, links to creator
  - TODO: Auto-badge rules based on milestones

### Updated Endpoints
- **GET** `/api/portal/creator-manager/programs/[programId]/creators` - Now includes `creatorLevel`
- **GET** `/api/portal/creator-manager/my-programs` - Now includes `creatorLevel` and `class`

## UI Pages

### Project Admin Side
- **`/portal/arc/creator-manager/[programId]`** - Program detail page
  - Creators tab: Shows XP, Level, Class with dropdown to change class
  - Deals tab: List and manage deals
  - Missions tab: Placeholder

### Creator Side
- **`/portal/arc/my-creator-programs`** - Creator's programs view
  - Shows XP, Level, Class for each program
  - XP progress bar to next level
  - Apply button for available programs

## How to Test

1. Run migration: `supabase/migrations/20241218_add_creator_gamification_tables.sql`

2. **Test Level Calculation:**
   ```typescript
   import { calculateLevel, getLevelInfo } from '@/lib/creator-gamification';
   calculateLevel(150); // Returns 2
   getLevelInfo(150); // Returns { level: 2, xp: 150, xpForNextLevel: 250, xpProgress: 50 }
   ```

3. **Test Class Update:**
   ```bash
   curl -X POST http://localhost:3000/api/portal/creator-manager/programs/PROGRAM_ID/creators/CREATOR_ID/class \
     -H "Content-Type: application/json" \
     -H "Cookie: akari_session=..." \
     -d '{"class": "Vanguard"}'
   ```

4. **Test Mission Approval:**
   ```bash
   curl -X POST http://localhost:3000/api/portal/creator-manager/missions/MISSION_ID/approve \
     -H "Content-Type: application/json" \
     -H "Cookie: akari_session=..." \
     -d '{"creatorProfileId": "PROFILE_ID"}'
   ```

5. **Test Badge Award:**
   ```bash
   curl -X POST http://localhost:3000/api/portal/creator-manager/programs/PROGRAM_ID/creators/CREATOR_ID/badges \
     -H "Content-Type: application/json" \
     -H "Cookie: akari_session=..." \
     -d '{"badgeSlug": "narrative_master"}'
   ```

## TODO Markers in Code

1. **Auto-classification** (`src/web/lib/creator-gamification.ts`)
   - TODO: Implement `getSuggestedClass()` based on ARC points, mission completion, engagement metrics

2. **Mission Approval** (`src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`)
   - TODO: Connect to sentiment and engagement based ARC scoring engine
   - TODO: Auto-approve missions based on engagement metrics

3. **Badge Auto-awarding** (`src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges.ts`)
   - TODO: Add auto-badge rules based on:
     - ARC points milestones
     - Mission completion streaks
     - Engagement metrics
     - Content quality scores

## Features

✅ Level calculation from XP (1-5 levels)
✅ Class management (Vanguard, Analyst, Amplifier, Explorer)
✅ XP rewards on mission approval
✅ Badge system (manual awarding)
✅ UI display of XP, Level, Class
✅ Progress bars for XP to next level

## Future Enhancements

- Auto-classification based on performance
- Auto-badge awarding rules
- Badge display in UI
- Leaderboards with levels
- Achievement system
- XP multipliers and bonuses

