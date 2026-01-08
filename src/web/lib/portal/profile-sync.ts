/**
 * Profile Sync Helper
 * 
 * Ensures that whenever we fetch profile data from Twitter/X API,
 * we also save it to the profiles table with the latest avatar.
 * 
 * This is called automatically by sentiment endpoints when they fetch
 * profile data from Twitter.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { TwitterUserProfile } from '@/lib/twitter/twitter';
import { normalizeTwitterUsername } from './avatar-helper';

/**
 * Upsert a profile to the profiles table when fetching from Twitter/X API.
 * 
 * This ensures that:
 * - Profile exists in profiles table
 * - Latest avatar is stored
 * - Profile data is up-to-date
 * 
 * @param supabase - Supabase admin client
 * @param profile - Profile data from Twitter API
 * @returns The upserted profile ID or null
 */
export async function upsertProfileFromTwitter(
  supabase: SupabaseClient,
  profile: TwitterUserProfile
): Promise<string | null> {
  if (!profile.handle) {
    console.warn('[ProfileSync] No handle provided, skipping profile upsert');
    return null;
  }

  const normalizedUsername = normalizeTwitterUsername(profile.handle);
  if (!normalizedUsername) {
    console.warn('[ProfileSync] Invalid username after normalization, skipping');
    return null;
  }

  try {
    // Get avatar URL (try both fields)
    const avatarUrl = profile.profileImageUrl || profile.avatarUrl || null;
    const avatarUrlString = avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().startsWith('http')
      ? avatarUrl.trim()
      : null;

    // Prepare upsert data
    const upsertData: any = {
      username: normalizedUsername,
      updated_at: new Date().toISOString(),
    };

    // Only update these fields if we have data
    if (profile.name) {
      upsertData.name = profile.name;
    }

    if (avatarUrlString) {
      upsertData.profile_image_url = avatarUrlString;
      upsertData.avatar_updated_at = new Date().toISOString();
      upsertData.needs_avatar_refresh = false; // We just refreshed it
    }

    if (profile.userId) {
      upsertData.twitter_id = profile.userId;
    }

    if (profile.bio) {
      upsertData.bio = profile.bio;
    }

    if (profile.followersCount !== undefined) {
      upsertData.followers = profile.followersCount;
    }

    if (profile.followingCount !== undefined) {
      upsertData.following = profile.followingCount;
    }

    if (profile.tweetCount !== undefined) {
      upsertData.tweet_count = profile.tweetCount;
    }

    if (profile.verified !== undefined) {
      upsertData.is_blue_verified = profile.verified;
    }

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, username, profile_image_url')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile - never overwrite username (single source of truth)
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(upsertData)
        .eq('id', existingProfile.id)
        .select('id')
        .single();

      if (updateError) {
        console.error(`[ProfileSync] Error updating profile ${normalizedUsername}:`, updateError);
        return existingProfile.id; // Return existing ID even if update failed
      }

      if (avatarUrlString && existingProfile.profile_image_url !== avatarUrlString) {
        console.log(`[ProfileSync] ✓ Updated avatar for ${normalizedUsername}: ${avatarUrlString.substring(0, 50)}...`);
      }

      return updatedProfile?.id || existingProfile.id;
    } else {
      // Insert new profile
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          ...upsertData,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        // If insert fails (e.g., unique constraint), try update instead
        console.warn(`[ProfileSync] Insert failed for ${normalizedUsername}, trying update:`, insertError);
        const { data: existingAfterError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalizedUsername)
          .maybeSingle();

        if (existingAfterError) {
          // Profile was created between check and insert, update it
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update(upsertData)
            .eq('id', existingAfterError.id)
            .select('id')
            .single();

          return updatedProfile?.id || existingAfterError.id;
        }

        console.error(`[ProfileSync] Failed to create profile for ${normalizedUsername}:`, insertError);
        return null;
      }

      console.log(`[ProfileSync] ✓ Created profile for ${normalizedUsername}${avatarUrlString ? ' with avatar' : ''}`);
      return newProfile?.id || null;
    }
  } catch (error: any) {
    console.error(`[ProfileSync] Unexpected error upserting profile ${normalizedUsername}:`, error);
    return null;
  }
}

/**
 * Batch upsert profiles from Twitter API responses.
 * Useful when fetching multiple profiles at once.
 * 
 * @param supabase - Supabase admin client
 * @param profiles - Array of profile data from Twitter API
 * @returns Map of normalized username -> profile ID
 */
export async function upsertProfilesFromTwitter(
  supabase: SupabaseClient,
  profiles: TwitterUserProfile[]
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>();

  if (!profiles || profiles.length === 0) {
    return resultMap;
  }

  console.log(`[ProfileSync] Batch upserting ${profiles.length} profiles...`);

  // Process in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    
    const batchPromises = batch.map(profile => 
      upsertProfileFromTwitter(supabase, profile).then(profileId => {
        if (profileId && profile.handle) {
          const normalized = normalizeTwitterUsername(profile.handle);
          if (normalized) {
            resultMap.set(normalized, profileId);
          }
        }
      })
    );

    await Promise.all(batchPromises);
    
    // Small delay between batches to avoid rate limits
    if (i + batchSize < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[ProfileSync] ✓ Batch upserted ${resultMap.size}/${profiles.length} profiles`);
  return resultMap;
}
