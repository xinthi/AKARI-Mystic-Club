/**
 * API Route: POST /api/portal/admin/arc/backfill-live-items
 * 
 * Backfill endpoint to ensure approved requests have required records for Live/Upcoming visibility.
 * - Option 2: Ensures arenas exist and are active
 * - Option 3: Ensures gamified quests/arenas exist
 * - Option 1: Reports missing campaigns (does not auto-create)
 * 
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type BackfillResponse =
  | {
      ok: true;
      dryRun: boolean;
      summary: {
        scannedCount: number;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        errors: Array<{ projectSlug: string; projectId: string; requestId: string; message: string }>;
      };
    }
  | { ok: false; error: string };

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BackfillResponse>
) {
  if (req.method !== 'POST') {
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

    // Check super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const { dryRun = false, limit = 100 } = req.body as { dryRun?: boolean; limit?: number };
    const maxLimit = Math.min(limit || 100, 500);
    const isDryRun = dryRun === true;

    const supabase = getSupabaseAdmin();

    // Get admin profile ID for arena creation
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    const summary = {
      scannedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errors: [] as Array<{ projectSlug: string; projectId: string; requestId: string; message: string }>,
    };

    // Get all approved requests with project info
    const { data: approvedRequests, error: requestsError } = await supabase
      .from('arc_leaderboard_requests')
      .select(`
        id,
        project_id,
        requested_arc_access_level,
        decided_at,
        projects:project_id (
          id,
          name,
          slug
        )
      `)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false })
      .limit(maxLimit);

    if (requestsError) {
      console.error('[Backfill Live Items] Error fetching approved requests:', requestsError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch approved requests' });
    }

    if (!approvedRequests || approvedRequests.length === 0) {
      return res.status(200).json({
        ok: true,
        dryRun: isDryRun,
        summary,
      });
    }

    // Process each approved request
    for (const request of approvedRequests) {
      summary.scannedCount++;
      const project = (request as any).projects;
      const projectSlug = project?.slug || request.project_id;
      const accessLevel = (request as any).requested_arc_access_level;

      if (!accessLevel) {
        summary.skippedCount++;
        continue;
      }

      try {
        if (accessLevel === 'leaderboard') {
          // Option 2: Ensure arena exists and is active
          const { data: existingArenas } = await supabase
            .from('arenas')
            .select('id, status')
            .eq('project_id', request.project_id)
            .in('status', ['active', 'scheduled'])
            .limit(1);

          if (!existingArenas || existingArenas.length === 0) {
            // Create arena
            if (!isDryRun) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name, slug')
                .eq('id', request.project_id)
                .single();

              if (projectData) {
                let baseSlug = `${projectData.slug}-leaderboard`;
                let arenaSlug = baseSlug;
                let suffix = 2;

                // Check if base slug exists
                const { data: slugCheck } = await supabase
                  .from('arenas')
                  .select('slug')
                  .eq('slug', arenaSlug)
                  .maybeSingle();

                if (slugCheck) {
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
                }

                const { error: arenaError } = await supabase
                  .from('arenas')
                  .insert({
                    project_id: request.project_id,
                    name: `${projectData.name} Leaderboard`,
                    slug: arenaSlug,
                    status: 'active',
                    starts_at: null,
                    ends_at: null,
                    created_by: adminProfile?.id || null,
                  });

                if (arenaError) {
                  summary.errors.push({
                    projectSlug,
                    projectId: request.project_id,
                    requestId: request.id,
                    message: `Failed to create arena: ${arenaError.message}`,
                  });
                } else {
                  summary.createdCount++;
                }
              } else {
                summary.errors.push({
                  projectSlug,
                  projectId: request.project_id,
                  requestId: request.id,
                  message: 'Project not found',
                });
              }
            } else {
              summary.createdCount++;
            }
          } else if (existingArenas[0].status !== 'active') {
            // Update to active
            if (!isDryRun) {
              const { error: updateError } = await supabase
                .from('arenas')
                .update({ status: 'active' })
                .eq('id', existingArenas[0].id);

              if (updateError) {
                summary.errors.push({
                  projectSlug,
                  projectId: request.project_id,
                  requestId: request.id,
                  message: `Failed to activate arena: ${updateError.message}`,
                });
              } else {
                summary.updatedCount++;
              }
            } else {
              summary.updatedCount++;
            }
          } else {
            summary.skippedCount++;
          }
        } else if (accessLevel === 'gamified') {
          // Option 3: Check for creator_manager_programs first, then arenas as fallback
          const { data: programs } = await supabase
            .from('creator_manager_programs')
            .select('id, status')
            .eq('project_id', request.project_id)
            .in('status', ['active', 'paused'])
            .limit(1);

          const { data: arenas } = await supabase
            .from('arenas')
            .select('id, status')
            .eq('project_id', request.project_id)
            .in('status', ['active', 'scheduled'])
            .limit(1);

          if ((!programs || programs.length === 0) && (!arenas || arenas.length === 0)) {
            // Create arena for gamified (fallback)
            if (!isDryRun) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name, slug')
                .eq('id', request.project_id)
                .single();

              if (projectData) {
                let baseSlug = `${projectData.slug}-gamified`;
                let arenaSlug = baseSlug;
                let suffix = 2;

                const { data: slugCheck } = await supabase
                  .from('arenas')
                  .select('slug')
                  .eq('slug', arenaSlug)
                  .maybeSingle();

                if (slugCheck) {
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
                }

                const { error: arenaError } = await supabase
                  .from('arenas')
                  .insert({
                    project_id: request.project_id,
                    name: `${projectData.name} Gamified Leaderboard`,
                    slug: arenaSlug,
                    status: 'active',
                    starts_at: null,
                    ends_at: null,
                    created_by: adminProfile?.id || null,
                  });

                if (arenaError) {
                  summary.errors.push({
                    projectSlug,
                    projectId: request.project_id,
                    requestId: request.id,
                    message: `Failed to create gamified arena: ${arenaError.message}`,
                  });
                } else {
                  summary.createdCount++;
                }
              }
            } else {
              summary.createdCount++;
            }
          } else if (programs && programs.length > 0 && programs[0].status !== 'active') {
            // Update program to active
            if (!isDryRun) {
              const { error: updateError } = await supabase
                .from('creator_manager_programs')
                .update({ status: 'active' })
                .eq('id', programs[0].id);

              if (updateError) {
                summary.errors.push({
                  projectSlug,
                  projectId: request.project_id,
                  requestId: request.id,
                  message: `Failed to activate program: ${updateError.message}`,
                });
              } else {
                summary.updatedCount++;
              }
            } else {
              summary.updatedCount++;
            }
          } else if (arenas && arenas.length > 0 && arenas[0].status !== 'active') {
            // Update arena to active
            if (!isDryRun) {
              const { error: updateError } = await supabase
                .from('arenas')
                .update({ status: 'active' })
                .eq('id', arenas[0].id);

              if (updateError) {
                summary.errors.push({
                  projectSlug,
                  projectId: request.project_id,
                  requestId: request.id,
                  message: `Failed to activate arena: ${updateError.message}`,
                });
              } else {
                summary.updatedCount++;
              }
            } else {
              summary.updatedCount++;
            }
          } else {
            summary.skippedCount++;
          }
        } else if (accessLevel === 'creator_manager') {
          // Option 1: Check for campaigns (report but don't auto-create)
          const { data: campaigns } = await supabase
            .from('arc_campaigns')
            .select('id')
            .eq('project_id', request.project_id)
            .in('status', ['live', 'paused'])
            .limit(1);

          if (!campaigns || campaigns.length === 0) {
            summary.errors.push({
              projectSlug,
              projectId: request.project_id,
              requestId: request.id,
              message: 'No live/paused campaigns found. Campaigns must be created manually.',
            });
          } else {
            summary.skippedCount++;
          }
        } else {
          summary.skippedCount++;
        }
      } catch (err: any) {
        summary.errors.push({
          projectSlug,
          projectId: request.project_id,
          requestId: request.id,
          message: `Unexpected error: ${err.message}`,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun: isDryRun,
      summary,
    });
  } catch (error: any) {
    console.error('[Backfill Live Items] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

