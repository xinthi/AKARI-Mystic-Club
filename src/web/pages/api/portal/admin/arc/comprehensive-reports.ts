/**
 * API Route: GET /api/portal/admin/arc/comprehensive-reports
 * 
 * Comprehensive platform reports for super admins only.
 * Includes financial metrics, user activity, participation stats, etc.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface ComprehensiveReport {
  // Financial metrics
  financial: {
    totalRevenue: number;
    monthlyRevenue: number;
    totalBillingRecords: number;
    averageRevenuePerProject: number;
    revenueByAccessLevel: {
      leaderboard: number;
      gamified: number;
      creator_manager: number;
    };
  };
  // Platform metrics
  platform: {
    totalProjects: number;
    activeProjects: number;
    projectsRunningCampaigns: number;
    totalTrackedProfiles: number;
    activeUsers: number;
  };
  // User activity
  userActivity: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalArenas: number;
    activeArenas: number;
    totalCreatorManagerPrograms: number;
    activeCreatorManagerPrograms: number;
    totalParticipants: number;
    activeParticipants: number;
  };
  // Participation stats
  participation: {
    totalPosts: number;
    totalEngagements: number;
    averageParticipationPerCampaign: number;
    topParticipatingProjects: Array<{
      projectId: string;
      projectName: string;
      participantCount: number;
      engagementCount: number;
    }>;
  };
}

type ComprehensiveReportResponse =
  | { ok: true; report: ComprehensiveReport }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const sessionCookie = cookies.find(c => c.startsWith('akari_session='));
  return sessionCookie?.split('=')[1] || null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ComprehensiveReportResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check super admin - comprehensive reports are super admin only
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const supabase = getSupabaseAdmin();

    // Financial metrics
    const { data: billingRecords } = await supabase
      .from('arc_billing_records')
      .select('final_price_usd, created_at, payment_status, access_level')
      .eq('payment_status', 'paid');

    const totalRevenue = billingRecords?.reduce((sum, record) => sum + Number(record.final_price_usd || 0), 0) || 0;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyBilling = billingRecords?.filter(
      (record) => new Date(record.created_at) >= startOfMonth
    ) || [];
    const monthlyRevenue = monthlyBilling.reduce((sum, record) => sum + Number(record.final_price_usd || 0), 0);

    const revenueByAccessLevel = {
      leaderboard: billingRecords?.filter(r => r.access_level === 'leaderboard').reduce((sum, r) => sum + Number(r.final_price_usd || 0), 0) || 0,
      gamified: billingRecords?.filter(r => r.access_level === 'gamified').reduce((sum, r) => sum + Number(r.final_price_usd || 0), 0) || 0,
      creator_manager: billingRecords?.filter(r => r.access_level === 'creator_manager').reduce((sum, r) => sum + Number(r.final_price_usd || 0), 0) || 0,
    };

    // Get approved projects
    const { data: approvedAccess } = await supabase
      .from('arc_project_access')
      .select('project_id')
      .eq('application_status', 'approved');

    const approvedProjectIds = new Set((approvedAccess || []).map((a: any) => a.project_id));

    const { data: legacyProjects } = await supabase
      .from('projects')
      .select('id, arc_active, arc_access_level')
      .eq('arc_active', true)
      .neq('arc_access_level', 'none');

    if (legacyProjects) {
      for (const project of legacyProjects) {
        if (approvedProjectIds.has(project.id) || process.env.NODE_ENV === 'development') {
          approvedProjectIds.add(project.id);
        }
      }
    }

    const totalProjects = approvedProjectIds.size;
    const activeProjects = totalProjects; // Simplified for now

    // Count projects with active campaigns/arenas
    const { data: activeCampaignsData } = await supabase
      .from('arc_campaigns')
      .select('project_id')
      .eq('status', 'live')
      .in('project_id', Array.from(approvedProjectIds));

    const projectsWithCampaigns = new Set((activeCampaignsData || []).map((c: any) => c.project_id));

    // Platform metrics
    // Count total tracked profiles (includes users, projects, and other tracked accounts)
    const { count: totalTrackedProfilesCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsersCount } = await supabase
      .from('arena_creators')
      .select('profile_id', { count: 'exact', head: true });

    // User activity
    const { count: totalCampaigns } = await supabase
      .from('arc_campaigns')
      .select('*', { count: 'exact', head: true });

    const { count: activeCampaigns } = await supabase
      .from('arc_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'live');

    const { count: totalArenas } = await supabase
      .from('arenas')
      .select('*', { count: 'exact', head: true });

    const { count: activeArenas } = await supabase
      .from('arenas')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'scheduled']);

    const { count: totalCreatorManagerPrograms } = await supabase
      .from('creator_manager_programs')
      .select('*', { count: 'exact', head: true });

    const { count: activeCreatorManagerPrograms } = await supabase
      .from('creator_manager_programs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: totalParticipants } = await supabase
      .from('arena_creators')
      .select('profile_id', { count: 'exact', head: true });

    // Participation stats (simplified - would need aggregation from user_ct_activity in full implementation)
    const totalPosts = 0; // Placeholder
    const totalEngagements = 0; // Placeholder
    const averageParticipationPerCampaign = activeCampaigns && activeCampaigns > 0 ? (totalParticipants || 0) / activeCampaigns : 0;

    // Top participating projects (simplified)
    const topParticipatingProjects: ComprehensiveReport['participation']['topParticipatingProjects'] = [];

    const report: ComprehensiveReport = {
      financial: {
        totalRevenue,
        monthlyRevenue,
        totalBillingRecords: billingRecords?.length || 0,
        averageRevenuePerProject: totalProjects > 0 ? totalRevenue / totalProjects : 0,
        revenueByAccessLevel,
      },
      platform: {
        totalProjects,
        activeProjects,
        projectsRunningCampaigns: projectsWithCampaigns.size,
        totalTrackedProfiles: totalTrackedProfilesCount || 0,
        activeUsers: activeUsersCount || 0,
      },
      userActivity: {
        totalCampaigns: totalCampaigns || 0,
        activeCampaigns: activeCampaigns || 0,
        totalArenas: totalArenas || 0,
        activeArenas: activeArenas || 0,
        totalCreatorManagerPrograms: totalCreatorManagerPrograms || 0,
        activeCreatorManagerPrograms: activeCreatorManagerPrograms || 0,
        totalParticipants: totalParticipants || 0,
        activeParticipants: totalParticipants || 0, // Simplified
      },
      participation: {
        totalPosts,
        totalEngagements,
        averageParticipationPerCampaign,
        topParticipatingProjects,
      },
    };

    return res.status(200).json({ ok: true, report });
  } catch (error: any) {
    console.error('[Comprehensive Reports API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

