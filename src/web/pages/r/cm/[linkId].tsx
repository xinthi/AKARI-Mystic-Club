/**
 * Redirect page: /r/cm/[code]
 * 
 * Server-side redirect for Creator Manager UTM links
 * Uses short codes for cleaner URLs
 * 
 * Query params:
 * - creator: creatorProfileId (optional)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';

interface RedirectPageProps {
  redirectUrl: string | null;
  error: string | null;
}

export default function LinkRedirect({ redirectUrl, error }: RedirectPageProps) {
  if (error) {
    return (
      <>
        <Head>
          <title>Redirect Error</title>
        </Head>
        <div className="min-h-screen bg-akari-bg flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-akari-text mb-2">Redirect Error</h1>
            <p className="text-akari-muted">{error}</p>
          </div>
        </div>
      </>
    );
  }

  if (redirectUrl) {
    return (
      <>
        <Head>
          <title>Redirecting...</title>
          <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        </Head>
        <div className="min-h-screen bg-akari-bg flex items-center justify-center">
          <div className="text-center">
            <p className="text-akari-text">Redirecting...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Redirecting...</title>
      </Head>
      <div className="min-h-screen bg-akari-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-akari-text">Redirecting...</p>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<RedirectPageProps> = async (context) => {
  const { linkId, creator } = context.query;

  if (!linkId || typeof linkId !== 'string') {
    return {
      props: {
        redirectUrl: null,
        error: 'Invalid redirect code',
      },
    };
  }

  try {
    // Check if linkId is a UUID (36 chars) or short code (8 chars)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const isUuid = linkId.length === 36 && linkId.includes('-');
    
    let apiUrl: string;
    if (isUuid) {
      // Old format: use linkId directly (backward compatibility)
      // We'll need to get the code from the database or use the old redirect method
      const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
      const supabase = getSupabaseAdmin();
      
      const { data: link, error: linkError } = await supabase
        .from('creator_manager_links')
        .select('id, program_id, utm_url, code')
        .eq('id', linkId)
        .single();

      if (linkError || !link) {
        return {
          props: {
            redirectUrl: null,
            error: 'Link not found',
          },
        };
      }

      // If link has a code, redirect to the new short URL format
      if (link.code) {
        const redirectPath = `/r/cm/${link.code}${creator ? `?creator=${creator}` : ''}`;
        return {
          redirect: {
            destination: redirectPath,
            permanent: false,
          },
        };
      }

      // Otherwise, use the old method (build URL directly)
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

      // Log click (async, don't block redirect)
      (async () => {
        try {
          const { error } = await supabase
            .from('creator_manager_link_clicks')
            .insert({
              link_id: link.id,
              program_id: link.program_id,
              creator_profile_id: creator && typeof creator === 'string' ? creator : null,
              user_agent: context.req.headers['user-agent'] || null,
              referrer: context.req.headers.referer || null,
            });
          
          if (error) {
            console.error('[Link Redirect] Error logging click:', error);
          }
        } catch (err: any) {
          console.error('[Link Redirect] Error logging click:', err);
        }
      })();

      return {
        redirect: {
          destination: finalUrl,
          permanent: false,
        },
      };
    } else {
      // New format: short code
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     (context.req.headers.host ? `https://${context.req.headers.host}` : 'http://localhost:3000');
      apiUrl = `${baseUrl}/api/portal/creator-manager/redirect/${linkId}${creator ? `?creator=${creator}` : ''}`;

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': context.req.headers['user-agent'] || '',
          'Referer': context.req.headers.referer || '',
        },
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        return {
          props: {
            redirectUrl: null,
            error: data.error || 'Failed to fetch redirect',
          },
        };
      }

      // Redirect using Next.js redirect
      return {
        redirect: {
          destination: data.redirect_url,
          permanent: false,
        },
      };
    }
  } catch (error: any) {
    console.error('[Link Redirect] Error:', error);
    return {
      props: {
        redirectUrl: null,
        error: error.message || 'Failed to redirect',
      },
    };
  }
};

