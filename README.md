# 🔮 AKARI Mystic Bot

A complete, production-ready TypeScript Telegram Mini App Bot for the AKARI Mystic Club (AMC), featuring Stars payments, tier system, campaigns, predictions, surveys, and more.

## 🏗️ Architecture

- **Bot**: Grammy.js bot with conversation flows
- **Database**: PostgreSQL with Prisma ORM
- **Mini App**: Next.js with Tailwind CSS and Telegram Web App SDK
- **API**: Express serverless functions for Vercel
- **Package Manager**: pnpm (monorepo)

## 📁 Project Structure

```
.
├── src/
│   ├── bot/              # Grammy.js bot
│   │   ├── src/
│   │   │   ├── handlers/ # Command handlers
│   │   │   ├── utils/    # Utilities (tiers, stars, verifications)
│   │   │   └── index.ts  # Bot core & webhook
│   │   └── package.json
│   ├── web/              # Next.js Mini App
│   │   ├── pages/        # Next.js pages
│   │   ├── styles/       # Tailwind CSS
│   │   └── package.json
│   └── api/              # Express API routes
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed data (tiers)
├── package.json          # Root workspace
└── vercel.json          # Vercel configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL database
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Twitter API credentials (optional, for X verifications)

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd akari-mystic-bot

# Install dependencies
pnpm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/akari_mystic?schema=public

# Twitter API (optional)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

# Vercel
VERCEL_URL=your_app_url.vercel.app

# Admin
ADMIN_TELEGRAM_ID=your_telegram_user_id
```

### 3. Database Setup

```bash
# Push schema to database
pnpm prisma:push

# Generate Prisma Client
pnpm prisma:generate

# Seed tiers and test data
pnpm prisma:seed
```

### 4. Development

```bash
# Start bot and web app in development mode
pnpm dev
```

- Bot: Runs in polling mode (local development)
- Web App: http://localhost:3000

### 5. Production Deployment (Vercel)

#### Step 1: Create GitHub Repository

1. Create a new **public** repository on GitHub
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

#### Step 2: Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `.` (root)
   - **Build Command**: `pnpm build`
   - **Output Directory**: `src/web/.next` (for Next.js)
5. Add all environment variables from `.env`
6. Deploy!

#### Step 3: Set Webhook

After deployment, set your Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.vercel.app/api/webhook"}'
```

Or use the Telegram Bot API:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook
```

## 🎮 Features

### User Onboarding

- Welcome message with language selection (English/Spanish)
- Multi-select interests (Content Creator, Airdrop Hunter, Investor, Founder, New to Crypto)
- X (Twitter) OAuth connection
- Wallet input (TON & EVM) - verification later
- 5 bonus EP on completion

### Tiers System

- **Seeker** L1-3 (0-1k EP) 🧭 Red
- **Alchemist** L1-3 (1k-5k EP) 🔥 Orange
- **Sentinel** L1-4 (5k-20k EP) 🛡️ Red
- **Merchant** L1-3 (20k-50k EP) 💰 Blue
- **Guardian** L1-3 (50k-100k EP) ⚔️ Black
- **Sovereign** L1+ (100k+ EP) 👑 Black

Points accrue from:
- Task completions: 0.2 EP per task
- Stars payments: 1 EP per $1 spent (100 Stars = $1)

### Stars Payments

- Campaign creation: $100 one-time (100 Stars) or $20/year (200 Stars)
- Prediction bets: Configurable entry fee
- 5% fee logged in database
- Points automatically awarded

### Verifications

- **Telegram**: Group/channel membership
- **X (Twitter)**: Follow, like, repost
- **Instagram**: Screenshot upload (admin approval)

### Reviews & Credibility

- `/review @username 1-5 [comment]`
- Credibility score: Average rating × 2 (1-10 scale)
- "Credible 🛡️" badge for 10+ positive reviews

### Campaigns

- Founders can create campaigns with Stars payment
- Tasks with verification
- Leaderboard per campaign
- Surveys linked to campaigns

### Predictions

- Create predictions with options
- Place bets with Stars
- Admin resolution with pro-rata distribution (95% pot)

### Surveys

- Founders create surveys linked to campaigns
- Multiple question types: rating, multiple choice, text
- Responses stored and reports generated

### Mini App Pages

- `/profile`: Dashboard with badges, EP progress, credibility
- `/tasks`: Campaign list with verification buttons
- `/leaderboard`: Per-tier leaderboards with charts
- `/survey/[id]`: Survey form

## 🤖 Commands

- `/start` - Start bot and onboarding
- `/profile` - View profile
- `/tasks` - List active campaigns
- `/review @username 1-5 [comment]` - Review a user
- `/newcampaign` - Create campaign (founder only)
- `/predictions` - List active predictions
- `/newsurvey` - Create survey (founder only)
- `/leaderboard [campaignId]` - View leaderboard
- `/credibility` - Group credibility stats
- `/admin` - Admin panel

## 🔧 Admin Commands

- `/verifyfounder <userId>` - Verify founder status
- `/broadcast <message>` - Broadcast to all users
- `/poll <question> <options>` - Create poll
- `/approve <msgId>` - Approve verification (IG)

## 📊 Cron Jobs

- **Daily tier updates** (00:00 UTC)
- **Remove new_to_crypto** after 365 days active (01:00 UTC)
- **Update leaderboards** (02:00 UTC)

## 🛠️ Development Scripts

```bash
# Setup (install + db push + generate + seed)
pnpm setup

# Development
pnpm dev

# Build
pnpm build

# Prisma
pnpm prisma:push      # Push schema
pnpm prisma:generate  # Generate client
pnpm prisma:seed      # Seed database
pnpm prisma:studio    # Open Prisma Studio
```

## 📝 GDPR

Users can request data deletion via `/deleteuser` command (to be implemented).

## 🔒 Security

- Helmet.js for security headers
- CORS enabled
- Environment variables for secrets
- Admin-only commands protected

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions, please open a GitHub issue.

---

**Built with ❤️ for AKARI Mystic Club**

