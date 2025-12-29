/**
 * API Route: /api/portal/creator-manager/programs/[programId]/deals
 * 
 * GET: List deals for a program
 * POST: Create a new deal
 * 
 * Permissions: Only project admins and moderators can create deals
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateDealRequest {
  internalLabel: string;
  description?: string;
  visibility?: 'private' | 'public';
  isDefault?: boolean;
}

interface Deal {
  id: string;
  program_id: string;
  internal_label: string;
  description: string | null;
  visibility: 'private' | 'public';
  is_default: boolean;
  created_at: string;
}

type DealsResponse =
  | { ok: true; deals: Deal[] }
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

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DealsResponse>
) {
  const supabase = getSupabaseAdmin();

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  // GET: List deals
  if (req.method === 'GET') {
    try {
      const { data: deals, error: dealsError } = await supabase
        .from('creator_manager_deals')
        .select('*')
        .eq('program_id', programId)
        .order('created_at', { ascending: true });

      if (dealsError) {
        console.error('[Creator Manager Deals] Error fetching deals:', dealsError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch deals' });
      }

      return res.status(200).json({ ok: true, deals: deals || [] });
    } catch (error: any) {
      console.error('[Creator Manager Deals] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // POST: Create deal
  if (req.method === 'POST') {
    const body: CreateDealRequest = req.body;

    if (!body.internalLabel) {
      return res.status(400).json({ ok: false, error: 'internalLabel is required' });
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
        return res.status(403).json({ ok: false, error: 'Only project admins and moderators can create deals' });
      }

      // If this is set as default, unset other defaults first
      if (body.isDefault) {
        await supabase
          .from('creator_manager_deals')
          .update({ is_default: false })
          .eq('program_id', programId)
          .eq('is_default', true);
      }

      // Create deal
      const { data: deal, error: createError } = await supabase
        .from('creator_manager_deals')
        .insert({
          program_id: programId,
          internal_label: body.internalLabel,
          description: body.description || null,
          visibility: body.visibility || 'private',
          is_default: body.isDefault || false,
        })
        .select()
        .single();

      if (createError) {
        console.error('[Creator Manager Deals] Error creating deal:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to create deal' });
      }

      return res.status(201).json({ ok: true, deals: [deal] });
    } catch (error: any) {
      console.error('[Creator Manager Deals] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

