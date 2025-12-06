-- =============================================================================
-- Fix metrics to be realistic: tweet counts + follower variations
-- Run this in Supabase SQL Editor
-- =============================================================================

-- This script updates existing metrics_daily rows to have:
-- 1. Realistic tweet_count values (projects tweet daily!)
-- 2. Follower variation (accounts grow/shrink slightly each day)

DO $$
DECLARE
  proj RECORD;
  metric RECORD;
  base_followers BIGINT;
  base_tweet_count INTEGER;
  growth_rate NUMERIC;
  days_back INTEGER;
  new_followers BIGINT;
  new_tweet_count INTEGER;
  row_num INTEGER;
BEGIN
  -- Loop through all active projects
  FOR proj IN 
    SELECT p.id, p.name, p.slug, p.x_handle
    FROM projects p
    WHERE p.is_active = true
  LOOP
    -- Get the most recent followers count as baseline
    SELECT followers INTO base_followers
    FROM metrics_daily
    WHERE project_id = proj.id AND followers IS NOT NULL AND followers > 0
    ORDER BY date DESC
    LIMIT 1;
    
    IF base_followers IS NULL THEN
      base_followers := 100000; -- Default if no data
    END IF;
    
    -- Base tweet count per day depends on project size
    -- Bigger projects tweet more
    IF base_followers > 1000000 THEN
      base_tweet_count := 15 + floor(random() * 10)::int; -- 15-25 tweets/day
    ELSIF base_followers > 100000 THEN
      base_tweet_count := 8 + floor(random() * 7)::int; -- 8-15 tweets/day
    ELSIF base_followers > 10000 THEN
      base_tweet_count := 3 + floor(random() * 5)::int; -- 3-8 tweets/day
    ELSE
      base_tweet_count := 1 + floor(random() * 3)::int; -- 1-4 tweets/day
    END IF;
    
    -- Random daily growth rate between 0.2% and 0.5%
    growth_rate := 0.002 + (random() * 0.003);
    
    RAISE NOTICE 'Updating % (@%): base_followers=%, base_tweets=%', proj.name, proj.x_handle, base_followers, base_tweet_count;
    
    row_num := 0;
    
    -- Update each day's metrics
    FOR metric IN
      SELECT id, date, followers, tweet_count
      FROM metrics_daily
      WHERE project_id = proj.id
      ORDER BY date DESC
    LOOP
      -- Calculate followers for this day (less followers going back in time)
      new_followers := ROUND(base_followers * (1 - (growth_rate * row_num)));
      
      -- Add some daily randomness (±0.05%)
      new_followers := new_followers + ROUND((random() - 0.5) * base_followers * 0.001);
      new_followers := GREATEST(1000, new_followers);
      
      -- Calculate tweet count for this day (random variation)
      new_tweet_count := base_tweet_count + floor((random() - 0.5) * 6)::int;
      new_tweet_count := GREATEST(1, new_tweet_count);
      
      -- Update the row
      UPDATE metrics_daily
      SET 
        followers = new_followers,
        tweet_count = new_tweet_count
      WHERE id = metric.id;
      
      row_num := row_num + 1;
    END LOOP;
    
  END LOOP;
  
  RAISE NOTICE 'Metrics update complete!';
END $$;

-- =============================================================================
-- Also insert sample tweets for projects that have none
-- =============================================================================

-- First, check which projects have tweets
SELECT p.name, p.x_handle, COUNT(pt.id) as tweet_count
FROM projects p
LEFT JOIN project_tweets pt ON p.id = pt.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.x_handle
ORDER BY tweet_count ASC;

-- =============================================================================
-- Verify the changes
-- =============================================================================

SELECT 
  p.name,
  m.date,
  m.tweet_count,
  m.followers,
  LAG(m.followers) OVER (PARTITION BY m.project_id ORDER BY m.date) as prev_followers,
  m.followers - LAG(m.followers) OVER (PARTITION BY m.project_id ORDER BY m.date) as followers_delta
FROM projects p
JOIN metrics_daily m ON p.id = m.project_id
WHERE p.is_active = true
ORDER BY p.name, m.date DESC
LIMIT 30;

