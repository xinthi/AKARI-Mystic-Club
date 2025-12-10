/**
 * API Route: GET /api/portal/sentiment/watchlist
 * 
 * Returns the current user's watchlist with project metrics.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface WatchlistProject {
  projectId: string;
  slug: string;
  name: string;
  xHandle: string;
  avatarUrl: string | null;
  twitterProfileImageUrl: string | null;
  akariScore: number | null;
  sentiment: number | null;
  ctHeat: number | null;
  followers: number | null;
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  lastUpdatedAt: string | null;
}

type WatchlistResponse =
  | {
      ok: true;
      projects: WatchlistProject[];
    }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: string
): Promise<string | null> {
  const { data: session, error } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (error || !session) {
    return null;
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return session.user_id;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WatchlistResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get user ID from session
    const userId = await getUserIdFromSession(supabase, sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Get user's watchlist entries
    const { data: watchlistEntries, error: watchlistError } = await supabase
      .from('akari_user_watchlist')
      .select('project_id')
      .eq('user_id', userId);

    if (watchlistError) {
      console.error('[Watchlist API] Error fetching watchlist:', watchlistError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch watchlist' });
    }

    if (!watchlistEntries || watchlistEntries.length === 0) {
      return res.status(200).json({ ok: true, projects: [] });
    }

    const projectIds = watchlistEntries.map((e: any) => e.project_id);

    // Get projects with full details, excluding test/dev accounts
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, x_handle, avatar_url, twitter_profile_image_url')
      .in('id', projectIds)
      .eq('is_active', true)
      .neq('slug', 'dev_user'); // Exclude dev_user from watchlist

    if (projectsError) {
      console.error('[Watchlist API] Error fetching projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch projects' });
    }

    if (!projects || projects.length === 0) {
      return res.status(200).json({ ok: true, projects: [] });
    }

    // Get latest metrics per project (last 2 days for 24h change calculation)
    const projectIdsList = (projects || []).map((p: any) => p.id);
    
    // Get all metrics for these projects, ordered by date descending
    const { data: allMetrics, error: latestError } = await supabase
      .from('metrics_daily')
      .select('project_id, date, sentiment_score, ct_heat_score, akari_score, followers, updated_at, created_at')
      .in('project_id', projectIdsList)
      .order('date', { ascending: false });

    if (latestError) {
      console.error('[Watchlist API] Error fetching latest metrics:', latestError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch metrics' });
    }

    // Group metrics by project_id and get latest + previous
    const metricsByProject = new Map<string, Array<{ date: string; sentiment_score: number | null; ct_heat_score: number | null; akari_score: number | null; followers: number | null; updated_at: string | null; created_at: string | null }>>();
    
    (allMetrics || []).forEach((m: any) => {
      if (!metricsByProject.has(m.project_id)) {
        metricsByProject.set(m.project_id, []);
      }
      const arr = metricsByProject.get(m.project_id)!;
      if (arr.length < 2) {
        arr.push({
          date: m.date,
          sentiment_score: m.sentiment_score,
          ct_heat_score: m.ct_heat_score,
          akari_score: m.akari_score,
          followers: m.followers ?? null,
          updated_at: m.updated_at ?? null,
          created_at: m.created_at ?? null,
        });
      }
    });

    // Build response
    const watchlistProjects: WatchlistProject[] = (projects || []).map((p: any) => {
      const projectMetrics = metricsByProject.get(p.id) || [];
      const latest = projectMetrics[0] || null;
      const previous = projectMetrics[1] || null;

      // Compute 24h changes
      const sentimentChange24h = latest && previous && latest.sentiment_score !== null && previous.sentiment_score !== null
        ? latest.sentiment_score - previous.sentiment_score
        : 0;
      const ctHeatChange24h = latest && previous && latest.ct_heat_score !== null && previous.ct_heat_score !== null
        ? latest.ct_heat_score - previous.ct_heat_score
        : 0;
      const akariChange24h = latest && previous && latest.akari_score !== null && previous.akari_score !== null
        ? latest.akari_score - previous.akari_score
        : 0;

      return {
        projectId: p.id,
        slug: p.slug,
        name: p.name,
        xHandle: p.x_handle || '',
        avatarUrl: p.avatar_url || null,
        twitterProfileImageUrl: p.twitter_profile_image_url || null,
        akariScore: latest?.akari_score ?? null,
        sentiment: latest?.sentiment_score ?? null,
        ctHeat: latest?.ct_heat_score ?? null,
        followers: latest?.followers ?? null,
        sentimentChange24h,
        ctHeatChange24h,
        akariChange24h,
        lastUpdatedAt: latest?.updated_at ?? latest?.created_at ?? latest?.date ?? null,
      };
    });

    return res.status(200).json({ ok: true, projects: watchlistProjects });
  } catch (error: any) {
    console.error('[Watchlist API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

