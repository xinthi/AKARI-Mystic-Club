/**
 * API Route: GET /api/portal/sentiment/profile/[username]
 * 
 * Fetches detailed profile information for a Twitter user.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserProfile, getUserTweets, TwitterUserProfile, TwitterTweet } from '@/lib/rapidapi/twitter';

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
    // Fetch profile
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

    // Normalize the profile data
    const profile = {
      username: userProfile.handle || cleanUsername,
      name: userProfile.name || cleanUsername,
      profileImageUrl: userProfile.profileImageUrl || userProfile.avatarUrl || null,
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

    return res.status(200).json({
      ok: true,
      profile,
      tweets: normalizedTweets,
    });
  } catch (error) {
    console.error('[Profile API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
}

