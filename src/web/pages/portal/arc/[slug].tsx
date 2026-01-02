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
  return {
    redirect: {
      destination: `/portal/arc/${encodeURIComponent(slug)}`,
      permanent: true, // 301 redirect
    },
  };
};

// This component should never render due to redirect
export default function LegacySlugRedirect() {
  return null;
}
