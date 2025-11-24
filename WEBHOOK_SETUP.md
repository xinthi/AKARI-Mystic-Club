# 🔗 Telegram Webhook Setup Guide

## What is a Webhook?

A webhook is how Telegram sends messages to your bot. Instead of your bot constantly checking for new messages (polling), Telegram will send updates directly to your Vercel API endpoint.

## Prerequisites

1. ✅ Your bot is deployed on Vercel
2. ✅ Your Vercel app URL (e.g., `https://your-app-name.vercel.app`)
3. ✅ Your new bot token: `8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8`

## Step-by-Step Instructions

### Step 1: Get Your Vercel App URL

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project
3. Copy your deployment URL (e.g., `https://akari-mystic-bot.vercel.app`)
4. Your webhook URL will be: `https://your-app-name.vercel.app/api/webhook`

### Step 2: Set the Webhook

You have **3 methods** to set the webhook. Choose the easiest one for you:

#### Method 1: Browser (Easiest) ⭐

1. Open your browser
2. Copy and paste this URL (replace `YOUR-APP-NAME` with your actual Vercel app name):
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook
   ```
3. Press Enter
4. You should see a response like:
   ```json
   {
     "ok": true,
     "result": true,
     "description": "Webhook was set"
   }
   ```

#### Method 2: PowerShell (Windows)

1. Open PowerShell
2. Run this command (replace `YOUR-APP-NAME`):
   ```powershell
   $token = "8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8"
   $webhookUrl = "https://YOUR-APP-NAME.vercel.app/api/webhook"
   Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook?url=$webhookUrl" -Method GET
   ```

#### Method 3: curl (Command Line)

1. Open Terminal/Command Prompt
2. Run this command (replace `YOUR-APP-NAME`):
   ```bash
   curl "https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook"
   ```

### Step 3: Verify Webhook is Set

Check if the webhook was set correctly:

1. Open your browser
2. Visit this URL:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
   ```
3. You should see:
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

### Step 4: Test Your Bot

1. Open Telegram
2. Search for your bot (by username from BotFather)
3. Send `/start`
4. Your bot should respond! 🎉

## Troubleshooting

### Issue: "Webhook was set" but bot doesn't respond

**Check:**
1. Vercel deployment is live and working
2. Environment variables are set in Vercel:
   - `TELEGRAM_BOT_TOKEN`
   - `DATABASE_URL`
   - `ADMIN_TELEGRAM_ID`
3. Check Vercel function logs for errors

### Issue: "Bad Request" or "404 Not Found"

**Fix:**
- Make sure your webhook URL is correct
- Format: `https://your-app-name.vercel.app/api/webhook`
- No trailing slashes
- Make sure `/api/webhook` route exists

### Issue: "Unauthorized"

**Fix:**
- Check your bot token is correct
- Make sure you're using the new token: `8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8`

### Issue: Webhook URL not accessible

**Fix:**
1. Make sure your Vercel deployment is successful
2. Visit `https://your-app-name.vercel.app/api/webhook` in browser
3. Should return "Method not allowed" (405) for GET requests (this is normal)
4. If you get 404, the route doesn't exist - check your deployment

## Remove Webhook (for local testing)

If you want to test locally with polling mode, remove the webhook:

```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/deleteWebhook
```

## Quick Reference

### Set Webhook
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook
```

### Check Webhook
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
```

### Remove Webhook
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/deleteWebhook
```

---

**Need help?** Check Vercel function logs or Telegram Bot API documentation.

