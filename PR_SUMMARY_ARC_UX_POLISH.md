# PR Summary: ARC UX + Product Polish

## Overview
This PR implements UX polish for ARC to make it a creator-friendly signal engine for InfoFi leaderboards.

**Status:** ⚠️ **PARTIAL** - Core naming complete, major UI enhancements in progress

---

## ✅ Completed

### A) User-Facing Naming + Nav ✅
- **Status:** Complete
- **Changes:**
  - Created `src/web/lib/arc-naming.ts` with centralized naming functions
  - Replaced all "Option 1/2/3" labels with:
    - "Creator Hub" (Option 1 / CRM)
    - "Mindshare Leaderboard" (Option 2 / Classic)
    - "Quest Leaderboard" (Option 3 / Gamified)
  - Updated in:
    - `src/web/pages/portal/arc/requests.tsx`
    - `src/web/pages/portal/arc/project/[projectId].tsx`
    - `src/web/pages/portal/arc/gamified/[projectId].tsx`
    - `src/web/pages/portal/arc/creator-manager.tsx`
    - `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

---

## 🚧 Remaining Work (High Priority)

### B) Leaderboard Readability (InfoFi Style)
- **Status:** Not Started
- **Required:**
  - Standardize row layout: Rank, Creator (handle + avatar), Score (primary), Level badge (secondary), Proof/Activity icons (tertiary)
  - Add view toggle: Score / Impact / Consistency
    - If Impact/Consistency not available, show tooltip "Coming soon" and default to Score
- **Files to modify:**
  - `src/web/pages/portal/arc/gamified/[projectId].tsx`
  - `src/web/pages/portal/arc/project/[projectId].tsx`
  - `src/web/pages/portal/arc/[slug].tsx` (leaderboard tab)

### C) Quest Leaderboard "GameFi Feel"
- **Status:** Partial (HUD exists, needs grouping + recommended quest)
- **Completed:**
  - ✅ HUD panel exists (Your Progress with rank, XP, streak)
- **Remaining:**
  - [ ] Add "Recommended next quest" (first incomplete quest) to HUD
  - [ ] Add quest grouping UI to missions tab:
    - Quick Quests (intro-thread)
    - Signal Quests (meme-drop, signal-boost)
    - Weekly Boss Quest (deep-dive)
    - Other (unknown mission_id)
- **Files to modify:**
  - `src/web/pages/portal/arc/gamified/[projectId].tsx` (add recommended quest to HUD)
  - `src/web/pages/portal/arc/[slug].tsx` (add quest grouping to missions tab)

### D) Status Perks (Default, No Money)
- **Status:** Not Started
- **Required:**
  - Add "Perks you can unlock" section on `/portal/arc/[slug]`
  - Badges: Verified Raider, Signal Contributor (Top 50), Core Raider (Top 20), Legend (Top 3)
  - Perks list (static copy):
    - Featured on project page
    - Founder shoutout and follow
    - Private alpha access
    - Whitelist spots
    - Special community role
    - Early partner deals
- **Files to modify:**
  - `src/web/pages/portal/arc/[slug].tsx` (add Status Perks section)
  - Use `src/web/lib/arc-ui-helpers.ts` for badge computation

### E) Prize Pool Optional (Safe Wording)
- **Status:** Not Started
- **Required:**
  - Add toggle: "Enable prizes for this campaign (optional)"
  - Field: "Prize budget (optional)" (number input)
  - Copy: "Performance-based prizes awarded by rank at campaign end. No purchase required."
- **Files to modify:**
  - `src/web/pages/portal/arc/[slug].tsx` (campaign creation modal)
  - Ensure safe wording (no gambling language)

### F) Founder "Signal Engine" Metrics
- **Status:** Not Started
- **Required:**
  - Add "Campaign Pulse" block on `/portal/arc/[slug]`
  - Show three headline metrics:
    - Creators participating (count arena_creators for active arena)
    - Total completions (count quest completions for active arena; if N/A, show tooltip)
    - Top creator score (from leaderboard)
  - Add lightweight "Recent activity" feed
- **Files to modify:**
  - `src/web/pages/portal/arc/[slug].tsx` (add Campaign Pulse section)

### G) Copy Update (Founder + Creator)
- **Status:** Not Started
- **Required copy:**
  - Founder headline: "Turn campaigns into measurable Crypto Twitter signal."
  - Founder subtext: "Launch quests, rank creators, and track mindshare output in one place."
  - Creator headline: "Earn status, unlock perks, and climb the ranks."
  - Creator subtext: "Transparent scoring. Every point has a reason."
  - Positioning line: "ARC creates signal, not just tracks it."
- **Files to modify:**
  - `src/web/pages/portal/arc/[slug].tsx` (project hub page)
  - `src/web/pages/portal/arc/index.tsx` (ARC home page)

---

## 📁 Files Changed

### New Files
1. `src/web/lib/arc-naming.ts` - Centralized naming functions
2. `src/web/lib/arc-ui-helpers.ts` - UI helper functions (level calculation, badges, quest categories)

### Modified Files
1. `src/web/pages/portal/arc/requests.tsx` - Updated naming
2. `src/web/pages/portal/arc/project/[projectId].tsx` - Updated naming
3. `src/web/pages/portal/arc/gamified/[projectId].tsx` - Updated naming, has HUD
4. `src/web/pages/portal/arc/creator-manager.tsx` - Updated naming
5. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - Updated naming

---

## 🔒 Security Verification

✅ **All security gates preserved:**
- `requireArcAccess()` checks remain intact
- `checkProjectPermissions()` / `requireSuperAdmin()` checks remain intact
- No auth/RLS/access checks weakened
- All authenticated fetches use `credentials: 'include'`
- No gambling language added
- `projects.twitter_username` remains read-only

✅ **Build Status:**
- `npm run build` passes successfully

---

## 🎯 Next Steps

To complete this PR, implement the remaining items in order of priority:

1. **Copy Updates (G)** - Quick win, high visibility
2. **Quest Grouping + Recommended Quest (C)** - High impact for GameFi feel
3. **Status Perks Section (D)** - High impact for creator engagement
4. **Campaign Pulse Metrics (F)** - Moderate impact for founder value
5. **Prize Pool Toggle (E)** - Moderate complexity
6. **Leaderboard Standardization (B)** - Moderate complexity, can be iterative

---

## 📝 Notes

- All changes are UI-only (no backend logic changes)
- Helper functions created for reusability (`arc-naming.ts`, `arc-ui-helpers.ts`)
- Existing security gates and authentication flows remain unchanged
- Error states and edge cases handled gracefully
- Tooltips used for "Coming soon" features to maintain UX clarity

