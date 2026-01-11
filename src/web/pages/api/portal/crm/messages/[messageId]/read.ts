/**
 * API Route: POST /api/portal/crm/messages/[messageId]/read
 * 
 * Mark a CRM message as read
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

type MarkReadResponse =
  | {
      ok: true;
      message: {
        id: string;
        is_read: boolean;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MarkReadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { profileId } = await requirePortalUser(req, res);
    const supabase = createPortalClient();

    const { messageId } = req.query;

    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ ok: false, error: 'messageId is required' });
    }

    // Get message and verify it belongs to current user (creator)
    const { data: message, error: messageError } = await supabase
      .from('crm_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    if (message.creator_profile_id !== profileId) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    // Mark as read
    const { data: updatedMessage, error: updateError } = await supabase
      .from('crm_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select()
      .single();

    if (updateError) {
      console.error('[Mark Message Read API] Error updating message:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to mark message as read' });
    }

    return res.status(200).json({
      ok: true,
      message: {
        id: updatedMessage.id,
        is_read: updatedMessage.is_read,
      },
    });
  } catch (error: any) {
    console.error('[Mark Message Read API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
