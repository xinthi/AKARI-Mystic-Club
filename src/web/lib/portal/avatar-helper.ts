/**
 * Avatar Helper Functions for Portal APIs
 * 
 * Provides DB-only avatar fetching with username normalization.
 * Never calls live Twitter/X APIs - all avatars come from profiles table.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalize twitter username: strip @, lowercase, trim
 * This ensures consistent username matching across all database queries
 */
export function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@+/, '').trim();
}

/**
 * Fetch avatar URLs from profiles table for a list of usernames.
 * Returns a Map of normalized username -> avatar_url.
 * 
 * @param supabase - Supabase client (admin or portal)
 * @param usernames - Array of Twitter usernames (will be normalized)
 * @returns Map of normalized username -> avatar_url (string | null)
 */
export async function fetchAvatarsFromProfiles(
  supabase: SupabaseClient,
  usernames: (string | null | undefined)[]
): Promise<Map<string, string | null>> {
  const avatarMap = new Map<string, string | null>();
  
  if (!usernames || usernames.length === 0) {
    return avatarMap;
  }

  // Normalize and deduplicate usernames
  const normalizedUsernames = usernames
    .map(u => normalizeTwitterUsername(u))
    .filter(u => u.length > 0);
  
  const uniqueUsernames = Array.from(new Set(normalizedUsernames));
  
  if (uniqueUsernames.length === 0) {
    return avatarMap;
  }

  // Query in chunks to avoid PostgreSQL IN clause limits
  const chunkSize = 100;
  for (let i = 0; i < uniqueUsernames.length; i += chunkSize) {
    const chunk = uniqueUsernames.slice(i, i + chunkSize);
    
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', chunk);
      
      if (error) {
        console.warn('[AvatarHelper] Error fetching profiles:', error);
        continue;
      }
      
      if (profiles) {
        for (const profile of profiles) {
          const normalizedUsername = normalizeTwitterUsername(profile.username);
          if (normalizedUsername) {
            // Validate URL before storing
            const avatarUrl = profile.profile_image_url && 
                            typeof profile.profile_image_url === 'string' &&
                            profile.profile_image_url.trim().length > 0 &&
                            profile.profile_image_url.startsWith('http')
              ? profile.profile_image_url.trim()
              : null;
            avatarMap.set(normalizedUsername, avatarUrl);
          }
        }
      }
    } catch (err) {
      console.warn('[AvatarHelper] Exception fetching profiles chunk:', err);
    }
  }
  
  // Set null for usernames not found in DB
  for (const username of uniqueUsernames) {
    if (!avatarMap.has(username)) {
      avatarMap.set(username, null);
    }
  }
  
  return avatarMap;
}

/**
 * Fetch avatar URL for a single username.
 * 
 * @param supabase - Supabase client
 * @param username - Twitter username (will be normalized)
 * @returns avatar_url string or null
 */
export async function fetchAvatarForUsername(
  supabase: SupabaseClient,
  username: string | null | undefined
): Promise<string | null> {
  const normalized = normalizeTwitterUsername(username);
  if (!normalized) {
    return null;
  }
  
  const avatarMap = await fetchAvatarsFromProfiles(supabase, [normalized]);
  return avatarMap.get(normalized) || null;
}

/**
 * Check if a profile needs avatar refresh.
 * Returns true if:
 * - avatar_url is null OR
 * - avatar_updated_at < now() - 30 days OR
 * - needs_avatar_refresh = true
 * 
 * @param supabase - Supabase client
 * @param username - Twitter username (will be normalized)
 * @returns boolean indicating if refresh is needed
 */
export async function checkNeedsAvatarRefresh(
  supabase: SupabaseClient,
  username: string | null | undefined
): Promise<boolean> {
  const normalized = normalizeTwitterUsername(username);
  if (!normalized) {
    return true; // Missing username needs refresh
  }
  
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('profile_image_url, avatar_updated_at, needs_avatar_refresh')
      .eq('username', normalized)
      .maybeSingle();
    
    if (error || !profile) {
      return true; // Profile not found needs refresh
    }
    
    // Check explicit flag
    if (profile.needs_avatar_refresh === true) {
      return true;
    }
    
    // Check if avatar is missing
    if (!profile.profile_image_url) {
      return true;
    }
    
    // Check if avatar is old (>30 days)
    if (profile.avatar_updated_at) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const avatarUpdatedAt = new Date(profile.avatar_updated_at);
      if (avatarUpdatedAt < thirtyDaysAgo) {
        return true;
      }
    } else {
      // No update timestamp means it's old
      return true;
    }
    
    return false;
  } catch (err) {
    console.warn('[AvatarHelper] Error checking avatar refresh:', err);
    return true; // On error, assume refresh needed
  }
}
