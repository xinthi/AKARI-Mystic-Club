/**
 * API Route: GET /api/portal/sentiment/compare?slugs=a,b,c
 * 
 * Compare multiple projects and compute inner circle overlap between all pairs.
 * Returns project details and pairwise overlap metrics.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface ProjectComparison {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  twitter_username: string | null;
  twitter_profile_image_url: string | null;
  akari_project_score: number | null;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  followers: number | null;
  followers_delta: number | null;
  inner_circle_count: number | null;
  quality_follower_ratio: number | null;
}

interface InnerCircleOverlap {
  a: string;  // slug A
  b: string;  // slug B
  common_inner_circle_count: number;
  inner_circle_overlap: number;
}

type CompareResponse =
  | {
      ok: true;
      projects: ProjectComparison[];
      inner_circle_overlap: InnerCircleOverlap[];
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompareResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slugs } = req.query;

  if (!slugs || typeof slugs !== 'string') {
    return res.status(400).json({ ok: false, error: 'slugs parameter is required (comma-separated)' });
  }

  const slugArray = slugs.split(',').map(s => s.trim()).filter(s => s.length > 0);

  if (slugArray.length < 2) {
    return res.status(400).json({ ok: false, error: 'At least 2 slugs are required for comparison' });
  }

  if (slugArray.length > 10) {
    return res.status(400).json({ ok: false, error: 'Maximum 10 projects can be compared at once' });
  }

  try {
    const supabase = createPortalClient();

    // Load all projects
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, x_handle, twitter_username, twitter_profile_image_url, avatar_url, inner_circle_count, inner_circle_power, quality_follower_ratio')
      .in('slug', slugArray);

    if (projectsError || !projectsData) {
      return res.status(404).json({ ok: false, error: 'Failed to fetch projects' });
    }

    // Build projects array with latest metrics
    const projects: ProjectComparison[] = [];
    const projectCircles: Map<string, { id: string; slug: string; profileIds: Set<string> }> = new Map();

    for (const project of projectsData) {
      // Get latest metrics
      const { data: metrics } = await supabase
        .from('metrics_daily')
        .select('akari_score, sentiment_score, ct_heat_score, followers, followers_delta, inner_circle_count, quality_follower_ratio')
        .eq('project_id', project.id)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      projects.push({
        id: project.id,
        slug: project.slug,
        name: project.name,
        x_handle: project.x_handle,
        twitter_username: project.twitter_username,
        twitter_profile_image_url: project.twitter_profile_image_url || project.avatar_url,
        akari_project_score: metrics?.akari_score || null,
        sentiment_score: metrics?.sentiment_score || null,
        ct_heat_score: metrics?.ct_heat_score || null,
        followers: metrics?.followers || null,
        followers_delta: metrics?.followers_delta || null,
        inner_circle_count: metrics?.inner_circle_count || project.inner_circle_count || null,
        quality_follower_ratio: metrics?.quality_follower_ratio || project.quality_follower_ratio || null,
      });

      // Load inner circle profile IDs for this project
      const { data: circleData } = await supabase
        .from('project_inner_circle')
        .select('profile_id')
        .eq('project_id', project.id);

      projectCircles.set(project.slug, {
        id: project.id,
        slug: project.slug,
        profileIds: new Set((circleData || []).map(c => c.profile_id)),
      });
    }

    // Compute pairwise inner circle overlap
    const inner_circle_overlap: InnerCircleOverlap[] = [];
    const processedPairs = new Set<string>();

    for (const slugA of slugArray) {
      for (const slugB of slugArray) {
        if (slugA === slugB) continue;

        // Create a canonical pair key to avoid duplicates
        const pairKey = [slugA, slugB].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const circleA = projectCircles.get(slugA);
        const circleB = projectCircles.get(slugB);

        if (!circleA || !circleB) continue;

        // Compute intersection
        const common = [...circleA.profileIds].filter(id => circleB.profileIds.has(id)).length;
        
        // Compute union
        const union = new Set([...circleA.profileIds, ...circleB.profileIds]).size;
        
        // Compute Jaccard similarity
        const overlap = union === 0 ? 0 : common / union;

        inner_circle_overlap.push({
          a: slugA,
          b: slugB,
          common_inner_circle_count: common,
          inner_circle_overlap: Math.round(overlap * 10000) / 10000,
        });
      }
    }

    // Sort overlap by similarity descending
    inner_circle_overlap.sort((a, b) => b.inner_circle_overlap - a.inner_circle_overlap);

    return res.status(200).json({
      ok: true,
      projects,
      inner_circle_overlap,
    });
  } catch (error: any) {
    console.error('[API /portal/sentiment/compare] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to compare projects' });
  }
}

