# Branch Cleanup Plan

## Current Status

### ✅ Already Merged into Main (Safe to Delete)
1. **`audit/arc-leaderboards-e2e`**
   - Merged via: `1e1e7cb Merge audit/arc-leaderboards-e2e into main`
   - Status: All commits are in main
   - Action: ✅ Safe to delete locally

2. **`feat/arc-ui-reset-v2`**
   - Merged via: `7bb1b5b Merge feat/arc-ui-reset-v2 into main - resolved conflicts`
   - Status: All commits are in main
   - Action: ✅ Safe to delete locally

3. **`feat/arc-ui-v1-1`**
   - Merged via: PR #19 (commit `75a34b2 Feat/arc UI v1 1 (#19)`)
   - Status: All 18 commits are in main (squashed/merged via PR)
   - Action: ✅ Safe to delete locally

4. **`feature/arc-v1`**
   - Merged via: PR #18 (commit `cc7a55c feat: Add Supabase admin client...`)
   - Status: Commit is in main
   - Action: ✅ Safe to delete locally

5. **`feat/arc-page`**
   - Status: No unique commits (already merged)
   - Action: ✅ Safe to delete locally

### 🗑️ Stash to Clean
- `stash@{0}`: Temporary stash from earlier work
- Action: ✅ Safe to drop

## Recommended Actions

### Option 1: Clean Everything (Recommended)
Delete all merged branches and drop stash:
```bash
git branch -d audit/arc-leaderboards-e2e
git branch -d feat/arc-ui-reset-v2
git branch -d feat/arc-ui-v1-1
git branch -d feature/arc-v1
git branch -d feat/arc-page
git stash drop
```

### Option 2: Keep Remote Branches, Delete Local Only
If you want to keep the remote branches on GitHub but clean up locally:
```bash
# Same as Option 1 - local branches only
git branch -d audit/arc-leaderboards-e2e
git branch -d feat/arc-ui-reset-v2
git branch -d feat/arc-ui-v1-1
git branch -d feature/arc-v1
git branch -d feat/arc-page
git stash drop
```

### Option 3: Delete Remote Branches Too
If you want to clean up both local AND remote:
```bash
# Delete local branches
git branch -d audit/arc-leaderboards-e2e
git branch -d feat/arc-ui-reset-v2
git branch -d feat/arc-ui-v1-1
git branch -d feature/arc-v1
git branch -d feat/arc-page

# Delete remote branches (WARNING: This will delete from GitHub)
git push origin --delete audit/arc-leaderboards-e2e
git push origin --delete feat/arc-ui-reset-v2
git push origin --delete feat/arc-ui-v1-1
git push origin --delete feature/arc-v1
git push origin --delete feat/arc-page

# Drop stash
git stash drop
```

## Current Main Branch Status
- ✅ Clean working tree
- ✅ Up to date with origin/main
- ✅ All feature work is merged

## Recommendation
**Option 1** is safest - it only deletes local branches that are already merged. The remote branches on GitHub will remain, so you can always reference them later if needed.

