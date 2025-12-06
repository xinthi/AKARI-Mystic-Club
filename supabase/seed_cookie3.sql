-- =============================================================================
-- Seed Cookie3 project for testing
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Insert the Cookie3 project
INSERT INTO projects (slug, x_handle, name, bio, avatar_url, is_active)
VALUES (
  'cookie3',
  'cookie3',
  'Cookie3',
  'The MarketingFi Protocol. First-party data analytics and AI attribution for Web3 marketing.',
  'https://pbs.twimg.com/profile_images/1683478025658363905/4me9uqNs_400x400.jpg',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  is_active = EXCLUDED.is_active;

-- Get the project ID
DO $$
DECLARE
  project_uuid UUID;
BEGIN
  SELECT id INTO project_uuid FROM projects WHERE slug = 'cookie3';
  
  -- Insert sample metrics for today and past few days
  INSERT INTO metrics_daily (project_id, date, sentiment_score, ct_heat_score, tweet_count, followers, akari_score)
  VALUES 
    (project_uuid, CURRENT_DATE, 72, 65, 45, 28500, 720),
    (project_uuid, CURRENT_DATE - INTERVAL '1 day', 68, 58, 38, 28200, 715),
    (project_uuid, CURRENT_DATE - INTERVAL '2 days', 75, 70, 52, 27900, 725),
    (project_uuid, CURRENT_DATE - INTERVAL '3 days', 65, 55, 30, 27600, 705),
    (project_uuid, CURRENT_DATE - INTERVAL '4 days', 70, 62, 42, 27300, 718),
    (project_uuid, CURRENT_DATE - INTERVAL '5 days', 73, 68, 48, 27000, 722),
    (project_uuid, CURRENT_DATE - INTERVAL '6 days', 69, 60, 35, 26800, 710)
  ON CONFLICT (project_id, date) DO UPDATE SET
    sentiment_score = EXCLUDED.sentiment_score,
    ct_heat_score = EXCLUDED.ct_heat_score,
    tweet_count = EXCLUDED.tweet_count,
    followers = EXCLUDED.followers,
    akari_score = EXCLUDED.akari_score;
END $$;

-- Verify the insert
SELECT 
  p.name,
  p.x_handle,
  p.avatar_url,
  m.date,
  m.sentiment_score,
  m.ct_heat_score,
  m.akari_score,
  m.followers
FROM projects p
LEFT JOIN metrics_daily m ON p.id = m.project_id
WHERE p.slug = 'cookie3'
ORDER BY m.date DESC;

