# ARC User Guide: Requesting Leaderboards & Managing Team Members

## Current Status

### ✅ What Exists:
1. **ARC Leaderboard Request API** - Fully functional
2. **Team Members API** - Supports project owners/admins adding team members
3. **ARC Requests Page** - `/portal/arc/requests` exists for submitting requests
4. **SuperAdmin Team Management** - `/portal/admin/projects/[id]/team` (superadmin only)

### ❌ What's Missing:
1. **Project Owner Team Management UI** - No page for project owners to manage their team
2. **Sentiment Page ARC Request Button** - May not be showing due to conditions

---

## 1. Requesting MS Leaderboard from Sentiment Page

### How It Works:

The sentiment page (`/portal/sentiment/[slug]`) **should** show a "Request ARC Leaderboard" button if:
- User is logged in
- Project has `is_arc_company = true`
- User has permission to request (owner/admin/moderator)
- No pending request exists
- API endpoint `/api/portal/arc/cta-state` returns `shouldShowRequestButton: true`

### Current Implementation:

**File:** `src/web/pages/portal/sentiment/[slug].tsx` (lines 1292-1304)

```tsx
{arcCta?.ok === true && arcCta?.shouldShowRequestButton === true && project?.id && (
  <Link
    href={`/portal/arc/requests?projectId=${project.id}&intent=request`}
    className="pill-neon inline-flex items-center gap-2 px-4 py-2 min-h-[40px] bg-akari-neon-teal text-black hover:bg-akari-neon-teal/80 hover:shadow-soft-glow text-sm font-medium"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    Request ARC Leaderboard
  </Link>
)}
```

### Troubleshooting:

If the button doesn't show, check these in order:

1. **Check API Response (Easiest):**
   - Open browser DevTools → Network tab
   - Visit `/portal/sentiment/[slug]`
   - Look for request to `/api/portal/arc/cta-state?projectId=...`
   - Check the response:
     ```json
     {
       "ok": true,
       "shouldShowRequestButton": false,
       "reason": "No permission"  // or "Existing pending request", "Not logged in", etc.
     }
     ```
   - The `reason` field tells you exactly why the button isn't showing

2. **Check if project is ARC-eligible:**
   ```sql
   SELECT id, name, is_arc_company 
   FROM projects 
   WHERE slug = 'your-project-slug';
   ```
   - Must have `is_arc_company = true`
   - If false, update it: `UPDATE projects SET is_arc_company = true WHERE id = 'project-id';`

3. **Check user permissions:**
   The API checks in this order:
   - SuperAdmin? → Always allowed
   - Team member (owner/admin/moderator)? → Allowed
   - Can request via `canRequestLeaderboard()`? → Allowed
   
   **Check if user is project owner:**
   ```sql
   SELECT id, name, claimed_by 
   FROM projects 
   WHERE id = 'project-id';
   ```
   - `claimed_by` should match your `user_id`
   
   **Check if user is team member:**
   ```sql
   SELECT ptm.*, p.username 
   FROM project_team_members ptm
   JOIN profiles p ON p.id = ptm.profile_id
   WHERE ptm.project_id = 'project-id'
   AND ptm.role IN ('owner', 'admin', 'moderator');
   ```
   - Your Twitter username should be in the results

4. **Check for existing requests:**
   ```sql
   SELECT * FROM arc_leaderboard_requests 
   WHERE project_id = 'project-id' 
   AND status = 'pending';
   ```
   - If a pending request exists, button won't show
   - You can still view it at `/portal/arc/requests`

5. **Check user's Twitter identity:**
   ```sql
   SELECT aui.username, p.id as profile_id
   FROM akari_user_identities aui
   LEFT JOIN profiles p ON p.username = LOWER(REPLACE(aui.username, '@', ''))
   WHERE aui.user_id = 'your-user-id'
   AND aui.provider = 'x';
   ```
   - User must have a Twitter identity linked
   - Profile must exist in `profiles` table

### Manual Request (If Button Doesn't Show):

1. Navigate to: `/portal/arc/requests?projectId=YOUR_PROJECT_ID&intent=request`
2. Or go to: `/portal/arc/requests` and select your project from the dropdown

---

## 2. Assigning Project Admins and Moderators

### Current Situation:

**API Exists:** `/api/portal/projects/team-members`
- ✅ Supports GET (list members)
- ✅ Supports POST (add member) - **requires owner or admin role**
- ✅ Supports DELETE (remove member) - **requires owner or admin role**

**UI Missing:** There's NO page for project owners to manage team members.

**SuperAdmin Only:** `/portal/admin/projects/[id]/team` exists but requires superadmin access.

### Solution: Create Project Owner Team Management Page

#### Option A: Add to Existing ARC Admin Page

**File:** `src/web/pages/portal/arc/admin/[projectSlug].tsx`

Add a new "Team Members" tab/section that:
1. Lists current team members (owners, admins, moderators)
2. Allows adding new admins/moderators (search by Twitter username)
3. Allows removing admins/moderators (except owner)

#### Option B: Create Standalone Page

**New File:** `src/web/pages/portal/arc/[projectSlug]/team.tsx`

Create a dedicated team management page accessible from:
- Project hub page (`/portal/arc/[projectSlug]`)
- ARC admin page (`/portal/arc/admin/[projectSlug]`)

### Implementation Guide:

#### Step 1: Create the Team Management Page

```typescript
// src/web/pages/portal/arc/[projectSlug]/team.tsx

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { getSessionTokenFromRequest, getUserIdFromSession } from '@/lib/server-auth';

interface TeamMember {
  id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'moderator';
  affiliate_title: string | null;
  profile?: {
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
}

export default function ProjectTeamPage() {
  const router = useRouter();
  const { projectSlug } = router.query;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('admin');

  // Load team members
  useEffect(() => {
    if (!projectSlug) return;
    
    async function loadMembers() {
      // First, get project ID from slug
      const projectRes = await fetch(`/api/portal/arc/project-by-slug?slug=${projectSlug}`);
      const projectData = await projectRes.json();
      
      if (!projectData.ok) return;
      
      // Then fetch team members
      const membersRes = await fetch(`/api/portal/projects/team-members?projectId=${projectData.project.id}`);
      const membersData = await membersRes.json();
      
      if (membersData.ok) {
        setMembers(membersData.members);
      }
      setLoading(false);
    }
    
    loadMembers();
  }, [projectSlug]);

  // Add member handler
  const handleAddMember = async (profileId: string) => {
    const projectRes = await fetch(`/api/portal/arc/project-by-slug?slug=${projectSlug}`);
    const projectData = await projectRes.json();
    
    const res = await fetch('/api/portal/projects/team-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        projectId: projectData.project.id,
        profileId,
        role: selectedRole,
      }),
    });
    
    const data = await res.json();
    if (data.ok) {
      // Reload members
      window.location.reload();
    } else {
      alert(data.error || 'Failed to add team member');
    }
  };

  // Remove member handler
  const handleRemoveMember = async (profileId: string) => {
    const projectRes = await fetch(`/api/portal/arc/project-by-slug?slug=${projectSlug}`);
    const projectData = await projectRes.json();
    
    const res = await fetch('/api/portal/projects/team-members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        projectId: projectData.project.id,
        profileId,
      }),
    });
    
    const data = await res.json();
    if (data.ok) {
      // Reload members
      window.location.reload();
    } else {
      alert(data.error || 'Failed to remove team member');
    }
  };

  // Search profiles (you'll need to create this API endpoint)
  const handleSearch = async () => {
    // TODO: Implement profile search
    // This requires a new API endpoint: /api/portal/profiles/search?q=username
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Team Members</h1>
      
      {/* Add Member Section */}
      <div className="mb-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Add Team Member</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'moderator')}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Twitter Username</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="@username"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
            />
          </div>
          
          <button
            onClick={() => handleSearch()}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg"
          >
            Search & Add
          </button>
        </div>
      </div>
      
      {/* Members List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Current Team Members</h2>
        
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
              <div>
                <p className="text-white font-medium">@{member.profile?.username}</p>
                <p className="text-slate-400 text-sm">{member.role}</p>
              </div>
              {member.role !== 'owner' && (
                <button
                  onClick={() => handleRemoveMember(member.profile_id)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Server-side: Check permissions
export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectSlug } = context.params || {};
  
  if (!projectSlug || typeof projectSlug !== 'string') {
    return { notFound: true };
  }

  const supabase = getSupabaseAdmin();
  const sessionToken = getSessionTokenFromRequest(context.req);
  
  if (!sessionToken) {
    return {
      redirect: {
        destination: '/portal',
        permanent: false,
      },
    };
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      redirect: {
        destination: '/portal',
        permanent: false,
      },
    };
  }

  // Get project by slug
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .single();

  if (!project) {
    return { notFound: true };
  }

  // Check permissions
  const permissions = await checkProjectPermissions(supabase, userId, project.id);
  
  if (!permissions.canManage && !permissions.isSuperAdmin) {
    return {
      redirect: {
        destination: `/portal/arc/${projectSlug}`,
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};
```

#### Step 2: Add Link to Project Hub Page

**File:** `src/web/pages/portal/arc/[projectSlug].tsx`

Add a "Manage Team" button in the project header (near the "Admin" button):

```tsx
{canManageProject && (
  <>
    <Link
      href={`/portal/arc/${projectSlug}/team`}
      className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
    >
      Manage Team
    </Link>
    <Link
      href={`/portal/arc/admin/${projectSlug}`}
      className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
    >
      Admin
    </Link>
  </>
)}
```

#### Step 3: Create Profile Search API (if needed)

**File:** `src/web/pages/api/portal/profiles/search.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ ok: false, error: 'Query parameter required' });
  }

  const supabase = getSupabaseAdmin();
  const username = q.replace('@', '').toLowerCase().trim();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, name, profile_image_url')
    .ilike('username', `%${username}%`)
    .limit(10);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({
    ok: true,
    profiles: profiles || [],
  });
}
```

---

## Quick Reference

### URLs:
- **ARC Requests:** `/portal/arc/requests`
- **ARC Requests (with project):** `/portal/arc/requests?projectId=PROJECT_ID&intent=request`
- **Team Management (SuperAdmin):** `/portal/admin/projects/[id]/team`
- **Team Management (Project Owner):** `/portal/arc/[projectSlug]/team` (needs to be created)

### API Endpoints:
- **List Team Members:** `GET /api/portal/projects/team-members?projectId=PROJECT_ID`
- **Add Team Member:** `POST /api/portal/projects/team-members`
- **Remove Team Member:** `DELETE /api/portal/projects/team-members`
- **ARC CTA State:** `GET /api/portal/arc/cta-state?projectId=PROJECT_ID`
- **Create Leaderboard Request:** `POST /api/portal/arc/leaderboard-requests`

### Permissions:
- **Request Leaderboard:** Project owner OR admin OR moderator
- **Manage Team:** Project owner OR admin (can add/remove admins and moderators)
- **Remove Team Member:** Project owner OR admin OR superadmin

---

## Next Steps

1. **Verify ARC Request Button:**
   - Check if `/api/portal/arc/cta-state` returns correct values
   - Ensure project has `is_arc_company = true`
   - Verify user has proper permissions

2. **Create Team Management Page:**
   - Use the code above as a starting point
   - Test with a project you own
   - Add profile search functionality

3. **Add Navigation:**
   - Link from project hub page
   - Link from ARC admin page
   - Add to project settings menu (if exists)
