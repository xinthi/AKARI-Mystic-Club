/**
 * API Route: /api/portal/creator-manager/programs/[programId]/links
 * 
 * GET: List links for a program
 * POST: Create a new link with UTM parameters
 * 
 * Permissions: Only project admins and moderators can create links
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateLinkRequest {
  label: string;
  url: string;
}

interface Link {
  id: string;
  program_id: string;
  label: string;
  url: string;
  utm_url: string;
  created_at: string;
}

type LinksResponse =
  | { ok: true; links: Link[] }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  return {
    userId: session.user_id,
  };
}

function buildUtmUrl(baseUrl: string, programId: string, projectId: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('utm_source', 'akari');
    url.searchParams.set('utm_medium', 'creator_manager');
    url.searchParams.set('utm_campaign', programId);
    url.searchParams.set('utm_project', projectId);
    return url.toString();
  } catch {
    // If URL parsing fails, append as query string
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}utm_source=akari&utm_medium=creator_manager&utm_campaign=${programId}&utm_project=${projectId}`;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LinksResponse>
) {
  const supabase = getSupabaseAdmin();

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  // GET: List links
  if (req.method === 'GET') {
    try {
      const { data: links, error: linksError } = await supabase
        .from('creator_manager_links')
        .select('*')
        .eq('program_id', programId)
        .order('created_at', { ascending: false });

      if (linksError) {
        console.error('[Creator Manager Links] Error fetching links:', linksError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch links' });
      }

      return res.status(200).json({ ok: true, links: links || [] });
    } catch (error: any) {
      console.error('[Creator Manager Links] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // POST: Create link
  if (req.method === 'POST') {
    const body: CreateLinkRequest = req.body;

    if (!body.label || !body.url) {
      return res.status(400).json({ ok: false, error: 'label and url are required' });
    }

    // Get current user
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    try {
      // Get program to find project_id
      const { data: program, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('project_id')
        .eq('id', programId)
        .single();

      if (programError || !program) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      // Check permissions
      const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
      if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only project admins and moderators can create links' });
      }

      // Build UTM URL
      const utmUrl = buildUtmUrl(body.url, programId, program.project_id);

      // Create link
      const { data: link, error: createError } = await supabase
        .from('creator_manager_links')
        .insert({
          program_id: programId,
          label: body.label,
          url: body.url,
          utm_url: utmUrl,
        })
        .select()
        .single();

      if (createError) {
        console.error('[Creator Manager Links] Error creating link:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to create link' });
      }

      return res.status(201).json({ ok: true, links: [link] });
    } catch (error: any) {
      console.error('[Creator Manager Links] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

