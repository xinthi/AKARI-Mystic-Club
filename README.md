# AKARI Mystic Club

A Telegram Mini App for prediction markets, campaigns, and rewards.

## Features

- **Telegram Login + X Connect**: Seamless authentication via Telegram WebApp
- **Prediction Markets**: BTC/ETH price predictions, politics, sports, and community events
- **MYST Token Economy**: 1 USD = 50 MYST (off-chain ledger)
- **Wheel of Fortune**: 2 free daily spins for MYST or aXP
- **Campaigns & Tasks**: Complete social tasks to earn rewards
- **Referral System**: 2-level MLM rewards on friend spending
- **Credibility Reviews**: Leave reviews for other users
- **TON Integration**: Link wallet, deposit TON, withdraw MYST

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Database**: Prisma ORM + Supabase (PostgreSQL)
- **Bot**: Grammy.js (Telegram Bot API)
- **Auth**: Telegram WebApp initData + HMAC verification

## Environment Variables

Create a `.env` file with:

```env
# Database
DATABASE_URL=postgresql://...

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=YourBot
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Admin (comma-separated Telegram IDs)
TELEGRAM_ADMIN_IDS=123456789,987654321
ADMIN_PANEL_TOKEN=your-secret-admin-token

# Twitter/X OAuth (optional)
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...

# TwitterAPI.io (server-side only)
TWITTERAPI_IO_KEY=...
TWITTERAPIIO_API_KEY=...

# TON Integration
TON_TREASURY_ADDRESS=EQB...your-treasury-address
TON_PRICE_USD_FALLBACK=1.0
```

## Development Setup

```bash
# Install dependencies
pnpm install

# Push database schema
npx prisma db push --schema=prisma/schema.prisma

# Generate Prisma client
npx prisma generate --schema=prisma/schema.prisma

# Start dev server
cd src/web
pnpm dev
```

## ARC Quest Tracking (Brand/Quest)

### Required Env
- `SUPABASE_SERVICE_ROLE_KEY` for server-side writes to tracking tables
- `TWITTERAPI_IO_KEY` or `TWITTERAPIIO_API_KEY` for X verification

### Testing Steps
1. Create a brand and launch a quest with up to 5 links (each has a link index 1-5).
2. As a creator, open the quest and copy your tracked links.
3. Post on X with the tracked link and submit the tweet URL.
4. Confirm:
   - Submission is verified
   - Clicks are tracked via `/api/portal/utm/redirect`
   - Leaderboard reflects submissions + clicks

## Deployment (Vercel + Supabase)

1. Create a Supabase project and get the connection string
2. Deploy to Vercel with environment variables
3. Set up the Telegram bot webhook:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook
   ```

## Security Notes

- `.env` files are **never** committed (gitignored)
- No TON private keys are stored in the codebase
- Manual TON withdrawals model (admin sends TON after reviewing requests)
- ADMIN_PANEL_TOKEN required for all `/api/admin/*` endpoints
- Telegram initData verified via HMAC-SHA256

## Project Structure

```
├── prisma/
│   └── schema.prisma       # Database schema
├── src/
│   └── web/
│       ├── components/     # React components
│       ├── lib/            # Utilities, services
│       ├── pages/
│       │   ├── api/        # API routes
│       │   ├── admin/      # Admin panel pages
│       │   └── *.tsx       # App pages
│       └── styles/         # CSS
└── README.md
```

## API Endpoints

### Public
- `POST /api/auth/telegram` - Authenticate user
- `GET /api/predictions` - List predictions
- `POST /api/predictions/[id]/bet` - Place bet
- `GET /api/campaigns` - List campaigns
- `GET /api/wheel/status` - Wheel info
- `POST /api/wheel/spin` - Spin wheel
- `POST /api/reviews` - Leave review
- `GET /api/reviews/[id]` - Get user reviews

### Admin (requires x-admin-token header)
- `/api/admin/predictions` - Manage predictions
- `/api/admin/campaigns` - Manage campaigns
- `/api/admin/myst/grant` - Grant MYST
- `/api/admin/withdrawals` - Process withdrawals
- `/api/admin/deposits` - Manage deposits
- `/api/admin/treasury` - Pool balances
- `/api/admin/wheel/adjust` - Adjust wheel pool

## License

Private - AKARI Mystic Club
