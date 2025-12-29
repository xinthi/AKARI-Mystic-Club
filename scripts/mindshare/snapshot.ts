/**
 * Project Mindshare Snapshot Script
 * 
 * Calculates and stores daily mindshare snapshots for all projects per window.
 * Run daily via cron.
 * 
 * Usage: pnpm tsx scripts/mindshare/snapshot.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';
import { calculateProjectAttentionValue, normalizeMindshareBPS, type MindshareWindow } from '@/server/mindshare/calculate';

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[Mindshare Snapshot] Starting mindshare snapshot calculation...');
  
  const supabase = createServiceClient();
  const asOfDate = new Date();
  const dateStr = asOfDate.toISOString().split('T')[0];

  // Get all active projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id')
    .eq('is_active', true);

  if (projectsError) {
    console.error('[Mindshare Snapshot] Error fetching projects:', projectsError);
    throw new Error('Failed to fetch projects');
  }

  console.log(`[Mindshare Snapshot] Found ${projects?.length || 0} active projects`);

  // Calculate mindshare for each window
  const windows: MindshareWindow[] = ['24h', '48h', '7d', '30d'];

  for (const window of windows) {
    console.log(`[Mindshare Snapshot] Calculating mindshare for ${window} window...`);

    // Calculate attention values for all projects
    const attentionValues: Array<{ projectId: string; attention_value: number }> = [];

    for (const project of projects || []) {
      try {
        const attentionValue = await calculateProjectAttentionValue(supabase, project.id, window);
        attentionValues.push({
          projectId: project.id,
          attention_value: attentionValue,
        });
      } catch (error: any) {
        console.error(`[Mindshare Snapshot] Error calculating attention value for project ${project.id} (${window}):`, error.message);
        // Continue with next project
      }
    }

    console.log(`[Mindshare Snapshot] Calculated attention values for ${attentionValues.length} projects`);

    // Normalize to 10,000 bps
    const bpsMap = await normalizeMindshareBPS(attentionValues);

    // Store snapshots
    console.log(`[Mindshare Snapshot] Normalized mindshare for ${window}:`);
    const sortedBps = Array.from(bpsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [projectId, bps] of sortedBps) {
      console.log(`  Project ${projectId}: ${bps} bps`);
    }

    // Store snapshots in database
    const snapshots = Array.from(bpsMap.entries()).map(([projectId, bps]) => {
      const attentionValue = attentionValues.find(av => av.projectId === projectId)?.attention_value || 0;
      return {
        project_id: projectId,
        time_window: window,
        mindshare_bps: bps,
        attention_value: attentionValue,
        as_of_date: dateStr,
      };
    });

    if (snapshots.length > 0) {
      const { error: upsertError } = await supabase
        .from('project_mindshare_snapshots')
        .upsert(snapshots, {
          onConflict: 'project_id,time_window,as_of_date',
        });

      if (upsertError) {
        console.error(`[Mindshare Snapshot] Error storing snapshots for ${window}:`, upsertError);
      } else {
        console.log(`[Mindshare Snapshot] Stored ${snapshots.length} snapshots for ${window}`);
      }
    }
  }

  console.log('[Mindshare Snapshot] Mindshare snapshot calculation complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Mindshare Snapshot] Fatal error:', error);
    process.exit(1);
  });
}

export { main as calculateMindshareSnapshots };

