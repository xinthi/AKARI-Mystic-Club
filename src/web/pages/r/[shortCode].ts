/**
 * Public Redirect Route: /r/[shortCode]
 * 
 * Resolves UTM link short code and redirects with click tracking.
 */

import type { GetServerSideProps } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';
import { getRequestId, writeArcAudit } from '@/lib/server/arc-audit';

// =============================================================================
// HELPERS
// =============================================================================

function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

function getVisitorId(req: any): string {
  // Try to get visitor_id from cookie
  const cookies = req.headers.cookie?.split(';').map((c: string) => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('arc_visitor_id=')) {
      return cookie.substring('arc_visitor_id='.length);
    }
  }

  // Generate new visitor_id
  const visitorId = 'visitor_' + crypto.randomBytes(8).toString('hex');
  return visitorId;
}

function getDevice(req: any): string {
  const userAgent = req.headers['user-agent'] || '';
  if (/mobile|android|iphone|ipad/i.test(userAgent)) {
    return 'mobile';
  }
  if (/tablet|ipad/i.test(userAgent)) {
    return 'tablet';
  }
  return 'desktop';
}

function getIpHash(req: any): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0]
    : req.socket?.remoteAddress;
  return ip ? hashString(ip) : null;
}

function getUserAgentHash(req: any): string | null {
  const userAgent = req.headers['user-agent'];
  return userAgent ? hashString(userAgent) : null;
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { shortCode } = context.params;

  if (!shortCode || typeof shortCode !== 'string') {
    return {
      notFound: true,
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get link data (use short_code if available, fallback to code)
    const { data: link, error: linkError } = await supabase
      .from('arc_participant_links')
      .select('id, campaign_id, participant_id, target_url, code, short_code')
      .or(`code.eq.${shortCode},short_code.eq.${shortCode}`)
      .single();

    if (linkError || !link) {
      return {
        notFound: true,
      };
    }

    // Get referrer and other request data
    const referrer = context.req.headers.referer || context.req.headers.referrer || null;
    const device = getDevice(context.req);
    const visitorId = getVisitorId(context.req);
    const ipHash = getIpHash(context.req);
    const userAgentHash = getUserAgentHash(context.req);

    // TODO: Geo-location lookup (if available)
    // For now, set to null
    const geoCountry = null;
    const geoCity = null;

    // Record click event
    const clickedAt = new Date().toISOString();
    const { error: eventError } = await supabase.from('arc_link_events').insert({
      campaign_id: link.campaign_id,
      participant_id: link.participant_id,
      ts: clickedAt,
      clicked_at: clickedAt,
      utm_link_id: link.id,
      visitor_id: visitorId,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      referrer: referrer,
      device: device,
      geo_country: geoCountry,
      geo_city: geoCity,
    });

    if (eventError) {
      console.error('[ARC Redirect] Event log error:', eventError);
      // Don't fail the redirect if logging fails
    }

    // Log audit (non-blocking)
    const requestId = getRequestId(context.req as any);
    await writeArcAudit(supabase, {
      actorProfileId: null,
      projectId: null,
      entityType: 'utm_link',
      entityId: link.id,
      action: 'utm_link_clicked',
      success: !eventError,
      message: `UTM link clicked: ${shortCode}`,
      requestId,
      metadata: {
        shortCode,
        campaignId: link.campaign_id,
        participantId: link.participant_id,
        visitorId,
        device,
      },
    });

    // Set visitor_id cookie (expires in 1 year)
    const cookieHeader = `arc_visitor_id=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax`;

    // Redirect to target URL
    return {
      redirect: {
        destination: link.target_url,
        permanent: false,
      },
      headers: {
        'Set-Cookie': cookieHeader,
      },
    };
  } catch (error: any) {
    console.error('[ARC Redirect] Error:', error);
    return {
      notFound: true,
    };
  }
};
