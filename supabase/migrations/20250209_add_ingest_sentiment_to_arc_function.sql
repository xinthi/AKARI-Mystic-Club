-- =============================================================================
-- Migration: Add ingest_sentiment_to_arc Function
-- Purpose: Ingest qualified contributors from Sentiment into ARC when project is approved
-- Date: 2025-02-09
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- HELPER FUNCTION: Normalize Twitter Username (if not exists)
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
-- FUNCTION: ingest_sentiment_to_arc
-- =============================================================================
-- Ingest qualified contributors from Sentiment tables into ARC
-- 
-- Parameters:
--   p_arena_id UUID - The arena to ingest into
--   p_project_id UUID - The project this arena belongs to
--   p_since TIMESTAMPTZ - Only ingest contributions since this timestamp (default: arena.starts_at)
--
-- Logic:
--   1. Query project_tweets for qualified contributions (non-official, above threshold)
--   2. Normalize handles and upsert profiles (never create duplicates)
--   3. Insert/upsert arena_creators for that arena
--   4. Insert arc_contributions with deterministic uniqueness
--   5. Recompute arena_creators.arc_points as SUM of contribution points
--
-- Guardrails:
--   - Never overwrite non-empty projects.twitter_username
--   - Never overwrite non-null profile_image_url with NULL
--   - Prefer lowercase canonical profile (username = lower(trim(username)))
--   - Use deterministic keys for uniqueness (project_id + tweet_id)

CREATE OR REPLACE FUNCTION ingest_sentiment_to_arc(
  p_arena_id UUID,
  p_project_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  creators_processed INTEGER,
  contributions_inserted INTEGER,
  profiles_created INTEGER,
  errors TEXT[]
) AS $$
DECLARE
  v_arena_starts_at TIMESTAMPTZ;
  v_since_timestamp TIMESTAMPTZ;
  v_creators_count INTEGER := 0;
  v_contributions_count INTEGER := 0;
  v_profiles_created_count INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_tweet_record RECORD;
  v_normalized_handle TEXT;
  v_profile_id UUID;
  v_arena_creator_id UUID;
  v_points NUMERIC;
  v_engagement_json JSONB;
  v_sentiment_score NUMERIC;
  v_existing_contrib_id UUID;
  v_processed_handles TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Validate arena exists and belongs to project
  SELECT starts_at INTO v_arena_starts_at
  FROM arenas
  WHERE id = p_arena_id AND project_id = p_project_id;
  
  IF v_arena_starts_at IS NULL THEN
    RAISE EXCEPTION 'Arena % not found or does not belong to project %', p_arena_id, p_project_id;
  END IF;
  
  -- Determine since timestamp
  v_since_timestamp := COALESCE(p_since, v_arena_starts_at);
  
  -- Process each qualified tweet from project_tweets
  FOR v_tweet_record IN
    SELECT 
      pt.tweet_id,
      pt.author_handle,
      pt.created_at,
      pt.text,
      pt.likes,
      pt.replies,
      pt.retweets,
      pt.quote_count,
      pt.sentiment_score,
      pt.author_profile_image_url
    FROM project_tweets pt
    WHERE pt.project_id = p_project_id
      AND pt.is_official = false -- Only non-official tweets (mentions)
      AND pt.created_at >= v_since_timestamp
      AND pt.author_handle IS NOT NULL
      AND pt.author_handle != '' -- Quality threshold: must have author
    ORDER BY pt.created_at DESC
  LOOP
    BEGIN
      -- Normalize handle
      v_normalized_handle := normalize_username(v_tweet_record.author_handle);
      
      IF v_normalized_handle IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Find or create profile (never create duplicates)
      SELECT id INTO v_profile_id
      FROM profiles
      WHERE normalize_username(username) = v_normalized_handle
      ORDER BY 
        CASE WHEN username = lower(trim(username)) THEN 0 ELSE 1 END, -- Prefer canonical lowercase
        created_at ASC -- Prefer oldest if multiple
      LIMIT 1;
      
      -- Create profile if missing (minimal row)
      IF v_profile_id IS NULL THEN
        -- Try to insert, catch unique violation if profile exists
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
            v_normalized_handle,
            NULL,
            v_tweet_record.author_profile_image_url, -- Use from tweet if available
            NULL,
            0,
            0,
            0,
            NOW(),
            NOW()
          )
          RETURNING id INTO v_profile_id;
          
          -- If we got here, insert succeeded
          v_profiles_created_count := v_profiles_created_count + 1;
        EXCEPTION
          WHEN unique_violation THEN
            -- Profile already exists, fetch it
            SELECT id INTO v_profile_id
            FROM profiles
            WHERE username = v_normalized_handle
            LIMIT 1;
        END;
      ELSE
        -- Update profile_image_url if missing and we have one from tweet
        IF v_tweet_record.author_profile_image_url IS NOT NULL THEN
          UPDATE profiles
          SET profile_image_url = COALESCE(profile_image_url, v_tweet_record.author_profile_image_url),
              updated_at = NOW()
          WHERE id = v_profile_id
            AND profile_image_url IS NULL; -- Only update if currently NULL
        END IF;
      END IF;
      
      -- Calculate points using ARC formula
      -- Current: Simple formula (likes + replies*2 + retweets*3) - matches quest leaderboard
      -- Future: Use full ARC scoring formula from scoring.ts (base * sentiment_multiplier * (1 + engagement_bonus))
      -- For now, we use the simple formula and store in meta->>'points'
      v_points := COALESCE(v_tweet_record.likes, 0)::NUMERIC + 
                  COALESCE(v_tweet_record.replies, 0)::NUMERIC * 2 + 
                  COALESCE(v_tweet_record.retweets, 0)::NUMERIC * 3;
      
      -- Ensure minimum 1 point for any contribution
      IF v_points < 1 THEN
        v_points := 1;
      END IF;
      
      -- Build engagement_json
      v_engagement_json := jsonb_build_object(
        'likes', COALESCE(v_tweet_record.likes, 0),
        'replies', COALESCE(v_tweet_record.replies, 0),
        'retweets', COALESCE(v_tweet_record.retweets, 0),
        'quotes', COALESCE(v_tweet_record.quote_count, 0)
      );
      
      -- Get sentiment score (0-100, convert to -1 to 1 scale if needed)
      v_sentiment_score := COALESCE(v_tweet_record.sentiment_score, 50.0);
      
      -- Check if contribution already exists (deterministic uniqueness)
      SELECT id INTO v_existing_contrib_id
      FROM arc_contributions
      WHERE project_id = p_project_id
        AND post_id = v_tweet_record.tweet_id;
      
      -- Insert contribution if not exists
      IF v_existing_contrib_id IS NULL THEN
        -- Try with meta column first, fallback to engagement_json if meta doesn't exist
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
            p_project_id,
            p_arena_id,
            v_profile_id,
            v_normalized_handle,
            v_tweet_record.tweet_id,
            'original', -- Default, can be enhanced to detect quote/reply/retweet
            'text', -- Default, can be enhanced to detect media type
            v_engagement_json,
            v_sentiment_score,
            v_tweet_record.created_at,
            jsonb_build_object('points', v_points, 'source', 'sentiment_ingestion')
          )
          ON CONFLICT (project_id, post_id) DO NOTHING
          RETURNING id INTO v_existing_contrib_id;
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
              p_project_id,
              p_arena_id,
              v_profile_id,
              v_normalized_handle,
              v_tweet_record.tweet_id,
              'original',
              'text',
              v_engagement_json || jsonb_build_object('points', v_points, 'source', 'sentiment_ingestion'),
              v_sentiment_score,
              v_tweet_record.created_at
            )
            ON CONFLICT (project_id, post_id) DO NOTHING
            RETURNING id INTO v_existing_contrib_id;
        END;
        
        -- Count if insert succeeded
        IF v_existing_contrib_id IS NOT NULL THEN
          v_contributions_count := v_contributions_count + 1;
        END IF;
      END IF;
      
      -- Track unique creators processed (only count once per handle in this run)
      IF NOT (v_normalized_handle = ANY(v_processed_handles)) THEN
        v_processed_handles := array_append(v_processed_handles, v_normalized_handle);
        v_creators_count := v_creators_count + 1;
      END IF;
      
      -- Insert or update arena_creators
      INSERT INTO arena_creators (
        arena_id,
        profile_id,
        twitter_username,
        arc_points, -- Will be recomputed below
        ring,
        style,
        meta,
        created_at,
        updated_at
      )
      VALUES (
        p_arena_id,
        v_profile_id,
        v_normalized_handle,
        0, -- Temporary, will be recomputed
        'discovery', -- Default ring, can be enhanced based on points/engagement
        NULL,
        '{}'::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (arena_id, twitter_username)
      DO UPDATE SET
        profile_id = COALESCE(EXCLUDED.profile_id, arena_creators.profile_id),
        updated_at = NOW();
      
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := array_append(v_errors, 
          format('Error processing tweet %s (@%s): %s', 
            v_tweet_record.tweet_id, 
            v_normalized_handle, 
            SQLERRM));
        CONTINUE;
    END;
  END LOOP;
  
  -- Recompute arena_creators.arc_points from contributions
  -- Sum points from meta->>'points' or engagement_json->>'points' (depending on which exists)
  -- Note: If points column is added to arc_contributions in future, use that instead
  UPDATE arena_creators ac
  SET arc_points = COALESCE((
    SELECT SUM(
      COALESCE(
        (meta->>'points')::NUMERIC, -- Try meta first
        (engagement_json->>'points')::NUMERIC, -- Fallback to engagement_json
        0
      )
    )
    FROM arc_contributions contrib
    WHERE contrib.arena_id = ac.arena_id
      AND contrib.twitter_username = ac.twitter_username
      AND (
        (meta IS NOT NULL AND meta->>'points' IS NOT NULL) OR
        (engagement_json->>'points' IS NOT NULL)
      )
  ), 0),
  updated_at = NOW()
  WHERE ac.arena_id = p_arena_id;
  
  -- Return results
  RETURN QUERY SELECT
    v_creators_count,
    v_contributions_count,
    v_profiles_created_count,
    v_errors;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ADD INDEXES FOR PERFORMANCE
-- =============================================================================

-- Composite index for arena_creators lookups
CREATE INDEX IF NOT EXISTS idx_arena_creators_arena_profile 
  ON arena_creators(arena_id, profile_id)
  WHERE profile_id IS NOT NULL;

-- Composite index for arc_contributions lookups
CREATE INDEX IF NOT EXISTS idx_arc_contributions_arena_profile 
  ON arc_contributions(arena_id, profile_id)
  WHERE profile_id IS NOT NULL;

-- Functional index on profiles.username for case-insensitive lookups (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_profiles_username_normalized'
  ) THEN
    CREATE INDEX idx_profiles_username_normalized 
      ON profiles(lower(trim(username)))
      WHERE username IS NOT NULL;
  END IF;
END $$;

-- Index for project_tweets queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_project_tweets_project_created_author
  ON project_tweets(project_id, created_at DESC, author_handle)
  WHERE is_official = false;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================
-- Function should be callable by service_role
GRANT EXECUTE ON FUNCTION ingest_sentiment_to_arc(UUID, UUID, TIMESTAMPTZ) TO service_role;
