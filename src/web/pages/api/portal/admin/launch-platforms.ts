import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '@/lib/prisma';
import { requirePortalUser, assertSuperAdmin } from '@/lib/portalAuth';

type LaunchPlatformPayload = {
  id?: string;
  name: string;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  kind: 'LAUNCHPAD' | 'CEX' | 'DEX' | 'OTHER';
};

type GetResponse =
  | { ok: true; platforms: Array<{ id: string; name: string; slug: string; websiteUrl?: string; description?: string; kind: string }> }
  | { ok: false; error: string };

type PostResponse =
  | { ok: true; platform: { id: string } }
  | { ok: false; error: string };

type PutResponse =
  | { ok: true; platform: { id: string } }
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
      const platforms = await withDbRetry(() =>
        prisma.launchPlatform.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            website: true,
            description: true,
            kind: true,
          },
          orderBy: { name: 'asc' },
        })
      );

      return res.status(200).json({
        ok: true,
        platforms: platforms.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          websiteUrl: p.website || undefined,
          description: p.description || undefined,
          kind: p.kind,
        })),
      });
    }

    if (req.method === 'POST') {
      assertSuperAdmin(user);

      const { name, slug, websiteUrl, description, kind } = req.body as LaunchPlatformPayload;

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: 'Name is required',
        });
      }

      const finalSlug = slug || generateSlug(name);

      // Check if slug already exists
      const existing = await withDbRetry(() =>
        prisma.launchPlatform.findUnique({
          where: { slug: finalSlug },
        })
      );

      if (existing) {
        return res.status(400).json({
          ok: false,
          error: 'Platform with this slug already exists',
        });
      }

      const platform = await withDbRetry(() =>
        prisma.launchPlatform.create({
          data: {
            name,
            slug: finalSlug,
            website: websiteUrl || null,
            description: description || null,
            kind: kind || 'LAUNCHPAD',
            createdById: user.id,
          },
        })
      );

      return res.status(201).json({ ok: true, platform: { id: platform.id } });
    }

    if (req.method === 'PUT') {
      assertSuperAdmin(user);

      const { id, name, slug, websiteUrl, description, kind } = req.body as LaunchPlatformPayload & { id: string };

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Platform ID is required',
        });
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (slug) updateData.slug = slug;
      if (websiteUrl !== undefined) updateData.website = websiteUrl || null;
      if (description !== undefined) updateData.description = description || null;
      if (kind) updateData.kind = kind;

      const platform = await withDbRetry(() =>
        prisma.launchPlatform.update({
          where: { id },
          data: updateData,
        })
      );

      return res.status(200).json({ ok: true, platform: { id: platform.id } });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[API /portal/admin/launch-platforms] Error:', error);
    
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

