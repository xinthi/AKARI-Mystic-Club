# ARC Leaderboard Flow Correction

## Problem Identified

The previous flow was incorrect:
- Clicking a leaderboard card routed to `/portal/arc/[projectSlug]/arena/[arenaSlug]` (arena management page)
- Users saw "Manage Arena" instead of the actual leaderboard
- Arena management was mixed with public leaderboard viewing

## Corrected Flow

### 1. Routing (Fixed)

**Before:**
- Leaderboard cards → `/portal/arc/[projectSlug]/arena/[arenaSlug]` (arena management)

**After:**
- Leaderboard cards → `/portal/arc/[projectSlug]` (public project page with leaderboard)

**Files Updated:**
- `src/web/components/arc/fb/routeUtils.ts` - Fixed `getLiveItemRoute()`
- `src/web/components/arc/layout/arcRouteUtils.ts` - Fixed `getLeaderboardRoute()`

### 2. Public Project Page (Fixed)

**Before:**
- Showed arena info with "View Leaderboard" link
- Link went to arena management page

**After:**
- Shows leaderboard directly on the page
- Displays creator table with rank, username, ring, and points
- "Manage Arena" button only visible to project admins (links to `/portal/arc/admin/[projectSlug]`)

**File Updated:**
- `src/web/pages/portal/arc/[projectSlug].tsx` - Added leaderboard fetching and display

### 3. Arena Management (Already Correct)

- Arena management is at `/portal/arc/admin/[projectSlug]` (project admin panel)
- Only accessible to project admins (Founder/Admin/Moderator) or Superadmin
- Not accessible from public pages

### 4. Approval Flow (Already Correct)

- When Superadmin approves a leaderboard request:
  1. RPC function `arc_admin_approve_leaderboard_request` is called
  2. Automatically creates/updates MS arena with `kind = 'ms'` and `status = 'active'`
  3. Sets `arc_project_features.leaderboard_enabled = true`
  4. Sets start/end dates from request
  5. Arena is immediately available for public viewing

**File:**
- `supabase/migrations/20250131_arc_admin_approve_rpc.sql` - RPC function handles arena creation

## User Experience Flow

### Normal User (Public)

1. **ARC Home** (`/portal/arc`)
   - Sees "Live Now" section with leaderboard cards
   - Clicks a leaderboard card

2. **Project Page** (`/portal/arc/[projectSlug]`)
   - Sees project header (banner, name, team)
   - Sees **Mindshare Leaderboard** section with:
     - Arena name and dates
     - **Leaderboard table** showing:
       - Rank
       - Creator username (clickable to creator profile)
       - Ring (core/momentum/discovery)
       - Points
   - If GameFi enabled: sees Quests section
   - If CRM enabled and public: sees CRM section

### Project Admin (Founder/Admin/Moderator)

1. **ARC Home** (`/portal/arc`)
   - Same as normal user

2. **Project Page** (`/portal/arc/[projectSlug]`)
   - Sees everything normal users see
   - **Plus**: "Manage Arena" button in leaderboard section
   - **Plus**: "Admin" button in project header

3. **Admin Panel** (`/portal/arc/admin/[projectSlug]`)
   - Can manage arena settings
   - Can create/manage campaigns (CRM)
   - Can manage quests (GameFi)
   - Can manage team members
   - Can manage branding

### Superadmin

- Can approve/decline requests at `/portal/admin/arc/leaderboard-requests`
- Can access any project's admin panel
- Can override team gating and fix schedules

## API Endpoints Used

### Public Project Page

- `GET /api/portal/arc/project-by-slug?slug=...` - Resolve project by slug
- `GET /api/portal/arc/projects` - Get project features
- `GET /api/portal/arc/permissions?projectId=...` - Get user permissions (if logged in)
- `GET /api/portal/arc/arena-creators?arenaId=...` - Get leaderboard creators

### Arena Management (Admin Only)

- `GET /api/portal/arc/admin/arenas?projectId=...` - List arenas
- `POST /api/portal/arc/arenas-admin` - Create arena
- `PATCH /api/portal/arc/arenas-admin` - Update arena
- `GET /api/portal/arc/admin/arena-creators?arenaId=...` - List creators (admin view)

## Database Schema

### Arenas Table

- `kind`: `'ms'` | `'legacy_ms'` | `'gamefi'` | `'crm'` | `NULL`
- **Constraint**: Only one active MS arena per project (`uniq_ms_arena_per_project`)
- **Status**: `'draft'` | `'scheduled'` | `'active'` | `'ended'` | `'cancelled'`

### Arc Project Features

- `leaderboard_enabled`: boolean (MS LB enabled)
- `leaderboard_start_at`: timestamp
- `leaderboard_end_at`: timestamp
- `gamefi_enabled`: boolean (GameFi LB enabled)
- `gamefi_start_at`: timestamp
- `gamefi_end_at`: timestamp
- `crm_enabled`: boolean (CRM enabled)
- `crm_start_at`: timestamp
- `crm_end_at`: timestamp
- `crm_visibility`: `'public'` | `'private'` | `'hybrid'` | `NULL`

## Testing Checklist

- [ ] Click leaderboard card from ARC home → goes to project page (not arena page)
- [ ] Project page shows leaderboard table directly
- [ ] Leaderboard table shows creators with rank, username, ring, points
- [ ] "Manage Arena" button only visible to admins
- [ ] "Manage Arena" button links to `/portal/arc/admin/[projectSlug]`
- [ ] Approval creates arena automatically
- [ ] Arena appears on project page immediately after approval
- [ ] No duplicate arenas created (constraint enforced)

## Summary

The flow is now correct:
1. **Approval** → Arena created automatically
2. **ARC Home** → Leaderboard cards route to project page
3. **Project Page** → Shows leaderboard directly (not management page)
4. **Admin Panel** → Separate route for arena management

This matches the user's requirements:
- Projects get leaderboards by default when approved
- Public users see leaderboards, not management pages
- Arena management is separate and admin-only
