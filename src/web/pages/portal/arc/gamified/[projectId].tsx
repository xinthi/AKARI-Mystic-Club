/**
 * Page: /portal/arc/gamified/[projectId]
 * 
 * Option 3: Gamified Leaderboard (coming soon)
 */

import Head from 'next/head';
import { useRouter } from 'next/router';

export default function GamifiedLeaderboardPage() {
  const router = useRouter();
  const { projectId } = router.query;

  return (
    <>
      <Head>
        <title>Gamified Leaderboard - Coming Soon</title>
      </Head>
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Gamified Leaderboard</h1>
        <p>Option 3 (Gamified Leaderboard) is not yet implemented.</p>
        <p>Coming soon.</p>
      </div>
    </>
  );
}



