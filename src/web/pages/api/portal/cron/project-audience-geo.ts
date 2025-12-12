/**
 * Cron API Route: Project Audience Geo Update
 * 
 * Periodically fetches follower samples from twitterapi.io and computes
 * geographic distribution for each active project.
 * 
 * =============================================================================
 * SECURITY
 * =============================================================================
 * 
 * Requires CRON_SECRET authentication via one of:
 * - Query param: ?secret=CRON_SECRET
 * - Header: Authorization: Bearer CRON_SECRET
 * - Header: x-cron-secret: CRON_SECRET
 * 
 * =============================================================================
 * MANUAL INVOCATION
 * =============================================================================
 * 
 * GET /api/portal/cron/project-audience-geo?secret=YOUR_CRON_SECRET
 * 
 * Optional query params:
 * - maxFollowers: Number of followers to sample per project (default 500)
 * - projectSlug: Only process a single project (for testing)
 * 
 * =============================================================================
 * VERCEL CRON CONFIGURATION
 * =============================================================================
 * 
 * Add to vercel.json:
 * 
 * {
 *   "path": "/api/portal/cron/project-audience-geo",
 *   "schedule": "0 4 * * 2,5"
 * }
 * 
 * Runs twice per week: Tuesday and Friday at 04:00 UTC.
 * Muaz can tune this schedule as needed.
 * 
 * =============================================================================
 * IMPORTANT
 * =============================================================================
 * 
 * This cron is SAFE and INDEPENDENT:
 * - Does NOT touch sentiment formulas (Akari Score, Sentiment, CT Heat)
 * - Does NOT touch metrics_daily
 * - Does NOT touch inner_circle logic
 * - Only writes to project_audience_geo table
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { computeAndStoreAudienceGeo, ComputeGeoResult } from '../../../../../server/projectAudienceGeo';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting - delay between projects to avoid twitterapi.io rate limits
const DELAY_BETWEEN_PROJECTS_MS = 3000;

// Default max followers per project
const DEFAULT_MAX_FOLLOWERS = 500;

// =============================================================================
// TYPES
// =============================================================================

interface ProcessResult {
  projectId: string;
  slug: string;
  success: boolean;
  sampleSize: number;
  mappedCountriesCount: number;
  error?: string;
}

interface CronResponse {
  ok: boolean;
  message: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalProjects: number;
  successCount: number;
  errorCount: number;
  results: ProcessResult[];
  errors?: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function validateCronSecret(req: NextApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[AudienceGeoCron] CRON_SECRET not configured in environment');
    return false;
  }

  // Extract authorization header - Vercel sends "Bearer <CRON_SECRET>"
  const authHeader = req.headers.authorization;
  const authSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  const providedSecret =
    authSecret ||
    (req.headers['x-cron-secret'] as string | undefined) ||
    (req.query.secret as string | undefined) ||
    (req.query.token as string | undefined);

  if (!providedSecret) {
    console.warn('[AudienceGeoCron] No secret provided in request');
    return false;
  }

  return providedSecret === cronSecret;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse | { ok: false; error: string }>
) {
  const startedAt = new Date();

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Validate CRON_SECRET
  if (!validateCronSecret(req)) {
    console.warn('[AudienceGeoCron] Unauthorized request');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Parse optional params
  const maxFollowers = parseInt(req.query.maxFollowers as string) || DEFAULT_MAX_FOLLOWERS;
  const singleProjectSlug = req.query.projectSlug as string | undefined;

  console.log('='.repeat(60));
  console.log('[AudienceGeoCron] Starting audience geo update');
  console.log('[AudienceGeoCron] Time:', startedAt.toISOString());
  console.log('[AudienceGeoCron] Max followers per project:', maxFollowers);
  if (singleProjectSlug) {
    console.log('[AudienceGeoCron] Single project mode:', singleProjectSlug);
  }
  console.log('='.repeat(60));

  const results: ProcessResult[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let errorCount = 0;

  try {
    const supabase = getSupabaseClient();

    // Fetch active projects with X handles
    console.log('[AudienceGeoCron] Fetching active projects...');

    let query = supabase
      .from('projects')
      .select('id, slug, name, twitter_username, x_user_id, is_active')
      .eq('is_active', true)
      .not('twitter_username', 'is', null);

    // Filter to single project if specified
    if (singleProjectSlug) {
      query = query.eq('slug', singleProjectSlug);
    }

    const { data: projects, error: projectsError } = await query.order('name');

    if (projectsError) {
      throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    }

    const validProjects = (projects || []).filter(
      (p) => p.twitter_username && p.twitter_username.trim() !== ''
    );

    console.log(`[AudienceGeoCron] Found ${validProjects.length} active projects with X handles`);

    if (validProjects.length === 0) {
      const completedAt = new Date();
      return res.status(200).json({
        ok: true,
        message: 'No active projects to process',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        totalProjects: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
      });
    }

    // Process each project
    for (let i = 0; i < validProjects.length; i++) {
      const project = validProjects[i];
      const projectNum = i + 1;

      console.log(`\n[${projectNum}/${validProjects.length}] Processing: ${project.name} (@${project.twitter_username})`);

      try {
        const result = await computeAndStoreAudienceGeo(supabase, project.id, { maxFollowers });

        if (result) {
          console.log(`[${projectNum}] ✅ Success: ${result.mappedCount} mapped, ${result.countries.length} countries`);
          successCount++;
          results.push({
            projectId: project.id,
            slug: project.slug,
            success: true,
            sampleSize: result.sampleSize,
            mappedCountriesCount: result.countries.length,
          });
        } else {
          console.log(`[${projectNum}] ⚠️ No result (possibly no followers or no X handle)`);
          errorCount++;
          results.push({
            projectId: project.id,
            slug: project.slug,
            success: false,
            sampleSize: 0,
            mappedCountriesCount: 0,
            error: 'No result from computeAndStoreAudienceGeo',
          });
        }
      } catch (projectError: any) {
        console.error(`[${projectNum}] ❌ Error:`, projectError.message);
        errors.push(`${project.slug}: ${projectError.message}`);
        errorCount++;
        results.push({
          projectId: project.id,
          slug: project.slug,
          success: false,
          sampleSize: 0,
          mappedCountriesCount: 0,
          error: projectError.message,
        });
      }

      // Rate limiting delay
      if (i < validProjects.length - 1) {
        await delay(DELAY_BETWEEN_PROJECTS_MS);
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.log('\n' + '='.repeat(60));
    console.log('[AudienceGeoCron] COMPLETED');
    console.log(`[AudienceGeoCron] Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[AudienceGeoCron] Success: ${successCount} | Errors: ${errorCount}`);
    console.log('='.repeat(60));

    return res.status(200).json({
      ok: true,
      message: `Audience geo update complete: ${successCount} success, ${errorCount} errors`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      totalProjects: validProjects.length,
      successCount,
      errorCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[AudienceGeoCron] Fatal error:', error);

    const completedAt = new Date();

    return res.status(500).json({
      ok: false,
      message: `Cron failed: ${error.message}`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      totalProjects: 0,
      successCount,
      errorCount,
      results,
      errors: [error.message, ...errors],
    });
  }
}

