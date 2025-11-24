# 🧪 Testing Checklist - AKARI Mystic Bot

## ✅ Project Status: READY FOR TESTING

### Core Components Status

#### ✅ Bot Handlers (11/11)
- ✅ start.ts - Onboarding conversation
- ✅ profile.ts - Profile command
- ✅ tasks.ts - Campaign tasks
- ✅ review.ts - Review system
- ✅ campaigns.ts - Campaign creation
- ✅ predictions.ts - Prediction betting
- ✅ surveys.ts - Survey management
- ✅ leaderboards.ts - Leaderboard views
- ✅ group.ts - Group integration
- ✅ admin.ts - Admin commands
- ✅ deleteuser.ts - GDPR deletion

#### ✅ Web Pages (6/6)
- ✅ _app.tsx - Next.js app wrapper
- ✅ index.tsx - Home redirect
- ✅ profile.tsx - Profile dashboard
- ✅ tasks.tsx - Tasks list
- ✅ leaderboard.tsx - Leaderboard view
- ✅ survey/[id].tsx - Survey form

#### ✅ API Routes (6/6)
- ✅ webhook.ts - Telegram webhook
- ✅ profile/[userId].ts - User profile API
- ✅ campaigns.ts - Campaigns API
- ✅ leaderboard.ts - Leaderboard API
- ✅ survey/[id].ts - Survey API (GET/POST)
- ✅ x-callback.ts - X OAuth callback

#### ✅ Utilities (7/7)
- ✅ prisma.ts - Database client
- ✅ tiers.ts - Tier management
- ✅ stars.ts - Stars payments
- ✅ leaderboard.ts - Leaderboard computation
- ✅ verifications.ts - Verification logic
- ✅ twitter.ts - Twitter API
- ✅ i18n.ts - Internationalization

#### ✅ Database
- ✅ Prisma schema complete
- ✅ All models defined
- ✅ Relationships configured
- ✅ Seed file ready

#### ✅ Configuration
- ✅ .env file configured
- ✅ vercel.json ready
- ✅ TypeScript configs
- ✅ Package.json files

---

## 🧪 Testing Steps

### 1. Local Testing (Bot)

```powershell
# Start bot
cd src\bot
pnpm dev
```

**Test Commands:**
- [ ] `/start` - Should show welcome and start onboarding
- [ ] Language selection (English/Spanish)
- [ ] Interests selection (multi-select)
- [ ] X OAuth connection (or skip)
- [ ] Wallet input (TON & EVM)
- [ ] Onboarding completion (5 EP bonus)
- [ ] `/profile` - View profile
- [ ] `/tasks` - List campaigns
- [ ] `/leaderboard` - View leaderboard
- [ ] `/review @username 5 Great!` - Review user
- [ ] `/credibility` - Group stats

### 2. Local Testing (Web App)

```powershell
# Start web app
cd src\web
pnpm dev
```

**Test Pages:**
- [ ] http://localhost:3000/profile?userId=YOUR_TELEGRAM_ID
- [ ] http://localhost:3000/tasks
- [ ] http://localhost:3000/leaderboard
- [ ] http://localhost:3000/survey/[id] (if survey exists)

### 3. Database Testing

```powershell
# Push schema
pnpm prisma:push

# Generate client
pnpm prisma:generate

# Seed data
pnpm prisma:seed

# Open Prisma Studio
pnpm prisma:studio
```

**Verify:**
- [ ] Tiers seeded (6 categories, multiple levels)
- [ ] Admin user created (if ADMIN_TELEGRAM_ID set)
- [ ] Can query users, campaigns, predictions

### 4. Production Testing (After Vercel Deploy)

**Prerequisites:**
- [ ] Vercel deployment successful
- [ ] Environment variables set in Vercel
- [ ] Root Directory set to `src/web` (or configured properly)
- [ ] Database accessible from Vercel

**Test:**
- [ ] Bot responds to `/start` via webhook
- [ ] Mini App opens from Telegram
- [ ] Profile page loads with user data
- [ ] API routes respond correctly
- [ ] Webhook receives updates

---

## ⚠️ Known Issues / Limitations

### 1. Vercel Configuration
- **Issue**: Root Directory must be set to `src/web` in Vercel dashboard
- **Status**: Documented in VERCEL_SETTINGS.md
- **Action**: Update in Vercel dashboard

### 2. X OAuth
- **Issue**: Requires public URL for callback
- **Status**: Works locally with ngrok, needs Vercel URL in production
- **Action**: Set VERCEL_URL in environment variables

### 3. Stars Payments
- **Issue**: Requires payment provider token
- **Status**: Placeholder in code
- **Action**: Configure PAYMENT_PROVIDER_TOKEN when ready

### 4. Cron Jobs
- **Issue**: Cron jobs run in bot process (local only)
- **Status**: For production, use Vercel Cron or separate service
- **Action**: Set up Vercel Cron jobs

### 5. Admin Commands
- **Issue**: Some admin commands need proper parsing
- **Status**: Basic implementation
- **Action**: Test and refine as needed

---

## 🚀 Ready to Test Checklist

### Pre-Testing Setup
- [x] All code files present
- [x] Database schema ready
- [x] Environment variables configured
- [x] Dependencies installed
- [ ] Database schema pushed to Supabase
- [ ] Prisma Client generated
- [ ] Database seeded with tiers

### Local Testing Ready
- [x] Bot can start
- [x] Web app can start
- [x] API routes configured
- [ ] Database connection working
- [ ] Bot token valid

### Production Ready
- [x] Code pushed to GitHub
- [ ] Vercel project configured
- [ ] Root Directory set correctly
- [ ] Environment variables in Vercel
- [ ] Webhook URL set

---

## 📝 Test Results Template

```
Date: __________
Tester: __________

Bot Commands:
- /start: [ ] Pass [ ] Fail - Notes: __________
- /profile: [ ] Pass [ ] Fail - Notes: __________
- /tasks: [ ] Pass [ ] Fail - Notes: __________

Web Pages:
- Profile: [ ] Pass [ ] Fail - Notes: __________
- Tasks: [ ] Pass [ ] Fail - Notes: __________
- Leaderboard: [ ] Pass [ ] Fail - Notes: __________

API Routes:
- /api/webhook: [ ] Pass [ ] Fail - Notes: __________
- /api/profile/:userId: [ ] Pass [ ] Fail - Notes: __________

Issues Found:
1. __________
2. __________
```

---

## ✅ Conclusion

**Status: READY FOR TESTING** ✅

All core components are implemented and configured. The project is ready for:
1. Local testing (bot + web app)
2. Database setup and seeding
3. Production deployment testing

**Next Steps:**
1. Push database schema: `pnpm prisma:push`
2. Generate Prisma Client: `pnpm prisma:generate`
3. Seed database: `pnpm prisma:seed`
4. Start bot: `pnpm --filter bot dev`
5. Start web app: `pnpm --filter web dev`
6. Test in Telegram with `/start`

---

**Last Updated**: $(Get-Date)

