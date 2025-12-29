/**
 * API Route: GET /api/portal/arc/project-by-slug?slug=<slug>
 * 
 * Intentionally public endpoint - minimal slug resolver for routing.
 * Returns only: id, name, slug, twitter_username, avatar_url.
 * Does NOT return ARC access status, features, or internal settings.
 * ARC access is enforced by /api/portal/arc/state endpoint when needed.
 * 
 * If the requested slug is not the canonical slug, indicates redirect needed.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

type ProjectBySlugResponse =
  | {
      ok: true;
      project: {
        id: string;
        slug: string;
        name: string;
        twitter_username: string;
        avatar_url: string | null;
        header_image_url: string | null;
      };
      canonicalSlug: string;
      wasRedirected: boolean;
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
  res: NextApiResponse<ProjectBySlugResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Slug is required',
    });
  }

  try {
    const supabase = createPortalClient();

    // First try to find project by current slug
    const { data: projectBySlug, error: slugError } = await supabase
      .from('projects')
      .select('id, slug, name, x_handle, avatar_url, header_image_url')
      .eq('slug', slug)
      .single();

    let projectId: string | null = null;
    let project: any = null;

    if (projectBySlug && !slugError) {
      // Found by current slug
      projectId = projectBySlug.id;
      project = projectBySlug;
    } else {
      // Try to resolve via history table directly
      const { data: historyRow } = await supabase
        .from('project_slug_history')
        .select('project_id')
        .eq('slug', slug)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (historyRow) {
        projectId = historyRow.project_id;
      }

      // If we found a project_id from history, fetch the project
      if (projectId) {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, slug, name, x_handle, avatar_url, header_image_url')
          .eq('id', projectId)
          .single();

        if (projectData && !projectError) {
          project = projectData;
        }
      }
    }

    if (!project || !projectId) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
    }

    // Check if requested slug matches canonical slug
    const wasRedirected = slug !== project.slug;
    const canonicalSlug = project.slug;

    return res.status(200).json({
      ok: true,
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        twitter_username: project.x_handle || '',
        avatar_url: project.avatar_url || null,
        header_image_url: project.header_image_url || null,
      },
      canonicalSlug,
      wasRedirected,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/project-by-slug] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

