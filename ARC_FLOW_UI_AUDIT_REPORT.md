# ARC Leaderboard Flow & UI Audit Report

**Date:** 2026-01-03  
**Status:** Comprehensive Audit Complete

---

## Executive Summary

This audit covers the complete ARC leaderboard flow from request creation through approval to public display. All major components have been reviewed and verified.

**Overall Status:** ✅ **READY** (with minor recommendations)

---

## 1. Complete Flow Analysis

### 1.1 Request Creation Flow ✅

**Page:** `/portal/arc/requests`
**File:** `src/web/pages/portal/arc/requests.tsx`

**Flow:**
1. User (project owner/admin) visits `/portal/arc/requests`
2. Can create new request with:
   - Product Type: `ms` (Mindshare), `gamefi` (GameFi), or `crm`
   - Start/End dates (required for MS/GameFi)
   - Justification notes
3. Request submitted via `POST /api/portal/arc/leaderboard-requests`
4. Request status: `pending` → `approved` or `rejected`

**Verification:**
- ✅ Form validation for required fields
- ✅ Date validation (end > start)
- ✅ Permission check (only project owners/admins can request)
- ✅ Duplicate request prevention
- ✅ Deep-linking support (`?projectId=...&slug=...`)

**Issues Found:** None

---

### 1.2 Admin Approval Flow ✅

**Page:** `/portal/admin/arc/leaderboard-requests`
**File:** `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`

**Flow:**
1. SuperAdmin visits approval page
2. Sees list of pending requests with:
   - Project name/slug
   - Product type (MS/GameFi/CRM)
   - Start/End dates
   - Request date
3. Can approve/reject requests
4. On approval:
   - RPC `arc_admin_approve_leaderboard_request` called
   - Arena created/updated automatically
   - `arc_project_features` updated
   - `is_arc_company = true` set
   - Billing record created

**Verification:**
- ✅ SuperAdmin-only access
- ✅ Request list with status badges
- ✅ Approve/Reject actions
- ✅ Success/error feedback
- ✅ Auto-refresh after approval

**Issues Found:** None

---

### 1.3 Public Display Flow ✅

**Page:** `/portal/arc/[projectSlug]`
**File:** `src/web/pages/portal/arc/[projectSlug].tsx`

**Flow:**
1. User clicks leaderboard card on ARC home page
2. Navigates to `/portal/arc/[projectSlug]` (public project page)
3. Page loads:
   - Project info (name, avatar, banner)
   - Features check (MS/GameFi/CRM enabled)
   - Current MS arena (if live)
   - Approved requests check (fallback)
4. If MS enabled:
   - Shows "Mindshare Leaderboard" section
   - Displays arena info (name, dates)
   - Fetches and displays leaderboard table
   - Shows "Manage Arena" button (admins only)

**Verification:**
- ✅ Project resolution by slug
- ✅ Feature detection (3 fallbacks):
  1. `leaderboard_enabled = true` in features
  2. Active/live arena exists
  3. Approved MS request exists
- ✅ Arena loading via `useCurrentMsArena()` hook
- ✅ Leaderboard fetching via `/api/portal/arc/arena-creators`
- ✅ Proper loading/error/empty states
- ✅ Admin controls (conditional)

**Issues Found:** None (recently fixed)

---

### 1.4 ARC Home Page Flow ✅

**Page:** `/portal/arc`
**File:** `src/web/pages/portal/arc/index.tsx`

**Flow:**
1. User visits `/portal/arc`
2. Page loads:
   - Live items (arenas/campaigns/quests)
   - Upcoming items
   - Top projects (treemap/cards)
3. Leaderboard cards use `getLiveItemRoute()` or `getLeaderboardRoute()`
4. Clicking card navigates to `/portal/arc/[projectSlug]`

**Verification:**
- ✅ Live items fetched via `useArcLiveItems()` hook
- ✅ Routing utilities correctly route to project page
- ✅ Cards display project name, dates, stats
- ✅ Responsive design (desktop/mobile)

**Issues Found:** None

---

## 2. Routing Verification ✅

### 2.1 Routing Utilities

**Files:**
- `src/web/components/arc/fb/routeUtils.ts` - `getLiveItemRoute()`
- `src/web/components/arc/layout/arcRouteUtils.ts` - `getLeaderboardRoute()`

**Logic:**
```typescript
// For LiveItem (from feed)
if (accessLevel === 'leaderboard' || accessLevel === 'gamified') {
  return `/portal/arc/${projectSlug}`;  // ✅ Public project page
}

// For LiveLeaderboard (from grid)
if (kind === 'arena' || kind === 'gamified') {
  return `/portal/arc/${projectSlug}`;  // ✅ Public project page
}
```

**Verification:**
- ✅ Routes to public project page (not arena page)
- ✅ Handles both slug and ID fallbacks
- ✅ Correct for all access levels

**Issues Found:** None

---

### 2.2 Page Routes

| Route | Purpose | Access | Status |
|-------|---------|--------|--------|
| `/portal/arc` | ARC home page | Public | ✅ |
| `/portal/arc/[projectSlug]` | Public project page | Public | ✅ |
| `/portal/arc/requests` | Request creation | Authenticated | ✅ |
| `/portal/arc/admin/[projectSlug]` | Arena management | Project Admin | ✅ |
| `/portal/admin/arc/leaderboard-requests` | Approval page | SuperAdmin | ✅ |

**Verification:** All routes correctly configured ✅

---

## 3. Feature Detection Logic ✅

### 3.1 Public Project Page

**File:** `src/web/pages/portal/arc/[projectSlug].tsx`

**Logic:**
```typescript
// MS enabled if ANY of:
1. enabledProducts.ms (from features.leaderboard_enabled)
2. currentArena !== null && !arenaLoading (active arena)
3. hasApprovedMsRequest (approved request - fallback)
```

**Verification:**
- ✅ Three-tier fallback system
- ✅ Handles scheduled arenas (not yet live)
- ✅ Handles missing feature flags
- ✅ Handles approved but not yet active arenas

**Issues Found:** None (recently fixed)

---

### 3.2 API Endpoint: `/api/portal/arc/projects`

**File:** `src/web/pages/api/portal/arc/projects.ts`

**Logic:**
```typescript
// Project included if:
1. arc_project_access.application_status = 'approved'
2. is_arc_company = true (or NULL - lenient)
3. AND one of:
   - leaderboard_enabled = true
   - Active MS arena (within date range)
   - Approved leaderboard request
```

**Verification:**
- ✅ Correct filtering logic
- ✅ Lenient `is_arc_company` check (allows NULL)
- ✅ Multiple eligibility criteria

**Issues Found:** None (recently fixed)

---

## 4. UI Components Audit

### 4.1 Public Project Page Components ✅

**File:** `src/web/pages/portal/arc/[projectSlug].tsx`

| Component | Purpose | Status |
|-----------|---------|--------|
| Project Hero | Header with banner/avatar/name | ✅ |
| Mindshare Leaderboard Section | Main leaderboard display | ✅ |
| Arena Info | Arena name, dates | ✅ |
| Leaderboard Table | Creator rankings | ✅ |
| Empty States | No arena/creators | ✅ |
| Error States | API errors | ✅ |
| Loading States | Data fetching | ✅ |
| Admin Buttons | Manage Arena, Admin | ✅ |

**Verification:** All components present and functional ✅

---

### 4.2 ARC Home Page Components ✅

**File:** `src/web/pages/portal/arc/index.tsx`

| Component | Purpose | Status |
|-----------|---------|--------|
| Live Items Section | Active leaderboards | ✅ |
| Upcoming Items Section | Scheduled leaderboards | ✅ |
| Top Projects Treemap | Visual project ranking | ✅ |
| Top Projects Cards | List view | ✅ |
| Mobile Layout | Responsive design | ✅ |
| Desktop Layout | Desktop design | ✅ |

**Verification:** All components present and functional ✅

---

### 4.3 Admin Pages Components ✅

**Request Creation Page:**
- ✅ Request form with validation
- ✅ Project selector
- ✅ Date pickers
- ✅ Status badges
- ✅ Request list

**Approval Page:**
- ✅ Request list with filters
- ✅ Approve/Reject buttons
- ✅ Status badges
- ✅ Project links

**Arena Management Page:**
- ✅ Arena list
- ✅ Create/Edit modals
- ✅ Status controls
- ✅ Current arena indicator

**Verification:** All components present and functional ✅

---

## 5. API Endpoints Audit

### 5.1 Request Endpoints ✅

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/portal/arc/leaderboard-requests` | GET | List requests | ✅ |
| `/api/portal/arc/leaderboard-requests` | POST | Create request | ✅ |
| `/api/portal/admin/arc/leaderboard-requests/[id]/approve` | PUT | Approve request | ✅ |

**Verification:** All endpoints functional ✅

---

### 5.2 Project/Feature Endpoints ✅

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/portal/arc/project-by-slug` | GET | Resolve project | ✅ |
| `/api/portal/arc/projects` | GET | List projects with features | ✅ |
| `/api/portal/arc/permissions` | GET | Get user permissions | ✅ |
| `/api/portal/arc/projects/[id]/current-ms-arena` | GET | Get current arena | ✅ |
| `/api/portal/arc/arena-creators` | GET | Get leaderboard | ✅ |

**Verification:** All endpoints functional ✅

---

## 6. Data Flow Verification ✅

### 6.1 Approval → Display Flow

```
1. SuperAdmin approves request
   ↓
2. RPC: arc_admin_approve_leaderboard_request
   ↓
3. Updates:
   - arc_project_access.application_status = 'approved'
   - arc_project_features.leaderboard_enabled = true
   - projects.is_arc_company = true
   - arenas (create/update)
   ↓
4. Project appears in /api/portal/arc/projects
   ↓
5. Project appears on /portal/arc home page
   ↓
6. Clicking card → /portal/arc/[projectSlug]
   ↓
7. Page shows leaderboard (if arena live) or "coming soon"
```

**Verification:** ✅ Flow is correct and complete

---

### 6.2 Scheduled Arena Flow

```
1. Request approved with future dates
   ↓
2. Arena created with status='active', starts_at=future
   ↓
3. Project appears in /api/portal/arc/projects (via approved request)
   ↓
4. Project appears on /portal/arc home page
   ↓
5. Clicking card → /portal/arc/[projectSlug]
   ↓
6. Page checks:
   - currentArena = null (not yet live)
   - hasApprovedMsRequest = true
   ↓
7. Shows "Leaderboard coming soon" message
```

**Verification:** ✅ Flow handles scheduled arenas correctly

---

## 7. Edge Cases & Error Handling ✅

### 7.1 Edge Cases Handled

| Case | Handling | Status |
|------|----------|--------|
| No arena yet | Shows "coming soon" if approved | ✅ |
| Arena not live | Shows "coming soon" if approved | ✅ |
| No creators | Shows "No creators yet" | ✅ |
| No features | Checks approved requests | ✅ |
| Invalid slug | Redirects/error state | ✅ |
| API errors | Error state with retry | ✅ |
| Loading states | Spinners/placeholders | ✅ |

**Verification:** All edge cases handled ✅

---

### 7.2 Error Handling

**Public Project Page:**
- ✅ Project fetch errors → ErrorState
- ✅ Arena fetch errors → ErrorState
- ✅ Leaderboard fetch errors → Error message
- ✅ All have retry functionality

**ARC Home Page:**
- ✅ API errors → ErrorState
- ✅ Empty states → EmptyState
- ✅ Loading states → Spinners

**Verification:** Error handling comprehensive ✅

---

## 8. Admin vs Public Views ✅

### 8.1 Public View

**What users see:**
- ✅ Project header
- ✅ Leaderboard table
- ✅ Arena info (name, dates)
- ✅ No management controls

**Verification:** ✅ Correct

---

### 8.2 Admin View

**What admins see:**
- ✅ Everything in public view
- ✅ "Manage Arena" button
- ✅ "Admin" button in header
- ✅ "Manage Team" button

**Verification:** ✅ Correct

---

## 9. Recommendations

### 9.1 Minor Improvements

1. **Add "View Leaderboard" link in admin panel**
   - Currently admins see "Manage Arena" button
   - Could add link to public view for preview

2. **Add arena status indicator**
   - Show "Live", "Scheduled", "Ended" badges
   - Helps users understand arena state

3. **Add creator count to cards**
   - Show number of creators on leaderboard cards
   - Provides quick stats

### 9.2 Documentation

1. **Add inline comments** for complex logic
2. **Update API documentation** with examples
3. **Create user guide** for request/approval flow

---

## 10. Testing Checklist

### 10.1 Manual Testing

- [x] Request creation works
- [x] Admin approval works
- [x] Arena created on approval
- [x] Project appears on home page
- [x] Clicking card routes correctly
- [x] Leaderboard displays correctly
- [x] Scheduled arenas show "coming soon"
- [x] Admin controls visible to admins only
- [x] Error states work
- [x] Loading states work
- [x] Empty states work

### 10.2 Edge Case Testing

- [x] No arena → Shows appropriate message
- [x] No creators → Shows "No creators yet"
- [x] Invalid slug → Error/redirect
- [x] API errors → Error state
- [x] Scheduled arena → "Coming soon"
- [x] Missing features → Checks requests

---

## 11. Conclusion

**Overall Status:** ✅ **READY FOR PRODUCTION**

### Summary

1. ✅ **Flow is complete** - Request → Approval → Display
2. ✅ **Routing is correct** - All cards route to public project page
3. ✅ **Feature detection works** - Three-tier fallback system
4. ✅ **UI components complete** - All necessary components present
5. ✅ **Error handling robust** - Comprehensive error/loading/empty states
6. ✅ **Admin controls correct** - Proper permission checks
7. ✅ **Edge cases handled** - Scheduled arenas, missing data, etc.

### Recent Fixes Applied

1. ✅ Added approved request check as fallback
2. ✅ Fixed `is_arc_company` auto-set on approval
3. ✅ Made `/api/portal/arc/projects` more lenient
4. ✅ Added "coming soon" message for scheduled arenas

### No Critical Issues Found

All major flows are working correctly. The system is ready for production use.

---

## 12. Files Reviewed

### Pages
- ✅ `src/web/pages/portal/arc/index.tsx` - ARC home
- ✅ `src/web/pages/portal/arc/[projectSlug].tsx` - Public project page
- ✅ `src/web/pages/portal/arc/requests.tsx` - Request creation
- ✅ `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - Approval page
- ✅ `src/web/pages/portal/arc/admin/[projectSlug].tsx` - Arena management

### Components
- ✅ `src/web/components/arc/fb/routeUtils.ts` - Routing utilities
- ✅ `src/web/components/arc/layout/arcRouteUtils.ts` - Routing utilities
- ✅ `src/web/components/arc/fb/LiveItemCard.tsx` - Feed cards
- ✅ `src/web/components/arc/layout/ArcFeedCard.tsx` - Grid cards

### APIs
- ✅ `src/web/pages/api/portal/arc/projects.ts` - Projects list
- ✅ `src/web/pages/api/portal/arc/project-by-slug.ts` - Project resolution
- ✅ `src/web/pages/api/portal/arc/leaderboard-requests.ts` - Request API
- ✅ `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id]/approve.ts` - Approval API

### Migrations
- ✅ `supabase/migrations/20250131_arc_admin_approve_rpc.sql` - Approval RPC
- ✅ `supabase/migrations/20250203_fix_arc_company_flag.sql` - Data fix

---

**Audit Complete** ✅
