# 🔮 AKARI Mystic Club

A Telegram Mini App for prediction markets, campaigns, tasks, and rewards. Built with Next.js 14, Prisma, and Supabase.

## 🎯 Features

- **Prediction Markets**: Create and bet on predictions with Stars or points
- **Campaigns & Tasks**: Complete tasks to earn rewards and points
- **Leaderboards**: Compete with other users by tier and points
- **User Profiles**: Track your points, tier, credibility score, and achievements
- **Surveys**: Participate in feedback surveys for campaigns

## 🏗️ Architecture

- **Frontend**: Next.js 14 (Pages Router) with Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL via Supabase with Prisma ORM
- **Bot**: Minimal Grammy.js bot for Mini App entry point
- **Deployment**: Vercel (serverless)

## 📋 Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Supabase account and database
- Telegram Bot Token

## 🚀 Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd akari-mystic-club
pnpm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBAPP_URL=https://your-app.vercel.app
TELEGRAM_WEBHOOK_SECRET=optional_webhook_secret

# Database
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Admin
ADMIN_TELEGRAM_ID=your_telegram_user_id

# Optional: Twitter API (for X/Twitter integrations)
TWITTER_BEARER_TOKEN=optional
TWITTER_CLIENT_ID=optional
TWITTER_CLIENT_SECRET=optional

# Vercel (auto-set in production)
VERCEL_URL=your-app.vercel.app
```

### 3. Database Setup

```bash
# Push schema to database
pnpm prisma:push

# Generate Prisma Client
pnpm prisma:generate

# Seed initial data (tiers)
pnpm prisma:seed
```

### 4. Development

```bash
# Start Next.js dev server
pnpm dev
```

The app will be available at `http://localhost:3000`

## 📦 Database Management

### Reset Database (Development)

```bash
# Reset schema and seed data
pnpm db:reset
```

### Clean Database (Development)

```bash
# Delete all data (preserves schema)
pnpm db:cleanup
```

**Warning**: This deletes all user data, predictions, campaigns, etc. Only use in development!

### Manual Cleanup in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Run the SQL from `prisma/cleanup.sql`
3. Or use the TypeScript script: `pnpm db:cleanup`

## 🚢 Deployment

### Vercel

1. **Connect Repository**
   - Import your GitHub repository to Vercel
   - Set root directory to `src/web` in Vercel project settings

2. **Environment Variables**
   - Add all environment variables from `.env` to Vercel
   - Ensure `DATABASE_URL` is set correctly

3. **Build Settings**
   - Framework: Next.js
   - Root Directory: `src/web`
   - Build Command: `cd ../.. && pnpm install && cd src/web && pnpm build`
   - Install Command: `cd ../.. && pnpm install`

4. **Deploy**
   - Push to main branch triggers automatic deployment
   - Or deploy manually from Vercel dashboard

### Set Telegram Webhook

After deployment, set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook&secret_token=<YOUR_WEBHOOK_SECRET>"
```

Or use the Telegram Bot API:

```bash
POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
Content-Type: application/json

{
  "url": "https://your-app.vercel.app/api/webhook",
  "secret_token": "your_webhook_secret"
}
```

### Verify Webhook

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## 📁 Project Structure

```
akari-mystic-club/
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Seed script
│   ├── cleanup.ts         # Cleanup script (TypeScript)
│   └── cleanup.sql        # Cleanup script (SQL)
├── src/
│   ├── bot/               # Minimal Telegram bot (optional)
│   └── web/               # Next.js Mini App
│       ├── pages/
│       │   ├── api/       # API routes
│       │   │   ├── auth/
│       │   │   ├── profile/
│       │   │   ├── predictions/
│       │   │   ├── campaigns/
│       │   │   ├── leaderboard/
│       │   │   ├── surveys/
│       │   │   └── webhook.ts
│       │   ├── index.tsx           # Dashboard
│       │   ├── predictions.tsx     # Predictions list
│       │   ├── predictions/[id].tsx
│       │   ├── campaigns.tsx       # Campaigns list
│       │   ├── campaigns/[id].tsx
│       │   ├── leaderboard.tsx
│       │   └── profile.tsx
│       ├── lib/
│       │   ├── prisma.ts           # Prisma client
│       │   ├── telegram-bot.ts     # Minimal bot
│       │   ├── telegram-auth.ts    # Auth utilities
│       │   └── tiers.ts            # Tier management
│       └── styles/
└── package.json
```

## 🔧 API Routes

### Authentication
- `POST /api/auth/telegram` - Authenticate with Telegram init data

### Profile
- `GET /api/profile` - Get user profile
- `PATCH /api/profile` - Update profile

### Predictions
- `GET /api/predictions` - List predictions
- `GET /api/predictions/[id]` - Get prediction details
- `POST /api/predictions` - Create prediction
- `POST /api/predictions/[id]/bet` - Place bet
- `POST /api/predictions/[id]/resolve` - Resolve prediction (admin)

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns/[id]/complete-task` - Complete task

### Leaderboard
- `GET /api/leaderboard` - Get leaderboard (points, tier, or campaign)

### Surveys
- `GET /api/surveys` - List surveys
- `GET /api/surveys/[id]` - Get survey
- `POST /api/surveys/[id]` - Submit survey

### Webhook
- `POST /api/webhook` - Telegram webhook handler

## 🎨 Styling

The app uses Tailwind CSS with a dark purple/black gradient theme. Key colors:

- Primary: Purple (`#6B46C1`, `#9333EA`)
- Background: Dark gradient (`from-purple-900 via-black to-purple-900`)
- Cards: Semi-transparent purple with backdrop blur

## 🔒 Security

- Telegram init data is verified using HMAC-SHA256
- Webhook secret token validation (optional)
- Admin-only endpoints check `ADMIN_TELEGRAM_ID`
- Input validation using Zod schemas

## 🐛 Troubleshooting

### Bot not responding

1. Check webhook is set correctly
2. Verify `TELEGRAM_BOT_TOKEN` in Vercel
3. Check Vercel function logs for errors

### Database connection errors

1. Verify `DATABASE_URL` is correct
2. Check Supabase connection settings
3. Ensure Prisma Client is generated: `pnpm prisma:generate`

### Build errors

1. Ensure all dependencies are installed: `pnpm install`
2. Check Prisma schema is valid: `pnpm prisma:validate`
3. Verify TypeScript compilation: `pnpm build`

## 📝 License

Private - All rights reserved

## 🤝 Contributing

This is a private project. For questions or issues, contact the maintainers.

---

**Built with 🔮 for AKARI Mystic Club**
