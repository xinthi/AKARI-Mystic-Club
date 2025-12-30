# Mindshare Pipeline Go-Live Checklist

**Date:** 2025-01-XX  
**Status:** Pre-Production

---

## 1. Cron Secret Safety ✅

- [x] **vercel.json verified clean** - No secrets in cron path
  - Path: `/api/portal/cron/mindshare-snapshot` (no `?secret=...`)
  - Schedule: `0 1 * * *` (daily at 01:00 UTC)

- [x] **Cron endpoint security** - Supports multiple auth methods:
  - Primary: `x-vercel-cron` header (Vercel automatic, most secure)
  - Fallback: `Authorization: Bearer <CRON_SECRET>` header
  - Fallback: `x-cron-secret` header
  - Fallback: Query params (for manual testing only)

**Action:** No action needed - cron endpoint is secure.

---

## 2. Production Environment Variables

**Required in Vercel Dashboard → Settings → Environment Variables:**

### Cron Secret
- [ ] `CRON_SECRET` - Secret for cron endpoint authentication

### Mindshare Weights (if missing, system uses neutral fallbacks)
- [ ] `MINDSHARE_W1_POSTS` - Weight for posts count
- [ ] `MINDSHARE_W2_CREATORS` - Weight for unique creators
- [ ] `MINDSHARE_W3_ENGAGEMENT` - Weight for engagement total
- [ ] `MINDSHARE_W4_CT_HEAT` - Weight for CT heat

### Mindshare Multipliers (if missing, system uses neutral 1.0)
- [ ] `MINDSHARE_CREATOR_ORG_FLOOR` - Creator organic score floor
- [ ] `MINDSHARE_CREATOR_ORG_CAP` - Creator organic score cap
- [ ] `MINDSHARE_AUDIENCE_ORG_FLOOR` - Audience organic score floor
- [ ] `MINDSHARE_AUDIENCE_ORG_CAP` - Audience organic score cap
- [ ] `MINDSHARE_ORIGINALITY_FLOOR` - Originality score floor
- [ ] `MINDSHARE_ORIGINALITY_CAP` - Originality score cap
- [ ] `MINDSHARE_SENTIMENT_FLOOR` - Sentiment multiplier floor
- [ ] `MINDSHARE_SENTIMENT_CAP` - Sentiment multiplier cap
- [ ] `MINDSHARE_SMART_FOLLOWERS_FLOOR` - Smart followers boost floor
- [ ] `MINDSHARE_SMART_FOLLOWERS_CAP` - Smart followers boost cap

**Note:** If env vars are missing, system uses neutral fallbacks (multipliers=1.0, weights=0) to prevent secret defaults.

**Action:** Set all environment variables in Vercel Dashboard for production environment.

---

## 3. Backfill Historical Data

**Endpoint:** `POST /api/portal/admin/sentiment/recompute-mindshare`

**Auth:** Superadmin required

**Request:**
```json
{
  "backfillDays": 7
}
```

**Steps:**
1. [ ] Log in as superadmin
2. [ ] Call endpoint: `POST /api/portal/admin/sentiment/recompute-mindshare`
3. [ ] Request body: `{ "backfillDays": 7 }` (or 30 for full month)
4. [ ] Verify response shows snapshots created for all windows and dates
5. [ ] Check logs for any errors

**Expected Response:**
```json
{
  "ok": true,
  "results": [
    {
      "window": "24h",
      "asOfDate": "2025-01-29",
      "totalProjects": 50,
      "snapshotsCreated": 50,
      "snapshotsUpdated": 0,
      "errors": []
    },
    // ... for each window and date
  ]
}
```

**Action:** Run backfill to populate historical snapshots so deltas show immediately.

---

## 4. Supabase Validation

**File:** `supabase/validation/mindshare_sanity_checks.sql`

**Steps:**
1. [ ] Open Supabase SQL Editor
2. [ ] Run all 5 queries from `mindshare_sanity_checks.sql`
3. [ ] Verify results:

### Check 1: Sum of BPS = 10000
- [ ] All rows show `sum_bps = 10000`
- [ ] Status column shows `✅ PASS` for all rows

### Check 2: Latest Snapshot Exists
- [ ] All 4 windows show today's date
- [ ] Status shows `✅ PASS` for all windows

### Check 3: Top Projects
- [ ] Returns top 10 projects by mindshare
- [ ] Values look reasonable

### Check 4: Delta Function Test
- [ ] Returns delta values for projects
- [ ] `delta_1d` and `delta_7d` are calculated correctly

### Check 5: Data Freshness
- [ ] All windows show `days_old = 0`
- [ ] Status shows `✅ FRESH` for all windows

**Action:** Run validation queries and paste any failures here:

```
[Paste validation results if any check fails]
```

---

## 5. QA Testing

### 5.1 Sentiment Page - Mindshare Display

**URL:** `/portal/sentiment`

**Checks:**
- [ ] Page loads without errors
- [ ] Mindshare column (7d) displays for projects (xl+ screens)
- [ ] Mindshare shows as percentage (e.g., "15.00%") and bps (e.g., "1500 bps")
- [ ] Delta badges (7d) show with ChangeIndicator component
- [ ] Projects with no mindshare data show "-" (graceful fallback)
- [ ] No projectId/slug visible in UI (only project names)

**Action:** Verify mindshare displays correctly on sentiment overview page.

### 5.2 ARC Leaderboards

**URL:** `/portal/arc/[project-slug]` (for ARC-enabled projects)

**Checks:**
- [ ] ARC leaderboard pages still load
- [ ] No errors in console
- [ ] Leaderboard data displays correctly
- [ ] No regression from mindshare changes

**Action:** Verify ARC leaderboards still work (no breaking changes).

---

## 6. CI/Local Testing

### 6.1 Guard Script

**Command:** `pnpm guard:forbidden`

**Expected:** 
- ✅ No competitor names found
- ✅ No forbidden mindshare constants found
- ✅ Exit code 0

**Steps:**
- [ ] Run locally: `pnpm guard:forbidden`
- [ ] Verify passes
- [ ] Run in CI (if configured)
- [ ] Verify CI passes

**Action:** Run guard script to ensure no formula disclosure.

### 6.2 Unit Tests

**Command:** `pnpm test` (or `pnpm --filter web test:run`)

**Expected:**
- ✅ All 6 tests pass
- ✅ Sum BPS = 10000
- ✅ Rounding drift handled
- ✅ Empty data handled
- ✅ Zero values handled
- ✅ Single project handled
- ✅ Order preserved

**Steps:**
- [ ] Install dependencies: `pnpm install` (adds vitest)
- [ ] Run tests: `pnpm test`
- [ ] Verify all tests pass
- [ ] Run in CI (if configured)
- [ ] Verify CI passes

**Action:** Run tests to verify normalization logic works correctly.

---

## 7. Production Deployment

### Pre-Deployment
- [ ] All environment variables set in Vercel
- [ ] Guard script passes
- [ ] Tests pass
- [ ] Code reviewed

### Post-Deployment
- [ ] Verify cron job appears in Vercel Dashboard → Cron Jobs
- [ ] Wait for first cron run (or trigger manually)
- [ ] Check Vercel logs for cron execution
- [ ] Verify snapshots created in database
- [ ] Run validation queries
- [ ] Verify UI displays mindshare data

---

## Sign-Off

**Completed By:** _________________  
**Date:** _________________  
**Status:** ☐ READY FOR PRODUCTION  ☐ BLOCKED  ☐ NEEDS FIXES

**Notes:**
```
[Add any blockers or issues here]
```

