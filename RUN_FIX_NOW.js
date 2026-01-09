/**
 * ⚡ FINAL FIX - Run This NOW
 * 
 * Copy and paste this into your browser console on the leaderboard page
 */

(async function() {
  console.log('🚀 Starting FINAL comprehensive profile fix...\n');
  
  try {
    // Step 1: Update profiles from sentiment data
    console.log('📊 Step 1: Updating profiles from sentiment data...');
    const step1Res = await fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step1Res.ok) {
      const errorText = await step1Res.text();
      throw new Error(`Step 1 failed: ${step1Res.status} - ${errorText}`);
    }
    
    const step1 = await step1Res.json();
    console.log('✅ Step 1 Complete:', step1);
    console.log(`   Total mention authors: ${step1.totalMentionAuthors || 0}`);
    console.log(`   Profiles created: ${step1.profilesCreated || 0}`);
    console.log(`   Profiles updated: ${step1.profilesUpdated || 0}`);
    console.log(`   Profiles skipped: ${step1.profilesSkipped || 0}`);
    console.log(`   Profiles failed: ${step1.profilesFailed || 0}\n`);
    
    // Wait 3 seconds before step 2
    console.log('⏳ Waiting 3 seconds before Step 2...\n');
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 2: Refresh all avatars
    console.log('📊 Step 2: Refreshing all avatars...');
    const step2Res = await fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step2Res.ok) {
      const errorText = await step2Res.text();
      throw new Error(`Step 2 failed: ${step2Res.status} - ${errorText}`);
    }
    
    const step2 = await step2Res.json();
    console.log('✅ Step 2 Complete:', step2);
    console.log(`   Total processed: ${step2.totalProcessed || 0}`);
    console.log(`   Avatars refreshed: ${step2.totalSucceeded || 0}`);
    console.log(`   Failed: ${step2.totalFailed || 0}`);
    console.log(`   Skipped: ${step2.totalSkipped || 0}\n`);
    
    // Summary
    const totalFixed = (step1.profilesCreated || 0) + (step1.profilesUpdated || 0) + (step2.totalSucceeded || 0);
    console.log('✅ ========================================');
    console.log(`✅ FIX COMPLETE! Total fixed: ${totalFixed}`);
    console.log('✅ ========================================\n');
    
    if (totalFixed > 0) {
      alert(`✅ FIX COMPLETE!\n\nProfiles created/updated: ${(step1.profilesCreated || 0) + (step1.profilesUpdated || 0)}\nAvatars refreshed: ${step2.totalSucceeded || 0}\n\nReloading page in 3 seconds...`);
      setTimeout(() => location.reload(), 3000);
    } else {
      alert('ℹ️ All profiles are already up to date!\n\nReloading page...');
      setTimeout(() => location.reload(), 2000);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    alert(`Error running fix: ${err.message}\n\nCheck console for details.`);
  }
})();
