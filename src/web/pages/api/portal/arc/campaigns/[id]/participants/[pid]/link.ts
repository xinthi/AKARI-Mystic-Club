/**
 * API Route: POST /api/portal/arc/campaigns/[id]/participants/[pid]/link
 * 
 * Generate a UTM tracking link for a participant.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { randomBytes } from 'crypto';
import { getRequestId, writeArcAudit } from '@/lib/server/arc-audit';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateLinkPayload {
  target_url: string;
  label?: string;
}

interface ParticipantLink {
  id: string;
  campaign_id: string;
  participant_id: string;
  code: string;
  short_code: string | null;
  target_url: string;
  label: string | null;
  created_at: string;
}

type LinkResponse =
  | { ok: true; link: ParticipantLink; redirect_url: string }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

function generateUniqueCode(): string {
  // Generate a short unique code (8 characters)
  return randomBytes(4).toString('hex');
}

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LinkResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId, pid: participantId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }
    if (!participantId || typeof participantId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Participant ID is required' });
    }

    // Authentication
    let userId: string;
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      userId = session.user_id;
    } else {
      userId = 'dev-user-id';
    }

    // Get participant and campaign
    const { data: participant, error: participantError } = await supabase
      .from('arc_campaign_participants')
      .select('campaign_id')
      .eq('id', participantId)
      .single();

    if (participantError || !participant) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    if (participant.campaign_id !== campaignId) {
      return res.status(400).json({ ok: false, error: 'Participant does not belong to this campaign' });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('project_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Runtime guard: ensure projectId is a non-empty string
    const projectId = campaign.project_id;
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = projectId;

    // Check ARC access (Option 1 = CRM) and project permissions
    if (!DEV_MODE && userId) {
      const accessCheck = await requireArcAccess(supabase, pid, 1);
      if (!accessCheck.ok) {
        return res.status(403).json({
          ok: false,
          error: accessCheck.error || 'ARC access not approved for this project',
        });
      }

      const permissions = await checkProjectPermissions(supabase, userId, pid);
      const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
      if (!canManage) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have permission to create tracking links',
        });
      }
    }

    // Parse body
    const body = req.body as CreateLinkPayload;
    if (!body.target_url) {
      return res.status(400).json({ ok: false, error: 'target_url is required' });
    }

    // Validate URL
    try {
      new URL(body.target_url);
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid URL format' });
    }

    // Check link count (max 5 per participant)
    const { count: linkCount, error: countError } = await supabase
      .from('arc_participant_links')
      .select('id', { count: 'exact', head: true })
      .eq('participant_id', participantId);

    if (countError) {
      console.error('[ARC Link API] Count error:', countError);
      return res.status(500).json({ ok: false, error: 'Failed to check link count' });
    }

    if ((linkCount || 0) >= 5) {
      return res.status(400).json({ ok: false, error: 'Maximum 5 links per participant' });
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateUniqueCode();
      const { data: existingCode } = await supabase
        .from('arc_participant_links')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (!existingCode) {
        break; // Code is unique
      }
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ ok: false, error: 'Failed to generate unique code' });
    }

    // Create link
    const { data: link, error: insertError } = await supabase
      .from('arc_participant_links')
      .insert({
        campaign_id: campaignId,
        participant_id: participantId,
        code: code,
        short_code: code, // Also set short_code for compatibility
        target_url: body.target_url,
        label: body.label || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ARC Link API] Insert error:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create link' });
    }

    // Log audit
    const requestId = getRequestId(req);
    const profileId = userId ? await getProfileIdFromUserId(supabase, userId) : null;
    await writeArcAudit(supabase, {
      actorProfileId: profileId,
      projectId: pid,
      entityType: 'utm_link',
      entityId: link.id,
      action: 'utm_link_created',
      success: true,
      message: `UTM link created with code ${code}`,
      requestId,
      metadata: {
        campaignId,
        participantId,
        code,
        label: body.label || null,
        targetUrl: body.target_url,
      },
    });

    // Build redirect URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const redirectUrl = `${baseUrl}/r/${code}`;

    return res.status(200).json({
      ok: true,
      link: {
        id: link.id,
        campaign_id: link.campaign_id,
        participant_id: link.participant_id,
        code: link.code,
        short_code: link.short_code || link.code,
        target_url: link.target_url,
        label: link.label || null,
        created_at: link.created_at,
      } as ParticipantLink,
      redirect_url: redirectUrl,
    });
  } catch (error: any) {
    console.error('[ARC Link API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



