/**
 * Legacy Redirect: /portal/arc/admin → /portal/admin/arc
 * 
 * This route redirects to the canonical superadmin ARC dashboard.
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  // Redirect to canonical superadmin ARC dashboard
  return {
    redirect: {
      destination: '/portal/admin/arc',
      permanent: true, // 301 redirect
    },
  };
};

// This component should never render due to redirect
export default function LegacyAdminRedirect() {
  return null;
}
