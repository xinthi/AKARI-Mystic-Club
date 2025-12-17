/**
 * API Route: GET /api/portal/arc/project/[projectId]
 * 
 * Returns project details for ARC project pages.
 * Supports both UUID and slug identifiers.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  display_name: string | null;
  twitter_username: string | null;
  x_handle: string | null;
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
  slug: string | null;
}

type ProjectResponse =
  | { ok: true; project: Project }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProjectResponse>
) {
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = createPortalClient();
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID or slug is required' });
    }

    // Try to find project by ID first, then by slug
    // Support both UUID and slug identifiers
    let projectData: any = null;
    let projectError: any = null;

    // Try ID first (UUID format)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    
    if (isUUID) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, display_name, twitter_username, x_handle, avatar_url, arc_access_level, arc_active, slug')
        .eq('id', projectId)
        .single();
      projectData = data;
      projectError = error;
    } else {
      // Try slug
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, display_name, twitter_username, x_handle, avatar_url, arc_access_level, arc_active, slug')
        .eq('slug', projectId)
        .single();
      projectData = data;
      projectError = error;
    }

    // Handle "not found" error gracefully (PGRST116 is the code for no rows)
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        return res.status(404).json({ ok: false, error: 'Project not found' });
      }
      console.error('[API /portal/arc/project/[projectId]] Supabase error:', projectError);
      return res.status(500).json({ ok: false, error: 'Failed to load project' });
    }

    if (!projectData) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Normalize twitter_username (use x_handle if twitter_username is null)
    const normalizedProject: Project = {
      ...projectData,
      twitter_username: projectData.twitter_username || projectData.x_handle || null,
    };

    return res.status(200).json({
      ok: true,
      project: normalizedProject,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/project/[projectId]] Error:', error);
    
    // Check for Supabase configuration errors
    if (error.message?.includes('Supabase configuration') || error.message?.includes('missing')) {
      return res.status(503).json({
        ok: false,
        error: 'Service configuration error. Please contact support.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

