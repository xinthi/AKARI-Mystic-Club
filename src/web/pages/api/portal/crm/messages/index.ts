/**
 * API Route: GET /api/portal/crm/messages
 * 
 * List CRM messages for the current user (creator) or project
 * - Creators see messages sent to them
 * - Projects see messages they sent
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface CrmMessage {
  id: string;
  project_id: string;
  creator_profile_id: string;
  subject: string;
  message_body: string;
  message_type: 'promotional' | 'invitation' | 'announcement';
  has_proposal: boolean;
  proposal_id: string | null;
  is_read: boolean;
  read_at: string | null;
  sent_by_profile_id: string | null;
  created_at: string;
  // Populated info
  project?: {
    id: string;
    name: string;
    slug: string | null;
    twitter_username: string | null;
  };
  proposal?: {
    id: string;
    status: string;
    initial_price_amount: number;
    initial_price_currency: string;
  } | null;
}

type CrmMessagesResponse =
  | {
      ok: true;
      messages: CrmMessage[];
      unreadCount: number;
      totalCount: number;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CrmMessagesResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }
    const profileId = user.profileId;
    if (!profileId) {
      return res.status(200).json({
        ok: true,
        messages: [],
        unreadCount: 0,
        totalCount: 0,
      });
    }
    const supabase = createPortalClient();

    const { projectId, type } = req.query; // type: 'received' (creator) | 'sent' (project)

    // If projectId is provided, this is a project viewing their sent messages
    if (projectId && typeof projectId === 'string') {
      const { data: messages, error: messagesError } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (messagesError) {
        console.error('[CRM Messages API] Error fetching messages:', messagesError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch messages' });
      }

      // Get creator profile info
      const creatorIds = new Set(
        (messages || []).map((m) => m.creator_profile_id)
      );
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, username, name, profile_image_url')
        .in('id', Array.from(creatorIds));

      const creatorsMap = new Map((creators || []).map((c) => [c.id, c]));

      // Get proposal info if has_proposal
      const proposalIds = (messages || [])
        .filter((m) => m.has_proposal && m.proposal_id)
        .map((m) => m.proposal_id!);
      
      const { data: proposals } = proposalIds.length > 0
        ? await supabase
            .from('crm_proposals')
            .select('id, status, initial_price_amount, initial_price_currency')
            .in('id', proposalIds)
        : { data: null };

      const proposalsMap = new Map(
        (proposals || []).map((p) => [p.id, p])
      );

      // Get project info
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, slug, twitter_username')
        .eq('id', projectId)
        .single();

      const enrichedMessages: CrmMessage[] = (messages || []).map((msg) => ({
        ...msg,
        project: project || undefined,
        proposal: msg.proposal_id ? proposalsMap.get(msg.proposal_id) || null : null,
      }));

      const unreadCount = 0; // Projects don't track read status for sent messages
      const totalCount = enrichedMessages.length;

      return res.status(200).json({
        ok: true,
        messages: enrichedMessages,
        unreadCount,
        totalCount,
      });
    }

    // Otherwise, this is a creator viewing their received messages
    const { data: messages, error: messagesError } = await supabase
      .from('crm_messages')
      .select('*')
      .eq('creator_profile_id', profileId)
      .order('created_at', { ascending: false });

    if (messagesError) {
      console.error('[CRM Messages API] Error fetching messages:', messagesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch messages' });
    }

    // Get project info
    const projectIds = new Set((messages || []).map((m) => m.project_id));
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, slug, twitter_username')
      .in('id', Array.from(projectIds));

    const projectsMap = new Map((projects || []).map((p) => [p.id, p]));

    // Get proposal info if has_proposal
    const proposalIds = (messages || [])
      .filter((m) => m.has_proposal && m.proposal_id)
      .map((m) => m.proposal_id!);
    
    const { data: proposals } = proposalIds.length > 0
      ? await supabase
          .from('crm_proposals')
          .select('id, status, initial_price_amount, initial_price_currency')
          .in('id', proposalIds)
      : { data: null };

    const proposalsMap = new Map(
      (proposals || []).map((p) => [p.id, p])
    );

    const enrichedMessages: CrmMessage[] = (messages || []).map((msg) => ({
      ...msg,
      project: projectsMap.get(msg.project_id),
      proposal: msg.proposal_id ? proposalsMap.get(msg.proposal_id) || null : null,
    }));

    const unreadCount = enrichedMessages.filter((m) => !m.is_read).length;
    const totalCount = enrichedMessages.length;

    return res.status(200).json({
      ok: true,
      messages: enrichedMessages,
      unreadCount,
      totalCount,
    });
  } catch (error: any) {
    console.error('[CRM Messages API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
