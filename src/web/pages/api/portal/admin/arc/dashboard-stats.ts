/**
 * API Route: GET /api/portal/admin/arc/dashboard-stats
 * 
 * Returns dashboard statistics for ARC Super Admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server-auth';

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
    // Check super admin access
    const superAdminCheck = await requireSuperAdmin(req, res);
    if (!superAdminCheck.ok) {
      return; // requireSuperAdmin already sent response
    }

    const supabase = getSupabaseAdmin();

    // Get total projects with ARC enabled
    const { count: totalProjects } = await supabase
      .from('project_arc_settings')
      .select('*', { count: 'exact', head: true })
      .eq('is_arc_enabled', true);

    // Get active projects
    const { count: activeProjects } = await supabase
      .from('project_arc_settings')
      .select('*', { count: 'exact', head: true })
      .eq('is_arc_enabled', true)
      .eq('status', 'active');

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

    // Get active arenas
    const { count: activeArenas } = await supabase
      .from('arenas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Get active campaigns
    const { count: activeCampaigns } = await supabase
      .from('arc_campaigns')
      .select('*', { count: 'exact', head: true })
      .in('status', ['live', 'paused']);

    const stats: DashboardStats = {
      totalProjects: totalProjects || 0,
      activeProjects: activeProjects || 0,
      pendingRequests: pendingRequests || 0,
      approvedRequests: approvedRequests || 0,
      totalRevenue,
      monthlyRevenue,
      activeArenas: activeArenas || 0,
      activeCampaigns: activeCampaigns || 0,
    };

    return res.status(200).json({ ok: true, stats });
  } catch (error: any) {
    console.error('[Dashboard Stats API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

