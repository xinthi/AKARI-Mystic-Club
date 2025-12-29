# ARC Implementation Summary

## Overview
This document summarizes the implementation of ARC approval gates, Option 2 join flow, and foundation for Option 1 CRM and Option 3 gamified features.

## ✅ Completed Components

### 1. ARC Access Gate (`src/web/lib/arc-access.ts`)
- **Function**: `requireArcAccess(supabase, projectId, option)`
- **Purpose**: Enforces global ARC approval and option unlocks
- **Checks**:
  - `arc_project_access.application_status = 'approved'`
  - `arc_project_features.option{1|2|3}_unlocked = true`
  - Legacy fallback to `projects.arc_active` and `projects.arc_access_level`
- **Returns**: `{ ok: true }` or `{ ok: false, error, code }`

### 2. Follow Verification
- **Migration**: `supabase/migrations/20250121_add_arc_follow_verification.sql`
  - Table: `arc_project_follows`
  - Stores: `project_id`, `profile_id`, `twitter_username`, `verified_at`
- **Endpoint**: `POST /api/portal/arc/verify-follow`
  - Requires: `projectId` in body
  - Checks: User follows project's X account (DEV MODE bypass)
  - Stores verification in DB
  - Returns: `{ ok: true, verified: boolean, verifiedAt: string | null }`

### 3. Join Leaderboard
- **Endpoint**: `POST /api/portal/arc/join-leaderboard`
  - Requires: `projectId` or `arenaId` in body
  - Requires: Verified follow status (DEV MODE bypass)
  - Creates: `arena_creators` entry with `arc_points: 0`, `ring: 'discovery'`
  - Returns: `{ ok: true, arenaId, creatorId }`

## 🔧 Remaining Work

### A. Apply Access Gate to All ARC Endpoints

**Pattern to apply:**
```typescript
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// In handler, after getting projectId:
const supabase = getSupabaseAdmin();
const accessCheck = await requireArcAccess(supabase, projectId, 2); // 2 = Leaderboard
if (!accessCheck.ok) {
  return res.status(403).json({ ok: false, error: accessCheck.error });
}
```

**Endpoints to update:**
1. ✅ `src/web/pages/api/portal/arc/verify-follow.ts` - DONE
2. ✅ `src/web/pages/api/portal/arc/join-leaderboard.ts` - DONE
3. ⚠️ `src/web/pages/api/portal/arc/arenas/index.ts` - NEEDS UPDATE
4. ⚠️ `src/web/pages/api/portal/arc/arenas/[slug].ts` - NEEDS UPDATE
5. ⚠️ `src/web/pages/api/portal/arc/arenas-admin.ts` - NEEDS UPDATE (Option 2)
6. ⚠️ `src/web/pages/api/portal/arc/arena-creators-admin.ts` - NEEDS UPDATE (Option 2)
7. ⚠️ `src/web/pages/api/portal/arc/admin/point-adjustments.ts` - NEEDS UPDATE (Option 2)
8. ⚠️ `src/web/pages/api/portal/arc/state.ts` - NEEDS UPDATE (check all options)
9. ⚠️ `src/web/pages/api/portal/arc/project-by-slug.ts` - NEEDS UPDATE (if exposes ARC)

**Note**: For endpoints that work with arenas, resolve `projectId` from `arenaId` first.

### B. Update UI Pages with Access Gate

**Files to update:**
1. `src/web/pages/portal/arc/[slug].tsx`
2. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

**Pattern:**
```typescript
// After fetching projectId
const [hasAccess, setHasAccess] = useState<boolean | null>(null);

useEffect(() => {
  async function checkAccess() {
    if (!projectId) return;
    
    const res = await fetch(`/api/portal/arc/state?projectId=${projectId}`);
    const data = await res.json();
    
    if (data.ok) {
      const hasAnyModule = data.modules.leaderboard.enabled || 
                          data.modules.gamefi.enabled || 
                          data.modules.crm.enabled;
      setHasAccess(hasAnyModule);
    } else {
      setHasAccess(false);
    }
  }
  
  checkAccess();
}, [projectId]);

// In render:
if (hasAccess === false) {
  return (
    <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
      <p className="text-sm text-akari-muted">
        ARC access is not approved for this project.
      </p>
    </div>
  );
}
```

### C. Option 2 UI Updates

**Files to update:**
- `src/web/pages/portal/arc/[slug].tsx`
- `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

**Add:**
1. "Verify Follow" button (when not verified)
2. "Join Leaderboard" button (when verified but not joined)
3. Call `/api/portal/arc/verify-follow` on click
4. Call `/api/portal/arc/join-leaderboard` on click
5. Refresh creators list after join

### D. Option 1 CRM Implementation

**Tables exist**: `arc_campaigns`, `arc_campaign_participants`, `arc_participant_links`, `arc_external_submissions`

**APIs to create:**
1. `GET /api/portal/arc/campaigns?projectId=<uuid>` - List campaigns
2. `POST /api/portal/arc/campaigns` - Create campaign (owner/admin/moderator)
3. `PATCH /api/portal/arc/campaigns/[id]` - Update campaign
4. `GET /api/portal/arc/campaigns/[id]` - Get campaign details
5. `POST /api/portal/arc/campaigns/[id]/invite` - Invite creator
6. `POST /api/portal/arc/campaigns/[id]/apply` - Public apply
7. `POST /api/portal/arc/campaigns/[id]/participants/[pid]/approve` - Approve participant
8. `POST /api/portal/arc/campaigns/[id]/participants/[pid]/reject` - Reject participant
9. `POST /api/portal/arc/campaigns/[id]/participants/[pid]/utm-link` - Generate UTM link
10. `POST /api/portal/arc/campaigns/[id]/external-submissions` - Submit external proof
11. `POST /api/portal/arc/campaigns/[id]/external-submissions/[sid]/review` - Review submission

**UI to create:**
- CRM tab in `/portal/arc/[slug]`
- Campaign list view
- Campaign detail view with participants, submissions, UTM links

**Access gate**: Apply `requireArcAccess(supabase, projectId, 1)` to all CRM endpoints.

### E. Option 3 Gamified (Quests)

**Migration needed:**
```sql
CREATE TABLE IF NOT EXISTS arc_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arena_id UUID REFERENCES arenas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  narrative_focus TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reward_desc TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**APIs to create:**
1. `GET /api/portal/arc/quests?projectId=<uuid>&arenaId=<uuid>` - List quests
2. `POST /api/portal/arc/quests` - Create quest (owner/admin)
3. `PATCH /api/portal/arc/quests/[id]` - Update quest
4. `GET /api/portal/arc/quests/[id]/leaderboard` - Quest leaderboard (stub)

**UI to create:**
- Quests tab in arena page
- Quest list with mini leaderboard placeholder

**Access gate**: Apply `requireArcAccess(supabase, projectId, 3)` to all quest endpoints.

### F. Scoring Pipeline Stubs

**Migration needed:**
```sql
CREATE TABLE IF NOT EXISTS arc_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arena_id UUID REFERENCES arenas(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  twitter_username TEXT NOT NULL,
  post_id TEXT,
  post_type TEXT CHECK (post_type IN ('original', 'quote', 'reply', 'retweet')),
  media_type TEXT CHECK (media_type IN ('text', 'image', 'video', 'link')),
  engagement_json JSONB,
  sentiment_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arc_contributions_project_id ON arc_contributions(project_id);
CREATE INDEX idx_arc_contributions_arena_id ON arc_contributions(arena_id);
CREATE INDEX idx_arc_contributions_profile_id ON arc_contributions(profile_id);
CREATE INDEX idx_arc_contributions_created_at ON arc_contributions(created_at DESC);
```

**Endpoint to create:**
- `POST /api/portal/arc/admin/rollup-points` - Manual rollup (super_admin only)
  - Reads `arc_contributions` for date range
  - Computes base points
  - Updates `arena_creators.arc_points`
  - Does NOT remove adjustments

## 📋 Test URLs

### Base URLs (replace `localhost:3009` with your dev server)
1. **Project Hub**: `http://localhost:3009/portal/arc/[project-slug]`
   - Example: `http://localhost:3009/portal/arc/akari`
   
2. **Arena Page**: `http://localhost:3009/portal/arc/[project-slug]/arena/[arena-slug]`
   - Example: `http://localhost:3009/portal/arc/akari/arena/main-arena`

3. **Verify Follow API**: `http://localhost:3009/api/portal/arc/verify-follow`
   - Method: POST
   - Body: `{ "projectId": "uuid" }`

4. **Join Leaderboard API**: `http://localhost:3009/api/portal/arc/join-leaderboard`
   - Method: POST
   - Body: `{ "projectId": "uuid" }` or `{ "arenaId": "uuid" }`

5. **CRM Campaigns List**: `http://localhost:3009/portal/arc/[project-slug]?tab=crm`
   - (UI tab, not direct URL)

6. **Campaign Detail**: `http://localhost:3009/portal/arc/[project-slug]/campaign/[campaign-id]`
   - (To be implemented)

## 🎯 Expected Behavior

### Approved Project (Option 2 Unlocked)
- **Normal User**:
  - ✅ Can view project hub and arenas
  - ✅ Can verify follow
  - ✅ Can join leaderboard after verification
  - ✅ Appears on leaderboard
  - ❌ Cannot see admin buttons
  - ❌ Cannot add/edit creators

- **Project Moderator**:
  - ✅ All normal user permissions
  - ✅ Can add/edit/remove creators
  - ✅ Can adjust points
  - ✅ Can view adjustment history
  - ❌ Cannot manage arenas (create/edit/delete)

- **Project Admin/Owner**:
  - ✅ All moderator permissions
  - ✅ Can manage arenas
  - ✅ Can access all admin features

- **Super Admin**:
  - ✅ All permissions
  - ✅ Can access all projects regardless of approval

- **Investor View**:
  - ✅ Can view project hub and arenas (read-only)
  - ❌ Cannot verify follow
  - ❌ Cannot join leaderboard
  - ❌ Cannot see any write buttons

### Not Approved Project
- **All Users**:
  - ❌ Cannot access ARC features
  - ✅ See "ARC access not approved" message
  - ❌ API endpoints return 403
  - ❌ UI does not call ARC APIs

### DEV MODE
- ✅ All authentication bypassed
- ✅ Follow verification always returns true
- ✅ Access gates allow access if tables don't exist (backward compatibility)

## 📝 Files Changed

### Created
1. `src/web/lib/arc-access.ts` - Access gate helper
2. `src/web/pages/api/portal/arc/verify-follow.ts` - Follow verification endpoint
3. `src/web/pages/api/portal/arc/join-leaderboard.ts` - Join leaderboard endpoint
4. `supabase/migrations/20250121_add_arc_follow_verification.sql` - Follow verification table

### Needs Update (Examples Provided)
1. `src/web/pages/api/portal/arc/arenas/index.ts` - Add access gate
2. `src/web/pages/api/portal/arc/arenas/[slug].ts` - Add access gate
3. `src/web/pages/portal/arc/[slug].tsx` - Add access check UI + verify/join buttons
4. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - Add verify/join buttons

### To Be Created
1. CRM campaign management APIs (11 endpoints)
2. CRM UI components
3. Quest tables and APIs
4. Contributions table and rollup endpoint

## 🔄 Next Steps

1. **Apply access gate to remaining ARC endpoints** (use pattern from verify-follow.ts)
2. **Update UI pages** with access check and blocked state
3. **Add verify/join buttons** to Option 2 pages
4. **Implement CRM APIs** (use existing tables, follow RLS policies)
5. **Create CRM UI** (campaign list + detail views)
6. **Add quests** (minimal implementation)
7. **Add contributions stub** (table + rollup endpoint)

## ⚠️ Important Notes

- **Identity**: Use `projects.x_handle` for project Twitter handle (not `twitter_username`)
- **Leaderboard Math**: Keep existing `effective_points = base_points + adjustments_sum`
- **DEV MODE**: All endpoints should bypass auth in development
- **Permissions**: Use `checkProjectPermissions()` for project-scoped operations
- **No Long Dashes**: Use regular hyphens (-) in UI text

