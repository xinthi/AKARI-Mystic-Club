# ARC Routes Documentation

**Last Updated:** 2025-02-01  
**Purpose:** Canonical route map for ARC (Akari Reputation Circuit) system

---

## Canonical Routes (KEEP THESE)

### Public Routes

| Route | File | Purpose |
|-------|------|---------|
| `/portal/arc` | `src/web/pages/portal/arc/index.tsx` | ARC Home - project list and product cards |
| `/portal/arc/[projectSlug]` | `src/web/pages/portal/arc/[projectSlug].tsx` | Project Hub - public project page |
| `/portal/arc/[projectSlug]/arena/[arenaSlug]` | `src/web/pages/portal/arc/[projectSlug]/arena/[arenaSlug].tsx` | Arena Details - public arena page |
| `/r/[code]` | `src/web/pages/r/[code].tsx` | UTM Redirect - public tracking link redirect |

### Project Admin Routes (Project Team + SuperAdmin)

| Route | File | Purpose |
|-------|------|---------|
| `/portal/arc/admin/[projectSlug]` | `src/web/pages/portal/arc/admin/[projectSlug].tsx` | Project Admin Hub - manage arenas, campaigns, requests |

### SuperAdmin Routes

| Route | File | Purpose |
|-------|------|---------|
| `/portal/admin/arc` | `src/web/pages/portal/admin/arc/index.tsx` | SuperAdmin Dashboard |
| `/portal/admin/arc/leaderboard-requests` | `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` | Approve/Reject Requests |
| `/portal/admin/arc/activity` | `src/web/pages/portal/admin/arc/activity.tsx` | Audit Log Viewer |
| `/portal/admin/arc/billing` | `src/web/pages/portal/admin/arc/billing.tsx` | Billing Records |
| `/portal/admin/arc/reports` | `src/web/pages/portal/admin/arc/reports/index.tsx` | Platform Reports |

### User-Facing Routes (Legacy but Still Used)

| Route | File | Purpose | Status |
|-------|------|---------|--------|
| `/portal/arc/requests` | `src/web/pages/portal/arc/requests.tsx` | User's own requests across all projects | ⚠️ Legacy - consider consolidating |

---

## Legacy Redirects (DO NOT DELETE)

These files exist only to redirect to canonical routes:

| Legacy Route | Redirects To | File |
|--------------|--------------|------|
| `/portal/arc/[slug]` | `/portal/arc/[projectSlug]` | `src/web/pages/portal/arc/[slug].tsx` |
| `/portal/arc/[slug]/arena/[arenaSlug]` | `/portal/arc/[projectSlug]/arena/[arenaSlug]` | `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` |
| `/portal/arc/admin` | `/portal/admin/arc` | `src/web/pages/portal/arc/admin/index.tsx` |

**Note:** All redirects use 301 (permanent) redirects via `getServerSideProps`.

---

## Canonical API Routes

### Public/Team API Routes

| Route | Method | File | Purpose |
|-------|--------|------|---------|
| `/api/portal/arc/leaderboard-requests` | GET, POST | `src/web/pages/api/portal/arc/leaderboard-requests.ts` | List/create requests |
| `/api/portal/arc/campaigns` | GET, POST | `src/web/pages/api/portal/arc/campaigns/index.ts` | List/create campaigns |
| `/api/portal/arc/campaigns/[id]/participants` | GET, POST, PATCH | `src/web/pages/api/portal/arc/campaigns/[id]/participants.ts` | Manage participants |
| `/api/portal/arc/campaigns/[id]/participants/[pid]/link` | POST | `src/web/pages/api/portal/arc/campaigns/[id]/participants/[pid]/link.ts` | Generate UTM links |
| `/api/portal/arc/campaigns/[id]/leaderboard` | GET | `src/web/pages/api/portal/arc/campaigns/[id]/leaderboard.ts` | Campaign leaderboard |
| `/api/portal/arc/projects/[projectId]/current-ms-arena` | GET | `src/web/pages/api/portal/arc/projects/[projectId]/current-ms-arena.ts` | Current active arena |

### SuperAdmin API Routes

| Route | Method | File | Purpose |
|-------|--------|------|---------|
| `/api/portal/admin/arc/leaderboard-requests/[requestId]/approve` | PUT, POST | `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts` | Approve request |
| `/api/portal/admin/arc/arenas/[arenaId]/activate` | POST, PUT | `src/web/pages/api/portal/admin/arc/arenas/[arenaId]/activate.ts` | Activate arena |
| `/api/portal/admin/arc/projects/[projectId]/update-features` | POST | `src/web/pages/api/portal/admin/arc/projects/[projectId]/update-features.ts` | Update CRM features |
| `/api/portal/admin/arc/activity` | GET | `src/web/pages/api/portal/admin/arc/activity.ts` | Audit log |
| `/api/portal/admin/arc/billing` | GET | `src/web/pages/api/portal/admin/arc/billing.ts` | Billing records |
| `/api/portal/admin/arc/reports/platform` | GET | `src/web/pages/api/portal/admin/arc/reports/platform.ts` | Platform reports |

---

## Route Naming Conventions

### Dynamic Route Parameters

- **`[projectSlug]`** - Canonical parameter name for project slug (lowercase, trimmed)
- **`[arenaSlug]`** - Canonical parameter name for arena slug
- **`[code]`** - UTM redirect code (from `arc_participant_links.code` or `short_code`)

### Legacy Parameters (DO NOT USE)

- **`[slug]`** - Legacy parameter name, redirects to `[projectSlug]`
- **`[id]`** - Avoid in favor of `[projectId]` or `[requestId]` for clarity

---

## Files to Avoid/Delete

### ❌ DO NOT CREATE

- `/portal/arc/[slug].tsx` (use `[projectSlug].tsx` instead)
- `/portal/arc/[slug]/arena/[arenaSlug].tsx` (use `[projectSlug]/arena/[arenaSlug].tsx` instead)
- `/portal/arc/admin/index.tsx` (redirects to `/portal/admin/arc`)
- `/api/portal/admin/arc/leaderboard-requests/[id]/approve.ts` (use `[requestId]/approve.ts`)

### ⚠️ Legacy Files (Keep for Now)

- `/portal/arc/requests.tsx` - User's own requests page (may be consolidated later)

---

## Quick Smoke Test Checklist

### Public Routes
- [ ] `/portal/arc` - ARC Home loads
- [ ] `/portal/arc/[projectSlug]` - Project Hub loads (replace `[projectSlug]` with actual slug)
- [ ] `/portal/arc/[projectSlug]/arena/[arenaSlug]` - Arena page loads
- [ ] `/r/[code]` - UTM redirect works (replace `[code]` with actual code)

### Admin Routes
- [ ] `/portal/arc/admin/[projectSlug]` - Project admin hub loads
- [ ] `/portal/admin/arc` - SuperAdmin dashboard loads
- [ ] `/portal/admin/arc/leaderboard-requests` - Request approval page loads
- [ ] `/portal/admin/arc/activity` - Audit log loads
- [ ] `/portal/admin/arc/billing` - Billing page loads
- [ ] `/portal/admin/arc/reports` - Reports page loads

### Legacy Redirects (Should Redirect)
- [ ] `/portal/arc/[slug]` → redirects to `/portal/arc/[projectSlug]`
- [ ] `/portal/arc/[slug]/arena/[arenaSlug]` → redirects to `/portal/arc/[projectSlug]/arena/[arenaSlug]`
- [ ] `/portal/arc/admin` → redirects to `/portal/admin/arc`

---

## Internal Link Guidelines

When creating links in components, always use:

```tsx
// ✅ CORRECT
<Link href={`/portal/arc/${projectSlug}`}>
<Link href={`/portal/arc/${projectSlug}/arena/${arenaSlug}`}>
<Link href="/portal/arc/admin/[projectSlug]">

// ❌ WRONG (legacy)
<Link href={`/portal/arc/${slug}`}>
<Link href="/portal/arc/[slug]">
```

---

## Route Collision Prevention

Next.js Pages Router does not allow different dynamic parameter names for the same path level:
- ❌ Cannot have both `[slug].tsx` and `[projectSlug].tsx` in the same directory
- ✅ Solution: Keep `[projectSlug].tsx` as canonical, use `[slug].tsx` as redirect-only

---

## Migration Notes

- **2025-02-01:** Standardized all routes to use `[projectSlug]` instead of `[slug]`
- **2025-02-01:** Created redirects for legacy `[slug]` routes
- **2025-02-01:** Consolidated admin routes to `/portal/admin/arc` for superadmin

---

## Questions?

If you need to add a new route:
1. Check this document first
2. Use canonical parameter names (`[projectSlug]`, not `[slug]`)
3. Add redirect if replacing an existing route
4. Update this document
