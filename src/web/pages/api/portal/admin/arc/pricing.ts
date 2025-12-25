/**
 * API Route: GET /api/portal/admin/arc/pricing
 * API Route: PATCH /api/portal/admin/arc/pricing
 * 
 * Get or update ARC pricing configuration
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface PricingConfig {
  access_level: 'creator_manager' | 'leaderboard' | 'gamified';
  base_price_usd: number;
  currency: string;
  description: string | null;
  is_active: boolean;
}

type PricingResponse =
  | { ok: true; pricing: PricingConfig[] }
  | { ok: false; error: string };

type UpdatePricingResponse =
  | { ok: true; pricing: PricingConfig }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PricingResponse | UpdatePricingResponse>
) {
  try {
    // Check super admin access
    const superAdminCheck = await requireSuperAdmin(req, res);
    if (!superAdminCheck.ok) {
      return; // requireSuperAdmin already sent response
    }

    const supabase = getSupabaseAdmin();

    // Get current user profile for updated_by
    const sessionToken = req.headers.cookie?.split(';').find(c => c.trim().startsWith('akari_session='))?.split('=')[1];
    let currentProfileId: string | null = null;

    if (sessionToken) {
      const { data: session } = await supabase
        .from('akari_user_sessions')
        .select('user_id')
        .eq('session_token', sessionToken)
        .single();

      if (session?.user_id) {
        const { data: identity } = await supabase
          .from('akari_user_identities')
          .select('username')
          .eq('user_id', session.user_id)
          .eq('provider', 'x')
          .single();

        if (identity?.username) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', identity.username.toLowerCase().replace('@', ''))
            .single();

          if (profile) {
            currentProfileId = profile.id;
          }
        }
      }
    }

    if (req.method === 'GET') {
      // Get all pricing configurations
      const { data: pricing, error } = await supabase
        .from('arc_pricing')
        .select('*')
        .order('access_level');

      if (error) {
        console.error('[Pricing API] Error fetching pricing:', error);
        return res.status(500).json({ ok: false, error: 'Failed to fetch pricing' });
      }

      const formattedPricing: PricingConfig[] = (pricing || []).map((p: any) => ({
        access_level: p.access_level,
        base_price_usd: Number(p.base_price_usd || 0),
        currency: p.currency || 'USD',
        description: p.description,
        is_active: p.is_active !== false,
      }));

      return res.status(200).json({ ok: true, pricing: formattedPricing });
    } else if (req.method === 'PATCH') {
      // Update pricing
      const { access_level, base_price_usd } = req.body;

      if (!access_level || typeof base_price_usd !== 'number' || base_price_usd < 0) {
        return res.status(400).json({
          ok: false,
          error: 'access_level and base_price_usd (non-negative number) are required',
        });
      }

      if (!['creator_manager', 'leaderboard', 'gamified'].includes(access_level)) {
        return res.status(400).json({
          ok: false,
          error: 'access_level must be creator_manager, leaderboard, or gamified',
        });
      }

      const updateData: any = {
        base_price_usd: base_price_usd,
        updated_at: new Date().toISOString(),
      };

      if (currentProfileId) {
        updateData.updated_by = currentProfileId;
      }

      const { data: updated, error: updateError } = await supabase
        .from('arc_pricing')
        .update(updateData)
        .eq('access_level', access_level)
        .select()
        .single();

      if (updateError) {
        console.error('[Pricing API] Error updating pricing:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update pricing' });
      }

      const formattedPricing: PricingConfig = {
        access_level: updated.access_level,
        base_price_usd: Number(updated.base_price_usd || 0),
        currency: updated.currency || 'USD',
        description: updated.description,
        is_active: updated.is_active !== false,
      };

      return res.status(200).json({ ok: true, pricing: formattedPricing });
    } else {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[Pricing API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

