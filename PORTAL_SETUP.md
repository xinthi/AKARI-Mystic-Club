# Portal Setup Guide

## Overview

A new web portal has been created at `src/portal/` for akarimystic.club. This portal is completely isolated from the existing MiniApp and does not modify any existing code.

## What Was Created

### 1. Database Schema (Prisma)

New models added to `prisma/schema.prisma`:
- `PortalUserProfile` - User profiles for the portal with role-based access (L1, L2, ADMIN)
- `LaunchPlatform` - Launch platforms (Seedify, ChainGPT Pad, etc.)
- `NewLaunch` - New token launches with price tracking
- `DexSnapshot` - Price snapshots from DEX/CEX sources

### 2. Portal Pages

- `src/portal/pages/index.tsx` - Homepage with hero and feature cards
- `src/portal/pages/markets.tsx` - Markets dashboard (placeholder)
- `src/portal/pages/memes.tsx` - Meme Radar (placeholder)
- `src/portal/pages/new-launches/index.tsx` - New launches list with filters
- `src/portal/pages/new-launches/[id].tsx` - Launch detail page
- `src/portal/pages/admin/new-launches.tsx` - Admin panel (L2/ADMIN)

### 3. API Routes

- `src/portal/pages/api/auth/telegram.ts` - Telegram authentication for portal
- `src/portal/pages/api/cron/sync-dex-prices.ts` - Price sync cron for launches

## Next Steps

### 1. Run Prisma Migration

```bash
# Generate Prisma client with new models
pnpm prisma:generate

# Push schema changes to database
pnpm prisma:push
```

### 2. Configure Next.js for Portal

The portal pages are created but may need Next.js configuration. You have two options:

**Option A: Use existing Next.js app (src/web)**
- The portal pages can be accessed via `/portal/*` routes if you configure Next.js rewrites
- Add to `src/web/next.config.js`:
  ```js
  async rewrites() {
    return [
      {
        source: '/portal/:path*',
        destination: '/portal/:path*',
      },
    ];
  }
  ```

**Option B: Separate Next.js app (recommended for isolation)**
- Create a new Next.js app in `src/portal/`
- Copy `package.json`, `tsconfig.json`, `tailwind.config.js` from `src/web/`
- Configure it to use the same Prisma schema

### 3. Route Configuration

For now, pages are accessible at:
- `/portal` - Homepage
- `/portal/markets` - Markets (placeholder)
- `/portal/memes` - Meme Radar (placeholder)
- `/portal/new-launches` - New launches list
- `/portal/new-launches/[id]` - Launch details
- `/portal/admin/new-launches` - Admin panel

Later, configure Vercel to map `akarimystic.club` to `/portal` routes.

### 4. Authentication

The portal uses Telegram authentication. Users need to:
1. Login via `/portal/api/auth/telegram` with Telegram `initData`
2. Get a session token (currently returns user data directly)
3. Use the token for authenticated requests

**TODO**: Implement JWT or session cookies for persistent authentication.

### 5. Permissions

User levels are stored in `PortalUserProfile.level`:
- **L1**: Normal user (can view launches, leave reviews)
- **L2**: Scout/Researcher (can create/edit launches)
- **ADMIN**: Super admin (can manage platforms and user levels)

**TODO**: Add middleware to protect routes based on user level.

### 6. Price Sync Cron

The price sync endpoint is at `/portal/api/cron/sync-dex-prices`.

To set up:
1. Configure external cron (cron-job.org, Vercel Cron, etc.)
2. Call: `GET /portal/api/cron/sync-dex-prices?secret=YOUR_CRON_SECRET`
3. Runs every 5-15 minutes (adjust based on needs)

Currently supports:
- **DEXSCREENER**: Fetches prices from DexScreener API

To add more sources, extend the `PRICE_SOURCES` object in the cron file.

### 7. Admin Panel Features

The admin panel (`/portal/admin/new-launches`) currently has placeholder UI. You need to implement:

1. **Launch Management (L2+)**:
   - Create launch form
   - Edit launch form
   - List/search launches

2. **Platform Management (ADMIN only)**:
   - Create/edit/delete platforms
   - List platforms

3. **User Level Management (ADMIN only)**:
   - List users with levels
   - Change user levels (L1 ↔ L2)
   - Mark users as ADMIN

## Important Notes

- ✅ **No existing code was modified** - All new code is in `src/portal/`
- ✅ **Database schema extended** - New models added, existing models untouched
- ✅ **Isolated structure** - Portal can be deployed separately if needed
- ⚠️ **Prisma migration needed** - Run `pnpm prisma:push` to create new tables
- ⚠️ **Next.js config may be needed** - Depending on your deployment setup
- ⚠️ **Auth middleware needed** - Protect admin routes based on user level

## Testing

1. Run Prisma migration
2. Start dev server (if using existing Next.js app)
3. Visit `/portal` to see homepage
4. Test authentication at `/portal/api/auth/telegram`
5. Test price sync at `/portal/api/cron/sync-dex-prices?secret=YOUR_SECRET`

## Future Enhancements

- [ ] Implement JWT/session authentication
- [ ] Add auth middleware for protected routes
- [ ] Complete admin panel forms
- [ ] Add review system for users
- [ ] Implement launch creation/editing forms
- [ ] Add more price sources (OKX, Binance, etc.)
- [ ] Add charts/graphs for price history
- [ ] Implement search and advanced filters

