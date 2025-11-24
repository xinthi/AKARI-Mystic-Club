# 📍 Where to Create/Set the Webhook

## Understanding Webhooks

**Important:** You don't "create" the webhook in Vercel or any dashboard. Here's how it works:

1. **The webhook endpoint already exists** in your code at `/api/webhook`
2. **You just need to tell Telegram** where to send messages
3. **You do this by calling Telegram's API** (not Vercel's)

## Where to Set the Webhook

### ✅ Option 1: Browser (Easiest - Recommended)

**Location:** Your web browser (Chrome, Firefox, Edge, etc.)

**Steps:**
1. Open any web browser
2. Go to the address bar
3. Paste this URL (replace `YOUR-APP-NAME` with your Vercel app name):
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook
   ```
4. Press Enter
5. Done! ✅

**Example:**
If your Vercel app is `akari-mystic-bot.vercel.app`, you would visit:
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://akari-mystic-bot.vercel.app/api/webhook
```

### ✅ Option 2: PowerShell (Windows)

**Location:** PowerShell window on your computer

**Steps:**
1. Press `Win + X` and select "Windows PowerShell"
2. Copy and paste this command (replace `YOUR-APP-NAME`):
   ```powershell
   $token = "8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8"
   $webhookUrl = "https://YOUR-APP-NAME.vercel.app/api/webhook"
   Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook?url=$webhookUrl" -Method GET
   ```
3. Press Enter
4. Done! ✅

### ✅ Option 3: Command Prompt / Terminal

**Location:** Command Prompt (Windows) or Terminal (Mac/Linux)

**Steps:**
1. Open Command Prompt or Terminal
2. Run this command (replace `YOUR-APP-NAME`):
   ```bash
   curl "https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://YOUR-APP-NAME.vercel.app/api/webhook"
   ```
3. Press Enter
4. Done! ✅

## What Happens When You Set the Webhook?

1. **You call Telegram's API** (the URL above)
2. **Telegram saves** your webhook URL
3. **When someone messages your bot**, Telegram sends the message to your Vercel app
4. **Your Vercel app** (at `/api/webhook`) receives and processes it

## Where is the Webhook Endpoint?

The webhook endpoint is **already created** in your code:
- **File:** `src/web/pages/api/webhook.ts`
- **URL:** `https://your-app.vercel.app/api/webhook`
- **Status:** ✅ Already exists, you just need to tell Telegram about it

## Visual Guide

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: Your Code (Already Done)                      │
│  File: src/web/pages/api/webhook.ts                     │
│  This endpoint receives messages from Telegram          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 2: Deploy to Vercel (You've Done This)            │
│  Your app is live at: your-app.vercel.app              │
│  Webhook endpoint: your-app.vercel.app/api/webhook     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 3: Tell Telegram (This is What You Do Now)       │
│  Visit this URL in browser:                            │
│  https://api.telegram.org/bot.../setWebhook?url=...    │
│  This tells Telegram where to send messages             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 4: Done!                                          │
│  Telegram now sends messages to your Vercel app        │
└─────────────────────────────────────────────────────────┘
```

## Quick Checklist

- [ ] Your Vercel app is deployed and live
- [ ] You know your Vercel app URL (e.g., `akari-mystic-bot.vercel.app`)
- [ ] You open a browser
- [ ] You visit the setWebhook URL (with your app name)
- [ ] You see `{"ok":true}` response
- [ ] You test by sending `/start` to your bot

## Common Confusion

**❌ Wrong:** "I need to create a webhook in Vercel dashboard"
- Vercel doesn't have a webhook creation feature
- The webhook endpoint is already in your code

**❌ Wrong:** "I need to create a webhook in Telegram dashboard"
- Telegram doesn't have a dashboard for this
- You use Telegram's API directly

**✅ Correct:** "I need to tell Telegram where my webhook is"
- You do this by calling Telegram's API
- Easiest way: Visit the URL in your browser

## Example: Complete Process

Let's say your Vercel app is: `akari-mystic-club.vercel.app`

1. **Open browser**
2. **Visit this exact URL:**
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://akari-mystic-club.vercel.app/api/webhook
   ```
3. **See response:**
   ```json
   {"ok":true, "result":true, "description":"Webhook was set"}
   ```
4. **Done!** Your bot is now connected

## Need Help?

If you're still confused:
1. What's your Vercel app URL? I can give you the exact URL to visit
2. Are you getting an error? Share the error message
3. Can't find your Vercel app URL? Check Vercel dashboard

---

**TL;DR:** Open your browser, visit the setWebhook URL, done! No dashboard needed. 🚀

