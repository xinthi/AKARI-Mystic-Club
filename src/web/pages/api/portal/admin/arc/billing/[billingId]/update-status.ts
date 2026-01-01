/**
 * API Route: POST /api/portal/admin/arc/billing/[billingId]/update-status
 * 
 * Update payment status for a billing record (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { getRequestId, writeArcAudit } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateStatusBody {
  payment_status: 'pending' | 'paid' | 'waived' | 'refunded';
  payment_reference?: string;
}

// =============================================================================
// API HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // SuperAdmin only
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    const { billingId } = req.query;
    if (!billingId || typeof billingId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid billing ID',
      });
    }

    // Parse body
    const body: UpdateStatusBody = req.body;
    if (!body.payment_status) {
      return res.status(400).json({
        ok: false,
        error: 'payment_status is required',
      });
    }

    const validStatuses = ['pending', 'paid', 'waived', 'refunded'];
    if (!validStatuses.includes(body.payment_status)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payment_status',
      });
    }

    const supabase = getSupabaseAdmin();

    // Fetch current record for audit
    const { data: currentRecord, error: fetchError } = await supabase
      .from('arc_billing_records')
      .select('id, project_id, payment_status, payment_reference')
      .eq('id', billingId)
      .single();

    if (fetchError || !currentRecord) {
      return res.status(404).json({
        ok: false,
        error: 'Billing record not found',
      });
    }

    // Prepare update data
    const updateData: any = {
      payment_status: body.payment_status,
      updated_at: new Date().toISOString(),
    };

    // Set paid_at if status is 'paid'
    if (body.payment_status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    } else if (currentRecord.payment_status === 'paid') {
      // Clear paid_at if changing from paid to another status
      updateData.paid_at = null;
    }

    // Update payment_reference if provided
    if (body.payment_reference !== undefined) {
      updateData.payment_reference = body.payment_reference || null;
    }

    // Update record
    const { data: updatedRecord, error: updateError } = await supabase
      .from('arc_billing_records')
      .update(updateData)
      .eq('id', billingId)
      .select()
      .single();

    if (updateError) {
      console.error('[Update Billing Status API] Error updating record:', updateError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to update billing record',
      });
    }

    // Log audit
    const requestId = getRequestId(req);
    await writeArcAudit(supabase, {
      actorProfileId: auth.profileId,
      projectId: currentRecord.project_id,
      entityType: 'billing_record',
      entityId: billingId,
      action: 'billing_status_updated',
      success: true,
      message: `Payment status updated from ${currentRecord.payment_status} to ${body.payment_status}`,
      requestId,
      metadata: {
        old_status: currentRecord.payment_status,
        new_status: body.payment_status,
        payment_reference: body.payment_reference || null,
      },
    });

    return res.status(200).json({
      ok: true,
      billingId,
      payment_status: updatedRecord.payment_status,
      paid_at: updatedRecord.paid_at,
    });
  } catch (err: any) {
    console.error('[Update Billing Status API] Unexpected error:', err);

    // Log audit for failure
    try {
      const supabase = getSupabaseAdmin();
      const requestId = getRequestId(req);
      const authResult = await requireSuperAdmin(req);
      await writeArcAudit(supabase, {
        actorProfileId: authResult.ok ? authResult.profileId : null,
        projectId: null,
        entityType: 'billing_record',
        entityId: (req.query.billingId as string) || null,
        action: 'billing_status_updated',
        success: false,
        message: err.message || 'Failed to update billing status',
        requestId,
        metadata: {
          error: err.message,
          body: req.body,
        },
      });
    } catch (auditErr) {
      // Ignore audit errors
    }

    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
