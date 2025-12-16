# ARC System - Manual QA Test Plan

**Version:** 1.0  
**Date:** 2025-01-XX  
**Scope:** ARC Home, Top Projects, Project Pages, Creator Manager, Admin Controls, Leaderboard Requests

---

## Test Personas

1. **SuperAdmin** - Full access to all ARC features, can classify projects, approve leaderboard requests
2. **Project Admin/Moderator** - Can manage Creator Manager programs for their projects
3. **Creator** - Can view public programs, apply to programs, view their own programs

---

## A. SuperAdmin Tests

### A1. ARC Home Page (`/portal/arc`)

**Prerequisites:**
- User has `super_admin` role in `akari_user_roles` or `profiles.real_roles`
- At least 3 projects with `profile_type='project'` exist in database

**Steps:**
1. Navigate to `/portal/arc`
2. Verify page loads without errors
3. Verify "ARC Universe" header is visible
4. Verify Top Projects treemap/heatmap is displayed
5. Verify projects shown have `profile_type='project'` (check database)
6. Verify "Gainers" and "Losers" toggle works
7. Verify timeframe selector (24h, 7d, 30d, 90d) works
8. Click on a project tile that has `arc_active=true` AND `arc_access_level != 'none'`
9. Verify routing:
   - If `arc_access_level='creator_manager'` → redirects to `/portal/arc/creator-manager?projectId=...`
   - If `arc_access_level='leaderboard'` or `'gamified'` → redirects to `/portal/arc/project/[projectId]`
10. Click on a locked project (gray tile) - verify it does NOT navigate
11. Verify "Admin ARC" link in navigation is visible
12. Verify summary stats are displayed (if available)

**Expected Results:**
- Page loads successfully
- Treemap shows projects with `profile_type='project'` only
- Clickable projects route correctly based on `arc_access_level`
- Locked projects are gray and non-clickable
- No console errors

**Screenshots:**
- [ ] ARC Home page with treemap visible
- [ ] Clickable vs locked project tiles (side by side)
- [ ] Navigation showing "Admin ARC" link

---

### A2. Admin Projects Page (`/portal/admin/projects`)

**Prerequisites:**
- User is SuperAdmin
- At least 5 projects exist in database

**Steps:**
1. Navigate to `/portal/admin/projects`
2. Verify page loads and shows project table
3. Verify columns: Project, ARC Tier, Status, Security, Arenas, Actions
4. Find a project with `profile_type=null` or `profile_type='personal'`
5. Click "Classify" button for that project
6. In modal:
   - Select "Project" as Ecosystem Type
   - Toggle "Is Company" if applicable
   - Set `arc_access_level` to "creator_manager"
   - Toggle `arc_active` to ON
   - Click "Save"
7. Verify success toast appears
8. Refresh page and verify project now shows in table with updated values
9. Navigate to `/portal/arc` and verify project appears in treemap
10. Click on the project tile - verify it routes to Creator Manager
11. Go back to Admin Projects
12. Change `arc_access_level` to "leaderboard"
13. Refresh `/portal/arc` and click project - verify it routes to `/portal/arc/project/[projectId]`
14. Test `arc_active` toggle - turn OFF
15. Refresh `/portal/arc` - verify project tile is now gray/locked

**Expected Results:**
- Classification modal works
- `profile_type`, `arc_access_level`, `arc_active` updates persist
- Changes reflect immediately in ARC Home treemap
- Clickability matches `arc_active=true AND arc_access_level != 'none'`

**Screenshots:**
- [ ] Admin Projects table
- [ ] Classification modal
- [ ] Project with updated ARC settings

---

### A3. ARC Admin Home (`/portal/arc/admin`)

**Prerequisites:**
- User is SuperAdmin
- At least 1 project with `arc_active=true` and `profile_type='project'` exists

**Steps:**
1. Navigate to `/portal/arc/admin`
2. Verify page loads without "Not authenticated" error
3. Verify table shows projects with `arc_active=true` and `profile_type='project'`
4. Verify columns: Project, ARC Tier, Status, Security, Arenas, Actions
5. Click "Manage Arenas" for a project
6. Verify redirects to `/portal/arc/admin/[projectSlug]`
7. Go back and click "Edit Settings"
8. Verify modal opens with project metadata fields
9. Update banner URL, accent color, tagline
10. Click "Save"
11. Verify success message
12. Refresh and verify changes persisted

**Expected Results:**
- Page loads with projects table
- No authentication errors
- Arenas and settings modals work
- Data persists after save

**Screenshots:**
- [ ] ARC Admin table
- [ ] Edit Settings modal

---

### A4. Leaderboard Requests (`/portal/admin/arc/leaderboard-requests`)

**Prerequisites:**
- User is SuperAdmin
- At least 1 pending leaderboard request exists (created by a Creator)

**Steps:**
1. Navigate to `/portal/admin/arc/leaderboard-requests`
2. Verify page loads and shows requests table
3. Verify columns: Project, Requester, Justification, Status, Actions
4. Find a request with status "pending"
5. Click "Approve" button
6. In modal:
   - Select `arc_access_level` (leaderboard or gamified)
   - Click "Approve"
7. Verify success toast
8. Verify request status changed to "approved" in table
9. Check database - verify:
   - `arc_leaderboard_requests.status = 'approved'`
   - `projects.arc_active = true` for that project
   - `projects.arc_access_level = [selected value]`
10. Navigate to `/portal/arc`
11. Verify project now appears clickable in treemap
12. Click project - verify routes to `/portal/arc/project/[projectId]`
13. Go back to leaderboard requests
14. Find another pending request
15. Click "Reject"
16. Verify request status changed to "rejected"
17. Verify project `arc_active` and `arc_access_level` did NOT change

**Expected Results:**
- Requests table loads
- Approve sets project `arc_active=true` and `arc_access_level`
- Reject only updates request status
- Approved projects become clickable in treemap

**Screenshots:**
- [ ] Leaderboard requests table
- [ ] Approve modal
- [ ] Approved request in table

---

## B. Project Admin/Moderator Tests

### B1. Creator Manager Home (`/portal/arc/creator-manager`)

**Prerequisites:**
- User is project owner/admin/moderator for at least 1 project
- Project has `arc_access_level='creator_manager'` or `'gamified'`
- User has `canManage` permission for the project

**Steps:**
1. Navigate to `/portal/arc/creator-manager`
2. Verify page loads
3. If `projectId` query param exists, verify it shows that project's programs
4. If no `projectId`, verify dropdown shows projects user can manage
5. Select a project from dropdown
6. Verify programs list loads for that project
7. Verify columns: Program, Status, Creators, ARC Points, Actions
8. Click "Create Program" button
9. Verify redirects to `/portal/arc/creator-manager/create?projectId=...`

**Expected Results:**
- Page loads with user's manageable projects
- Programs list shows correctly
- Create Program button works

**Screenshots:**
- [ ] Creator Manager home with programs list
- [ ] Project dropdown

---

### B2. Create Program (`/portal/arc/creator-manager/create`)

**Prerequisites:**
- User is project admin/moderator
- `projectId` query param provided (UUID or slug)

**Steps:**
1. Navigate to `/portal/arc/creator-manager/create?projectId=[valid-project-id]`
2. Verify page loads
3. Verify project field shows project name (read-only if `projectId` provided)
4. If no `projectId`, verify project dropdown appears
5. Fill form:
   - Title: "Q1 Creator Program"
   - Description: "Test program description"
   - Visibility: Select "public"
   - Start date: Today's date
   - End date: 30 days from now
6. Click "Create Program"
7. Verify loading state
8. Verify success toast
9. Verify redirect to `/portal/arc/creator-manager/[programId]`
10. Verify program detail page shows created program

**Expected Results:**
- Form validates required fields
- Program created successfully
- Redirects to program detail page
- No access denied errors

**Screenshots:**
- [ ] Create Program form
- [ ] Success toast
- [ ] Program detail page after creation

---

### B3. Program Detail - Overview Tab (`/portal/arc/creator-manager/[programId]`)

**Prerequisites:**
- User is project admin/moderator
- Program exists and user has `canManage` permission

**Steps:**
1. Navigate to `/portal/arc/creator-manager/[programId]`
2. Verify page loads
3. Verify tabs: Overview, Creators, Deals, Missions, Links
4. Verify Overview tab shows:
   - Program title and description
   - Status badge
   - Stats: Total Creators, Approved, Pending, Total ARC Points
5. Verify "Edit Program" button works
6. Verify program metadata is editable

**Expected Results:**
- All tabs visible
- Overview shows correct stats
- Edit functionality works

**Screenshots:**
- [ ] Program Overview tab
- [ ] Stats cards

---

### B4. Program Detail - Creators Tab

**Steps:**
1. Click "Creators" tab
2. Verify creators table loads
3. Verify columns: Creator, Status, ARC Points, XP, Level, Class, Deal, Actions
4. Click "Invite Creators" button
5. In modal:
   - Enter Twitter usernames: "@creator1, @creator2"
   - Click "Invite"
6. Verify success toast
7. Verify creators appear in table with status "pending"
8. Find a pending creator
9. Click "Approve" button
10. Verify status changes to "approved"
11. Find an approved creator
12. Click "Reject" button
13. Verify status changes to "rejected"
14. Click on a creator row
15. Verify redirects to `/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]`

**Expected Results:**
- Invite modal works
- Creators appear with correct status
- Approve/reject actions work
- Creator detail page accessible

**Screenshots:**
- [ ] Creators table
- [ ] Invite Creators modal
- [ ] Creator status actions

---

### B5. Program Detail - Deals Tab

**Steps:**
1. Click "Deals" tab
2. Verify deals list loads
3. Click "Add Deal" button
4. In modal:
   - Internal Label: "Tier 1 Deal"
   - Description: "High-value creators"
   - Visibility: "private"
   - Click "Create"
5. Verify deal appears in list
6. Find a creator in Creators tab
7. Click "Assign Deal" dropdown
8. Select the created deal
9. Verify deal assigned to creator
10. Go back to Deals tab
11. Verify deal shows in list with creator count

**Expected Results:**
- Deals can be created
- Deals can be assigned to creators
- Deal visibility works

**Screenshots:**
- [ ] Deals tab
- [ ] Add Deal modal
- [ ] Deal assigned to creator

---

### B6. Program Detail - Missions Tab

**Steps:**
1. Click "Missions" tab
2. Verify missions list loads
3. Click "Add Mission" button
4. In modal:
   - Title: "Create Thread"
   - Description: "Post a thread about the project"
   - ARC Points Min: 10
   - ARC Points Max: 50
   - XP Reward: 100
   - Active: ON
   - Click "Create"
5. Verify mission appears in list
6. Click "View Submissions" for the mission
7. Verify submissions modal opens
8. Verify submissions table shows (if any exist)
9. Close modal
10. Click "Edit" on a mission
11. Verify edit modal opens with pre-filled data
12. Update mission details
13. Click "Save"
14. Verify changes persisted

**Expected Results:**
- Missions can be created
- Missions can be edited
- Submissions view works

**Screenshots:**
- [ ] Missions tab
- [ ] Add Mission modal
- [ ] Submissions modal

---

### B7. Creator Detail Page (`/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]`)

**Steps:**
1. Navigate to creator detail page
2. Verify page loads
3. Verify sections:
   - Creator Info (username, avatar, status)
   - ARC Points & XP
   - Current Deal
   - Class Assignment
   - Badges
4. Change creator status via dropdown
5. Verify status updates
6. Assign a deal via dropdown
7. Verify deal assigned
8. Assign a class via dropdown
9. Verify class assigned
10. Click "Add Badge" button
11. In modal:
   - Badge ID: "narrative_master"
   - Display Name: "Narrative Master"
   - Description: "Awarded for exceptional narrative content"
   - Click "Create"
12. Verify badge appears in badges list

**Expected Results:**
- All creator management actions work
- Status, deal, class, badges can be updated
- Changes persist

**Screenshots:**
- [ ] Creator detail page
- [ ] Badge creation modal

---

## C. Creator Tests

### C1. My Creator Programs (`/portal/arc/my-creator-programs`)

**Prerequisites:**
- User has `creator` role in `profiles.real_roles`
- User has been invited to or applied to at least 1 program

**Steps:**
1. Navigate to `/portal/arc/my-creator-programs`
2. Verify page loads
3. Verify programs list shows:
   - Programs where user is invited (status: pending/approved)
   - Programs where user applied (status: pending/approved)
4. Verify columns: Program, Project, Status, ARC Points, XP, Level, Actions
5. Click on a program
6. Verify redirects to `/portal/arc/my-creator-programs/[programId]`

**Expected Results:**
- Programs list shows user's programs
- Status badges are correct
- Navigation to program detail works

**Screenshots:**
- [ ] My Creator Programs list

---

### C2. Program Detail - Creator View (`/portal/arc/my-creator-programs/[programId]`)

**Steps:**
1. Navigate to program detail page
2. Verify page loads
3. Verify sections:
   - Program Info (title, description, project)
   - Your Stats (ARC Points, XP, Level, Class)
   - Your Badges
   - Missions
   - Leaderboard (if program is public/hybrid)
4. Scroll to Missions section
5. Find an active mission
6. Click "Submit" button
7. In modal:
   - Post URL: "https://x.com/username/status/1234567890"
   - Tweet ID: "1234567890"
   - Notes: "Test submission"
   - Click "Submit"
8. Verify success toast
9. Verify mission status changes to "Submitted"
10. Verify submission appears in "Your Submissions" section
11. Wait for admin approval (or test as admin)
12. Verify mission status changes to "Approved"
13. Verify ARC Points and XP increased

**Expected Results:**
- Creator can view program details
- Mission submission works
- Stats update after approval
- Badges display correctly

**Screenshots:**
- [ ] Creator program detail page
- [ ] Mission submission modal
- [ ] Stats after approval

---

### C3. Apply to Public Program

**Prerequisites:**
- User is creator
- A public or hybrid program exists

**Steps:**
1. Navigate to `/portal/arc/creator-manager`
2. Find a public program (or navigate directly if you know the programId)
3. Click "Apply" button (if visible)
4. Verify success toast: "Application submitted successfully"
5. Navigate to `/portal/arc/my-creator-programs`
6. Verify program appears with status "pending"
7. Wait for admin approval (or test as admin)
8. Verify status changes to "approved"
9. Verify program is now accessible in "My Creator Programs"

**Expected Results:**
- Creator can apply to public/hybrid programs
- Application creates `creator_manager_creators` with status "pending"
- Duplicate applications are prevented (shows "already pending" error)

**Screenshots:**
- [ ] Apply button on public program
- [ ] Application success toast
- [ ] Program in "My Creator Programs" with pending status

---

### C4. Project ARC Page - Leaderboard Request

**Prerequisites:**
- User is creator
- A project exists with `arc_active=false` or `arc_access_level='none'`

**Steps:**
1. Navigate to `/portal/arc/project/[projectId]` (for a locked project)
2. Verify page loads
3. Verify "Request Leaderboard Access" section is visible
4. Enter justification: "I want to participate in this project's ARC leaderboard"
5. Click "Submit Request"
6. Verify success toast: "Request submitted successfully"
7. Verify request form disappears (or shows "Request pending" message)
8. Try to submit again
9. Verify error: "You already have a pending request for this project"
10. Navigate to `/portal/admin/arc/leaderboard-requests` as SuperAdmin
11. Verify request appears in table with status "pending"
12. Approve request (as SuperAdmin)
13. Go back to project page as creator
14. Verify leaderboard is now visible (if `arc_access_level='leaderboard'` or `'gamified'`)

**Expected Results:**
- Request form shows for locked projects
- Duplicate requests are prevented
- Request appears in admin queue
- Approval unlocks project for creator

**Screenshots:**
- [ ] Request Leaderboard Access form
- [ ] Success toast
- [ ] "Request pending" state
- [ ] Leaderboard after approval

---

## D. Cross-Persona Integration Tests

### D1. End-to-End Creator Workflow

**Steps:**
1. **As SuperAdmin:**
   - Classify a project: `profile_type='project'`, `arc_access_level='creator_manager'`, `arc_active=true`
2. **As Project Admin:**
   - Create a program for that project
   - Invite a creator (Twitter username)
   - Approve the creator
   - Assign a deal
   - Create a mission
3. **As Creator:**
   - Navigate to `/portal/arc/my-creator-programs`
   - Verify program appears
   - Open program detail
   - Submit mission
4. **As Project Admin:**
   - Review submission
   - Approve submission
5. **As Creator:**
   - Verify ARC Points and XP increased
   - Verify level up (if applicable)

**Expected Results:**
- Complete workflow functions end-to-end
- All data persists correctly
- Notifications work (if implemented)

**Screenshots:**
- [ ] Complete workflow sequence

---

### D2. Slug vs UUID Routing

**Steps:**
1. Find a project with a `slug` value
2. Navigate to `/portal/arc/project/[slug]`
3. Verify page loads correctly
4. Navigate to `/portal/arc/project/[uuid]` (same project)
5. Verify page loads correctly
6. Verify both URLs show the same project
7. Test in treemap - click project with slug
8. Verify URL uses slug if available, UUID if slug is null

**Expected Results:**
- Both slug and UUID routes work
- Slug is preferred when available
- UUID fallback works

**Screenshots:**
- [ ] Project page with slug URL
- [ ] Project page with UUID URL

---

### D3. Data Consistency Checks

**Steps:**
1. **Heatmap Inclusion:**
   - Verify only projects with `profile_type='project'` appear in treemap
   - Verify projects with `profile_type='personal'` do NOT appear
2. **Clickability:**
   - Verify projects with `arc_active=true AND arc_access_level != 'none'` are clickable
   - Verify projects with `arc_active=false` are locked (gray)
   - Verify projects with `arc_access_level='none'` are locked
3. **Routing:**
   - `arc_access_level='creator_manager'` → `/portal/arc/creator-manager?projectId=...`
   - `arc_access_level='leaderboard'` → `/portal/arc/project/[projectId]`
   - `arc_access_level='gamified'` → `/portal/arc/project/[projectId]`
   - `arc_access_level='none'` → locked (no click)

**Expected Results:**
- All data rules are consistent
- No discrepancies between UI and database

**Screenshots:**
- [ ] Database query results vs UI display

---

## E. Error Handling & Edge Cases

### E1. Access Denied Scenarios

**Steps:**
1. **As non-admin:**
   - Navigate to `/portal/arc/admin`
   - Verify access denied or redirect
2. **As non-project-admin:**
   - Navigate to `/portal/arc/creator-manager/create?projectId=[project-you-dont-own]`
   - Verify access denied message
3. **As non-creator:**
   - Navigate to `/portal/arc/my-creator-programs`
   - Verify appropriate message or empty state

**Expected Results:**
- Access control works correctly
- Clear error messages
- No crashes

**Screenshots:**
- [ ] Access denied states

---

### E2. Empty States

**Steps:**
1. Navigate to `/portal/arc` with no projects (`profile_type='project'`)
2. Verify empty state message
3. Navigate to `/portal/arc/creator-manager` with no programs
4. Verify empty state
5. Navigate to `/portal/arc/my-creator-programs` with no programs
6. Verify empty state

**Expected Results:**
- Empty states are user-friendly
- No errors or crashes

**Screenshots:**
- [ ] Empty state messages

---

### E3. Invalid Data

**Steps:**
1. Navigate to `/portal/arc/project/[invalid-uuid]`
2. Verify "Project not found" error
3. Navigate to `/portal/arc/creator-manager/[invalid-program-id]`
4. Verify "Program not found" error
5. Try to create program with missing required fields
6. Verify validation errors

**Expected Results:**
- Graceful error handling
- Clear error messages
- No crashes

**Screenshots:**
- [ ] Error states

---

## F. Performance & UI Polish

### F1. Loading States

**Steps:**
1. Navigate to `/portal/arc` with slow network (throttle in DevTools)
2. Verify loading spinner appears
3. Verify content loads progressively
4. Test all pages for loading states

**Expected Results:**
- Loading states are visible
- No blank screens

**Screenshots:**
- [ ] Loading states

---

### F2. Responsive Design

**Steps:**
1. Test all ARC pages on mobile viewport (375px)
2. Test on tablet viewport (768px)
3. Test on desktop (1920px)
4. Verify treemap is responsive or has mobile fallback

**Expected Results:**
- Pages are usable on all screen sizes
- Treemap has fallback list view on mobile

**Screenshots:**
- [ ] Mobile view
- [ ] Tablet view
- [ ] Desktop view

---

## Test Completion Checklist

- [ ] All SuperAdmin tests passed
- [ ] All Project Admin/Moderator tests passed
- [ ] All Creator tests passed
- [ ] All integration tests passed
- [ ] All error handling tests passed
- [ ] All screenshots captured
- [ ] No console errors
- [ ] No crashes
- [ ] Data consistency verified

---

## Known Issues / Notes

_Add any issues found during testing here_

---

## Sign-off

**Tester:** _________________  
**Date:** _________________  
**Status:** ☐ PASS  ☐ FAIL  ☐ BLOCKED

