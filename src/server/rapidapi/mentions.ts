/**
 * RapidAPI Twitter Mentions Helper Module
 * 
 * Uses the "Get Twitter Mentions" API to fetch tweets mentioning a keyword.
 * Host: get-twitter-mentions.p.rapidapi.com
 * 
 * ⚠️ SERVER-SIDE ONLY - Never import this in frontend code!
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const MENTIONS_API_HOST = 'get-twitter-mentions.p.rapidapi.com';
const MENTIONS_API_BASE = `https://${MENTIONS_API_HOST}`;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Normalized mention result
 */
export interface MentionResult {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
}

/**
 * Parameters for fetching mentions
 */
export interface FetchMentionsParams {
  /** Keyword to search for (handle, token, or name) */
  keyword: string;
  /** Period in days (maps to RapidAPI "period" param), default 1 */
  periodDays?: number;
  /** Maximum results to return (client-side trim), default 100 */
  limit?: number;
}

/**
 * Raw API response item (structure may vary)
 */
interface RawMentionItem {
  id?: string;
  id_str?: string;
  tweet_id?: string;
  text?: string;
  full_text?: string;
  content?: string;
  user?: {
    screen_name?: string;
    name?: string;
  };
  author?: string;
  screen_name?: string;
  username?: string;
  created_at?: string;
  date?: string;
  timestamp?: string;
  favorite_count?: number;
  like_count?: number;
  likes?: number;
  retweet_count?: number;
  retweets?: number;
  reply_count?: number;
  replies?: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate that RAPIDAPI_KEY is set
 */
function validateApiKey(): void {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY environment variable is not set');
  }
}

/**
 * Normalize a raw mention item into MentionResult
 */
function normalizeMentionItem(raw: unknown): MentionResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as RawMentionItem;

  // Extract ID
  const id = item.id?.toString() || item.id_str || item.tweet_id || '';
  if (!id) {
    return null;
  }

  // Extract text
  const text = item.text || item.full_text || item.content || '';
  if (!text) {
    return null;
  }

  // Extract author
  const author = 
    item.user?.screen_name || 
    item.author || 
    item.screen_name || 
    item.username || 
    'unknown';

  // Extract created date
  const createdAt = item.created_at || item.date || item.timestamp || '';

  // Extract engagement metrics
  const likeCount = item.favorite_count ?? item.like_count ?? item.likes;
  const retweetCount = item.retweet_count ?? item.retweets;
  const replyCount = item.reply_count ?? item.replies;

  return {
    id,
    text,
    author,
    createdAt,
    ...(likeCount !== undefined && { likeCount }),
    ...(retweetCount !== undefined && { retweetCount }),
    ...(replyCount !== undefined && { replyCount }),
  };
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Fetch Twitter mentions for a keyword.
 * 
 * @param params - Search parameters
 * @returns Array of normalized mention results
 */
export async function fetchProjectMentions(
  params: FetchMentionsParams
): Promise<MentionResult[]> {
  validateApiKey();

  const { keyword, periodDays = 1, limit = 100 } = params;

  try {
    const response = await axios.get(MENTIONS_API_BASE, {
      params: {
        keyword: keyword,
        period: periodDays,
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': MENTIONS_API_HOST,
      },
      timeout: 30000,
    });

    const data = response.data;

    // Handle different response structures
    let rawItems: unknown[] = [];

    if (Array.isArray(data)) {
      rawItems = data;
    } else if (data && typeof data === 'object') {
      // Try common wrapper fields
      rawItems = 
        (data as Record<string, unknown>).tweets ||
        (data as Record<string, unknown>).mentions ||
        (data as Record<string, unknown>).results ||
        (data as Record<string, unknown>).data ||
        [];
      
      if (!Array.isArray(rawItems)) {
        rawItems = [];
      }
    }

    // Normalize and filter valid items
    const mentions: MentionResult[] = [];
    for (const rawItem of rawItems) {
      const normalized = normalizeMentionItem(rawItem);
      if (normalized) {
        mentions.push(normalized);
      }
    }

    // Apply client-side limit
    return mentions.slice(0, limit);
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: unknown }; message?: string };
    console.error(
      '[RapidAPI:mentions] Error fetching mentions:',
      axiosError.response?.data || axiosError.message
    );
    throw new Error('Twitter mentions API request failed');
  }
}

/**
 * Fetch mentions for a Twitter handle (convenience wrapper)
 */
export async function fetchHandleMentions(
  handle: string,
  periodDays?: number,
  limit?: number
): Promise<MentionResult[]> {
  const cleanHandle = handle.replace('@', '');
  return fetchProjectMentions({
    keyword: `@${cleanHandle}`,
    periodDays,
    limit,
  });
}

/**
 * Fetch mentions for a token ticker (convenience wrapper)
 */
export async function fetchTickerMentions(
  ticker: string,
  periodDays?: number,
  limit?: number
): Promise<MentionResult[]> {
  const cleanTicker = ticker.replace('$', '').toUpperCase();
  return fetchProjectMentions({
    keyword: `$${cleanTicker}`,
    periodDays,
    limit,
  });
}

/**
 * Calculate statistics from mentions
 */
export function calculateMentionStats(mentions: MentionResult[]): {
  count: number;
  totalLikes: number;
  totalRetweets: number;
  avgLikes: number;
  avgRetweets: number;
  uniqueAuthors: number;
} {
  if (mentions.length === 0) {
    return {
      count: 0,
      totalLikes: 0,
      totalRetweets: 0,
      avgLikes: 0,
      avgRetweets: 0,
      uniqueAuthors: 0,
    };
  }

  const authorSet = new Set<string>();
  let totalLikes = 0;
  let totalRetweets = 0;

  for (const mention of mentions) {
    totalLikes += mention.likeCount ?? 0;
    totalRetweets += mention.retweetCount ?? 0;
    authorSet.add(mention.author.toLowerCase());
  }

  return {
    count: mentions.length,
    totalLikes,
    totalRetweets,
    avgLikes: totalLikes / mentions.length,
    avgRetweets: totalRetweets / mentions.length,
    uniqueAuthors: authorSet.size,
  };
}
