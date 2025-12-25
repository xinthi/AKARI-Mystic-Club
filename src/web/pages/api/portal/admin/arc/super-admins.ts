/**
 * API Route: GET /api/portal/admin/arc/super-admins
 * 
 * Returns list of all super admin users
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface SuperAdminUser {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  created_at: string;
}

type SuperAdminsResponse =
  | { ok: true; admins: SuperAdminUser[] }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuperAdminsResponse>
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

    // Get all profiles with super_admin role
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, email, real_roles, created_at')
      .or('real_roles.cs.{super_admin}');

    if (profilesError) {
      console.error('[Super Admins API] Error fetching profiles:', profilesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch profiles' });
    }

    // Also get super admins from akari_user_roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('user_id, role')
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[Super Admins API] Error fetching user roles:', rolesError);
    }

    // Get user IDs from roles
    const superAdminUserIds = new Set((userRoles || []).map((ur: any) => ur.user_id));

    // Get profiles for these user IDs via akari_user_identities
    let additionalProfiles: any[] = [];
    if (superAdminUserIds.size > 0) {
      const { data: identities } = await supabase
        .from('akari_user_identities')
        .select('user_id, username, provider')
        .in('user_id', Array.from(superAdminUserIds))
        .eq('provider', 'x');

      if (identities && identities.length > 0) {
        const usernames = identities.map((i: any) => i.username.toLowerCase().replace('@', ''));
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, username, display_name, email, real_roles, created_at')
          .in('username', usernames);

        if (profileData) {
          additionalProfiles = profileData;
        }
      }
    }

    // Combine and deduplicate
    const allProfiles = new Map<string, any>();
    
    (profiles || []).forEach((p: any) => {
      if (p.real_roles?.includes('super_admin')) {
        allProfiles.set(p.id, p);
      }
    });

    additionalProfiles.forEach((p: any) => {
      allProfiles.set(p.id, p);
    });

    // Format response
    const admins: SuperAdminUser[] = Array.from(allProfiles.values()).map((p: any) => ({
      id: p.id,
      username: p.username || 'unknown',
      display_name: p.display_name,
      email: p.email,
      roles: p.real_roles || ['super_admin'],
      created_at: p.created_at,
    }));

    return res.status(200).json({ ok: true, admins });
  } catch (error: any) {
    console.error('[Super Admins API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

