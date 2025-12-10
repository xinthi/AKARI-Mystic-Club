/**
 * API Route: POST /api/portal/admin/projects/[id]/refresh
 * 
 * Manually triggers a sentiment/metrics refresh for a single project.
 * 
 * Note: This endpoint calls the sentiment update logic for a single project.
 * It may take some time to complete as it fetches Twitter data and processes it.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type RefreshProjectResponse =
  | {
      ok: true;
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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshProjectResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Check if user is super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Dynamically import processProject from the scripts directory
    // This allows us to use server-side code in the API route
    // Path: from src/web/pages/api/portal/admin/projects/[id]/refresh.ts
    // to scripts/sentiment/updateAllProjects.ts (at project root)
    // Count: [id] -> projects -> admin -> portal -> api -> pages -> web -> src -> root = 8 levels up
    const updateAllProjectsModule = await import('../../../../../../scripts/sentiment/updateAllProjects');
    const { processProject } = updateAllProjectsModule;

    // Process project (this will fetch data and save metrics)
    const result = await processProject(project, today, supabase);

    if (!result) {
      return res.status(500).json({ ok: false, error: 'Failed to process project. Check if project has a valid twitter_username.' });
    }

    // Save metrics with updated_at timestamp
    const metricsWithTimestamp = {
      ...result.metrics,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('metrics_daily')
      .upsert(metricsWithTimestamp, {
        onConflict: 'project_id,date',
      });

    if (upsertError) {
      console.error('[Admin Projects Refresh] Error saving metrics:', upsertError);
      return res.status(500).json({ ok: false, error: 'Failed to save metrics' });
    }

    // Update project with profile data if available
    if (result.projectUpdate) {
      await supabase
        .from('projects')
        .update(result.projectUpdate)
        .eq('id', project.id);
    }

    // Save tweets if available
    if (result.tweets && result.tweets.length > 0) {
      await supabase
        .from('project_tweets')
        .upsert(result.tweets, {
          onConflict: 'tweet_id',
        });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Admin Projects Refresh] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

