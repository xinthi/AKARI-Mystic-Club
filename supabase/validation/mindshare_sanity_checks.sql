-- =============================================================================
-- Mindshare Snapshot Sanity Checks
-- 
-- Run these queries to validate mindshare snapshot data integrity.
-- =============================================================================

-- =============================================================================
-- CHECK 1: Sum of BPS per window/day = 10000
-- =============================================================================
-- This ensures normalization is working correctly.
-- Expected: All rows should show sum_bps = 10000

SELECT 
  time_window,
  as_of_date,
  SUM(mindshare_bps) as sum_bps,
  COUNT(*) as project_count,
  CASE 
    WHEN SUM(mindshare_bps) = 10000 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status
FROM project_mindshare_snapshots
GROUP BY time_window, as_of_date
ORDER BY as_of_date DESC, time_window;

-- =============================================================================
-- CHECK 2: Latest snapshot exists per window
-- =============================================================================
-- This ensures we have current data for all windows.
-- Expected: Should show today's date for all 4 windows

SELECT 
  time_window,
  MAX(as_of_date) as latest_date,
  COUNT(DISTINCT project_id) as project_count,
  CASE 
    WHEN MAX(as_of_date) = CURRENT_DATE THEN '✅ PASS'
    ELSE '⚠️ STALE'
  END as status
FROM project_mindshare_snapshots
GROUP BY time_window
ORDER BY time_window;

-- =============================================================================
-- CHECK 3: Top projects by mindshare (7d window, latest date)
-- =============================================================================
-- This shows the top projects to verify ranking is working.
-- Expected: Should show projects with highest mindshare_bps

SELECT 
  p.name,
  p.x_handle,
  pms.mindshare_bps,
  pms.attention_value,
  pms.as_of_date,
  ROUND((pms.mindshare_bps::numeric / 100), 2) as mindshare_pct
FROM project_mindshare_snapshots pms
JOIN projects p ON pms.project_id = p.id
WHERE pms.time_window = '7d'
  AND pms.as_of_date = (SELECT MAX(as_of_date) FROM project_mindshare_snapshots WHERE time_window = '7d')
ORDER BY pms.mindshare_bps DESC
LIMIT 10;

-- =============================================================================
-- CHECK 4: Delta function test
-- =============================================================================
-- This tests the get_mindshare_delta function works correctly.
-- Expected: Should return delta values for projects with historical data

SELECT 
  p.name,
  pms.time_window,
  pms.as_of_date as current_date,
  pms.mindshare_bps as current_bps,
  get_mindshare_delta(pms.project_id, pms.time_window, 1) as delta_1d,
  get_mindshare_delta(pms.project_id, pms.time_window, 7) as delta_7d
FROM project_mindshare_snapshots pms
JOIN projects p ON pms.project_id = p.id
WHERE pms.as_of_date = CURRENT_DATE
  AND pms.time_window = '7d'
ORDER BY pms.mindshare_bps DESC
LIMIT 10;

-- =============================================================================
-- CHECK 5: Data freshness check
-- =============================================================================
-- This checks how many days old the latest snapshots are.
-- Expected: Should show 0 days old (today) for all windows

SELECT 
  time_window,
  MAX(as_of_date) as latest_date,
  CURRENT_DATE - MAX(as_of_date) as days_old,
  COUNT(*) as snapshot_count,
  CASE 
    WHEN CURRENT_DATE - MAX(as_of_date) = 0 THEN '✅ FRESH'
    WHEN CURRENT_DATE - MAX(as_of_date) = 1 THEN '⚠️ 1 DAY OLD'
    WHEN CURRENT_DATE - MAX(as_of_date) > 1 THEN '❌ STALE'
    ELSE '❓ UNKNOWN'
  END as status
FROM project_mindshare_snapshots
GROUP BY time_window
ORDER BY time_window;

