/**
 * API Route: POST /api/portal/sentiment/refresh-state/view
 * 
 * Tracks when a user views a project's sentiment detail page.
 * This helps the Smart Refresh System prioritize active projects.
 * 
 * Request body:
 *   - projectId: UUID of the project being viewed
 * 
 * Logic:
 *   - Upsert project_refresh_state
 *   - Set last_manual_view_at = NOW()
 *   - Increment interest_score by +2
 * 
 * This is a "fire and forget" endpoint - errors are logged but don't fail the response.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Interest score increment for page view
const VIEW_INTEREST_INCREMENT = 2;

// =============================================================================
// TYPES
// =============================================================================

interface ViewRequest {
  projectId: string;
}

type ViewResponse =
  | { ok: true; message: string }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ViewResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { projectId } = req.body as ViewRequest;

    // Validate projectId
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    if (!isValidUUID(projectId)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectId format' });
    }

    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // Check if record exists
    const { data: existing, error: selectError } = await supabase
      .from('project_refresh_state')
      .select('project_id, interest_score')
      .eq('project_id', projectId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new entries
      console.error('[RefreshState/View] Select error:', selectError);
    }

    if (existing) {
      // Update existing record
      const newInterestScore = (existing.interest_score || 0) + VIEW_INTEREST_INCREMENT;
      
      const { error: updateError } = await supabase
        .from('project_refresh_state')
        .update({
          last_manual_view_at: now,
          interest_score: newInterestScore,
          inactivity_days: 0, // Reset inactivity on interaction
        })
        .eq('project_id', projectId);

      if (updateError) {
        console.error('[RefreshState/View] Update error:', updateError);
        // Don't fail the response - this is a tracking endpoint
      } else {
        console.log(`[RefreshState/View] Updated project ${projectId}: interest_score=${newInterestScore}`);
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('project_refresh_state')
        .insert({
          project_id: projectId,
          last_manual_view_at: now,
          interest_score: VIEW_INTEREST_INCREMENT,
          inactivity_days: 0,
          refresh_frequency: 'daily', // New projects start with daily refresh
        });

      if (insertError) {
        console.error('[RefreshState/View] Insert error:', insertError);
        // Don't fail the response - this is a tracking endpoint
      } else {
        console.log(`[RefreshState/View] Created new record for project ${projectId}`);
      }
    }

    return res.status(200).json({ ok: true, message: 'View tracked' });
  } catch (error: any) {
    console.error('[RefreshState/View] Error:', error);
    // Return success anyway - tracking failures shouldn't break the UI
    return res.status(200).json({ ok: true, message: 'View tracking attempted' });
  }
}

