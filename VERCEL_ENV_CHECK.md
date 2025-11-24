# 🔍 Vercel Environment Variables Checklist

## Required Environment Variables in Vercel Dashboard

Go to your Vercel project → Settings → Environment Variables and add:

### 1. Telegram Bot (REQUIRED)
```
TELEGRAM_BOT_TOKEN=8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8
```

### 2. Database - Supabase (REQUIRED)
```
DATABASE_URL=postgresql://postgres.dosalyqfzynurisjmknw:Persevere2-Starter8-Little6-Slighted5-Surging6@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require
```

### 3. Admin (REQUIRED)
```
ADMIN_TELEGRAM_ID=6022649318
```

### 4. Vercel URL (AUTO-SET, but can override)
```
VERCEL_URL=your-app-name.vercel.app
```
Note: Vercel automatically sets this, but you can override if needed.

### 5. Twitter API (OPTIONAL - for X verifications)
```
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAGdX5gEAAAAA6EtmxTlbe9fbzXswEVe1lnHS77Q%3DqzDlyN8LOlxP9F8AaVg7FngCikIc5439qD0tDasCIx1RHOrUSz
TWITTER_CLIENT_ID=bms5UTZPQ0VYYWdoeUxfanEtdVE6MTpjaQ
TWITTER_CLIENT_SECRET=RpAbMi81P82Y3olcKLvrZLlf3wK6FfNUO7l0fMuCB_9ziqw6k2
```

## Vercel Project Settings

1. **Root Directory**: Set to `src/web` in Vercel dashboard
2. **Framework Preset**: Next.js (or Other)
3. **Build Command**: (Already in vercel.json)
4. **Output Directory**: `.next` (Already in vercel.json)

## After Setting Environment Variables

1. **Redeploy** your project in Vercel
2. **Set Webhook** after deployment:
   ```
   https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/setWebhook?url=https://your-app.vercel.app/api/webhook
   ```
3. **Test** by sending `/start` to your bot

## Verify Webhook

Check webhook status:
```
https://api.telegram.org/bot8300403255:AAEN5v-e7XxS8JAxxNnOpsNJWHj2c5T5hL8/getWebhookInfo
```

