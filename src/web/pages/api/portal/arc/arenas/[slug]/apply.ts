/**
 * API Route: POST /api/portal/arc/arenas/[slug]/apply
 * 
 * Apply to join a public CRM arena/campaign
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type ApplyResponse =
  | { ok: true; message: string; campaignId?: string; programId?: string }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApplyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { slug } = req.query;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'Arena slug is required' });
    }

    // Find arena
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .ilike('slug', slug.trim().toLowerCase())
      .single();

    if (arenaError || !arenaData) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    // Get project
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, arc_access_level')
      .eq('id', arenaData.project_id)
      .single();

    if (projectData?.arc_access_level !== 'creator_manager') {
      return res.status(400).json({ ok: false, error: 'This is not a CRM arena' });
    }

    // Get user's profile_id
    const { data: identity } = await supabase
      .from('akari_user_identities')
      .select('profile_id')
      .eq('user_id', portalUser.userId)
      .single();

    if (!identity?.profile_id) {
      return res.status(400).json({ ok: false, error: 'Profile not found' });
    }

    // Find associated campaign
    const { data: campaign } = await supabase
      .from('arc_campaigns')
      .select('id, participation_mode, status')
      .eq('project_id', arenaData.project_id)
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (campaign) {
      // Check if campaign allows public/hybrid join
      if (campaign.participation_mode === 'invite_only') {
        return res.status(403).json({ ok: false, error: 'This campaign is invite-only' });
      }

      // Get user's twitter username
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', identity.profile_id)
        .single();

      if (!profile?.username) {
        return res.status(400).json({ ok: false, error: 'Twitter username not found' });
      }

      const twitterUsername = profile.username.toLowerCase().replace('@', '').trim();

      // Check if already a participant
      const { data: existing } = await supabase
        .from('arc_campaign_participants')
        .select('id, status')
        .eq('campaign_id', campaign.id)
        .eq('twitter_username', twitterUsername)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted' || existing.status === 'tracked') {
          return res.status(200).json({ ok: true, message: 'You are already a participant', campaignId: campaign.id });
        }
        // Update status to accepted if it was invited
        await supabase
          .from('arc_campaign_participants')
          .update({ status: 'accepted', joined_at: new Date().toISOString() })
          .eq('id', existing.id);
        
        return res.status(200).json({ ok: true, message: 'Application accepted', campaignId: campaign.id });
      }

      // Create new participant
      const { data: participant, error: createError } = await supabase
        .from('arc_campaign_participants')
        .insert({
          campaign_id: campaign.id,
          profile_id: identity.profile_id,
          twitter_username: twitterUsername,
          status: campaign.participation_mode === 'public' ? 'accepted' : 'invited',
          joined_at: campaign.participation_mode === 'public' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (createError) {
        console.error('[Arena Apply API] Error creating participant:', createError);
        return res.status(500).json({ ok: false, error: 'Failed to apply' });
      }

      return res.status(200).json({
        ok: true,
        message: campaign.participation_mode === 'public' 
          ? 'Successfully joined the campaign!' 
          : 'Application submitted. Waiting for approval.',
        campaignId: campaign.id,
      });
    } else {
      // Try creator_manager_programs
      const { data: program } = await supabase
        .from('creator_manager_programs')
        .select('id, visibility, status')
        .eq('project_id', arenaData.project_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (program) {
        // Check if program allows public/hybrid applications
        if (program.visibility === 'private') {
          return res.status(403).json({ ok: false, error: 'This program is invite-only' });
        }

        // Check if already a creator
        const { data: existing } = await supabase
          .from('creator_manager_creators')
          .select('id, status')
          .eq('program_id', program.id)
          .eq('creator_profile_id', identity.profile_id)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'approved') {
            return res.status(200).json({ ok: true, message: 'You are already a participant', programId: program.id });
          }
          // Update status to pending
          await supabase
            .from('creator_manager_creators')
            .update({ status: 'pending' })
            .eq('id', existing.id);
          
          return res.status(200).json({ ok: true, message: 'Application submitted. Waiting for approval.', programId: program.id });
        }

        // Create new creator application
        const { data: creator, error: createError } = await supabase
          .from('creator_manager_creators')
          .insert({
            program_id: program.id,
            creator_profile_id: identity.profile_id,
            status: 'pending',
          })
          .select()
          .single();

        if (createError) {
          console.error('[Arena Apply API] Error creating creator:', createError);
          return res.status(500).json({ ok: false, error: 'Failed to apply' });
        }

        return res.status(200).json({
          ok: true,
          message: 'Application submitted. Waiting for approval.',
          programId: program.id,
        });
      }
    }

    return res.status(404).json({ ok: false, error: 'No active campaign or program found' });
  } catch (error: any) {
    console.error('[Arena Apply API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

