/**
 * API Route: GET /api/portal/admin/arc/activity
 * 
 * Fetch ARC audit log events (super admin only).
 * Supports filtering by projectId and limiting results.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';

// =============================================================================
// TYPES
// =============================================================================

interface AuditEvent {
  id: string;
  created_at: string;
  actor_profile_id: string | null;
  project_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  success: boolean;
  message: string | null;
  request_id: string | null;
  metadata: Record<string, any>;
  // Joined project info (optional)
  project?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

type ActivityResponse =
  | {
      ok: true;
      events: AuditEvent[];
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
  res: NextApiResponse<ActivityResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  // Check authentication and SuperAdmin status
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Parse query parameters
    const { projectId, limit } = req.query;
    const limitNum = limit ? Math.min(parseInt(String(limit), 10), 500) : 200; // Max 500, default 200

    // Build query
    let query = supabase
      .from('arc_audit_log')
      .select(`
        id,
        created_at,
        actor_profile_id,
        project_id,
        entity_type,
        entity_id,
        action,
        success,
        message,
        request_id,
        metadata,
        projects:project_id (
          id,
          name,
          slug
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limitNum);

    // Filter by projectId if provided
    if (projectId && typeof projectId === 'string') {
      query = query.eq('project_id', projectId);
    }

    const { data: events, error: queryError } = await query;

    if (queryError) {
      console.error('[ARC Activity API] Query error:', queryError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch activity events',
      });
    }

    // Transform events to include project info
    const transformedEvents: AuditEvent[] = (events || []).map((event: any) => {
      const project = event.projects
        ? {
            id: event.projects.id,
            name: event.projects.name,
            slug: event.projects.slug,
          }
        : null;

      return {
        id: event.id,
        created_at: event.created_at,
        actor_profile_id: event.actor_profile_id,
        project_id: event.project_id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        action: event.action,
        success: event.success,
        message: event.message,
        request_id: event.request_id,
        metadata: event.metadata || {},
        project: project,
      };
    });

    return res.status(200).json({
      ok: true,
      events: transformedEvents,
    });
  } catch (error: any) {
    console.error('[ARC Activity API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
