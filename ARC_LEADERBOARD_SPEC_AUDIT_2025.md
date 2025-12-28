# ARC Leaderboard Spec Audit + Implementation Plan
**Date:** 2025-01-28  
**Status:** Audit Complete - Ready for Implementation  
**Goal:** Update ARC leaderboard model to reflect corrected spec while maintaining backward compatibility

---

## Executive Summary

This audit updates the ARC leaderboard specification based on corrections:

1. **Option 2** should be called **"Mindshare Leaderboard"** (not "arenas"), measuring real human contribution on X using engagement + keyword relevance
2. **Keyword relevance** must be part of scoring for all 3 leaderboard types
3. **Option 3 (Gamified)** quests should be visible in project pages via right rail
4. **Project IDs/slugs** must never be displayed in UI (routing only)

Current implementation is functional but needs spec alignment and keyword relevance integration.

---

## A) UPDATED SPEC OUTLINE

### ARC System Overview

ARC (Akari Reputation Circuit) has **3 distinct leaderboard modules**, each serving different use cases:

---

### Option 1: Creator Manager (CRM)

**Access Level:** `creator_manager`  
**Unlock Field:** `option1_crm_unlocked`  
**Database Tables:** `creator_manager_programs`, `creator_manager_creators`, `creator_manager_deals`, `creator_manager_missions`, `creator_manager_mission_progress`

**Purpose:**
Private creator management system with optional public visibility. Enables projects to manage creators with deal tiers, missions, and internal ranking.

**Participation Model:**
- **Invitation-based**: Project admins invite creators to programs
- **Application-based**: Creators can apply to public/hybrid programs
- **Status tracking**: pending → approved/rejected → active → removed

**Scoring Inputs:**
- **Primary Source:** `user_ct_activity` table (X engagement tracking)
- **Engagement Metrics:** likes, replies, retweets, quotes
- **Content Classification:** thread, deep_dive, meme, quote_rt, retweet, reply
- **Sentiment:** positive/neutral/negative (from sentiment analysis)
- **Keyword Relevance:** **[SPEC REQUIRED - IMPLEMENTATION TODO]**
  - Posts must contain project-related keywords/phrases
  - Weighting by keyword category (core brand terms > secondary terms)
  - Current state: Not implemented - needs keyword matching logic

**Current Implementation:**
- ✅ Program management (create, invite, status updates)
- ✅ Deal assignment (internal tiers)
- ✅ Mission creation and tracking
- ✅ Basic scoring from `user_ct_activity`
- ❌ Keyword relevance validation (missing)
- ❌ Keyword category weighting (missing)

**Gaps vs Corrected Spec:**
1. Keyword relevance checking not implemented in scoring aggregation
2. No project-specific keyword configuration UI
3. Scoring uses raw `user_ct_activity` without relevance filter

**Routes:**
- `/portal/arc/creator-manager` - Admin home
- `/portal/arc/creator-manager/[programId]` - Program detail
- `/portal/arc/my-creator-programs` - Creator view
- `/api/portal/creator-manager/*` - All APIs

---

### Option 2: Mindshare Leaderboard (Normal)

**Access Level:** `leaderboard`  
**Unlock Field:** `option2_normal_unlocked`  
**Database Tables:** `arenas`, `arena_creators`, `project_tweets` (mentions)

**Purpose:**
Public leaderboard measuring real human contribution on X using engagement signals and keyword relevance. Tracks mindshare (mentions, engagement, signal quality) to identify top contributors.

**Participation Model:**
- **Auto-tracked:** Anyone who mentions the project on X is automatically included
- **Joined:** Users can join and verify follow to get multiplier (1.5x)
- **No opt-in required:** Public by default, contributions are measured passively

**Scoring Inputs:**
- **Primary Source:** `project_tweets` table (mentions only, `is_official=false`)
- **Engagement Formula:** `likes + (replies * 2) + (retweets * 3)`
- **Signal Classification:** 
  - Signal: threader/video content with engagement > 10
  - Noise: engagement < 5 OR sentiment < 30
- **Sentiment:** Average sentiment score from `project_tweets.sentiment_score`
- **CT Heat:** Recency-weighted engagement (24h: 1.5x, 7d: 1.0x, older: 0.5x)
- **Content Types:** threader, video, clipper, meme (via `classifyTweetType()`)
- **Keyword Relevance:** **[PARTIALLY IMPLEMENTED - NEEDS ENHANCEMENT]**
  - Current: Pattern matching for @handle mentions only (in `src/server/userCtActivity.ts`)
  - Missing: Project-specific keyword configuration
  - Missing: Keyword category weighting (core brand > secondary)
  - Missing: Relevance validation in scoring aggregation

**Current Implementation:**
- ✅ Auto-tracking from `project_tweets` (mentions)
- ✅ Joined creator tracking with multiplier (1.5x if follow-verified)
- ✅ Signal vs noise classification
- ✅ Content type classification (threader, video, clipper, meme)
- ✅ Engagement-based scoring (likes, replies, retweets)
- ✅ Sentiment and CT Heat calculation
- ⚠️ Keyword relevance: Only @handle pattern matching, no project-specific keywords
- ❌ Keyword category weighting: Not implemented

**Gaps vs Corrected Spec:**
1. **Conceptual:** Referred to as "arenas" in UI/routes (should be "Mindshare Leaderboard")
2. **Keyword Relevance:** No project-specific keyword validation beyond @handle mentions
3. **Keyword Categories:** No core brand vs secondary term weighting
4. **Multi-social:** Currently X-only (future: extend to other platforms when APIs exist)

**Routes:**
- `/portal/arc/[slug]/arena/[arenaSlug]` - Arena details (UI container, should be called "Mindshare Leaderboard")
- `/portal/arc/leaderboard/[projectId]` - Project-level leaderboard
- `/api/portal/arc/leaderboard/[projectId]` - Leaderboard API
- `/api/portal/arc/arenas/[slug]/leaderboard` - Arena-specific leaderboard API

**Notes:**
- "Arena" is a UI organizational concept (time-bounded contests)
- The underlying system is "Mindshare Leaderboard" measuring contribution
- Routes can remain as-is for backward compatibility, but labels should change

---

### Option 3: Gamified Quests

**Access Level:** `gamified`  
**Unlock Field:** `option3_gamified_unlocked`  
**Database Tables:** `arc_quests`, `arc_quest_completions`, `arc_contributions`

**Purpose:**
RPG-style quest system with XP, levels, and rank badges. Gamified progression system for creators to complete missions and climb the ranks.

**Participation Model:**
- **Quest-based:** Creators complete specific missions (thread, meme, deep dive, etc.)
- **Self-service:** Creators claim quest completion (manual or auto-verified)
- **Progressive:** XP accumulates, levels unlock, badges earned at thresholds

**Scoring Inputs:**
- **Primary Source:** Quest completion records (`arc_quest_completions`)
- **XP Calculation:** Points awarded per quest completion (varies by quest type)
- **Level Calculation:** `floor(totalXP / 100)`
- **Badge Thresholds:**
  - Bronze: ≥0 points
  - Silver: ≥500 points
  - Gold: ≥2,000 points
  - Legend: ≥10,000 points
- **Keyword Relevance:** **[SPEC REQUIRED - IMPLEMENTATION TODO]**
  - Quest submissions should validate keyword relevance
  - Content must relate to project (via keyword matching)
  - Current state: Not validated in quest completion logic

**Current Implementation:**
- ✅ Quest creation and management
- ✅ Quest completion tracking (`arc_quest_completions` table)
- ✅ XP and level calculation
- ✅ Badge assignment based on total points
- ✅ Quest categorization (Quick, Signal, Weekly Boss)
- ❌ Keyword relevance validation for quest submissions
- ❌ Quest visibility in project pages right rail (missing)

**Gaps vs Corrected Spec:**
1. **UI Integration:** Quests not visible in project pages right rail (only in dedicated gamified page)
2. **Keyword Relevance:** Quest completion submissions don't validate keyword relevance
3. **CRM Task Mapping:** No mechanism to launch CRM-like tasks as quests (future feature)

**Routes:**
- `/portal/arc/gamified/[projectId]` - Dedicated gamified page
- `/portal/arc/[slug]/arena/[arenaSlug]` - Quests tab (within arena page)
- `/api/portal/arc/gamified/[projectId]` - Gamified leaderboard API
- `/api/portal/arc/quests/*` - Quest management APIs

---

## B) CODEBASE MAPPING AUDIT

### 1. Option 2 Scoring Computation

**Current Implementation:**

**File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
- **Function:** `calculateAutoTrackedPoints()` (lines 98-225)
- **Logic:**
  - Fetches `project_tweets` with `is_official=false` (mentions only)
  - Aggregates by normalized `author_handle`
  - Calculates engagement: `likes + replies*2 + retweets*3`
  - Classifies content type: `classifyTweetType()` (threader, video, clipper, meme)
  - Calculates signal vs noise:
    - Signal: (threader OR video) AND engagement > 10
    - Noise: engagement < 5 OR sentiment < 30
  - Calculates CT Heat (recency-weighted)
  - **Missing:** No keyword relevance checking beyond implicit mention detection

**File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
- **Function:** `calculateAutoTrackedPoints()` (lines 58-87)
- **Logic:** Simplified version - only engagement aggregation
- **Missing:** Signal/noise classification, keyword relevance

**File:** `src/server/userCtActivity.ts`
- **Function:** `buildProjectMatchPatterns()` (lines 91-118)
- **Current Logic:**
  - Matches @handle mentions
  - Matches handle without @ (if short, likely ticker)
  - Matches $NAME cashtag (if name is short)
- **Limitation:** No project-specific keyword list matching

---

### 2. Project Keywords Definition

**Current State:**

**Database:**
- **Migration:** `supabase/migrations/20250123_add_mindshare_autoattribution.sql` (lines 13-15)
- **Field:** `projects.arc_keywords` (TEXT[] array)
- **Index:** GIN index on `arc_keywords` for efficient searches
- **Status:** Field exists, but **not populated or used in scoring**

**Code References:**
- **No usage found** in scoring functions
- **No UI** for setting project keywords
- **No validation** in mention detection

**Keyword Storage Proposal:**
- Store in `projects.arc_keywords` TEXT[] array (already exists)
- Structure: `['$SYMBOL', '@handle', 'core term 1', 'core term 2', 'secondary term 1', ...]`
- Alternative (future): JSONB with categories: `{ core: [...], secondary: [...] }`

---

### 3. Keyword Matching Logic

**Current Implementation:**

**File:** `src/server/userCtActivity.ts` (lines 91-118)
- **Pattern Matching:** RegExp-based for @handle, $cashtag, plain handle
- **Scope:** Global project matching (all projects)
- **Limitation:** No project-specific keyword list

**File:** `src/server/sentiment/topics.config.ts`
- **Purpose:** Topic classification (AI, DeFi, NFTs, etc.)
- **Not used for:** Project-specific keyword relevance

**Missing:**
- Project-specific keyword extraction from `projects.arc_keywords`
- Keyword category weighting (core vs secondary)
- Relevance scoring in aggregation functions

---

### 4. Quest Rendering

**Current Implementation:**

**File:** `src/web/pages/portal/arc/gamified/[projectId].tsx`
- **Location:** Dedicated full-page gamified leaderboard
- **Features:**
  - Full quest list with grouping (Quick, Signal, Weekly Boss, Other)
  - Recommended quest display
  - Quest completion UI
  - Leaderboard with XP/levels

**File:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`
- **Location:** "Quests" tab within arena details page (lines 1847-1900)
- **Features:**
  - Quest list for active arena
  - Quest creation (admin only)
  - Quest completion tracking

**Missing:**
- **Right rail quest panel** in project hub page (`/portal/arc/[slug]`)
- **Mobile accessible panel** for quests
- Integration with `ArcPageShell` rightRailContent prop

**File:** `src/web/components/arc/fb/ArcPageShell.tsx`
- **Support:** `rightRailContent` prop exists (line 29, 64-68)
- **Usage:** Currently only used for default `RightRail` component
- **Opportunity:** Can pass quest panel component

---

### 5. Live Items Unification Logic

**File:** `src/web/lib/arc/live-upcoming.ts`
- **Function:** `getArcLiveItems()` (lines 48-51)
- **Labels Items:**
  - `kind: 'arena'` for Option 2 items (from `arenas` table)
  - `kind: 'campaign'` for Option 1 items (from `arc_campaigns` table)
  - `kind: 'gamified'` for Option 3 items (from `arc_quests` table)
- **Item Fields:**
  - `projectName`, `projectSlug`, `projectId` (all preserved)
  - `title`, `slug` (item-specific)
  - `status: 'live' | 'upcoming'` (calculated from dates)

**File:** `src/web/lib/arc/useArcLiveItems.ts`
- **Normalization:** `normalizeItem()` function (lines 54-100)
- **Display:** Uses `item.project.name` (correct - no ID/slug shown)

**UI Display:**

**File:** `src/web/components/arc/fb/LiveItemCard.tsx`
- **Line 124:** `{item.project.name}` - ✅ Shows project name only
- **Line 126-128:** Shows `@xHandle` if available
- **No ID/slug display:** ✅ Correct
- **Label:** `kindLabel` shows "Arena", "Campaign", "Gamified" (line 24)
  - Should change "Arena" → "Mindshare Leaderboard"

---

### 6. Project ID/Slug Display Audit

**Files Checked:**
- `src/web/components/arc/fb/LiveItemCard.tsx` - ✅ Only shows `project.name`
- `src/web/lib/arc/useArcLiveItems.ts` - ✅ Normalizes to `project.name`
- `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - ✅ Shows project name, removed slug display (recent fix)
- `src/web/pages/portal/arc/[slug].tsx` - ✅ Shows project name in header

**Potential Issues:**
- Need to audit all feed card components
- Need to check tooltip/hover text for IDs
- Need to verify mobile layout components

---

## C) SAFE IMPLEMENTATION PLAN

### Phase 1: UI Label Updates + Project Name Display (No DB Changes)

**Goal:** Update terminology and ensure project names are prominent, IDs hidden.

**Tasks:**

1. **Update UI Labels**
   - **File:** `src/web/components/arc/fb/LiveItemCard.tsx`
     - Change `kindLabel` logic (line 24):
       - `'arena'` → `'Mindshare Leaderboard'`
       - `'campaign'` → `'Creator Manager'`
       - `'gamified'` → `'Gamified Quests'`
   - **File:** `src/web/lib/arc-naming.ts` (if exists)
     - Update `getArcFeatureName()` and `getArcFeatureDescription()` functions
   - **Files:** All pages showing "Arena" label
     - Replace with "Mindshare Leaderboard" or "Normal Leaderboard"

2. **Ensure Project Name Prominence**
   - **File:** `src/web/components/arc/fb/LiveItemCard.tsx`
     - Verify line 123-128: Project name is prominent
     - Ensure no projectId or projectSlug in UI text
   - **Audit:** Search all ARC components for `projectId`, `projectSlug` in display text
   - **Action:** Replace any found with `project.name` or remove

3. **Add Active Quests Right Rail Container**
   - **File:** `src/web/pages/portal/arc/[slug].tsx`
     - Fetch active quests for project (if `arc_access_level === 'gamified'`)
     - Create `<ActiveQuestsPanel />` component with:
       - Empty state if no quests
       - List of active quests (name, points, status)
       - Link to full gamified page
     - Pass to `ArcPageShell` via `rightRailContent` prop
   - **File:** `src/web/components/arc/fb/ActiveQuestsPanel.tsx` (new)
     - Desktop: Right rail component
     - Mobile: Collapsible panel/accordion
     - Props: `projectId`, `quests[]`, `userCompletions[]`

4. **Mobile Quest Panel**
   - **File:** `src/web/components/arc/fb/mobile/MobileLayout.tsx`
     - Add collapsible "Active Quests" section
     - Show quest list when expanded
     - Link to full gamified page

**Acceptance Criteria:**
- ✅ All UI labels updated to "Mindshare Leaderboard", "Creator Manager", "Gamified Quests"
- ✅ Project names shown prominently in feed cards
- ✅ No projectId or projectSlug visible in UI text
- ✅ Active Quests panel visible in project pages (right rail desktop, collapsible mobile)
- ✅ Empty state shows when no quests available

---

### Phase 2: Keyword Relevance Backend (Minimal Backend Addition)

**Goal:** Add keyword relevance validation to scoring without breaking existing flows.

**Tasks:**

1. **Define Keyword Storage (No Migration Yet)**
   - **Proposal:** Use existing `projects.arc_keywords` TEXT[] field
   - **Format:** `['$SYMBOL', '@handle', 'brand name', 'core term 1', 'core term 2', ...]`
   - **Future Enhancement:** JSONB with categories: `{ core: [...], secondary: [...] }`
   - **Action:** Document structure, prepare migration for Phase 2

2. **Add Keyword Validation Helper**
   - **File:** `src/web/lib/arc/keyword-relevance.ts` (new)
     - `checkKeywordRelevance(text: string, keywords: string[]): boolean`
     - `getKeywordMatchScore(text: string, keywords: string[], categories?: KeywordCategories): number`
     - Categories: core (weight: 2.0), secondary (weight: 1.0)
     - Returns: boolean (relevance) + score (for weighting)

3. **Update Option 2 Scoring**
   - **File:** `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts`
     - Fetch project keywords: `SELECT arc_keywords FROM projects WHERE id = projectId`
     - In `calculateAutoTrackedPoints()`:
       - Check relevance before aggregating: `if (!checkKeywordRelevance(mention.text, keywords)) continue;`
       - Apply keyword match score as multiplier (if categories exist)
   - **File:** `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
     - Same logic: Fetch keywords, filter by relevance

4. **Update Option 1 Scoring**
   - **File:** `src/web/lib/arc/creator-manager-scoring.ts`
     - When aggregating from `user_ct_activity`:
       - Fetch project keywords
       - Filter tweets by keyword relevance
       - Apply keyword weighting if available

5. **Update Option 3 Quest Validation**
   - **File:** `src/web/pages/api/portal/arc/quests/completions.ts` (or submission endpoint)
     - When validating quest submission:
       - Check tweet/content for keyword relevance
       - Reject if no relevant keywords found (with helpful error)

6. **Admin UI for Keywords (Future - Phase 2.5)**
   - **File:** `src/web/pages/portal/arc/[slug].tsx` or admin project settings
     - Add "Project Keywords" section in edit form
     - Allow admins to add/edit `arc_keywords` array
   - **Note:** Can defer to Phase 3 if needed

**Acceptance Criteria:**
- ✅ Keyword relevance helper functions implemented
- ✅ Option 2 scoring filters by keyword relevance (if keywords exist)
- ✅ Option 1 scoring filters by keyword relevance (if keywords exist)
- ✅ Option 3 quest submissions validate keyword relevance
- ✅ Backward compatible: Projects without keywords still work (all tweets pass relevance check)
- ✅ Scoring includes keyword match score as multiplier (when categories exist)

---

### Phase 3: Future Enhancements

**Multi-Social Support:**
- Extend scoring to other platforms (Discord, Telegram, etc.) when APIs available
- Update `user_ct_activity` schema to support multiple platforms
- Platform-specific keyword matching

**CRM Tasks as Quests:**
- Map `creator_manager_missions` to quest format
- Allow admins to "launch as quest" from CRM mission
- Bidirectional sync between CRM missions and quests

**Deeper Report Metrics:**
- Keyword relevance breakdown in reports
- Content type distribution
- Engagement quality scores

---

## D) ACCEPTANCE CHECKLIST

Use this checklist to verify corrected spec is implemented without breaking existing routes.

### Phase 1: UI Updates

- [ ] **Terminology Updated**
  - [ ] All instances of "Arena" changed to "Mindshare Leaderboard" in UI labels
  - [ ] Option 1 labeled as "Creator Manager (CRM)" in all UI
  - [ ] Option 3 labeled as "Gamified Quests" in all UI
  - [ ] Verify: `/portal/arc` home page shows correct labels
  - [ ] Verify: Feed cards show correct kind labels
  - [ ] Verify: Navigation menus show correct labels

- [ ] **Project Name Display**
  - [ ] Project name is prominent in all feed cards
  - [ ] No `projectId` visible in any UI text
  - [ ] No `projectSlug` visible in any UI text
  - [ ] Verify: `LiveItemCard` shows project name only (line 124)
  - [ ] Verify: Mobile layout shows project name only
  - [ ] Verify: All tooltips/hover states don't show IDs

- [ ] **Active Quests Right Rail**
  - [ ] Desktop: Right rail shows "Active Quests" panel when viewing project pages
  - [ ] Mobile: Collapsible quest panel accessible
  - [ ] Empty state shows when no quests available
  - [ ] Quest list links to full gamified page
  - [ ] Verify: `/portal/arc/[slug]` shows quest panel (if gamified enabled)
  - [ ] Verify: Panel doesn't break existing right rail functionality

- [ ] **Routes Still Work**
  - [ ] `/portal/arc/[slug]/arena/[arenaSlug]` still accessible
  - [ ] `/portal/arc/leaderboard/[projectId]` still accessible
  - [ ] `/portal/arc/gamified/[projectId]` still accessible
  - [ ] `/portal/arc/creator-manager` still accessible
  - [ ] All API endpoints return expected data

### Phase 2: Keyword Relevance

- [ ] **Keyword Storage**
  - [ ] `projects.arc_keywords` field can be populated (via admin UI or migration)
  - [ ] Keywords stored as TEXT[] array
  - [ ] Index exists for efficient queries

- [ ] **Keyword Validation Functions**
  - [ ] `checkKeywordRelevance()` function implemented
  - [ ] `getKeywordMatchScore()` function implemented (with category support)
  - [ ] Functions handle empty keyword arrays (all pass)

- [ ] **Option 2 Scoring Updated**
  - [ ] `calculateAutoTrackedPoints()` fetches project keywords
  - [ ] Mentions filtered by keyword relevance before aggregation
  - [ ] Keyword match score applied as multiplier (if categories exist)
  - [ ] Backward compatible: Projects without keywords still work

- [ ] **Option 1 Scoring Updated**
  - [ ] Creator Manager scoring filters by keyword relevance
  - [ ] `user_ct_activity` aggregation respects keywords
  - [ ] Backward compatible: Projects without keywords still work

- [ ] **Option 3 Quest Validation**
  - [ ] Quest submission validates keyword relevance
  - [ ] Clear error message if submission lacks relevant keywords
  - [ ] Existing completions remain valid

- [ ] **Testing**
  - [ ] Project with no keywords: All tweets pass relevance check
  - [ ] Project with keywords: Only relevant tweets counted
  - [ ] Project with keyword categories: Weighting applied correctly
  - [ ] Scoring results match expected behavior

### General Verification

- [ ] **No Breaking Changes**
  - [ ] All existing routes accessible
  - [ ] All API endpoints return same structure
  - [ ] Database queries unchanged (except new keyword filtering)
  - [ ] Authentication/authorization unchanged

- [ ] **Code Quality**
  - [ ] `pnpm lint` passes
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm guard:forbidden` passes (no forbidden keywords)
  - [ ] TypeScript compilation succeeds

- [ ] **Documentation**
  - [ ] Updated spec document reflects changes
  - [ ] API documentation updated (if needed)
  - [ ] Migration notes documented

---

## Implementation Files Reference

### Files to Modify (Phase 1)

1. `src/web/components/arc/fb/LiveItemCard.tsx` - Update kind labels
2. `src/web/lib/arc-naming.ts` - Update naming functions (if exists)
3. `src/web/pages/portal/arc/[slug].tsx` - Add quest panel, ensure project name display
4. `src/web/components/arc/fb/ActiveQuestsPanel.tsx` - **NEW** - Quest panel component
5. `src/web/components/arc/fb/mobile/MobileLayout.tsx` - Add mobile quest panel
6. All pages with "Arena" label - Search and replace

### Files to Modify (Phase 2)

1. `src/web/lib/arc/keyword-relevance.ts` - **NEW** - Keyword validation helpers
2. `src/web/pages/api/portal/arc/arenas/[slug]/leaderboard.ts` - Add keyword filtering
3. `src/web/pages/api/portal/arc/leaderboard/[projectId].ts` - Add keyword filtering
4. `src/web/lib/arc/creator-manager-scoring.ts` - Add keyword filtering
5. `src/web/pages/api/portal/arc/quests/*` - Add keyword validation
6. `src/web/pages/portal/arc/[slug].tsx` - Add keyword admin UI (future)

### Database

- `projects.arc_keywords` - Already exists (TEXT[]), needs population
- No new tables required for Phase 1 or Phase 2

---

## Notes

- **Backward Compatibility:** All changes maintain existing functionality
- **Gradual Rollout:** Phase 1 can ship independently, Phase 2 can follow
- **Keyword Migration:** Projects can be migrated gradually (empty keywords = all pass)
- **Route Preservation:** All existing routes remain functional (labels change only)
