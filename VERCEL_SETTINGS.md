# ⚙️ Vercel Project Settings

## Critical Configuration

To fix the "No Next.js version detected" error, you **MUST** configure these settings in your Vercel Dashboard:

### Go to: Project Settings → General → Root Directory

Set **Root Directory** to: `src/web`

This tells Vercel where your Next.js app is located.

### Alternative: Keep Root as `.` but configure Build Settings

If you want to keep root as `.` (project root), configure:

1. **Root Directory**: `.` (project root)
2. **Framework Preset**: **Other** (not Next.js)
3. **Build Command**: `pnpm install && pnpm exec prisma generate --schema=./prisma/schema.prisma && cd src/web && pnpm install && pnpm build`
4. **Output Directory**: `src/web/.next`
5. **Install Command**: `pnpm install`

## Recommended Settings

### Option 1: Root Directory = `src/web` (Easiest)

- **Root Directory**: `src/web`
- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: Leave default (or: `pnpm install && pnpm build`)
- **Output Directory**: Leave default (`.next`)
- **Install Command**: `cd ../.. && pnpm install && pnpm exec prisma generate --schema=./prisma/schema.prisma`

### Option 2: Root Directory = `.` (Current)

- **Root Directory**: `.`
- **Framework Preset**: **Other**
- **Build Command**: `pnpm install && pnpm exec prisma generate --schema=./prisma/schema.prisma && cd src/web && pnpm install && pnpm build`
- **Output Directory**: `src/web/.next`
- **Install Command**: `pnpm install`

## Why This Error Happens

Vercel checks for Next.js in the `package.json` at the root directory. Since your Next.js is in `src/web/package.json`, Vercel can't find it unless you:
1. Set Root Directory to `src/web`, OR
2. Use "Other" framework and specify build commands manually

## After Updating Settings

1. Save the settings
2. Vercel will automatically trigger a new deployment
3. The build should now succeed

---

**⚠️ IMPORTANT**: You must update these settings in the Vercel Dashboard. The `vercel.json` file alone won't fix this - you need to set the Root Directory in the project settings!

