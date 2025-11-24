# ✅ Vercel Deployment - Configuration Summary

## What Was Fixed

1. **Created Next.js API Routes** - Converted Express routes to Next.js API routes:
   - `/api/webhook` - Telegram webhook handler
   - `/api/profile/[userId]` - User profile endpoint
   - `/api/campaigns` - Campaigns list
   - `/api/leaderboard` - Leaderboard data
   - `/api/survey/[id]` - Survey endpoints (GET/POST)
   - `/api/x-callback` - X OAuth callback

2. **Updated .vercelignore** - Now includes bot code (needed for API routes)

3. **Fixed vercel.json** - Proper build command for monorepo

## Vercel Project Settings

In your Vercel dashboard, configure:

### Option 1: Root Directory Approach (Recommended)
- **Root Directory**: `.` (project root)
- **Framework Preset**: Other
- **Build Command**: `pnpm install && cd src/web && pnpm install && pnpm build`
- **Output Directory**: `src/web/.next`
- **Install Command**: `pnpm install`

### Option 2: Next.js Auto-Detection
- **Root Directory**: `src/web`
- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: Leave default
- **Output Directory**: Leave default
- **Install Command**: `cd ../.. && pnpm install`

## Environment Variables

Make sure to add these in Vercel dashboard:

- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `TWITTER_BEARER_TOKEN`
- `TWITTER_CLIENT_ID`
- `TWITTER_CLIENT_SECRET`
- `ADMIN_TELEGRAM_ID`
- `VERCEL_URL` (auto-set by Vercel)

## After Deployment

1. **Set Telegram Webhook:**
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook
   ```

2. **Test the bot:**
   - Send `/start` in Telegram
   - Check if webhook is receiving updates

3. **Test Mini App:**
   - Open profile page
   - Check if API routes are working

## Build Process

The build will:
1. Install all dependencies (root + workspaces)
2. Build Next.js app in `src/web`
3. Deploy as serverless functions

## Troubleshooting

- **Build fails**: Check that all dependencies are in package.json
- **API routes 404**: Verify routes are in `src/web/pages/api/`
- **Webhook not working**: Check webhook URL and bot token
- **Database errors**: Verify DATABASE_URL is correct

---

✅ **All fixes have been pushed to GitHub!**

