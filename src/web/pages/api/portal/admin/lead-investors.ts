import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '@/lib/prisma';
import { requirePortalUser, assertSuperAdmin } from '@/lib/portalAuth';

type LeadInvestorPayload = {
  id?: string;
  name: string;
  slug?: string;
  websiteUrl?: string;
  tier?: string;
  notes?: string;
};

type GetResponse =
  | { ok: true; investors: Array<{ id: string; name: string; slug: string; websiteUrl?: string; tier?: string; notes?: string }> }
  | { ok: false; error: string };

type PostResponse =
  | { ok: true; investor: { id: string } }
  | { ok: false; error: string };

type PutResponse =
  | { ok: true; investor: { id: string } }
  | { ok: false; error: string };

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PostResponse | PutResponse>
) {
  try {
    const user = await requirePortalUser(req);

    if (req.method === 'GET') {
      // Allow any authenticated user to read
      const investors = await withDbRetry(() =>
        prisma.leadInvestor.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            websiteUrl: true,
            tier: true,
            notes: true,
          },
          orderBy: { name: 'asc' },
        })
      );

      return res.status(200).json({
        ok: true,
        investors: investors.map((i) => ({
          id: i.id,
          name: i.name,
          slug: i.slug,
          websiteUrl: i.websiteUrl || undefined,
          tier: i.tier || undefined,
          notes: i.notes || undefined,
        })),
      });
    }

    if (req.method === 'POST') {
      assertSuperAdmin(user);

      const { name, slug, websiteUrl, tier, notes } = req.body as LeadInvestorPayload;

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: 'Name is required',
        });
      }

      const finalSlug = slug || generateSlug(name);

      // Check if slug already exists
      const existing = await withDbRetry(() =>
        prisma.leadInvestor.findUnique({
          where: { slug: finalSlug },
        })
      );

      if (existing) {
        return res.status(400).json({
          ok: false,
          error: 'Investor with this slug already exists',
        });
      }

      const investor = await withDbRetry(() =>
        prisma.leadInvestor.create({
          data: {
            name,
            slug: finalSlug,
            websiteUrl: websiteUrl || null,
            tier: tier || null,
            notes: notes || null,
            createdById: user.id,
          },
        })
      );

      return res.status(201).json({ ok: true, investor: { id: investor.id } });
    }

    if (req.method === 'PUT') {
      assertSuperAdmin(user);

      const { id, name, slug, websiteUrl, tier, notes } = req.body as LeadInvestorPayload & { id: string };

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Investor ID is required',
        });
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (slug) updateData.slug = slug;
      if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl || null;
      if (tier !== undefined) updateData.tier = tier || null;
      if (notes !== undefined) updateData.notes = notes || null;

      const investor = await withDbRetry(() =>
        prisma.leadInvestor.update({
          where: { id },
          data: updateData,
        })
      );

      return res.status(200).json({ ok: true, investor: { id: investor.id } });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[API /portal/admin/lead-investors] Error:', error);
    
    if (error.message === 'Unauthorized: No user ID provided' || error.message === 'Unauthorized: User not found') {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    
    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ ok: false, error: error.message });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

