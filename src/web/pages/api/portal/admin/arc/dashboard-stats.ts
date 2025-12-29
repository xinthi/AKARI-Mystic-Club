/**
 * API Route: GET /api/portal/admin/arc/dashboard-stats
 * 
 * Returns dashboard statistics for ARC Super Admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  pendingRequests: number;
  approvedRequests: number;
  totalRevenue: number;
  monthlyRevenue: number;
  activeArenas: number;
  activeCampaigns: number;
  // Breakdown by type
  activeLeaderboards: number; // Option 2: Normal Leaderboard
  activeCRM: number; // Option 1: Creator Manager/CRM
  activeGamified: number; // Option 3: Gamified Leaderboard
}

type DashboardStatsResponse =
  | { ok: true; stats: DashboardStats }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardStatsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get session token
    const sessionToken = req.headers.cookie?.split(';').find(c => c.trim().startsWith('akari_session='))?.split('=')[1];
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Check super admin
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (!userRoles || userRoles.length === 0) {
      // Also check profiles.real_roles
      const { data: xIdentity } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', userId)
        .eq('provider', 'x')
        .single();

      if (xIdentity?.username) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('real_roles')
          .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
          .single();

        if (!profile?.real_roles?.includes('super_admin')) {
          return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
        }
      } else {
        return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
      }
    }

    // Get total projects with ARC enabled (using new access gate system)
    // Count projects that have: arc_project_access.application_status = 'approved' AND at least one option unlocked
    const { data: approvedAccess } = await supabase
      .from('arc_project_access')
      .select('project_id')
      .eq('application_status', 'approved');
    
    const approvedProjectIds = new Set((approvedAccess || []).map((a: any) => a.project_id));
    
    // Get projects with at least one option unlocked
    const { data: featuresData } = await supabase
      .from('arc_project_features')
      .select('project_id, option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
      .in('project_id', Array.from(approvedProjectIds));
    
    const projectsWithUnlockedOptions = new Set<string>();
    if (featuresData) {
      for (const feature of featuresData) {
        if (feature.option1_crm_unlocked || feature.option2_normal_unlocked || feature.option3_gamified_unlocked) {
          projectsWithUnlockedOptions.add(feature.project_id);
        }
      }
    }
    
    // Also check legacy projects (arc_active=true and arc_access_level != 'none')
    const { data: legacyProjects } = await supabase
      .from('projects')
      .select('id, arc_active, arc_access_level')
      .eq('arc_active', true)
      .neq('arc_access_level', 'none');
    
    if (legacyProjects) {
      for (const project of legacyProjects) {
        // Only count if also approved (or in dev mode)
        if (approvedProjectIds.has(project.id) || process.env.NODE_ENV === 'development') {
          projectsWithUnlockedOptions.add(project.id);
        }
      }
    }
    
    const totalProjects = projectsWithUnlockedOptions.size;
    
    // Get active projects (same logic, but also check if they have active arenas/campaigns)
    // For now, use same count (active = has access + unlocked)
    const activeProjects = totalProjects;

    // Get pending requests
    const { count: pendingRequests } = await supabase
      .from('arc_leaderboard_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Get approved requests
    const { count: approvedRequests } = await supabase
      .from('arc_leaderboard_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    // Get total revenue from billing records
    const { data: billingRecords } = await supabase
      .from('arc_billing_records')
      .select('final_price_usd, created_at, payment_status')
      .eq('payment_status', 'paid');

    const totalRevenue = billingRecords?.reduce((sum, record) => sum + Number(record.final_price_usd || 0), 0) || 0;

    // Get monthly revenue (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyBilling = billingRecords?.filter(
      (record) => new Date(record.created_at) >= startOfMonth
    ) || [];
    const monthlyRevenue = monthlyBilling.reduce((sum, record) => sum + Number(record.final_price_usd || 0), 0);

    // Get active arenas (matching logic from getArcLiveItems)
    // Only count arenas that are: status='active' or 'scheduled' (not 'paused'), within date range, AND have proper ARC access
    const { data: activeArenasData } = await supabase
      .from('arenas')
      .select('id, status, starts_at, ends_at, project_id')
      .in('status', ['active', 'scheduled']);
    
    // Cache project features to avoid repeated queries
    const projectFeaturesCache = new Map<string, { option1?: boolean; option2?: boolean; option3?: boolean }>();
    
    // Helper to check if arena is live (within date range)
    const isArenaLive = (arena: { starts_at: string | null; ends_at: string | null }): boolean => {
      if (!arena.starts_at) {
        if (arena.ends_at && new Date(arena.ends_at) < now) {
          return false; // Ended
        }
        return true;
      }
      const startDate = new Date(arena.starts_at);
      if (startDate > now) {
        return false; // Upcoming
      }
      if (arena.ends_at) {
        const endDate = new Date(arena.ends_at);
        if (endDate < now) {
          return false; // Ended
        }
      }
      return true; // Live
    };
    
    // Process arenas once and categorize by type
    let activeArenas = 0;
    let activeLeaderboards = 0;
    let activeGamified = 0;
    
    if (activeArenasData) {
      for (const arena of activeArenasData) {
        if (!isArenaLive(arena)) {
          continue;
        }
        
        // Get or cache project features
        let features = projectFeaturesCache.get(arena.project_id);
        if (!features) {
          const { data: featuresData } = await supabase
            .from('arc_project_features')
            .select('option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
            .eq('project_id', arena.project_id)
            .maybeSingle();
          
          features = {
            option1: featuresData?.option1_crm_unlocked || false,
            option2: featuresData?.option2_normal_unlocked || false,
            option3: featuresData?.option3_gamified_unlocked || false,
          };
          projectFeaturesCache.set(arena.project_id, features);
        }
        
        // Check access for Option 2 (Leaderboard) or Option 3 (Gamified)
        if (features.option2 && !features.option3) {
          // Normal Leaderboard (Option 2 only)
          const accessCheck = await requireArcAccess(supabase, arena.project_id, 2);
          if (accessCheck.ok) {
            activeArenas++;
            activeLeaderboards++;
          }
        } else if (features.option3) {
          // Gamified Leaderboard (Option 3)
          const accessCheck = await requireArcAccess(supabase, arena.project_id, 3);
          if (accessCheck.ok) {
            activeArenas++;
            activeGamified++;
          }
        } else {
          // Check Option 2 as fallback (for legacy or mixed cases)
          const accessCheck = await requireArcAccess(supabase, arena.project_id, 2);
          if (accessCheck.ok) {
            activeArenas++;
          }
        }
      }
    }

    // Count active CRM campaigns (Option 1: Creator Manager)
    // These are arc_campaigns with status='live' or 'paused' and have option1_crm_unlocked
    const { data: campaignsData } = await supabase
      .from('arc_campaigns')
      .select('id, project_id, status')
      .in('status', ['live', 'paused']);
    
    let activeCRM = 0;
    let activeCampaigns = 0;
    
    if (campaignsData) {
      for (const campaign of campaignsData) {
        activeCampaigns++;
        const accessCheck = await requireArcAccess(supabase, campaign.project_id, 1);
        if (accessCheck.ok) {
          activeCRM++;
        }
      }
    }

    const stats: DashboardStats = {
      totalProjects: totalProjects || 0,
      activeProjects: activeProjects || 0,
      pendingRequests: pendingRequests || 0,
      approvedRequests: approvedRequests || 0,
      totalRevenue,
      monthlyRevenue,
      activeArenas: activeArenas || 0,
      activeCampaigns: activeCampaigns || 0,
      activeLeaderboards,
      activeCRM,
      activeGamified,
    };

    return res.status(200).json({ ok: true, stats });
  } catch (error: any) {
    console.error('[Dashboard Stats API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

