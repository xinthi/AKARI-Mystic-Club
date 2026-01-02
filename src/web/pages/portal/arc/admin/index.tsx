/**
 * Legacy Redirect: /portal/arc/admin → /portal/admin/arc
 * 
 * This route redirects to the canonical superadmin ARC dashboard.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  // Redirect to canonical superadmin ARC dashboard
  // Note: Using 302 (temporary) during development to avoid caching issues
  // Switch to permanent: true (301) after production release
  return {
    redirect: {
      destination: '/portal/admin/arc',
      permanent: false, // 302 redirect (temporary during dev)
    },
  };
};

// This component should never render due to redirect
export default function LegacyAdminRedirect() {
  return null;
}
