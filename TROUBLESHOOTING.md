# Troubleshooting Guide for AKARI Mystic Bot

## Common Issues and Solutions

### 1. Bot Not Responding to Commands

**Symptoms:**
- Bot doesn't respond to `/start` or other commands
- Vercel shows 500 errors in webhook logs

**Solutions:**

#### Check Webhook Configuration
1. Verify webhook is set correctly:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```

2. Set webhook to your Vercel URL:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
   ```

#### Check Environment Variables
Ensure all required environment variables are set in Vercel:
- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `ADMIN_TELEGRAM_ID`
- `TWITTER_BEARER_TOKEN` (optional)
- `TWITTER_CLIENT_ID` (optional)
- `TWITTER_CLIENT_SECRET` (optional)
- `VERCEL_URL` (auto-set by Vercel)

#### Check Vercel Function Logs
1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/webhook`
3. Check "Logs" tab for errors
4. Look for:
   - "Missing TELEGRAM_BOT_TOKEN"
   - "Missing DATABASE_URL"
   - "Prisma connection error"
   - "Handler not available"

### 2. Database Connection Issues

**Symptoms:**
- Prisma connection errors in logs
- "Database not configured" errors

**Solutions:**

#### Verify DATABASE_URL
1. Check Supabase dashboard for correct connection string
2. Ensure DATABASE_URL is set in Vercel environment variables
3. Format: `postgresql://user:password@host:port/database?sslmode=require`

#### Test Database Connection
```bash
# Test locally
pnpm prisma db push
pnpm prisma studio
```

### 3. Build Failures

**Symptoms:**
- Vercel build fails
- "Cannot find module" errors

**Solutions:**

#### Check Prisma Generation
1. Ensure `postinstall` script runs Prisma generate
2. Check `.npmrc` has `ignore-scripts=false`
3. Verify `prisma` is in `devDependencies`

#### Check Node Version
- Ensure Node.js 18+ is used
- Check `vercel.json` has `runtime: "nodejs18.x"`

### 4. TypeScript Errors

**Symptoms:**
- Build fails with TypeScript errors
- "Cannot find module" errors

**Solutions:**

#### Check tsconfig.json
- Ensure `@ts-nocheck` is at top of bot files
- Check `exclude` includes `../../bot` in `src/web/tsconfig.json`

### 5. Webhook Handler Not Found

**Symptoms:**
- "Handler not available" error
- 500 errors in webhook

**Solutions:**

#### Verify Handler Export
1. Check `src/bot/src/index.ts` exports `handler`
2. Verify `src/web/pages/api/webhook.ts` imports correctly
3. Check dynamic import path: `../../bot/src/index.js`

### 6. Prisma Client Not Generated

**Symptoms:**
- "Cannot find module '@prisma/client'"
- Prisma queries fail

**Solutions:**

#### Regenerate Prisma Client
```bash
# Locally
pnpm prisma:generate

# Or manually
cd prisma
npx prisma generate
```

#### Check postinstall Script
Ensure `package.json` has:
```json
{
  "scripts": {
    "postinstall": "npx prisma generate"
  }
}
```

## Testing Checklist

### Local Testing
- [ ] Run `pnpm install`
- [ ] Run `pnpm prisma:push`
- [ ] Run `pnpm prisma:generate`
- [ ] Run `pnpm dev`
- [ ] Test `/start` command in Telegram

### Vercel Deployment
- [ ] All environment variables set
- [ ] Build succeeds
- [ ] Webhook URL set correctly
- [ ] Test `/start` command
- [ ] Check Vercel function logs

### Webhook Testing
1. Send `/start` to bot
2. Check Vercel logs for:
   - "Prisma connected in handler"
   - "Handler exported"
   - "200 OK" response
3. Verify bot responds in Telegram

## Debug Commands

### Check Webhook Status
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

### Remove Webhook (for local testing)
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
```

### Set Webhook
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
```

### Test Webhook Manually
```bash
curl -X POST https://your-app.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "from": {
        "id": 123456789,
        "is_bot": false,
        "first_name": "Test"
      },
      "chat": {
        "id": 123456789,
        "type": "private"
      },
      "date": 1234567890,
      "text": "/start"
    }
  }'
```

## Common Error Messages

### "Missing TELEGRAM_BOT_TOKEN"
- **Cause:** Environment variable not set
- **Fix:** Add `TELEGRAM_BOT_TOKEN` to Vercel environment variables

### "Missing DATABASE_URL"
- **Cause:** Database connection string not set
- **Fix:** Add `DATABASE_URL` to Vercel environment variables

### "Handler not available"
- **Cause:** Handler not exported or import failed
- **Fix:** Check `src/bot/src/index.ts` exports `handler` function

### "Prisma connection error"
- **Cause:** Database connection failed
- **Fix:** Verify `DATABASE_URL` is correct and database is accessible

### "TypeError: u is not a function"
- **Cause:** Handler not properly initialized
- **Fix:** Ensure handler is exported and imported correctly

## Getting Help

If issues persist:
1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set
3. Test webhook manually with curl
4. Check Telegram Bot API status
5. Verify database connection

