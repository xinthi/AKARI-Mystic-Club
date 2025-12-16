# ARC Navigation Visibility Fix - Summary

## Problem
ARC menu button is not visible in production, even for SuperAdmin users.

## Root Cause Analysis

The code structure looks correct:
- ✅ ARC item is in `navItems` array (line 24)
- ✅ `visibleNavItems = navItems` (no filtering)
- ✅ Special handling for ARC item exists (lines 137-167, 278-308)
- ✅ `canUseArc` logic checks SuperAdmin status

**Potential Issues:**
1. **User object not loading correctly** - `akariUser.user` might be null/undefined in production
2. **realRoles not populated** - The API might not be returning roles correctly
3. **Timing issue** - Component might render before user loads
4. **CSS hiding** - Item might be rendered but hidden by CSS
5. **Build/deployment issue** - Code might not be deployed correctly

## Changes Made

### 1. Added Comprehensive Debug Logging

**Location:** `src/web/components/portal/PortalLayout.tsx`

**Added logs:**
- Line 69-78: Logs when `canUseArc` is calculated, showing:
  - `isDevBypass`
  - `isSuperAdminUser`
  - `canUseArc` result
  - `isLoading` status
  - `hasUser` boolean
  - `realRoles` array
  - `effectiveRoles` array

- Line 84-92: Verifies ARC item exists in navItems array
- Line 140-145: Logs when rendering ARC nav item (desktop)
- Line 283-288: Logs when rendering ARC nav item (mobile)

### 2. Added Explicit Display Style

**Location:** Lines 159 and 304

Added `style={{ display: 'flex' }}` to the disabled button to ensure it's always visible, even if CSS tries to hide it.

### 3. Enhanced canUseArc Logic

The logic now:
- Checks dev mode bypass
- Uses `isSuperAdmin()` helper function
- Falls back to direct `realRoles` check
- Logs all intermediate values for debugging

## How to Debug in Production

### Step 1: Open Browser Console
1. Open your production site
2. Open Developer Tools (F12)
3. Go to Console tab

### Step 2: Look for Debug Logs
You should see logs like:
```
[PortalLayout] ARC nav item check: { arcItemExists: true, ... }
[PortalLayout] ARC visibility check: { isDevBypass: false, isSuperAdminUser: true/false, ... }
[PortalLayout] Rendering ARC nav item: { canUseArc: true/false, ... }
```

### Step 3: Check the Values

**If `arcItemExists: false`:**
- The navItems array is being modified somewhere (unlikely)
- Check if there's another file overriding navItems

**If `isSuperAdminUser: false` but you're a SuperAdmin:**
- Check `realRoles` value in the log
- Verify API `/api/auth/website/me` returns `roles: ['super_admin']`
- Check if `isLoading: true` (user hasn't loaded yet)

**If `canUseArc: false`:**
- In production, this means user is not SuperAdmin
- Check `realRoles` contains `'super_admin'`
- Check `isLoading` is `false` (user has loaded)

**If logs show `canUseArc: true` but button still not visible:**
- Check CSS - item might be hidden by styles
- Check if item is in DOM (inspect element)
- Check for JavaScript errors preventing render

### Step 4: Verify API Response
1. Open Network tab in DevTools
2. Find request to `/api/auth/website/me`
3. Check response JSON:
   ```json
   {
     "ok": true,
     "user": {
       "roles": ["super_admin"],
       ...
     }
   }
   ```

## Expected Behavior

### For SuperAdmin Users:
- ✅ ARC nav item should be **visible**
- ✅ ARC nav item should be **clickable** (Link component)
- ✅ Console log should show: `canUseArc: true`
- ✅ Console log should show: `isSuperAdminUser: true`
- ✅ Console log should show: `realRoles: ['super_admin']]`

### For Normal Users:
- ✅ ARC nav item should be **visible** (but dimmed)
- ❌ ARC nav item should be **NOT clickable** (button with `pointer-events-none`)
- ✅ Console log should show: `canUseArc: false`
- ✅ Console log should show: `isSuperAdminUser: false`

## If Still Not Working

### Check These:

1. **Verify Code is Deployed**
   - Check if changes are in production build
   - Verify file `src/web/components/portal/PortalLayout.tsx` has the debug logs

2. **Check User Loading**
   - Verify `akariUser.isLoading` becomes `false`
   - Verify `akariUser.user` is not null
   - Check if there are errors in console

3. **Check API Response**
   - Verify `/api/auth/website/me` returns correct roles
   - Check if API is returning `roles` or `realRoles` field

4. **Check CSS**
   - Inspect the nav element in DevTools
   - Check if `display: none` or `visibility: hidden` is applied
   - Check if item is in DOM but off-screen

5. **Check for JavaScript Errors**
   - Look for red errors in console
   - Check if React is throwing errors
   - Verify no build errors

## Next Steps

1. **Deploy these changes** to production
2. **Open browser console** and check the debug logs
3. **Share the console output** so we can see:
   - What `realRoles` contains
   - What `canUseArc` evaluates to
   - Whether the item is being rendered
4. **If still not visible**, we'll need to:
   - Check the API response format
   - Verify the user object structure
   - Check for any other code filtering nav items

## Files Modified

- `src/web/components/portal/PortalLayout.tsx`
  - Added debug logging (4 locations)
  - Added explicit `display: flex` style to disabled button
  - Enhanced `canUseArc` calculation with logging

## Testing Checklist

- [ ] Deploy to production
- [ ] Open browser console
- [ ] Check for debug logs
- [ ] Verify `arcItemExists: true`
- [ ] Verify `realRoles` contains `'super_admin'` for SuperAdmin users
- [ ] Verify `canUseArc: true` for SuperAdmin users
- [ ] Verify ARC nav item is visible (even if disabled)
- [ ] Verify ARC nav item is clickable for SuperAdmins
- [ ] Verify ARC nav item is NOT clickable for normal users

---

**Date:** December 2024  
**Status:** Ready for Production Testing


