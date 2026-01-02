/**
 * Legacy Redirect: /portal/arc/admin/profiles → /portal/admin/arc/profiles
 * 
 * Redirects to the canonical admin profiles page.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/portal/admin/arc/profiles',
      permanent: false, // 302 redirect (temporary, as requested)
    },
  };
};

// This component should never render due to redirect
export default function LegacyAdminProfilesRedirect() {
  return null;
}

