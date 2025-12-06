/**
 * Build Circles Quick Script
 * 
 * A fast version that skips Twitter API calls and builds inner circles
 * from existing data in the database.
 * 
 * Use this for quick testing. For full scoring, use updateCircles.ts
 * 
 * Run with: pnpm circles:quick
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log('========================================');
  log('AKARI Circles Quick Build');
  log('========================================');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Step 1: Check existing data
  log('Step 1: Checking existing data...');
  
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, slug, name, x_handle')
    .eq('is_active', true);

  if (projErr) {
    log('Error fetching projects:', projErr.message);
    return;
  }

  log(`Found ${projects?.length || 0} active projects`);

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, name, followers, akari_profile_score, influence_score')
    .order('akari_profile_score', { ascending: false })
    .limit(100);

  log(`Found ${profiles?.length || 0} profiles in database`);

  const { data: influencers, error: infErr } = await supabase
    .from('influencers')
    .select('id, x_handle, name, followers, akari_score, credibility_score')
    .order('akari_score', { ascending: false })
    .limit(50);

  log(`Found ${influencers?.length || 0} influencers in database`);

  // Step 2: If no profiles exist, create sample data from influencers
  if (!profiles || profiles.length === 0) {
    log('Step 2: No profiles found. Creating from influencers...');
    
    if (influencers && influencers.length > 0) {
      for (const inf of influencers) {
        const { error: insertErr } = await supabase
          .from('profiles')
          .upsert({
            username: inf.x_handle,
            name: inf.name,
            followers: inf.followers || 0,
            following: 0,
            akari_profile_score: inf.akari_score || 500,
            influence_score: inf.credibility_score || 50,
            authenticity_score: 70,
            signal_density_score: 60,
            farm_risk_score: 10,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'username' });

        if (insertErr) {
          log(`Error inserting profile ${inf.x_handle}:`, insertErr.message);
        } else {
          log(`  Created profile: @${inf.x_handle}`);
        }
      }
    } else {
      log('No influencers found either. Please add some data first.');
    }
  }

  // Refresh profiles
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, username, name, profile_image_url, followers, akari_profile_score, influence_score, authenticity_score, signal_density_score')
    .not('akari_profile_score', 'is', null);

  log(`Total scored profiles: ${allProfiles?.length || 0}`);

  // Step 3: Build Global Inner Circle
  log('Step 3: Building Global Inner Circle...');
  
  const qualifiedProfiles = (allProfiles || []).filter(p => 
    (p.akari_profile_score || 0) >= 750 &&
    (p.influence_score || 0) >= 70 &&
    (p.authenticity_score || 0) >= 60 &&
    (p.signal_density_score || 0) >= 60
  );

  log(`Profiles qualifying for Inner Circle: ${qualifiedProfiles.length}`);

  // Clear and rebuild inner circle
  await supabase.from('inner_circle_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (qualifiedProfiles.length > 0) {
    const insertData = qualifiedProfiles.slice(0, 100).map(p => ({
      profile_id: p.id,
      akari_profile_score: p.akari_profile_score,
      influence_score: p.influence_score,
      segment: 'general',
      added_at: new Date().toISOString(),
    }));

    const { error: icErr } = await supabase.from('inner_circle_members').insert(insertData);
    if (icErr) {
      log('Error inserting inner circle:', icErr.message);
    } else {
      log(`Inserted ${insertData.length} inner circle members`);
    }
  }

  // Step 4: Link profiles to projects (simple version)
  log('Step 4: Building Project Inner Circles...');

  for (const project of projects || []) {
    log(`Processing ${project.name}...`);

    // Get existing project_influencers for this project
    const { data: projInf } = await supabase
      .from('project_influencers')
      .select('influencer_id, influencers(x_handle)')
      .eq('project_id', project.id);

    // Find matching profiles
    const linkedProfiles: string[] = [];
    for (const pi of projInf || []) {
      const inf = pi.influencers as any;
      if (inf?.x_handle) {
        const matchingProfile = (allProfiles || []).find(
          p => p.username.toLowerCase() === inf.x_handle.toLowerCase()
        );
        if (matchingProfile) {
          linkedProfiles.push(matchingProfile.id);
        }
      }
    }

    // Clear existing project inner circle
    await supabase.from('project_inner_circle').delete().eq('project_id', project.id);

    if (linkedProfiles.length > 0) {
      const insertData = linkedProfiles.map(profileId => ({
        project_id: project.id,
        profile_id: profileId,
        is_follower: true,
        is_author: false,
        weight: 0.5,
        created_at: new Date().toISOString(),
      }));

      const { error: picErr } = await supabase.from('project_inner_circle').insert(insertData);
      if (picErr) {
        log(`  Error: ${picErr.message}`);
      } else {
        log(`  Linked ${linkedProfiles.length} profiles`);
      }
    }

    // Update project stats
    await supabase
      .from('projects')
      .update({
        inner_circle_count: linkedProfiles.length,
        inner_circle_power: linkedProfiles.length * 50,
        last_scored_at: new Date().toISOString(),
      })
      .eq('id', project.id);
  }

  // Step 5: Compute competitors (if multiple projects)
  if (projects && projects.length >= 2) {
    log('Step 5: Computing competitor relationships...');

    // Get all project circles
    const projectCircles = new Map<string, Set<string>>();
    
    for (const project of projects) {
      const { data: circle } = await supabase
        .from('project_inner_circle')
        .select('profile_id')
        .eq('project_id', project.id);

      projectCircles.set(project.id, new Set((circle || []).map(c => c.profile_id)));
    }

    // Compute pairwise overlap
    for (const projectA of projects) {
      const circleA = projectCircles.get(projectA.id) || new Set();
      
      for (const projectB of projects) {
        if (projectA.id === projectB.id) continue;

        const circleB = projectCircles.get(projectB.id) || new Set();
        
        const common = [...circleA].filter(id => circleB.has(id)).length;
        const union = new Set([...circleA, ...circleB]).size;
        const similarity = union > 0 ? common / union : 0;

        if (common > 0) {
          await supabase
            .from('project_competitors')
            .upsert({
              project_id: projectA.id,
              competitor_id: projectB.id,
              common_inner_circle_count: common,
              common_inner_circle_power: common * 50,
              similarity_score: Math.round(similarity * 10000) / 10000,
              computed_at: new Date().toISOString(),
            }, { onConflict: 'project_id,competitor_id' });

          log(`  ${projectA.name} <-> ${projectB.name}: ${Math.round(similarity * 100)}% similar`);
        }
      }
    }
  }

  // Summary
  log('========================================');
  log('QUICK BUILD COMPLETE');
  log('========================================');
  
  // Final counts
  const { count: icCount } = await supabase.from('inner_circle_members').select('*', { count: 'exact', head: true });
  const { count: picCount } = await supabase.from('project_inner_circle').select('*', { count: 'exact', head: true });
  const { count: compCount } = await supabase.from('project_competitors').select('*', { count: 'exact', head: true });

  log(`Global Inner Circle: ${icCount || 0} members`);
  log(`Project Inner Circles: ${picCount || 0} links`);
  log(`Competitor pairs: ${compCount || 0}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});

