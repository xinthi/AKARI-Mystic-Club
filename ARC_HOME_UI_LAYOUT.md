# ARC Home UI Layout Documentation

**Date:** 2025-01-23  
**Page:** `/portal/arc`  
**File:** `src/web/pages/portal/arc/index.tsx`

---

## Overview

This document describes the redesigned ARC home page layout, which provides a full-screen, premium dashboard experience with clear hierarchy and fast scanning capabilities.

---

## Layout Structure

### 1. Full-Screen Shell

The page uses a full-width layout with:
- **Compact header**: Sticky top bar with title and subtitle
- **Max-width container**: `max-w-[1920px]` for optimal readability on large screens
- **Responsive padding**: `px-4 sm:px-6 lg:px-8` adapts to screen size

### 2. Treemap Hero Section

The treemap (or cards view) is positioned as the **hero element** at the top of the page, immediately below the header.

**Control Strip** (above treemap):
- View toggle: Cards / Treemap
- Mode toggle: Top Gainers / Top Losers
- Timeframe pills: 24h, 7d, 30d, 90d
- Refresh button
- Admin buttons (SuperAdmin only): ARC Admin, Review Requests

**Hero Content Panel**:
- Displays either `ArcTopProjectsTreemap` or `ArcTopProjectsCards` based on selected view mode
- Wrapped in `TreemapWrapper` component for error handling
- Full-width container with backdrop blur and border styling

### 3. Below-Treemap Sections

All content below the treemap hero is organized in this exact order:

#### A) Live Leaderboards
- **Position**: First section below treemap
- **Header**: "Live" with animated "Active" badge (pulsing red dot)
- **Data Source**: `/api/portal/arc/live-leaderboards` → `data.leaderboards` array
- **Display**: Grid of cards (1 column mobile, 2 tablet, 3 desktop)
- **Card Content**:
  - Arena name (title)
  - Project name
  - X handle (if available)
  - Creator count
  - Time remaining (if endAt is available)
  - Actions: "View Arena" (primary), "Project" (secondary)
- **Empty State**: "No active leaderboards right now"

#### B) Upcoming
- **Position**: Second section below treemap
- **Header**: "Upcoming" with filter toggle (Today / This Week / All)
- **Data Source**: `/api/portal/arc/live-leaderboards` → `data.upcoming` array
- **Filtering**: Client-side only, using `startAt` timestamps
- **Display**: Grid of cards matching Live section layout
- **Card Content**:
  - Arena name (title)
  - Project name
  - X handle (if available)
  - Start date and countdown (days until start)
  - Action: "View Details"
- **Empty State**: "No upcoming leaderboards"

#### C) Recently Ended
- **Position**: Third section below treemap
- **Header**: "Recently Ended"
- **Data Source**: Currently shows empty state (no data source yet)
- **Display**: Placeholder section ready for future implementation
- **Empty State**: "No recently ended leaderboards"

---

## Data Sources (Reused)

All sections use existing API endpoints and data structures:

1. **Top Projects Data**: 
   - Endpoint: `/api/portal/arc/top-projects`
   - Query params: `mode` (gainers/losers), `timeframe` (24h/7d/30d/90d), `limit=20`
   - Used for: Treemap hero section

2. **Live Leaderboards**:
   - Endpoint: `/api/portal/arc/live-leaderboards`
   - Query param: `limit=15`
   - Response: `{ ok: true, leaderboards: [], upcoming: [] }`
   - Used for: Live section (`leaderboards` array) and Upcoming section (`upcoming` array)

---

## Component Integrity

### Treemap Components - NOT MODIFIED

The following treemap component files remain **completely unchanged**:

- `src/web/components/arc/ArcTopProjectsTreemap.tsx`
- `src/web/components/arc/ArcTopProjectsTreemapClient.tsx`
- `src/web/components/arc/ArcProjectsTreemapV3.tsx`
- `src/web/components/arc/ArcProjectsTreemapV2.tsx`

**Confirmation**: 
- Only the page-level layout (`src/web/pages/portal/arc/index.tsx`) was modified
- The `TreemapWrapper` component (inline in index.tsx) is unchanged from original - it only wraps the treemap component for error boundary handling
- No changes to treemap data shaping, scoring, colors, sizing, rendering, or event handlers

---

## Mobile Responsiveness

### Desktop
- Full-width layout with max container
- Treemap dominates hero section
- 3-column grid for leaderboard cards
- Horizontal control strip above treemap

### Mobile
- Stacked layout (single column cards)
- Control strip becomes horizontally scrollable
- Touch-friendly button sizes (h-8 for controls)
- Responsive padding and spacing

---

## Key Features

1. **Hierarchy**: Clear visual hierarchy with treemap as hero, followed by organized sections
2. **Scanning**: Status badges, time remaining, and clear CTAs enable fast scanning
3. **Empty States**: All sections have clean, informative empty states
4. **Accessibility**: ARIA labels on icon buttons, focus states, readable contrast
5. **Performance**: Client-side filtering for upcoming section (no extra API calls)
6. **Consistency**: Unified card design system across all sections

---

## Section Order Summary

1. **Header** (sticky, compact)
2. **Treemap Hero** (with control strip above)
3. **Live Leaderboards** (below treemap)
4. **Upcoming** (below live, with filter)
5. **Recently Ended** (below upcoming, placeholder)

---

## Notes

- All authenticated fetch calls include `credentials: 'include'`
- Security: All API endpoints use existing authentication (no changes to auth logic)
- No SQL migrations or schema changes
- No external brand references in code, UI text, or documentation

