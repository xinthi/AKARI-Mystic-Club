/**
 * API Route: GET /api/portal/share/profile-card/[slug]
 * 
 * Returns the image URL for the shareable profile card.
 * The actual image generation is handled client-side using html2canvas
 * for better compatibility with the Pages Router.
 * 
 * This endpoint can be used to get the card data or as a fallback
 * if we implement server-side rendering later.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createPortalClient,
  getProjectBySlug,
  getProjectMetricsHistory,
} from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

type ProfileCardResponse = 
  | { ok: true; data: {
      avatar: string | null;
      username: string;
      tier: string;
      score: number | null;
      sentiment: number | null;
      heat: number | null;
      power: number | null;
      tagline: string;
      displayName: string;
    }}
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getTagline(score: number | null): string {
  if (score === null) return 'A quiet force in the shadows.';
  if (score > 900) return 'Your presence bends the narrative.';
  if (score >= 500) return 'Known in the Club.';
  return 'A quiet force in the shadows.';
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileCardResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    const supabase = createPortalClient();

    // Fetch project by slug
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Fetch latest metrics
    const metrics = await getProjectMetricsHistory(supabase, project.id, 1);
    const latestMetrics = metrics.length > 0 ? metrics[0] : null;

    // Get user tier (simplified - in production, fetch actual user tier)
    const akariScore = latestMetrics?.akari_score ?? null;
    let tier = 'Seer';
    if (akariScore !== null) {
      if (akariScore >= 900) tier = 'Institutional Plus';
      else if (akariScore >= 500) tier = 'Analyst';
      else tier = 'Seer';
    }

    // Prepare data
    const avatar = project.twitter_profile_image_url || project.avatar_url || null;
    const username = project.x_handle || project.slug;
    const score = akariScore;
    const sentiment = latestMetrics?.sentiment_score ?? null;
    const heat = latestMetrics?.ct_heat_score ?? null;
    const power = (project as any).inner_circle_power ?? null;
    const tagline = getTagline(score);

    // Return card data (client will generate image using html2canvas)
    return res.status(200).json({
      ok: true,
      data: {
        avatar,
        username,
        tier,
        score,
        sentiment,
        heat,
        power,
        tagline,
        displayName: project.name,
      },
    });
  } catch (error: any) {
    console.error(`[API /portal/share/profile-card/${slug}] Error:`, error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch profile card data' });
  }
}
