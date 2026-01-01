/**
 * ARC Audit Log Helper
 * 
 * Utilities for writing audit logs for ARC operations.
 * All operations are non-blocking and never throw errors.
 */

import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabase-admin';

// =============================================================================
// TYPES
// =============================================================================

export type ArcAuditInput = {
  actorProfileId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  success?: boolean;
  message?: string | null;
  requestId?: string | null;
  metadata?: any;
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a short random ID for request tracking
 */
function generateShortId(): string {
  // Generate 10-character alphanumeric ID
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'arc_' + result;
}

/**
 * Get request ID from request headers or generate one
 * 
 * Checks for 'x-request-id' header first, then generates "arc_" + random 10 chars.
 * 
 * @param req Next.js API request
 * @returns Request ID string
 */
export function getRequestId(req: NextApiRequest): string {
  // Check for existing request ID header
  const headerRequestId = req.headers['x-request-id'];
  if (headerRequestId && typeof headerRequestId === 'string') {
    return headerRequestId;
  }

  // Generate "arc_" + random 10 chars
  return generateShortId();
}

/**
 * Serialize metadata to JSON, handling errors gracefully
 */
function serializeMetadata(metadata: any): Record<string, any> {
  if (metadata === undefined || metadata === null) {
    return {};
  }

  try {
    // Try to serialize to ensure it's JSON-compatible
    const serialized = JSON.parse(JSON.stringify(metadata));
    return serialized || {};
  } catch (err) {
    // If serialization fails, return a safe object
    console.warn('[arc-audit] Failed to serialize metadata, using empty object:', err);
    return {};
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Write an audit log entry for an ARC operation
 * 
 * This function is non-blocking and never throws errors.
 * All errors are logged but do not interrupt the calling code.
 * 
 * @param supabaseAdmin Supabase admin client (from getSupabaseAdmin())
 * @param input Audit log input data
 * 
 * @example
 * ```typescript
 * const supabase = getSupabaseAdmin();
 * await writeArcAudit(supabase, {
 *   actorProfileId: adminProfileId,
 *   projectId: projectId,
 *   entityType: 'leaderboard_request',
 *   entityId: requestId,
 *   action: 'request_approved',
 *   success: true,
 *   message: 'Request approved successfully',
 *   requestId: getRequestId(req),
 *   metadata: { productType: 'ms', arenaId: arenaId }
 * });
 * ```
 */
export async function writeArcAudit(
  supabaseAdmin: SupabaseClient,
  input: ArcAuditInput
): Promise<void> {
  try {
    // Validate required fields
    if (!input.entityType || !input.action) {
      console.warn('[arc-audit] Missing required fields: entityType and action are required');
      return;
    }

    // Serialize metadata
    const metadata = serializeMetadata(input.metadata);

    // Insert audit log entry
    const { error } = await supabaseAdmin
      .from('arc_audit_log')
      .insert({
        actor_profile_id: input.actorProfileId || null,
        project_id: input.projectId || null,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        action: input.action,
        success: input.success !== undefined ? input.success : true,
        message: input.message || null,
        request_id: input.requestId || null,
        metadata: metadata,
      });

    if (error) {
      console.warn('[arc-audit] Failed to insert audit log:', error);
      // Don't throw - just log the warning
    }
  } catch (err: any) {
    // Never throw - just log the error
    console.warn('[arc-audit] Unexpected error writing audit log:', err);
  }
}

/**
 * Convenience wrapper that uses getSupabaseAdmin() internally
 * 
 * Use this when you don't already have a supabase admin client.
 * 
 * @param input Audit log input data
 */
export async function writeArcAuditAuto(input: ArcAuditInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await writeArcAudit(supabase, input);
  } catch (err: any) {
    // Never throw - just log the error
    console.warn('[arc-audit] Failed to get supabase admin client:', err);
  }
}
