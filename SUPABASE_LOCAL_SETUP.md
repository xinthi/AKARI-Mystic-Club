# Fixing "500 Missing Supabase configuration" Error

## Problem
You're seeing the error: **"500 Missing Supabase configuration"**

This happens because the required Supabase environment variables are not set in your local development environment.

## Solution: Set Up Environment Variables

### Step 1: Create `.env.local` File

In the `src/web` directory, create a file named `.env.local` (if it doesn't exist).

**Location:** `src/web/.env.local`

### Step 2: Add Required Environment Variables

Add these variables to your `.env.local` file:

```bash
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional: If NEXT_PUBLIC_SUPABASE_URL is not set, this will be used as fallback
SUPABASE_URL=https://your-project-id.supabase.co

# Database (if needed for Prisma)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

### Step 3: Get Your Supabase Credentials

1. **Go to Supabase Dashboard:**
   - Visit https://app.supabase.com
   - Select your project (or create a new one)

2. **Get Supabase URL:**
   - Go to **Settings** → **API**
   - Copy the **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - This goes in `NEXT_PUBLIC_SUPABASE_URL`

3. **Get Service Role Key:**
   - In the same **Settings** → **API** page
   - Under **Project API keys**, find **service_role** key
   - Click the "eye" icon to reveal it, then copy it
   - **⚠️ WARNING:** This key bypasses Row Level Security. Never expose it to the client!
   - This goes in `SUPABASE_SERVICE_ROLE_KEY`

4. **Get Database URL (if needed):**
   - Go to **Settings** → **Database**
   - Under **Connection string**, select **URI** or **Connection pooling**
   - Copy the connection string
   - Replace `[YOUR-PASSWORD]` with your actual database password
   - This goes in `DATABASE_URL`

### Step 4: Verify Your `.env.local` File

Your `.env.local` file should look something like this:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQ1NzgyNDAwLCJleHAiOjE5NjEzNTg0MDB9.abc123def456...
SUPABASE_URL=https://abcdefghijklmnop.supabase.co

# Database (if using Prisma)
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:YOUR_PASSWORD@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true

# Twitter APIs (optional for local dev)
RAPIDAPI_KEY=your-rapidapi-key
TWITTER_API65_AUTH_TOKEN=your-twitter-api65-auth-token
TWITTERAPIIO_API_KEY=your-twitterapiio-api-key
TWITTER_PRIMARY_PROVIDER=rapidapi

# Telegram Bot (optional)
BOT_TOKEN=your-telegram-bot-token
```

### Step 5: Restart Your Development Server

After adding the environment variables:

1. **Stop your dev server** (Ctrl+C if running)
2. **Restart it:**
   ```bash
   cd src/web
   npm run dev
   # or
   pnpm dev
   ```

**Important:** Next.js only reads `.env.local` files when the server starts. You must restart for changes to take effect.

### Step 6: Verify It's Working

1. Open your browser console (F12)
2. Check for any error messages
3. The "500 Missing Supabase configuration" error should be gone
4. You should be able to use features that require Supabase (like user authentication, admin pages, etc.)

## Troubleshooting

### Still Getting the Error?

1. **Check file location:**
   - Make sure `.env.local` is in `src/web/` directory (not in the root)
   - Next.js looks for env files in the same directory as `next.config.js`

2. **Check variable names:**
   - Must be exactly: `NEXT_PUBLIC_SUPABASE_URL` (case-sensitive)
   - Must be exactly: `SUPABASE_SERVICE_ROLE_KEY` (case-sensitive)
   - No extra spaces around the `=` sign

3. **Check file format:**
   - No quotes around values unless they contain spaces
   - One variable per line
   - No comments on the same line as variables (use separate lines)

4. **Restart the server:**
   - Environment variables are only loaded when the server starts
   - Make sure you've restarted after adding the file

5. **Check for typos:**
   - Copy-paste directly from Supabase dashboard to avoid typos
   - Make sure URLs don't have trailing slashes

### Quick Check Script

You can verify your environment variables are loaded by adding this temporarily to any page:

```typescript
// In any component or page
useEffect(() => {
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
}, []);
```

**Note:** Only `NEXT_PUBLIC_*` variables are visible in the browser. Server-side variables like `SUPABASE_SERVICE_ROLE_KEY` will only show as "Set" in server-side code.

## Security Notes

⚠️ **IMPORTANT:**
- **Never commit `.env.local` to git** - it's already in `.gitignore`
- **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to the client/browser
- Only use service role key in API routes (server-side code)
- The `NEXT_PUBLIC_*` prefix makes variables available to the browser (use only for safe values like URLs)

## Alternative: Use `.env` Instead of `.env.local`

If you prefer, you can use `.env` instead of `.env.local`. However, `.env.local` takes precedence and is recommended for local development because:
- It's automatically ignored by git
- It won't conflict with team members' local configs
- It's specific to your local machine

