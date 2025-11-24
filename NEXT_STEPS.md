# 🚀 Next Steps to Get Your Bot Running

## Step 1: Complete Prisma Database Setup

Run these commands **one at a time** in PowerShell:

```powershell
# Navigate to bot directory
cd "C:\Users\Muaz\Desktop\AKARI Mystic Club\src\bot"

# 1. Push schema to Supabase database
pnpm exec prisma db push --schema="..\..\prisma\schema.prisma"

# 2. Generate Prisma Client (required for code to work)
pnpm exec prisma generate --schema="..\..\prisma\schema.prisma"

# 3. Seed database with tiers
cd ..\..
pnpm prisma:seed
```

**Expected output:**
- ✅ Schema pushed successfully
- ✅ Prisma Client generated
- ✅ Tiers seeded

---

## Step 2: Start the Bot and Web App

Once Prisma is set up, start everything:

```powershell
# From project root
cd "C:\Users\Muaz\Desktop\AKARI Mystic Club"
pnpm dev
```

This will start:
- 🤖 **Bot** in polling mode (listening for Telegram commands)
- 🌐 **Web App** on http://localhost:3000

**You should see:**
```
🤖 Bot started in polling mode
Next.js dev server running on http://localhost:3000
```

---

## Step 3: Test Your Bot

1. **Open Telegram** on your phone or desktop
2. **Search for your bot** using the username you set up with BotFather
3. **Send `/start`** command
4. **Complete the onboarding:**
   - Select language (English/Spanish)
   - Choose interests
   - Enter wallets (or skip)
   - See the main menu

---

## Troubleshooting

### If Prisma commands fail:
- Make sure `.env` file exists in `prisma` folder (we copied it there)
- Check that `DATABASE_URL` is correct in `.env`
- Try running from `src\bot` directory

### If bot doesn't start:
- Check that `TELEGRAM_BOT_TOKEN` is correct in `.env`
- Make sure no other process is using port 3000
- Check for error messages in the terminal

### If you get "module not found" errors:
- Run `pnpm install` again
- Make sure you're in the project root

---

## Quick Command Reference

```powershell
# Setup Prisma (run once)
cd src\bot
pnpm exec prisma db push --schema="..\..\prisma\schema.prisma"
pnpm exec prisma generate --schema="..\..\prisma\schema.prisma"
cd ..\..
pnpm prisma:seed

# Start development (run every time)
pnpm dev

# Stop: Press Ctrl+C in the terminal
```

---

## What Happens Next?

After setup:
1. ✅ Bot will respond to `/start` command
2. ✅ Users can complete onboarding
3. ✅ Mini App pages will work (profile, tasks, leaderboard)
4. ✅ Database will store all user data in Supabase

**You're almost there!** Just complete the Prisma setup and you're ready to go! 🎉

