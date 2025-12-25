/**
 * API Route: POST /api/portal/admin/arc/backfill-arenas
 * 
 * One-time backfill endpoint to create/activate arenas for approved leaderboard projects
 * that don't have active arenas. Superadmin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

interface BackfillResponse {
  ok: true;
  dryRun: boolean;
  summary: {
    totalEligible: number;
    scannedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: Array<{ projectId: string; slug: string; message: string }>;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  try {
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (userRoles && userRoles.length > 0) {
      return true;
    }

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

      if (profile?.real_roles?.includes('super_admin')) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.error('[Backfill Arenas] Error checking superadmin:', err);
    return false;
  }
}

async function generateUniqueArenaSlug(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectSlug: string
): Promise<string> {
  let baseSlug = `${projectSlug}-leaderboard`;
  let arenaSlug = baseSlug;
  let suffix = 2;

  const { data: slugCheck } = await supabase
    .from('arenas')
    .select('slug')
    .eq('slug', arenaSlug)
    .maybeSingle();

  if (!slugCheck) {
    return arenaSlug;
  }

  // Find next available numeric suffix
  while (true) {
    arenaSlug = `${baseSlug}-${suffix}`;
    const { data: nextCheck } = await supabase
      .from('arenas')
      .select('slug')
      .eq('slug', arenaSlug)
      .maybeSingle();
    if (!nextCheck) break;
    suffix++;
  }

  return arenaSlug;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BackfillResponse | { ok: false; error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Parse query parameters
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const limitParam = req.query.limit;
  const limit = limitParam ? Math.min(Math.max(parseInt(String(limitParam), 10) || 100, 1), 500) : 100; // Max 500 for safety

  try {
    const supabase = getSupabaseAdmin();

    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Check superadmin
    const isSuperAdmin = await checkSuperAdmin(supabase, session.user_id);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Get admin profile ID for created_by
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', session.user_id)
      .eq('provider', 'x')
      .single();

    let adminProfileId: string | null = null;
    if (xIdentity?.username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
        .single();
      if (profile) {
        adminProfileId = profile.id;
      }
    }

    // Step 1: Find all eligible projects (approved leaderboard access)
    // Query projects with arc_active=true and arc_access_level='leaderboard'
    // Then join with arc_project_access and arc_project_features to filter for approved + option2 unlocked
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, slug, arc_active, arc_access_level')
      .eq('arc_active', true)
      .eq('arc_access_level', 'leaderboard');

    if (projectsError) {
      console.error('[Backfill Arenas] Error querying projects:', projectsError);
      return res.status(500).json({ ok: false, error: 'Failed to query projects' });
    }

    if (!projects || projects.length === 0) {
      return res.status(200).json({
        ok: true,
        dryRun,
        summary: {
          totalEligible: 0,
          scannedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errors: [],
        },
      });
    }

    // Filter to only projects with approved access and option2 unlocked
    const projectIds = projects.map(p => p.id);
    const { data: accessRows } = await supabase
      .from('arc_project_access')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('application_status', 'approved');

    const { data: featuresRows } = await supabase
      .from('arc_project_features')
      .select('project_id, option2_normal_unlocked, leaderboard_enabled, leaderboard_start_at, leaderboard_end_at')
      .in('project_id', projectIds)
      .eq('option2_normal_unlocked', true)
      .eq('leaderboard_enabled', true);

    const approvedProjectIds = new Set((accessRows || []).map(a => a.project_id));
    const featuresMap = new Map((featuresRows || []).map(f => [f.project_id, f]));

    const eligibleProjects = projects
      .filter(p => approvedProjectIds.has(p.id) && featuresMap.has(p.id))
      .map(p => ({
        ...p,
        arc_project_features: [featuresMap.get(p.id)],
      }));

    if (!eligibleProjects || eligibleProjects.length === 0) {
      return res.status(200).json({
        ok: true,
        dryRun,
        summary: {
          totalEligible: 0,
          scannedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errors: [],
        },
      });
    }

    // Apply limit
    const projectsToProcess = eligibleProjects.slice(0, limit);

    const summary = {
      totalEligible: eligibleProjects.length,
      scannedCount: projectsToProcess.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errors: [] as Array<{ projectId: string; slug: string; message: string }>,
    };

    // Step 2: Process each project
    for (const project of projectsToProcess) {
      try {
        const features = Array.isArray(project.arc_project_features) 
          ? project.arc_project_features[0] 
          : project.arc_project_features;

        // Check existing arenas for this project
        const { data: existingArenas } = await supabase
          .from('arenas')
          .select('id, status, starts_at, ends_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false });

        const existingArena = existingArenas && existingArenas.length > 0 ? existingArenas[0] : null;

        if (!existingArena) {
          // Create new arena
          const arenaSlug = await generateUniqueArenaSlug(supabase, project.slug);
          
          if (dryRun) {
            // Dry run: just count what would be created
            summary.createdCount++;
            console.log(`[Backfill Arenas] [DRY RUN] Would create arena for project ${project.id} (${project.slug}) -> ${arenaSlug}`);
          } else {
            const { error: createError } = await supabase
              .from('arenas')
              .insert({
                project_id: project.id,
                name: `${project.name} Leaderboard`,
                slug: arenaSlug,
                status: 'active',
                starts_at: features?.leaderboard_start_at || null,
                ends_at: features?.leaderboard_end_at || null,
                created_by: adminProfileId,
              });

            if (createError) {
              summary.errors.push({
                projectId: project.id,
                slug: project.slug || 'unknown',
                message: `Failed to create arena: ${createError.message}`,
              });
            } else {
              summary.createdCount++;
              console.log(`[Backfill Arenas] Created arena for project ${project.id} (${project.slug}) -> ${arenaSlug}`);
            }
          }
        } else {
          // Arena exists - check if it needs activation/updating
          const needsUpdate = existingArena.status !== 'active' ||
            (features?.leaderboard_start_at && !existingArena.starts_at) ||
            (features?.leaderboard_end_at && !existingArena.ends_at);

          if (needsUpdate) {
            if (dryRun) {
              // Dry run: just count what would be updated
              summary.updatedCount++;
              console.log(`[Backfill Arenas] DRY RUN: Would update arena for project ${project.id} (${project.slug})`);
            } else {
              const updateData: any = {
                status: 'active',
              };

              if (features?.leaderboard_start_at && !existingArena.starts_at) {
                updateData.starts_at = features.leaderboard_start_at;
              }
              if (features?.leaderboard_end_at && !existingArena.ends_at) {
                updateData.ends_at = features.leaderboard_end_at;
              }

              const { error: updateError } = await supabase
                .from('arenas')
                .update(updateData)
                .eq('id', existingArena.id);

              if (updateError) {
                summary.errors.push({
                  projectId: project.id,
                  slug: project.slug || 'unknown',
                  message: `Failed to update arena: ${updateError.message}`,
                });
              } else {
                summary.updatedCount++;
                console.log(`[Backfill Arenas] Updated arena for project ${project.id} (${project.slug})`);
              }
            }
          } else {
            summary.skippedCount++;
          }
        }
      } catch (projectErr: any) {
        summary.errors.push({
          projectId: project.id,
          slug: project.slug || 'unknown',
          message: `Unexpected error: ${projectErr.message}`,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      summary,
    });
  } catch (error: any) {
    console.error('[Backfill Arenas] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

