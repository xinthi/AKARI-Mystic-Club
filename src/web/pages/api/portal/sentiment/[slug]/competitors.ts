/**
 * API Route: GET /api/portal/sentiment/[slug]/competitors
 * 
 * Returns competitor projects based on inner circle overlap,
 * plus common high-profile followers between projects.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface CommonProfile {
  id: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
  followers: number;
  akari_profile_score: number | null;
  influence_score: number | null;
}

interface CompetitorProject {
  id: string;
  slug: string;
  name: string;
  twitter_username: string | null;
  avatar_url: string | null;
  akari_score: number | null;
  inner_circle_count: number;
  inner_circle_power: number;
  similarity_percent: number;
  common_profiles_count: number;
}

interface CompareData {
  projectA: {
    id: string;
    slug: string;
    name: string;
    twitter_username: string | null;
    avatar_url: string | null;
    akari_score: number | null;
    inner_circle_count: number;
    inner_circle_power: number;
    followers: number | null;
  };
  projectB: {
    id: string;
    slug: string;
    name: string;
    twitter_username: string | null;
    avatar_url: string | null;
    akari_score: number | null;
    inner_circle_count: number;
    inner_circle_power: number;
    followers: number | null;
  };
  commonProfiles: CommonProfile[];
  similarityPercent: number;
  commonProfilesCount: number;
}

type CompetitorsResponse =
  | {
      ok: true;
      competitors: CompetitorProject[];
      compare?: CompareData;
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
  res: NextApiResponse<CompetitorsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug, compareWith } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    const supabase = createPortalClient();

    // Get the main project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, name, twitter_username, avatar_url, twitter_profile_image_url, inner_circle_count, inner_circle_power')
      .eq('slug', slug)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Get latest metrics for AKARI score and followers
    const { data: latestMetrics } = await supabase
      .from('metrics_daily')
      .select('akari_score, followers')
      .eq('project_id', project.id)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    // Get competitors from project_competitors table
    const { data: competitorData } = await supabase
      .from('project_competitors')
      .select(`
        competitor_id,
        common_inner_circle_count,
        common_inner_circle_power,
        similarity_score,
        projects!project_competitors_competitor_id_fkey (
          id, slug, name, x_handle, avatar_url, twitter_profile_image_url, inner_circle_count
        )
      `)
      .eq('project_id', project.id)
      .order('similarity_score', { ascending: false })
      .limit(10);

    // Build competitors list
    const competitors: CompetitorProject[] = [];
    
    for (const comp of competitorData || []) {
      const compProject = comp.projects as any;
      if (!compProject) continue;

      // Get latest AKARI score for competitor
      const { data: compMetrics } = await supabase
        .from('metrics_daily')
        .select('akari_score')
        .eq('project_id', compProject.id)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      competitors.push({
        id: compProject.id,
        slug: compProject.slug,
        name: compProject.name,
        x_handle: compProject.x_handle,
        avatar_url: compProject.twitter_profile_image_url || compProject.avatar_url,
        akari_score: compMetrics?.akari_score || null,
        inner_circle_count: compProject.inner_circle_count || 0,
        similarity_score: comp.similarity_score || 0,
        common_inner_circle_count: comp.common_inner_circle_count || 0,
        common_inner_circle_power: comp.common_inner_circle_power || 0,
      });
    }

    // If compareWith is provided, get detailed comparison
    let compare: CompareData | undefined;
    
    if (compareWith && typeof compareWith === 'string') {
      // Get the comparison project
      const { data: projectB } = await supabase
        .from('projects')
        .select('id, slug, name, x_handle, avatar_url, twitter_profile_image_url, inner_circle_count, inner_circle_power')
        .eq('slug', compareWith)
        .single();

      if (projectB) {
        // Get projectB metrics
        const { data: projectBMetrics } = await supabase
          .from('metrics_daily')
          .select('akari_score, followers')
          .eq('project_id', projectB.id)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        // Get inner circle members for both projects
        const { data: circleA } = await supabase
          .from('project_inner_circle')
          .select('profile_id')
          .eq('project_id', project.id);

        const { data: circleB } = await supabase
          .from('project_inner_circle')
          .select('profile_id')
          .eq('project_id', projectB.id);

        // Find common profile IDs
        const setA = new Set((circleA || []).map(c => c.profile_id));
        const setB = new Set((circleB || []).map(c => c.profile_id));
        const commonIds = [...setA].filter(id => setB.has(id));

        // Get common profile details
        let commonProfiles: CommonProfile[] = [];
        if (commonIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, name, profile_image_url, followers, akari_profile_score, influence_score')
            .in('id', commonIds)
            .order('influence_score', { ascending: false })
            .limit(20);

          commonProfiles = (profiles || []).map(p => ({
            id: p.id,
            username: p.username,
            name: p.name,
            profile_image_url: p.profile_image_url,
            followers: p.followers || 0,
            akari_profile_score: p.akari_profile_score,
            influence_score: p.influence_score,
          }));
        }

        // Calculate similarity
        const unionSize = new Set([...setA, ...setB]).size;
        const similarityScore = unionSize > 0 ? commonIds.length / unionSize : 0;

        compare = {
          projectA: {
            id: project.id,
            slug: project.slug,
            name: project.name,
            x_handle: project.x_handle,
            avatar_url: project.twitter_profile_image_url || project.avatar_url,
            akari_score: latestMetrics?.akari_score || null,
            inner_circle_count: project.inner_circle_count || 0,
            inner_circle_power: project.inner_circle_power || 0,
            followers: latestMetrics?.followers || null,
          },
          projectB: {
            id: projectB.id,
            slug: projectB.slug,
            name: projectB.name,
            x_handle: projectB.x_handle,
            avatar_url: projectB.twitter_profile_image_url || projectB.avatar_url,
            akari_score: projectBMetrics?.akari_score || null,
            inner_circle_count: projectB.inner_circle_count || 0,
            inner_circle_power: projectB.inner_circle_power || 0,
            followers: projectBMetrics?.followers || null,
          },
          commonProfiles,
          similarityScore: Math.round(similarityScore * 10000) / 10000,
        };
      }
    }

    return res.status(200).json({
      ok: true,
      competitors,
      compare,
    });
  } catch (error: any) {
    console.error(`[API /portal/sentiment/${slug}/competitors] Error:`, error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch competitors' });
  }
}

