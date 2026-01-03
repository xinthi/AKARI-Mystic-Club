# ARC Migration Verification Checklist

## ✅ Migrations Applied

The following migrations have been applied to your Supabase database:

1. **`20250202_add_arena_kind_and_constraint.sql`**
   - Added `kind` column to `arenas` table
   - Created unique constraint `uniq_ms_arena_per_project`
   - Set existing NULL kind arenas to `'legacy_ms'`

2. **`20250131_arc_admin_approve_rpc.sql`**
   - Updated RPC function `arc_admin_approve_leaderboard_request`
   - Added double-check logic to prevent constraint violations
   - Handles NULL kind arenas (legacy)

## 🔍 Verification Steps

### 1. Verify `kind` Column Exists

Run in Supabase SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'arenas' AND column_name = 'kind';
```

**Expected:** One row with `column_name = 'kind'`, `data_type = 'text'`, `is_nullable = 'YES'`

### 2. Verify Constraint Exists

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname = 'uniq_ms_arena_per_project';
```

**Expected:** One row with the constraint definition

### 3. Verify RPC Function Updated

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected:** Function exists and `prosrc` contains `kind IN ('ms', 'legacy_ms') OR kind IS NULL`

### 4. Check Existing Arenas

```sql
SELECT 
  COUNT(*) as total_arenas,
  COUNT(*) FILTER (WHERE kind IS NULL) as null_kind,
  COUNT(*) FILTER (WHERE kind IN ('ms', 'legacy_ms')) as ms_arenas,
  COUNT(*) FILTER (WHERE kind = 'legacy_ms') as legacy_ms
FROM arenas;
```

**Expected:** `null_kind` should be 0 (all should have kind set)

## 🧪 Testing the Fix

### Test 1: Approve a Leaderboard Request

1. Go to `/portal/admin/arc/leaderboard-requests`
2. Find a pending request for a project
3. Click "Approve"
4. **Expected:** Should succeed without constraint error

### Test 2: Approve Multiple Requests (Same Project)

1. If a project has multiple pending requests
2. Approve them one by one
3. **Expected:** Should update existing arena, not create duplicates

### Test 3: Check Arena Status

After approval, verify:

```sql
SELECT 
  id,
  project_id,
  kind,
  status,
  name,
  starts_at,
  ends_at
FROM arenas
WHERE project_id = '<approved-project-id>'
ORDER BY created_at DESC;
```

**Expected:**
- Only ONE arena with `kind IN ('ms', 'legacy_ms')` per project
- Latest arena has `status = 'active'`
- Older arenas have `status = 'ended'` (if any)

## ✅ Success Criteria

- [ ] `kind` column exists on `arenas` table
- [ ] `uniq_ms_arena_per_project` constraint exists
- [ ] RPC function includes NULL kind handling
- [ ] No NULL kind arenas remain
- [ ] Approval succeeds without constraint error
- [ ] No duplicate MS arenas created

## 🐛 If Issues Persist

### Still Getting Constraint Error?

1. **Check for existing duplicates:**
   ```sql
   SELECT project_id, COUNT(*) as count
   FROM arenas
   WHERE kind IN ('ms', 'legacy_ms') OR kind IS NULL
   GROUP BY project_id
   HAVING COUNT(*) > 1;
   ```

2. **If duplicates found, clean them up:**
   ```sql
   -- Keep the most recent arena per project, delete others
   DELETE FROM arenas a
   USING (
     SELECT project_id, MAX(created_at) as max_created
     FROM arenas
     WHERE kind IN ('ms', 'legacy_ms') OR kind IS NULL
     GROUP BY project_id
   ) b
   WHERE a.project_id = b.project_id
     AND (a.kind IN ('ms', 'legacy_ms') OR a.kind IS NULL)
     AND a.created_at < b.max_created;
   ```

3. **Recreate constraint:**
   ```sql
   DROP INDEX IF EXISTS uniq_ms_arena_per_project;
   CREATE UNIQUE INDEX uniq_ms_arena_per_project 
   ON arenas(project_id) 
   WHERE kind IN ('ms', 'legacy_ms') OR kind IS NULL;
   ```

### RPC Function Not Updated?

If the RPC function still has old logic:

1. Go to Supabase SQL Editor
2. Copy entire contents of `supabase/migrations/20250131_arc_admin_approve_rpc.sql`
3. Paste and run (it uses `CREATE OR REPLACE`, so safe to re-run)

## 📝 Next Steps

After verification:

1. ✅ Test approval flow in UI
2. ✅ Monitor for any constraint errors
3. ✅ Check that arenas are being updated (not duplicated)
4. ✅ Verify UI shows projects and live leaderboards correctly

---

**Status:** Migrations applied ✅  
**Next:** Test approval flow to confirm fix works
