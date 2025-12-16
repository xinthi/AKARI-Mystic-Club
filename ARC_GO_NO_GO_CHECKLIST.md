# ARC System - GO/NO-GO Checklist

**Version:** 1.0  
**Date:** 2025-01-XX  
**Reviewer:** _________________

---

## Critical Blockers (Must Pass for Production)

### B1. Authentication & Authorization

- [ ] **B1.1** All ARC pages require authentication (no public access)
  - **Test:** Navigate to `/portal/arc` without session → should redirect to `/portal`
  - **File:** `src/web/pages/portal/arc/index.tsx` (getServerSideProps)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B1.2** SuperAdmin-only pages enforce role check
  - **Test:** Non-admin tries `/portal/arc/admin` → access denied
  - **Files:** 
    - `src/web/pages/portal/arc/admin/index.tsx`
    - `src/web/pages/portal/admin/projects.tsx`
    - `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B1.3** Project Admin/Moderator permissions enforced
  - **Test:** Non-admin tries to create program for project they don't own → access denied
  - **File:** `src/web/pages/portal/arc/creator-manager/create.tsx`
  - **API:** `src/web/pages/api/portal/creator-manager/programs.ts` (POST)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B1.4** Creator role required for creator endpoints
  - **Test:** Non-creator tries `/portal/arc/my-creator-programs` → appropriate message
  - **File:** `src/web/pages/portal/arc/my-creator-programs/index.tsx`
  - **API:** `src/web/pages/api/portal/creator-manager/my-programs.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B2. Data Rules Consistency

- [ ] **B2.1** Top Projects heatmap ONLY includes `profile_type='project'`
  - **Test:** Verify database query filters by `profile_type='project'` only
  - **File:** `src/web/pages/api/portal/arc/top-projects.ts` (line 196)
  - **Database Check:** Run query: `SELECT id, display_name, profile_type FROM projects WHERE profile_type='project'` → all should appear in heatmap
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B2.2** Clickability rule: `arc_active=true AND arc_access_level != 'none'`
  - **Test:** 
    - Project with `arc_active=true, arc_access_level='leaderboard'` → clickable
    - Project with `arc_active=false` → locked (gray)
    - Project with `arc_access_level='none'` → locked (gray)
  - **Files:**
    - `src/web/components/arc/ArcTopProjectsTreemap.tsx` (line 274)
    - `src/web/pages/portal/arc/index.tsx` (line 626)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B2.3** Routing rules match `arc_access_level`
  - **Test:**
    - `arc_access_level='creator_manager'` → routes to `/portal/arc/creator-manager?projectId=...`
    - `arc_access_level='leaderboard'` → routes to `/portal/arc/project/[projectId]`
    - `arc_access_level='gamified'` → routes to `/portal/arc/project/[projectId]`
    - `arc_access_level='none'` → locked (no click)
  - **Files:**
    - `src/web/pages/portal/arc/index.tsx` (lines 982-987)
    - `src/web/components/arc/ArcTopProjectsTreemap.tsx` (onProjectClick)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B2.4** Project page supports both UUID and slug routing
  - **Test:**
    - Navigate to `/portal/arc/project/[slug]` → loads correctly
    - Navigate to `/portal/arc/project/[uuid]` → loads correctly
    - Both show same project
  - **File:** `src/web/pages/portal/arc/project/[projectId].tsx` (lines 135-154)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B3. RLS & Database Policies

- [ ] **B3.1** No RLS blocking server-side queries in `getServerSideProps`
  - **Test:** All ARC pages load without "Not authenticated" errors
  - **Files:**
    - `src/web/pages/portal/arc/admin/index.tsx` (uses `getSupabaseAdmin()`)
    - `src/web/pages/portal/arc/index.tsx` (uses `createPortalClient()`)
  - **Note:** Admin pages should use `getSupabaseAdmin()`, public pages can use `createPortalClient()`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B3.2** API endpoints use service role key for admin operations
  - **Test:** All API routes that modify data use `getSupabaseAdmin()`
  - **Files:**
    - `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`
    - `src/web/pages/api/portal/creator-manager/programs.ts`
    - `src/web/pages/api/portal/admin/projects/classify.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B3.3** No RLS policies blocking legitimate reads
  - **Test:** 
    - SuperAdmin can read all projects
    - Project admins can read their projects
    - Creators can read public programs
  - **Database:** Check RLS policies on `projects`, `creator_manager_programs`, `creator_manager_creators`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B4. Core Workflows

- [ ] **B4.1** Creator Manager Create Program workflow complete
  - **Test:**
    1. Navigate to `/portal/arc/creator-manager/create?projectId=...`
    2. Fill form and submit
    3. Program created successfully
    4. Redirects to program detail page
  - **Files:**
    - `src/web/pages/portal/arc/creator-manager/create.tsx`
    - `src/web/pages/api/portal/creator-manager/programs.ts` (POST)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B4.2** Invite Creators workflow complete
  - **Test:**
    1. Open program detail → Creators tab
    2. Click "Invite Creators"
    3. Enter Twitter usernames
    4. Submit
    5. Creators appear with status "pending"
  - **Files:**
    - `src/web/pages/portal/arc/creator-manager/[programId].tsx` (Invite modal)
    - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B4.3** Approve/Reject Creators workflow complete
  - **Test:**
    1. Find pending creator
    2. Click "Approve"
    3. Status changes to "approved"
    4. Click "Reject" on another creator
    5. Status changes to "rejected"
  - **Files:**
    - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/status.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B4.4** Assign Deal/Class workflow complete
  - **Test:**
    1. Create a deal
    2. Assign deal to creator
    3. Assign class to creator
    4. Verify both persist
  - **Files:**
    - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/deal.ts`
    - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/class.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B4.5** Creator Apply workflow complete
  - **Test:**
    1. Creator navigates to public program
    2. Clicks "Apply"
    3. Application submitted
    4. Appears in "My Creator Programs" with status "pending"
  - **Files:**
    - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/apply.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B4.6** Leaderboard Request workflow complete
  - **Test:**
    1. Creator navigates to locked project page
    2. Submits leaderboard request
    3. Request appears in admin queue
    4. SuperAdmin approves
    5. Project becomes clickable in heatmap
  - **Files:**
    - `src/web/pages/api/portal/arc/leaderboard-requests.ts` (POST)
    - `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` (PATCH)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B5. No Empty Treemap When Projects Exist

- [ ] **B5.1** Treemap shows projects when `profile_type='project'` projects exist
  - **Test:**
    1. Ensure at least 3 projects with `profile_type='project'` exist
    2. Navigate to `/portal/arc`
    3. Verify treemap displays projects (not empty)
    4. If treemap fails, verify fallback list view shows projects
  - **Files:**
    - `src/web/pages/portal/arc/index.tsx` (SafeTreemapWrapper, TopProjectsListFallback)
    - `src/web/pages/api/portal/arc/top-projects.ts`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B5.2** Empty state shows when no `profile_type='project'` projects exist
  - **Test:**
    1. Temporarily set all projects to `profile_type='personal'`
    2. Navigate to `/portal/arc`
    3. Verify empty state message (not blank page)
  - **File:** `src/web/pages/portal/arc/index.tsx`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B6. No "Coming Soon" Placeholders

- [ ] **B6.1** All ARC pages show real content (no placeholders)
  - **Test:** Search codebase for "Coming Soon" in ARC pages
  - **Command:** `grep -r "Coming Soon" src/web/pages/portal/arc`
  - **Result:** Should return 0 matches (or only in comments)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B6.2** Leaderboard pages show real data (not placeholders)
  - **Test:**
    - Navigate to `/portal/arc/project/[projectId]` with `arc_access_level='leaderboard'`
    - Verify leaderboard table shows real data or empty state (not "Coming Soon")
  - **File:** `src/web/pages/portal/arc/project/[projectId].tsx`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

### B7. Build & Runtime Errors

- [ ] **B7.1** No ESLint errors that break Vercel build
  - **Test:** Run `npm run lint` or `pnpm lint` in `src/web`
  - **Critical Rules:**
    - `react/no-unescaped-entities` (no unescaped quotes in JSX)
    - `react-hooks/exhaustive-deps` (useEffect/useCallback deps)
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B7.2** No missing environment variables
  - **Test:** Check all ARC API routes for required env vars:
    - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`
  - **Files:** All API routes in `src/web/pages/api/portal/arc` and `src/web/pages/api/portal/creator-manager`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B7.3** No SSR crashes
  - **Test:** 
    - All ARC pages load without 500 errors
    - Check server logs for errors in `getServerSideProps`
  - **Files:** All pages in `src/web/pages/portal/arc`
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

- [ ] **B7.4** No missing imports
  - **Test:** 
    - Run `npm run build` or `pnpm build`
    - Verify no "Module not found" errors
  - **Status:** ☐ PASS  ☐ FAIL  ☐ NOT TESTED

---

## Non-Blockers (Nice to Have)

### N1. UI/UX Polish

- [ ] **N1.1** Loading states are smooth and informative
- [ ] **N1.2** Error messages are user-friendly
- [ ] **N1.3** Empty states have helpful messages
- [ ] **N1.4** Responsive design works on mobile/tablet
- [ ] **N1.5** Treemap has mobile fallback (list view)

---

### N2. Performance

- [ ] **N2.1** API responses are fast (< 500ms for most endpoints)
- [ ] **N2.2** Treemap renders without lag (< 1s for 20 projects)
- [ ] **N2.3** No unnecessary re-renders
- [ ] **N2.4** Images are optimized

---

### N3. Edge Cases

- [ ] **N3.1** Handles projects with missing `slug` gracefully
- [ ] **N3.2** Handles projects with missing `display_name` gracefully
- [ ] **N3.3** Handles programs with no creators gracefully
- [ ] **N3.4** Handles creators with no missions gracefully

---

## Test Results Summary

### Blockers Status
- **Total Blockers:** 25
- **Passed:** ___ / 25
- **Failed:** ___ / 25
- **Not Tested:** ___ / 25

### Critical Failures
_List any blocker failures here:_

1. 
2. 
3. 

---

## GO/NO-GO Decision

**Decision:** ☐ **GO**  ☐ **NO-GO**  ☐ **CONDITIONAL GO**

**Conditions (if Conditional GO):**
1. 
2. 
3. 

**Notes:**
_Add any additional notes or concerns here_

---

## Sign-off

**Reviewer:** _________________  
**Date:** _________________  
**Approved by:** _________________  
**Date:** _________________

