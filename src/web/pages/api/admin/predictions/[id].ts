/**
 * Admin Prediction Detail API
 * 
 * GET: Get prediction details
 * PATCH: Update prediction (status, etc.)
 * DELETE: Delete prediction (only if no bets)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

interface AdminResponse {
  ok: boolean;
  prediction?: any;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminResponse>
) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid prediction ID' });
  }

  // Verify admin token
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== process.env.ADMIN_PANEL_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  // GET: Get prediction details
  if (req.method === 'GET') {
    try {
      const prediction = await prisma.prediction.findUnique({
        where: { id },
        include: {
          bets: {
            include: {
              user: {
                select: { id: true, username: true, telegramId: true },
              },
            },
          },
        },
      });

      if (!prediction) {
        return res.status(404).json({ ok: false, message: 'Prediction not found' });
      }

      return res.status(200).json({ ok: true, prediction });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminPrediction] Get failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to load prediction' });
    }
  }

  // PATCH: Update prediction
  if (req.method === 'PATCH') {
    try {
      const { status, title, description, endsAt, category } = req.body;

      const current = await prisma.prediction.findUnique({
        where: { id },
        include: { _count: { select: { bets: true } } },
      });

      if (!current) {
        return res.status(404).json({ ok: false, message: 'Prediction not found' });
      }

      const hasBets = current._count.bets > 0;

      // Build update data
      const updateData: any = {};

      // Status changes are always allowed
      if (status) {
        // Validate status transition
        const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'RESOLVED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ ok: false, message: 'Invalid status' });
        }

        // Cannot cancel if there are bets (need to resolve instead)
        if (status === 'CANCELLED' && hasBets) {
          return res.status(400).json({ 
            ok: false, 
            message: 'Cannot cancel prediction with bets. Use resolve instead.' 
          });
        }

        updateData.status = status;
      }

      // Only allow content edits if no bets
      if (!hasBets) {
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (endsAt !== undefined) updateData.endsAt = endsAt ? new Date(endsAt) : null;
        if (category !== undefined) updateData.category = category;
      } else if (title !== undefined || description !== undefined) {
        return res.status(400).json({
          ok: false,
          message: 'Cannot edit prediction content after bets have been placed',
        });
      }

      const updated = await prisma.prediction.update({
        where: { id },
        data: updateData,
      });

      console.log(`[AdminPrediction] Updated ${id}: ${JSON.stringify(updateData)}`);

      return res.status(200).json({
        ok: true,
        prediction: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
        },
        message: 'Prediction updated',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminPrediction] Update failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to update prediction' });
    }
  }

  // DELETE: Delete prediction (only if no bets)
  if (req.method === 'DELETE') {
    try {
      const current = await prisma.prediction.findUnique({
        where: { id },
        include: { _count: { select: { bets: true } } },
      });

      if (!current) {
        return res.status(404).json({ ok: false, message: 'Prediction not found' });
      }

      if (current._count.bets > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Cannot delete prediction with bets. Cancel or resolve it instead.',
        });
      }

      await prisma.prediction.delete({ where: { id } });

      console.log(`[AdminPrediction] Deleted ${id}`);

      return res.status(200).json({ ok: true, message: 'Prediction deleted' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminPrediction] Delete failed:', message);
      return res.status(500).json({ ok: false, message: 'Failed to delete prediction' });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

