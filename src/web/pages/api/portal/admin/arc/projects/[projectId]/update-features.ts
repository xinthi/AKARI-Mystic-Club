/**
 * API Route: POST /api/portal/admin/arc/projects/[projectId]/update-features
 * 
 * Update arc_project_features for a project.
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { writeArcAudit, getRequestId } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

type UpdateFeaturesResponse =
  | {
      ok: true;
      features: {
        crm_enabled: boolean;
        crm_visibility: 'private' | 'public' | 'hybrid';
        crm_start_at: string | null;
        crm_end_at: string | null;
      };
    }
  | {
      ok: false;
      error: string;
    };

interface UpdateFeaturesBody {
  crm_enabled?: boolean;
  crm_visibility?: 'private' | 'public' | 'hybrid';
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateFeaturesResponse>
) {
  // Only allow POST and PUT requests (treat them the same)
  if (req.method !== 'POST' && req.method !== 'PUT') {
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

  const { projectId } = req.query;

  // Validate projectId is a UUID
  if (!projectId || typeof projectId !== 'string' || !isValidUUID(projectId)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid project ID',
    });
  }

  // Parse request body
  let body: UpdateFeaturesBody = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
    });
  }

  // Validate crm_visibility if provided
  if (body.crm_visibility && !['private', 'public', 'hybrid'].includes(body.crm_visibility)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid crm_visibility. Must be one of: private, public, hybrid',
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check if project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
    }

    // Fetch "before" features for audit log
    const { data: beforeFeatures } = await supabase
      .from('arc_project_features')
      .select('crm_enabled, crm_visibility, crm_start_at, crm_end_at')
      .eq('project_id', projectId)
      .maybeSingle();

    // Prepare update data
    const updateData: any = {};

    if (typeof body.crm_enabled === 'boolean') {
      updateData.crm_enabled = body.crm_enabled;
    }

    if (body.crm_visibility) {
      updateData.crm_visibility = body.crm_visibility;
    }

    // Upsert arc_project_features
    const featuresData: any = {
      project_id: projectId,
      ...updateData,
    };

    const { data: updatedFeatures, error: featuresError } = await supabase
      .from('arc_project_features')
      .upsert(featuresData, {
        onConflict: 'project_id',
      })
      .select('crm_enabled, crm_visibility, crm_start_at, crm_end_at')
      .single();

    if (featuresError) {
      console.error('[Update Features API] Error upserting arc_project_features:', featuresError);
      const auditRequestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: auth.profileId,
        projectId: projectId,
        entityType: 'project_features',
        entityId: projectId,
        action: 'features_updated',
        success: false,
        message: 'Failed to update project features',
        requestId: auditRequestId,
        metadata: { error: featuresError.message || 'Database error', patch: body, before: beforeFeatures || null },
      });
      return res.status(500).json({
        ok: false,
        error: 'Failed to update project features',
      });
    }

    // Log successful update
    const auditRequestId = getRequestId(req);
    await writeArcAudit(supabase, {
      actorProfileId: auth.profileId,
      projectId: projectId,
      entityType: 'project_features',
      entityId: projectId,
      action: 'features_updated',
      success: true,
      message: `Project features updated: crm_enabled=${body.crm_enabled}, crm_visibility=${body.crm_visibility}`,
      requestId: auditRequestId,
      metadata: {
        patch: body,
        before: beforeFeatures || null,
        after: updatedFeatures || null,
      },
    });

    return res.status(200).json({
      ok: true,
      features: {
        crm_enabled: updatedFeatures?.crm_enabled || false,
        crm_visibility: (updatedFeatures?.crm_visibility as 'private' | 'public' | 'hybrid') || 'private',
        crm_start_at: updatedFeatures?.crm_start_at || null,
        crm_end_at: updatedFeatures?.crm_end_at || null,
      },
    });
  } catch (error: any) {
    console.error('[Update Features API] Error:', error);
    const supabase = getSupabaseAdmin();
    const auditRequestId = getRequestId(req);
    const auth = await requireSuperAdmin(req);
    await writeArcAudit(supabase, {
      actorProfileId: auth.ok ? auth.profileId : null,
      projectId: typeof projectId === 'string' ? projectId : null,
      entityType: 'project_features',
      entityId: typeof projectId === 'string' ? projectId : null,
      action: 'features_updated',
      success: false,
      message: error.message || 'Internal server error',
      requestId: auditRequestId,
      metadata: { error: error.message || 'Unknown error' },
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
