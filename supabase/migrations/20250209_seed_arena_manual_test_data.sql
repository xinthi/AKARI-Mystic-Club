-- =============================================================================
-- Migration: Manual Seed for Arena Test Data
-- Purpose: Seed arena 'f16454be-b0fd-471e-8b84-fc2a8d615c26' with test creators and contributions
-- Date: 2025-02-09
-- Idempotent: Safe to run multiple times (uses ON CONFLICT)
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- HELPER FUNCTION: Normalize Twitter Username
-- =============================================================================
CREATE OR REPLACE FUNCTION normalize_username(input_username TEXT)
RETURNS TEXT AS $$
BEGIN
  IF input_username IS NULL OR input_username = '' THEN
    RETURN NULL;
  END IF;
  RETURN lower(trim(regexp_replace(input_username, '^@+', '', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 1. UPSERT PROFILES FOR TEST CREATORS
-- =============================================================================
-- For each handle, find or create a profile with normalized username matching

DO $$
DECLARE
  test_handles TEXT[] := ARRAY['muazxinthi', 'beemzzllx', 'truunik', 'hopesvl'];
  handle TEXT;
  normalized_handle TEXT;
  profile_id_val UUID;
BEGIN
  FOREACH handle IN ARRAY test_handles
  LOOP
    normalized_handle := normalize_username(handle);
    
    IF normalized_handle IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Try to find existing profile by normalized username
    SELECT id INTO profile_id_val
    FROM profiles
    WHERE normalize_username(username) = normalized_handle
    LIMIT 1;
    
    -- If not found, create minimal profile
    IF profile_id_val IS NULL THEN
      -- Check if unique constraint/index exists on username
      -- Use a safer approach: try insert, catch conflict
      BEGIN
        INSERT INTO profiles (
          username,
          name,
          profile_image_url,
          bio,
          followers,
          following,
          tweet_count,
          created_at,
          updated_at
        )
        VALUES (
          normalized_handle, -- Store exact normalized handle
          NULL,
          NULL,
          NULL,
          0,
          0,
          0,
          NOW(),
          NOW()
        )
        RETURNING id INTO profile_id_val;
      EXCEPTION
        WHEN unique_violation THEN
          -- Profile already exists, fetch it
          SELECT id INTO profile_id_val
          FROM profiles
          WHERE username = normalized_handle
          LIMIT 1;
      END;
      
      -- If still NULL, try one more time with direct lookup
      IF profile_id_val IS NULL THEN
        SELECT id INTO profile_id_val
        FROM profiles
        WHERE username = normalized_handle
        LIMIT 1;
      END IF;
    END IF;
    
    RAISE NOTICE 'Profile for @%: %', handle, profile_id_val;
  END LOOP;
END $$;

-- =============================================================================
-- 2. INSERT TEST CREATORS INTO arena_creators
-- =============================================================================
-- Use ON CONFLICT to make idempotent

DO $$
DECLARE
  arena_id_val UUID := 'f16454be-b0fd-471e-8b84-fc2a8d615c26';
  test_handles TEXT[] := ARRAY['muazxinthi', 'beemzzllx', 'truunik', 'hopesvl'];
  handle TEXT;
  normalized_handle TEXT;
  profile_id_val UUID;
BEGIN
  -- Verify arena exists
  IF NOT EXISTS (SELECT 1 FROM arenas WHERE id = arena_id_val) THEN
    RAISE EXCEPTION 'Arena % does not exist', arena_id_val;
  END IF;
  
  FOREACH handle IN ARRAY test_handles
  LOOP
    normalized_handle := normalize_username(handle);
    
    IF normalized_handle IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Get profile_id
    SELECT id INTO profile_id_val
    FROM profiles
    WHERE normalize_username(username) = normalized_handle
    LIMIT 1;
    
    -- Insert or update arena_creators
    INSERT INTO arena_creators (
      arena_id,
      profile_id,
      twitter_username,
      arc_points,
      ring,
      style,
      meta,
      created_at,
      updated_at
    )
    VALUES (
      arena_id_val,
      profile_id_val,
      normalized_handle,
      0, -- Will be updated after contributions are inserted
      'discovery',
      NULL,
      '{}'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (arena_id, twitter_username) 
    DO UPDATE SET
      profile_id = COALESCE(EXCLUDED.profile_id, arena_creators.profile_id),
      updated_at = NOW();
    
    RAISE NOTICE 'Inserted/updated arena_creator for @%', normalized_handle;
  END LOOP;
END $$;

-- =============================================================================
-- 3. INSERT TEST CONTRIBUTIONS INTO arc_contributions
-- =============================================================================
-- Use deterministic seed_key in meta to prevent duplicates

DO $$
DECLARE
  arena_id_val UUID := 'f16454be-b0fd-471e-8b84-fc2a8d615c26';
  project_id_val UUID;
  test_handles TEXT[] := ARRAY['muazxinthi', 'beemzzllx', 'truunik', 'hopesvl'];
  handle TEXT;
  normalized_handle TEXT;
  profile_id_val UUID;
  contribution_points INTEGER[] := ARRAY[10, 20, 5]; -- Points for 3 contributions per creator
  point_val INTEGER;
  seed_index INTEGER;
  seed_key TEXT;
  post_id_val TEXT;
  engagement_data JSONB;
BEGIN
  -- Get project_id from arena
  SELECT project_id INTO project_id_val
  FROM arenas
  WHERE id = arena_id_val;
  
  IF project_id_val IS NULL THEN
    RAISE EXCEPTION 'Arena % not found', arena_id_val;
  END IF;
  
  FOREACH handle IN ARRAY test_handles
  LOOP
    normalized_handle := normalize_username(handle);
    
    IF normalized_handle IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Get profile_id
    SELECT id INTO profile_id_val
    FROM profiles
    WHERE normalize_username(username) = normalized_handle
    LIMIT 1;
    
    -- Insert 3 test contributions per creator
    seed_index := 1;
    FOREACH point_val IN ARRAY contribution_points
    LOOP
      seed_key := 'seed_' || normalized_handle || '_' || seed_index;
      post_id_val := 'seed_test_' || normalized_handle || '_' || seed_index;
      
      -- Create engagement_json based on points (simple formula: points = likes + replies*2 + retweets*3)
      -- For seed data, we'll use simple values that match the formula
      -- Example: 10 points = 4 likes + 2 replies*2 + 1 retweet*3 = 4 + 4 + 3 = 11 (close enough)
      engagement_data := jsonb_build_object(
        'likes', GREATEST(1, (point_val * 0.4)::INTEGER),
        'replies', GREATEST(0, (point_val * 0.2)::INTEGER),
        'retweets', GREATEST(0, (point_val * 0.1)::INTEGER),
        'quotes', 0
      );
      
      -- Check if this seed contribution already exists (by post_id or seed_key in meta)
      -- Use post_id as primary check since it's guaranteed unique
      IF NOT EXISTS (
        SELECT 1 FROM arc_contributions
        WHERE arena_id = arena_id_val
          AND project_id = project_id_val
          AND post_id = post_id_val
      ) THEN
        -- Insert contribution (meta column will be added by separate migration if needed)
        -- For now, store seed_key and points in engagement_json if meta doesn't exist
        BEGIN
          INSERT INTO arc_contributions (
            project_id,
            arena_id,
            profile_id,
            twitter_username,
            post_id,
            post_type,
            media_type,
            engagement_json,
            sentiment_score,
            created_at,
            meta
          )
          VALUES (
            project_id_val,
            arena_id_val,
            profile_id_val,
            normalized_handle,
            post_id_val,
            'original',
            'text',
            engagement_data,
            75.0, -- Positive sentiment for seed data
            NOW() - (seed_index || ' days')::INTERVAL, -- Stagger dates
            jsonb_build_object('seed_key', seed_key, 'points', point_val)
          )
          ON CONFLICT (project_id, post_id) DO NOTHING;
        EXCEPTION
          WHEN undefined_column THEN
            -- Meta column doesn't exist, store in engagement_json instead
            INSERT INTO arc_contributions (
              project_id,
              arena_id,
              profile_id,
              twitter_username,
              post_id,
              post_type,
              media_type,
              engagement_json,
              sentiment_score,
              created_at
            )
            VALUES (
              project_id_val,
              arena_id_val,
              profile_id_val,
              normalized_handle,
              post_id_val,
              'original',
              'text',
              engagement_data || jsonb_build_object('seed_key', seed_key, 'points', point_val),
              75.0,
              NOW() - (seed_index || ' days')::INTERVAL
            )
            ON CONFLICT (project_id, post_id) DO NOTHING;
        END;
        
        RAISE NOTICE 'Inserted contribution % for @% with % points', seed_index, normalized_handle, point_val;
      ELSE
        RAISE NOTICE 'Skipped duplicate contribution % for @%', seed_index, normalized_handle;
      END IF;
      
      seed_index := seed_index + 1;
    END LOOP;
  END LOOP;
END $$;

-- =============================================================================
-- 4. UPDATE arena_creators.arc_points FROM CONTRIBUTIONS
-- =============================================================================
-- Recompute points as SUM of contribution points from meta

DO $$
DECLARE
  arena_id_val UUID := 'f16454be-b0fd-471e-8b84-fc2a8d615c26';
  creator_record RECORD;
  total_points NUMERIC;
BEGIN
  -- Update each creator's arc_points from their contributions
  FOR creator_record IN
    SELECT DISTINCT ac.id, ac.twitter_username
    FROM arena_creators ac
    WHERE ac.arena_id = arena_id_val
  LOOP
    -- Sum points from contributions
    -- Try meta->>'points' first, fallback to engagement_json->>'points'
    SELECT COALESCE(
      SUM(
        COALESCE(
          (meta->>'points')::NUMERIC,
          (engagement_json->>'points')::NUMERIC,
          0
        )
      ),
      0
    )
    INTO total_points
    FROM arc_contributions
    WHERE arena_id = arena_id_val
      AND twitter_username = creator_record.twitter_username
      AND (
        (meta IS NOT NULL AND meta->>'points' IS NOT NULL) OR
        (engagement_json->>'points' IS NOT NULL)
      );
    
    -- Update arena_creators
    UPDATE arena_creators
    SET arc_points = total_points,
        updated_at = NOW()
    WHERE id = creator_record.id;
    
    RAISE NOTICE 'Updated @% with % points', creator_record.twitter_username, total_points;
  END LOOP;
END $$;

-- =============================================================================
-- VERIFICATION QUERY (optional - can run separately)
-- =============================================================================
-- Uncomment to verify the seed data:
/*
SELECT 
  ac.twitter_username,
  ac.arc_points,
  ac.ring,
  COUNT(contrib.id) as contribution_count,
  SUM((contrib.meta->>'points')::NUMERIC) as total_contribution_points
FROM arena_creators ac
LEFT JOIN arc_contributions contrib ON 
  contrib.arena_id = ac.arena_id 
  AND contrib.twitter_username = ac.twitter_username
WHERE ac.arena_id = 'f16454be-b0fd-471e-8b84-fc2a8d615c26'
GROUP BY ac.id, ac.twitter_username, ac.arc_points, ac.ring
ORDER BY ac.arc_points DESC;
*/
