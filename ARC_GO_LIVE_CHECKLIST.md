# ARC Arena Backfill - Go Live Checklist

**Purpose:** Verification steps to ensure approved leaderboard projects appear in Live/Upcoming sections

## Pre-Flight Checks

Before deploying, verify repository is clean:

```bash
# Check for forbidden patterns
pnpm guard:forbidden

# Full verification (guard + lint + build)
pnpm verify
```

## Quick Start

### 1. Run Backfill (One-Time Fix)

**Recommended Strategy:**
Run backfill in production with `limit=50` until `createdCount` and `updatedCount` are both 0. See detailed steps in the "Via API (curl)" section below.

**Via Admin UI:**
1. Navigate to `/portal/admin/arc/leaderboard-requests`
2. Click "Backfill Arenas (Dry Run)" to preview changes
3. Review the summary (eligible projects, what would be created/updated)
4. Click "Backfill Arenas (Run)" to execute
5. Verify summary shows created/updated counts
6. If counts > 0, repeat step 4 until all are processed

**Via API (curl):**

Use your production domain for `<PROD_DOMAIN>` and your session token for `<SESSION_TOKEN>`.

Dry run (preview only):
```bash
curl -X POST "https://<PROD_DOMAIN>/api/portal/admin/arc/backfill-arenas?dryRun=1&limit=50" \
  -b "akari_session=<SESSION_TOKEN>" \
  -H "Content-Type: application/json"
```

Real run:
```bash
curl -X POST "https://<PROD_DOMAIN>/api/portal/admin/arc/backfill-arenas?limit=50" \
  -b "akari_session=<SESSION_TOKEN>" \
  -H "Content-Type: application/json"
```

**Recommended Backfill Strategy:**
1. Run dry-run with `limit=50` to preview changes
2. Run real execution with `limit=50`
3. Check response: if `createdCount > 0` or `updatedCount > 0`, repeat step 2
4. Continue until both `createdCount` and `updatedCount` are 0

**Response Format:**
```json
{
  "ok": true,
  "dryRun": false,
  "summary": {
    "totalEligible": 10,
    "scannedCount": 10,
    "createdCount": 5,
    "updatedCount": 2,
    "skippedCount": 3,
    "errors": []
  }
}
```

### 2. Verify Project Appears (Example: Bitcoin)

**SQL Query:**
```sql
SELECT 
  p.slug,
  p.name,
  p.arc_active,
  p.arc_access_level,
  apa.application_status,
  apf.option2_normal_unlocked,
  apf.leaderboard_enabled,
  a.id as arena_id,
  a.slug as arena_slug,
  a.status as arena_status,
  a.starts_at,
  a.ends_at
FROM projects p
LEFT JOIN arc_project_access apa ON apa.project_id = p.id
LEFT JOIN arc_project_features apf ON apf.project_id = p.id
LEFT JOIN arenas a ON a.project_id = p.id
WHERE p.slug = 'bitcoin' OR p.name ILIKE '%bitcoin%'
ORDER BY a.created_at DESC;
```

**Expected Results:**
- `arc_active = true`
- `arc_access_level = 'leaderboard'`
- `application_status = 'approved'`
- `option2_normal_unlocked = true`
- `leaderboard_enabled = true`
- `arena_status = 'active'`
- Arena `starts_at` and `ends_at` set (if dates provided)

**API Verification:**
Use your production domain for `<PROD_DOMAIN>` and your session token for `<SESSION_TOKEN>`.

```bash
curl "https://<PROD_DOMAIN>/api/portal/arc/live-leaderboards" \
  -b "akari_session=<SESSION_TOKEN>"
```

**Expected Response:**
- Project appears in `leaderboards` array (if current time is within date range)
- OR appears in `upcoming` array (if start date is in future)
- Arena slug matches pattern: `{project-slug}-leaderboard` or `{project-slug}-leaderboard-{N}`

### 3. Validate Future Approvals

**Test Flow:**
1. Create a new leaderboard request (pending status)
2. Approve the request via `/portal/admin/arc/leaderboard-requests`
3. Immediately after approval, verify:

**SQL Check:**
```sql
SELECT 
  a.id,
  a.slug,
  a.status,
  a.starts_at,
  a.ends_at,
  a.project_id
FROM arenas a
WHERE a.project_id = '{PROJECT_ID}'
ORDER BY a.created_at DESC
LIMIT 1;
```

**Expected:**
- Arena exists (NOT NULL)
- `status = 'active'`
- `slug` matches pattern: `{project-slug}-leaderboard` (or with numeric suffix)
- Dates match approval form (if provided)

**API Check:**
Use your production domain for `<PROD_DOMAIN>` and your session token for `<SESSION_TOKEN>`.

```bash
curl "https://<PROD_DOMAIN>/api/portal/arc/live-leaderboards" \
  -b "akari_session=<SESSION_TOKEN>"
```

**Expected:**
- Project appears in response immediately after approval

## Troubleshooting

**Issue: Backfill shows errors**
- Check server logs for detailed error messages
- Verify project has `arc_active = true` and `arc_access_level = 'leaderboard'`
- Verify `arc_project_access.application_status = 'approved'`
- Verify `arc_project_features.option2_normal_unlocked = true` and `leaderboard_enabled = true`

**Issue: Approved project not appearing in Live/Upcoming**
- Verify arena exists: `SELECT * FROM arenas WHERE project_id = '{PROJECT_ID}'`
- Verify arena status: `SELECT status FROM arenas WHERE project_id = '{PROJECT_ID}'`
- Verify arena dates (if set): Check `starts_at` and `ends_at` are within expected range
- Check server logs for "REGRESSION GUARD FAILED" messages (indicates arena creation failed)

**Issue: Arena creation fails silently**
- Check server logs for Supabase errors
- Verify project slug is valid (no special characters that break slug generation)
- Verify admin profile ID exists (for `created_by` field)

## Maintenance

**After Go-Live:**
- Monitor server logs for "REGRESSION GUARD FAILED" errors
- Run backfill dry-run periodically to detect missing arenas
- New approvals should automatically create arenas (no manual steps needed)
