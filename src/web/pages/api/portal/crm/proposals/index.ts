/**
 * API Route: GET /api/portal/crm/proposals
 * 
 * List CRM proposals for the current user (creator) or project
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface CrmProposal {
  id: string;
  project_id: string;
  creator_profile_id: string;
  message_id: string | null;
  proposal_type: 'marketing' | 'partnership' | 'ambassador' | 'content';
  initial_price_amount: number;
  initial_price_currency: string;
  proposed_price_amount: number | null;
  proposed_price_currency: string | null;
  campaign_id: string | null;
  status: 'pending' | 'accepted' | 'countered' | 'rejected' | 'expired';
  expires_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  notes: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  // Populated info
  project?: {
    id: string;
    name: string;
    slug: string | null;
  };
  creator?: {
    id: string;
    username: string;
    name: string;
  };
}

type CrmProposalsResponse =
  | {
      ok: true;
      proposals: CrmProposal[];
      pendingCount: number;
      acceptedCount: number;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CrmProposalsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { projectId, status } = req.query;

    // If projectId is provided, this is a project viewing their proposals
    if (projectId && typeof projectId === 'string') {
      let query = supabase
        .from('crm_proposals')
        .select('*')
        .eq('project_id', projectId);

      if (status && typeof status === 'string') {
        query = query.eq('status', status);
      }

      const { data: proposals, error: proposalsError } = await query.order(
        'created_at',
        { ascending: false }
      );

      if (proposalsError) {
        console.error('[CRM Proposals API] Error fetching proposals:', proposalsError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch proposals' });
      }

      // Get creator info
      const creatorIds = new Set(
        (proposals || []).map((p) => p.creator_profile_id)
      );
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, username, name')
        .in('id', Array.from(creatorIds));

      const creatorsMap = new Map((creators || []).map((c) => [c.id, c]));

      // Get project info
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, slug')
        .eq('id', projectId)
        .single();

      const enrichedProposals: CrmProposal[] = (proposals || []).map((prop) => ({
        ...prop,
        project: project || undefined,
        creator: creatorsMap.get(prop.creator_profile_id),
      }));

      const pendingCount = enrichedProposals.filter((p) => p.status === 'pending').length;
      const acceptedCount = enrichedProposals.filter((p) => p.status === 'accepted').length;

      return res.status(200).json({
        ok: true,
        proposals: enrichedProposals,
        pendingCount,
        acceptedCount,
      });
    }

    // Otherwise, this is a creator viewing their proposals
    let query = supabase
      .from('crm_proposals')
      .select('*')
      .eq('creator_profile_id', profileId);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data: proposals, error: proposalsError } = await query.order(
      'created_at',
      { ascending: false }
    );

    if (proposalsError) {
      console.error('[CRM Proposals API] Error fetching proposals:', proposalsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch proposals' });
    }

    // Get project info
    const projectIds = new Set((proposals || []).map((p) => p.project_id));
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, slug')
      .in('id', Array.from(projectIds));

    const projectsMap = new Map((projects || []).map((p) => [p.id, p]));

    const enrichedProposals: CrmProposal[] = (proposals || []).map((prop) => ({
      ...prop,
      project: projectsMap.get(prop.project_id),
    }));

    const pendingCount = enrichedProposals.filter((p) => p.status === 'pending').length;
    const acceptedCount = enrichedProposals.filter((p) => p.status === 'accepted').length;

    return res.status(200).json({
      ok: true,
      proposals: enrichedProposals,
      pendingCount,
      acceptedCount,
    });
  } catch (error: any) {
    console.error('[CRM Proposals API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
