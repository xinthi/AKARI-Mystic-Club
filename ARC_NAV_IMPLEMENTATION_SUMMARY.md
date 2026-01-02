# ARC Navigation Implementation Summary

**Date:** 2025-02-01  
**Status:** ✅ Complete (with one note about [projectSlug].tsx)

---

## Implementation Complete

### ✅ Created Components

1. **`src/web/components/arc/ArcNav.tsx`**
   - Reusable navigation component
   - Shows sections: General, Project (conditional), Superadmin (conditional)
   - Respects permissions: `canManageProject` and `isSuperAdmin`

### ✅ Updated Components

1. **`src/web/components/arc/fb/LeftRail.tsx`**
   - Added props: `projectSlug`, `canManageProject`, `isSuperAdmin`
   - Integrated `ArcNav` component at the top of navigation
   - Existing navigation items remain below ArcNav

2. **`src/web/components/arc/fb/ArcPageShell.tsx`**
   - Added props: `projectSlug`, `canManageProject`, `isSuperAdmin`
   - Passes props to `LeftRail`

3. **`src/web/components/arc/fb/DesktopArcShell.tsx`**
   - Added props: `projectSlug`, `canManageProject`, `isSuperAdmin`
   - Passes props to `LeftRail`

### ✅ Updated Pages

1. **`src/web/pages/portal/arc/index.tsx` (ARC Home)**
   - Passes `isSuperAdmin={userIsSuperAdmin}` to `DesktopArcShell`
   - ✅ Navigation shows: ARC Home, Superadmin section (if superadmin)

2. **`src/web/pages/portal/arc/admin/[projectSlug].tsx` (Project Admin)**
   - Passes `projectSlug`, `canManageProject={canManage}`, `isSuperAdmin={userIsSuperAdmin}` to `ArcPageShell`
   - ✅ Navigation shows: ARC Home, Project Hub, Project Admin, Superadmin section (if superadmin)

3. **`src/web/pages/portal/admin/arc/leaderboard-requests.tsx`**
   - Passes `isSuperAdmin={userIsSuperAdmin}` to `ArcPageShell`
   - ✅ Navigation shows: ARC Home, Superadmin section

4. **`src/web/pages/portal/admin/arc/billing.tsx`**
   - Passes `isSuperAdmin={userIsSuperAdmin}` to `ArcPageShell`
   - ✅ Navigation shows: ARC Home, Superadmin section

5. **`src/web/pages/portal/admin/arc/activity.tsx`**
   - Passes `isSuperAdmin={userIsSuperAdmin}` to `ArcPageShell`
   - ✅ Navigation shows: ARC Home, Superadmin section

### ⚠️ Note: Reports Page

**`src/web/pages/portal/admin/arc/reports/index.tsx`**
- Uses `PortalLayout` instead of `ArcPageShell`
- **Action Required:** Consider switching to `ArcPageShell` or adding `ArcNav` manually
- Currently: No ARC navigation sidebar (uses Portal navigation)

### ⚠️ Note: Project Hub Page

**`src/web/pages/portal/arc/[projectSlug].tsx`**
- This file doesn't exist yet (see `ARC_CLEANUP_SUMMARY.md` - manual step required)
- **Action Required:** Once `[projectSlug].tsx` is created, wire it up:
  ```tsx
  // In the component:
  const projectSlug = router.query.projectSlug as string;
  const [canManage, setCanManage] = useState(false);
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  
  // Fetch permissions:
  useEffect(() => {
    if (project?.id) {
      fetch(`/api/portal/arc/permissions?projectId=${project.id}`)
        .then(res => res.json())
        .then(data => setCanManage(data.permissions?.canManage || false));
    }
  }, [project?.id]);
  
  // Pass to ArcPageShell:
  <ArcPageShell
    projectSlug={projectSlug}
    canManageProject={canManage}
    isSuperAdmin={userIsSuperAdmin}
  >
  ```

### ✅ Portal Entry Point

**`src/web/components/portal/PortalLayout.tsx`**
- Already has ARC link in main navigation: `/portal/arc`
- ✅ No changes needed

---

## Navigation Structure

### General Section (Always Visible)
- **ARC Home** → `/portal/arc`

### Project Section (Only if `projectSlug` exists)
- **Project Hub** → `/portal/arc/[projectSlug]`
- **Project Admin** → `/portal/arc/admin/[projectSlug]` (only if `canManageProject` OR `isSuperAdmin`)

### Superadmin Section (Only if `isSuperAdmin` is true)
- **Requests** → `/portal/admin/arc/leaderboard-requests`
- **Billing** → `/portal/admin/arc/billing`
- **Reports** → `/portal/admin/arc/reports`
- **Activity** → `/portal/admin/arc/activity`

---

## Verification Checklist

- [x] ArcNav component created
- [x] LeftRail integrated ArcNav
- [x] ArcPageShell passes props to LeftRail
- [x] DesktopArcShell passes props to LeftRail
- [x] ARC Home page wired up
- [x] Project Admin page wired up
- [x] All superadmin pages wired up
- [ ] Project Hub page ([projectSlug].tsx) - **Pending file creation**
- [ ] Reports page - **Uses PortalLayout, consider switching**

---

## Files Changed

### New Files
- `src/web/components/arc/ArcNav.tsx`

### Modified Files
- `src/web/components/arc/fb/LeftRail.tsx`
- `src/web/components/arc/fb/ArcPageShell.tsx`
- `src/web/components/arc/fb/DesktopArcShell.tsx`
- `src/web/pages/portal/arc/index.tsx`
- `src/web/pages/portal/arc/admin/[projectSlug].tsx`
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
- `src/web/pages/portal/admin/arc/billing.tsx`
- `src/web/pages/portal/admin/arc/activity.tsx`

---

## Testing

### Test Cases

1. **ARC Home** (`/portal/arc`)
   - ✅ Shows "ARC Home" link (active)
   - ✅ Shows Superadmin section if user is superadmin
   - ✅ Hides Superadmin section if user is not superadmin

2. **Project Admin** (`/portal/arc/admin/[projectSlug]`)
   - ✅ Shows "ARC Home" link
   - ✅ Shows "Project Hub" link
   - ✅ Shows "Project Admin" link (active)
   - ✅ Shows Superadmin section if user is superadmin
   - ✅ Hides "Project Admin" if user cannot manage project

3. **Superadmin Pages** (`/portal/admin/arc/*`)
   - ✅ Shows "ARC Home" link
   - ✅ Shows Superadmin section with all links
   - ✅ Current page link is active

4. **Non-Superadmin Users**
   - ✅ Superadmin section is hidden
   - ✅ Project Admin link only shows if `canManageProject` is true

---

## Next Steps

1. **Create `[projectSlug].tsx`** (see `ARC_CLEANUP_SUMMARY.md`)
2. **Wire up Project Hub page** with ArcNav (see note above)
3. **Consider switching Reports page** to use `ArcPageShell` for consistency
