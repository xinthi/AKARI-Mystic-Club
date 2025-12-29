/**
 * Redirect page: /r/cm/[linkId]
 * 
 * Tracks clicks on Creator Manager campaign links and redirects to UTM URL
 * 
 * Query params:
 * - creator: creatorProfileId (optional)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export default function LinkRedirect() {
  const router = useRouter();
  const { linkId, creator } = router.query;

  useEffect(() => {
    async function handleRedirect() {
      if (!linkId || typeof linkId !== 'string') {
        return;
      }

      try {
        const supabase = getSupabaseAdmin();

        // Get link
        const { data: link, error: linkError } = await supabase
          .from('creator_manager_links')
          .select('id, program_id, utm_url')
          .eq('id', linkId)
          .single();

        if (linkError || !link) {
          console.error('[Link Redirect] Link not found:', linkError);
          return;
        }

        // Build final URL with creator UTM param if provided
        let finalUrl = link.utm_url;
        if (creator && typeof creator === 'string') {
          try {
            const url = new URL(link.utm_url);
            url.searchParams.set('utm_creator', creator);
            finalUrl = url.toString();
          } catch {
            const separator = link.utm_url.includes('?') ? '&' : '?';
            finalUrl = `${link.utm_url}${separator}utm_creator=${creator}`;
          }
        }

        // Log click (client-side, will use service role via API)
        const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : null;
        const referrer = typeof document !== 'undefined' ? document.referrer : null;

        // Use API endpoint to log click
        await fetch('/api/portal/creator-manager/links/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId: link.id,
            programId: link.program_id,
            creatorProfileId: creator || null,
            userAgent,
            referrer,
          }),
        });

        // Redirect
        window.location.href = finalUrl;
      } catch (error: any) {
        console.error('[Link Redirect] Error:', error);
      }
    }

    if (linkId) {
      handleRedirect();
    }
  }, [linkId, creator]);

  return (
    <div className="min-h-screen bg-akari-bg flex items-center justify-center">
      <div className="text-center">
        <p className="text-akari-text">Redirecting...</p>
      </div>
    </div>
  );
}

