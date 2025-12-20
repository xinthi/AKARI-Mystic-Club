# ARC INVENTORY REPORT
**Date:** 2025-01-XX  
**Scope:** Complete inventory of ARC (Akari Reputation Circuit) database tables and code usage  
**Status:** INVENTORY ONLY - NO IMPLEMENTATION

---

## A) ARC TABLE MAP

### Module A: Leaderboard (Public Contribution, Kaito-style X tracking)

#### `arenas`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `slug` (TEXT, UNIQUE)
  - `name` (TEXT)
  - `description` (TEXT)
  - `status` (TEXT: 'draft', 'scheduled', 'active', 'ended', 'cancelled')
  - `starts_at` (TIMESTAMPTZ)
  - `ends_at` (TIMESTAMPTZ)
  - `reward_depth` (INTEGER, default 100)
  - `settings` (JSONB)
  - `created_by` (UUID, FK → profiles.id)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Relationships:**
  - `project_id` → `projects(id)`
  - `created_by` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/arenas/index.ts`
  - `src/web/pages/api/portal/arc/arenas/[slug].ts`
  - `src/web/pages/api/portal/arc/arenas-admin.ts`
  - `src/web/pages/api/portal/arc/arena-details.ts`
  - `src/web/pages/api/portal/arc/projects.ts`
  - `src/web/pages/api/portal/arc/summary.ts`
  - `src/web/pages/api/portal/arc/join-campaign.ts`
  - `src/web/pages/api/portal/projects/team-members.ts`
  - `src/web/pages/portal/arc/admin/[projectSlug].tsx`
  - `src/web/lib/arc/scoring.ts`
- **Status:** ✅ ACTIVE

#### `arena_creators`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `arena_id` (UUID, FK → arenas.id)
  - `profile_id` (UUID, FK → profiles.id, nullable)
  - `twitter_username` (TEXT, NOT NULL)
  - `arc_points` (NUMERIC(18,4), default 0) - **SCORED POINTS**
  - `ring` (TEXT: 'core', 'momentum', 'discovery', default 'discovery')
  - `style` (TEXT)
  - `meta` (JSONB)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(arena_id, twitter_username)`
- **Relationships:**
  - `arena_id` → `arenas(id)`
  - `profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/arena-creators.ts`
  - `src/web/pages/api/portal/arc/arenas/[slug].ts`
  - `src/web/pages/api/portal/arc/arena-details.ts`
  - `src/web/pages/api/portal/arc/projects.ts`
  - `src/web/pages/api/portal/arc/summary.ts`
  - `src/web/pages/api/portal/arc/join-campaign.ts`
  - `src/web/pages/api/portal/arc/creator.ts`
  - `src/web/pages/portal/arc/creator/[twitterUsername].tsx`
  - `src/web/lib/arc/scoring.ts` - **SCORING LOGIC**
- **Status:** ✅ ACTIVE

#### `arc_leaderboard_requests`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `requested_by` (UUID, FK → profiles.id)
  - `justification` (TEXT)
  - `requested_arc_access_level` (TEXT: 'creator_manager', 'leaderboard', 'gamified', nullable)
  - `status` (TEXT: 'pending', 'approved', 'rejected')
  - `decided_by` (UUID, FK → profiles.id, nullable)
  - `decided_at` (TIMESTAMPTZ, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(project_id)` WHERE `status = 'pending'` (only one pending per project)
- **Relationships:**
  - `project_id` → `projects(id)`
  - `requested_by` → `profiles(id)`
  - `decided_by` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/leaderboard-requests.ts`
  - `src/web/pages/api/portal/admin/arc/leaderboard-requests.ts`
  - `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`
  - `src/web/pages/api/portal/arc/cta-state.ts`
  - `src/web/pages/portal/arc/requests.tsx`
  - `src/web/pages/portal/arc/project/[projectId].tsx`
  - `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`
- **Status:** ✅ ACTIVE

---

### Module B: GameFi (Season leaderboard + Mini Quests + quest leaderboards + manual submissions)

**⚠️ STATUS: NOT FOUND**

**Missing Tables:**
- No `quests` table found
- No `quest_submissions` table found
- No `quest_leaderboards` table found
- No `seasons` table found
- No `season_leaderboards` table found

**Note:** Creator Manager missions (`creator_manager_missions`, `creator_manager_mission_progress`) exist but are part of Module C (CRM), not Module B (GameFi).

---

### Module C: CRM (Creator Manager, KOL/creator tracking + campaign briefs + UTM per creator)

#### `creator_manager_programs`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `title` (TEXT)
  - `description` (TEXT)
  - `visibility` (TEXT: 'private', 'public', 'hybrid', default 'private')
  - `status` (TEXT: 'active', 'paused', 'ended', default 'active')
  - `start_at` (TIMESTAMPTZ)
  - `end_at` (TIMESTAMPTZ)
  - `created_by` (UUID, FK → profiles.id)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Relationships:**
  - `project_id` → `projects(id)`
  - `created_by` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId].ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/apply.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/links.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/deals.ts`
  - `src/web/pages/api/portal/creator-manager/my-programs.ts`
  - `src/web/pages/api/portal/creator-manager/projects.ts`
  - `src/web/pages/api/portal/arc/summary.ts`
  - `src/web/pages/api/portal/arc/projects/[projectId]/leaderboard.ts`
  - `src/web/pages/api/cron/creator-manager-arc.ts`
  - `src/web/pages/portal/arc/creator-manager/[programId].tsx`
- **Status:** ✅ ACTIVE

#### `creator_manager_deals`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `internal_label` (TEXT) - e.g. 'Deal 1', 'Deal 2'
  - `description` (TEXT) - internal notes only
  - `visibility` (TEXT: 'private', 'public', default 'private')
  - `is_default` (BOOLEAN, default false)
  - `created_at` (TIMESTAMPTZ)
- **Relationships:**
  - `program_id` → `creator_manager_programs(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/deals.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/deal.ts`
- **Status:** ✅ ACTIVE

#### `creator_manager_creators`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `creator_profile_id` (UUID, FK → profiles.id)
  - `deal_id` (UUID, FK → creator_manager_deals.id, nullable)
  - `status` (TEXT: 'pending', 'approved', 'rejected', 'removed', default 'pending')
  - `arc_points` (INT, default 0) - **SCORED POINTS**
  - `xp` (INT, default 0) - for gamification
  - `class` (TEXT) - e.g. 'Vanguard', 'Analyst', 'Amplifier', 'Explorer'
  - `joined_at` (TIMESTAMPTZ)
  - `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(program_id, creator_profile_id)`
- **Relationships:**
  - `program_id` → `creator_manager_programs(id)`
  - `creator_profile_id` → `profiles(id)`
  - `deal_id` → `creator_manager_deals(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/apply.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId].ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/status.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/class.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/deal.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/badges.ts`
  - `src/web/pages/api/portal/creator-manager/my-programs.ts`
  - `src/web/pages/api/portal/creator-manager/projects.ts`
  - `src/web/pages/api/portal/arc/summary.ts`
  - `src/web/pages/api/portal/arc/projects/[projectId]/leaderboard.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/my-progress.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`
  - `src/web/pages/api/portal/creator-manager/test/score.ts`
  - `src/web/pages/api/cron/creator-manager-arc.ts`
  - `src/web/lib/arc/creator-manager-scoring.ts`
  - `src/web/pages/portal/arc/creator-manager/[programId].tsx`
- **Status:** ✅ ACTIVE

#### `creator_manager_missions`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `title` (TEXT)
  - `description` (TEXT)
  - `reward_arc_min` (INT, default 0)
  - `reward_arc_max` (INT, default 0)
  - `reward_xp` (INT, default 0)
  - `is_active` (BOOLEAN, default true)
  - `order_index` (INT, default 0)
  - `created_at` (TIMESTAMPTZ)
- **Relationships:**
  - `program_id` → `creator_manager_programs(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/submissions.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/my-progress.ts`
- **Status:** ✅ ACTIVE

#### `creator_manager_mission_progress`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `mission_id` (UUID, FK → creator_manager_missions.id)
  - `creator_profile_id` (UUID, FK → profiles.id)
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `status` (TEXT: 'in_progress', 'submitted', 'approved', 'rejected', default 'in_progress')
  - `post_url` (TEXT) - added in migration 20241219
  - `post_tweet_id` (TEXT) - added in migration 20241219
  - `notes` (TEXT) - added in migration 20241223
  - `last_update_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(mission_id, creator_profile_id)`
- **Relationships:**
  - `mission_id` → `creator_manager_missions(id)`
  - `creator_profile_id` → `profiles(id)`
  - `program_id` → `creator_manager_programs(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/submit.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/approve.ts`
  - `src/web/pages/api/portal/creator-manager/missions/[missionId]/review.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/submissions.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/missions/my-progress.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId].ts`
  - `src/web/pages/api/cron/creator-manager-arc.ts`
- **Status:** ✅ ACTIVE

#### `creator_manager_badges`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `slug` (TEXT, UNIQUE) - e.g. "narrative_master", "engagement_king"
  - `name` (TEXT) - user-facing name
  - `description` (TEXT)
  - `created_at` (TIMESTAMPTZ)
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/badges.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/my-badges.ts`
- **Status:** ✅ ACTIVE

#### `creator_manager_creator_badges`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `creator_profile_id` (UUID, FK → profiles.id)
  - `badge_id` (UUID, FK → creator_manager_badges.id)
  - `awarded_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(program_id, creator_profile_id, badge_id)`
- **Relationships:**
  - `program_id` → `creator_manager_programs(id)`
  - `creator_profile_id` → `profiles(id)`
  - `badge_id` → `creator_manager_badges(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/badges.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/my-badges.ts`
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId].ts`
- **Status:** ✅ ACTIVE

#### `arc_campaigns` (CRM Campaigns - Option 1)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `type` (TEXT: 'crm', 'normal', 'gamified', default 'crm')
  - `participation_mode` (TEXT: 'invite_only', 'public', 'hybrid', default 'invite_only')
  - `leaderboard_visibility` (TEXT: 'public', 'private', default 'private')
  - `name` (TEXT)
  - `brief_objective` (TEXT)
  - `start_at` (TIMESTAMPTZ)
  - `end_at` (TIMESTAMPTZ)
  - `website_url` (TEXT)
  - `docs_url` (TEXT)
  - `reward_pool_text` (TEXT)
  - `winners_count` (INT, default 100)
  - `status` (TEXT: 'draft', 'live', 'paused', 'ended', default 'draft')
  - `created_by_profile_id` (UUID, FK → profiles.id, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Check Constraint:** `end_at > start_at`
- **Relationships:**
  - `project_id` → `projects(id)`
  - `created_by_profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/campaigns/index.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id].ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/participants.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/join.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/leaderboard.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/winners.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/[sid]/review.ts`
- **Status:** ✅ ACTIVE

#### `arc_campaign_participants`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `campaign_id` (UUID, FK → arc_campaigns.id)
  - `profile_id` (UUID, FK → profiles.id, nullable)
  - `twitter_username` (TEXT, NOT NULL)
  - `status` (TEXT: 'invited', 'accepted', 'declined', 'tracked', default 'invited')
  - `joined_at` (TIMESTAMPTZ, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(campaign_id, twitter_username)`
- **Relationships:**
  - `campaign_id` → `arc_campaigns(id)`
  - `profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/campaigns/[id]/participants.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/join.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`
- **Status:** ✅ ACTIVE

---

### UTM Tracking Tables

#### `creator_manager_links`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `label` (TEXT)
  - `url` (TEXT) - original URL
  - `utm_url` (TEXT) - UTM-tracked URL
  - `created_at` (TIMESTAMPTZ)
- **Relationships:**
  - `program_id` → `creator_manager_programs(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/programs/[programId]/links.ts`
  - `src/web/pages/r/cm/[linkId].tsx` - **REDIRECT ROUTE**
  - `src/web/pages/api/portal/creator-manager/links/click.ts`
- **Status:** ✅ ACTIVE

#### `creator_manager_link_clicks`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `link_id` (UUID, FK → creator_manager_links.id)
  - `program_id` (UUID, FK → creator_manager_programs.id)
  - `creator_profile_id` (UUID, FK → profiles.id, nullable)
  - `created_at` (TIMESTAMPTZ)
  - `user_agent` (TEXT)
  - `referrer` (TEXT)
- **Relationships:**
  - `link_id` → `creator_manager_links(id)`
  - `program_id` → `creator_manager_programs(id)`
  - `creator_profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/creator-manager/links/click.ts`
- **Status:** ✅ ACTIVE

#### `arc_participant_links` (ARC CRM UTM Links)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `campaign_id` (UUID, FK → arc_campaigns.id)
  - `participant_id` (UUID, FK → arc_campaign_participants.id)
  - `code` (TEXT, UNIQUE) - redirect code
  - `target_url` (TEXT)
  - `created_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(campaign_id, participant_id)` - one link per participant per campaign
- **Relationships:**
  - `campaign_id` → `arc_campaigns(id)`
  - `participant_id` → `arc_campaign_participants(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts`
  - `src/web/pages/api/portal/arc/redirect/[code].ts` - **REDIRECT API**
  - `src/web/pages/r/[code].tsx` - **REDIRECT ROUTE**
- **Status:** ✅ ACTIVE

#### `arc_link_events` (ARC CRM Click Tracking)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `campaign_id` (UUID, FK → arc_campaigns.id)
  - `participant_id` (UUID, FK → arc_campaign_participants.id)
  - `ts` (TIMESTAMPTZ) - timestamp
  - `ip_hash` (TEXT) - hashed IP address
  - `user_agent_hash` (TEXT) - hashed user agent
  - `referrer` (TEXT)
- **Relationships:**
  - `campaign_id` → `arc_campaigns(id)`
  - `participant_id` → `arc_campaign_participants(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/redirect/[code].ts` - **CLICK LOGGING**
- **Status:** ✅ ACTIVE
- **Note:** Immutable table (no UPDATE/DELETE policies, only INSERT)

#### `arc_external_submissions` (External Proof Submissions)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `campaign_id` (UUID, FK → arc_campaigns.id)
  - `participant_id` (UUID, FK → arc_campaign_participants.id)
  - `platform` (TEXT: 'youtube', 'tiktok', 'telegram', 'other')
  - `url` (TEXT)
  - `status` (TEXT: 'submitted', 'approved', 'rejected', default 'submitted')
  - `reviewed_by_profile_id` (UUID, FK → profiles.id, nullable)
  - `reviewed_at` (TIMESTAMPTZ, nullable)
  - `notes` (TEXT)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Relationships:**
  - `campaign_id` → `arc_campaigns(id)`
  - `participant_id` → `arc_campaign_participants(id)`
  - `reviewed_by_profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/index.ts`
  - `src/web/pages/api/portal/arc/campaigns/[id]/external-submissions/[sid]/review.ts`
- **Status:** ✅ ACTIVE

---

### Admin/Requests/Permissions Tables

#### `project_arc_settings`
- **Primary Key:** `project_id` (UUID, FK → projects.id)
- **Key Columns:**
  - `is_arc_enabled` (BOOLEAN, default false)
  - `tier` (TEXT: 'basic', 'pro', 'event_host', default 'basic')
  - `status` (TEXT: 'inactive', 'active', 'suspended', default 'inactive')
  - `security_status` (TEXT: 'normal', 'alert', 'clear', default 'normal')
  - `meta` (JSONB) - custom header settings (banner_url, accent_color, tagline)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Relationships:**
  - `project_id` → `projects(id)` (ON DELETE CASCADE)
- **Code Usage:**
  - `src/web/pages/api/portal/arc/projects.ts`
  - `src/web/pages/api/portal/arc/project-settings-admin.ts`
  - `src/web/pages/portal/arc/admin/index.tsx`
- **Status:** ✅ ACTIVE
- **Note:** This table exists but may be legacy. Current enablement is via `projects.arc_active` and `projects.arc_access_level`.

#### `project_account_managers`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `profile_id` (UUID, FK → profiles.id)
  - `is_primary` (BOOLEAN, default false)
  - `role_label` (TEXT, default 'Account Manager')
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(project_id, is_primary)` WHERE `is_primary = true` (only one primary per project)
- **Relationships:**
  - `project_id` → `projects(id)`
  - `profile_id` → `profiles(id)`
- **Code Usage:**
  - **NOT FOUND** - No code references found
- **Status:** ⚠️ UNUSED (table exists but no code usage)

#### `arc_project_access` (ARC Access Requests)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id)
  - `applied_by_profile_id` (UUID, FK → profiles.id, nullable)
  - `applied_by_official_x` (BOOLEAN, default false)
  - `application_status` (TEXT: 'pending', 'approved', 'rejected', default 'pending')
  - `approved_by_profile_id` (UUID, FK → profiles.id, nullable)
  - `approved_at` (TIMESTAMPTZ, nullable)
  - `notes` (TEXT)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(project_id)` WHERE `application_status = 'pending'` (only one pending per project)
- **Relationships:**
  - `project_id` → `projects(id)`
  - `applied_by_profile_id` → `profiles(id)`
  - `approved_by_profile_id` → `profiles(id)`
- **Code Usage:**
  - **NOT FOUND** - No code references found
- **Status:** ⚠️ UNUSED (table exists but no code usage)

#### `arc_project_features` (Feature Unlock Status)
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `project_id` (UUID, FK → projects.id, UNIQUE)
  - `option1_crm_unlocked` (BOOLEAN, default false)
  - `option2_normal_unlocked` (BOOLEAN, default false)
  - `option3_gamified_unlocked` (BOOLEAN, default false)
  - `unlocked_at` (TIMESTAMPTZ, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Relationships:**
  - `project_id` → `projects(id)`
- **Code Usage:**
  - **NOT FOUND** - No code references found
- **Status:** ⚠️ UNUSED (table exists but no code usage)

#### `notifications`
- **Primary Key:** `id` (UUID)
- **Key Columns:**
  - `profile_id` (UUID, FK → profiles.id)
  - `type` (TEXT) - includes: 'creator_invited', 'creator_approved', 'creator_rejected', 'mission_submitted', 'mission_approved', 'mission_rejected', 'leaderboard_request_approved', 'leaderboard_request_rejected'
  - `context` (JSONB) - stores programId, missionId, projectId, creatorProfileId, etc.
  - `is_read` (BOOLEAN, default false)
  - `created_at` (TIMESTAMPTZ)
- **Relationships:**
  - `profile_id` → `profiles(id)`
- **Code Usage:**
  - `src/web/lib/notifications.ts`
- **Status:** ✅ ACTIVE

---

### Shared Primitives (Projects, Profiles, Settings, Scoring, Events)

#### `projects` (Extended with ARC fields)
- **ARC-Related Columns:**
  - `arc_active` (BOOLEAN, default false) - **PRIMARY ENABLEMENT FLAG**
  - `arc_access_level` (TEXT: 'none', 'creator_manager', 'leaderboard', 'gamified', default 'none') - **ACCESS LEVEL**
  - `arc_active_until` (TIMESTAMPTZ, nullable) - **EXPIRATION DATE**
  - `profile_type` (TEXT: 'project', 'personal', nullable) - classification
  - `claimed_by` (UUID, FK → akari_users.id, nullable)
  - `claimed_at` (TIMESTAMPTZ, nullable)
- **Migration:** `20241222_add_arc_access_level.sql`
- **Code Usage:**
  - `src/web/pages/api/portal/arc/summary.ts`
  - `src/web/pages/api/portal/arc/top-projects.ts`
  - `src/web/pages/api/portal/arc/projects.ts`
  - `src/web/pages/api/portal/arc/cta-state.ts`
  - `src/web/pages/api/portal/admin/projects/index.ts`
  - `src/web/pages/api/portal/admin/projects/[id].ts`
  - `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`
  - `src/web/pages/portal/arc/index.tsx`
  - `src/web/pages/portal/arc/project/[projectId].tsx`
  - `src/web/pages/portal/admin/projects.tsx`
  - `src/web/lib/arc/expiration.ts`
- **Status:** ✅ ACTIVE

#### `profiles` (User/Profile table)
- **Key Columns:**
  - `id` (UUID, PRIMARY KEY)
  - `twitter_id` (TEXT, UNIQUE)
  - `username` (TEXT, UNIQUE) - @handle without @
  - `name` (TEXT) - display name
  - `profile_image_url` (TEXT)
  - `bio` (TEXT)
  - `followers`, `following`, `tweet_count` (INT)
  - `is_blue_verified` (BOOLEAN)
  - `verified_type` (TEXT)
  - `akari_profile_score`, `authenticity_score`, `influence_score`, `signal_density_score`, `farm_risk_score` (INT)
  - `real_roles` (TEXT[]) - includes 'super_admin' for permissions
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Code Usage:**
  - Used extensively across all ARC modules
  - Referenced in RLS policies via `get_current_user_profile_id()`
- **Status:** ✅ ACTIVE

#### `project_team_members` (Referenced in RLS)
- **Purpose:** Used in RLS policies to check project admin/moderator roles
- **Code Usage:**
  - `src/web/pages/api/portal/arc/cta-state.ts`
  - `src/web/pages/api/portal/projects/[projectId]/my-role.ts`
  - `src/web/lib/notifications.ts`
  - Referenced in `is_user_project_admin()` function in `20250104_add_arc_crm_tables.sql`
- **Status:** ✅ ACTIVE (used in RLS, not directly queried in ARC code)

---

## B) ARC FIELD MAP

### Enablement Fields (Source of Truth)

#### `projects.arc_active` (BOOLEAN)
- **Purpose:** Primary enablement flag for ARC
- **Default:** `false`
- **Usage:**
  - Set to `true` when ARC access is approved
  - Set to `false` when ARC access is revoked
  - Checked in: `src/web/pages/api/portal/arc/summary.ts`, `src/web/pages/api/portal/arc/top-projects.ts`, `src/web/pages/api/portal/arc/cta-state.ts`
- **Migration:** `20241222_add_arc_access_level.sql`

#### `projects.arc_access_level` (TEXT)
- **Purpose:** Specifies which ARC module(s) are enabled
- **Values:** `'none'`, `'creator_manager'`, `'leaderboard'`, `'gamified'`
- **Default:** `'none'`
- **Usage:**
  - Set when approving `arc_leaderboard_requests`
  - Controls which UI/features are available
  - Checked in: `src/web/pages/api/portal/arc/summary.ts`, `src/web/pages/api/portal/arc/cta-state.ts`, `src/web/pages/portal/arc/index.tsx`
- **Migration:** `20241222_add_arc_access_level.sql`

#### `projects.arc_active_until` (TIMESTAMPTZ, nullable)
- **Purpose:** Expiration date for ARC access
- **Default:** `null` (no expiration)
- **Usage:**
  - If `null` → ARC active (no expiration)
  - If future date → ARC active until that date
  - If past date → ARC disabled (virtual disable, no DB update needed)
  - Checked in: `src/web/lib/arc/expiration.ts` via `getEffectiveArcActive()`
- **Migration:** `20241222_add_arc_access_level.sql`

#### `project_arc_settings.is_arc_enabled` (BOOLEAN)
- **Purpose:** Legacy enablement flag (may be redundant)
- **Default:** `false`
- **Usage:**
  - Found in `project_arc_settings` table
  - **Note:** Current code uses `projects.arc_active` instead
  - **Status:** ⚠️ Potentially unused/legacy

#### `project_arc_settings.status` (TEXT)
- **Purpose:** Status field in legacy settings table
- **Values:** `'inactive'`, `'active'`, `'suspended'`
- **Default:** `'inactive'`
- **Status:** ⚠️ Potentially unused/legacy

### Enablement Logic

**Current Source of Truth:**
1. `projects.arc_active = true` AND
2. `projects.arc_access_level != 'none'` AND
3. `projects.arc_active_until IS NULL OR projects.arc_active_until >= NOW()`

**Effective ARC Active Check:**
- Function: `getEffectiveArcActive(arcActive: boolean, arcActiveUntil: Date | null)`
- Location: `src/web/lib/arc/expiration.ts`
- Logic:
  ```typescript
  if (!arcActive) return false;
  if (!arcActiveUntil) return true;
  return arcActiveUntil >= now;
  ```

---

## C) GAPS

### Module A: Leaderboard
**Status:** ✅ **COMPLETE**
- ✅ Arenas table exists
- ✅ Arena creators table exists
- ✅ Scoring logic exists (`src/web/lib/arc/scoring.ts`)
- ✅ Leaderboard requests system exists
- ✅ Public contribution tracking via `arena_creators.arc_points`

**Missing:**
- None identified

---

### Module B: GameFi
**Status:** ❌ **NOT IMPLEMENTED**

**Missing Tables:**
1. `quests` - No table found
2. `quest_submissions` - No table found
3. `quest_leaderboards` - No table found
4. `seasons` - No table found
5. `season_leaderboards` - No table found

**Missing Features:**
- Season-based leaderboards
- Mini quests system
- Quest submission system
- Quest-specific leaderboards
- Manual submissions for non-X links (for GameFi context)

**Note:** Creator Manager has missions (`creator_manager_missions`), but these are part of Module C (CRM), not Module B (GameFi).

---

### Module C: CRM
**Status:** ✅ **MOSTLY COMPLETE**

**Existing:**
- ✅ Creator Manager programs
- ✅ Creator Manager creators
- ✅ Creator Manager missions
- ✅ Creator Manager mission progress
- ✅ Creator Manager badges
- ✅ Creator Manager deals
- ✅ ARC CRM campaigns (`arc_campaigns`)
- ✅ ARC CRM participants (`arc_campaign_participants`)
- ✅ External submissions (`arc_external_submissions`)

**Missing/Unused:**
1. `arc_project_access` - Table exists but **NO CODE USAGE**
2. `arc_project_features` - Table exists but **NO CODE USAGE**
3. `project_account_managers` - Table exists but **NO CODE USAGE**

**Gaps:**
- No code using `arc_project_access` for access requests (separate from `arc_leaderboard_requests`)
- No code using `arc_project_features` for feature unlock tracking
- No code using `project_account_managers` for account manager assignments

---

### UTM Tracking
**Status:** ✅ **COMPLETE**

**Existing:**
- ✅ Creator Manager links (`creator_manager_links`)
- ✅ Creator Manager link clicks (`creator_manager_link_clicks`)
- ✅ ARC participant links (`arc_participant_links`)
- ✅ ARC link events (`arc_link_events`)
- ✅ Redirect routes: `/r/cm/[linkId]` and `/r/[code]`
- ✅ Redirect API: `/api/portal/arc/redirect/[code]`

**Missing:**
- None identified

---

### Admin/Requests
**Status:** ✅ **COMPLETE**

**Existing:**
- ✅ `arc_leaderboard_requests` - Active and used
- ✅ `notifications` - Active and used
- ✅ Approval workflow in admin UI

**Missing:**
- None identified

---

### Scoring/Aggregation
**Status:** ✅ **COMPLETE**

**Existing:**
- ✅ ARC scoring logic (`src/web/lib/arc/scoring.ts`)
- ✅ Creator Manager scoring logic (`src/web/lib/arc/creator-manager-scoring.ts`)
- ✅ Cron job for scoring (`src/web/pages/api/cron/creator-manager-arc.ts`)
- ✅ Points stored in `arena_creators.arc_points` (Module A)
- ✅ Points stored in `creator_manager_creators.arc_points` (Module C)

**Missing:**
- No aggregation tables for historical leaderboard snapshots
- No daily/weekly aggregated scores (scores are computed on-demand)

---

## D) SAFE NEXT STEP PLAN

### Phase 1: Cleanup Unused Tables
**Risk:** LOW  
**Action:** Audit and decide on:
1. `arc_project_access` - Remove if not needed, or implement usage
2. `arc_project_features` - Remove if not needed, or implement usage
3. `project_account_managers` - Remove if not needed, or implement usage
4. `project_arc_settings` - Verify if still needed vs `projects.arc_active`/`arc_access_level`

### Phase 2: Module B (GameFi) Implementation
**Risk:** MEDIUM  
**Action:** Design and implement:
1. Create `seasons` table
2. Create `quests` table
3. Create `quest_submissions` table
4. Create `quest_leaderboards` table (or use existing leaderboard structure)
5. Implement quest submission UI/API
6. Implement season leaderboard aggregation

### Phase 3: Consolidate Enablement Logic
**Risk:** LOW  
**Action:** 
1. Document which enablement fields are authoritative (`projects.arc_active` vs `project_arc_settings.is_arc_enabled`)
2. Remove redundant fields if `project_arc_settings` is legacy
3. Ensure all code uses consistent enablement check

### Phase 4: Add Aggregation Tables (Optional)
**Risk:** LOW  
**Action:**
1. Create `leaderboard_snapshots` table for historical leaderboard data
2. Create cron job to snapshot leaderboards daily/weekly
3. Use snapshots for historical queries

---

## SUMMARY STATISTICS

### Tables by Module
- **Module A (Leaderboard):** 3 tables (all active)
- **Module B (GameFi):** 0 tables (not implemented)
- **Module C (CRM):** 11 tables (9 active, 2 unused)
- **UTM Tracking:** 4 tables (all active)
- **Admin/Requests:** 5 tables (3 active, 2 unused)
- **Shared Primitives:** 2 tables (both active)

### Total Tables: 25
- **Active:** 20 tables
- **Unused:** 5 tables (`arc_project_access`, `arc_project_features`, `project_account_managers`, `project_arc_settings`*, `akari_access_requests`*)

*Note: `project_arc_settings` and `akari_access_requests` may be used elsewhere, not verified in ARC context.

### Code Files Referencing ARC Tables
- **Total API routes:** ~50+
- **Total UI pages:** ~20+
- **Scoring libraries:** 2 (`scoring.ts`, `creator-manager-scoring.ts`)
- **Utility libraries:** 1 (`expiration.ts`)

---

**END OF INVENTORY REPORT**

