-- ============================================
-- SEED INNER CIRCLE DATA
-- ============================================
-- This script creates sample inner circle data for testing
-- Run this in Supabase SQL Editor to populate inner circles
-- ============================================

-- STEP 1: Create sample profiles (high-quality Twitter accounts)
-- These represent real crypto influencers that might follow projects
INSERT INTO profiles (
  twitter_id, username, name, profile_image_url, 
  followers, following, tweet_count, is_blue_verified,
  akari_profile_score, authenticity_score, influence_score, 
  signal_density_score, farm_risk_score, updated_at
) VALUES
  -- Tier 1: Top Influencers (high scores)
  ('sample_001', 'cobie', 'Cobie', 'https://pbs.twimg.com/profile_images/1590876087931097089/4-QRZ5k9_400x400.jpg', 
   875000, 1200, 15000, true, 920, 95, 90, 88, 5, NOW()),
  ('sample_002', 'CryptoKaleo', 'Kaleo', 'https://pbs.twimg.com/profile_images/1684268973988610048/1DsYTc-w_400x400.jpg',
   580000, 800, 12000, true, 880, 92, 85, 85, 8, NOW()),
  ('sample_003', 'HsakaTrades', 'Hsaka', 'https://pbs.twimg.com/profile_images/1672267728285736960/OFwPuLjx_400x400.jpg',
   420000, 650, 8500, true, 850, 88, 82, 80, 10, NOW()),
  ('sample_004', 'inversebrah', 'inversebrah', 'https://pbs.twimg.com/profile_images/1679890155874009088/HhVHqJQf_400x400.jpg',
   350000, 500, 7200, true, 820, 85, 78, 82, 12, NOW()),
  ('sample_005', 'DegenerateNews', 'Degenerate News', 'https://pbs.twimg.com/profile_images/1734304001736790016/mj7p7pX1_400x400.jpg',
   280000, 450, 5500, true, 800, 82, 75, 78, 15, NOW()),
  
  -- Tier 2: Mid-tier Influencers
  ('sample_006', 'CryptoCred', 'CryptoCred', 'https://pbs.twimg.com/profile_images/1637107234201587718/qP9iIXNs_400x400.jpg',
   185000, 350, 6200, true, 780, 80, 72, 75, 18, NOW()),
  ('sample_007', 'crypto_nerd', 'Crypto Nerd', 'https://pbs.twimg.com/profile_images/1627718298903867392/VR0Xj8iC_400x400.jpg',
   125000, 280, 4800, false, 720, 75, 68, 70, 20, NOW()),
  ('sample_008', 'TheDeFiEdge', 'The DeFi Edge', 'https://pbs.twimg.com/profile_images/1736755614447714304/vL3ydmHA_400x400.jpg',
   98000, 220, 3500, true, 700, 72, 65, 72, 22, NOW()),
  ('sample_009', 'CryptoGodJohn', 'John', 'https://pbs.twimg.com/profile_images/1698053953172754432/Kw_XZCNt_400x400.jpg',
   75000, 180, 2800, false, 680, 70, 62, 68, 25, NOW()),
  ('sample_010', 'AltcoinGordon', 'Gordon', 'https://pbs.twimg.com/profile_images/1712853449299214336/YVwF6_iw_400x400.jpg',
   62000, 150, 2200, false, 650, 68, 58, 65, 28, NOW()),
  
  -- Tier 3: Growing accounts
  ('sample_011', 'DeFiDad', 'DeFi Dad', 'https://pbs.twimg.com/profile_images/1628094912674312192/VqE8TBJO_400x400.jpg',
   45000, 120, 1800, false, 620, 65, 55, 62, 30, NOW()),
  ('sample_012', 'TokenomicsGuy', 'Tokenomics Guy', 'https://pbs.twimg.com/profile_images/1634982398784393216/9Cv5tGJM_400x400.jpg',
   38000, 100, 1500, false, 600, 62, 52, 60, 32, NOW()),
  ('sample_013', 'YieldFarmer', 'Yield Farmer', 'https://pbs.twimg.com/profile_images/1635282619397808128/pQJ8MBXR_400x400.jpg',
   32000, 90, 1200, false, 580, 60, 50, 58, 35, NOW()),
  ('sample_014', 'OnChainWizard', 'On-Chain Wizard', 'https://pbs.twimg.com/profile_images/1637543789764653056/8DPqPv0L_400x400.jpg',
   28000, 80, 1000, false, 560, 58, 48, 55, 38, NOW()),
  ('sample_015', 'CryptoResearch', 'Crypto Research', 'https://pbs.twimg.com/profile_images/1639293759098462208/Z3L7oO_p_400x400.jpg',
   25000, 70, 900, false, 540, 55, 45, 52, 40, NOW())

ON CONFLICT (twitter_id) DO UPDATE SET
  username = EXCLUDED.username,
  name = EXCLUDED.name,
  profile_image_url = EXCLUDED.profile_image_url,
  followers = EXCLUDED.followers,
  following = EXCLUDED.following,
  tweet_count = EXCLUDED.tweet_count,
  is_blue_verified = EXCLUDED.is_blue_verified,
  akari_profile_score = EXCLUDED.akari_profile_score,
  authenticity_score = EXCLUDED.authenticity_score,
  influence_score = EXCLUDED.influence_score,
  signal_density_score = EXCLUDED.signal_density_score,
  farm_risk_score = EXCLUDED.farm_risk_score,
  updated_at = NOW();

-- STEP 2: Add profiles to inner_circle_members
INSERT INTO inner_circle_members (profile_id, akari_profile_score, influence_score, segment, added_at)
SELECT 
  id as profile_id,
  akari_profile_score,
  influence_score,
  CASE 
    WHEN username IN ('TheDeFiEdge', 'DeFiDad', 'YieldFarmer') THEN 'defi'
    WHEN username IN ('OnChainWizard', 'CryptoResearch') THEN 'builder'
    WHEN username IN ('cobie', 'inversebrah') THEN 'investor'
    ELSE 'general'
  END as segment,
  NOW() as added_at
FROM profiles
WHERE twitter_id LIKE 'sample_%'
ON CONFLICT (profile_id) DO UPDATE SET
  akari_profile_score = EXCLUDED.akari_profile_score,
  influence_score = EXCLUDED.influence_score,
  segment = EXCLUDED.segment;

-- STEP 3: Assign profiles to project inner circles
-- Get profile IDs
DO $$
DECLARE
  v_polymarket_id UUID;
  v_binance_id UUID;
  v_coinbase_id UUID;
  v_monad_id UUID;
  v_kalshi_id UUID;
  v_infinex_id UUID;
  v_quickswap_id UUID;
  v_profile_ids UUID[];
BEGIN
  -- Get project IDs
  SELECT id INTO v_polymarket_id FROM projects WHERE slug = 'polymarket';
  SELECT id INTO v_binance_id FROM projects WHERE slug = 'binance';
  SELECT id INTO v_coinbase_id FROM projects WHERE slug = 'coinbase';
  SELECT id INTO v_monad_id FROM projects WHERE slug = 'monad';
  SELECT id INTO v_kalshi_id FROM projects WHERE slug = 'kalshi';
  SELECT id INTO v_infinex_id FROM projects WHERE slug = 'infinex';
  SELECT id INTO v_quickswap_id FROM projects WHERE slug = 'quickswapdex';
  
  -- Get profile IDs
  SELECT ARRAY_AGG(id) INTO v_profile_ids 
  FROM profiles 
  WHERE twitter_id LIKE 'sample_%';
  
  -- Clear existing project inner circles
  DELETE FROM project_inner_circle 
  WHERE project_id IN (v_polymarket_id, v_binance_id, v_coinbase_id, v_monad_id, v_kalshi_id, v_infinex_id, v_quickswap_id);
  
  -- Polymarket: Gets top 10 profiles
  IF v_polymarket_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_polymarket_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25, -- follower bonus
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 10;
    
    -- Update project stats
    UPDATE projects SET 
      inner_circle_count = 10,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 10)
    WHERE id = v_polymarket_id;
  END IF;
  
  -- Binance: Gets 12 profiles
  IF v_binance_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_binance_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 12;
    
    UPDATE projects SET 
      inner_circle_count = 12,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 12)
    WHERE id = v_binance_id;
  END IF;
  
  -- Coinbase: Gets 11 profiles
  IF v_coinbase_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_coinbase_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 11;
    
    UPDATE projects SET 
      inner_circle_count = 11,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 11)
    WHERE id = v_coinbase_id;
  END IF;
  
  -- Monad: Gets 8 profiles
  IF v_monad_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_monad_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 8;
    
    UPDATE projects SET 
      inner_circle_count = 8,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 8)
    WHERE id = v_monad_id;
  END IF;
  
  -- Kalshi: Gets 7 profiles
  IF v_kalshi_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_kalshi_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 7;
    
    UPDATE projects SET 
      inner_circle_count = 7,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 7)
    WHERE id = v_kalshi_id;
  END IF;
  
  -- Infinex: Gets 6 profiles
  IF v_infinex_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_infinex_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 6;
    
    UPDATE projects SET 
      inner_circle_count = 6,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 6)
    WHERE id = v_infinex_id;
  END IF;
  
  -- QuickSwap: Gets 9 profiles
  IF v_quickswap_id IS NOT NULL THEN
    INSERT INTO project_inner_circle (project_id, profile_id, is_follower, is_author, weight, last_interaction_at)
    SELECT 
      v_quickswap_id,
      p.id,
      true,
      false,
      p.akari_profile_score / 1000.0 * 1.25,
      NOW()
    FROM profiles p
    WHERE p.twitter_id LIKE 'sample_%'
    ORDER BY p.akari_profile_score DESC
    LIMIT 9;
    
    UPDATE projects SET 
      inner_circle_count = 9,
      inner_circle_power = (SELECT SUM(influence_score) FROM profiles WHERE twitter_id LIKE 'sample_%' ORDER BY akari_profile_score DESC LIMIT 9)
    WHERE id = v_quickswap_id;
  END IF;
END $$;

-- STEP 4: Update metrics_daily with inner_circle_count
UPDATE metrics_daily md
SET inner_circle_count = p.inner_circle_count
FROM projects p
WHERE md.project_id = p.id
  AND md.date = CURRENT_DATE
  AND p.inner_circle_count IS NOT NULL;

-- STEP 5: Create project_competitors entries based on overlap
DO $$
DECLARE
  proj_a RECORD;
  proj_b RECORD;
  common_count INT;
  overlap_score NUMERIC;
BEGIN
  -- Clear existing competitors
  DELETE FROM project_competitors;
  
  -- For each pair of projects
  FOR proj_a IN SELECT id, slug, inner_circle_count FROM projects WHERE inner_circle_count > 0 LOOP
    FOR proj_b IN SELECT id, slug, inner_circle_count FROM projects WHERE inner_circle_count > 0 AND id != proj_a.id LOOP
      -- Count common profiles
      SELECT COUNT(*) INTO common_count
      FROM project_inner_circle a
      JOIN project_inner_circle b ON a.profile_id = b.profile_id
      WHERE a.project_id = proj_a.id AND b.project_id = proj_b.id;
      
      IF common_count > 0 THEN
        -- Calculate similarity
        overlap_score := (2.0 * common_count) / NULLIF(proj_a.inner_circle_count + proj_b.inner_circle_count, 0);
        
        INSERT INTO project_competitors (project_id, competitor_id, common_inner_circle_count, common_inner_circle_power, similarity_score)
        VALUES (
          proj_a.id,
          proj_b.id,
          common_count,
          (SELECT SUM(p.influence_score) 
           FROM project_inner_circle pic_a
           JOIN project_inner_circle pic_b ON pic_a.profile_id = pic_b.profile_id
           JOIN profiles p ON p.id = pic_a.profile_id
           WHERE pic_a.project_id = proj_a.id AND pic_b.project_id = proj_b.id),
          overlap_score
        )
        ON CONFLICT (project_id, competitor_id) DO UPDATE SET
          common_inner_circle_count = EXCLUDED.common_inner_circle_count,
          common_inner_circle_power = EXCLUDED.common_inner_circle_power,
          similarity_score = EXCLUDED.similarity_score;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- VERIFY: Check the results
SELECT 
  p.name,
  p.slug,
  p.inner_circle_count,
  p.inner_circle_power,
  (SELECT COUNT(*) FROM project_inner_circle pic WHERE pic.project_id = p.id) as actual_circle_count
FROM projects p
WHERE p.inner_circle_count > 0
ORDER BY p.inner_circle_count DESC;

-- Check competitors
SELECT 
  p1.name as project,
  p2.name as competitor,
  pc.common_inner_circle_count,
  pc.similarity_score
FROM project_competitors pc
JOIN projects p1 ON p1.id = pc.project_id
JOIN projects p2 ON p2.id = pc.competitor_id
ORDER BY pc.similarity_score DESC
LIMIT 20;

