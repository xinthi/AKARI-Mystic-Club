# Project Tracking + Claiming Implementation

## Summary

This implementation adds project claiming, classification, and team management functionality to the AKARI Mystic Club codebase.

## Files Changed

### 1. Database Migrations

**`supabase/migrations/20241216_add_project_claiming_fields.sql`**
- Adds `display_name`, `is_company`, `profile_type`, `claimed_by`, `claimed_at` to `projects` table
- Adds `real_roles` (TEXT[]) to `profiles` table
- Creates `project_team_members` table for per-project admin/moderator management
- Adds indexes and RLS policies

### 2. API Endpoints

**`src/web/pages/api/portal/sentiment/track.ts`**
- Updated to set `display_name`, `claimed_by: null`, `claimed_at: null`, `profile_type: 'project'`, `is_company: false` when creating new projects
- Added documentation clarifying that projects are only created on explicit user action

**`src/web/pages/api/portal/projects/claim.ts`** (NEW)
- POST endpoint for claiming projects
- Validates Twitter username match between user and project
- Sets `claimed_by` and `claimed_at`
- Adds `project_admin` role to `akari_user_roles`
- Adds owner role to `project_team_members`

**`src/web/pages/api/portal/admin/projects/classify.ts`** (NEW)
- POST endpoint for SuperAdmin to classify profiles
- Sets `profile_type` ('project' or 'personal')
- Sets `is_company` flag (only for project type)

**`src/web/pages/api/portal/projects/team-members.ts`** (NEW)
- GET: List team members for a project
- POST: Add team member (requires owner/admin)
- DELETE: Remove team member (requires owner/admin, or super_admin for security)
- Implements security behavior: pauses ARC campaigns when moderator removed by super_admin

### 3. Helper Libraries

**`src/web/lib/project-permissions.ts`** (NEW)
- `checkProjectPermissions()` - Comprehensive permission check using `project_team_members.role` + `profiles.real_roles` + `akari_user_roles`
- `canManageProject()` - Shorthand for checking management permissions
- `isProjectOwnerOrAdmin()` - Check if user is owner or admin

## Database Schema Changes

### Projects Table
- `display_name` TEXT (nullable)
- `is_company` BOOLEAN DEFAULT false
- `profile_type` TEXT DEFAULT 'project' CHECK (profile_type IN ('project', 'personal'))
- `claimed_by` UUID REFERENCES akari_users(id) ON DELETE SET NULL
- `claimed_at` TIMESTAMPTZ (nullable)

### Profiles Table
- `real_roles` TEXT[] DEFAULT ARRAY['user']::TEXT[]
  - Valid values: 'user', 'creator', 'project_admin', 'super_admin', 'institutional'

### Project Team Members Table (NEW)
- `id` UUID PRIMARY KEY
- `project_id` UUID REFERENCES projects(id) ON DELETE CASCADE
- `profile_id` UUID REFERENCES profiles(id) ON DELETE CASCADE
- `role` TEXT CHECK (role IN ('owner', 'admin', 'moderator', 'investor_view'))
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(project_id, profile_id, role)

## How to Test

### 1. Run Migration

```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20241216_add_project_claiming_fields.sql
```

### 2. Test Project Tracking (Explicit User Action)

1. Log in to the portal
2. Navigate to Sentiment Terminal
3. Search for a Twitter profile
4. Click "Track project in AKARI" (or similar explicit action)
5. Verify project is created with:
   - `claimed_by: null`
   - `claimed_at: null`
   - `profile_type: 'project'`
   - `is_company: false`

### 3. Test Project Claiming

1. Log in with a Twitter account that matches a project's `twitter_username`
2. Call the claim API:
   ```bash
   curl -X POST http://localhost:3000/api/portal/projects/claim \
     -H "Content-Type: application/json" \
     -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
     -d '{"projectId": "PROJECT_UUID"}'
   ```
3. Verify:
   - Project `claimed_by` is set to your user ID
   - `claimed_at` is set to current timestamp
   - `project_admin` role is added to `akari_user_roles`
   - Owner role is added to `project_team_members`

### 4. Test SuperAdmin Classification

1. Log in as SuperAdmin
2. Call the classify API:
   ```bash
   curl -X POST http://localhost:3000/api/portal/admin/projects/classify \
     -H "Content-Type: application/json" \
     -H "Cookie: akari_session=SUPER_ADMIN_SESSION" \
     -d '{
       "projectId": "PROJECT_UUID",
       "profileType": "project",
       "isCompany": true
     }'
   ```
3. Verify project `profile_type` and `is_company` are updated

### 5. Test Team Member Management

**Add Team Member:**
```bash
curl -X POST http://localhost:3000/api/portal/projects/team-members \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=OWNER_SESSION" \
  -d '{
    "projectId": "PROJECT_UUID",
    "profileId": "PROFILE_UUID",
    "role": "admin"
  }'
```

**List Team Members:**
```bash
curl http://localhost:3000/api/portal/projects/team-members?projectId=PROJECT_UUID \
  -H "Cookie: akari_session=YOUR_SESSION"
```

**Remove Team Member (as SuperAdmin - triggers pause):**
```bash
curl -X DELETE http://localhost:3000/api/portal/projects/team-members \
  -H "Content-Type: application/json" \
  -H "Cookie: akari_session=SUPER_ADMIN_SESSION" \
  -d '{
    "projectId": "PROJECT_UUID",
    "profileId": "PROFILE_UUID",
    "role": "moderator"
  }'
```
- Verify arenas with status 'draft', 'scheduled', or 'active' are set to 'cancelled'

### 6. Test Permission Checks

Use the helper functions in `src/web/lib/project-permissions.ts`:

```typescript
import { checkProjectPermissions, canManageProject } from '@/lib/project-permissions';

// Check comprehensive permissions
const permissions = await checkProjectPermissions(supabase, userId, projectId);
console.log(permissions.canManage); // true if owner, admin, or super_admin
console.log(permissions.isOwner);
console.log(permissions.isAdmin);

// Quick check
const canManage = await canManageProject(supabase, userId, projectId);
```

## Security Notes

1. **Project Claiming**: Only users whose Twitter username matches the project's `twitter_username` can claim
2. **Team Management**: Only project owners and admins can add/remove team members
3. **SuperAdmin Restrictions**: SuperAdmin can only remove team members (for security), not add them
4. **Campaign Pausing**: When a moderator is removed by SuperAdmin, all active ARC campaigns are paused (status set to 'cancelled' as temporary solution)

## TODO / Future Enhancements

1. Add 'paused' status to `arenas.status` enum in future migration
2. Implement Creator Manager program pausing when that system is added
3. Expand security freeze mode beyond simple status update
4. Add UI components for project claiming and team management
5. Add notifications when projects are claimed or team members are added/removed

## Notes

- Projects are NOT auto-created - they require explicit user action via the track API
- Projects are NOT claimed by default - official accounts must claim them
- The `profiles.real_roles` field stores roles for Twitter profiles linked to AKARI users
- Project-specific permissions use `project_team_members.role` in addition to global `profiles.real_roles` and `akari_user_roles`

