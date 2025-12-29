/**
 * Redirect Route: /r/[code]
 * 
 * Handles UTM tracking link redirects.
 * Logs click events and redirects to target_url with UTM parameters.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function RedirectPage() {
  const router = useRouter();
  const { code } = router.query;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || typeof code !== 'string') {
      setError('Invalid redirect code');
      return;
    }

    // Fetch link data
    fetch(`/api/portal/arc/redirect/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch redirect');
        }
        return res.json();
      })
      .then((data) => {
        if (data.ok && data.redirect_url) {
          // Redirect to the URL with UTM parameters
          window.location.href = data.redirect_url;
        } else {
          setError('Invalid redirect data');
        }
      })
      .catch((err) => {
        console.error('[Redirect] Error:', err);
        setError(err.message || 'Failed to redirect');
      });
  }, [code]);

  if (error) {
    return (
      <>
        <Head>
          <title>Redirect Error</title>
        </Head>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Redirect Error</h1>
          <p>{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Redirecting...</title>
      </Head>
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Redirecting...</p>
      </div>
    </>
  );
}











