-- =============================================================================
-- Seed tweets for ALL active projects that don't have any tweets yet
-- Run this in Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  proj RECORD;
  tweet_date TIMESTAMP;
  i INTEGER;
  tweet_id_base BIGINT;
  sample_texts TEXT[] := ARRAY[
    '🚀 Big announcement coming soon! Stay tuned for exciting updates.',
    'Thank you to our amazing community! We just hit a new milestone 🎉',
    'New partnership alert! Excited to share what''s coming next.',
    'The team has been working hard on something special. Can''t wait to show you!',
    'GM! Another great day in crypto. What are you building?',
    'Weekly update: Development is progressing smoothly. Mainnet soon™',
    'Reminder: Our community call is happening tomorrow. Don''t miss it!',
    'We''ve listened to your feedback and made some important updates.',
    'Alpha leak 👀 Something big is dropping this week.',
    'Security is our top priority. Audit results coming soon.'
  ];
BEGIN
  -- Loop through all active projects
  FOR proj IN 
    SELECT p.id, p.name, p.slug, p.x_handle, p.avatar_url
    FROM projects p
    WHERE p.is_active = true
  LOOP
    -- Check if project already has tweets
    IF NOT EXISTS (SELECT 1 FROM project_tweets WHERE project_id = proj.id LIMIT 1) THEN
      RAISE NOTICE 'Seeding tweets for: % (@%)', proj.name, proj.x_handle;
      
      tweet_id_base := (EXTRACT(EPOCH FROM NOW()) * 1000 + FLOOR(RANDOM() * 1000000))::BIGINT;
      
      -- Create 7 tweets over the last 7 days (one per day for chart markers)
      FOR i IN 0..6 LOOP
        tweet_date := NOW() - (interval '1 day' * i) - (interval '1 hour' * floor(random() * 12)::int);
        
        INSERT INTO project_tweets (
          project_id,
          tweet_id,
          tweet_url,
          author_handle,
          author_name,
          author_profile_image_url,
          created_at,
          text,
          likes,
          replies,
          retweets,
          sentiment_score,
          engagement_score,
          is_official,
          is_kol
        ) VALUES (
          proj.id,
          (tweet_id_base + i)::text,
          'https://x.com/' || proj.x_handle || '/status/' || (tweet_id_base + i)::text,
          proj.x_handle,
          proj.name,
          proj.avatar_url,
          tweet_date,
          sample_texts[1 + (i % array_length(sample_texts, 1))],
          floor(random() * 5000)::int + 500,
          floor(random() * 500)::int + 50,
          floor(random() * 1000)::int + 100,
          50 + floor(random() * 30)::int, -- sentiment 50-80
          floor(random() * 100)::int + 50, -- engagement 50-150
          TRUE,
          FALSE
        );
      END LOOP;
      
      -- Add 2 KOL mentions
      FOR i IN 1..2 LOOP
        tweet_date := NOW() - (interval '1 day' * floor(random() * 5)::int);
        
        INSERT INTO project_tweets (
          project_id,
          tweet_id,
          tweet_url,
          author_handle,
          author_name,
          author_profile_image_url,
          created_at,
          text,
          likes,
          replies,
          retweets,
          sentiment_score,
          engagement_score,
          is_official,
          is_kol
        ) VALUES (
          proj.id,
          (tweet_id_base + 100 + i)::text,
          'https://x.com/cobie/status/' || (tweet_id_base + 100 + i)::text,
          CASE i WHEN 1 THEN 'cobie' ELSE 'Pentosh1' END,
          CASE i WHEN 1 THEN 'Cobie' ELSE 'Pentoshi' END,
          NULL,
          tweet_date,
          'Been looking at @' || proj.x_handle || ' lately - interesting project 👀',
          floor(random() * 15000)::int + 5000,
          floor(random() * 1500)::int + 500,
          floor(random() * 3000)::int + 1000,
          60 + floor(random() * 25)::int,
          floor(random() * 200)::int + 100,
          FALSE,
          TRUE -- is_kol = true
        );
      END LOOP;
      
    ELSE
      RAISE NOTICE 'Project % already has tweets, skipping', proj.name;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Done! All projects now have tweets.';
END $$;

-- Verify: Show tweet counts per project
SELECT 
  p.name,
  p.x_handle,
  COUNT(pt.tweet_id) as tweet_count,
  COUNT(CASE WHEN pt.is_kol THEN 1 END) as kol_tweets,
  COUNT(CASE WHEN pt.is_official THEN 1 END) as official_tweets
FROM projects p
LEFT JOIN project_tweets pt ON p.id = pt.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.x_handle
ORDER BY p.name;

