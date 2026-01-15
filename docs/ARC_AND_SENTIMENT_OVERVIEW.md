# ARC and Sentiment Overview

This document provides a concise, high-level overview of how ARC and Sentiment are built in this codebase.

---

## ARC (Akari Ranking & Campaigns)

### Purpose
ARC is the hub for:
- Live/Upcoming leaderboards
- GameFi/quests
- Creator Manager (CRM) programs
- Admin tools for project teams

### Frontend Structure
- ARC Home: `src/web/pages/portal/arc/index.tsx`
- Project Hub: `src/web/pages/portal/arc/[projectSlug].tsx`
- Creator Manager Admin:
  - Home: `src/web/pages/portal/arc/creator-manager/index.tsx`
  - Program Admin: `src/web/pages/portal/arc/creator-manager/[programId].tsx`
  - Create Program: `src/web/pages/portal/arc/creator-manager/create.tsx`
- Creator View:
  - List: `src/web/pages/portal/arc/my-creator-programs/index.tsx`
  - Program: `src/web/pages/portal/arc/my-creator-programs/[programId].tsx`

### Key UI Components
- Live items cards: `src/web/components/arc/fb/LiveItemCard.tsx`
- ARC layout shells: `src/web/components/arc/fb/*`
- Routing rules: `src/web/components/arc/fb/routeUtils.ts`

### Backend / API
- Live items feed: `src/web/pages/api/portal/arc/live-leaderboards.ts`
- ARC permissions: `src/web/pages/api/portal/arc/permissions.ts`
- Creator Manager programs:
  - Programs list/create: `src/web/pages/api/portal/creator-manager/programs.ts`
  - Program detail: `src/web/pages/api/portal/creator-manager/programs/[programId].ts`
  - Creators:
    - Apply: `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/apply.ts`
    - Invite: `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/invite.ts`
    - Status update: `src/web/pages/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/status.ts`
  - Missions: `src/web/pages/api/portal/creator-manager/programs/[programId]/missions.ts`

### Core Data Tables (Supabase)
Main ARC entities:
- `arc_project_features` (feature flags + visibility)
- `arc_project_access` (approval gating)
- `arenas`, `arc_contributions`, `arc_mindshare_events` (leaderboards)
- `arc_quests` and quest-related tables (GameFi)
- `creator_manager_programs`, `creator_manager_creators`, `creator_manager_missions`
- `creator_manager_spotlight_links`

### Permissions Model
Project-level access is based on:
- `projects.claimed_by`
- `project_team_members.role`
Helper: `src/web/lib/project-permissions.ts`

### ARC Live/Upcoming Feed
Unified feed logic:
- `src/web/lib/arc/live-upcoming.ts`
- Normalized client hook: `src/web/lib/arc/useArcLiveItems.ts`

---

## Sentiment

### Purpose
Sentiment provides project-level intelligence:
- sentiment metrics
- mindshare / smart followers
- project profiles and tracking

### Frontend Structure
- Sentiment home: `src/web/pages/portal/sentiment/index.tsx`
- Project detail: `src/web/pages/portal/sentiment/[slug].tsx`
- Compare view: `src/web/pages/portal/sentiment/compare.tsx`

### Backend / API
Primary endpoints:
- Projects list + movers: `src/web/pages/api/portal/sentiment/projects.ts`
- Mindshare and metrics: `src/web/pages/api/portal/sentiment/mindshare.ts`
- Track a project: `src/web/pages/api/portal/sentiment/track.ts`
- Project analytics: `src/web/pages/api/portal/sentiment/[slug]/analytics.ts`
- Export: `src/web/pages/api/portal/sentiment/[slug]/analytics-export.ts`

### Background Refresh
Cron endpoints:
- All refresh: `src/web/pages/api/portal/cron/sentiment-refresh-all.ts`
- Smart refresh: `src/web/pages/api/portal/cron/sentiment-smart-refresh.ts`

### Core Data Tables (Supabase)
Main entities:
- `projects` (project metadata)
- `profiles` (creator profile data + follower metrics)
- `metrics_daily` (time-series metrics)
- `project_tweets` (tweet scoring source)
- `arc_mindshare_events` (shared with ARC)

---

## Shared Auth + Sessions
- Portal auth uses `akari_user_sessions` cookie sessions.
- Common auth helper: `src/web/lib/server/require-portal-user.ts`
- X identity mapping: `akari_user_identities`

---

## Suggested Deep Dives (Optional)
If you want a deeper, step-by-step doc, I can expand any of these:
- ARC Creator Manager flow (apply → pending → approve)
- Leaderboard scoring + mindshare data path
- Sentiment tracking pipeline (track → ingest → refresh)
