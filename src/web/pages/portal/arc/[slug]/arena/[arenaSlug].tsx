/**
 * Legacy Redirect: /portal/arc/[slug]/arena/[arenaSlug] → /portal/arc/[projectSlug]/arena/[arenaSlug]
 * 
 * This route redirects to the canonical [projectSlug] route.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const slug = context.params?.slug;
  const arenaSlug = context.params?.arenaSlug;

  if (!slug || typeof slug !== 'string' || !arenaSlug || typeof arenaSlug !== 'string') {
    return {
      notFound: true,
    };
  }

  // Redirect to canonical route
  return {
    redirect: {
      destination: `/portal/arc/${encodeURIComponent(slug)}/arena/${encodeURIComponent(arenaSlug)}`,
      permanent: true, // 301 redirect
    },
  };
};

// This component should never render due to redirect
export default function LegacyArenaRedirect() {
  return null;
}
