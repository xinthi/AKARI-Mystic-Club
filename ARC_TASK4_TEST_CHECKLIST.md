# ARC Task 4 - Test Checklist

This document outlines the testing steps for ARC Task 4 implementation.

## Prerequisites

- Database migration `20250120_arc_task4_slug_history_and_point_adjustments.sql` has been applied
- SuperAdmin user account available for testing
- At least one project with `profile_type='project'` and an active arena

---

## Part A: Slug Safety

### A1: Slug Uniqueness Enforcement

**Test:** Ensure slugs are unique for projects only

1. Create or identify a project with `profile_type='project'` and slug `test-project`
2. Try to create another project with `profile_type='project'` and the same slug `test-project`
3. **Expected:** Should fail with uniqueness constraint error
4. Create a project with `profile_type='personal'` and slug `test-project`
5. **Expected:** Should succeed (uniqueness only enforced for `profile_type='project'`)

### A2: Slug History Tracking

**Test:** Verify old slugs are recorded when slug changes

1. Identify a project with slug `old-slug`
2. Update the project's slug to `new-slug` (via admin UI or direct DB update)
3. Query `project_slug_history` table:
   ```sql
   SELECT * FROM project_slug_history WHERE project_id = '<project_id>';
   ```
4. **Expected:** Should see a row with `slug='old-slug'` and `project_id` matching the project

### A3: Slug Resolution and Redirect

**Test:** Old slug should resolve to current project and indicate redirect

1. Use a project that has had its slug changed (has history entry)
2. Call API: `GET /api/portal/arc/project-by-slug?slug=<old-slug>`
3. **Expected Response:**
   ```json
   {
     "ok": true,
     "project": { "id": "...", "slug": "<new-slug>", ... },
     "canonicalSlug": "<new-slug>",
     "wasRedirected": true
   }
   ```
4. Call API with current slug: `GET /api/portal/arc/project-by-slug?slug=<new-slug>`
5. **Expected:** `wasRedirected: false`, `canonicalSlug` matches requested slug

---

## Part B: Legacy Route Redirect

### B1: Redirect to Active Arena

**Test:** Legacy leaderboard route redirects to active arena

1. Identify a project with:
   - Leaderboard module enabled and active
   - At least one active arena (status='active', current time between starts_at and ends_at)
2. Navigate to: `/portal/arc/leaderboard/<projectId>`
3. **Expected:** Should redirect to `/portal/arc/<projectSlug>/arena/<arenaSlug>`

### B2: No Active Arena Handling

**Test:** Legacy route shows message when no active arena

1. Identify a project with leaderboard enabled but no active arena
2. Navigate to: `/portal/arc/leaderboard/<projectId>`
3. **Expected:** Should show friendly message: "No active arena found for this project" with link back to ARC

### B3: Module Not Enabled Handling

**Test:** Legacy route shows message when module not enabled

1. Identify a project with leaderboard module disabled or inactive
2. Navigate to: `/portal/arc/leaderboard/<projectId>`
3. **Expected:** Should show message: "Leaderboard module is not enabled or active for this project"

---

## Part C: Point Adjustments

### C1: Create Adjustment (SuperAdmin Only)

**Test:** SuperAdmin can create point adjustments

1. Log in as SuperAdmin
2. Navigate to an arena page: `/portal/arc/<projectSlug>/arena/<arenaSlug>`
3. Find a creator in the leaderboard
4. Click "Adjust" button (should be visible for SuperAdmin only)
5. Fill in:
   - Points Delta: `-50` (negative for slashing)
   - Reason: `Test adjustment for scoring error`
6. Click "Apply Adjustment"
7. **Expected:**
   - Modal closes
   - Leaderboard refreshes
   - Creator's points show adjusted value (base - 50)
   - Base points shown in parentheses if different

### C2: View Adjustment History

**Test:** SuperAdmin can view adjustment history

1. As SuperAdmin, on arena page, click "History" button for a creator
2. **Expected:** Modal opens showing list of adjustments with:
   - Points delta (positive/negative)
   - Reason
   - Created date/time
3. Close modal

### C3: Non-SuperAdmin Cannot Adjust

**Test:** Regular users cannot see adjustment controls

1. Log in as non-SuperAdmin user
2. Navigate to arena page
3. **Expected:** "Adjust" and "History" buttons should NOT be visible
4. Try to call API directly: `POST /api/portal/arc/admin/point-adjustments`
5. **Expected:** Should return 403 Forbidden

### C4: Adjusted Points Display

**Test:** Leaderboard shows adjusted points as primary score

1. Create an adjustment for a creator (e.g., +100 points)
2. Refresh arena page
3. **Expected:**
   - Leaderboard shows adjusted points as main number
   - If adjusted != base, shows base in parentheses: `150 pts (50 base)`
   - Sorting uses adjusted points

### C5: Multiple Adjustments

**Test:** Multiple adjustments are summed correctly

1. Create multiple adjustments for same creator:
   - Adjustment 1: +50
   - Adjustment 2: -20
   - Adjustment 3: +30
2. **Expected:** Final adjusted points = base + (50 - 20 + 30) = base + 60

---

## Part D: Sentiment Overlay Stub

### D1: Sentiment Overlay UI

**Test:** Sentiment overlay stub is visible

1. Navigate to any arena page
2. Scroll to bottom
3. **Expected:** See "Sentiment (Beta)" collapsible panel
4. Click to expand
5. **Expected:** Shows:
   - "Coming soon" message
   - Enabled: Yes
   - Summary: Not available yet
   - Series: Not available yet

### D2: Sentiment in API Response

**Test:** Arena API includes sentiment stub

1. Call API: `GET /api/portal/arc/arenas/<arenaSlug>`
2. Check response for `sentiment` field
3. **Expected:**
   ```json
   {
     "sentiment": {
       "enabled": true,
       "summary": null,
       "series": []
     }
   }
   ```

---

## Integration Tests

### I1: End-to-End Flow

**Test:** Complete flow from legacy route to adjusted leaderboard

1. Start at legacy route: `/portal/arc/leaderboard/<projectId>`
2. Should redirect to: `/portal/arc/<projectSlug>/arena/<arenaSlug>`
3. As SuperAdmin, adjust points for a creator
4. Verify leaderboard updates with adjusted points
5. View adjustment history
6. Verify sentiment overlay stub is visible

### I2: Slug Redirect Flow

**Test:** Old slug redirects properly

1. Use a project with slug history (old slug exists)
2. Navigate to: `/portal/arc/<old-slug>/arena/<arenaSlug>`
3. **Expected:** Should redirect to `/portal/arc/<new-slug>/arena/<arenaSlug>` (if client-side redirect implemented)
4. Or API should return `wasRedirected: true` and client should handle redirect

---

## Edge Cases

### E1: No Adjustments

**Test:** Leaderboard works when no adjustments exist

1. Navigate to arena with creators but no adjustments
2. **Expected:** All creators show `adjusted_points = arc_points`, no parentheses

### E2: Zero Delta Adjustment

**Test:** Can create adjustment with zero delta

1. Create adjustment with `pointsDelta: 0` and reason "Documentation"
2. **Expected:** Should succeed, history shows 0 delta

### E3: Very Large Adjustments

**Test:** Large positive/negative adjustments work

1. Create adjustment with `pointsDelta: 10000`
2. **Expected:** Should work, leaderboard shows correct sum

### E4: Slug History for Multiple Projects

**Test:** Slug history prevents slug reuse

1. Project A has slug `test-slug`, then changes to `new-slug`
2. Try to set Project B's slug to `test-slug`
3. **Expected:** Should fail (unique constraint on `project_slug_history.slug`)

---

## Notes

- All SuperAdmin checks should work in both production and dev mode (dev mode may bypass auth for testing)
- Point adjustments should never directly modify `arena_creators.arc_points` - only log in `arc_point_adjustments`
- Slug resolution should check `projects.slug` first, then `project_slug_history.slug`
- Legacy route should gracefully handle missing project, missing arena, or disabled module

---

## Completion Criteria

- [ ] All Part A tests pass
- [ ] All Part B tests pass
- [ ] All Part C tests pass
- [ ] All Part D tests pass
- [ ] Integration tests pass
- [ ] Edge cases handled correctly
- [ ] No console errors in browser
- [ ] No API errors in server logs

