/**
 * API Route: GET /api/portal/arc/projects/[projectId]/top-tweets
 * 
 * Returns top performing tweets for a project
 * Query params: range (7d|1m|3m), limit (default: 10)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface TopTweet {
  tweet_id: string;
  url: string;
  text: string;
  author_handle: string;
  author_name: string | null;
  author_avatar: string | null;
  created_at: string;
  impressions: number | null;
  engagements: number | null;
  likes: number;
  replies: number;
  reposts: number;
  score: number; // Calculated score for ranking
}

type TopTweetsResponse =
  | { ok: true; tweets: TopTweet[] }
  | { ok: false; error: string };

function getDateRange(range: string): { startDate: Date } {
  const now = new Date();
  const startDate = new Date(now);

  switch (range) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '1m':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3m':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return { startDate };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TopTweetsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { projectId } = req.query;
    const { range = '7d', limit = '10' } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Check ARC access
    const accessCheck = await requireArcAccess(supabase, projectId, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    const { startDate } = getDateRange(range as string);
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    // Fetch top tweets for this project
    const { data: tweets, error } = await supabase
      .from('project_tweets')
      .select(`
        tweet_id,
        tweet_url,
        text,
        author_handle,
        author_name,
        author_profile_image_url,
        created_at,
        impressions,
        likes,
        replies,
        retweets,
        is_official
      `)
      .eq('project_id', projectId)
      .eq('is_official', false)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limitNum * 2); // Get more to calculate scores

    if (error) {
      console.error('[ARC Top Tweets] Error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to fetch tweets' });
    }

    // Calculate score for each tweet
    // Score = (likes * 1) + (replies * 2) + (retweets * 3) + (impressions / 1000)
    const tweetsWithScore: TopTweet[] = (tweets || []).map((tweet) => {
      const likes = tweet.likes || 0;
      const replies = tweet.replies || 0;
      const retweets = tweet.retweets || 0;
      const impressions = tweet.impressions || 0;
      
      const engagementScore = likes + (replies * 2) + (retweets * 3);
      const impressionScore = impressions / 1000;
      const score = engagementScore + impressionScore;

      return {
        tweet_id: tweet.tweet_id || '',
        url: tweet.tweet_url || `https://twitter.com/i/web/status/${tweet.tweet_id}`,
        text: tweet.text || '',
        author_handle: tweet.author_handle || '',
        author_name: tweet.author_name || null,
        author_avatar: tweet.author_profile_image_url || null,
        created_at: tweet.created_at || new Date().toISOString(),
        impressions: impressions > 0 ? impressions : null,
        engagements: engagementScore,
        likes,
        replies,
        reposts: retweets,
        score,
      };
    });

    // Sort by score and return top N
    const topTweets = tweetsWithScore
      .sort((a, b) => b.score - a.score)
      .slice(0, limitNum);

    return res.status(200).json({
      ok: true,
      tweets: topTweets,
    });
  } catch (error: any) {
    console.error('[ARC Top Tweets] Error:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load top tweets' });
  }
}
