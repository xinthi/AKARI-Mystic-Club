/**
 * API Route: POST /api/portal/sentiment/competitors
 * 
 * Multi-project competitor analysis endpoint.
 * Returns project metrics, topics, and shared inner circle data for up to 5 projects.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface TopTopic {
  topic: string;
  weightedScore: number;
}

interface CompetitorProject {
  id: string;
  name: string;
  slug: string;
  x_handle: string;
  avatar_url: string | null;
  followers: number;
  akariScore: number | null;
  sentiment30d: number | null;
  ctHeat30d: number | null;
  lastUpdatedAt: string | null;
  topTopics: TopTopic[];
  innerCircleCount: number;
  innerCirclePowerTotal: number;
}

type CompetitorsResponse =
  | {
      ok: true;
      projects: CompetitorProject[];
      sharedKOLsAll: string[];
      sharedKOLsPartial: string[];
    }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompetitorsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { projectIds } = req.body;

    // Validate input
    if (!Array.isArray(projectIds) || projectIds.length < 2 || projectIds.length > 5) {
      return res.status(400).json({
        ok: false,
        error: 'projectIds must be an array with 2-5 project IDs',
      });
    }

    const supabase = createPortalClient();

    // Convert slugs to IDs if needed, or use IDs directly
    // First, try to load projects by slug (assuming projectIds are slugs)
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, x_handle, twitter_profile_image_url, avatar_url, inner_circle_count, inner_circle_power')
      .in('slug', projectIds);

    if (projectsError || !projectsData || projectsData.length === 0) {
      return res.status(404).json({ ok: false, error: 'One or more projects not found' });
    }

    // If we got fewer projects than requested, some slugs were invalid
    if (projectsData.length < projectIds.length) {
      return res.status(404).json({ ok: false, error: 'One or more projects not found' });
    }

    const projectIdsList = projectsData.map(p => p.id);

    // Load latest metrics for all projects
    const { data: allMetrics } = await supabase
      .from('metrics_daily')
      .select('project_id, akari_score, sentiment_score, ct_heat_score, followers, updated_at, date')
      .in('project_id', projectIdsList)
      .order('date', { ascending: false });

    // Build a map of latest metrics per project
    const metricsByProject = new Map<string, {
      akari_score: number | null;
      sentiment_score: number | null;
      ct_heat_score: number | null;
      followers: number | null;
      lastUpdatedAt: string | null;
    }>();

    for (const metric of allMetrics || []) {
      if (!metricsByProject.has(metric.project_id)) {
        // Prefer metrics with followers > 0
        if (metric.followers && metric.followers > 0) {
          metricsByProject.set(metric.project_id, {
            akari_score: metric.akari_score,
            sentiment_score: metric.sentiment_score,
            ct_heat_score: metric.ct_heat_score,
            followers: metric.followers,
            lastUpdatedAt: metric.updated_at || metric.date || null,
          });
        }
      }
    }

    // Fill in any missing projects with latest entry regardless of followers
    for (const projectId of projectIdsList) {
      if (!metricsByProject.has(projectId)) {
        const latest = allMetrics?.find(m => m.project_id === projectId);
        if (latest) {
          metricsByProject.set(projectId, {
            akari_score: latest.akari_score,
            sentiment_score: latest.sentiment_score,
            ct_heat_score: latest.ct_heat_score,
            followers: latest.followers,
            lastUpdatedAt: latest.updated_at || latest.date || null,
          });
        }
      }
    }

    // Load topic stats for all projects (30d window)
    const { data: topicStats } = await supabase
      .from('project_topic_stats')
      .select('project_id, topic, weighted_score')
      .in('project_id', projectIdsList)
      .eq('time_window', '30d')
      .order('weighted_score', { ascending: false });

    // Build topic map per project
    const topicsByProject = new Map<string, TopTopic[]>();
    for (const stat of topicStats || []) {
      if (!topicsByProject.has(stat.project_id)) {
        topicsByProject.set(stat.project_id, []);
      }
      const topics = topicsByProject.get(stat.project_id)!;
      topics.push({
        topic: stat.topic,
        weightedScore: stat.weighted_score || 0,
      });
    }

    // Get top 3 topics per project
    for (const [projectId, topics] of topicsByProject.entries()) {
      topics.sort((a, b) => b.weightedScore - a.weightedScore);
      topicsByProject.set(projectId, topics.slice(0, 3));
    }

    // Load inner circle data for all projects
    const { data: innerCircleData } = await supabase
      .from('project_inner_circle')
      .select('project_id, profile_id, weight')
      .in('project_id', projectIdsList);

    // Build inner circle maps
    const innerCircleByProject = new Map<string, {
      profileIds: Set<string>;
      totalPower: number;
    }>();

    for (const projectId of projectIdsList) {
      innerCircleByProject.set(projectId, {
        profileIds: new Set(),
        totalPower: 0,
      });
    }

    for (const circle of innerCircleData || []) {
      const projectCircle = innerCircleByProject.get(circle.project_id);
      if (projectCircle) {
        projectCircle.profileIds.add(circle.profile_id);
        projectCircle.totalPower += circle.weight || 0;
      }
    }

    // Get profile handles for shared KOLs
    const allProfileIds = new Set<string>();
    for (const circle of innerCircleData || []) {
      allProfileIds.add(circle.profile_id);
    }

    const profileIdsArray = Array.from(allProfileIds);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', profileIdsArray);

    const profileHandleMap = new Map<string, string>();
    for (const profile of profilesData || []) {
      profileHandleMap.set(profile.id, profile.username);
    }

    // Compute shared KOLs
    const profileCountByProject = new Map<string, number>();
    for (const circle of innerCircleData || []) {
      const count = profileCountByProject.get(circle.profile_id) || 0;
      profileCountByProject.set(circle.profile_id, count + 1);
    }

    const sharedKOLsAll: string[] = [];
    const sharedKOLsPartial: string[] = [];

    for (const [profileId, count] of profileCountByProject.entries()) {
      const handle = profileHandleMap.get(profileId);
      if (!handle) continue;

      if (count === projectIdsList.length) {
        // Present in all projects
        sharedKOLsAll.push(handle);
      } else if (count >= 2) {
        // Present in at least 2 projects
        sharedKOLsPartial.push(handle);
      }
    }

    // Build response projects array
    const projects: CompetitorProject[] = projectsData.map(project => {
      const metrics = metricsByProject.get(project.id);
      const topics = topicsByProject.get(project.id) || [];
      const innerCircle = innerCircleByProject.get(project.id);

      // Use followers from metrics if available
      const followers = metrics?.followers && metrics.followers > 0
        ? metrics.followers
        : 0;

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        x_handle: project.x_handle,
        avatar_url: project.twitter_profile_image_url || project.avatar_url || null,
        followers,
        akariScore: metrics?.akari_score ?? null,
        sentiment30d: metrics?.sentiment_score ?? null,
        ctHeat30d: metrics?.ct_heat_score ?? null,
        lastUpdatedAt: metrics?.lastUpdatedAt ?? null,
        topTopics: topics,
        innerCircleCount: innerCircle?.profileIds.size || project.inner_circle_count || 0,
        innerCirclePowerTotal: Math.round((innerCircle?.totalPower || project.inner_circle_power || 0) * 100) / 100,
      };
    });

    return res.status(200).json({
      ok: true,
      projects,
      sharedKOLsAll,
      sharedKOLsPartial,
    });
  } catch (error: any) {
    console.error('[API /portal/sentiment/competitors] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch competitor data' });
  }
}

