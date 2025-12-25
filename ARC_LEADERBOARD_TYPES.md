# ARC Leaderboard Types Summary

**Date:** 2025-01-23  
**Purpose:** Document all leaderboard types in the ARC system

---

## ARC System Overview

ARC (Akari Reputation Circuit) has **3 main modules/options**, each with their own leaderboard implementations:

### Option 1: CRM (Creator Manager)
- **Type:** Campaign-based leaderboard
- **Access Level:** `creator_manager`
- **Unlock Field:** `option1_crm_unlocked`
- **Description:** CRM campaigns with optional public/hybrid leaderboard visibility
- **Leaderboard API:** `/api/portal/arc/campaigns/[id]/leaderboard`
- **Scoring:** Based on `user_ct_activity` tracking (X engagement)
- **Visibility:** Configurable per campaign (private/public/hybrid)

### Option 2: Normal/Classic Leaderboard (Mindshare)
- **Type:** Arena-based mindshare leaderboard
- **Access Level:** `leaderboard`
- **Unlock Field:** `option2_normal_unlocked`
- **Description:** Public contribution tracking, X mentions/engagement scoring
- **Leaderboard API:** `/api/portal/arc/leaderboard/[projectId]`
- **Scoring:** Mindshare points from X engagement (likes, retweets, quotes, replies)
- **Features:**
  - Arena-based (multiple arenas per project)
  - Auto-tracked participants (mentions without joining)
  - Joined participants (with multiplier if follow-verified)
  - Base points × multiplier = final score

### Option 3: Gamified Leaderboard
- **Type:** Quest-based gamified system
- **Access Level:** `gamified`
- **Unlock Field:** `option3_gamified_unlocked`
- **Description:** RPG-style quest system with XP, levels, and rank badges
- **Leaderboard API:** `/api/portal/arc/projects/[projectId]/leaderboard`
- **Scoring:**
  - XP (experience points) from quest completion
  - Levels calculated from total XP (floor(XP / 100))
  - Rank badges: Bronze, Silver, Gold, Legend (based on total points)
- **Features:**
  - Quest/mission-based progression
  - Level system
  - Rank badges (Bronze ≥0, Silver ≥500, Gold ≥2000, Legend ≥10000)
  - Aggregated across all programs for a project

---

## Summary

**ARC has 3 distinct leaderboard types:**

1. **CRM Campaign Leaderboards** (Option 1)
   - Campaign participants
   - X activity tracking
   - Private/public/hybrid visibility

2. **Mindshare/Arena Leaderboards** (Option 2)
   - Arena-based contests
   - X engagement scoring (mentions, likes, retweets, etc.)
   - Auto-tracked + joined participants

3. **Gamified Leaderboards** (Option 3)
   - Quest-based progression
   - XP and level system
   - Rank badges and RPG mechanics

---

## Additional Context

### Non-ARC Leaderboards (Platform-level)

The platform also has non-ARC leaderboards:
- **Main Platform Leaderboard** (`/api/leaderboard`):
  - Points (aXP) leaderboard
  - MYST spent leaderboard
  - Referrals leaderboard
  - Weekly/all-time periods

### Key Differences

- **ARC leaderboards** are project-specific and require approval + option unlock
- **Platform leaderboards** are global and don't require ARC access
- **Arena leaderboards** (Option 2) are the ones shown in `/portal/arc` Live/Upcoming sections
- **Gamified leaderboards** (Option 3) are shown in `/portal/arc/gamified/[projectId]` pages

---

## Technical Implementation

### Access Control
All ARC leaderboards require:
1. Project ARC access approved (`arc_project_access.application_status = 'approved'`)
2. Specific option unlocked (`arc_project_features.option{1|2|3}_unlocked = true`)
3. Module enabled and active (date range checks)

### Database Tables
- **Arenas** (Option 2): `arenas`, `arena_creators`
- **Gamified** (Option 3): `creator_manager_programs`, `creator_manager_program_creators`
- **CRM** (Option 1): `arc_campaigns`, `arc_campaign_participants`

