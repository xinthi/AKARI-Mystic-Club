/**
 * Legacy Redirect: /portal/arc/admin → /portal/admin/arc
 * 
 * This route redirects to the canonical superadmin ARC dashboard.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  // Redirect to canonical superadmin ARC dashboard
  // Using 301 (permanent) redirect as per ARC_ROUTES.md
  return {
    redirect: {
      destination: '/portal/admin/arc',
      permanent: true, // 301 redirect (permanent)
    },
  };
};

// This component should never render due to redirect
export default function LegacyAdminRedirect() {
  return null;
}
