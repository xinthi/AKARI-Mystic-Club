# Fix: ARC Home Page Shows "No active ARC projects yet"

## Problem

The ARC home page (`/portal/arc`) shows "No active ARC projects yet" even though you have an arena (MYSTIC CLUB Mindshare) with the ID `f16454be-b0fd-471e-8b84-fc2a8d615c26`.

## Root Cause

The `/api/portal/arc/projects` endpoint has strict requirements for a project to appear in the ARC home page. The project must meet **ALL** of the following:

1. **Base Requirement:** Approved ARC access
   - Must have an entry in `arc_project_access` with `application_status = 'approved'`

2. **Project Flags:**
   - `is_arc_company = true` OR `is_arc_company IS NULL`
   - `is_active = true`

3. **At least ONE of these conditions:**
   - `leaderboard_enabled = true` in `arc_project_features`, OR
   - Active MS arena (status IN ('active','live'), kind IN ('ms','legacy_ms'), now between starts_at and ends_at), OR
   - Approved leaderboard request in `arc_leaderboard_requests` with `status='approved'`

## Quick Fix: Run SQL Script

Run the SQL script `supabase/fix_arc_projects_visibility.sql` in your Supabase SQL Editor. This script will:

1. Find your MYSTIC CLUB project (by arena ID or name)
2. Set `is_arc_company = true` if it's NULL or false
3. Create/update an approved `arc_project_access` entry
4. Create/update `arc_project_features` with `leaderboard_enabled = true`
5. Ensure the arena status is 'active' and kind is 'ms'

### How to Run:

1. **Open Supabase Dashboard**
2. **Go to SQL Editor**
3. **Click "New Query"**
4. **Copy and paste the contents of `supabase/fix_arc_projects_visibility.sql`**
5. **Click "Run"**

The script will output detailed logs showing what was fixed.

## Diagnostic: Check Project Status

You can also check the current status of any project using the diagnostic API endpoint:

### Browser Console:

```javascript
// Check by project slug
fetch('/api/portal/admin/arc/check-project-status?projectSlug=mysticheros', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => {
    console.log('Project Status:', data);
    if (data.ok) {
      console.log('Message:', data.message);
      console.log('Eligibility:', data.status.is_eligible_for_arc_home);
      console.log('Blocking Reasons:', data.status.blocking_reasons);
      console.log('Eligibility Reasons:', data.status.eligibility_reasons);
    }
  });
```

### Or use the API directly:

```bash
# By project slug
curl -X GET "https://akarimystic.club/api/portal/admin/arc/check-project-status?projectSlug=mysticheros" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"

# By Twitter username
curl -X GET "https://akarimystic.club/api/portal/admin/arc/check-project-status?twitterUsername=mysticheros" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"

# By project ID
curl -X GET "https://akarimystic.club/api/portal/admin/arc/check-project-status?projectId=YOUR_PROJECT_ID" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

## Manual Fix (if SQL script doesn't work)

If the SQL script doesn't work, you can manually check and fix each requirement:

### Step 1: Check if project has approved ARC access

```sql
SELECT 
  p.id,
  p.name,
  p.slug,
  p.is_arc_company,
  p.is_active,
  apa.application_status,
  apa.created_at
FROM projects p
LEFT JOIN arc_project_access apa ON apa.project_id = p.id
WHERE p.slug = 'mysticheros' 
  OR p.twitter_username ILIKE '%mysticheros%'
ORDER BY apa.created_at DESC
LIMIT 1;
```

If `application_status` is not 'approved' or NULL:

```sql
-- Insert approved access (replace PROJECT_ID with actual ID)
INSERT INTO arc_project_access (project_id, application_status, created_at, updated_at)
VALUES ('PROJECT_ID', 'approved', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Or update existing entry
UPDATE arc_project_access
SET application_status = 'approved', updated_at = NOW()
WHERE project_id = 'PROJECT_ID'
  AND application_status != 'approved';
```

### Step 2: Check if project has leaderboard enabled

```sql
SELECT 
  p.id,
  p.name,
  apf.leaderboard_enabled,
  apf.option2_normal_unlocked
FROM projects p
LEFT JOIN arc_project_features apf ON apf.project_id = p.id
WHERE p.slug = 'mysticheros' 
  OR p.twitter_username ILIKE '%mysticheros%';
```

If `leaderboard_enabled` is not `true`:

```sql
-- Insert features row (replace PROJECT_ID with actual ID)
INSERT INTO arc_project_features (
  project_id,
  leaderboard_enabled,
  option2_normal_unlocked,
  created_at,
  updated_at
)
VALUES (
  'PROJECT_ID',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (project_id) DO UPDATE
SET leaderboard_enabled = true,
    option2_normal_unlocked = true,
    updated_at = NOW();
```

### Step 3: Check if project has is_arc_company flag

```sql
UPDATE projects
SET is_arc_company = COALESCE(is_arc_company, true)
WHERE slug = 'mysticheros' 
  OR twitter_username ILIKE '%mysticheros%';
```

### Step 4: Verify arena status and kind

```sql
SELECT 
  a.id,
  a.name,
  a.status,
  a.kind,
  a.starts_at,
  a.ends_at,
  a.project_id
FROM arenas a
INNER JOIN projects p ON p.id = a.project_id
WHERE a.id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26'
  OR p.slug = 'mysticheros'
  OR p.twitter_username ILIKE '%mysticheros%';
```

If status is not 'active' or 'live', or kind is not 'ms' or 'legacy_ms':

```sql
UPDATE arenas
SET status = CASE 
    WHEN status NOT IN ('active', 'live') THEN 'active'
    ELSE status
  END,
  kind = CASE
    WHEN kind NOT IN ('ms', 'legacy_ms') THEN 'ms'
    ELSE kind
  END,
  updated_at = NOW()
WHERE id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26';
```

## Verification

After running the fix, refresh the ARC home page (`/portal/arc`) and verify:

1. The project should appear in the "ARC Products" section
2. If it has `leaderboard_enabled = true`, it should show a "MS" (Mindshare) card
3. Clicking the card should navigate to `/portal/arc/mysticheros` (or the project's slug)

## Alternative: Enable ALL Projects with Active Arenas

If you want to enable ALL projects that have active MS arenas (not just MYSTIC CLUB), uncomment the alternative section in `supabase/fix_arc_projects_visibility.sql` and run it.

---

**Need Help?** Use the diagnostic endpoint `/api/portal/admin/arc/check-project-status` to see exactly what's missing for any project.
