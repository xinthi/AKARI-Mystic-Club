/**
 * API Route: GET /api/portal/deep/[slug]/inner-circle-export
 * 
 * Exports inner circle data as CSV for Deep Explorer users.
 * Requires canUseDeepExplorer permission.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  createPortalClient,
  getProjectBySlug,
  getProjectInfluencers,
} from '@/lib/portal/supabase';
import { canUseDeepExplorer } from '@/lib/permissions';

// Get Supabase admin client for auth
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Parse session cookie
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

// Get user from session
async function getUserFromSession(req: NextApiRequest) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      return null;
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('akari_users')
      .select('id, display_name, avatar_url, is_active')
      .eq('id', session.user_id)
      .single();

    if (userError || !user || !user.is_active) {
      return null;
    }

    // Get user roles
    const { data: roles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('id, feature_key, starts_at, ends_at')
      .eq('user_id', user.id);

    return {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      roles: roles?.map(r => r.role) || ['user'],
      featureGrants: (grants || []).map((g: any) => ({
        id: g.id,
        featureKey: g.feature_key,
        startsAt: g.starts_at ? new Date(g.starts_at) : null,
        endsAt: g.ends_at ? new Date(g.ends_at) : null,
      })),
    };
  } catch (error) {
    console.error('[Inner Circle Export] Error getting user:', error);
    return null;
  }
}

// Compute power metric (same as frontend)
function computeInfluencerPower(inf: any): number {
  const followers = inf.followers ?? 0;
  const akari = inf.akari_score ?? 0;
  const sentiment = inf.avg_sentiment_30d ?? 50;
  
  return akari * 0.5 + Math.log10(followers + 1) * 20 + sentiment * 0.3;
}

// Escape CSV field
function escapeCsvField(field: string | number | null): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Project slug is required' });
  }

  try {
    // Authenticate user
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // Check Deep Explorer permission
    const akariUser = {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      realRoles: user.roles,
      effectiveRoles: user.roles,
      featureGrants: user.featureGrants,
      isLoggedIn: true,
      viewAsRole: null,
      xUsername: null,
      personaType: 'individual' as const,
      personaTag: null,
      telegramConnected: false,
    };

    if (!canUseDeepExplorer(akariUser)) {
      return res.status(403).json({ ok: false, error: 'Deep Explorer access required' });
    }

    // Get project
    const supabase = createPortalClient();
    const project = await getProjectBySlug(supabase, slug);

    if (!project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Get influencers
    const influencers = await getProjectInfluencers(supabase, project.id, 1000); // Get all

    // Build CSV
    const csvRows: string[] = [];
    
    // Header
    csvRows.push('handle,followers,akari_score,sentiment_30d,ct_heat,power');

    // Data rows
    for (const inf of influencers) {
      const handle = inf.x_handle.replace(/^@/, '');
      const followers = inf.followers ?? 0;
      const akariScore = inf.akari_score ?? '';
      const sentiment30d = inf.avg_sentiment_30d ?? '';
      const ctHeat = ''; // Not available in current data structure
      const power = Math.round(computeInfluencerPower(inf));

      csvRows.push(
        [
          escapeCsvField(handle),
          escapeCsvField(followers),
          escapeCsvField(akariScore),
          escapeCsvField(sentiment30d),
          escapeCsvField(ctHeat),
          escapeCsvField(power),
        ].join(',')
      );
    }

    const csvContent = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inner-circle-${slug}.csv"`);
    
    return res.status(200).send(csvContent);
  } catch (error: any) {
    console.error(`[Inner Circle Export] Error:`, error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to export data' });
  }
}

