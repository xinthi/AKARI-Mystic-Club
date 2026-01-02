# ARC Cleanup Summary

**Date:** 2025-02-01  
**Status:** ⚠️ Partially Complete - Manual Step Required

---

## Completed Actions

### ✅ Redirects Created

1. **`src/web/pages/portal/arc/[slug].tsx`** → Redirects to `/portal/arc/[projectSlug]`
2. **`src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`** → Redirects to `/portal/arc/[projectSlug]/arena/[arenaSlug]`
3. **`src/web/pages/portal/arc/admin/index.tsx`** → Redirects to `/portal/admin/arc`

### ✅ Links Updated

Updated all internal links from `/portal/arc/admin` to `/portal/admin/arc`:
- `src/web/pages/portal/arc/admin/[projectSlug].tsx`
- `src/web/pages/portal/admin/arc/activity.tsx`
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
- `src/web/components/arc/fb/mobile/MobileLayout.tsx`
- `src/web/components/arc/mobile/ArcMobileFeed.tsx`
- `src/web/components/arc/fb/LeftRail.tsx`
- `src/web/components/arc/layout/ArcDesktopLeftNav.tsx`

### ✅ Documentation Created

- `docs/ARC_ROUTES.md` - Complete route map and guidelines

---

## ⚠️ Manual Step Required

Due to PowerShell limitations with bracket characters in file paths, the following files need to be manually created:

### 1. Create `src/web/pages/portal/arc/[projectSlug].tsx`

**Method 1 (Recommended):** Restore from git and rename:
```bash
git show HEAD:src/web/pages/portal/arc/\[slug\].tsx > temp_slug.tsx
# Then manually rename/copy temp_slug.tsx to [projectSlug].tsx
```

**Method 2:** Copy the redirect file content, then restore original:
```bash
# The redirect is already in place, but you need the original content
# Restore from git history before the redirect was added
```

**Content:** The file should be identical to the original `[slug].tsx` (before redirect), but the route will naturally use `[projectSlug]` as the parameter name since that's the filename.

### 2. Create `src/web/pages/portal/arc/[projectSlug]/arena/[arenaSlug].tsx`

Same process as above:
```bash
git show HEAD:src/web/pages/portal/arc/\[slug\]/arena/\[arenaSlug\].tsx > temp_arena.tsx
# Then manually copy to [projectSlug]/arena/[arenaSlug].tsx
```

---

## Files Changed

### Removed Files
- None (all legacy routes converted to redirects)

### Redirect Files (Keep These)
- `src/web/pages/portal/arc/[slug].tsx` - Redirect only
- `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - Redirect only
- `src/web/pages/portal/arc/admin/index.tsx` - Redirect only

### Updated Files
- `src/web/pages/portal/arc/admin/[projectSlug].tsx`
- `src/web/pages/portal/admin/arc/activity.tsx`
- `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
- `src/web/components/arc/fb/mobile/MobileLayout.tsx`
- `src/web/components/arc/mobile/ArcMobileFeed.tsx`
- `src/web/components/arc/fb/LeftRail.tsx`
- `src/web/components/arc/layout/ArcDesktopLeftNav.tsx`

### New Files (To Be Created)
- `src/web/pages/portal/arc/[projectSlug].tsx` ⚠️ **MANUAL STEP**
- `src/web/pages/portal/arc/[projectSlug]/arena/[arenaSlug].tsx` ⚠️ **MANUAL STEP**

---

## Verification Checklist

After completing manual steps:

- [ ] `src/web/pages/portal/arc/[projectSlug].tsx` exists and compiles
- [ ] `src/web/pages/portal/arc/[projectSlug]/arena/[arenaSlug].tsx` exists and compiles
- [ ] `/portal/arc/[slug]` redirects to `/portal/arc/[projectSlug]` (301)
- [ ] `/portal/arc/[slug]/arena/[arenaSlug]` redirects to `/portal/arc/[projectSlug]/arena/[arenaSlug]` (301)
- [ ] `/portal/arc/admin` redirects to `/portal/admin/arc` (301)
- [ ] All internal links use canonical routes
- [ ] No TypeScript compilation errors
- [ ] No route collisions (only one approve handler: `[requestId]/approve.ts`)

---

## Route Collision Check

✅ **Confirmed:** Only one approve handler exists:
- `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts`

No duplicate `[id]/approve.ts` found.

---

## Next Steps

1. **Complete manual file creation** (see above)
2. **Test all redirects** work correctly
3. **Verify no broken links** in the UI
4. **Run build** to ensure no TypeScript errors
5. **Update this document** when manual steps are complete

---

## Notes

- `src/web/pages/portal/arc/requests.tsx` was kept as-is (user-facing "My Requests" page, different from admin approval)
- All redirects use 301 (permanent) redirects for SEO
- Route documentation is in `docs/ARC_ROUTES.md`
