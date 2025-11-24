# Quick Setup Guide

## Current Status
✅ Dependencies installed
✅ .env file configured with your credentials
⏳ Prisma database setup needed

## Next Steps (Choose One Method)

### Method 1: Manual Prisma Setup (Recommended)

1. **Load environment and push schema:**
   ```powershell
   cd "C:\Users\Muaz\Desktop\AKARI Mystic Club"
   $env:DATABASE_URL = (Get-Content .env | Select-String "DATABASE_URL").ToString().Split("=", 2)[1]
   cd src\bot
   pnpm exec prisma db push --schema="..\..\prisma\schema.prisma"
   ```

2. **Generate Prisma Client:**
   ```powershell
   pnpm exec prisma generate --schema="..\..\prisma\schema.prisma"
   ```

3. **Seed the database:**
   ```powershell
   cd ..\..
   pnpm prisma:seed
   ```

### Method 2: Use dotenv-cli (Easier)

1. **Install dotenv-cli globally:**
   ```powershell
   npm install -g dotenv-cli
   ```

2. **Run Prisma commands:**
   ```powershell
   cd "C:\Users\Muaz\Desktop\AKARI Mystic Club\src\bot"
   dotenv -e ..\..\.env -- pnpm exec prisma db push --schema="..\..\prisma\schema.prisma"
   dotenv -e ..\..\.env -- pnpm exec prisma generate --schema="..\..\prisma\schema.prisma"
   ```

3. **Seed database:**
   ```powershell
   cd ..\..
   dotenv -e .env -- pnpm prisma:seed
   ```

### Method 3: Copy .env to prisma folder (Quick Fix)

1. **Copy .env to prisma folder:**
   ```powershell
   Copy-Item .env prisma\.env
   ```

2. **Run from prisma folder:**
   ```powershell
   cd prisma
   npx prisma db push
   npx prisma generate
   npx prisma db seed
   ```

## After Prisma Setup

Once Prisma is set up, you can start the bot:

```powershell
cd "C:\Users\Muaz\Desktop\AKARI Mystic Club"
pnpm dev
```

This will start:
- Bot in polling mode (listening for commands)
- Next.js Mini App on http://localhost:3000

## Test the Bot

1. Open Telegram
2. Find your bot (using the token from .env)
3. Send `/start` command
4. Complete the onboarding flow

## Troubleshooting

If you get "DATABASE_URL not found":
- Make sure .env file exists in project root
- Check that DATABASE_URL line doesn't have extra spaces
- Try Method 3 (copy .env to prisma folder)

If Prisma commands fail:
- Make sure you're in the correct directory
- Check that prisma/schema.prisma exists
- Verify DATABASE_URL is correct in .env

