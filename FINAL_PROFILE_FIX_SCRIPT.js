/**
 * FINAL COMPREHENSIVE PROFILE FIX - Run This NOW
 * 
 * Copy and paste this into your browser console on the leaderboard page:
 * /portal/arc/mysticheros
 */

(async function finalProfileFix() {
  console.log('🚀 Starting FINAL comprehensive profile fix...');
  console.log('This will:');
  console.log('  1. Find ALL mention authors from sentiment data');
  console.log('  2. Create/update profiles for ALL of them');
  console.log('  3. Fetch avatars from Twitter API');
  console.log('  4. Update ARC database');
  console.log('\n⏱️  This may take 5-15 minutes depending on number of profiles...\n');
  
  try {
    // Step 1: Update profiles from sentiment
    console.log('📊 Step 1: Updating profiles from sentiment data...');
    const step1Res = await fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step1Res.ok) {
      throw new Error(`Step 1 failed: ${step1Res.status} ${step1Res.statusText}`);
    }
    
    const step1Data = await step1Res.json();
    console.log('✅ Step 1 Complete:', step1Data);
    console.log(`   Total mention authors: ${step1Data.totalMentionAuthors || 0}`);
    console.log(`   Profiles created: ${step1Data.profilesCreated || 0}`);
    console.log(`   Profiles updated: ${step1Data.profilesUpdated || 0}`);
    console.log(`   Profiles skipped: ${step1Data.profilesSkipped || 0}`);
    console.log(`   Profiles failed: ${step1Data.profilesFailed || 0}`);
    
    // Wait a bit before step 2
    console.log('\n⏳ Waiting 2 seconds before Step 2...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Refresh all avatars
    console.log('📊 Step 2: Refreshing all avatars...');
    const step2Res = await fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step2Res.ok) {
      throw new Error(`Step 2 failed: ${step2Res.status} ${step2Res.statusText}`);
    }
    
    const step2Data = await step2Res.json();
    console.log('✅ Step 2 Complete:', step2Data);
    console.log(`   Total processed: ${step2Data.totalProcessed || 0}`);
    console.log(`   Avatars refreshed: ${step2Data.totalSucceeded || 0}`);
    console.log(`   Failed: ${step2Data.totalFailed || 0}`);
    console.log(`   Skipped: ${step2Data.totalSkipped || 0}`);
    
    // Summary
    const totalFixed = (step1Data.profilesCreated || 0) + (step1Data.profilesUpdated || 0) + (step2Data.totalSucceeded || 0);
    
    console.log('\n✅ ========================================');
    console.log('✅ FINAL FIX COMPLETE!');
    console.log(`✅ Total profiles fixed: ${totalFixed}`);
    console.log('✅ ========================================\n');
    
    if (totalFixed > 0) {
      alert(`✅ FINAL FIX COMPLETE!\n\nProfiles: ${(step1Data.profilesCreated || 0) + (step1Data.profilesUpdated || 0)}\nAvatars: ${step2Data.totalSucceeded || 0}\n\nReloading page in 3 seconds...`);
      setTimeout(() => {
        location.reload();
      }, 3000);
    } else {
      alert('ℹ️ All profiles are already up to date!\n\nReloading page...');
      setTimeout(() => {
        location.reload();
      }, 2000);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    alert(`Error running fix: ${error.message}\n\nCheck console for details.`);
  }
})();
