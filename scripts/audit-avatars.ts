/**
 * Audit Script: Check avatar status for all profiles in ARC leaderboards
 * 
 * Usage: 
 *   pnpm tsx scripts/audit-avatars.ts <projectId>
 * 
 * Or run directly:
 *   ts-node scripts/audit-avatars.ts <projectId>
 */

import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@+/, '').trim();
}

async function auditAvatars(projectId: string) {
  console.log(`\n🔍 Auditing avatars for project: ${projectId}\n`);

  // Get project info
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, twitter_username')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error(`❌ Project not found: ${projectId}`);
    console.error(projectError);
    process.exit(1);
  }

  console.log(`📋 Project: ${project.name} (@${project.twitter_username || 'N/A'})\n`);

  // Get arena for this project
  const { data: arena, error: arenaError } = await supabase
    .from('arenas')
    .select('id, name')
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle();

  if (arenaError) {
    console.error('❌ Error fetching arena:', arenaError);
    process.exit(1);
  }

  if (!arena) {
    console.log('⚠️  No arena found for this project');
    process.exit(0);
  }

  console.log(`🎯 Arena: ${arena.name} (${arena.id})\n`);

  // Get all arena creators
  const { data: arenaCreators, error: creatorsError } = await supabase
    .from('arena_creators')
    .select('twitter_username, is_auto_tracked, profile_id, arc_points')
    .eq('arena_id', arena.id);

  if (creatorsError) {
    console.error('❌ Error fetching arena creators:', creatorsError);
    process.exit(1);
  }

  // Get all project creators (joined)
  const { data: projectCreators, error: projectCreatorsError } = await supabase
    .from('project_creators')
    .select('twitter_username, profile_id')
    .eq('project_id', projectId);

  if (projectCreatorsError) {
    console.error('❌ Error fetching project creators:', projectCreatorsError);
    process.exit(1);
  }

  // Collect all unique usernames
  const allUsernames = new Set<string>();
  const usernameMap = new Map<string, { isAutoTracked: boolean; isJoined: boolean; profileId: string | null; arcPoints: number }>();

  if (arenaCreators) {
    for (const creator of arenaCreators) {
      if (creator.twitter_username) {
        const normalized = normalizeTwitterUsername(creator.twitter_username);
        if (normalized) {
          allUsernames.add(normalized);
          usernameMap.set(normalized, {
            isAutoTracked: creator.is_auto_tracked || false,
            isJoined: false,
            profileId: creator.profile_id || null,
            arcPoints: creator.arc_points || 0,
          });
        }
      }
    }
  }

  if (projectCreators) {
    for (const creator of projectCreators) {
      if (creator.twitter_username) {
        const normalized = normalizeTwitterUsername(creator.twitter_username);
        if (normalized) {
          allUsernames.add(normalized);
          const existing = usernameMap.get(normalized);
          if (existing) {
            existing.isJoined = true;
            existing.profileId = creator.profile_id || existing.profileId;
          } else {
            usernameMap.set(normalized, {
              isAutoTracked: false,
              isJoined: true,
              profileId: creator.profile_id || null,
              arcPoints: 0,
            });
          }
        }
      }
    }
  }

  const usernamesArray = Array.from(allUsernames);
  console.log(`📊 Found ${usernamesArray.length} unique creators in leaderboard\n`);

  if (usernamesArray.length === 0) {
    console.log('✅ No creators found. Nothing to audit.');
    process.exit(0);
  }

  // Build all username variations for querying
  const allVariations = new Set<string>();
  for (const username of usernamesArray) {
    allVariations.add(username);
    allVariations.add(username.toLowerCase());
    allVariations.add(`@${username}`);
    allVariations.add(`@${username.toLowerCase()}`);
  }

  // Query profiles table
  console.log('🔍 Querying profiles table...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('username, profile_image_url, avatar_updated_at, needs_avatar_refresh, name')
    .in('username', Array.from(allVariations));

  if (profilesError) {
    console.error('❌ Error fetching profiles:', profilesError);
    process.exit(1);
  }

  // Query project_tweets for fallback avatars
  console.log('🔍 Querying project_tweets for fallback avatars...');
  const { data: tweets, error: tweetsError } = await supabase
    .from('project_tweets')
    .select('author_handle, author_profile_image_url')
    .eq('project_id', projectId)
    .not('author_profile_image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (tweetsError) {
    console.error('⚠️  Error fetching tweets:', tweetsError);
  }

  // Query tracked_profiles for fallback avatars
  console.log('🔍 Querying tracked_profiles for fallback avatars...');
  const { data: trackedProfiles, error: trackedError } = await supabase
    .from('tracked_profiles')
    .select('username, profile_image_url')
    .in('username', usernamesArray.map(u => u.toLowerCase()))
    .not('profile_image_url', 'is', null);

  if (trackedError) {
    console.error('⚠️  Error fetching tracked profiles:', trackedError);
  }

  // Build avatar map
  const avatarMap = new Map<string, { url: string; source: 'profiles' | 'project_tweets' | 'tracked_profiles' }>();
  const profileMap = new Map<string, typeof profiles[0]>();

  if (profiles) {
    for (const profile of profiles) {
      const normalized = normalizeTwitterUsername(profile.username);
      if (normalized) {
        profileMap.set(normalized, profile);
        if (profile.profile_image_url && profile.profile_image_url.startsWith('http')) {
          avatarMap.set(normalized, { url: profile.profile_image_url, source: 'profiles' });
        }
      }
    }
  }

  if (tweets) {
    for (const tweet of tweets) {
      if (tweet.author_handle && tweet.author_profile_image_url) {
        const normalized = normalizeTwitterUsername(tweet.author_handle);
        if (normalized && !avatarMap.has(normalized) && tweet.author_profile_image_url.startsWith('http')) {
          avatarMap.set(normalized, { url: tweet.author_profile_image_url, source: 'project_tweets' });
        }
      }
    }
  }

  if (trackedProfiles) {
    for (const tracked of trackedProfiles) {
      if (tracked.username && tracked.profile_image_url) {
        const normalized = normalizeTwitterUsername(tracked.username);
        if (normalized && !avatarMap.has(normalized) && tracked.profile_image_url.startsWith('http')) {
          avatarMap.set(normalized, { url: tracked.profile_image_url, source: 'tracked_profiles' });
        }
      }
    }
  }

  // Generate report
  console.log('\n📊 AVATAR AUDIT REPORT\n');
  console.log('=' .repeat(80));

  const report: Array<{
    username: string;
    hasProfile: boolean;
    hasAvatar: boolean;
    avatarUrl: string | null;
    source: string;
    needsRefresh: boolean | null;
    isAutoTracked: boolean;
    isJoined: boolean;
    arcPoints: number;
  }> = [];

  for (const username of usernamesArray) {
    const normalized = normalizeTwitterUsername(username);
    if (!normalized) continue;

    const meta = usernameMap.get(normalized);
    const profile = profileMap.get(normalized);
    const avatar = avatarMap.get(normalized);

    report.push({
      username: normalized,
      hasProfile: !!profile,
      hasAvatar: !!avatar,
      avatarUrl: avatar?.url || null,
      source: avatar?.source || 'none',
      needsRefresh: profile?.needs_avatar_refresh || null,
      isAutoTracked: meta?.isAutoTracked || false,
      isJoined: meta?.isJoined || false,
      arcPoints: meta?.arcPoints || 0,
    });
  }

  // Sort by arc_points descending
  report.sort((a, b) => b.arcPoints - a.arcPoints);

  // Summary
  const summary = {
    total: report.length,
    withAvatars: report.filter(p => p.hasAvatar).length,
    withoutAvatars: report.filter(p => !p.hasAvatar).length,
    missingProfiles: report.filter(p => !p.hasProfile).length,
    needsRefresh: report.filter(p => p.needsRefresh === true).length,
    fromProfiles: report.filter(p => p.source === 'profiles').length,
    fromTweets: report.filter(p => p.source === 'project_tweets').length,
    fromTracked: report.filter(p => p.source === 'tracked_profiles').length,
  };

  console.log('\n📈 SUMMARY\n');
  console.log(`Total creators:           ${summary.total}`);
  console.log(`With avatars:             ${summary.withAvatars} (${Math.round((summary.withAvatars / summary.total) * 100)}%)`);
  console.log(`Without avatars:          ${summary.withoutAvatars} (${Math.round((summary.withoutAvatars / summary.total) * 100)}%)`);
  console.log(`Missing from profiles DB: ${summary.missingProfiles}`);
  console.log(`Needs refresh:            ${summary.needsRefresh}`);
  console.log(`\nAvatar sources:`);
  console.log(`  - From profiles table:        ${summary.fromProfiles}`);
  console.log(`  - From project_tweets (fallback): ${summary.fromTweets}`);
  console.log(`  - From tracked_profiles (fallback): ${summary.fromTracked}`);

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 DETAILED REPORT\n');

  // Show first 50 creators
  const displayLimit = 50;
  const toDisplay = report.slice(0, displayLimit);

  console.log('Rank | Username              | Profile | Avatar | Source           | Refresh | Type');
  console.log('-'.repeat(80));

  for (let i = 0; i < toDisplay.length; i++) {
    const entry = toDisplay[i];
    const rank = String(i + 1).padStart(4);
    const username = entry.username.substring(0, 20).padEnd(20);
    const hasProfile = entry.hasProfile ? '✓' : '✗';
    const hasAvatar = entry.hasAvatar ? '✓' : '✗';
    const source = entry.source.substring(0, 15).padEnd(15);
    const needsRefresh = entry.needsRefresh === true ? 'YES' : entry.needsRefresh === false ? 'NO' : 'N/A';
    const type = entry.isAutoTracked ? 'AUTO' : entry.isJoined ? 'JOIN' : 'N/A';

    console.log(`${rank} | ${username} | ${hasProfile.padEnd(7)} | ${hasAvatar.padEnd(6)} | ${source} | ${needsRefresh.padEnd(7)} | ${type}`);
  }

  if (report.length > displayLimit) {
    console.log(`\n... and ${report.length - displayLimit} more creators`);
  }

  // Show creators without avatars
  const withoutAvatars = report.filter(p => !p.hasAvatar);
  if (withoutAvatars.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`\n❌ CREATORS WITHOUT AVATARS (${withoutAvatars.length})\n`);
    
    withoutAvatars.slice(0, 20).forEach((entry, idx) => {
      console.log(`${idx + 1}. @${entry.username} (${entry.isAutoTracked ? 'AUTO' : entry.isJoined ? 'JOINED' : 'N/A'}) - Profile exists: ${entry.hasProfile ? 'YES' : 'NO'}`);
    });

    if (withoutAvatars.length > 20) {
      console.log(`\n... and ${withoutAvatars.length - 20} more without avatars`);
    }
  }

  // Show creators missing from profiles DB
  const missingProfiles = report.filter(p => !p.hasProfile);
  if (missingProfiles.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`\n⚠️  CREATORS MISSING FROM PROFILES TABLE (${missingProfiles.length})\n`);
    
    missingProfiles.slice(0, 20).forEach((entry, idx) => {
      console.log(`${idx + 1}. @${entry.username} (${entry.isAutoTracked ? 'AUTO' : entry.isJoined ? 'JOINED' : 'N/A'})`);
    });

    if (missingProfiles.length > 20) {
      console.log(`\n... and ${missingProfiles.length - 20} more missing from profiles table`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Audit complete!\n');
}

// Main
const projectId = process.argv[2];

if (!projectId) {
  console.error('❌ Usage: pnpm tsx scripts/audit-avatars.ts <projectId>');
  console.error('   Example: pnpm tsx scripts/audit-avatars.ts a3256fab-bb9f-4f3a-ad60-bfc28e12dd46');
  process.exit(1);
}

auditAvatars(projectId).catch((error) => {
  console.error('❌ Error running audit:', error);
  process.exit(1);
});
