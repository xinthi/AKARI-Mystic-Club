# 🔍 Connection Diagnostics Checklist

## Required Environment Variables

### 1. Telegram Bot
- `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
- `ADMIN_TELEGRAM_ID` - Your Telegram user ID for admin commands

### 2. Database (Supabase)
- `DATABASE_URL` - PostgreSQL connection string
  Format: `postgresql://user:password@host:port/database?sslmode=require`

### 3. Vercel
- `VERCEL_URL` - Your Vercel deployment URL (auto-set by Vercel)
  Or manually: `your-app-name.vercel.app`

### 4. Twitter API (Optional)
- `TWITTER_BEARER_TOKEN` - For X verifications
- `TWITTER_CLIENT_ID` - For OAuth
- `TWITTER_CLIENT_SECRET` - For OAuth

### 5. Payment (Optional)
- `PAYMENT_PROVIDER_TOKEN` - For Stars payments (if using)

## Connection Issues to Check

### Vercel Issues
1. **Build Command**: Must run from root, then build Next.js
2. **Root Directory**: Should be `src/web` in Vercel settings
3. **Environment Variables**: Must be set in Vercel dashboard
4. **Prisma Client**: Must be generated during build

### Telegram Bot Issues
1. **Webhook**: Must be set to `https://your-app.vercel.app/api/webhook`
2. **Token**: Must be valid and not expired
3. **Polling vs Webhook**: Can't use both simultaneously

### Database Issues
1. **Connection String**: Must include SSL mode for Supabase
2. **Prisma Client**: Must be generated before use
3. **Schema**: Must be pushed to database

### Next.js API Issues
1. **Dynamic Imports**: Bot code must be imported dynamically
2. **Environment Variables**: Must be available at runtime
3. **Prisma Client**: Must be available in API routes

