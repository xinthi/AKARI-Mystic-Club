# ARC Backend Inventory Report

## 1) Live items endpoint contract

**File:** `src/web/pages/api/portal/arc/live-leaderboards.ts`

**Endpoint:** `GET /api/portal/arc/live-leaderboards?limit=15`

**Response JSON Shape:**
```json
{
  "ok": true,
  "leaderboards": [...],
  "upcoming": [...]
}
```

**Top-level keys:**
- `ok`: boolean (true on success)
- `leaderboards`: array of LiveLeaderboard items (live items)
- `upcoming`: array of LiveLeaderboard items (upcoming items)

**Per-item fields (LiveLeaderboard):**
- `projectId`: string (required)
- `projectName`: string (required)
- `projectSlug`: string | null
- `xHandle`: string | null
- `creatorCount`: number
- `startAt`: string | null (ISO date)
- `endAt`: string | null (ISO date)
- `title`: string (required)
- `kind`: 'arena' | 'campaign' | 'gamified' (required)
- `arenaId`: string (optional, present when kind='arena')
- `arenaName`: string (optional, present when kind='arena')
- `arenaSlug`: string (optional, present when kind='arena')
- `campaignId`: string (optional, present when kind='campaign')

**Status values:**
Items are categorized as 'live' or 'upcoming' based on date comparison:
- `live`: startAt is null or in the past, and endAt is null or in the future
- `upcoming`: startAt is in the future

**Kind values:**
- `'arena'`: Arena leaderboard (Option 2)
- `'campaign'`: CRM campaign (Option 1)
- `'gamified'`: Quest/gamified (Option 3)

**Route construction:**
Items do not include a direct href/url field. Routes must be constructed using:
- For `kind='arena'`: `/portal/arc/${projectSlug}/arena/${arenaSlug}` (requires projectSlug and arenaSlug)
- For `kind='campaign'`: No dedicated detail route found (campaigns are accessed via project hub at `/portal/arc/${projectSlug}`)
- For `kind='gamified'`: `/portal/arc/gamified/${projectId}` (requires projectId)

**Note:** If projectSlug is null, fallback to projectId may be needed. Campaigns do not have slugs in the schema.

## 2) Activity endpoint

**File:** `src/web/pages/api/portal/arc/quests/recent-activity.ts`

**Endpoint:** `GET /api/portal/arc/quests/recent-activity?arenaId=<uuid>`

**Response JSON Shape:**
```json
{
  "ok": true,
  "activities": [
    {
      "mission_id": "string",
      "completed_at": "string (ISO date)",
      "creator_username": "string",
      "proof_url": "string | null"
    }
  ]
}
```

**Event types:**
This endpoint returns quest completion activities only. Each activity represents a completed mission/quest.

**Limitations:**
- Requires authentication (portal user)
- Requires ARC Option 3 (Gamified) access for the arena's project
- Limited to quest completions (not general ARC activity)
- Returns last 20 activities only
- Arena-specific (requires arenaId parameter)

**Alternative endpoints:**
No general ARC activity endpoint found. The following endpoints exist but serve different purposes:
- `/api/portal/arc/live-leaderboards` - Returns live/upcoming items (not activity feed)
- `/api/portal/arc/summary` - Returns project summary statistics (not activity)
- `/api/portal/notifications` - Returns user notifications (not ARC-specific activity)

## 3) Permissions + current user

**User identity determination:**
Portal pages determine user identity via:
- `requirePortalUser()` helper in `src/web/lib/server/require-portal-user.ts` (server-side)
- `useAkariUser()` hook from `src/web/lib/akari-auth.tsx` (client-side)
- Session token from cookies (`akari_session`)

**Role checking utilities:**

**isSuperAdmin:**
- **File:** `src/web/lib/permissions.ts` (line 299-301)
- **Function:** `isSuperAdmin(user: Pick<AkariUser, 'realRoles'> | null): boolean`
- **Logic:** Checks if `user.realRoles` array includes `'super_admin'`
- **Usage:** Client-side and server-side (via `checkSuperAdmin()` in various API routes)

**canManageArc:**
- **Location:** `src/web/pages/portal/arc/index.tsx` (client-side only)
- **Logic:** `canManageArc = isDevMode || userIsSuperAdmin || initialCanManageArc`
- **Note:** This is a client-side computed value, not a server-side utility function. Server-side check in `getServerSideProps` sets `initialCanManageArc` to false in production (line 813).

**User/profile fields for display:**

**AkariUser interface** (`src/web/lib/permissions.ts` lines 107-122):
- `id`: string
- `displayName`: string (primary display name)
- `avatarUrl`: string | null (avatar image URL)
- `xUsername`: string | null (Twitter/X username)
- `realRoles`: Role[] (for permission checks)
- `effectiveRoles`: Role[] (for UI display)

**Avatar/initials fallback:**
When `avatarUrl` is null, initials are generated from the first character of `displayName` (see `src/web/pages/portal/sentiment/profile/[username].tsx` lines 114-116 for example implementation).

**Username field:**
- Use `displayName` for primary display
- Use `xUsername` for Twitter handle display (format: `@${xUsername}`)

## 4) Existing routes for ARC items

**Arena detail:**
- **Route pattern:** `/portal/arc/[slug]/arena/[arenaSlug]`
- **File:** `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`
- **Required params:**
  - `slug`: project slug (string, from URL)
  - `arenaSlug`: arena slug (string, from URL)
- **Links found in:**
  - `src/web/pages/portal/arc/[slug].tsx` line 1411
  - `src/web/pages/portal/arc/creator/[twitterUsername].tsx` line 413
  - `src/web/pages/portal/arc/admin/[projectSlug].tsx` lines 439, 474

**Campaign detail:**
- **Route pattern:** No dedicated campaign detail page found
- **Note:** Campaigns are accessed via the project hub at `/portal/arc/[slug]` which shows campaigns in the project context
- **API endpoint exists:** `/api/portal/arc/campaigns/[id]` for fetching campaign data

**Gamified detail:**
- **Route pattern:** `/portal/arc/gamified/[projectId]`
- **File:** `src/web/pages/portal/arc/gamified/[projectId].tsx`
- **Required params:**
  - `projectId`: project UUID (string, from URL)
- **Links found in:**
  - `src/web/pages/portal/arc/[slug].tsx` line 1432

**Project detail:**
- **Route pattern:** `/portal/arc/[slug]` (project hub)
- **File:** `src/web/pages/portal/arc/[slug].tsx`
- **Required params:**
  - `slug`: project slug (string, from URL, normalized to lowercase)
- **Alternative route:** `/portal/arc/project/[projectId]` (legacy route using projectId)
- **File:** `src/web/pages/portal/arc/project/[projectId].tsx`
- **Links found in:**
  - `src/web/pages/portal/arc/index.tsx` lines 632, 758
  - `src/web/components/arc/CampaignGrid.tsx` lines 101, 112
  - `src/web/components/arc/FeaturedCampaigns.tsx` lines 82, 93

**Route construction notes:**
- Project routes prefer slug over projectId when available
- Slugs are normalized to lowercase (see `src/web/pages/portal/arc/[slug].tsx` line 200)
- Arena routes require both project slug and arena slug
- Campaign routes do not have dedicated detail pages (use project hub)

## 5) Search capability

**ARC-specific search endpoints:**
No dedicated ARC search endpoint found.

**Related search endpoints:**

**Admin projects search:**
- **Endpoint:** `GET /api/portal/admin/projects?search=<query>`
- **File:** `src/web/pages/api/portal/admin/projects/index.ts`
- **Query params:**
  - `search`: string (searches display_name, twitter_username, slug, name, x_handle)
- **Response:** Returns projects array with filtering applied
- **Limitations:** Admin-only endpoint

**Admin profiles search:**
- **Endpoint:** `GET /api/portal/admin/profiles/search?q=<query>`
- **File:** `src/web/pages/api/portal/admin/profiles/search.ts`
- **Query params:**
  - `q`: string (search query)
- **Response shape:** Not fully inspected, but returns profile search results
- **Limitations:** Admin-only endpoint

**Sentiment search:**
- **Endpoint:** `GET /api/portal/sentiment/search?q=<query>`
- **File:** `src/web/pages/api/portal/sentiment/search.ts`
- **Query params:**
  - `q`: string (search query)
- **Response:** Returns user search results (Twitter profiles)
- **Limitations:** Not ARC-specific, searches Twitter profiles

**Conclusion:**
No public or authenticated ARC-specific search endpoint exists for searching projects, campaigns, or arenas. Search functionality would need to be implemented or use admin endpoints (if user has admin access).

## 6) Notifications capability

**Notifications endpoint:**
- **File:** `src/web/pages/api/portal/notifications.ts`
- **Endpoint:** `GET /api/portal/notifications?limit=50&offset=0`

**Response JSON Shape:**
```json
{
  "ok": true,
  "notifications": [
    {
      "id": "string (UUID)",
      "profile_id": "string (UUID)",
      "type": "string",
      "context": "object | null",
      "is_read": "boolean",
      "created_at": "string (ISO date)"
    }
  ],
  "unreadCount": "number"
}
```

**Unread count:**
Yes, the endpoint returns `unreadCount` as a top-level field. This is calculated server-side by counting notifications where `is_read = false` for the current user's profile_id.

**Query parameters:**
- `limit`: number (default: 50, max not specified)
- `offset`: number (default: 0, for pagination)

**Notification types:**
Notification types are stored as strings in the `type` field. Context is stored as a JSON object in the `context` field. Specific types are not enumerated in the endpoint file, but implementation docs mention:
- `mission_submitted`
- `mission_approved`
- `mission_rejected`
- `program_created` (with context: `{ programId, projectId }`)

**Mark as read endpoint:**
- **File:** `src/web/pages/api/portal/notifications/mark-read.ts`
- **Endpoint:** `POST /api/portal/notifications/mark-read`
- **Body:** `{ "ids": ["uuid1", "uuid2"] }` (optional, if omitted marks all as read)

**Permissions:**
- Requires authentication (portal user)
- Users can only fetch/mark their own notifications
- Requires `profile_id` (returns empty list if missing instead of 401)

## 7) Treemap usage

**Component:** `ArcTopProjectsTreemap`
- **File:** `src/web/components/arc/ArcTopProjectsTreemap.tsx`
- **Rendered on:** `/portal/arc` (home page)
- **Usage location:** `src/web/pages/portal/arc/index.tsx` line 141

**Props interface:**
```typescript
{
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '90d') => void;
  lastUpdated?: Date | string | number;
  onProjectClick?: (project: TopProjectItem) => void;
}
```

**Height configuration:**
- **Fixed height constant:** `TREEMAP_HEIGHT = 540` (defined in `ArcTopProjectsTreemapClient.tsx` line 19)
- **Wrapper height:** The treemap is wrapped in a div with fixed height classes: `min-h-[420px] h-[420px] md:min-h-[560px] md:h-[560px]` (see `src/web/pages/portal/arc/index.tsx` line 140)
- **No compact mode:** The component does not support a `compact` prop or configurable height prop. Height is hardcoded.

**Implementation details:**
- Uses dynamic import with `ssr: false` (client-only rendering)
- Wrapped in `TreemapErrorBoundary` with fallback to card view
- Uses Recharts `Treemap` component internally
- Responsive width via ResizeObserver, but height is fixed

