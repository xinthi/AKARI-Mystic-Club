# AKARI Mystic Club - Codebase Overview

## High-Level Overview

### What This App Does
**AKARI Mystic Club** is a Telegram Mini App that combines:
- **Prediction Markets**: Users bet MYST tokens on yes/no questions (crypto prices, elections, etc.)
- **Social Campaigns**: Marketing campaigns where users complete tasks (like tweets, join groups) to earn rewards
- **Token Economy**: MYST token system with referrals, leaderboards, and a Wheel of Fortune
- **Telegram Bot Integration**: @AKARIMystic_Bot handles commands, notifications, and group interactions

### Main User Flows
1. **Onboarding**: User opens Mini App → Telegram auth → Gets 5 MYST bonus → Sees dashboard
2. **Betting**: Browse predictions → Place MYST bet → Wait for resolution → Win/lose payout
3. **Campaigns**: View active campaigns → Complete tasks (X likes, Telegram joins) → Earn points/MYST → Win prizes
4. **Referrals**: Share referral link → Friends join → Earn 8% (L1) + 2% (L2) of their MYST spending
5. **Withdrawals**: Link TON wallet → Request MYST withdrawal → Admin pays USDT on TON chain
6. **Daily Activities**: Spin Wheel of Fortune (2 free spins/day) → Win MYST or aXP

### Telegram Bot Integration
- **Bot**: @AKARIMystic_Bot (Grammy.js framework)
- **Webhook**: `/api/webhook` receives Telegram updates
- **Commands**: `/start`, `/profile`, `/predictions`, `/tasks`, `/leaderboard`, `/admin`
- **Group Features**: Bot can join Telegram groups, verify task completions, track credibility scores

---

## Architecture

### Frontend Stack
- **Framework**: Next.js (Pages Router, not App Router)
- **UI**: Tailwind CSS (custom purple/amber theme)
- **State**: React hooks (`useState`, `useEffect`, `useCallback`)
- **Routing**: Next.js file-based routing (`/pages/*.tsx`)
- **Deployment**: Vercel

**Key Pages:**
- `/` - Dashboard (home page with wheel, stats, quick links)
- `/profile` - User profile (MYST balance, referrals, TON wallet, withdrawals)
- `/predictions` - List of active prediction markets
- `/predictions/[id]` - Individual prediction detail & betting
- `/campaigns` - List of active marketing campaigns
- `/campaigns/[id]` - Campaign detail & task completion
- `/leaderboard` - Rankings (points, MYST spent, referrals)
- `/admin/*` - Admin panel (predictions, campaigns, treasury, analytics)

### Backend Pieces
- **API Routes**: Next.js API routes in `/pages/api/*.ts`
- **Database**: Supabase PostgreSQL (via Prisma ORM)
- **Bot Server**: Separate bot process (`src/bot/`) with Grammy.js
- **Webhook Handler**: `/api/webhook.ts` receives Telegram updates

**Key API Endpoints:**
- `/api/auth/telegram` - Authenticate via Telegram initData
- `/api/predictions` - List/create predictions
- `/api/predictions/[id]/bet` - Place a bet
- `/api/predictions/[id]/resolve` - Resolve prediction (admin only)
- `/api/campaigns` - List/create campaigns
- `/api/myst/withdraw` - Request MYST withdrawal
- `/api/wheel/spin` - Spin Wheel of Fortune
- `/api/admin/*` - Admin operations

### Supabase Usage
- **Database Provider**: PostgreSQL (hosted on Supabase)
- **ORM**: Prisma (schema in `prisma/schema.prisma`)
- **Connection**: Direct connection + connection pooling (port 6543 with `pgbouncer=true`)
- **No RPC Functions**: All logic in Next.js API routes
- **No Triggers**: All business logic in application code
- **No Supabase Auth**: Uses Telegram WebApp authentication

### Telegram Bot Logic
- **Location**: `src/bot/src/index.ts` (main bot file)
- **Handlers**: `src/bot/src/handlers/*.ts` (start, profile, predictions, campaigns, etc.)
- **Webhook**: `/api/webhook.ts` (receives updates from Telegram)
- **Deployment**: Bot runs separately (not on Vercel - needs persistent connection for cron jobs)

---

## Prediction Market Logic

### How a Market is Created
1. **Admin creates via**: `/api/admin/predictions` (POST) or admin panel
2. **Fields required**:
   - `title` (question)
   - `options` (array, e.g., `["Yes", "No"]`)
   - `entryFeeMyst` (MYST fee to bet)
   - `endsAt` (expiration date)
   - `category` (optional: "CRYPTO", "POLITICS", etc.)
3. **Status**: Starts as `"ACTIVE"` (can be `DRAFT`, `PAUSED`, `RESOLVED`, `CANCELLED`)
4. **File**: `src/web/pages/api/admin/predictions/index.ts` - `createPrediction()`

### How a User Joins and Places a Prediction
1. **Browse**: User visits `/predictions` → sees list of active markets
2. **Select**: Clicks prediction → `/predictions/[id]` shows details
3. **Bet**: User enters MYST amount → clicks "Place Bet" → calls `/api/predictions/[id]/bet`
4. **Bet Logic** (`src/web/pages/api/predictions/[id]/bet.ts`):
   - Validates MYST balance
   - Creates `Bet` record (one per user per prediction)
   - Debits MYST from user (`MystTransaction` with type `"spend_bet"`)
   - Updates prediction pools (`mystPoolYes` or `mystPoolNo` increments)
   - **NO FEE AT BET TIME** - entire bet goes to pool
5. **Result**: Bet is recorded, user sees updated balance

### How Results are Resolved and Winners Paid
1. **Admin resolves**: Admin calls `/api/predictions/[id]/resolve` (POST) with `winningOption`
2. **Resolution Logic** (`src/web/pages/api/predictions/[id]/resolve.ts`):
   - Marks prediction as `resolved: true`, `status: "RESOLVED"`
   - **Fee Calculation**: 10% of **LOSING SIDE ONLY** (not total pool)
     - Example: YES=4000, NO=6000, NO wins → Fee = 10% of 4000 = 400 MYST
   - **Winner Payout**: `(totalPool - fee)` distributed proportionally
     - Each winner gets: `(their_bet / winning_side_total) * win_pool`
   - **Fee Distribution** (from 400 MYST fee):
     - 15% (60 MYST) → Leaderboard pool
     - 10% (40 MYST) → Referral pool (for weekly leaderboard)
     - 5% (20 MYST) → Wheel pool
     - 70% (280 MYST) → Treasury
   - Creates `MystTransaction` records for each winner (type `"win"`)
   - Updates `Bet.mystPayout` field
3. **Files**:
   - `src/web/pages/api/predictions/[id]/resolve.ts` - Main resolution logic
   - `src/web/lib/myst-service.ts` - Pool update functions

---

## Revenue and Revenue Sharing Logic

### Platform Fees
- **When**: Only on prediction resolution (NOT at bet time)
- **Amount**: 10% of losing side's total MYST
- **Calculation**: `src/web/pages/api/predictions/[id]/resolve.ts` line 109
  ```typescript
  const platformFee = losingSideTotal * 0.10;
  ```

### Fee Distribution (from platform fee)
When a prediction resolves, the platform fee is split:
- **15%** → Leaderboard pool (`PoolBalance` id: `"leaderboard"`)
- **10%** → Referral pool (for weekly referral leaderboard rewards)
- **5%** → Wheel pool (`PoolBalance` id: `"wheel"`)
- **70%** → Treasury (`PoolBalance` id: `"treasury"`)

**File**: `src/web/pages/api/predictions/[id]/resolve.ts` lines 112-116

### Referral Revenue
- **When**: User spends MYST (bets, campaign fees, etc.)
- **Calculation**: `src/web/lib/myst-service.ts` - `spendMyst()` function
- **Rates**:
  - **Level 1 (direct referrer)**: 8% of spend amount
  - **Level 2 (indirect referrer)**: 2% of spend amount
- **Storage**:
  - `ReferralEvent` table tracks each spend event
  - `MystTransaction` records created for referrers (type `"referral_reward_l1"` or `"referral_reward_l2"`)
- **Weekly Distribution**: 10% of platform fees go to referral leaderboard (top referrers get rewards weekly)

**Files**:
- `src/web/lib/myst-service.ts` lines 399-542 - `spendMyst()` function
- `src/web/pages/api/predictions/[id]/bet.ts` - Calls spend logic when betting

### Spending Splits (when user spends MYST)
When a user spends MYST (e.g., on a bet), the amount is split:
- **15%** → Leaderboard pool
- **10%** → Referral pool (funds L1/L2 rewards)
- **5%** → Wheel pool
- **70%** → Treasury

**File**: `src/web/lib/myst-service.ts` lines 424-428

### Important Tables
- **`MystTransaction`**: All MYST movements (credits/debits)
  - Types: `"spend_bet"`, `"win"`, `"referral_reward_l1"`, `"referral_reward_l2"`, `"onboarding_bonus"`, etc.
- **`ReferralEvent`**: Tracks MYST spending that triggers referral rewards
- **`PoolBalance`**: Tracks pool balances (leaderboard, referral, wheel, treasury)
- **`LeaderboardReward`**: Weekly rewards for top users (pending/paid status)

---

## Existing Automation

### Cron Jobs (in Bot Process)
**Location**: `src/bot/src/index.ts` lines 180-231

1. **Daily Tier Updates** (00:00 UTC)
   - Updates user tiers based on points
   - Cron: `'0 0 * * *'`
   - Function: `updateTier()` from `utils/tiers.ts`

2. **Remove `new_to_crypto` Flag** (01:00 UTC)
   - Removes flag from users inactive for 365 days
   - Cron: `'0 1 * * *'`

3. **Update Leaderboards** (02:00 UTC)
   - Updates campaign leaderboards
   - Cron: `'0 2 * * *'`
   - Note: Logic in `utils/leaderboard.ts`

**Important**: These cron jobs run in the **bot process** (`src/bot/`), NOT on Vercel. The bot needs to run as a persistent service (not serverless).

### No Existing Automation For:
- ❌ Auto-creating recurring markets
- ❌ Auto-settling expired markets
- ❌ Sending bulk Telegram messages
- ❌ Weekly leaderboard reward distribution

---

## Main Data Models (Supabase Tables)

### User
**Table**: `User`
- `id` (String, CUID) - Primary key
- `telegramId` (String, unique) - Telegram user ID
- `username`, `firstName`, `lastName`, `photoUrl` - Profile data
- `points` (Int) - Experience points (aXP)
- `tier` (String) - User tier (e.g., "Seeker_L1", "Mystic_L2")
- `credibilityScore` (Float) - Review-based score
- `referrerId` (String?) - Who referred this user
- `referralCode` (String, unique) - Unique referral code
- `tonAddress` (String?) - TON wallet for withdrawals
- **Relations**: `bets`, `mystTransactions`, `referrals`, `campaignsProgress`

### Prediction
**Table**: `Prediction`
- `id` (String, CUID) - Primary key
- `title` (String) - Question text
- `options` (String[]) - Array of options (e.g., `["Yes", "No"]`)
- `status` (String) - "DRAFT", "ACTIVE", "PAUSED", "RESOLVED", "CANCELLED"
- `entryFeeMyst` (Float) - MYST fee to bet
- `mystPoolYes` (Float) - Total MYST bet on "Yes"
- `mystPoolNo` (Float) - Total MYST bet on "No"
- `resolved` (Boolean) - Whether resolved
- `winningOption` (String?) - Winning option if resolved
- `endsAt` (DateTime?) - Expiration date
- `participantCount` (Int) - Number of bettors
- **Relations**: `bets`

### Bet
**Table**: `Bet`
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `predictionId` (String) - Foreign key to Prediction
- `option` (String) - Which option user bet on
- `mystBet` (Float) - MYST amount bet
- `mystPayout` (Float?) - Payout received (filled on resolution)
- `starsBet`, `pointsBet` (Int) - Legacy betting (backwards compatibility)
- **Unique**: One bet per user per prediction

### MystTransaction
**Table**: `MystTransaction`
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `type` (String) - Transaction type: `"spend_bet"`, `"win"`, `"referral_reward_l1"`, `"referral_reward_l2"`, `"onboarding_bonus"`, etc.
- `amount` (Float) - Positive = credit, negative = debit
- `meta` (JSON?) - Additional data (predictionId, referenceId, etc.)
- `createdAt` (DateTime)
- **Balance**: User balance = SUM(amount) for that user

### ReferralEvent
**Table**: `ReferralEvent`
- `id` (String, CUID) - Primary key
- `userId` (String) - User who spent MYST
- `referrerLevel1Id` (String?) - Direct referrer
- `referrerLevel2Id` (String?) - Indirect referrer
- `rewardLevel1` (Float) - MYST rewarded to L1
- `rewardLevel2` (Float) - MYST rewarded to L2
- `mystSpent` (Float) - Amount spent that triggered this
- `spendType` (String) - "bet", "campaign_fee", "boost"
- `referenceId` (String?) - Related prediction/campaign ID

### Campaign
**Table**: `Campaign`
- `id` (String, CUID) - Primary key
- `name` (String) - Campaign name
- `status` (String) - "DRAFT", "ACTIVE", "PAUSED", "ENDED"
- `mystFee` (Float) - MYST fee to join
- `startAt`, `endsAt` (DateTime) - Campaign period
- `winnerCount` (Int) - Number of winners (25, 50, or 100)
- **Relations**: `tasks`, `progress`, `winners`

### PoolBalance
**Table**: `PoolBalance`
- `id` (String) - Primary key (values: "leaderboard", "referral", "wheel", "treasury")
- `balance` (Float) - Current balance
- `updatedAt` (DateTime)

### LeaderboardReward
**Table**: `LeaderboardReward`
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `weekId` (String) - Week identifier (e.g., "2025-W48")
- `category` (String) - "top_spender", "top_referrer", "top_campaign"
- `rank` (Int) - Rank in category
- `rewardUsd` (Float) - Reward amount in USD
- `requiredMyst` (Float) - MYST user must burn to claim
- `burnedMyst` (Float) - Actual MYST burned
- `status` (String) - "pending_burn", "ready_for_payout", "paid"

### WithdrawalRequest
**Table**: `WithdrawalRequest`
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `tonAddress` (String) - TON wallet address
- `mystRequested` (Float) - MYST requested
- `mystFee` (Float) - 2% fee
- `mystBurn` (Float) - Amount burned
- `usdNet` (Float) - Net USD value
- `tonAmount` (Float) - TON to send
- `status` (String) - "pending", "paid", "rejected"
- `txHash` (String?) - TON transaction hash

### Deposit
**Table**: `Deposit`
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `tonAmount` (Float) - TON received
- `mystEstimate` (Float) - MYST to credit (1 USDT = 50 MYST)
- `mystCredited` (Float) - Actual MYST credited (0 until confirmed)
- `memo` (String) - Deposit memo (format: "AKARI:<userId>")
- `status` (String) - "pending", "confirmed", "declined"
- `txHash` (String?) - TON transaction hash

---

## Suggested Automation (Simple & Scalable)

### 1. Auto-Create Recurring Markets

**Where**: Create new file `src/web/pages/api/cron/create-markets.ts`

**How to Trigger**: 
- **Option A (Simple)**: Vercel Cron Jobs (add to `vercel.json`)
  ```json
  {
    "crons": [{
      "path": "/api/cron/create-markets",
      "schedule": "0 0 * * *"
    }]
  }
  ```
- **Option B**: External cron service (cron-job.org, EasyCron) calls the endpoint

**What It Does**:
- Check `WeeklyConfig` table for current week
- Create daily/weekly predictions based on template
- Use existing `Prediction` model
- Reuse: `prisma.prediction.create()` from `src/web/pages/api/admin/predictions/index.ts`

**Files to Create**:
- `src/web/pages/api/cron/create-markets.ts`
- Add templates in code (e.g., "Daily BTC price prediction")

**Reuse**:
- `Prediction` model
- Admin prediction creation logic

---

### 2. Auto-Settle Expired Markets

**Where**: Create new file `src/web/pages/api/cron/settle-expired.ts`

**How to Trigger**: Vercel Cron Job (daily at 01:00 UTC)
```json
{
  "path": "/api/cron/settle-expired",
  "schedule": "0 1 * * *"
}
```

**What It Does**:
- Query `Prediction` table: `WHERE resolved = false AND endsAt < NOW()`
- For each expired prediction:
  - If no bets: Mark as `CANCELLED`
  - If has bets: Auto-resolve based on rule (e.g., "No" wins by default, or use external API for price data)
- Reuse: `resolvePrediction()` logic from `src/web/pages/api/predictions/[id]/resolve.ts`

**Files to Create**:
- `src/web/pages/api/cron/settle-expired.ts`

**Reuse**:
- `src/web/pages/api/predictions/[id]/resolve.ts` - Resolution logic
- `Prediction` model

**Note**: For price-based markets, you'd need to integrate with a price API (CoinGecko, Binance) to determine winner.

---

### 3. Send Telegram Messages to Active Users

**Where**: Create new file `src/web/pages/api/cron/send-notifications.ts`

**How to Trigger**: Vercel Cron Job (daily at 09:00 UTC)
```json
{
  "path": "/api/cron/send-notifications",
  "schedule": "0 9 * * *"
}
```

**What It Does**:
- Query `User` table: `WHERE hasSeenBotWelcome = true` (users who started bot)
- Filter by `allowAnnouncements = true` (respect user preferences)
- Send messages via Telegram Bot API
- Reuse: `src/web/lib/telegram-bot.ts` - `sendMessage()` function

**Files to Create**:
- `src/web/pages/api/cron/send-notifications.ts`

**Reuse**:
- `User` model (has `telegramId` field)
- Telegram Bot API (via Grammy.js or direct HTTP)
- `src/web/lib/telegram-bot.ts` - Bot instance

**Message Types**:
- New prediction alerts
- Campaign reminders
- Weekly leaderboard updates
- Withdrawal confirmations

**Rate Limiting**: Telegram allows 30 messages/second. Batch sends with delays if needed.

---

### Implementation Notes

**Vercel Cron Jobs**:
- Add to `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/create-markets",
        "schedule": "0 0 * * *"
      },
      {
        "path": "/api/cron/settle-expired",
        "schedule": "0 1 * * *"
      },
      {
        "path": "/api/cron/send-notifications",
        "schedule": "0 9 * * *"
      }
    ]
  }
  ```
- Requires Vercel Pro plan ($20/month) for cron jobs
- **Alternative**: Use external cron service (free) to call endpoints

**Security**:
- Add authentication to cron endpoints:
  ```typescript
  const cronSecret = req.headers['authorization'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  ```

**Scaling**:
- Current setup (Vercel + Supabase) can handle thousands of users
- For millions: Consider queue system (BullMQ, AWS SQS) for message sending
- Database indexes already exist on key fields (`userId`, `createdAt`, `status`)

---

## Summary

**What's Built**:
✅ Prediction markets with MYST betting
✅ Revenue sharing (referrals, leaderboards, treasury)
✅ Campaign system with tasks
✅ Telegram bot integration
✅ MYST token economy
✅ Admin panel
✅ Daily cron jobs (tier updates, leaderboards)

**What's Missing**:
❌ Auto-create recurring markets
❌ Auto-settle expired markets
❌ Bulk Telegram notifications
❌ Weekly reward distribution automation

**Recommended Next Steps**:
1. Add Vercel Cron Jobs for market creation/settlement
2. Create notification system for active users
3. Add weekly leaderboard reward snapshot/payout automation

