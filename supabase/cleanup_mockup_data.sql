-- ============================================================================
-- CLEANUP MOCKUP DATA FROM PRODUCTION
-- ============================================================================
-- Run this in Supabase SQL Editor to remove test/sample data
-- This will delete:
--   - Sample projects (Cookie3, AKARI/MYSTIC CLUB)
--   - All related metrics_daily rows
--   - Sample influencers and relationships
--   - Sample profiles
--   - Sample tweets
-- ============================================================================

-- Start transaction
BEGIN;

-- 1. Get project IDs for cleanup
DO $$
DECLARE
    v_cookie3_id UUID;
    v_akari_id UUID;
BEGIN
    -- Find project IDs
    SELECT id INTO v_cookie3_id FROM projects WHERE slug = 'cookie3';
    SELECT id INTO v_akari_id FROM projects WHERE slug = 'akari';
    
    -- Delete project tweets
    IF v_cookie3_id IS NOT NULL THEN
        DELETE FROM project_tweets WHERE project_id = v_cookie3_id;
        RAISE NOTICE 'Deleted project_tweets for cookie3';
    END IF;
    
    IF v_akari_id IS NOT NULL THEN
        DELETE FROM project_tweets WHERE project_id = v_akari_id;
        RAISE NOTICE 'Deleted project_tweets for akari';
    END IF;
    
    -- Delete project influencer relationships
    IF v_cookie3_id IS NOT NULL THEN
        DELETE FROM project_influencers WHERE project_id = v_cookie3_id;
        RAISE NOTICE 'Deleted project_influencers for cookie3';
    END IF;
    
    IF v_akari_id IS NOT NULL THEN
        DELETE FROM project_influencers WHERE project_id = v_akari_id;
        RAISE NOTICE 'Deleted project_influencers for akari';
    END IF;
    
    -- Delete project inner circle members
    IF v_cookie3_id IS NOT NULL THEN
        DELETE FROM project_inner_circle WHERE project_id = v_cookie3_id;
        RAISE NOTICE 'Deleted project_inner_circle for cookie3';
    END IF;
    
    IF v_akari_id IS NOT NULL THEN
        DELETE FROM project_inner_circle WHERE project_id = v_akari_id;
        RAISE NOTICE 'Deleted project_inner_circle for akari';
    END IF;
    
    -- Delete project competitors
    IF v_cookie3_id IS NOT NULL THEN
        DELETE FROM project_competitors WHERE project_a_id = v_cookie3_id OR project_b_id = v_cookie3_id;
        RAISE NOTICE 'Deleted project_competitors for cookie3';
    END IF;
    
    IF v_akari_id IS NOT NULL THEN
        DELETE FROM project_competitors WHERE project_a_id = v_akari_id OR project_b_id = v_akari_id;
        RAISE NOTICE 'Deleted project_competitors for akari';
    END IF;
    
    -- Delete metrics daily
    IF v_cookie3_id IS NOT NULL THEN
        DELETE FROM metrics_daily WHERE project_id = v_cookie3_id;
        RAISE NOTICE 'Deleted metrics_daily for cookie3';
    END IF;
    
    IF v_akari_id IS NOT NULL THEN
        DELETE FROM metrics_daily WHERE project_id = v_akari_id;
        RAISE NOTICE 'Deleted metrics_daily for akari';
    END IF;
    
    -- Delete the projects themselves
    DELETE FROM projects WHERE slug IN ('cookie3', 'akari');
    RAISE NOTICE 'Deleted sample projects';
    
END $$;

-- 2. Delete sample influencers (the ones we seeded)
DELETE FROM influencers 
WHERE x_handle IN (
    'colobus_research', 
    'defichad', 
    'cryptokol', 
    'web3builder',
    'nftwhale',
    'alphahunter',
    'cryptoanalyst',
    'defidev',
    'ColobusResearch',
    'DeFiChad',
    'CryptoKOL',
    'Web3Builder',
    'NFTWhale',
    'AlphaHunter',
    'CryptoAnalyst',
    'DeFiDev'
);

-- 3. Delete sample profiles
DELETE FROM profiles 
WHERE twitter_id IN ('1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008')
   OR username IN (
       'colobus_research', 
       'defichad', 
       'cryptokol', 
       'web3builder',
       'nftwhale',
       'alphahunter',
       'cryptoanalyst',
       'defidev'
   );

-- 4. Delete global inner circle members that reference deleted profiles
DELETE FROM inner_circle_members 
WHERE profile_id NOT IN (SELECT id FROM profiles);

-- Commit transaction
COMMIT;

-- Verify cleanup
SELECT 'Projects remaining:' as check_type, COUNT(*) as count FROM projects
UNION ALL
SELECT 'Metrics remaining:', COUNT(*) FROM metrics_daily
UNION ALL
SELECT 'Influencers remaining:', COUNT(*) FROM influencers
UNION ALL
SELECT 'Profiles remaining:', COUNT(*) FROM profiles;

