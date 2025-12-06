-- =============================================================================
-- Fix metrics data and avatars for sentiment projects
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Update Cookie3 project with correct data
UPDATE projects SET
  name = 'Cookie3',
  avatar_url = 'https://pbs.twimg.com/profile_images/1683478025658363905/4me9uqNs_400x400.jpg',
  bio = 'AI Data Layer for crypto enterprise analytics across the whole funnel | Used by 300+ top projects | for $COOKIE go to @cookiedotfun'
WHERE slug = 'cookie3';

-- Update Akari Mystic Club project
UPDATE projects SET
  name = 'Akari Mystic Club',
  avatar_url = 'https://pbs.twimg.com/profile_images/1855571509373362176/QKaFxVxT_400x400.jpg',
  bio = 'Prediction-native market intelligence. A mystic collective for crypto signal seekers.'
WHERE slug = 'akari' OR x_handle = 'akari_portal';

-- Fix Cookie3 metrics (today and yesterday for 24h change demo)
UPDATE metrics_daily SET
  akari_score = 720,
  sentiment_score = 68,
  ct_heat_score = 72,
  followers = 365000
WHERE project_id = (SELECT id FROM projects WHERE slug = 'cookie3')
  AND date = CURRENT_DATE;

-- Insert/update yesterday's metrics for Cookie3 (for 24h change)
INSERT INTO metrics_daily (project_id, date, sentiment_score, ct_heat_score, tweet_count, followers, akari_score)
SELECT 
  id,
  CURRENT_DATE - INTERVAL '1 day',
  86,  -- higher yesterday = shows negative change today
  95,  -- higher yesterday = shows negative change today (max 100)
  45,
  364500,
  718
FROM projects WHERE slug = 'cookie3'
ON CONFLICT (project_id, date) DO UPDATE SET
  sentiment_score = EXCLUDED.sentiment_score,
  ct_heat_score = EXCLUDED.ct_heat_score,
  tweet_count = EXCLUDED.tweet_count,
  followers = EXCLUDED.followers,
  akari_score = EXCLUDED.akari_score;

-- Fix Akari Mystic Club metrics
UPDATE metrics_daily SET
  akari_score = 580,
  sentiment_score = 75,
  ct_heat_score = 65,
  followers = 1250
WHERE project_id = (SELECT id FROM projects WHERE x_handle = 'akari_portal')
  AND date = CURRENT_DATE;

-- Insert/update yesterday's metrics for Akari (for 24h change)
INSERT INTO metrics_daily (project_id, date, sentiment_score, ct_heat_score, tweet_count, followers, akari_score)
SELECT 
  id,
  CURRENT_DATE - INTERVAL '1 day',
  72,  -- lower yesterday = shows positive change today
  60,  -- lower yesterday = shows positive change today
  12,
  1200,
  575
FROM projects WHERE x_handle = 'akari_portal'
ON CONFLICT (project_id, date) DO UPDATE SET
  sentiment_score = EXCLUDED.sentiment_score,
  ct_heat_score = EXCLUDED.ct_heat_score,
  tweet_count = EXCLUDED.tweet_count,
  followers = EXCLUDED.followers,
  akari_score = EXCLUDED.akari_score;

-- Verify the updates
SELECT 
  p.name,
  p.x_handle,
  p.avatar_url,
  m.date,
  m.akari_score,
  m.sentiment_score,
  m.ct_heat_score,
  m.followers
FROM projects p
LEFT JOIN metrics_daily m ON p.id = m.project_id
WHERE p.is_active = true
ORDER BY p.name, m.date DESC;

