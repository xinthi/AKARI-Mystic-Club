# ARC Request Form - Project ID Loading Fix

## Issue

When clicking "Request ARC Leaderboard" button from sentiment page, the form shows "projectId is required" error even though the URL contains `projectId` in query params.

**URL:** `/portal/arc/requests?projectId=9bfa62d3-5cb6-4348-94c3-dede20445b81&productType=ms&intent=request`

## Root Cause

The form was trying to submit before the project finished loading from the API, or the project loading was failing silently.

## Fixes Applied

### 1. Added Router Ready Check
```typescript
// Wait for router to be ready before reading query params
if (!router.isReady) return;
```

### 2. Enhanced Project Loading
- Added URL encoding for projectId/slug
- Added comprehensive error logging (dev mode)
- Added validation to ensure project.id exists
- Better error messages for users

### 3. Improved Form Validation
- Check `selectedProject?.id` exists before showing form
- Disable submit button if project ID is missing
- Show helpful error message if project fails to load
- Display project ID in dev mode for debugging

### 4. Better Error Messages
- "Project ID is missing or invalid" instead of generic "projectId is required"
- Shows project ID from URL if loading fails
- Clear instructions to refresh and try again

## How It Works Now

1. **User clicks "Request ARC Leaderboard" button:**
   - Navigates to: `/portal/arc/requests?projectId=UUID&productType=ms&intent=request`

2. **Form loads:**
   - Waits for `router.isReady`
   - Reads `projectId` from query params
   - Calls `/api/portal/arc/project/[projectId]`
   - Sets `selectedProject` state

3. **Form displays:**
   - Only shows if `selectedProject` exists AND `selectedProject.id` exists
   - Shows loading spinner while fetching
   - Shows error message if project fails to load

4. **User submits:**
   - Validates `selectedProject.id` exists
   - Sends request with correct `projectId`
   - Shows helpful error if validation fails

## Debugging

If you still see "projectId is required":

1. **Open DevTools → Console:**
   - Look for `[Request Form]` log messages
   - Check if project is loading successfully

2. **Open DevTools → Network:**
   - Find: `GET /api/portal/arc/project/[projectId]`
   - Check response status and data

3. **Check URL:**
   - Verify `projectId` is in query params
   - Verify it's a valid UUID format

4. **Manual Test:**
   - Try direct API call: `/api/portal/arc/project/9bfa62d3-5cb6-4348-94c3-dede20445b81`
   - Should return project data

## Files Modified

- `src/web/pages/portal/arc/requests.tsx`
  - Added `router.isReady` check
  - Enhanced `loadProject` function with better error handling
  - Added validation in `handleSubmitRequest`
  - Improved error messages and UI feedback
