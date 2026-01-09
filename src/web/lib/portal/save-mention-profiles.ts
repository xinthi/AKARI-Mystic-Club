/**
 * Helper function to save profiles for mention authors after project_tweets are saved
 * 
 * This should be called after saving project_tweets to ensure all mention authors
 * have profiles with avatars in the database for ARC leaderboards.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getUserProfile } from '@/lib/twitter/twitter';
import { upsertProfileFromTwitter } from './profile-sync';
import { normalizeTwitterUsername } from './avatar-helper';

/**
 * Save profiles for mention authors from project_tweets
 * 
 * @param supabase - Supabase client
 * @param projectId - Project ID (optional, if not provided, processes all projects)
 * @returns Statistics about profiles saved
 */
export async function saveMentionProfiles(
  supabase: SupabaseClient,
  projectId?: string
): Promise<{
  totalMentions: number;
  uniqueAuthors: number;
  profilesCreated: number;
  profilesUpdated: number;
  profilesSkipped: number;
  profilesFailed: number;
}> {
  console.log('[SaveMentionProfiles] Starting profile save for mention authors...');
  
  let query = supabase
    .from('project_tweets')
    .select('author_handle, author_profile_image_url')
    .eq('is_official', false)
    .not('author_handle', 'is', null)
    .limit(10000);
  
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  
  const { data: mentionTweets, error } = await query;
  
  if (error) {
    console.error('[SaveMentionProfiles] Error fetching mentions:', error);
    return {
      totalMentions: 0,
      uniqueAuthors: 0,
      profilesCreated: 0,
      profilesUpdated: 0,
      profilesSkipped: 0,
      profilesFailed: 0,
    };
  }
  
  if (!mentionTweets || mentionTweets.length === 0) {
    console.log('[SaveMentionProfiles] No mentions found');
    return {
      totalMentions: 0,
      uniqueAuthors: 0,
      profilesCreated: 0,
      profilesUpdated: 0,
      profilesSkipped: 0,
      profilesFailed: 0,
    };
  }
  
  // Collect unique authors
  const uniqueAuthors = new Map<string, { handle: string; avatarUrl: string | null }>();
  for (const tweet of mentionTweets) {
    if (tweet.author_handle) {
      const normalized = normalizeTwitterUsername(tweet.author_handle);
      if (normalized && !uniqueAuthors.has(normalized)) {
        uniqueAuthors.set(normalized, {
          handle: normalized,
          avatarUrl: tweet.author_profile_image_url || null,
        });
      }
    }
  }
  
  console.log(`[SaveMentionProfiles] Found ${uniqueAuthors.size} unique mention authors`);
  
  // Check existing profiles
  const authorsToProcess: string[] = [];
  const existingProfiles = new Map<string, { hasAvatar: boolean }>();
  
  if (uniqueAuthors.size > 0) {
    const authorHandles = Array.from(uniqueAuthors.keys());
    const chunkSize = 100;
    
    for (let i = 0; i < authorHandles.length; i += chunkSize) {
      const chunk = authorHandles.slice(i, i + chunkSize);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', chunk);
      
      if (profiles) {
        for (const profile of profiles) {
          const normalized = normalizeTwitterUsername(profile.username);
          if (normalized) {
            existingProfiles.set(normalized, {
              hasAvatar: !!(profile.profile_image_url && profile.profile_image_url.startsWith('http')),
            });
          }
        }
      }
    }
    
    // Determine which authors need profiles or avatars
    for (const [normalized, data] of uniqueAuthors) {
      const existing = existingProfiles.get(normalized);
      if (!existing || !existing.hasAvatar) {
        authorsToProcess.push(normalized);
      }
    }
  }
  
  console.log(`[SaveMentionProfiles] ${authorsToProcess.length} authors need profiles/avatars`);
  
  // Save profiles in batches
  let profilesCreated = 0;
  let profilesUpdated = 0;
  let profilesSkipped = 0;
  let profilesFailed = 0;
  
  const batchSize = 5;
  for (let i = 0; i < authorsToProcess.length; i += batchSize) {
    const batch = authorsToProcess.slice(i, i + batchSize);
    console.log(`[SaveMentionProfiles] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(authorsToProcess.length / batchSize)}...`);
    
    for (const username of batch) {
      try {
        // Fetch profile from Twitter API
        const profile = await getUserProfile(username);
        
        if (profile) {
          // Save to profiles table
          const profileId = await upsertProfileFromTwitter(supabase, profile);
          
          if (profileId) {
            const existing = existingProfiles.has(username);
            if (existing) {
              profilesUpdated++;
              console.log(`[SaveMentionProfiles] ✓ Updated profile for @${username}`);
            } else {
              profilesCreated++;
              console.log(`[SaveMentionProfiles] ✓ Created profile for @${username}`);
            }
          } else {
            profilesSkipped++;
          }
        } else {
          profilesSkipped++;
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        profilesFailed++;
        console.error(`[SaveMentionProfiles] ❌ Error processing @${username}:`, error?.message);
      }
    }
    
    // Longer delay between batches
    if (i + batchSize < authorsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`[SaveMentionProfiles] Complete: Created=${profilesCreated}, Updated=${profilesUpdated}, Skipped=${profilesSkipped}, Failed=${profilesFailed}`);
  
  return {
    totalMentions: mentionTweets.length,
    uniqueAuthors: uniqueAuthors.size,
    profilesCreated,
    profilesUpdated,
    profilesSkipped,
    profilesFailed,
  };
}
