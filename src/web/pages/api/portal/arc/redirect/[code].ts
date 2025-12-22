/**
 * API Route: GET /api/portal/arc/redirect/[code]
 * 
 * Handle redirect with UTM tracking. Logs click event and returns redirect URL with UTM params.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

interface RedirectResponse {
  ok: true;
  redirect_url: string;
}

type RedirectAPIResponse =
  | RedirectResponse
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

function getIpHash(req: NextApiRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]) : req.socket.remoteAddress;
  return ip ? hashString(ip) : null;
}

function getUserAgentHash(req: NextApiRequest): string | null {
  const userAgent = req.headers['user-agent'];
  return userAgent ? hashString(userAgent) : null;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RedirectAPIResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'Redirect code is required' });
    }

    // Get link data
    const { data: link, error: linkError } = await supabase
      .from('arc_participant_links')
      .select('campaign_id, participant_id, target_url')
      .eq('code', code)
      .single();

    if (linkError || !link) {
      return res.status(404).json({ ok: false, error: 'Redirect code not found' });
    }

    // Log click event
    const ipHash = getIpHash(req);
    const userAgentHash = getUserAgentHash(req);
    const referrer = req.headers.referer || null;

    const { error: eventError } = await supabase
      .from('arc_link_events')
      .insert({
        campaign_id: link.campaign_id,
        participant_id: link.participant_id,
        ts: new Date().toISOString(),
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        referrer: referrer,
      });

    if (eventError) {
      console.error('[ARC Redirect API] Event log error:', eventError);
      // Don't fail the redirect if logging fails
    }

    // Build redirect URL with UTM parameters
    const targetUrl = new URL(link.target_url);
    targetUrl.searchParams.set('utm_source', 'akari');
    targetUrl.searchParams.set('utm_medium', 'arc');
    targetUrl.searchParams.set('utm_campaign', link.campaign_id);
    targetUrl.searchParams.set('utm_content', link.participant_id);

    return res.status(200).json({
      ok: true,
      redirect_url: targetUrl.toString(),
    });
  } catch (error: any) {
    console.error('[ARC Redirect API] Error:', error);
    
    // If URL parsing fails, try to return the target_url as-is
    if (error.message?.includes('Invalid URL')) {
      // Try to get link and return target_url directly
      const supabase = getSupabaseAdmin();
      const { code } = req.query;
      if (code && typeof code === 'string') {
        const { data: link } = await supabase
          .from('arc_participant_links')
          .select('target_url')
          .eq('code', code)
          .single();
        
        if (link) {
          return res.status(200).json({
            ok: true,
            redirect_url: link.target_url,
          });
        }
      }
    }
    
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}









