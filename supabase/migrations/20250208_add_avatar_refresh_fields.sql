-- Add avatar refresh tracking fields to profiles table
-- This enables DB-only leaderboard rendering with separate avatar refresh job

DO $$ 
BEGIN
  -- Add avatar_updated_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'avatar_updated_at'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN avatar_updated_at TIMESTAMPTZ;
    
    -- Set initial value for existing rows with profile_image_url
    UPDATE profiles 
    SET avatar_updated_at = updated_at 
    WHERE profile_image_url IS NOT NULL AND avatar_updated_at IS NULL;
  END IF;

  -- Add needs_avatar_refresh if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'needs_avatar_refresh'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN needs_avatar_refresh BOOLEAN DEFAULT FALSE;
    
    -- Set initial value: true if profile_image_url is null
    UPDATE profiles 
    SET needs_avatar_refresh = TRUE 
    WHERE profile_image_url IS NULL;
  END IF;
END $$;

-- Create index for efficient querying of profiles needing refresh
CREATE INDEX IF NOT EXISTS idx_profiles_needs_avatar_refresh 
ON profiles(needs_avatar_refresh) 
WHERE needs_avatar_refresh = TRUE;

-- Create index for efficient querying of old avatars
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_updated_at 
ON profiles(avatar_updated_at) 
WHERE avatar_updated_at IS NOT NULL;
