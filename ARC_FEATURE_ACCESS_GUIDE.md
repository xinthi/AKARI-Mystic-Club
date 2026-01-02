# ARC Feature Access Guide

## 📍 Where to Find Features in the UI

### 1. Requesting a Project Leaderboard

#### **Location 1: Sentiment Page (Primary Entry Point)**

**URL:** `/portal/sentiment/[project-slug]`

**When Visible:**
- ✅ User is logged in
- ✅ Project has `is_arc_company = true`
- ✅ User is project owner OR admin/moderator
- ✅ No pending request exists
- ✅ API `/api/portal/arc/cta-state` returns `shouldShowRequestButton: true`

**Button Location:**
- Top right of the sentiment page header
- Next to "Add to Watchlist" and "Open Deep Explorer" buttons
- Green button with checkmark icon: **"Request ARC Leaderboard"**

**What Happens:**
1. Click button → Navigates to `/portal/arc/requests?projectId=UUID&productType=ms&intent=request`
2. Request form loads with project pre-selected
3. Select access level (Leaderboard/Gamified/Creator Manager)
4. Add justification/notes (optional)
5. Submit request

**If Button Doesn't Show:**
- Check browser DevTools → Network tab
- Look for `/api/portal/arc/cta-state?projectId=...` request
- Check response `reason` field:
  - `"Not logged in"` → Log in first
  - `"No permission"` → You're not owner/admin/moderator
  - `"Existing pending request"` → Request already submitted
  - `"Project is not eligible"` → Project needs `is_arc_company = true`

#### **Location 2: ARC Requests Page (Direct Access)**

**URL:** `/portal/arc/requests`

**How to Access:**
- Direct navigation: Type URL in browser
- From ARC home: Click "My Requests" link (if exists)
- Manual link: `/portal/arc/requests?projectId=UUID&productType=ms&intent=request`

**Features:**
- View all your submitted requests
- Submit new requests (select project from dropdown)
- See request status (Pending/Approved/Rejected)

---

### 2. Assigning Project Admins/Moderators

#### **Location: Project Hub Page**

**URL:** `/portal/arc/[project-slug]`

**When Visible:**
- ✅ User is logged in
- ✅ User is project owner OR admin
- ✅ Project has approved ARC access
- ✅ `canManageProject === true` (checked via permissions API)

**Button Location:**
- Top right of project header section
- Next to project name/avatar
- Two buttons: **"Manage Team"** and **"Admin"**

**What Happens:**
1. Click **"Manage Team"** → Navigates to `/portal/arc/[project-slug]/team`
2. Team management page loads showing:
   - Current team members (owners, admins, moderators)
   - Add member form (search by Twitter username)
   - Remove member buttons (for admins/moderators only)

**Alternative Access:**
- From ARC Admin page: Click "Team" in breadcrumb navigation
- Direct URL: `/portal/arc/[project-slug]/team`

---

## 🔍 Visibility Checklist

### Request Leaderboard Button (Sentiment Page)

**Check these in order:**

1. **Are you logged in?**
   - ✅ Must have valid session cookie
   - ✅ Check: Browser DevTools → Application → Cookies → `akari_session`

2. **Is project ARC-eligible?**
   ```sql
   SELECT id, name, is_arc_company 
   FROM projects 
   WHERE slug = 'your-project-slug';
   ```
   - ✅ Must have `is_arc_company = true`
   - ❌ If false: Update with `UPDATE projects SET is_arc_company = true WHERE id = 'project-id';`

3. **Do you have permission?**
   - ✅ Project owner (`projects.claimed_by = your_user_id`)
   - ✅ OR Admin/moderator in `project_team_members`
   - Check:
   ```sql
   -- Check if you're owner
   SELECT id, claimed_by FROM projects WHERE id = 'project-id';
   
   -- Check if you're team member
   SELECT ptm.*, p.username 
   FROM project_team_members ptm
   JOIN profiles p ON p.id = ptm.profile_id
   WHERE ptm.project_id = 'project-id'
   AND ptm.role IN ('owner', 'admin', 'moderator');
   ```

4. **Is there a pending request?**
   ```sql
   SELECT * FROM arc_leaderboard_requests 
   WHERE project_id = 'project-id' 
   AND status = 'pending';
   ```
   - ❌ If exists: Button won't show (request already submitted)

5. **Check API response:**
   - Open DevTools → Network tab
   - Visit `/portal/sentiment/[slug]`
   - Find request: `GET /api/portal/arc/cta-state?projectId=...`
   - Check response:
     ```json
     {
       "ok": true,
       "shouldShowRequestButton": true,  // ✅ Must be true
       "reason": "Has permission"        // ✅ Should show reason
     }
     ```

---

### Manage Team Button (Project Hub)

**Check these in order:**

1. **Are you logged in?**
   - ✅ Must have valid session

2. **Do you have manage permissions?**
   - ✅ Project owner (`projects.claimed_by = your_user_id`)
   - ✅ OR Admin in `project_team_members`
   - ✅ OR Superadmin

3. **Is project accessible?**
   - ✅ Project must have approved ARC access
   - ✅ Project must have `is_arc_company = true`

4. **Check permissions API:**
   - Open DevTools → Network tab
   - Visit `/portal/arc/[project-slug]`
   - Find request: `GET /api/portal/arc/permissions?projectId=...`
   - Check response:
     ```json
     {
       "ok": true,
       "permissions": {
         "canManage": true,  // ✅ Must be true
         "role": "owner"     // ✅ Should show your role
       }
     }
     ```

---

## 📝 Step-by-Step Guides

### How to Request a Leaderboard (From Sentiment Page)

1. **Navigate to project sentiment page:**
   - Go to `/portal/sentiment/[project-slug]`
   - Example: `/portal/sentiment/alignerzlabs`

2. **Look for "Request ARC Leaderboard" button:**
   - Top right of page header
   - Green button with checkmark icon
   - If not visible, check visibility conditions above

3. **Click the button:**
   - Automatically navigates to request form
   - Project is pre-selected
   - Product type is set to "ms" (Mindshare Leaderboard)

4. **Fill out the form:**
   - **Access Level:** Select "Leaderboard" (default)
   - **Justification:** Optional notes about your request
   - **Note:** Dates are currently not in the form (will be added later)

5. **Submit:**
   - Click "Submit Request"
   - You'll see success message
   - Redirects to "My Requests" page after 2 seconds

6. **Track your request:**
   - Go to `/portal/arc/requests`
   - See status: Pending/Approved/Rejected
   - View request details

---

### How to Assign Project Admins/Moderators

1. **Navigate to project hub:**
   - Go to `/portal/arc/[project-slug]`
   - Example: `/portal/arc/alignerzlabs`

2. **Look for "Manage Team" button:**
   - Top right of project header
   - Next to "Admin" button
   - If not visible, you don't have manage permissions

3. **Click "Manage Team":**
   - Navigates to `/portal/arc/[project-slug]/team`
   - Shows current team members

4. **Add a team member:**
   - **Select Role:** Admin or Moderator
   - **Affiliate Title (Optional):** e.g., "Founder", "CMO", "Investor"
   - **Search by Twitter Username:** Type at least 2 characters
   - **Click "Add"** on the desired profile from search results

5. **Remove a team member:**
   - Click **"Remove"** button next to the member
   - Confirm removal
   - **Note:** Owners cannot be removed

6. **Verify changes:**
   - Team members list updates immediately
   - New members can now request leaderboards for the project

---

## 🔗 Direct URLs

### Request Leaderboard:
- **From Sentiment:** `/portal/sentiment/[slug]` → Click button
- **Direct Form:** `/portal/arc/requests?projectId=UUID&productType=ms&intent=request`
- **My Requests:** `/portal/arc/requests`

### Team Management:
- **From Project Hub:** `/portal/arc/[slug]` → Click "Manage Team"
- **Direct:** `/portal/arc/[slug]/team`
- **From Admin:** `/portal/arc/admin/[slug]` → Click "Team" in breadcrumb

---

## 🐛 Troubleshooting

### "Request ARC Leaderboard" Button Not Showing

**Quick Fix:**
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Find: `GET /api/portal/arc/cta-state?projectId=...`
5. Check response `reason` field

**Common Reasons:**
- `"Not logged in"` → Log in first
- `"No permission"` → You're not owner/admin/moderator
- `"Existing pending request"` → Request already submitted
- `"Project is not eligible"` → Set `is_arc_company = true`

**Manual Workaround:**
- Go directly to: `/portal/arc/requests?projectId=YOUR_PROJECT_ID&productType=ms&intent=request`

---

### "Manage Team" Button Not Showing

**Quick Fix:**
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Find: `GET /api/portal/arc/permissions?projectId=...`
5. Check response `canManage` field

**Common Reasons:**
- `canManage: false` → You're not owner/admin
- Project not found → Check project slug
- No ARC access → Project needs approved ARC access

**Manual Workaround:**
- Go directly to: `/portal/arc/[project-slug]/team`
- If you have permissions, page will load
- If not, you'll be redirected

---

## 📊 Current UI Visibility Status

### ✅ Implemented & Visible:

1. **Request Leaderboard Button:**
   - ✅ Location: Sentiment page (`/portal/sentiment/[slug]`)
   - ✅ Condition: API-driven (`shouldShowRequestButton: true`)
   - ✅ Navigation: Includes `projectId` and `productType`

2. **Request Form:**
   - ✅ Location: `/portal/arc/requests` (with query params)
   - ✅ Pre-fills project from query params
   - ✅ Maps `productType` to access level
   - ✅ Submits with correct API format

3. **Manage Team Button:**
   - ✅ Location: Project hub (`/portal/arc/[slug]`)
   - ✅ Condition: `canManageProject === true`
   - ✅ Navigation: Links to `/portal/arc/[slug]/team`

4. **Team Management Page:**
   - ✅ Location: `/portal/arc/[slug]/team`
   - ✅ Access: Owner/admin only (server-side check)
   - ✅ Features: Add/remove admins/moderators

5. **Breadcrumb Links:**
   - ✅ ARC Admin page has "Team" link
   - ✅ Error state has "Manage Team" link

---

## 🎯 Quick Reference

| Feature | Location | Visible When | Direct URL |
|---------|----------|--------------|------------|
| **Request Leaderboard** | Sentiment page | Owner/admin + no pending request | `/portal/arc/requests?projectId=UUID&productType=ms` |
| **My Requests** | ARC Requests page | Always (if logged in) | `/portal/arc/requests` |
| **Manage Team** | Project hub | Owner/admin | `/portal/arc/[slug]/team` |
| **Team Management** | Team page | Owner/admin | `/portal/arc/[slug]/team` |

---

## 📝 Notes

- **Dates for Requests:** The request form currently doesn't have date inputs. For `ms` and `gamefi` requests, dates are required by the API. This will cause validation errors. Date inputs should be added to the form in a future update.

- **SuperAdmin Access:** Superadmins can access team management via `/portal/admin/projects/[id]/team` (different from project owner access).

- **Project Eligibility:** Only projects with `is_arc_company = true` can request leaderboards or have team members assigned.
