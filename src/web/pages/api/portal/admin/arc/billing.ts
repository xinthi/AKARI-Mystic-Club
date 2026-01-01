/**
 * API Route: GET /api/portal/admin/arc/billing
 * 
 * Lists ARC billing records with filters (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

// =============================================================================
// TYPES
// =============================================================================

interface BillingRecord {
  id: string;
  request_id: string;
  project_id: string;
  access_level: 'creator_manager' | 'leaderboard' | 'gamified';
  base_price_usd: number;
  discount_percent: number;
  final_price_usd: number;
  currency: string;
  payment_status: 'pending' | 'paid' | 'waived' | 'refunded';
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

interface BillingSummary {
  gross: number;
  net: number;
  discountsTotal: number;
  byAccessLevel: {
    creator_manager: { count: number; gross: number; net: number };
    leaderboard: { count: number; gross: number; net: number };
    gamified: { count: number; gross: number; net: number };
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate summary from billing records
 */
function calculateSummary(records: BillingRecord[]): BillingSummary {
  const summary: BillingSummary = {
    gross: 0,
    net: 0,
    discountsTotal: 0,
    byAccessLevel: {
      creator_manager: { count: 0, gross: 0, net: 0 },
      leaderboard: { count: 0, gross: 0, net: 0 },
      gamified: { count: 0, gross: 0, net: 0 },
    },
  };

  for (const record of records) {
    summary.gross += record.base_price_usd;
    summary.net += record.final_price_usd;
    summary.discountsTotal += record.base_price_usd - record.final_price_usd;

    const level = record.access_level;
    if (level in summary.byAccessLevel) {
      summary.byAccessLevel[level].count += 1;
      summary.byAccessLevel[level].gross += record.base_price_usd;
      summary.byAccessLevel[level].net += record.final_price_usd;
    }
  }

  return summary;
}

// =============================================================================
// API HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // SuperAdmin only
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    const supabase = getSupabaseAdmin();

    // Parse query parameters
    const {
      from,
      to,
      accessLevel,
      paymentStatus,
      projectId,
      limit = '200',
    } = req.query;

    // Build query
    let query = supabase
      .from('arc_billing_records')
      .select(
        `
        *,
        projects:project_id (
          id,
          name,
          slug
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Date range filter (default: last 30 days)
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = from && typeof from === 'string' ? new Date(from) : defaultFrom;
    const toDate = to && typeof to === 'string' ? new Date(to) : now;

    query = query.gte('created_at', fromDate.toISOString());
    query = query.lte('created_at', toDate.toISOString());

    // Access level filter
    if (accessLevel && typeof accessLevel === 'string') {
      const levels = accessLevel.split(',').filter((l) =>
        ['creator_manager', 'leaderboard', 'gamified'].includes(l.trim())
      );
      if (levels.length > 0) {
        query = query.in('access_level', levels);
      }
    }

    // Payment status filter
    if (paymentStatus && typeof paymentStatus === 'string') {
      const statuses = paymentStatus.split(',').filter((s) =>
        ['pending', 'paid', 'waived', 'refunded'].includes(s.trim())
      );
      if (statuses.length > 0) {
        query = query.in('payment_status', statuses);
      }
    }

    // Project filter
    if (projectId && typeof projectId === 'string') {
      query = query.eq('project_id', projectId);
    }

    // Limit
    const limitNum = parseInt(limit as string, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      query = query.limit(limitNum);
    }

    // Execute query
    const { data, error } = await query;

    if (error) {
      console.error('[Billing API] Error fetching billing records:', error);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch billing records',
      });
    }

    // Transform data
    const records: BillingRecord[] = (data || []).map((row: any) => {
      const project = row.projects
        ? {
            id: row.projects.id,
            name: row.projects.name,
            slug: row.projects.slug,
          }
        : null;

      return {
        id: row.id,
        request_id: row.request_id,
        project_id: row.project_id,
        access_level: row.access_level,
        base_price_usd: parseFloat(row.base_price_usd) || 0,
        discount_percent: parseInt(row.discount_percent, 10) || 0,
        final_price_usd: parseFloat(row.final_price_usd) || 0,
        currency: row.currency || 'USD',
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        payment_reference: row.payment_reference,
        paid_at: row.paid_at,
        notes: row.notes,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        project: project,
      };
    });

    // Calculate summary
    const summary = calculateSummary(records);

    return res.status(200).json({
      ok: true,
      rows: records,
      summary,
    });
  } catch (err: any) {
    console.error('[Billing API] Unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
