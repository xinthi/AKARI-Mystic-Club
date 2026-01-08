/**
 * API Route: GET /api/portal/sentiment/profile/[username]
 * 
 * Fetches detailed profile information for a Twitter user.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserProfile, getUserTweets, TwitterUserProfile, TwitterTweet } from '@/lib/twitter/twitter';
import { fetchAvatarForUsername, normalizeTwitterUsername } from '@/lib/portal/avatar-helper';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

interface ProfileResponse {
  ok: boolean;
  profile?: {
    username: string;
    name: string;
    profileImageUrl: string | null;
    bio: string | null;
    followers: number;
    following: number;
    tweetCount: number;
    verified: boolean;
    createdAt: string | null;
  };
  project?: {
    id: string;
    profile_type: 'project' | 'personal' | null;
    is_company: boolean;
  } | null;
  tweets?: {
    id: string;
    text: string;
    createdAt: string;
    likeCount: number;
    retweetCount: number;
    replyCount: number;
  }[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ ok: false, error: 'Username is required' });
  }

  const cleanUsername = username.replace('@', '').trim();

  if (!cleanUsername) {
    return res.status(400).json({ ok: false, error: 'Invalid username' });
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Try to get avatar from DB first (DB-only approach)
    const normalizedUsername = normalizeTwitterUsername(cleanUsername);
    let dbAvatarUrl: string | null = null;
    try {
      dbAvatarUrl = await fetchAvatarForUsername(supabase, normalizedUsername);
      console.log(`[Profile API] DB avatar lookup for ${normalizedUsername}: ${dbAvatarUrl ? 'found' : 'not found'}`);
    } catch (dbErr) {
      console.warn(`[Profile API] Error fetching avatar from DB:`, dbErr);
    }
    
    // Fetch profile from Twitter API (still needed for other data like bio, followers, etc.)
    // But we'll prefer DB avatar if available
    const userProfile = await getUserProfile(cleanUsername);

    if (!userProfile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }

    // Fetch recent tweets
    let tweets: TwitterTweet[] = [];
    try {
      tweets = await getUserTweets(cleanUsername, 10);
    } catch (e) {
      console.warn(`[Profile API] Could not fetch tweets for ${cleanUsername}:`, e);
      // Continue without tweets
    }

    // Normalize the profile data - prefer DB avatar over API avatar
    const profile = {
      username: userProfile.handle || cleanUsername,
      name: userProfile.name || cleanUsername,
      profileImageUrl: dbAvatarUrl || userProfile.profileImageUrl || userProfile.avatarUrl || null,
      bio: userProfile.bio || null,
      followers: userProfile.followersCount || 0,
      following: userProfile.followingCount || 0,
      tweetCount: userProfile.tweetCount || 0,
      verified: userProfile.verified || false,
      createdAt: userProfile.createdAt || null,
    };

    // Normalize tweets
    const normalizedTweets = tweets.map((t) => ({
      id: t.id,
      text: t.text,
      createdAt: t.createdAt,
      likeCount: t.likeCount || 0,
      retweetCount: t.retweetCount || 0,
      replyCount: t.replyCount || 0,
    }));

    // Check if this profile is tracked as a project
    let projectData = null;
    try {
      const supabase = getSupabaseAdmin();
      const { data: project } = await supabase
        .from('projects')
        .select('id, profile_type, is_company')
        .ilike('x_handle', cleanUsername.toLowerCase())
        .or(`twitter_username.ilike.%${cleanUsername.toLowerCase()}%`)
        .maybeSingle();
      
      if (project) {
        projectData = {
          id: project.id,
          profile_type: project.profile_type,
          is_company: project.is_company || false,
        };
      }
    } catch (e) {
      console.warn('[Profile API] Could not fetch project data:', e);
      // Continue without project data
    }

    return res.status(200).json({
      ok: true,
      profile,
      project: projectData,
      tweets: normalizedTweets,
    });
  } catch (error) {
    console.error('[Profile API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
}

