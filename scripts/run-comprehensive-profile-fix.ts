/**
 * Script to run the comprehensive profile fix
 * 
 * This script:
 * 1. Updates ALL profiles from sentiment data
 * 2. Refreshes ALL avatars from Twitter API
 * 
 * Usage:
 *   pnpm tsx scripts/run-comprehensive-profile-fix.ts
 * 
 * Or with session token:
 *   AKARI_SESSION_TOKEN=your_token pnpm tsx scripts/run-comprehensive-profile-fix.ts
 */

import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://akarimystic.club';
const SESSION_TOKEN = process.env.AKARI_SESSION_TOKEN || '';

async function runComprehensiveFix() {
  console.log('🚀 Starting comprehensive profile fix...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  
  if (!SESSION_TOKEN) {
    console.error('\n❌ Error: AKARI_SESSION_TOKEN environment variable is required');
    console.log('\n💡 To get your session token:');
    console.log('   1. Open your browser on the leaderboard page');
    console.log('   2. Open browser console (F12)');
    console.log('   3. Run: document.cookie.split("; ").find(c => c.startsWith("akari_session="))?.split("=")[1]');
    console.log('   4. Copy the token and run:');
    console.log('      AKARI_SESSION_TOKEN=your_token pnpm tsx scripts/run-comprehensive-profile-fix.ts');
    process.exit(1);
  }

  const headers = {
    'Cookie': `akari_session=${SESSION_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    // Step 1: Update profiles from sentiment data
    console.log('\n📊 Step 1: Updating profiles from sentiment data...');
    const step1Res = await axios.post(
      `${BASE_URL}/api/portal/admin/arc/update-profiles-from-sentiment`,
      {},
      {
        headers,
        timeout: 300000, // 5 minutes
      }
    );

    const step1 = step1Res.data;
    console.log('✅ Step 1 Complete:');
    console.log(`   Total mention authors: ${step1.totalMentionAuthors || 0}`);
    console.log(`   Profiles created: ${step1.profilesCreated || 0}`);
    console.log(`   Profiles updated: ${step1.profilesUpdated || 0}`);
    console.log(`   Profiles skipped: ${step1.profilesSkipped || 0}`);
    console.log(`   Profiles failed: ${step1.profilesFailed || 0}`);

    if (step1.errors && step1.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      step1.errors.slice(0, 10).forEach((err: any) => {
        console.log(`   - @${err.username}: ${err.error}`);
      });
    }

    // Wait 3 seconds before step 2
    console.log('\n⏳ Waiting 3 seconds before Step 2...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Refresh all avatars
    console.log('\n📊 Step 2: Refreshing all avatars...');
    const step2Res = await axios.post(
      `${BASE_URL}/api/portal/admin/arc/refresh-all-avatars?batchSize=5`,
      {},
      {
        headers,
        timeout: 600000, // 10 minutes
      }
    );

    const step2 = step2Res.data;
    console.log('✅ Step 2 Complete:');
    console.log(`   Total processed: ${step2.totalProcessed || 0}`);
    console.log(`   Avatars refreshed: ${step2.totalSucceeded || 0}`);
    console.log(`   Failed: ${step2.totalFailed || 0}`);
    console.log(`   Skipped: ${step2.totalSkipped || 0}`);

    // Summary
    const totalFixed = (step1.profilesCreated || 0) + (step1.profilesUpdated || 0) + (step2.totalSucceeded || 0);
    
    console.log('\n✅ ========================================');
    console.log('✅ COMPREHENSIVE FIX COMPLETE!');
    console.log(`✅ Total profiles fixed: ${totalFixed}`);
    console.log(`✅ Profiles created/updated: ${(step1.profilesCreated || 0) + (step1.profilesUpdated || 0)}`);
    console.log(`✅ Avatars refreshed: ${step2.totalSucceeded || 0}`);
    console.log('✅ ========================================\n');

    if (totalFixed > 0) {
      console.log('✅ Success! All profiles have been updated and avatars refreshed.');
      console.log('💡 Reload your leaderboard page to see the changes.');
    } else {
      console.log('ℹ️  All profiles are already up to date!');
    }

  } catch (error: any) {
    console.error('\n❌ Error running comprehensive fix:');
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
      console.error(`   URL: ${BASE_URL}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the script
runComprehensiveFix();
