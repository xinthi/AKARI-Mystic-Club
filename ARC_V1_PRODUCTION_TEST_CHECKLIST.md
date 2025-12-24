# ARC V1 Production Smoke Test Checklist

**Date:** 2025-01-23  
**Purpose:** Final production verification checklist for ARC v1 implementation

---

## Pre-Deployment Verification

### 1. Build Verification ✅
- [x] Next.js build passes (`npm run build`)
- [x] TypeScript compilation succeeds
- [x] No linter errors
- [ ] Vercel deployment commit SHA matches main HEAD

### 2. Database Migration
- [x] Migration `20250123_add_arc_quest_completions.sql` applied
- [x] Table `arc_quest_completions` exists
- [x] RLS policies configured (service_role full access, authenticated SELECT)
- [x] Unique constraint on (profile_id, mission_id, arena_id) exists

---

## Production Smoke Tests

### Test 1: Basic ARC Portal Access

**Endpoint:** `GET /portal/arc`

**Expected:**
- [ ] Page loads successfully
- [ ] No console errors
- [ ] Shows list of ARC-enabled projects (if any)

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 2: Project Hub Page with Missions

**Endpoint:** `GET /portal/arc/<project-slug>`

**Prerequisites:**
- Project must have ARC access approved
- Project must have at least one arena

**Expected:**
- [ ] Page loads successfully
- [ ] Shows project information
- [ ] "Missions" tab is visible and accessible
- [ ] Missions list displays with 4 missions:
  - [ ] "Share your first thread" (intro-thread)
  - [ ] "Post a meme" (meme-drop)
  - [ ] "Quote RT an announcement" (signal-boost)
  - [ ] "Publish a deep dive" (deep-dive)
- [ ] Missions show correct status (Locked if user not joined, Available if joined, Completed if completed)
- [ ] "Mark Complete" button appears for Available missions (when user is logged in and has joined)

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 3: Option 3 Gamified Leaderboard API

**Endpoint:** `GET /api/portal/arc/gamified/<projectId>`

**Prerequisites:**
- Project must have `option3_gamified_unlocked=true` in `arc_project_features`
- Project must have ARC access approved

**Test 3a: Valid Request**
- [ ] Returns 200 status
- [ ] Response: `{ ok: true, arena: {...}, entries: [...], quests: [...] }`
- [ ] `arena` object contains: `id`, `name`, `slug`
- [ ] `entries` array contains leaderboard entries with: `creator_profile_id`, `twitter_username`, `effective_points`, `rank`
- [ ] `quests` array contains quests from active arena

**Test 3b: Access Control (Option 3 Locked)**
- [ ] Call with project that has Option 3 locked
- [ ] Returns 403 status
- [ ] Response: `{ ok: false, error: "ARC Option 3 is not unlocked for this project" }` (or similar)

**Test 3c: Invalid Project**
- [ ] Call with invalid/non-existent projectId
- [ ] Returns 400 or 403 with appropriate error message

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 4: Quest Completions GET Endpoint

**Endpoint:** `GET /api/portal/arc/quests/completions?arenaId=<arenaId>`

**Test 4a: Authenticated User**
- [ ] Call with valid session token and arenaId
- [ ] Returns 200 status
- [ ] Response: `{ ok: true, completions: [...] }`
- [ ] `completions` array contains objects with `mission_id` and `completed_at`
- [ ] Only returns completions for current authenticated user

**Test 4b: Unauthenticated User**
- [ ] Call without session token
- [ ] Returns 401 status
- [ ] Response: `{ ok: false, error: "Authentication required" }`

**Test 4c: Invalid Arena**
- [ ] Call with invalid/non-existent arenaId
- [ ] Returns 200 with empty completions array or 404

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 5: Quest Completion POST Endpoint

**Endpoint:** `POST /api/portal/arc/quests/complete`

**Body:** `{ arenaId: "<arenaId>", missionId: "<missionId>" }`

**Test 5a: Valid Completion**
- [ ] Call with valid session token, arenaId, and missionId
- [ ] Returns 200 status
- [ ] Response: `{ ok: true }`
- [ ] Row inserted/upserted in `arc_quest_completions` table
- [ ] Row has correct: `profile_id`, `arena_id`, `mission_id`, `completed_at`

**Test 5b: Unauthenticated User**
- [ ] Call without session token
- [ ] Returns 401 status

**Test 5c: Invalid Mission ID**
- [ ] Call with invalid missionId (not one of: intro-thread, meme-drop, signal-boost, deep-dive)
- [ ] Returns 400 status
- [ ] Response: `{ ok: false, error: "Invalid missionId" }`

**Test 5d: Invalid Arena**
- [ ] Call with invalid/non-existent arenaId
- [ ] Returns 404 status
- [ ] Response: `{ ok: false, error: "Arena not found" }`

**Test 5e: Duplicate Completion**
- [ ] Call twice with same arenaId + missionId for same user
- [ ] Both calls return 200
- [ ] Only one row exists in database (unique constraint respected)

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 6: End-to-End Mission Completion Flow

**Flow:**
1. Navigate to `/portal/arc/<project-slug>`
2. Ensure user is logged in and has joined the campaign
3. Go to "Missions" tab
4. Find an Available mission (not locked, not completed)
5. Click "Mark Complete" button
6. Verify mission status updates to "Completed"
7. Refresh page
8. Verify mission still shows as "Completed"

**Expected:**
- [ ] "Mark Complete" button appears for Available missions
- [ ] Button shows "Marking..." state while processing
- [ ] After completion, mission status updates to "Completed"
- [ ] Mission shows "Completed" status after page refresh
- [ ] Completed mission no longer shows "Mark Complete" button

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 7: Mission Status Logic

**Test 7a: Locked State**
- [ ] User not logged in → All missions show "Locked"
- [ ] User logged in but not joined → All missions show "Locked"
- [ ] Locked missions don't show "Mark Complete" button

**Test 7b: Available State**
- [ ] User logged in and joined → Missions show "Available" (if not completed)
- [ ] Available missions show "Mark Complete" button

**Test 7c: Completed State**
- [ ] After marking mission complete → Mission shows "Completed"
- [ ] Completed missions don't show "Mark Complete" button
- [ ] Completed status persists after page refresh

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 8: Arena Switching

**Flow:**
1. Navigate to project with multiple arenas
2. Select Arena A → Complete a mission in Arena A
3. Switch to Arena B
4. Verify Arena B shows missions as Available (not completed)
5. Complete a mission in Arena B
6. Switch back to Arena A
7. Verify Arena A still shows completed mission as Completed

**Expected:**
- [ ] Completions are per-arena (not shared across arenas)
- [ ] Switching arenas updates completion status correctly
- [ ] Completed missions persist when switching back

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

### Test 9: Error Handling

**Test 9a: Network Errors**
- [ ] Disconnect network → Attempt to mark mission complete
- [ ] Shows appropriate error message
- [ ] Button returns to normal state (not stuck in "Marking..." state)

**Test 9b: Server Errors**
- [ ] Simulate 500 error (e.g., database connection issue)
- [ ] Shows appropriate error message
- [ ] Button returns to normal state

**Test 9c: Invalid Requests**
- [ ] Submit completion with missing fields
- [ ] Returns 400 with clear error message

**Status:** ⬜ Pass / ⬜ Fail  
**Notes:**

---

## Production Deployment Verification

### Deployment Checklist
- [ ] Code pushed to main branch
- [ ] Vercel deployment successful
- [ ] Deployment SHA matches main HEAD commit
- [ ] No build errors in Vercel logs
- [ ] Environment variables configured correctly

### Post-Deployment Verification
- [ ] All smoke tests pass (see above)
- [ ] No errors in production logs
- [ ] Database migrations applied successfully
- [ ] RLS policies working correctly

---

## Known Issues / Limitations

### V1 Scope Limitations
1. **Mission IDs are hardcoded strings** - Future enhancement: Map missions to actual `arc_quests` table entries
2. **Manual completion only** - Future enhancement: Auto-complete missions based on content creation/scoring
3. **No completion validation** - Users can mark missions complete without actually completing the task (v1 MVP)

### Notes
- Quest completions use `mission_id` (string) rather than `quest_id` (UUID) to match existing hardcoded mission structure
- Completion tracking is per-user per-arena (same mission can be completed in different arenas)

---

## Sign-Off

**Tester:** _______________________  
**Date:** _______________________  
**Status:** ⬜ All Tests Pass / ⬜ Issues Found

**Issues Found:**
1. 
2. 
3. 

---

## Quick Reference

### API Endpoints

**Option 3 Gamified:**
- `GET /api/portal/arc/gamified/[projectId]` - Returns leaderboard + quests

**Quest Completions:**
- `GET /api/portal/arc/quests/completions?arenaId=<id>` - Get user's completions
- `POST /api/portal/arc/quests/complete` - Mark mission as complete
  - Body: `{ arenaId: string, missionId: string }`

**Valid Mission IDs:**
- `intro-thread`
- `meme-drop`
- `signal-boost`
- `deep-dive`

### Database Tables

**arc_quest_completions:**
- `profile_id` (UUID, FK to profiles)
- `mission_id` (TEXT)
- `arena_id` (UUID, FK to arenas)
- `completed_at` (TIMESTAMPTZ)
- Unique constraint: (profile_id, mission_id, arena_id)

