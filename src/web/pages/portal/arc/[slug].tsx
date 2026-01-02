/**
 * Legacy Redirect: /portal/arc/[slug] → /portal/arc/[projectSlug]
 * 
 * This route redirects to the canonical [projectSlug] route.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const slug = context.params?.slug;

  if (!slug || typeof slug !== 'string') {
    return {
      notFound: true,
    };
  }

  // Redirect to canonical route
  // Note: Using 302 (temporary) during development to avoid caching issues
  // Switch to permanent: true (301) after production release
  return {
    redirect: {
      destination: `/portal/arc/${encodeURIComponent(slug)}`,
      permanent: false, // 302 redirect (temporary during dev)
    },
  };
};

// This component should never render due to redirect
export default function LegacySlugRedirect() {
  return null;
}
