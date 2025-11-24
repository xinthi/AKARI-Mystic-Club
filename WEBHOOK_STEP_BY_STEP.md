# 🔗 Step-by-Step Webhook Setup Guide

## Complete Step-by-Step Instructions

### Step 1: Get Your Vercel App URL

1. Go to [https://vercel.com](https://vercel.com)
2. Sign in to your account
3. Click on your project (or create one if you haven't)
4. Look at the top of the page - you'll see your deployment URL
   - Example: `https://akari-mystic-bot.vercel.app`
   - Or: `https://your-project-name.vercel.app`
5. **Write down this URL** - you'll need it in the next step

### Step 2: Prepare the Webhook URL

Your webhook URL will be:
```
https://YOUR-APP-NAME.vercel.app/api/webhook
```

**Example:**
- If your Vercel app is: `akari-mystic-bot.vercel.app`
- Your webhook URL is: `https://akari-mystic-bot.vercel.app/api/webhook`

### Step 3: Set the Webhook (Choose One Method)

#### Method A: Browser (Easiest) ⭐ RECOMMENDED

1. Open any web browser (Chrome, Firefox, Edge, etc.)
2. Copy this entire URL:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook
   ```
3. **Replace `YOUR-APP-NAME`** with your actual Vercel app name
   - Example: If your app is `akari-mystic-bot.vercel.app`, the URL becomes:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://akari-mystic-bot.vercel.app/api/webhook
   ```
4. Paste the URL into your browser's address bar
5. Press Enter
6. You should see a response like this:
   ```json
   {
     "ok": true,
     "result": true,
     "description": "Webhook was set"
   }
   ```
7. ✅ **Success!** Your webhook is now set

#### Method B: PowerShell (Windows)

1. Open PowerShell (Press `Win + X`, then select "Windows PowerShell")
2. Copy and paste this command (replace `YOUR-APP-NAME`):
   ```powershell
   $token = "8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8"
   $webhookUrl = "https://YOUR-APP-NAME.vercel.app/api/webhook"
   Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook?url=$webhookUrl" -Method GET
   ```
3. Press Enter
4. You should see the success response

#### Method C: Command Prompt / Terminal

1. Open Command Prompt or Terminal
2. Run this command (replace `YOUR-APP-NAME`):
   ```bash
   curl "https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook"
   ```
3. Press Enter
4. You should see the success response

### Step 4: Verify Webhook is Set Correctly

1. Open your browser
2. Visit this URL:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
   ```
3. You should see a response like:
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
4. ✅ If you see your webhook URL in the response, it's set correctly!

### Step 5: Test Your Bot

1. Open Telegram app (on phone or desktop)
2. Search for your bot by username (the one you got from @BotFather)
3. Click on your bot
4. Click "Start" or type `/start`
5. Your bot should respond with a welcome message! 🎉

### Step 6: Troubleshooting (If Bot Doesn't Respond)

#### Check 1: Vercel Deployment
1. Go to Vercel Dashboard
2. Check if your latest deployment is successful (green checkmark)
3. If there are errors, check the build logs

#### Check 2: Environment Variables
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Make sure these are set:
   - ✅ `TELEGRAM_BOT_TOKEN` = `8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8`
   - ✅ `DATABASE_URL` = (your Supabase connection string)
   - ✅ `ADMIN_TELEGRAM_ID` = `6022649318`
3. If any are missing, add them and redeploy

#### Check 3: Webhook URL Accessibility
1. Open browser
2. Visit: `https://YOUR-APP-NAME.vercel.app/api/webhook`
3. You should see: `{"error":"Method not allowed"}` or similar (this is normal for GET requests)
4. If you see 404, the route doesn't exist - check your deployment

#### Check 4: Vercel Function Logs
1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/webhook`
3. Check the logs for any errors
4. Common errors:
   - "Bot token not configured" → Add `TELEGRAM_BOT_TOKEN` to Vercel
   - "Database not configured" → Add `DATABASE_URL` to Vercel

### Step 7: Remove Webhook (If Needed for Local Testing)

If you want to test locally with polling mode:

1. Visit this URL in browser:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/deleteWebhook
   ```
2. You should see: `{"ok":true, "result":true}`
3. Now you can run the bot locally with `pnpm dev`

---

## Quick Reference

### Your Bot Token
```
8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8
```

### Set Webhook Template
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

## Example Walkthrough

Let's say your Vercel app is: `akari-mystic-club.vercel.app`

1. **Get webhook URL:**
   ```
   https://akari-mystic-club.vercel.app/api/webhook
   ```

2. **Set webhook (paste in browser):**
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://akari-mystic-club.vercel.app/api/webhook
   ```

3. **Verify:**
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
   ```

4. **Test:** Send `/start` to your bot in Telegram

---

**That's it!** Your bot should now be receiving messages through the webhook. 🚀

