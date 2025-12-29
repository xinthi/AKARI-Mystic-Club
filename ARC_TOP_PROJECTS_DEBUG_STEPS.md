# Debugging ARC Top Projects Empty Chart

## Issue
Projects are correctly classified (`profile_type = 'project'`) but the chart is still empty.

## Debugging Steps

### Step 1: Check Browser Console

1. Open `/portal/arc` in your browser
2. Open DevTools (F12) → Console tab
3. Look for these log messages:
   - `[ARC] Received X projects from API`
   - `[ARC] Mapped X items for treemap`
   - `[ARC top-projects] Found X projects with profile_type='project'`

### Step 2: Check Network Tab

1. Open DevTools → Network tab
2. Reload `/portal/arc`
3. Find the request: `/api/portal/arc/top-projects?mode=gainers&timeframe=90d&limit=20`
4. Click on it and check the Response:
   - Does it have `ok: true`?
   - Does it have `items: [...]` array?
   - How many items are in the array?
   - What are the `growth_pct` values?

### Step 3: Check Server Logs

Look for these console.log messages in your server logs:

```
[ARC top-projects] Found X projects with profile_type='project'
[ARC top-projects] Fetched X start metrics, Y end metrics for Z projects
[ARC top-projects] Mapped metrics: X projects have start metrics, Y projects have end metrics
[ARC top-projects] Calculated growth for X projects. Growth range: X% to Y%
[ARC top-projects] Returning X projects (limit: 20, mode: gainers)
```

### Step 4: Test API Directly

Try calling the API directly in your browser or with curl:

```
http://localhost:3000/api/portal/arc/top-projects?mode=gainers&timeframe=90d&limit=20
```

Or with curl:
```bash
curl "http://localhost:3000/api/portal/arc/top-projects?mode=gainers&timeframe=90d&limit=20"
```

Check the response - does it have items?

### Step 5: Check Metrics Dates

The issue might be that metrics don't exist for the date range. Run this SQL:

```sql
-- Check what date ranges have metrics
SELECT 
  DATE_TRUNC('week', date) as week,
  COUNT(DISTINCT project_id) as projects_with_metrics,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM metrics_daily
WHERE project_id IN (
  SELECT id FROM projects 
  WHERE profile_type = 'project' AND is_active = true
)
GROUP BY DATE_TRUNC('week', date)
ORDER BY week DESC
LIMIT 10;
```

### Step 6: Test with Different Timeframes

Try different timeframes in the UI:
- 24h
- 7d  
- 30d
- 90d

One of them might work if metrics exist for that range.

### Step 7: Check if Metrics Exist for Projects

```sql
-- Check if projects have metrics at all
SELECT 
  p.id,
  p.name,
  p.display_name,
  COUNT(m.id) as metrics_count,
  MIN(m.date) as earliest_metric,
  MAX(m.date) as latest_metric
FROM projects p
LEFT JOIN metrics_daily m ON m.project_id = p.id
WHERE p.profile_type = 'project' 
  AND p.is_active = true
GROUP BY p.id, p.name, p.display_name
ORDER BY metrics_count DESC
LIMIT 20;
```

### Step 8: Verify Date Range Calculation

The API calculates dates like this:
- **90d**: Start = today - 90 days, End = today
- **30d**: Start = today - 30 days, End = today
- etc.

If your latest metrics are older than 90 days ago, the query won't find start metrics!

### Step 9: Check Treemap Component

The treemap component requires at least 2 items to render. If only 1 project is returned, it shows a fallback list view instead.

Check if `items.length >= 2` in the API response.

## Common Issues

### Issue 1: All growth_pct = 0

**Symptoms:** API returns items but all have `growth_pct: 0`

**Cause:** Metrics don't exist for the selected date range

**Fix:** 
- Use a shorter timeframe (7d or 30d instead of 90d)
- Or ensure metrics exist for the date range

### Issue 2: No metrics for start date

**Symptoms:** Server logs show "X projects have start metrics" with X = 0

**Cause:** No metrics exist before/on the start date

**Fix:** The code handles this by using `growth_pct = 0`, but if ALL projects have 0 growth, the treemap might not render well.

### Issue 3: Metrics exist but dates don't match

**Symptoms:** Metrics exist but API returns empty or zero growth

**Cause:** Date format mismatch or timezone issues

**Fix:** Check that metrics.date is stored as DATE (not TIMESTAMP) and matches the query format (YYYY-MM-DD)

## Quick Fix: Test with Manual Query

Run this SQL to simulate what the API does:

```sql
-- Simulate 90d query
WITH date_range AS (
  SELECT 
    CURRENT_DATE - INTERVAL '90 days' as start_date,
    CURRENT_DATE as end_date
),
projects AS (
  SELECT id, display_name, x_handle
  FROM projects
  WHERE profile_type = 'project' AND is_active = true
  LIMIT 10
),
start_metrics AS (
  SELECT DISTINCT ON (m.project_id)
    m.project_id,
    m.akari_score
  FROM metrics_daily m
  JOIN projects p ON p.id = m.project_id
  WHERE m.date <= (SELECT start_date FROM date_range)
  ORDER BY m.project_id, m.date DESC
),
end_metrics AS (
  SELECT DISTINCT ON (m.project_id)
    m.project_id,
    m.akari_score
  FROM metrics_daily m
  JOIN projects p ON p.id = m.project_id
  WHERE m.date <= (SELECT end_date FROM date_range)
  ORDER BY m.project_id, m.date DESC
)
SELECT 
  p.display_name,
  s.akari_score as start_score,
  e.akari_score as end_score,
  CASE 
    WHEN s.akari_score IS NULL OR e.akari_score IS NULL OR s.akari_score = 0 
    THEN 0
    ELSE ((e.akari_score - s.akari_score) / s.akari_score) * 100
  END as growth_pct
FROM projects p
LEFT JOIN start_metrics s ON s.project_id = p.id
LEFT JOIN end_metrics e ON e.project_id = p.id;
```

This will show you exactly what growth values should be calculated.

