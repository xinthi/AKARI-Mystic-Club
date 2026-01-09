/**
 * Script to refresh missing avatars for leaderboard creators
 * 
 * Usage:
 *   pnpm tsx scripts/refresh-leaderboard-avatars.ts <projectId>
 * 
 * Example:
 *   pnpm tsx scripts/refresh-leaderboard-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46
 */

const projectId = process.argv[2];

if (!projectId) {
  console.error('❌ Error: projectId is required');
  console.error('');
  console.error('Usage: pnpm tsx scripts/refresh-leaderboard-avatars.ts <projectId>');
  console.error('');
  console.error('Example:');
  console.error('  pnpm tsx scripts/refresh-leaderboard-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46');
  process.exit(1);
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const sessionToken = process.env.AKARI_SESSION_TOKEN;

if (!sessionToken) {
  console.error('❌ Error: AKARI_SESSION_TOKEN environment variable is required');
  console.error('');
  console.error('Set it in your .env file or export it:');
  console.error('  export AKARI_SESSION_TOKEN=your_session_token');
  process.exit(1);
}

async function refreshLeaderboardAvatars() {
  console.log(`🔄 Refreshing leaderboard avatars for project: ${projectId}`);
  console.log('');

  try {
    const url = `${baseUrl}/api/portal/admin/arc/refresh-leaderboard-avatars?projectId=${encodeURIComponent(projectId)}&batchSize=5`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `akari_session=${sessionToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('❌ Error:', data.error || response.statusText);
      process.exit(1);
    }

    console.log('✅ Refresh completed!');
    console.log('');
    console.log('Results:');
    console.log(`  - Processed: ${data.processed}`);
    console.log(`  - Succeeded: ${data.succeeded}`);
    console.log(`  - Failed: ${data.failed}`);
    console.log(`  - Skipped: ${data.skipped}`);
    console.log(`  - Duration: ${(data.duration / 1000).toFixed(2)}s`);
    console.log('');

    if (data.errors && data.errors.length > 0) {
      console.log('Errors:');
      data.errors.forEach((err: { username: string; error: string }) => {
        console.log(`  - @${err.username}: ${err.error}`);
      });
      console.log('');
    }

    if (data.succeeded > 0) {
      console.log(`✅ Successfully refreshed ${data.succeeded} avatars!`);
      console.log('');
      console.log('💡 Tip: Refresh your leaderboard page to see the updated avatars.');
    }
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

refreshLeaderboardAvatars();
