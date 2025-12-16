/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/[creatorId]/badges
 * 
 * Award a badge to a creator in a Creator Manager program.
 * 
 * Input: { badgeSlug: string }
 * 
 * Behavior:
 * - If badgeSlug does not exist, create it with a default name
 * - Link badge to creator in creator_manager_creator_badges
 * 
 * Permissions: Only project admin/moderator can award badges
 * 
 * TODO: Add auto-badge rules based on:
 * - ARC points milestones
 * - Mission completion streaks
 * - Engagement metrics
 * - Content quality scores
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AwardBadgeRequest {
  badgeSlug: string;
}

type AwardBadgeResponse =
  | { ok: true; message: string; badgeId: string }
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

/**
 * Convert slug to readable name
 * e.g. "narrative_master" -> "Narrative Master"
 */
function slugToName(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// HANDLER
// =============================================================================

type GetBadgesResponse =
  | { ok: true; badges: Array<{ id: string; slug: string; name: string; description: string | null; awarded_at: string }> }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AwardBadgeResponse | GetBadgesResponse>
) {
  // GET: List badges for a creator
  if (req.method === 'GET') {
    const supabase = getSupabaseAdmin();

    const programId = req.query.programId as string;
    const creatorId = req.query.creatorId as string;

    if (!programId || !creatorId) {
      return res.status(400).json({ ok: false, error: 'programId and creatorId are required' });
    }

    try {
      // Get creator record to find profile_id
      const { data: creator, error: creatorError } = await supabase
        .from('creator_manager_creators')
        .select('creator_profile_id')
        .eq('id', creatorId)
        .eq('program_id', programId)
        .single();

      if (creatorError || !creator) {
        return res.status(404).json({ ok: false, error: 'Creator not found in this program' });
      }

      // Get badges
      const { data: badges, error: badgesError } = await supabase
        .from('creator_manager_creator_badges')
        .select(`
          id,
          awarded_at,
          creator_manager_badges (
            id,
            slug,
            name,
            description
          )
        `)
        .eq('program_id', programId)
        .eq('creator_profile_id', creator.creator_profile_id)
        .order('awarded_at', { ascending: false });

      if (badgesError) {
        console.error('[Get Badges] Error:', badgesError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch badges' });
      }

      const formattedBadges = (badges || []).map((b: any) => {
        const badge = Array.isArray(b.creator_manager_badges) ? b.creator_manager_badges[0] : b.creator_manager_badges;
        return {
          id: badge.id,
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          awarded_at: b.awarded_at,
        };
      });

      return res.status(200).json({ ok: true, badges: formattedBadges });
    } catch (error: any) {
      console.error('[Get Badges] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // POST: Award badge
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUser(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const programId = req.query.programId as string;
  const creatorId = req.query.creatorId as string;

  if (!programId || !creatorId) {
    return res.status(400).json({ ok: false, error: 'programId and creatorId are required' });
  }

  const body: AwardBadgeRequest = req.body;
  if (!body.badgeSlug || typeof body.badgeSlug !== 'string') {
    return res.status(400).json({ ok: false, error: 'badgeSlug is required' });
  }

  try {
    // Get creator record to find program and profile_id
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('program_id, creator_profile_id')
      .eq('id', creatorId)
      .eq('program_id', programId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ ok: false, error: 'Creator not found in this program' });
    }

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
      return res.status(403).json({
        ok: false,
        error: 'Only project admins and moderators can award badges',
      });
    }

    // Normalize badge slug
    const normalizedSlug = body.badgeSlug.toLowerCase().trim().replace(/\s+/g, '_');

    // Check if badge exists, create if not
    let { data: badge } = await supabase
      .from('creator_manager_badges')
      .select('id')
      .eq('slug', normalizedSlug)
      .single();

    if (!badge) {
      // Create badge with default name
      const { data: newBadge, error: createError } = await supabase
        .from('creator_manager_badges')
        .insert({
          slug: normalizedSlug,
          name: slugToName(normalizedSlug),
          description: null,
        })
        .select()
        .single();

      if (createError || !newBadge) {
        console.error('[Award Badge] Error creating badge:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to create badge' });
      }

      badge = newBadge;
    }

    // Ensure badge is not null (TypeScript guard)
    if (!badge) {
      return res.status(500).json({ ok: false, error: 'Badge not found or could not be created' });
    }

    // Check if creator already has this badge
    const { data: existingBadge } = await supabase
      .from('creator_manager_creator_badges')
      .select('id')
      .eq('program_id', programId)
      .eq('creator_profile_id', creator.creator_profile_id)
      .eq('badge_id', badge.id)
      .single();

    if (existingBadge) {
      return res.status(200).json({
        ok: true,
        message: 'Creator already has this badge',
        badgeId: badge.id,
      });
    }

    // Award badge
    const { error: awardError } = await supabase
      .from('creator_manager_creator_badges')
      .insert({
        program_id: programId,
        creator_profile_id: creator.creator_profile_id,
        badge_id: badge.id,
      });

    if (awardError) {
      console.error('[Award Badge] Error awarding badge:', awardError);
      return res.status(500).json({ ok: false, error: 'Failed to award badge' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Badge awarded successfully',
      badgeId: badge.id,
    });
  } catch (error: any) {
    console.error('[Award Badge] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

