/**
 * Script to update profiles from sentiment data
 * 
 * This script calls the /api/portal/admin/arc/update-profiles-from-sentiment endpoint
 * to update profiles for all mention authors (auto-tracked creators) from sentiment data.
 * 
 * Usage:
 *   pnpm tsx scripts/update-profiles-from-sentiment.ts
 * 
 * Or with session token:
 *   AKARI_SESSION_TOKEN=your_token pnpm tsx scripts/update-profiles-from-sentiment.ts
 */

import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://akarimystic.club';
const SESSION_TOKEN = process.env.AKARI_SESSION_TOKEN || '';

async function updateProfilesFromSentiment() {
  console.log('🔄 Updating profiles from sentiment data...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  
  if (!SESSION_TOKEN) {
    console.error('❌ Error: AKARI_SESSION_TOKEN environment variable is required');
    console.log('\n💡 To get your session token:');
    console.log('   1. Open your browser on the leaderboard page');
    console.log('   2. Open browser console (F12)');
    console.log('   3. Run: document.cookie.split("; ").find(c => c.startsWith("akari_session="))?.split("=")[1]');
    console.log('   4. Copy the token and run:');
    console.log('      AKARI_SESSION_TOKEN=your_token pnpm tsx scripts/update-profiles-from-sentiment.ts');
    process.exit(1);
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/api/portal/admin/arc/update-profiles-from-sentiment`,
      {},
      {
        headers: {
          'Cookie': `akari_session=${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minutes timeout
      }
    );

    const data = response.data;

    console.log('\n✅ Update Complete!');
    console.log('========================================');
    console.log(`Total mention authors: ${data.totalMentionAuthors || 0}`);
    console.log(`Profiles created: ${data.profilesCreated || 0}`);
    console.log(`Profiles updated: ${data.profilesUpdated || 0}`);
    console.log(`Profiles skipped: ${data.profilesSkipped || 0}`);
    console.log(`Profiles failed: ${data.profilesFailed || 0}`);
    console.log(`Duration: ${data.duration ? `${(data.duration / 1000).toFixed(2)}s` : 'N/A'}`);

    if (data.errors && data.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      data.errors.slice(0, 10).forEach((err: any) => {
        console.log(`   - @${err.username}: ${err.error}`);
      });
      if (data.errors.length > 10) {
        console.log(`   ... and ${data.errors.length - 10} more errors`);
      }
    }

    if (data.profilesCreated > 0 || data.profilesUpdated > 0) {
      console.log('\n✅ Success! Profiles have been updated.');
      console.log('💡 Next step: Run refresh-all-avatars to fetch avatars from Twitter API');
    } else {
      console.log('\nℹ️  No profiles were updated. They may already exist with avatars.');
    }

    console.log('========================================\n');
  } catch (error: any) {
    console.error('\n❌ Error updating profiles:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.error || error.response.statusText}`);
      if (error.response.status === 401) {
        console.error('\n💡 Authentication failed. Make sure your session token is valid.');
      } else if (error.response.status === 403) {
        console.error('\n💡 Access denied. SuperAdmin access is required.');
      }
    } else if (error.request) {
      console.error('   Network error: Could not reach the server');
      console.error(`   URL: ${BASE_URL}/api/portal/admin/arc/update-profiles-from-sentiment`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the script
updateProfilesFromSentiment();
