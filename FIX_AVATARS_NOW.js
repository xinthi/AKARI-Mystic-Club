/**
 * Quick Fix Script for Missing Avatars
 * 
 * Run this in your browser console on the leaderboard page:
 * /portal/arc/mysticheros
 * 
 * This will:
 * 1. Check current avatar status
 * 2. Trigger avatar refresh for all auto-tracked creators
 * 3. Reload the page to show results
 */

(async function fixAvatars() {
  console.log('🔍 Checking current avatar status...');
  
  // Get project ID from current page
  const projectSlug = window.location.pathname.split('/').pop();
  
  // First, check what the API returns
  try {
    const leaderboardRes = await fetch(`/api/portal/arc/leaderboard/a3256fab-bb9f-4f3a-ad60-bfc28e12dd46`, {
      credentials: 'include'
    });
    
    if (!leaderboardRes.ok) {
      console.error('❌ Failed to fetch leaderboard:', leaderboardRes.status);
      return;
    }
    
    const leaderboardData = await leaderboardRes.json();
    const creators = leaderboardData.creators || [];
    const autoTracked = creators.filter(c => c.is_auto_tracked);
    const withAvatars = autoTracked.filter(c => c.avatar_url && c.avatar_url.startsWith('http'));
    const withoutAvatars = autoTracked.filter(c => !c.avatar_url || !c.avatar_url.startsWith('http'));
    
    console.log(`📊 Status:`);
    console.log(`   Total creators: ${creators.length}`);
    console.log(`   Auto-tracked: ${autoTracked.length}`);
    console.log(`   With avatars: ${withAvatars.length}`);
    console.log(`   Without avatars: ${withoutAvatars.length}`);
    
    if (withoutAvatars.length > 0) {
      console.log(`\n❌ Missing avatars for:`);
      withoutAvatars.forEach(c => {
        console.log(`   - @${c.twitter_username} (is_auto_tracked: ${c.is_auto_tracked})`);
      });
    }
    
    if (withoutAvatars.length === 0) {
      console.log('\n✅ All auto-tracked creators have avatars!');
      return;
    }
    
    console.log(`\n🔄 Refreshing avatars for ${withoutAvatars.length} creators...`);
    
    // Trigger refresh
    const refreshRes = await fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!refreshRes.ok) {
      console.error('❌ Failed to refresh avatars:', refreshRes.status);
      const errorText = await refreshRes.text();
      console.error('Error details:', errorText);
      return;
    }
    
    const refreshData = await refreshRes.json();
    console.log('\n✅ Refresh Results:');
    console.log(`   Processed: ${refreshData.totalProcessed || 0}`);
    console.log(`   Succeeded: ${refreshData.totalSucceeded || 0}`);
    console.log(`   Failed: ${refreshData.totalFailed || 0}`);
    console.log(`   Skipped: ${refreshData.totalSkipped || 0}`);
    
    if (refreshData.errors && refreshData.errors.length > 0) {
      console.log('\n⚠️ Errors:');
      refreshData.errors.slice(0, 5).forEach(err => {
        console.log(`   - @${err.username}: ${err.error}`);
      });
    }
    
    if (refreshData.totalSucceeded > 0) {
      console.log(`\n✅ Successfully refreshed ${refreshData.totalSucceeded} avatars!`);
      console.log('🔄 Reloading page in 2 seconds...');
      setTimeout(() => {
        location.reload();
      }, 2000);
    } else {
      console.log('\n⚠️ No avatars were refreshed. This might mean:');
      console.log('   1. Profiles already have avatars (but API might not be finding them)');
      console.log('   2. Twitter API rate limit reached');
      console.log('   3. Profiles don\'t exist yet (run sentiment tracking first)');
      console.log('\n💡 Try running sentiment tracking for the project first, then refresh again.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error checking/refreshing avatars. Check console for details.');
  }
})();
