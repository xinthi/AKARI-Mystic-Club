/**
 * AKARI Mystic Club - Root Route Handler
 * 
 * Redirects based on domain:
 * - akarimystic.club or www.akarimystic.club → /portal (Web Portal)
 * - play.akarimystic.club → Mini App Dashboard
 */

import { GetServerSideProps } from 'next';
import Dashboard from './dashboard';

interface RootPageProps {
  shouldRedirect: boolean;
}

export default function RootPage({ shouldRedirect }: RootPageProps) {
  // If shouldRedirect is true, the server-side redirect already happened
  // This component should never render in that case, but just in case:
  if (shouldRedirect) {
    return null;
  }

  // For play.akarimystic.club or localhost, show the Mini App dashboard
  return <Dashboard />;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const hostname = context.req.headers.host || '';
  
  // If on root domain (akarimystic.club or www.akarimystic.club), redirect to portal
  if (hostname === 'akarimystic.club' || hostname === 'www.akarimystic.club') {
    return {
      redirect: {
        destination: '/portal',
        permanent: false,
      },
    };
  }
  
  // For play subdomain or localhost, show the Mini App dashboard
  return {
    props: {
      shouldRedirect: false,
    },
  };
};
