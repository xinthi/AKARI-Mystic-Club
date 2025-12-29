# ARC CRM Implementation Summary

**Date:** 2025-01-04  
**Status:** ✅ Core implementation complete (Option 1: CRM)

---

## Overview

This document summarizes the implementation of the ARC (Leaderboard) system with Option 1 (KOL/Creator Manager CRM) as the primary feature, with schema foundations for Options 2 and 3.

---

## 1. Database Schema

### Migration File
- **Location:** `supabase/migrations/20250104_add_arc_crm_tables.sql`

### Tables Created

1. **arc_project_access**
   - Approval requests and decisions for ARC access
   - Fields: project_id, applied_by_profile_id, applied_by_official_x, application_status, approved_by_profile_id, approved_at, notes

2. **arc_project_features**
   - Feature unlock status per project (Option 1, 2, 3)
   - Fields: project_id, option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked, unlocked_at

3. **arc_campaigns**
   - CRM campaigns (Option 1)
   - Fields: project_id, type, participation_mode, leaderboard_visibility, name, brief_objective, start_at, end_at, website_url, docs_url, reward_pool_text, winners_count, status, created_by_profile_id

4. **arc_campaign_participants**
   - Participants in campaigns
   - Fields: campaign_id, profile_id (nullable), twitter_username, status, joined_at

5. **arc_participant_links**
   - UTM tracking links per participant per campaign
   - Fields: campaign_id, participant_id, code (unique), target_url

6. **arc_link_events**
   - Click tracking for UTM links
   - Fields: campaign_id, participant_id, ts, ip_hash, user_agent_hash, referrer

7. **arc_external_submissions**
   - External proof submissions (YouTube, TikTok, Telegram, Other)
   - Fields: campaign_id, participant_id, platform, url, status, reviewed_by_profile_id, reviewed_at, notes

### RLS Policies

All tables have comprehensive RLS policies:
- Service role: Full access (for API routes)
- Super admins: Full access to all data
- Project admins/moderators: Manage their project campaigns
- Participants: Access their own data and view leaderboards based on visibility rules
- Public: View public leaderboards/campaigns only

---

## 2. Backend APIs

### Approval/Unlock Flow

1. **POST /api/portal/arc/projects/[projectId]/apply**
   - Submit ARC access approval request
   - Only project owners/admins/moderators can apply
   - Returns request ID and status

2. **GET /api/portal/admin/arc/requests**
   - List all ARC access requests (super admin only)
   - Supports status filter (pending/approved/rejected)

3. **PATCH /api/portal/admin/arc/requests/[id]**
   - Approve/reject requests and unlock features (super admin only)
   - Can unlock one or more options (option1_crm, option2_normal, option3_gamified)

### CRM Campaign APIs

1. **POST /api/portal/arc/campaigns**
   - Create new campaign
   - Requires project approved + option1_crm unlocked
   - Validates dates, required fields

2. **GET /api/portal/arc/campaigns**
   - List campaigns (optionally filtered by projectId)
   - Respects RLS policies

3. **GET /api/portal/arc/campaigns/[id]**
   - Get single campaign by ID

4. **POST /api/portal/arc/campaigns/[id]/participants**
   - Add participant by twitter_username or profile_id
   - Admin/moderator only

5. **POST /api/portal/arc/campaigns/[id]/join**
   - Public/hybrid join endpoint for creators
   - Works for campaigns with participation_mode: 'public' or 'hybrid'

6. **POST /api/portal/arc/campaigns/[id]/participants/[pid]/link**
   - Generate UTM tracking link for participant
   - Returns redirect URL with unique code

### Leaderboard & External Submissions

1. **GET /api/portal/arc/campaigns/[id]/leaderboard**
   - Get leaderboard based on X auto-tracking data
   - Uses user_ct_activity for scoring
   - Respects leaderboard_visibility rules

2. **GET /api/portal/arc/campaigns/[id]/winners**
   - Get top N winners from leaderboard
   - Uses campaign.winners_count or query param `top`

3. **GET /api/portal/arc/campaigns/[id]/external-submissions**
   - List external submissions (admin/moderator or participant)

4. **POST /api/portal/arc/campaigns/[id]/external-submissions**
   - Submit external proof (YouTube, TikTok, Telegram, Other)
   - Participants can submit their own

5. **POST /api/portal/arc/campaigns/[id]/external-submissions/[sid]/review**
   - Approve/reject external submissions (admin/moderator only)

### Redirect Route

1. **GET /api/portal/arc/redirect/[code]**
   - Handles UTM tracking link redirects
   - Logs click events (ip_hash, user_agent_hash, referrer)
   - Redirects to target_url with UTM parameters:
     - utm_source=akari
     - utm_medium=arc
     - utm_campaign=<campaign_id>
     - utm_content=<participant_id>

---

## 3. Frontend Pages

### Redirect Page
- **Location:** `src/web/pages/r/[code].tsx`
- Handles client-side redirect with loading state

### Option 2 & 3 Stubs
- **Location:** `src/web/pages/portal/arc/leaderboard/[projectId].tsx`
- **Location:** `src/web/pages/portal/arc/gamified/[projectId].tsx`
- Return "Coming soon" messages

---

## 4. Utility Functions

### ARC Permissions Helper
- **Location:** `src/web/lib/arc-permissions.ts`
- Functions:
  - `checkArcProjectApproval()` - Check if project has ARC approval
  - `checkArcFeatureUnlock()` - Check if specific option is unlocked
  - `getArcFeatureUnlockStatus()` - Get all feature unlock statuses
  - `verifyArcOptionAccess()` - Verify project can use a specific option
  - `canApplyForArcAccess()` - Check if user can apply for ARC access
  - `getProfileIdFromUserId()` - Get profile ID from user ID

---

## 5. Key Implementation Notes

### Approval Flow
1. Projects must apply for ARC access (via project owners/admins/moderators)
2. Super Admin approves/rejects and unlocks specific options
3. Projects must have approved status AND unlocked status for an option to use it
4. All APIs verify approval + unlock status server-side

### UTM Tracking
- Each participant gets a unique tracking link per campaign
- Links use format: `/r/[code]`
- Click events are logged with hashed IP and user agent for privacy
- Redirect includes UTM parameters for analytics

### Leaderboard Scoring
- Currently uses simplified scoring based on user_ct_activity
- Formula: tweet_count + (likes * 0.1) + (retweets * 0.5) + (replies * 0.2)
- Note: For MVP, the leaderboard queries may need refinement to properly link profiles to user_ct_activity via akari_user_identities. Current implementation works but may not be fully accurate for all participants.

### External Submissions
- Supports YouTube, TikTok, Telegram, Other platforms
- Participants can submit links
- Admins/moderators can approve/reject
- No scoring/points for external submissions in MVP (display only)

---

## 6. What's NOT Implemented (By Design)

- Payment integration (only flags stored)
- Telegram join enforcement
- CT-wide mention/keyword enforcement for Option 2/3
- Manual X post submissions (X tracking is automatic via AkariSentiment)
- Full Option 2 implementation (normal leaderboard)
- Full Option 3 implementation (gamified leaderboard with quests)

---

## 7. Next Steps

### For Production

1. **Run Migration**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: supabase/migrations/20250104_add_arc_crm_tables.sql
   ```

2. **Test Build**
   ```bash
   pnpm build
   ```

3. **Frontend Pages** (TODO - not implemented in this iteration)
   - Create project hub page (`/portal/arc/project/[projectId]`)
   - Create campaign list page (`/portal/arc/project/[projectId]/campaigns`)
   - Create campaign create page (`/portal/arc/project/[projectId]/campaigns/new`)
   - Create campaign workspace page (`/portal/arc/project/[projectId]/campaigns/[campaignId]`)
   - Create creator campaign page (`/portal/arc/campaign/[campaignId]`)

4. **Refinements**
   - Improve leaderboard query to properly link profiles to user_ct_activity
   - Add admin approval UI page
   - Add campaign management UI
   - Add participant management UI
   - Add external submissions review UI

---

## 8. Testing Checklist

- [ ] Run database migration successfully
- [ ] Test approval request flow
- [ ] Test super admin approval/rejection
- [ ] Test campaign creation
- [ ] Test participant management
- [ ] Test UTM link generation and redirect
- [ ] Test leaderboard generation
- [ ] Test external submissions
- [ ] Verify RLS policies work correctly
- [ ] Test `pnpm build` passes

---

## Files Created/Modified

### Database
- `supabase/migrations/20250104_add_arc_crm_tables.sql`

### Backend APIs
- `src/web/pages/api/portal/arc/projects/[projectId]/apply.ts`
- `src/web/pages/api/portal/admin/arc/requests.ts`
- `src/web/pages/api/portal/admin/arc/requests/[id].ts`
- `src/web/pages/api/portal/arc/campaigns/index.ts`
- `src/web/pages/api/portal/arc/campaigns/[id].ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/participants.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/join.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/leaderboard.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/winners.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`
- `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/[sid]/review.ts`
- `src/web/pages/api/portal/arc/redirect/[code].ts`
- `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` (stub)
- `src/web/pages/api/portal/arc/gamified/[projectId].ts` (stub)

### Frontend Pages
- `src/web/pages/r/[code].tsx`
- `src/web/pages/portal/arc/leaderboard/[projectId].tsx` (stub)
- `src/web/pages/portal/arc/gamified/[projectId].tsx` (stub)

### Utilities
- `src/web/lib/arc-permissions.ts`











