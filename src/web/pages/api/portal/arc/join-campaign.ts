/**
 * API Route: POST /api/portal/arc/join-campaign
 * 
 * Allows authenticated users to join an ARC campaign by creating an arena_creators entry
 * for the active arena of the specified project.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface JoinCampaignBody {
  projectId: string;
}

type JoinCampaignResponse =
  | {
      ok: true;
      message: string;
      arenaId?: string;
      creatorId?: string;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get Supabase admin client for service role access
 */
function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('[getSupabaseAdmin] Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('[getSupabaseAdmin] Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check if a user is a SuperAdmin
 */
async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<JoinCampaignResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const supabase = createPortalClient();
    const isDevMode = process.env.NODE_ENV === 'development';
    
    let profile: { id: string; twitter_username: string } | null = null;

    // Get session token from cookies
    const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
    let sessionToken: string | null = null;
    for (const cookie of cookies) {
      if (cookie.startsWith('akari_session=')) {
        sessionToken = cookie.substring('akari_session='.length);
        break;
      }
    }

    // DEV MODE: If no session token, use dev_user profile
    if (isDevMode && !sessionToken) {
      console.log('[API /portal/arc/join-campaign] Dev mode: No session token, using dev_user');
      const supabaseAdmin = getSupabaseAdmin();
      
      // Try to find existing dev_user profile (profiles table uses 'username', not 'twitter_username')
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .ilike('username', 'dev_user')
        .limit(1)
        .maybeSingle();

      if (existingProfile) {
        profile = {
          id: existingProfile.id,
          twitter_username: existingProfile.username || 'dev_user',
        };
        console.log('[API /portal/arc/join-campaign] Dev mode: Found existing dev_user profile:', profile.id);
      } else {
        // Create a dev_user profile if it doesn't exist
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('profiles')
          .insert({
            username: 'dev_user',  // profiles table uses 'username' column
            name: 'Dev User',
          })
          .select('id, username')
          .single();

        if (createError) {
          // If insert failed (likely duplicate), try to find it
          console.log('[API /portal/arc/join-campaign] Dev mode: Insert failed, trying to find existing profile:', createError.message);
          const { data: retryProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, username')
            .ilike('username', 'dev_user')
            .limit(1)
            .maybeSingle();
          
          if (retryProfile) {
            profile = {
              id: retryProfile.id,
              twitter_username: retryProfile.username || 'dev_user',
            };
            console.log('[API /portal/arc/join-campaign] Dev mode: Found dev_user profile after insert failure:', profile.id);
          }
        } else if (newProfile) {
          profile = {
            id: newProfile.id,
            twitter_username: newProfile.username || 'dev_user',
          };
          console.log('[API /portal/arc/join-campaign] Dev mode: Created dev_user profile:', profile.id);
        }
      }
    } else {
      // Normal authentication flow
      if (!sessionToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated',
        });
      }

      // Get user session
      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({
          ok: false,
          error: 'Invalid session',
        });
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({
          ok: false,
          error: 'Session expired',
        });
      }

      const userId = session.user_id;

      // Check if user is SuperAdmin
      const supabaseAdmin = getSupabaseAdmin();
      const isSuperAdmin = await checkSuperAdmin(supabaseAdmin, userId);

      // Get user profile to get Twitter username
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, twitter_username')
        .eq('akari_user_id', userId)
        .single();

      // SuperAdmin: If no profile found, create one automatically (bypass X account requirement)
      if ((profileError || !userProfile) && isSuperAdmin) {
        console.log('[API /portal/arc/join-campaign] SuperAdmin without profile, creating one automatically');
        
        const defaultTwitterUsername = `admin_${userId.substring(0, 8)}`;
        
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('profiles')
          .insert({
            twitter_username: defaultTwitterUsername,
            name: 'Super Admin',
            akari_user_id: userId,
          })
          .select('id, twitter_username')
          .single();

        if (createError) {
          // If insert failed (likely duplicate), try to find it
          const { data: retryProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, twitter_username')
            .eq('akari_user_id', userId)
            .limit(1)
            .maybeSingle();
          
          if (retryProfile) {
            profile = {
              id: retryProfile.id,
              twitter_username: retryProfile.twitter_username || defaultTwitterUsername,
            };
          }
        } else if (newProfile) {
          profile = {
            id: newProfile.id,
            twitter_username: newProfile.twitter_username || defaultTwitterUsername,
          };
        }
      } else if (profileError || !userProfile) {
        // Not SuperAdmin and no profile - return error
        return res.status(404).json({
          ok: false,
          error: 'User profile not found. Please ensure your X account is connected.',
        });
      } else {
        profile = userProfile;
        
        // SuperAdmin: If profile exists but no twitter_username, use a default
        if (!profile.twitter_username && isSuperAdmin) {
          profile.twitter_username = `admin_${userId.substring(0, 8)}`;
          console.log('[API /portal/arc/join-campaign] SuperAdmin: Using default twitter_username:', profile.twitter_username);
        }
      }
    }

    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: 'User profile not found. Please ensure your X account is connected.',
      });
    }

    // Non-SuperAdmin users must have twitter_username
    if (!profile.twitter_username) {
      return res.status(400).json({
        ok: false,
        error: 'Twitter username not found. Please connect your X account.',
      });
    }

    const { projectId } = req.body as JoinCampaignBody;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'projectId is required',
      });
    }

    // Find active arena for this project
    const { data: activeArena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, name, slug')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (arenaError || !activeArena) {
      return res.status(404).json({
        ok: false,
        error: 'No active arena found for this project',
      });
    }

    // Check if user is already in this arena
    const { data: existingCreator, error: checkError } = await supabase
      .from('arena_creators')
      .select('id')
      .eq('arena_id', activeArena.id)
      .ilike('twitter_username', profile.twitter_username)
      .single();

    if (existingCreator) {
      return res.status(200).json({
        ok: true,
        message: 'Already joined this campaign',
        arenaId: activeArena.id,
        creatorId: existingCreator.id,
      });
    }

    // Create arena_creators entry
    const { data: newCreator, error: createError } = await supabase
      .from('arena_creators')
      .insert({
        arena_id: activeArena.id,
        profile_id: profile.id,
        twitter_username: profile.twitter_username,
        arc_points: 0,
        ring: 'discovery',
        style: null,
        meta: {},
      })
      .select()
      .single();

    if (createError) {
      console.error('[API /portal/arc/join-campaign] Error creating creator:', createError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to join campaign',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Successfully joined campaign',
      arenaId: activeArena.id,
      creatorId: newCreator.id,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/join-campaign] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
