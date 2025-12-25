/**
 * API Route: GET /api/portal/admin/arc/dashboard-stats
 * 
 * Returns dashboard statistics for ARC Super Admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

