/**
 * Script to refresh ALL avatars across the entire system
 * 
 * This refreshes avatars for:
 * - All ARC leaderboards (all projects)
 * - All Sentiment pages (influencers, inner circle)
 * - All Creator Manager programs
 * - All profiles missing avatars
 * 
 * Usage:
 *   pnpm tsx scripts/refresh-all-avatars.ts
 * 
 * Options:
 *   --batch-size=5    Number of profiles to process in parallel (default: 5, max: 20)
 */

const args = process.argv.slice(2);
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 5;

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const sessionToken = process.env.AKARI_SESSION_TOKEN;

if (!sessionToken) {
  console.error('❌ Error: AKARI_SESSION_TOKEN environment variable is required');
  console.error('');
  console.error('Set it in your .env file or export it:');
  console.error('  export AKARI_SESSION_TOKEN=your_session_token');
  process.exit(1);
}

async function refreshAllAvatars() {
  console.log('🔄 Refreshing ALL avatars across the entire system...');
  console.log(`   Batch size: ${batchSize}`);
  console.log('');

  try {
    const url = `${baseUrl}/api/portal/admin/arc/refresh-all-avatars?batchSize=${batchSize}`;
    
    console.log('📡 Calling API...');
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
      if (data.errors && data.errors.length > 0) {
        console.error('');
        console.error('Errors:');
        data.errors.slice(0, 10).forEach((err: { username: string; error: string }) => {
          console.error(`  - @${err.username}: ${err.error}`);
        });
        if (data.errors.length > 10) {
          console.error(`  ... and ${data.errors.length - 10} more errors`);
        }
      }
      process.exit(1);
    }

    console.log('✅ Refresh completed!');
    console.log('');
    console.log('📊 Results:');
    console.log(`  - Total Processed: ${data.totalProcessed}`);
    console.log(`  - Succeeded: ${data.totalSucceeded}`);
    console.log(`  - Failed: ${data.totalFailed}`);
    console.log(`  - Skipped: ${data.totalSkipped}`);
    console.log(`  - Duration: ${((data.duration || 0) / 1000).toFixed(2)}s`);
    console.log('');

    if (data.otherSources) {
      console.log('📋 Sources:');
      console.log(`  - ARC Leaderboards: ${data.totalProcessed || 0} processed`);
      console.log(`  - Sentiment Influencers: ${data.otherSources.sentimentInfluencers}`);
      console.log(`  - Creator Manager: ${data.otherSources.creatorManagerCreators}`);
      console.log(`  - All Profiles (missing avatars): ${data.otherSources.allProfiles}`);
      console.log('');
    }

    if (data.errors && data.errors.length > 0) {
      console.log('⚠️  Errors (showing first 10):');
      data.errors.slice(0, 10).forEach((err: { username: string; error: string }) => {
        console.log(`  - @${err.username}: ${err.error}`);
      });
      if (data.errors.length > 10) {
        console.log(`  ... and ${data.errors.length - 10} more errors`);
      }
      console.log('');
    }

    if (data.totalSucceeded > 0) {
      console.log(`✅ Successfully refreshed ${data.totalSucceeded} avatars!`);
      console.log('');
      console.log('💡 Tip: Refresh your pages to see the updated avatars.');
      console.log('   - ARC Leaderboards: /portal/arc/[projectSlug]');
      console.log('   - Sentiment Pages: /portal/sentiment/[slug]');
      console.log('   - Creator Manager: /portal/arc/creator-manager/[programId]');
    } else {
      console.log('ℹ️  No avatars needed refreshing (all already have avatars).');
    }
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

refreshAllAvatars();
