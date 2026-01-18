/**
 * API Route: /api/portal/brands
 *
 * GET: List brands (owned by user)
 * POST: Create brand
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { taioGetUserInfo } from '@/server/twitterapiio';
import { resolveProfileId } from '@/lib/arc/resolveProfileId';

type Brand = {
  id: string;
  name: string;
  x_handle: string | null;
  website: string | null;
  logo_url: string | null;
  brief_text: string | null;
};

type Response =
  | { ok: true; brands: Brand[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brand_profiles')
      .select('id, name, x_handle, website, logo_url, brief_text')
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load brands' });
    }

    return res.status(200).json({ ok: true, brands: data || [] });
  }

  if (req.method === 'POST') {
    const {
      name,
      xHandle,
      website,
      tgCommunity,
      tgChannel,
      briefText,
      logoImage,
      bannerImage,
      logoUrl,
      bannerUrl,
    } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'Brand name is required' });
    }
    if (!xHandle || typeof xHandle !== 'string') {
      return res.status(400).json({ ok: false, error: 'X handle is required' });
    }

    const cleanHandle = xHandle.replace(/^@+/, '').trim().toLowerCase();
    if (!cleanHandle) {
      return res.status(400).json({ ok: false, error: 'X handle is required' });
    }

    const xProfile = await taioGetUserInfo(cleanHandle);
    if (!xProfile) {
      return res.status(400).json({ ok: false, error: 'X handle not found' });
    }

    const initialLogoUrl = typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null;
    const initialBannerUrl = typeof bannerUrl === 'string' && bannerUrl.trim() ? bannerUrl.trim() : null;

    const { data, error } = await supabase
      .from('brand_profiles')
      .insert({
        owner_user_id: user.userId,
        name: name.trim(),
        x_handle: cleanHandle,
        website: website ? String(website).trim() : null,
        tg_community: tgCommunity ? String(tgCommunity).trim() : null,
        tg_channel: tgChannel ? String(tgChannel).trim() : null,
        brief_text: briefText ? String(briefText).trim() : null,
        logo_url: initialLogoUrl || xProfile.profileImageUrl || null,
        banner_url: initialBannerUrl || null,
        verification_status: 'pending',
        verification_requested_at: new Date().toISOString(),
      })
      .select('id, name, x_handle, website, logo_url, banner_url, brief_text')
      .single();

    if (error || !data) {
      return res.status(500).json({ ok: false, error: 'Failed to create brand' });
    }

    const ownerProfileId = await resolveProfileId(supabase, user.userId);
    if (ownerProfileId) {
      await supabase
        .from('brand_members')
        .upsert(
          { brand_id: data.id, profile_id: ownerProfileId },
          { onConflict: 'brand_id,profile_id' }
        );
    }

    const uploadImage = async (image: string, filePrefix: string) => {
      const base64Match = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!base64Match) {
        throw new Error('Invalid image format. Expected base64 data URL.');
      }

      const fileType = base64Match[1];
      const base64Data = base64Match[2];
      const allowedTypes = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
      if (!allowedTypes.includes(fileType.toLowerCase())) {
        throw new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed');
      }

      const fileBuffer = Buffer.from(base64Data, 'base64');
      if (fileBuffer.length > 10 * 1024 * 1024) {
        throw new Error('File size exceeds 10MB limit');
      }

      const fileExt = fileType === 'jpg' ? 'jpeg' : fileType;
      const fileName = `${filePrefix}-${data.id}-${Date.now()}.${fileExt}`;
      const filePath = `brand-assets/${fileName}`;
      const bucketName = 'brand-assets';

      const { data: buckets } = await supabase.storage.listBuckets();
      if (buckets && !buckets.some((b) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 10485760,
        });
      }

      const contentType = `image/${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBuffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload image');
      }

      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    };

    const updates: Record<string, string> = {};
    try {
      if (!initialLogoUrl && logoImage) {
        updates.logo_url = await uploadImage(String(logoImage), 'logo');
      }
      if (!initialBannerUrl && bannerImage) {
        updates.banner_url = await uploadImage(String(bannerImage), 'banner');
      }
    } catch (uploadError: any) {
      return res.status(400).json({ ok: false, error: uploadError.message || 'Failed to upload images' });
    }

    if (Object.keys(updates).length > 0) {
      const { data: updated } = await supabase
        .from('brand_profiles')
        .update(updates)
        .eq('id', data.id)
        .select('id, name, x_handle, website, logo_url, banner_url, brief_text')
        .single();
      return res.status(200).json({ ok: true, brands: [updated || data] });
    }

    return res.status(200).json({ ok: true, brands: [data] });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
