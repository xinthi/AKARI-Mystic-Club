/**
 * API Route: POST /api/portal/sentiment/track
 * 
 * Tracks/saves a new Twitter profile from search results to the projects table.
 * This makes the profile appear in the leaderboard for all users.
 * 
 * Request body:
 *   - username: Twitter handle (required)
 *   - name: Display name (optional)
 *   - bio: Profile bio (optional)
 *   - profileImageUrl: Avatar URL (optional)
 *   - followersCount: Follower count (optional)
 * 
 * Returns the tracked project data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface TrackRequest {
  username: string;
  name?: string;
  bio?: string;
  profileImageUrl?: string;
  followersCount?: number;
}

interface TrackedProject {
  id: string;
  slug: string;
  x_handle: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

type TrackResponse =
  | { ok: true; project: TrackedProject; isNew: boolean }
  | { ok: false; error: string };

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a URL-friendly slug from a username
 */
function createSlug(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50);
}

/**
 * Create a Supabase client with service role for write access
 */
function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase service role configuration missing');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// =============================================================================
// API HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrackResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const body: TrackRequest = req.body;

    // Validate required fields
    if (!body.username || typeof body.username !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Username is required',
      });
    }

    const username = body.username.replace('@', '').trim();
    if (username.length < 1 || username.length > 50) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid username',
      });
    }

    const slug = createSlug(username);
    const displayName = body.name || username;

    console.log(`[API /portal/sentiment/track] Tracking profile: @${username}`);

    // Create service client for write access
    const supabase = createServiceClient();

    // Check if project already exists
    const { data: existingProject, error: selectError } = await supabase
      .from('projects')
      .select('*')
      .eq('x_handle', username.toLowerCase())
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new projects
      console.error('[API /portal/sentiment/track] Select error:', selectError);
      throw selectError;
    }

    // If project exists, update it if needed and return
    if (existingProject) {
      console.log(`[API /portal/sentiment/track] Project already tracked: ${existingProject.slug}`);
      
      // Optionally update avatar if we have a new one
      if (body.profileImageUrl && !existingProject.avatar_url) {
        await supabase
          .from('projects')
          .update({ 
            avatar_url: body.profileImageUrl,
            twitter_profile_image_url: body.profileImageUrl,
            last_refreshed_at: new Date().toISOString(),
          })
          .eq('id', existingProject.id);
      }

      return res.status(200).json({
        ok: true,
        project: existingProject,
        isNew: false,
      });
    }

    // Create new project
    const newProject = {
      slug,
      x_handle: username.toLowerCase(),
      name: displayName,
      bio: body.bio || null,
      avatar_url: body.profileImageUrl || null,
      twitter_profile_image_url: body.profileImageUrl || null,
      is_active: true,
      first_tracked_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    };

    const { data: insertedProject, error: insertError } = await supabase
      .from('projects')
      .insert(newProject)
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation (slug or x_handle already exists)
      if (insertError.code === '23505') {
        console.log(`[API /portal/sentiment/track] Project already exists with different casing`);
        
        // Try to fetch the existing project
        const { data: existing } = await supabase
          .from('projects')
          .select('*')
          .or(`slug.eq.${slug},x_handle.eq.${username.toLowerCase()}`)
          .single();

        if (existing) {
          return res.status(200).json({
            ok: true,
            project: existing,
            isNew: false,
          });
        }
      }

      console.error('[API /portal/sentiment/track] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[API /portal/sentiment/track] New project tracked: ${insertedProject.slug}`);

    // Create initial metrics entry with estimated values
    const today = new Date().toISOString().split('T')[0];
    const initialMetrics = {
      project_id: insertedProject.id,
      date: today,
      sentiment_score: 50, // Neutral starting point
      ct_heat_score: 30,   // Low initial engagement
      followers: body.followersCount || 0,
      akari_score: 400,    // Starting AKARI score (Nomad tier)
    };

    const { error: metricsError } = await supabase
      .from('metrics_daily')
      .insert(initialMetrics);

    if (metricsError) {
      console.warn('[API /portal/sentiment/track] Failed to create initial metrics:', metricsError);
      // Don't fail the request - the project is still tracked
    }

    return res.status(201).json({
      ok: true,
      project: insertedProject,
      isNew: true,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API /portal/sentiment/track] Error:', err.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to track profile',
    });
  }
}

