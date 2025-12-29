/**
 * Verification Script: Project Mindshare Snapshots Schema
 * 
 * Verifies that the schema change from `window` -> `time_window` is working correctly.
 * 
 * Usage: pnpm tsx scripts/mindshare/verify-schema.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';

async function main() {
  console.log('[Mindshare Schema Verification] Starting verification...');
  
  const supabase = createServiceClient();
  
  // 1. Insert a dummy row
  console.log('[Mindshare Schema Verification] Step 1: Inserting dummy row...');
  
  // Get a test project ID (first active project)
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id')
    .eq('is_active', true)
    .limit(1);
  
  if (projectsError || !projects || projects.length === 0) {
    console.error('[Mindshare Schema Verification] Error: No active projects found');
    process.exit(1);
  }
  
  const testProjectId = projects[0].id;
  const today = new Date().toISOString().split('T')[0];
  
  // Insert dummy snapshot
  const { data: inserted, error: insertError } = await supabase
    .from('project_mindshare_snapshots')
    .insert({
      project_id: testProjectId,
      time_window: '24h',
      mindshare_bps: 100,
      attention_value: 1.5,
      as_of_date: today,
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('[Mindshare Schema Verification] Error inserting dummy row:', insertError);
    process.exit(1);
  }
  
  console.log('[Mindshare Schema Verification] ✅ Dummy row inserted:', {
    id: inserted.id,
    project_id: inserted.project_id,
    time_window: inserted.time_window,
    mindshare_bps: inserted.mindshare_bps,
  });
  
  // 2. Query it back using time_window
  console.log('[Mindshare Schema Verification] Step 2: Querying back using time_window...');
  
  const { data: queried, error: queryError } = await supabase
    .from('project_mindshare_snapshots')
    .select('*')
    .eq('project_id', testProjectId)
    .eq('time_window', '24h')
    .eq('as_of_date', today)
    .single();
  
  if (queryError) {
    console.error('[Mindshare Schema Verification] Error querying row:', queryError);
    process.exit(1);
  }
  
  if (!queried) {
    console.error('[Mindshare Schema Verification] Error: Row not found after query');
    process.exit(1);
  }
  
  console.log('[Mindshare Schema Verification] ✅ Row queried successfully:', {
    id: queried.id,
    time_window: queried.time_window,
    mindshare_bps: queried.mindshare_bps,
  });
  
  // 3. Call get_mindshare_delta function
  console.log('[Mindshare Schema Verification] Step 3: Calling get_mindshare_delta function...');
  
  const { data: deltaResult, error: deltaError } = await supabase
    .rpc('get_mindshare_delta', {
      p_project_id: testProjectId,
      p_time_window: '24h',
      p_days_ago: 1,
    });
  
  if (deltaError) {
    console.error('[Mindshare Schema Verification] Error calling get_mindshare_delta:', deltaError);
    process.exit(1);
  }
  
  console.log('[Mindshare Schema Verification] ✅ get_mindshare_delta called successfully');
  console.log('[Mindshare Schema Verification] Delta result:', deltaResult);
  console.log('[Mindshare Schema Verification] (Expected NULL since no yesterday row exists)');
  
  // 4. Cleanup: Delete the dummy row
  console.log('[Mindshare Schema Verification] Step 4: Cleaning up dummy row...');
  
  const { error: deleteError } = await supabase
    .from('project_mindshare_snapshots')
    .delete()
    .eq('id', inserted.id);
  
  if (deleteError) {
    console.warn('[Mindshare Schema Verification] Warning: Could not delete dummy row:', deleteError);
  } else {
    console.log('[Mindshare Schema Verification] ✅ Dummy row deleted');
  }
  
  console.log('[Mindshare Schema Verification] ✅ All verification steps passed!');
  console.log('[Mindshare Schema Verification] Schema change from window -> time_window is working correctly.');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Mindshare Schema Verification] Fatal error:', error);
    process.exit(1);
  });
}

export { main as verifyMindshareSchema };

