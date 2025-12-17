# Quick Setup: Fix "Missing Supabase configuration" Error

## The Problem
You're seeing: **"500 Missing Supabase configuration"**

This means your environment variables are not set up.

## Quick Fix (5 minutes)

### Step 1: Create `.env.local` file

**Location:** `src/web/.env.local` (NOT in the root directory!)

Create this file if it doesn't exist.

### Step 2: Get Your Supabase Credentials

1. Go to https://app.supabase.com
2. Select your project (or create one)
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (click eye icon) → `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Add to `.env.local`

```bash
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Database (if using Prisma)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

**Important:**
- Replace `your-project-id` with your actual Supabase project ID
- Replace the service role key with your actual key
- No quotes around values
- No spaces around `=`

### Step 4: Restart Dev Server

**CRITICAL:** You MUST restart your dev server for changes to take effect!

```bash
# Stop the server (Ctrl+C)
# Then restart:
cd src/web
npm run dev
# or
pnpm dev
```

### Step 5: Verify

After restarting, refresh your browser. The error should be gone!

## Still Not Working?

### Check File Location
- ✅ File should be: `src/web/.env.local`
- ❌ NOT: `.env.local` (root)
- ❌ NOT: `src/.env.local`

### Check Variable Names
- ✅ `NEXT_PUBLIC_SUPABASE_URL` (exact spelling, case-sensitive)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (exact spelling, case-sensitive)
- ❌ No typos, no extra spaces

### Check File Format
```bash
# ✅ CORRECT:
NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ❌ WRONG (quotes not needed):
NEXT_PUBLIC_SUPABASE_URL="https://abc.supabase.co"

# ❌ WRONG (spaces around =):
NEXT_PUBLIC_SUPABASE_URL = https://abc.supabase.co

# ❌ WRONG (comments on same line):
NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co # my project
```

## Need More Help?

See `SUPABASE_LOCAL_SETUP.md` for detailed instructions.

