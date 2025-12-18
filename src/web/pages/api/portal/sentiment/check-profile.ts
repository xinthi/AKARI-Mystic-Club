/**
 * API Route: GET /api/portal/sentiment/check-profile
 * 
 * Checks if a profile exists in the projects table.
 * Used to determine if we should show the profile type modal.
 * 
 * Query params:
 *   - username: Twitter username (required)
 * 
 * Returns:
 *   - exists: boolean - whether the profile exists in projects table
 *   - project: project data if exists
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

interface CheckProfileResponse {
  ok: boolean;
  exists: boolean;
  project?: {
    id: string;
    slug: string;
    profile_type: 'project' | 'personal' | null;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckProfileResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      exists: false,
      error: 'Method not allowed',
    });
  }

  const { username } = req.query;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      ok: false,
      exists: false,
      error: 'Username is required',
    });
  }

  const cleanUsername = username.replace('@', '').trim().toLowerCase();

  if (!cleanUsername) {
    return res.status(400).json({
      ok: false,
      exists: false,
      error: 'Invalid username',
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check if project exists (by x_handle OR twitter_username)
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, slug, profile_type')
      .or(`x_handle.eq.${cleanUsername},twitter_username.ilike.${cleanUsername}`)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new profiles
      console.error('[Check Profile] Error:', error);
      throw error;
    }

    if (project) {
      return res.status(200).json({
        ok: true,
        exists: true,
        project: {
          id: project.id,
          slug: project.slug,
          profile_type: project.profile_type,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      exists: false,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Check Profile] Error:', err.message);

    return res.status(500).json({
      ok: false,
      exists: false,
      error: 'Failed to check profile',
    });
  }
}

