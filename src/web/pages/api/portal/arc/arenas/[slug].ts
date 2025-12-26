/**
 * API Route: GET /api/portal/arc/arenas/[slug]
 * 
 * Returns detailed arena data including:
 * - Arena info (id, slug, name, description, status, starts_at, ends_at, reward_depth, settings)
 * - Project info (id, name, twitter_username, avatar_url)
 * - Creators list ordered by arc_points DESC
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient, createServiceClient } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface ArenaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string;
  avatar_url: string | null;
  header_image_url: string | null;
  arc_access_level: string | null;
}

interface Creator {
  id: string;
  twitter_username: string;
  arc_points: number; // base_arc_points (from arena_creators.arc_points)
  adjusted_points: number; // effective_points = base_arc_points + adjustments_sum
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
  profile_id: string | null;
  joined_at: string | null;
}

type ArenaDetailResponse =
  | {
      ok: true;
      arena: ArenaDetail;
      project: ProjectInfo;
      creators: Creator[];
      sentiment: {
        enabled: boolean;
        summary: null;
        series: any[];
      };
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ArenaDetailResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Arena slug is required',
    });
  }

  try {
    // Create Supabase client (read-only with anon key)
    const supabase = createPortalClient();

    // Debug: Log environment configuration (masked for security)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const maskedUrl = supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING';
    const maskedKey = supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'MISSING';
    
    console.log('[API /portal/arc/arenas/[slug]] Environment check:', {
      supabaseUrl: maskedUrl,
      supabaseAnonKey: maskedKey,
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseAnonKey: !!supabaseAnonKey,
      envKeys: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    });

    // Normalize slug (lowercase, trim) for query
    const normalizedSlug = slug.trim().toLowerCase();
    console.log('[API /portal/arc/arenas/[slug]] Query params:', {
      rawSlug: slug,
      normalizedSlug,
      slugType: typeof slug,
      slugLength: slug.length,
    });

    // STEP 1: Fetch arena by slug (without join to avoid .single() issues)
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, slug, name, description, status, starts_at, ends_at, reward_depth, settings, project_id')
      .ilike('slug', normalizedSlug) // Use case-insensitive match
      .single();

    // Debug: Log full query result
    console.log('[API /portal/arc/arenas/[slug]] Arena query result:', {
      hasData: !!arenaData,
      dataId: arenaData?.id,
      dataSlug: arenaData?.slug,
      dataProjectId: arenaData?.project_id,
      hasError: !!arenaError,
      errorCode: arenaError?.code,
      errorMessage: arenaError?.message,
      errorDetails: arenaError ? JSON.stringify(arenaError, null, 2) : null,
    });

    if (arenaError) {
      // Check if it's a "not found" error (PGRST116 is the code for no rows)
      if (arenaError.code === 'PGRST116' || arenaError.message?.includes('No rows')) {
        console.error(`[API /portal/arc/arenas/[slug]] Arena not found with slug: "${normalizedSlug}"`, arenaError);
        console.error(`[API /portal/arc/arenas/[slug]] Full error object:`, JSON.stringify(arenaError, null, 2));
        return res.status(404).json({
          ok: false,
          error: 'Arena not found',
        });
      }

      // Other errors: return 500 with full error in development
      console.error('[API /portal/arc/arenas/[slug]] Supabase error fetching arena:', arenaError);
      console.error('[API /portal/arc/arenas/[slug]] Full error object:', JSON.stringify(arenaError, null, 2));
      const errorMessage = arenaError.message || 'Failed to fetch arena';
      const errorCode = arenaError.code || 'unknown';
      return res.status(500).json({
        ok: false,
        error: process.env.NODE_ENV === 'development' 
          ? `${errorMessage} (code: ${errorCode})` 
          : 'Failed to fetch arena',
      });
    }

    if (!arenaData || !arenaData.project_id) {
      console.error('[API /portal/arc/arenas/[slug]] Arena data missing or project_id missing:', {
        hasArenaData: !!arenaData,
        projectId: arenaData?.project_id,
      });
      return res.status(404).json({
        ok: false,
        error: 'Arena not found',
      });
    }

    // Check ARC access (Option 2 = Leaderboard)
    const supabaseAdmin = getSupabaseAdmin();
    const accessCheck = await requireArcAccess(supabaseAdmin, arenaData.project_id, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error,
      });
    }

    // STEP 2: Fetch project separately (split query to avoid join issues)
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, name, x_handle, avatar_url, header_image_url, arc_access_level')
      .eq('id', arenaData.project_id)
      .single();

    // Debug: Log project query result
    console.log('[API /portal/arc/arenas/[slug]] Project query result:', {
      projectId: arenaData.project_id,
      hasData: !!projectData,
      dataId: projectData?.id,
      dataName: projectData?.name,
      hasError: !!projectError,
      errorCode: projectError?.code,
      errorMessage: projectError?.message,
      errorDetails: projectError ? JSON.stringify(projectError, null, 2) : null,
    });

    if (projectError || !projectData) {
      console.error('[API /portal/arc/arenas/[slug]] Project not found for arena:', {
        projectId: arenaData.project_id,
        error: projectError,
      });
      return res.status(500).json({
        ok: false,
        error: process.env.NODE_ENV === 'development'
          ? `Failed to fetch project: ${projectError?.message || 'Project not found'}`
          : 'Failed to fetch arena project',
      });
    }

    const project = projectData;

    // Query arena_creators for this arena
    // Note: arena_creators has created_at, not joined_at - we'll map it in the response
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select('id, twitter_username, arc_points, ring, style, meta, profile_id, created_at')
      .eq('arena_id', arenaData.id);

    // Get profile_ids for creators (filter out nulls)
    const creatorProfileIds = (creatorsData || [])
      .map((c: any) => c.profile_id)
      .filter((id: any) => id !== null && id !== undefined);

    if (creatorsError) {
      const errorMessage = creatorsError.message || 'Failed to fetch arena creators';
      console.error('[API /portal/arc/arenas/[slug]] Supabase error fetching creators:', creatorsError);
      console.error('[API /portal/arc/arenas/[slug]] Error details:', JSON.stringify(creatorsError, null, 2));
      console.error('[API /portal/arc/arenas/[slug]] Error code:', creatorsError.code);
      return res.status(500).json({
        ok: false,
        error: process.env.NODE_ENV === 'development' 
          ? `${errorMessage} (code: ${creatorsError.code || 'unknown'})` 
          : 'Failed to fetch arena creators',
      });
    }

    // Fetch point adjustments for all creators in this arena
    // Use service-role client to bypass RLS (anon key may not have read access to arc_point_adjustments)
    // Join keys: arena_creators.profile_id = arc_point_adjustments.creator_profile_id
    //            arena_creators.arena_id = arc_point_adjustments.arena_id
    let adjustmentsMap: Record<string, number> = {};

    if (creatorProfileIds.length > 0) {
      try {
        // Create service-role client for reading adjustments (bypasses RLS)
        const serviceClient = createServiceClient();
        
        const { data: adjustmentsData, error: adjustmentsError } = await serviceClient
          .from('arc_point_adjustments')
          .select('creator_profile_id, points_delta, arena_id')
          .eq('arena_id', arenaData.id)
          .in('creator_profile_id', creatorProfileIds);

        if (adjustmentsError) {
          // Log full error in development
          if (process.env.NODE_ENV === 'development') {
            console.error('[API /portal/arc/arenas/[slug]] Error fetching adjustments:', adjustmentsError);
            console.error('[API /portal/arc/arenas/[slug]] Full error object:', JSON.stringify(adjustmentsError, null, 2));
          } else {
            console.error('[API /portal/arc/arenas/[slug]] Error fetching adjustments:', adjustmentsError.message);
          }
        }

        if (adjustmentsData && adjustmentsData.length > 0) {
          // Sum adjustments per creator (matching by creator_profile_id and arena_id)
          for (const adj of adjustmentsData) {
            const creatorId = adj.creator_profile_id;
            // Double-check arena_id matches (should already be filtered, but verify)
            if (adj.arena_id === arenaData.id) {
              const delta = Number(adj.points_delta) || 0;
              adjustmentsMap[creatorId] = (adjustmentsMap[creatorId] || 0) + delta;
            }
          }
          // Debug: log adjustments found
          console.log(`[API /portal/arc/arenas/[slug]] Found ${adjustmentsData.length} adjustments for arena ${arenaData.id}`, adjustmentsMap);
        } else {
          console.log(`[API /portal/arc/arenas/[slug]] No adjustments found for arena ${arenaData.id} (checked ${creatorProfileIds.length} creators)`);
        }
      } catch (serviceClientError: any) {
        // If service client creation fails, log and continue without adjustments
        if (process.env.NODE_ENV === 'development') {
          console.error('[API /portal/arc/arenas/[slug]] Failed to create service client for adjustments:', serviceClientError);
          console.error('[API /portal/arc/arenas/[slug]] Error details:', JSON.stringify(serviceClientError, null, 2));
        } else {
          console.error('[API /portal/arc/arenas/[slug]] Failed to fetch adjustments:', serviceClientError.message);
        }
        // Continue without adjustments (base points only)
      }
    }

    // Fetch profile images for creators
    const profileImageMap = new Map<string, string | null>();
    if (creatorProfileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, profile_image_url')
        .in('id', creatorProfileIds);

      if (profiles) {
        for (const profile of profiles) {
          profileImageMap.set(profile.id, profile.profile_image_url || null);
        }
      }
    }

    // Also fetch by username for creators without profile_id
    const usernamesWithoutProfile = (creatorsData || [])
      .filter((c: any) => !c.profile_id && c.twitter_username)
      .map((c: any) => c.twitter_username.replace(/^@+/, '').toLowerCase());
    
    if (usernamesWithoutProfile.length > 0) {
      const { data: profilesByUsername } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', usernamesWithoutProfile);

      if (profilesByUsername) {
        for (const profile of profilesByUsername) {
          const normalizedUsername = profile.username.toLowerCase().replace(/^@+/, '');
          profileImageMap.set(normalizedUsername, profile.profile_image_url || null);
        }
      }
    }

    // Build response with effective points calculation
    // base_points = arena_creators.arc_points (base value, not updated by adjustments)
    // adjustments_sum = SUM(arc_point_adjustments.points_delta) for that arena_id + creator_profile_id
    // effective_points = base_points + COALESCE(adjustments_sum, 0)
    const creatorsWithAdjustments = (creatorsData || []).map((creator: any) => {
      const basePoints = Number(creator.arc_points) || 0;
      // adjustments_sum = SUM(arc_point_adjustments.points_delta) for same arena_id + creator_profile_id
      // Join keys: arena_creators.profile_id = arc_point_adjustments.creator_profile_id
      const adjustmentsSum = creator.profile_id ? (adjustmentsMap[creator.profile_id] || 0) : 0;
      // effective_points = base_points + COALESCE(adjustments_sum, 0)
      const effectivePoints = basePoints + adjustmentsSum;

      // Get avatar URL
      let avatarUrl: string | null = null;
      if (creator.profile_id) {
        avatarUrl = profileImageMap.get(creator.profile_id) || null;
      }
      if (!avatarUrl && creator.twitter_username) {
        const normalizedUsername = creator.twitter_username.replace(/^@+/, '').toLowerCase();
        avatarUrl = profileImageMap.get(normalizedUsername) || null;
      }

      // Debug logging for all creators to verify calculation
      console.log(`[API /portal/arc/arenas/[slug]] Creator ${creator.profile_id || 'no-profile'}: base=${basePoints}, adjustments_sum=${adjustmentsSum}, effective=${effectivePoints}`);

      return {
        id: creator.id,
        twitter_username: creator.twitter_username,
        arc_points: basePoints, // base_points (from arena_creators.arc_points)
        adjusted_points: effectivePoints, // effective_points = base_points + adjustments_sum
        ring: creator.ring,
        style: creator.style,
        meta: creator.meta || {},
        profile_id: creator.profile_id || null,
        joined_at: creator.created_at || null, // Map created_at to joined_at for frontend compatibility
        avatar_url: avatarUrl,
      };
    });

    // Sort by effective_points (adjusted_points) DESC for "Top points"
    creatorsWithAdjustments.sort((a, b) => b.adjusted_points - a.adjusted_points);

    const response: ArenaDetailResponse = {
      ok: true,
      arena: {
        id: arenaData.id,
        slug: arenaData.slug,
        name: arenaData.name,
        description: arenaData.description,
        status: arenaData.status,
        starts_at: arenaData.starts_at,
        ends_at: arenaData.ends_at,
        reward_depth: arenaData.reward_depth,
        settings: arenaData.settings || {},
      },
      project: {
        id: project.id,
        name: project.name,
        twitter_username: project.x_handle || '',
        avatar_url: project.avatar_url || null,
        header_image_url: project.header_image_url || null,
        arc_access_level: project.arc_access_level || null,
      },
      creators: creatorsWithAdjustments,
      sentiment: {
        enabled: true,
        summary: null,
        series: [],
      },
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[API /portal/arc/arenas/[slug]] Error:', error);

    // Check for specific Supabase errors
    if (error.message?.includes('configuration missing')) {
      return res.status(503).json({
        ok: false,
        error: 'ARC service is not configured',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch arena details',
    });
  }
}
