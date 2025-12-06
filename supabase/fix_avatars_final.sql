-- Fix profile images for projects
-- The avatar_url and twitter_profile_image_url need actual Twitter CDN URLs

-- Cookie3 - Get from their actual Twitter profile
UPDATE projects 
SET 
  avatar_url = 'https://pbs.twimg.com/profile_images/1662845807133548545/u-jAyPXL_400x400.jpg',
  twitter_profile_image_url = 'https://pbs.twimg.com/profile_images/1662845807133548545/u-jAyPXL_400x400.jpg'
WHERE slug = 'cookie3';

-- AKARI / MYSTIC CLUB - MysticHeros actual profile image
UPDATE projects 
SET 
  avatar_url = 'https://pbs.twimg.com/profile_images/1875661929949093888/EkMhAFSZ_400x400.jpg',
  twitter_profile_image_url = 'https://pbs.twimg.com/profile_images/1875661929949093888/EkMhAFSZ_400x400.jpg'
WHERE slug = 'akari' OR x_handle = 'MysticHeros';

-- Update project_tweets with author profile images for the chart markers
UPDATE project_tweets 
SET author_profile_image_url = 'https://pbs.twimg.com/profile_images/1600000003/avatar_400x400.jpg'
WHERE author_handle = 'CryptoKOL';

UPDATE project_tweets 
SET author_profile_image_url = 'https://pbs.twimg.com/profile_images/1600000001/avatar_400x400.jpg'
WHERE author_handle = 'ColobusResearch';

UPDATE project_tweets 
SET author_profile_image_url = 'https://pbs.twimg.com/profile_images/1600000006/avatar_400x400.jpg'
WHERE author_handle = 'AlphaHunter';

-- Verify the updates
SELECT slug, name, x_handle, avatar_url, twitter_profile_image_url 
FROM projects;

