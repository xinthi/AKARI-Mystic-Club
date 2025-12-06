-- =============================================================================
-- Seed project_tweets with sample data for chart markers
-- Run this in Supabase SQL Editor AFTER running fix_metrics_realistic.sql
-- =============================================================================

-- This script creates sample tweets for each project to show on the chart
-- In production, these would come from the Twitter API

DO $$
DECLARE
  proj RECORD;
  tweet_date TIMESTAMP;
  i INTEGER;
  sample_texts TEXT[] := ARRAY[
    '🚀 Big announcement coming soon! Stay tuned for exciting updates.',
    'Thank you to our amazing community! We just hit a new milestone 🎉',
    'New partnership alert! We''re excited to share what''s coming next.',
    'The team has been working hard on something special. Can''t wait to show you!',
    'GM! Another great day in crypto. What are you building?',
    'Weekly update: Development is progressing smoothly. Mainnet soon™',
    'Reminder: Our community call is happening tomorrow. Don''t miss it!',
    'We''ve listened to your feedback and made some important updates.',
    'Alpha leak 👀 Something big is dropping this week.',
    'Security is our top priority. Audit results coming soon.',
    'To the moon! 🌙 Thank you for believing in our vision.',
    'New feature just shipped! Check it out and let us know what you think.',
    'AMA happening right now! Join us to ask your questions.',
    'Our ecosystem is growing fast. Welcome to all our new partners!',
    'Looking forward to seeing everyone at the conference next week!'
  ];
  kol_handles TEXT[] := ARRAY['cobie', 'icebergy_', 'Pentosh1', 'CryptoKaleo', 'GiganticRebirth'];
  kol_names TEXT[] := ARRAY['Cobie', 'Iceberg', 'Pentoshi', 'Kaleo', 'Hsaka'];
  tweet_id_base BIGINT;
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
      
      tweet_id_base := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
      
      -- Create 10 sample tweets over the last 7 days
      FOR i IN 1..10 LOOP
        tweet_date := NOW() - (interval '1 day' * floor(random() * 7)::int) - (interval '1 hour' * floor(random() * 24)::int);
        
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
          sample_texts[1 + floor(random() * array_length(sample_texts, 1))::int],
          floor(random() * 5000)::int + 100,
          floor(random() * 500)::int + 10,
          floor(random() * 1000)::int + 50,
          TRUE, -- is_official = true for project's own tweets
          FALSE
        );
      END LOOP;
      
      -- Add 3 KOL mentions (tweets from influencers mentioning the project)
      FOR i IN 1..3 LOOP
        tweet_date := NOW() - (interval '1 day' * floor(random() * 7)::int) - (interval '1 hour' * floor(random() * 24)::int);
        
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
          is_official,
          is_kol
        ) VALUES (
          proj.id,
          (tweet_id_base + 100 + i)::text,
          'https://x.com/' || kol_handles[i] || '/status/' || (tweet_id_base + 100 + i)::text,
          kol_handles[i],
          kol_names[i],
          NULL, -- KOL avatar URL would come from API
          tweet_date,
          'Just checked out @' || proj.x_handle || ' - this is going to be huge! 🔥',
          floor(random() * 20000)::int + 1000,
          floor(random() * 2000)::int + 100,
          floor(random() * 5000)::int + 500,
          FALSE, -- is_official = false for KOL tweets
          TRUE   -- is_kol = true
        );
      END LOOP;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Tweet seeding complete!';
END $$;

-- =============================================================================
-- Verify tweets were created
-- =============================================================================

SELECT 
  p.name,
  COUNT(pt.id) as total_tweets,
  COUNT(CASE WHEN pt.is_official THEN 1 END) as official_tweets,
  COUNT(CASE WHEN pt.is_kol THEN 1 END) as kol_tweets
FROM projects p
LEFT JOIN project_tweets pt ON p.id = pt.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name
ORDER BY p.name;

