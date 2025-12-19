/**
 * Page: /portal/arc/leaderboard/[projectId]
 * 
 * Option 2: Normal Leaderboard (coming soon)
 */

import Head from 'next/head';
import { useRouter } from 'next/router';

export default function NormalLeaderboardPage() {
  const router = useRouter();
  const { projectId } = router.query;

  return (
    <>
      <Head>
        <title>Normal Leaderboard - Coming Soon</title>
      </Head>
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Normal Leaderboard</h1>
        <p>Option 2 (Normal Leaderboard) is not yet implemented.</p>
        <p>Coming soon.</p>
      </div>
    </>
  );
}






