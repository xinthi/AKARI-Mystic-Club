/**
 * Script to trigger all Twitter API refresh endpoints
 * 
 * This script triggers:
 * 1. Avatar refresh for all profiles
 * 2. Sentiment refresh for all projects (optional)
 * 
 * Usage:
 *   ts-node scripts/refresh-all-twitter-apis.ts
 * 
 * Or with environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TWITTERAPIIO_API_KEY=... ts-node scripts/refresh-all-twitter-apis.ts
 */

import fetch from 'node-fetch';

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || '';

// For avatar refresh, you need to be authenticated as SuperAdmin
// This script assumes you'll provide session token or run via API with proper auth
const SESSION_TOKEN = process.env.AKARI_SESSION_TOKEN || '';

// =============================================================================
// HELPERS
// =============================================================================

async function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<any> {
  const { method = 'GET', body, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add session token if available
  if (SESSION_TOKEN) {
    requestHeaders['Cookie'] = `akari_session=${SESSION_TOKEN}`;
  }

  const requestOptions: any = {
    method,
    headers: requestHeaders,
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  console.log(`\n📡 Making ${method} request to: ${url}`);
  
  try {
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`❌ Error (${response.status}):`, data);
      return { ok: false, error: data.error || `HTTP ${response.status}`, status: response.status };
    }
    
    console.log(`✅ Success:`, data);
    return data;
  } catch (error: any) {
    console.error(`❌ Request failed:`, error.message);
    return { ok: false, error: error.message };
  }
}

// =============================================================================
// REFRESH FUNCTIONS
// =============================================================================

/**
 * Refresh avatars for all profiles that need updating
 */
async function refreshAvatars(limit: number = 500, batchSize: number = 10): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🖼️  REFRESHING AVATARS');
  console.log('='.repeat(60));
  
  const url = `${BASE_URL}/api/portal/admin/arc/refresh-avatars?limit=${limit}&batchSize=${batchSize}`;
  
  const result = await makeRequest(url, {
    method: 'POST',
  });
  
  if (result.ok) {
    console.log(`\n✅ Avatar refresh completed:`);
    console.log(`   - Processed: ${result.processed}`);
    console.log(`   - Succeeded: ${result.succeeded}`);
    console.log(`   - Failed: ${result.failed}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Duration: ${Math.round(result.duration / 1000)}s`);
  } else {
    console.error(`\n❌ Avatar refresh failed: ${result.error}`);
    if (result.status === 401 || result.status === 403) {
      console.error(`   ⚠️  Authentication required. Make sure you're logged in as SuperAdmin.`);
      console.error(`   ⚠️  Or set AKARI_SESSION_TOKEN environment variable.`);
    }
  }
}

/**
 * Refresh sentiment data for all projects
 */
async function refreshSentiment(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 REFRESHING SENTIMENT DATA');
  console.log('='.repeat(60));
  
  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET not set. Skipping sentiment refresh.');
    console.warn('   Set CRON_SECRET environment variable to enable this.');
    return;
  }
  
  const url = `${BASE_URL}/api/portal/cron/sentiment-refresh-all?secret=${CRON_SECRET}`;
  
  const result = await makeRequest(url, {
    method: 'GET',
  });
  
  if (result.ok) {
    console.log(`\n✅ Sentiment refresh completed:`);
    console.log(`   - Total projects: ${result.totalProjects}`);
    console.log(`   - Success: ${result.successCount}`);
    console.log(`   - Failed: ${result.failCount}`);
    console.log(`   - Duration: ${Math.round(result.durationMs / 1000)}s`);
  } else {
    console.error(`\n❌ Sentiment refresh failed: ${result.error}`);
  }
}

/**
 * Smart refresh sentiment (only projects that need it)
 */
async function smartRefreshSentiment(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧠 SMART REFRESH SENTIMENT DATA');
  console.log('='.repeat(60));
  
  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET not set. Skipping smart refresh.');
    return;
  }
  
  const url = `${BASE_URL}/api/portal/cron/sentiment-smart-refresh?secret=${CRON_SECRET}`;
  
  const result = await makeRequest(url, {
    method: 'GET',
  });
  
  if (result.ok) {
    console.log(`\n✅ Smart refresh completed:`);
    console.log(`   - Total projects: ${result.totalProjects}`);
    console.log(`   - Refreshed: ${result.refreshedCount}`);
    console.log(`   - Skipped: ${result.skippedCount}`);
    console.log(`   - Duration: ${Math.round(result.durationMs / 1000)}s`);
  } else {
    console.error(`\n❌ Smart refresh failed: ${result.error}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n🚀 Starting Twitter API Refresh');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Session Token: ${SESSION_TOKEN ? '✓ Set' : '✗ Not set (auth may fail)'}`);
  console.log(`Cron Secret: ${CRON_SECRET ? '✓ Set' : '✗ Not set (sentiment refresh will be skipped)'}`);
  console.log('='.repeat(60));
  
  const args = process.argv.slice(2);
  const refreshType = args[0] || 'all';
  
  try {
    switch (refreshType) {
      case 'avatars':
        await refreshAvatars();
        break;
      
      case 'sentiment':
        await refreshSentiment();
        break;
      
      case 'smart':
        await smartRefreshSentiment();
        break;
      
      case 'all':
      default:
        // Refresh avatars first (faster)
        await refreshAvatars();
        
        // Then refresh sentiment (slower, optional)
        if (CRON_SECRET) {
          console.log('\n⏳ Waiting 5 seconds before sentiment refresh...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          await smartRefreshSentiment(); // Use smart refresh to save API calls
        }
        break;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All refresh operations completed!');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { refreshAvatars, refreshSentiment, smartRefreshSentiment };
