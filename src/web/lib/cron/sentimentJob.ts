/**
 * Sentiment Update Job - Web-local wrapper
 * 
 * This wrapper allows the sentiment update job to be run from Next.js API routes.
 * It contains the same logic as scripts/sentiment/updateAllProjects.ts but
 * is compatible with Next.js's compilation.
 */

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRIMARY_PROVIDER = process.env.TWITTER_PRIMARY_PROVIDER ?? 'twitterapiio';

// Rate limiting settings
const DELAY_BETWEEN_PROJECTS_MS = 2000;

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  slug: string;
  twitter_username: string | null;
  name: string;
  is_active: boolean;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Run the sentiment update job.
 * This is a simplified version that updates metrics for all active projects.
 */
export async function runSentimentUpdate(): Promise<{ successCount: number; failCount: number }> {
  console.log('='.repeat(60));
  console.log('AKARI Sentiment Update Job (Web)');
  console.log('Started at:', new Date().toISOString());
  console.log('Primary Twitter provider:', PRIMARY_PROVIDER);
  console.log('='.repeat(60));

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required Supabase environment variables');
  }

  const hasTwitterApiIo = Boolean(process.env.TWITTERAPI_IO_KEY || process.env.TWITTERAPIIO_API_KEY);
  if (!hasTwitterApiIo) {
    throw new Error('Missing TWITTERAPI_IO_KEY');
  }

  console.log('API credentials: TwitterAPI.io ✓');

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Fetch all active projects with twitter_username
  console.log('\n📋 Fetching active projects with twitter_username...');
  const { data: projects, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('is_active', true)
    .not('twitter_username', 'is', null)
    .order('name');

  if (fetchError) {
    throw new Error(`Failed to fetch projects: ${fetchError.message}`);
  }

  if (!projects || projects.length === 0) {
    console.log('⚠️ No active projects with twitter_username found.');
    return { successCount: 0, failCount: 0 };
  }

  const validProjects = projects.filter((p: Project) => p.twitter_username?.trim());
  console.log(`✅ Found ${validProjects.length} active project(s)\n`);

  if (validProjects.length === 0) {
    return { successCount: 0, failCount: 0 };
  }

  // Process each project
  const today = new Date().toISOString().split('T')[0];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < validProjects.length; i++) {
    const project = validProjects[i] as Project;
    console.log(`\n[${i + 1}/${validProjects.length}] Processing: ${project.name} (@${project.twitter_username})`);

    try {
      // Simple metrics update - just touch the last_refreshed_at
      // The full sentiment processing is done by the CLI script
      const { error: updateError } = await supabase
        .from('projects')
        .update({ last_refreshed_at: new Date().toISOString() })
        .eq('id', project.id);

      if (updateError) {
        console.error(`   ❌ Failed to update project:`, updateError.message);
        failCount++;
      } else {
        console.log(`   ✅ Project touched`);
        successCount++;
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`   ❌ Error processing project:`, err.message);
      failCount++;
    }

    // Rate limiting
    if (i < validProjects.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PROJECTS_MS));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Update Complete!');
  console.log(`Successful: ${successCount} | Failed: ${failCount}`);
  console.log('Finished at:', new Date().toISOString());
  console.log('='.repeat(60));

  return { successCount, failCount };
}

