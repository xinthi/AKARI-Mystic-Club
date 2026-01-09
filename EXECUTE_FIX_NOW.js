/**
 * ⚡ EXECUTE FIX NOW - Copy this into browser console
 * 
 * This script will:
 * 1. Update ALL profiles from sentiment data
 * 2. Refresh ALL avatars from Twitter API
 * 3. Reload the page automatically
 */

(async function executeFixNow() {
  console.log('🚀 Starting comprehensive profile fix...\n');
  const startTime = Date.now();
  
  try {
    // Step 1: Update profiles from sentiment data
    console.log('📊 Step 1: Updating profiles from sentiment data...');
    console.log('   This may take 3-10 minutes depending on number of profiles...\n');
    
    const step1Res = await fetch('/api/portal/admin/arc/update-profiles-from-sentiment', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step1Res.ok) {
      const errorText = await step1Res.text();
      throw new Error(`Step 1 failed: ${step1Res.status} - ${errorText.substring(0, 200)}`);
    }
    
    const step1 = await step1Res.json();
    const step1Duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('✅ Step 1 Complete!');
    console.log(`   Duration: ${step1Duration}s`);
    console.log(`   Total mention authors: ${step1.totalMentionAuthors || 0}`);
    console.log(`   Profiles created: ${step1.profilesCreated || 0}`);
    console.log(`   Profiles updated: ${step1.profilesUpdated || 0}`);
    console.log(`   Profiles skipped: ${step1.profilesSkipped || 0}`);
    console.log(`   Profiles failed: ${step1.profilesFailed || 0}`);
    
    if (step1.errors && step1.errors.length > 0) {
      console.log(`\n⚠️  ${step1.errors.length} errors (showing first 5):`);
      step1.errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. @${err.username}: ${err.error}`);
      });
    }
    console.log('');
    
    // Wait 3 seconds before step 2
    console.log('⏳ Waiting 3 seconds before Step 2...\n');
    await new Promise(r => setTimeout(r, 3000));
    
    const step2StartTime = Date.now();
    
    // Step 2: Refresh all avatars
    console.log('📊 Step 2: Refreshing all avatars...');
    console.log('   This may take 5-15 minutes depending on number of avatars to refresh...\n');
    
    const step2Res = await fetch('/api/portal/admin/arc/refresh-all-avatars?batchSize=5', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!step2Res.ok) {
      const errorText = await step2Res.text();
      throw new Error(`Step 2 failed: ${step2Res.status} - ${errorText.substring(0, 200)}`);
    }
    
    const step2 = await step2Res.json();
    const step2Duration = ((Date.now() - step2StartTime) / 1000).toFixed(2);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('✅ Step 2 Complete!');
    console.log(`   Duration: ${step2Duration}s`);
    console.log(`   Total processed: ${step2.totalProcessed || 0}`);
    console.log(`   Avatars refreshed: ${step2.totalSucceeded || 0}`);
    console.log(`   Failed: ${step2.totalFailed || 0}`);
    console.log(`   Skipped: ${step2.totalSkipped || 0}`);
    
    if (step2.errors && step2.errors.length > 0) {
      console.log(`\n⚠️  ${step2.errors.length} errors (showing first 5):`);
      step2.errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. @${err.username}: ${err.error}`);
      });
    }
    
    // Summary
    const totalFixed = (step1.profilesCreated || 0) + (step1.profilesUpdated || 0) + (step2.totalSucceeded || 0);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ COMPREHENSIVE FIX COMPLETE!');
    console.log('='.repeat(50));
    console.log(`Total duration: ${totalDuration}s`);
    console.log(`Total profiles fixed: ${totalFixed}`);
    console.log(`  - Profiles created/updated: ${(step1.profilesCreated || 0) + (step1.profilesUpdated || 0)}`);
    console.log(`  - Avatars refreshed: ${step2.totalSucceeded || 0}`);
    console.log('='.repeat(50) + '\n');
    
    if (totalFixed > 0) {
      alert(`✅ FIX COMPLETE!\n\nProfiles created/updated: ${(step1.profilesCreated || 0) + (step1.profilesUpdated || 0)}\nAvatars refreshed: ${step2.totalSucceeded || 0}\n\nTotal duration: ${totalDuration}s\n\nReloading page in 3 seconds...`);
      console.log('💡 Page will reload automatically in 3 seconds...');
      setTimeout(() => {
        location.reload();
      }, 3000);
    } else {
      alert(`ℹ️ All profiles are already up to date!\n\nTotal duration: ${totalDuration}s\n\nReloading page...`);
      console.log('💡 Page will reload automatically...');
      setTimeout(() => {
        location.reload();
      }, 2000);
    }
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('\n❌ Error:', err);
    console.error(`Duration before error: ${duration}s`);
    
    // Handle different error types with better messages
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';
    
    if (err instanceof TypeError && err.message.includes('fetch')) {
      errorMessage = 'Network error: Could not reach the server';
      errorDetails = 'Please check your internet connection and try again.';
    } else if (err instanceof SyntaxError) {
      errorMessage = 'JSON parsing error';
      errorDetails = 'The server returned invalid data. Check Vercel logs.';
    } else if (err instanceof Error) {
      errorMessage = err.message;
      
      // Provide specific help based on error message
      if (err.message.includes('401')) {
        errorDetails = 'Authentication failed. Please log in as SuperAdmin and try again.';
      } else if (err.message.includes('403')) {
        errorDetails = 'Access denied. SuperAdmin access is required for this operation.';
      } else if (err.message.includes('500')) {
        errorDetails = 'Server error. Check Vercel logs for details.';
      } else if (err.message.includes('timeout') || err.message.includes('Timeout')) {
        errorDetails = 'Request timed out. The operation may still be running. Check Vercel logs.';
      } else if (err.message.includes('network') || err.message.includes('Network')) {
        errorDetails = 'Network error. Check your internet connection.';
      }
    } else if (typeof err === 'string') {
      errorMessage = err;
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = String(err.message);
    }
    
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check if you are logged in as SuperAdmin');
    console.error('   2. Check browser Network tab for failed requests');
    console.error('   3. Check Vercel logs for server-side errors');
    console.error('   4. Verify API endpoints are accessible');
    if (errorDetails) {
      console.error(`   5. ${errorDetails}`);
    }
    console.error('');
    
    const alertMessage = errorDetails 
      ? `❌ Error running fix:\n\n${errorMessage}\n\n${errorDetails}\n\nCheck browser console for more details.`
      : `❌ Error running fix:\n\n${errorMessage}\n\nCheck browser console for details.`;
    
    alert(alertMessage);
  }
})();
