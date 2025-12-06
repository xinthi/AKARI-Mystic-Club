-- =================================================================
-- SEED SAMPLE PROFILES AND INNER CIRCLE DATA
-- Run this in Supabase SQL Editor to populate test data
-- =================================================================

-- 1. Insert sample influencers (if not exists)
INSERT INTO influencers (x_handle, name, bio, avatar_url, followers, following, akari_score, credibility_score)
VALUES 
  ('colobus_research', 'Colobus Research', 'On-chain analytics and alpha', 'https://pbs.twimg.com/profile_images/1600000001/avatar_400x400.jpg', 45000, 500, 820, 85),
  ('defichad', 'DeFi Chad', 'Degen trader | Not financial advice', 'https://pbs.twimg.com/profile_images/1600000002/avatar_400x400.jpg', 125000, 800, 780, 75),
  ('cryptokol', 'Crypto KOL', 'Researching the future of finance', 'https://pbs.twimg.com/profile_images/1600000003/avatar_400x400.jpg', 89000, 1200, 750, 80),
  ('web3builder', 'Web3 Builder', 'Building in public | Solidity dev', 'https://pbs.twimg.com/profile_images/1600000004/avatar_400x400.jpg', 32000, 400, 720, 78),
  ('nftwhale', 'NFT Whale', 'Collecting digital art since 2020', 'https://pbs.twimg.com/profile_images/1600000005/avatar_400x400.jpg', 67000, 600, 690, 72),
  ('alphahunter', 'Alpha Hunter', 'Finding gems before CT', 'https://pbs.twimg.com/profile_images/1600000006/avatar_400x400.jpg', 54000, 350, 760, 77)
ON CONFLICT (x_handle) DO UPDATE SET
  akari_score = EXCLUDED.akari_score,
  credibility_score = EXCLUDED.credibility_score;

-- 2. Insert sample profiles
INSERT INTO profiles (twitter_id, username, name, profile_image_url, bio, followers, following, tweet_count, is_blue_verified, akari_profile_score, authenticity_score, influence_score, signal_density_score, farm_risk_score, last_scored_at)
VALUES 
  ('1001', 'colobus_research', 'Colobus Research', 'https://pbs.twimg.com/profile_images/1600000001/avatar_400x400.jpg', 'On-chain analytics and alpha', 45000, 500, 2500, true, 820, 85, 75, 70, 5, NOW()),
  ('1002', 'defichad', 'DeFi Chad', 'https://pbs.twimg.com/profile_images/1600000002/avatar_400x400.jpg', 'Degen trader | Not financial advice', 125000, 800, 5600, true, 780, 75, 80, 65, 10, NOW()),
  ('1003', 'cryptokol', 'Crypto KOL', 'https://pbs.twimg.com/profile_images/1600000003/avatar_400x400.jpg', 'Researching the future of finance', 89000, 1200, 3400, true, 750, 80, 78, 68, 8, NOW()),
  ('1004', 'web3builder', 'Web3 Builder', 'https://pbs.twimg.com/profile_images/1600000004/avatar_400x400.jpg', 'Building in public | Solidity dev', 32000, 400, 1800, false, 720, 82, 65, 75, 5, NOW()),
  ('1005', 'nftwhale', 'NFT Whale', 'https://pbs.twimg.com/profile_images/1600000005/avatar_400x400.jpg', 'Collecting digital art since 2020', 67000, 600, 2200, true, 690, 70, 72, 60, 12, NOW()),
  ('1006', 'alphahunter', 'Alpha Hunter', 'https://pbs.twimg.com/profile_images/1600000006/avatar_400x400.jpg', 'Finding gems before CT', 54000, 350, 1900, false, 760, 78, 73, 72, 7, NOW()),
  ('1007', 'cryptoanalyst', 'Crypto Analyst', 'https://pbs.twimg.com/profile_images/1600000007/avatar_400x400.jpg', 'Technical analysis | Charts', 78000, 450, 4200, true, 770, 80, 76, 70, 6, NOW()),
  ('1008', 'defidev', 'DeFi Developer', 'https://pbs.twimg.com/profile_images/1600000008/avatar_400x400.jpg', 'Smart contract auditor', 28000, 380, 1500, false, 740, 85, 62, 78, 3, NOW())
ON CONFLICT (username) DO UPDATE SET
  akari_profile_score = EXCLUDED.akari_profile_score,
  authenticity_score = EXCLUDED.authenticity_score,
  influence_score = EXCLUDED.influence_score,
  signal_density_score = EXCLUDED.signal_density_score,
  farm_risk_score = EXCLUDED.farm_risk_score,
  last_scored_at = NOW();

-- 3. Link influencers to projects
-- First get project IDs
DO $$
DECLARE
  cookie3_id UUID;
  akari_id UUID;
  inf_id UUID;
BEGIN
  SELECT id INTO cookie3_id FROM projects WHERE slug = 'cookie3';
  SELECT id INTO akari_id FROM projects WHERE slug = 'akari';

  -- Link influencers to Cookie3
  FOR inf_id IN SELECT id FROM influencers WHERE x_handle IN ('colobus_research', 'defichad', 'cryptokol', 'web3builder')
  LOOP
    INSERT INTO project_influencers (project_id, influencer_id, is_follower, last_mention_at, avg_sentiment_30d)
    VALUES (cookie3_id, inf_id, true, NOW(), 75)
    ON CONFLICT (project_id, influencer_id) DO UPDATE SET
      last_mention_at = NOW();
  END LOOP;

  -- Link influencers to AKARI
  FOR inf_id IN SELECT id FROM influencers WHERE x_handle IN ('nftwhale', 'alphahunter', 'colobus_research', 'cryptokol')
  LOOP
    INSERT INTO project_influencers (project_id, influencer_id, is_follower, last_mention_at, avg_sentiment_30d)
    VALUES (akari_id, inf_id, true, NOW(), 80)
    ON CONFLICT (project_id, influencer_id) DO UPDATE SET
      last_mention_at = NOW();
  END LOOP;
END $$;

-- 4. Verify
SELECT 'Influencers:' as table_name, COUNT(*) as count FROM influencers
UNION ALL
SELECT 'Profiles:', COUNT(*) FROM profiles
UNION ALL
SELECT 'Project Influencers:', COUNT(*) FROM project_influencers;

