# ARC UX + Product Polish Implementation Summary

## Status: IN PROGRESS

This document tracks the implementation of UX polish for ARC to make it a creator-friendly signal engine for InfoFi leaderboards.

---

## ✅ Completed

### A) User-Facing Naming + Nav
- ✅ Created `src/web/lib/arc-naming.ts` with centralized naming functions
- ✅ Replaced "Option 1/2/3" with:
  - "Creator Hub" (Option 1 / CRM)
  - "Mindshare Leaderboard" (Option 2 / Classic)
  - "Quest Leaderboard" (Option 3 / Gamified)
- ✅ Updated in:
  - `src/web/pages/portal/arc/requests.tsx`
  - `src/web/pages/portal/arc/project/[projectId].tsx`
  - `src/web/pages/portal/arc/gamified/[projectId].tsx`
  - `src/web/pages/portal/arc/creator-manager.tsx`
  - `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

---

## 🚧 In Progress / TODO

### B) Leaderboard Readability (InfoFi Style)
- [ ] Standardize row layout: Rank, Creator (handle + avatar), Score (primary), Level badge (secondary), Proof/Activity icons (tertiary)
- [ ] Add view toggle: Score / Impact / Consistency
  - If Impact/Consistency not available, show tooltip "Coming soon" and default to Score

### C) Quest Leaderboard "GameFi Feel"
- ✅ HUD panel exists (Your Progress with rank, XP, streak)
- [ ] Add "Recommended next quest" (first incomplete quest)
- [ ] Add quest grouping UI:
  - Quick Quests (intro-thread)
  - Signal Quests (meme-drop, signal-boost)
  - Weekly Boss Quest (deep-dive)
  - Other (unknown mission_id)

### D) Status Perks (Default, No Money)
- [ ] Add "Perks you can unlock" section on /portal/arc/[slug]
- [ ] Badges: Verified Raider, Signal Contributor (Top 50), Core Raider (Top 20), Legend (Top 3)
- [ ] Perks list (static copy):
  - Featured on project page
  - Founder shoutout and follow
  - Private alpha access
  - Whitelist spots
  - Special community role
  - Early partner deals

### E) Prize Pool Optional (Safe Wording)
- [ ] Add toggle: "Enable prizes for this campaign (optional)"
- [ ] Field: "Prize budget (optional)" (number input)
- [ ] Copy: "Performance-based prizes awarded by rank at campaign end. No purchase required."
- [ ] Apply to campaign creation/quest settings pages

### F) Founder "Signal Engine" Metrics
- [ ] Add "Campaign Pulse" block on /portal/arc/[slug]
- [ ] Show three headline metrics:
  - Creators participating (count arena_creators for active arena)
  - Total completions (count quest completions for active arena)
  - Top creator score (from leaderboard)
- [ ] Add lightweight "Recent activity" feed

### G) Copy Update (Founder + Creator)
- [ ] Founder headline: "Turn campaigns into measurable Crypto Twitter signal."
- [ ] Founder subtext: "Launch quests, rank creators, and track mindshare output in one place."
- [ ] Creator headline: "Earn status, unlock perks, and climb the ranks."
- [ ] Creator subtext: "Transparent scoring. Every point has a reason."
- [ ] Positioning line: "ARC creates signal, not just tracks it."

### H) No Footguns
- ✅ Ensure slug normalization remains correct
- ✅ Ensure all authenticated fetches include credentials: 'include'
- ✅ Error states are helpful but don't leak sensitive info

---

## Files Changed So Far

1. `src/web/lib/arc-naming.ts` - NEW: Centralized naming functions
2. `src/web/lib/arc-ui-helpers.ts` - NEW: UI helper functions (level calculation, badges, quest categories)
3. `src/web/pages/portal/arc/requests.tsx` - Updated naming
4. `src/web/pages/portal/arc/project/[projectId].tsx` - Updated naming
5. `src/web/pages/portal/arc/gamified/[projectId].tsx` - Updated naming, has HUD
6. `src/web/pages/portal/arc/creator-manager.tsx` - Updated naming
7. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - Updated naming

---

## Next Steps

1. Add quest grouping to Quest Leaderboard
2. Add Status Perks section
3. Add Campaign Pulse metrics
4. Update copy throughout
5. Add prize pool toggle
6. Standardize leaderboard layouts with view toggles
7. Final verification and testing

