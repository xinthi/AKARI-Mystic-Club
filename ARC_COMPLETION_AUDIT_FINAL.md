# ARC Completion Audit Report
**Date:** 2025-01-27  
**Auditors:** Senior Frontend Engineer, Senior Backend Engineer, QA Lead, Product/BD Lead  
**Scope:** Complete end-to-end audit of ARC (Arena Reputation Circuit) system  
**Status:** INDEPENDENT AUDIT - READ-ONLY ANALYSIS

## Executive Summary

**ARC Completion Verdict:** NOT FINISHED

While the ARC system has substantial implementation, critical gaps remain in end-to-end flows, particularly around admin actions, report navigation after ending items, and UI state management. Several P0 blockers prevent shipping to production.

## Step 1: Inventory Map (Ground Truth)

### 1.1 ARC Pages Inventory

#### Public/User Pages (`src/web/pages/portal/arc/`)

| Route | File | Auth Required | APIs Called | Credentials Include | Notes |
|-------|------|---------------|-------------|---------------------|-------|
| `/portal/arc` | `index.tsx` | Yes (tier: seer) | `/api/portal/arc/top-projects`, `/api/portal/arc/live-leaderboards` (via hook) | Yes (line 231) | ARC home with treemap + live items |
| `/portal/arc/[slug]` | `[slug].tsx` | Yes (tier: analyst) | Multiple (project, arenas, campaigns, etc.) | Yes (multiple lines) | Project hub page |
| `/portal/arc/[slug]/arena/[arenaSlug]` | `[slug]/arena/[arenaSlug].tsx` | Public | Arena details API | Yes (multiple lines) | Arena detail page |
| `/portal/arc/gamified/[projectId]` | `gamified/[projectId].tsx` | Yes (tier: analyst) | `/api/portal/arc/gamified/[projectId]` | Yes (line 126, 138, 150, etc.) | Gamified leaderboard |
| `/portal/arc/leaderboard/[projectId]` | `leaderboard/[projectId].tsx` | Yes (tier: analyst) | `/api/portal/arc/leaderboard/[projectId]` | Yes (line 33, 52, 64) | Normal leaderboard |
| `/portal/arc/creator/[twitterUsername]` | `creator/[twitterUsername].tsx` | Yes | `/api/portal/arc/creator` | Yes (implied) | Creator profile |
| `/portal/arc/project/[projectId]` | `project/[projectId].tsx` | Yes | Project APIs | Yes (line 132, 179, etc.) | Project page |
| `/portal/arc/report` | `report.tsx` | Yes | `/api/portal/admin/arc/item-report` | Yes (line 49) | Report page (generic) |
| `/portal/arc/requests` | `requests.tsx` | Yes (tier: seer) | `/api/portal/arc/leaderboard-requests` | Yes (line 145, 202) | Request listing |
| `/portal/arc/leaderboards` | `leaderboards/index.tsx` | Yes | `/api/portal/arc/leaderboards` | Yes (line 136) | Leaderboards index |
| `/portal/arc/creator-manager/index` | `creator-manager/index.tsx` | Yes | Creator manager APIs | Yes (line 69) | Creator manager home |
| `/portal/arc/creator-manager/[programId]` | `creator-manager/[programId].tsx` | Yes | Program APIs | Yes (multiple lines) | Program detail |
| `/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]` | `creator-manager/[programId]/creators/[creatorProfileId].tsx` | Yes | Creator APIs | Yes (multiple lines) | Creator detail |
| `/portal/arc/creator-manager/create` | `creator-manager/create.tsx` | Yes | Project APIs | Yes (line 95, 184) | Create program |
| `/portal/arc/my-creator-programs` | `my-creator-programs/index.tsx` | Yes | `/api/portal/creator-manager/my-programs` | Yes (line 49) | User's programs |
| `/portal/arc/my-creator-programs/[programId]` | `my-creator-programs/[programId].tsx` | Yes | Program APIs | Yes (multiple lines) | User program detail |

#### Admin Pages

| Route | File | Auth Required | APIs Called | Credentials Include | Notes |
|-------|------|---------------|-------------|---------------------|-------|
| `/portal/arc/admin` | `admin/index.tsx` | SuperAdmin | `/api/portal/admin/arc/dashboard-stats`, `/api/portal/admin/arc/super-admins`, `/api/portal/admin/arc/pricing` | Yes (lines 110, 135, 161, 188, 200) | Super admin dashboard |
| `/portal/arc/admin/[projectSlug]` | `admin/[projectSlug].tsx` | Project Admin/Owner | `/api/portal/arc/arenas`, `/api/portal/arc/permissions`, `/api/portal/arc/arenas-admin` | Yes (lines 74, 116, 142, 191) | Project arena management |
| `/portal/arc/admin/profiles` | `admin/profiles.tsx` | SuperAdmin | `/api/portal/admin/arc/profiles` | Yes (line 68, 152) | Profile management |
| `/portal/admin/arc/leaderboard-requests` | `portal/admin/arc/leaderboard-requests.tsx` | SuperAdmin | `/api/portal/admin/arc/leaderboard-requests`, `/api/portal/admin/arc/live-item/action` | Yes (multiple lines) | Request approvals + actions |
| `/portal/admin/arc/reports/[kind]/[id]` | `portal/admin/arc/reports/[kind]/[id].tsx` | SuperAdmin | `/api/portal/admin/arc/reports` | Yes (line 68) | End report detail |

### 1.2 ARC API Routes Inventory

#### Public Portal APIs (`src/web/pages/api/portal/arc/`)

**Total: 54 API files**

Key endpoints:
- `GET /api/portal/arc/projects` - List ARC projects
- `GET /api/portal/arc/live-leaderboards` - Live and upcoming items (all 3 kinds)
- `GET /api/portal/arc/top-projects` - Top gainers/losers
- `GET /api/portal/arc/arenas` - List arenas
- `GET /api/portal/arc/arenas/[slug]` - Arena details
- `GET /api/portal/arc/arenas/[slug]/leaderboard` - Arena leaderboard
- `GET /api/portal/arc/campaigns` - List campaigns
- `GET /api/portal/arc/campaigns/[id]` - Campaign details
- `GET /api/portal/arc/campaigns/[id]/leaderboard` - Campaign leaderboard
- `GET /api/portal/arc/gamified/[projectId]` - Gamified program
- `GET /api/portal/arc/leaderboard/[projectId]` - Normal leaderboard
- `GET /api/portal/arc/project/[projectId]` - Project data
- `GET /api/portal/arc/permissions` - Check permissions
- `POST /api/portal/arc/join-leaderboard` - Join leaderboard
- `POST /api/portal/arc/join-campaign` - Join campaign

#### Admin APIs (`src/web/pages/api/portal/admin/arc/`)

**Total: 16 API files**

Key endpoints:
- `GET /api/portal/admin/arc/leaderboard-requests` - List requests
- `POST /api/portal/admin/arc/leaderboard-requests/[id]` - Approve/reject request
- `POST /api/portal/admin/arc/live-item/action` - Pause/Restart/End/Reinstate (P0)
- `GET /api/portal/admin/arc/item-report` - Get item report (used by `/portal/arc/report`)
- `GET /api/portal/admin/arc/reports` - Get detailed report (used by `/portal/admin/arc/reports/[kind]/[id]`)
- `POST /api/portal/admin/arc/backfill-live-items` - Backfill live items
- `GET /api/portal/admin/arc/dashboard-stats` - Dashboard stats
- `GET /api/portal/admin/arc/pricing` - Get/update pricing

### 1.3 Source-of-Truth Database Fields for Status

| Kind | Table | Status Field | Possible Values | Notes |
|------|-------|--------------|-----------------|-------|
| Arena | `arenas` | `status` | `'draft'`, `'scheduled'`, `'active'`, `'paused'`, `'ended'`, `'cancelled'` | `paused` added via migration `20250127_add_paused_status_to_arenas.sql` |
| Campaign | `arc_campaigns` | `status` | `'draft'`, `'live'`, `'paused'`, `'ended'` | Defined in migration `20250104_add_arc_crm_tables.sql` |
| Gamified | `creator_manager_programs` | `status` | Check schema for exact values | Likely `'active'`, `'paused'`, `'ended'` |

**Evidence:**
- `src/web/pages/api/portal/admin/arc/live-item/action.ts` lines 97-273 shows status transitions
- Migration files define status constraints
- Arena pause action uses `'cancelled'` status (line 114) but migration allows `'paused'` - **INCONSISTENCY FOUND**

---

## Step 2: Quality Gates Results

### 2.1 Forbidden Keywords Check

**Command:** `pnpm guard:forbidden`  
**Result:** FAILED - 743 violations found

**Findings:**
- All violations are horizontal rule markers (`---`) in markdown documentation files
- These are pre-existing and not introduced by ARC implementation
- No forbidden competitor names or keywords found in ARC code
- **Impact:** P2 (documentation only, not code)

**Files with violations:** All `.md` files in root directory (documentation only)

### 2.2 Lint Check

**Command:** `pnpm lint`  
**Status:** NOT RUN (requires additional setup verification)

### 2.3 Build Check

**Command:** `pnpm build`  
**Status:** NOT RUN (requires additional setup verification)

**Note:** Both lint and build should be run before final approval, but are deferred due to environment constraints.

---

## Step 3: End-to-End QA Test Script

### Test Checklist

#### 1. ARC Home Loads Treemap + Live + Upcoming (Desktop)

**Route:** `/portal/arc`  
**Expected Network Calls:**
- `GET /api/portal/arc/top-projects?mode=gainers&timeframe=7d&limit=30` (credentials: include)
- `GET /api/portal/arc/live-leaderboards?limit=15` (credentials: include)

**Expected Response:**
- `top-projects`: `{ ok: true, items: [...] }` with `projectId`, `growth_pct`, `name`
- `live-leaderboards`: `{ ok: true, leaderboards: [...], upcoming: [...] }` with `kind`, `title`, `projectName`

**Expected UI:**
- Treemap visible on desktop (if items available)
- Live section shows items with status "Live"
- Upcoming section shows items with status "Upcoming"
- All 3 kinds (arena, campaign, gamified) appear if available

**Verification:**
- ✅ API calls confirmed in `src/web/pages/portal/arc/index.tsx` line 231
- ✅ Hook usage confirmed: `useArcLiveItems()` in line 201
- ⚠️ **GAP:** No verification that all 3 kinds are returned (need to check `/api/portal/arc/live-leaderboards` logic)

#### 2. ARC Home Mobile Layout

**Route:** `/portal/arc` (mobile viewport)  
**Expected:** FB-like layout with treemap visible  
**Verification:**
- ✅ Mobile layout component exists: `src/web/components/arc/fb/mobile/MobileLayout.tsx`
- ✅ Desktop layout: `src/web/components/arc/fb/DesktopArcShell.tsx`
- ⚠️ **GAP:** Need to verify treemap visibility on mobile (may be hidden or scaled)

#### 3. All 3 Kinds Appear in Live Leaderboards

**Route:** API endpoint `/api/portal/arc/live-leaderboards`  
**Expected Response:**
```json
{
  "ok": true,
  "leaderboards": [
    { "kind": "arena", ... },
    { "kind": "campaign", ... },
    { "kind": "gamified", ... }
  ],
  "upcoming": [...]
}
```

**Verification:**
- ✅ API file exists: `src/web/pages/api/portal/arc/live-leaderboards.ts`
- ✅ Uses `getArcLiveItems()` helper (line 55)
- ⚠️ **NEED TO VERIFY:** Helper function implementation ensures all 3 kinds are included

#### 4. Approve Request → Appears in Live/Upcoming Without Manual Steps

**Route:** `/portal/admin/arc/leaderboard-requests`  
**Actions:**
1. Click "Approve" on a pending request
2. Request should automatically appear in live/upcoming feed

**Expected Flow:**
- `POST /api/portal/admin/arc/leaderboard-requests/[id]` with `{ action: 'approve' }`
- Backfill should trigger automatically or item should appear immediately
- Live items should update via `refetch()` or automatic refresh

**Verification:**
- ✅ Approve handler exists in `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
- ⚠️ **GAP:** No clear evidence of automatic backfill or immediate UI update
- ⚠️ **GAP:** Need to verify approval triggers live item creation

#### 5. Admin Actions: Pause/Restart/End/Reinstate

**Route:** `/portal/arc` (main feed) and `/portal/admin/arc/leaderboard-requests` (admin page)  
**Test Flow:**

**5a. Pause**
- Click "Pause" on a live item
- **Expected:** Status changes to `paused` (campaign/gamified) or `cancelled` (arena)
- **Expected:** UI buttons update immediately (no full reload)
- **API:** `POST /api/portal/admin/arc/live-item/action` with `{ kind, id, action: 'pause' }`
- **Verification:**
  - ✅ API exists: `src/web/pages/api/portal/admin/arc/live-item/action.ts` lines 112-115 (arena), 174-176 (campaign), 231-233 (gamified)
  - ✅ UI component: `src/web/components/arc/fb/LiveItemCard.tsx` lines 34-69
  - ✅ Optimistic update in admin page: `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` lines 360-377
  - ⚠️ **BUG FOUND:** Arena pause uses `'cancelled'` status (line 114) but should use `'paused'` per migration

**5b. Restart**
- Click "Restart" on a paused item
- **Expected:** Status changes back to `active` (arena/gamified) or `live` (campaign)
- **Expected:** UI updates immediately
- **Verification:**
  - ✅ API logic exists: lines 116-119 (arena), 177-179 (campaign), 234-236 (gamified)
  - ✅ UI calls refetch via `onActionSuccess()` callback

**5c. End**
- Click "End" on a live/paused item
- **Expected:** Status changes to `ended`
- **Expected:** "View report" button/link appears or navigates automatically
- **API:** `POST /api/portal/admin/arc/live-item/action` with `{ action: 'end' }`
- **Verification:**
  - ✅ API logic exists: lines 119-124 (arena), 180-185 (campaign), 237-242 (gamified)
  - ✅ Admin page navigates to report: `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` lines 417-419
  - ⚠️ **GAP:** Main feed (`LiveItemCard`) does NOT navigate to report after ending (lines 34-69)
  - ⚠️ **GAP:** Report route inconsistency - admin uses `/portal/admin/arc/reports/[kind]/[id]` but generic report page uses `/portal/arc/report?kind=...&id=...`

**5d. Reinstate**
- Click "Reinstate" on an ended item
- **Expected:** Status changes back to `active`/`live`
- **Verification:**
  - ✅ API logic exists: lines 125-131 (arena), 186-188 (campaign), 243-245 (gamified)

#### 6. View Report After Ending

**Route:** After ending item, should navigate to report page  
**Expected Routes:**
- Admin page: `/portal/admin/arc/reports/[kind]/[id]` (uses `/api/portal/admin/arc/reports`)
- Generic: `/portal/arc/report?kind=[kind]&id=[id]` (uses `/api/portal/admin/arc/item-report`)

**Expected Response:**
- Report data with stats (participants, posts, views, etc.) or "N/A" for missing metrics

**Verification:**
- ✅ Admin report page exists: `src/web/pages/portal/admin/arc/reports/[kind]/[id].tsx`
- ✅ Generic report page exists: `src/web/pages/portal/arc/report.tsx`
- ✅ API endpoints exist: `item-report.ts` and `reports.ts`
- ⚠️ **GAP:** Main feed cards do NOT navigate to report after ending
- ⚠️ **GAP:** Report pages show "N/A" for most metrics (expected for v1, but should be documented)

#### 7. Activity Feed Renders or Shows Clean Empty State

**Route:** `/portal/arc` (left sidebar/feed)  
**Expected:** Activity feed shows ARC-related activities or clean empty state  
**Verification:**
- ✅ Hook exists: `useArcNotifications()` in `src/web/pages/portal/arc/index.tsx` line 202
- ✅ Component uses activities: `DesktopArcShell` and `MobileLayout` receive `activities` prop
- ⚠️ **NEED TO VERIFY:** Hook implementation and data source

---

## Step 4: Gap Analysis & Punch List

### P0 Blockers (Cannot Ship)

#### P0-1: Arena Pause Uses Wrong Status
**File:** `src/web/pages/api/portal/admin/arc/live-item/action.ts`  
**Line:** 114  
**Issue:** Arena pause action sets status to `'cancelled'` but migration `20250127_add_paused_status_to_arenas.sql` adds `'paused'` status. This creates inconsistency where paused arenas cannot be distinguished from cancelled ones.  
**Evidence:**
- Line 114: `newStatus = 'cancelled';` for arena pause
- Migration allows `'paused'` status (line 10 of migration file)
- Campaign and gamified correctly use `'paused'` (lines 175, 232)

**Fix:**
```typescript
if (action === 'pause') {
  newStatus = 'paused';  // Changed from 'cancelled'
  updateData.status = newStatus;
}
```

**Verification:**
1. Pause an arena
2. Check database: `SELECT status FROM arenas WHERE id = '...'` should show `'paused'`
3. Restart should work correctly

#### P0-2: Main Feed Cards Don't Navigate to Report After Ending
**File:** `src/web/components/arc/fb/LiveItemCard.tsx`  
**Lines:** 34-69  
**Issue:** When ending an item from the main feed card, the UI does not navigate to the report page. Admin page does navigate (line 419 of leaderboard-requests.tsx), but main feed does not.  
**Evidence:**
- `LiveItemCard.handleAction()` (lines 34-69) calls API and triggers `onActionSuccess()` but does NOT check if action was 'end' to navigate
- Admin page correctly navigates: `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` lines 417-419

**Fix:**
```typescript
if (!res.ok || !data.ok) {
  throw new Error(data.error || 'Failed to perform action');
}

// Navigate to report if ending
if (action === 'end' && data.status === 'ended') {
  window.location.href = `/portal/admin/arc/reports/${item.kind}/${item.id}`;
  return; // Don't trigger refetch since we're navigating away
}

// Trigger refetch of live items
if (onActionSuccess) {
  onActionSuccess();
}
```

**Verification:**
1. End an item from main feed card
2. Should automatically navigate to `/portal/admin/arc/reports/[kind]/[id]`
3. Report should load and display data

#### P0-3: Missing Status Filter for Paused Items
**File:** `src/web/pages/portal/arc/index.tsx`  
**Line:** 214  
**Issue:** The `timeFilter` only supports `'all' | 'live' | 'upcoming'` but does not show paused items. Paused items may disappear from view entirely.  
**Evidence:**
- `timeFilter` state: line 215 `const [timeFilter, setTimeFilter] = useState<'all' | 'live' | 'upcoming'>('all');`
- `useArcLiveItems` hook filters by status, but paused items may not appear in either "live" or "upcoming"
- Need to verify `live-leaderboards` API includes paused items

**Fix Options:**
1. Add `'paused'` to filter options
2. Ensure paused items appear in "Live" section with paused badge
3. Add separate "Paused" filter option

**Verification:**
1. Pause an item
2. Check if it appears in feed (should show in "Live" with paused status)
3. Filter should work correctly

#### P0-4: Route Inconsistency for Reports
**Files:**
- `src/web/pages/portal/arc/report.tsx` (generic report page)
- `src/web/pages/portal/admin/arc/reports/[kind]/[id].tsx` (admin report page)

**Issue:** Two different report routes exist with different APIs:
- Generic: `/portal/arc/report?kind=...&id=...` uses `/api/portal/admin/arc/item-report`
- Admin: `/portal/admin/arc/reports/[kind]/[id]` uses `/api/portal/admin/arc/reports`

**Evidence:**
- Generic report: `src/web/pages/portal/arc/report.tsx` line 48
- Admin report: `src/web/pages/portal/admin/arc/reports/[kind]/[id].tsx` line 68
- Different API endpoints return different shapes

**Fix:** Standardize on one route and API, or clearly document when to use each.

**Recommendation:** Use admin route for all reports (more detailed), or unify APIs.

### P1 Important (Ship with Caution)

#### P1-1: No Automatic Backfill After Approval
**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`  
**Issue:** When approving a request, the live item may not appear immediately in the feed without manual backfill.  
**Evidence:** Need to verify approval logic triggers backfill or creates live item immediately.

**Fix:** Ensure approval automatically creates/updates live item or triggers backfill.

#### P1-2: Report Metrics Show "N/A" (Expected but Should Document)
**Files:**
- `src/web/pages/api/portal/admin/arc/item-report.ts` lines 127-136, 169-178, 211-220
- `src/web/pages/api/portal/admin/arc/reports.ts` lines 137-145, 191-199, 245-253

**Issue:** Most report metrics return 0 (displayed as "N/A") because aggregation from `user_ct_activity` is not implemented. This is acceptable for v1 but should be clearly documented.

**Evidence:** All metrics except `participants` are hardcoded to 0 with comments indicating future implementation.

**Fix:** Document this limitation clearly in UI or add TODO comments.

#### P1-3: Mobile Treemap Visibility Unverified
**File:** `src/web/components/arc/fb/mobile/MobileLayout.tsx`  
**Issue:** Need to verify treemap is visible and usable on mobile devices.  
**Verification Required:** Test on actual mobile device or responsive viewport.

### P2 Nice-to-Have

#### P2-1: Activity Feed May Not Filter ARC Activities
**File:** `src/web/lib/arc/useArcNotifications.ts`  
**Issue:** Need to verify activity feed filters to ARC-related activities only.  
**Verification Required:** Check hook implementation.

#### P2-2: Loading States Could Be More Granular
**File:** `src/web/components/arc/fb/LiveItemCard.tsx`  
**Issue:** Loading state shows spinner for all actions, but could show action-specific loading (e.g., "Ending...", "Pausing...").  
**Current:** Single `loadingAction` state  
**Enhancement:** Action-specific loading messages

---

## Step 5: Git Status & Publishing

### Git Status

**Command:** `git status`  
**Result:** Not a git repository (or parent directories)

**Note:** Project is not initialized as a git repository. No commit plan can be created until git is initialized.

### Release Readiness Checklist

**Before Shipping:**
- [ ] Fix P0-1: Arena pause status
- [ ] Fix P0-2: Main feed report navigation
- [ ] Fix P0-3: Paused items visibility
- [ ] Fix P0-4: Report route consistency
- [ ] Verify P1-1: Automatic backfill after approval
- [ ] Document P1-2: Report metrics limitations
- [ ] Test P1-3: Mobile treemap
- [ ] Run `pnpm lint` and fix all errors
- [ ] Run `pnpm build` and fix all TypeScript errors
- [ ] Initialize git repository (if not already)
- [ ] Create commit plan with fixes

**Post-Fix Commit Plan (when ready):**
```
fix(arc): use 'paused' status for arena pause action
fix(arc): navigate to report after ending item from main feed
fix(arc): ensure paused items appear in feed
fix(arc): standardize report routes

Files:
- src/web/pages/api/portal/admin/arc/live-item/action.ts
- src/web/components/arc/fb/LiveItemCard.tsx
- src/web/pages/portal/arc/index.tsx
- (additional files as needed)
```

---

## Summary

**Critical Findings:**
1. Arena pause uses wrong status (`cancelled` instead of `paused`)
2. Main feed cards don't navigate to report after ending
3. Paused items may not appear in feed
4. Report routes are inconsistent

**Recommended Actions:**
1. Fix all P0 items before shipping
2. Address P1 items for better UX
3. Run full quality gates (lint, build)
4. Test end-to-end flows after fixes

**Completion Status:** ARC is **NOT FINISHED** due to P0 blockers. After fixes, re-audit to confirm completion.

