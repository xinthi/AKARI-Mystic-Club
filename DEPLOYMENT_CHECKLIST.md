# ✅ Deployment Checklist

## Step 1: Vercel Configuration

### A. Project Settings
1. Go to Vercel Dashboard → Your Project → Settings
2. **Root Directory**: Set to `src/web`
3. **Framework Preset**: Next.js (or leave as detected)
4. **Build Command**: (Already configured in vercel.json)
5. **Output Directory**: `.next` (Already configured)

### B. Environment Variables
Go to Settings → Environment Variables and add:

#### Required:
- `TELEGRAM_BOT_TOKEN` = `8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8`
- `DATABASE_URL` = `postgresql://postgres.dosalyqfzynurisjmknw:Persevere2-Starter8-Little6-Slighted5-Surging6@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require`
- `ADMIN_TELEGRAM_ID` = `6022649318`

#### Optional (for X verifications):
- `TWITTER_BEARER_TOKEN`
- `TWITTER_CLIENT_ID`
- `TWITTER_CLIENT_SECRET`

#### Auto-set by Vercel:
- `VERCEL_URL` (automatically set, don't override unless needed)

### C. Deploy
1. Click "Deploy" or push to GitHub (auto-deploy)
2. Wait for build to complete
3. Check build logs for errors

## Step 2: Verify Deployment

### A. Check Vercel Build
- ✅ Build should complete successfully
- ✅ No errors in build logs
- ✅ Prisma Client generated

### B. Test API Endpoints
1. Visit: `https://your-app.vercel.app/api/webhook` (should return 405 Method Not Allowed for GET)
2. Check Vercel function logs for any errors

## Step 3: Set Telegram Webhook

### A. Get Your Vercel URL
- Your app URL: `https://your-app-name.vercel.app`
- Webhook URL: `https://your-app-name.vercel.app/api/webhook`

### B. Set Webhook
Visit in browser or use curl:
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://your-app-name.vercel.app/api/webhook
```

### C. Verify Webhook
Check webhook status:
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-app-name.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## Step 4: Test Bot

1. Open Telegram
2. Find your bot
3. Send `/start`
4. Bot should respond with welcome message

## Step 5: Troubleshooting

### If Bot Doesn't Respond:
1. Check Vercel function logs
2. Check webhook status (getWebhookInfo)
3. Verify environment variables are set
4. Check DATABASE_URL format (must include `?sslmode=require`)

### If Build Fails:
1. Check build logs in Vercel
2. Verify Prisma Client is generated
3. Check for TypeScript errors
4. Verify all dependencies are installed

### If Database Connection Fails:
1. Verify DATABASE_URL is correct
2. Check Supabase connection settings
3. Ensure SSL mode is set: `?sslmode=require`
4. Test connection locally first

## Common Issues:

### Issue: "Bot token not configured"
**Fix**: Add `TELEGRAM_BOT_TOKEN` to Vercel environment variables

### Issue: "Database not configured"
**Fix**: Add `DATABASE_URL` to Vercel environment variables

### Issue: "Invalid update format"
**Fix**: Check webhook URL is correct and accessible

### Issue: Build fails with Prisma errors
**Fix**: Ensure `pnpm prisma:generate` runs during build (already in vercel.json)

