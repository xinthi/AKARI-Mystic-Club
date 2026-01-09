-- =============================================================================
-- Migration: Avatar Backfill and Guardrails
-- Purpose: Fill missing profile_image_url from duplicates and add guardrails
-- Date: 2025-02-09
-- =============================================================================

-- =============================================================================
-- 1. AVATAR BACKFILL: Fill missing profile_image_url from duplicates
-- =============================================================================
-- For profiles with NULL or empty profile_image_url, find the best non-null
-- image among duplicates of the same normalized username and fill it.

DO $$
DECLARE
  profile_record RECORD;
  best_avatar_url TEXT;
  normalized_username TEXT;
  updated_count INTEGER := 0;
BEGIN
  -- Process profiles with missing avatars
  FOR profile_record IN
    SELECT 
      id,
      username,
      profile_image_url
    FROM profiles
    WHERE (profile_image_url IS NULL OR profile_image_url = '')
      AND username IS NOT NULL
      AND username != ''
  LOOP
    normalized_username := lower(trim(regexp_replace(profile_record.username, '^@+', '', 'g')));
    
    IF normalized_username IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Find best avatar among duplicates (prefer non-null, prefer canonical lowercase)
    SELECT profile_image_url INTO best_avatar_url
    FROM profiles
    WHERE lower(trim(regexp_replace(username, '^@+', '', 'g'))) = normalized_username
      AND profile_image_url IS NOT NULL
      AND profile_image_url != ''
      AND profile_image_url LIKE 'http%' -- Must be valid URL
    ORDER BY
      CASE WHEN username = lower(trim(username)) THEN 0 ELSE 1 END, -- Prefer canonical
      updated_at DESC -- Prefer most recently updated
    LIMIT 1;
    
    -- Update if we found a valid avatar
    IF best_avatar_url IS NOT NULL THEN
      UPDATE profiles
      SET profile_image_url = best_avatar_url,
          avatar_updated_at = COALESCE(avatar_updated_at, NOW()),
          updated_at = NOW()
      WHERE id = profile_record.id
        AND (profile_image_url IS NULL OR profile_image_url = '');
      
      IF FOUND THEN
        updated_count := updated_count + 1;
        RAISE NOTICE 'Updated profile % (@%) with avatar from duplicate', profile_record.id, profile_record.username;
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Avatar backfill completed: % profiles updated', updated_count;
END $$;

-- =============================================================================
-- 2. ADD TRIGGER TO PREVENT OVERWRITING NON-NULL profile_image_url WITH NULL
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_avatar_null_overwrite()
RETURNS TRIGGER AS $$
BEGIN
  -- If new value is NULL/empty and old value was not NULL/empty, keep old value
  IF (NEW.profile_image_url IS NULL OR NEW.profile_image_url = '') 
     AND (OLD.profile_image_url IS NOT NULL AND OLD.profile_image_url != '') THEN
    NEW.profile_image_url := OLD.profile_image_url;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_prevent_avatar_null_overwrite ON profiles;

-- Create trigger
CREATE TRIGGER trigger_prevent_avatar_null_overwrite
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.profile_image_url IS NULL OR NEW.profile_image_url = '')
  EXECUTE FUNCTION prevent_avatar_null_overwrite();

-- =============================================================================
-- 3. ADD TRIGGER TO PREVENT OVERWRITING NON-EMPTY projects.twitter_username
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_twitter_username_overwrite()
RETURNS TRIGGER AS $$
BEGIN
  -- If old value is not NULL/empty and new value is different, keep old value
  IF (OLD.twitter_username IS NOT NULL AND OLD.twitter_username != '')
     AND (NEW.twitter_username IS NULL OR NEW.twitter_username = '' OR NEW.twitter_username != OLD.twitter_username) THEN
    NEW.twitter_username := OLD.twitter_username;
    RAISE WARNING 'Attempted to overwrite non-empty twitter_username for project %. Keeping original value: %', 
      NEW.id, OLD.twitter_username;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_prevent_twitter_username_overwrite ON projects;

-- Create trigger
CREATE TRIGGER trigger_prevent_twitter_username_overwrite
  BEFORE UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.twitter_username IS NOT NULL AND OLD.twitter_username != '')
  EXECUTE FUNCTION prevent_twitter_username_overwrite();

-- =============================================================================
-- VERIFICATION QUERIES (optional - can run separately)
-- =============================================================================
-- Uncomment to verify:

/*
-- Check profiles with missing avatars
SELECT 
  username,
  profile_image_url,
  avatar_updated_at,
  needs_avatar_refresh
FROM profiles
WHERE (profile_image_url IS NULL OR profile_image_url = '')
  AND username IS NOT NULL
ORDER BY username;

-- Check for duplicate usernames (normalized)
SELECT 
  lower(trim(regexp_replace(username, '^@+', '', 'g'))) as normalized_username,
  COUNT(*) as count,
  array_agg(username) as usernames,
  array_agg(profile_image_url) as avatars
FROM profiles
WHERE username IS NOT NULL
GROUP BY lower(trim(regexp_replace(username, '^@+', '', 'g')))
HAVING COUNT(*) > 1
ORDER BY count DESC;
*/
