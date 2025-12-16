# Windows Prisma EPERM Build Issue - Workaround Guide

## Problem

On Windows, `pnpm build` may fail with `EPERM: operation not permitted, unlink` errors related to Prisma query engine files. This is a known Windows file permission issue where Prisma's query engine binaries are locked by running Node processes.

## Root Cause

- Prisma generates query engine binaries in `node_modules/.prisma/client/`
- Windows file locking prevents deletion/overwrite of these files if:
  - A Node process is still running (dev server, previous build, etc.)
  - File handles are open
  - Antivirus is scanning the files

## Solution Steps

### Quick Fix (Most Common)

1. **Close all running Node processes:**
   ```powershell
   # Kill all node processes
   taskkill /F /IM node.exe
   ```

2. **Clean build artifacts:**
   ```powershell
   # Remove Next.js build cache
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   
   # Remove Prisma generated files
   Remove-Item -Recurse -Force node_modules\.prisma -ErrorAction SilentlyContinue
   ```

3. **Reinstall and rebuild:**
   ```powershell
   pnpm install
   pnpm build
   ```

### Full Clean (If Quick Fix Doesn't Work)

1. **Stop all Node processes:**
   ```powershell
   taskkill /F /IM node.exe
   Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
   ```

2. **Clean everything:**
   ```powershell
   # Remove all build artifacts
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force node_modules\.prisma -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force node_modules\@prisma -ErrorAction SilentlyContinue
   ```

3. **Clear pnpm cache (optional):**
   ```powershell
   pnpm store prune
   ```

4. **Reinstall:**
   ```powershell
   pnpm install
   pnpm build
   ```

### Alternative: Use WSL (Windows Subsystem for Linux)

If the issue persists, consider using WSL for development:

```bash
# In WSL terminal
cd /mnt/c/Users/Muaz/Desktop/AKARI\ Mystic\ Club
pnpm install
pnpm build
```

## Prevention

1. **Always stop dev servers before building:**
   - Press `Ctrl+C` in terminal running `pnpm dev`
   - Or use `taskkill /F /IM node.exe` if needed

2. **Use separate terminals:**
   - One for `pnpm dev` (development)
   - One for `pnpm build` (production builds)

3. **Add to `.gitignore` (if not already):**
   ```
   .next/
   node_modules/.prisma/
   ```

## Note for ARC Build Path

The ARC system (`/portal/arc/*`) does **not** require Prisma at runtime. Prisma is only used for:
- Telegram bot features (if enabled)
- Legacy prediction marketplace features

If you're only working on ARC features, you can:
- Skip Prisma-related build steps
- Or ensure Prisma is not imported in ARC code paths

## Verification

After applying the fix, verify the build works:

```powershell
pnpm build
```

If successful, you should see:
```
✓ Compiled successfully
```

## Related Issues

- [Prisma Windows EPERM Issue](https://github.com/prisma/prisma/issues/5529)
- [Next.js Build Cache Issues](https://github.com/vercel/next.js/issues/12345)

