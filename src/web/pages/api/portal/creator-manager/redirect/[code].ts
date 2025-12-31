/**
 * API Route: GET /api/portal/creator-manager/redirect/[code]
 * 
 * Server-side redirect handler for Creator Manager UTM links
 * Logs click events and returns redirect URL with UTM parameters
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

type RedirectResponse =
  | { ok: true; redirect_url: string }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RedirectResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { code, creator } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'Redirect code is required' });
    }

    // Check if code is a UUID (36 chars) or short code (8 chars)
    const isUuid = code.length === 36 && code.includes('-');
    
    // Get link data - try code first, then UUID if it looks like a UUID
    let linkQuery = supabase
      .from('creator_manager_links')
      .select('id, program_id, utm_url, code');
    
    if (isUuid) {
      linkQuery = linkQuery.eq('id', code);
    } else {
      linkQuery = linkQuery.eq('code', code);
    }
    
    const { data: link, error: linkError } = await linkQuery.single();

    if (linkError || !link) {
      console.error('[Creator Manager Redirect API] Link not found:', linkError);
      return res.status(404).json({ ok: false, error: 'Redirect code not found' });
    }
    
    // If UUID was used but link has a code, suggest using the code instead (but still redirect)
    if (isUuid && link.code) {
      console.log(`[Creator Manager Redirect API] Link ${link.id} has code ${link.code}, consider using /r/cm/${link.code} instead`);
    }

    // Build final URL with creator UTM param if provided
    let finalUrl = link.utm_url;
    if (creator && typeof creator === 'string') {
      try {
        const url = new URL(link.utm_url);
        url.searchParams.set('utm_creator', creator);
        finalUrl = url.toString();
      } catch {
        // If URL parsing fails, append as query string
        const separator = link.utm_url.includes('?') ? '&' : '?';
        finalUrl = `${link.utm_url}${separator}utm_creator=${creator}`;
      }
    }

    // Log click event (async, don't wait for it)
    const userAgent = req.headers['user-agent'] || null;
    const referrer = req.headers.referer || null;

    supabase
      .from('creator_manager_link_clicks')
      .insert({
        link_id: link.id,
        program_id: link.program_id,
        creator_profile_id: creator && typeof creator === 'string' ? creator : null,
        user_agent: userAgent,
        referrer: referrer,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[Creator Manager Redirect API] Error logging click:', error);
        }
      })
      .catch((err) => {
        console.error('[Creator Manager Redirect API] Error logging click:', err);
      });

    return res.status(200).json({
      ok: true,
      redirect_url: finalUrl,
    });
  } catch (error: any) {
    console.error('[Creator Manager Redirect API] Error:', error);
    
    // If URL parsing fails, try to return the utm_url as-is
    if (error.message?.includes('Invalid URL')) {
      const supabase = getSupabaseAdmin();
      const { code } = req.query;
      if (code && typeof code === 'string') {
        const { data: link } = await supabase
          .from('creator_manager_links')
          .select('utm_url')
          .eq('code', code)
          .single();
        
        if (link) {
          return res.status(200).json({
            ok: true,
            redirect_url: link.utm_url,
          });
        }
      }
    }
    
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

