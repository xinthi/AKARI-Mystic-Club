/**
 * API Route: POST /api/portal/projects/[id]/upload-header-image
 * 
 * Upload project header image to Supabase Storage
 * Requires project admin/moderator permissions
 * Accepts base64-encoded image in request body
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { checkProjectPermissions } from '@/lib/project-permissions';

type UploadResponse =
  | { ok: true; url: string }
  | { ok: false; error: string };

interface UploadBody {
  image: string; // base64 encoded image data URL
  fileName?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { id: projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, portalUser.userId, projectId);
    const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
    
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to upload images for this project' });
    }

    const body = req.body as UploadBody;
    if (!body.image) {
      return res.status(400).json({ ok: false, error: 'No image data provided' });
    }

    // Parse base64 data URL (format: data:image/png;base64,...)
    const base64Match = body.image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ ok: false, error: 'Invalid image format. Expected base64 data URL.' });
    }

    const fileType = base64Match[1];
    const base64Data = base64Match[2];

    // Validate file type
    const allowedTypes = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    if (!allowedTypes.includes(fileType.toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed' });
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Validate file size (10MB max)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'File size exceeds 10MB limit' });
    }

    const fileExt = fileType === 'jpg' ? 'jpeg' : fileType;
    const fileName = `project-${projectId}-${Date.now()}.${fileExt}`;
    const filePath = `project-headers/${fileName}`;
    const bucketName = 'project-images'; // Bucket name for project header images

    // Check if bucket exists, create if it doesn't
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (!listError && buckets) {
      const bucketExists = buckets.some(b => b.name === bucketName);
      if (!bucketExists) {
        // Create bucket if it doesn't exist
        const { error: createError } = await supabase.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 10485760, // 10MB
        });
        if (createError) {
          console.error('[Project Header Upload] Failed to create bucket:', createError);
          // Continue anyway - might already exist or permission issue
        }
      }
    }

    // Upload to Supabase Storage
    const contentType = `image/${fileExt}`;
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[Project Header Upload] Storage error:', uploadError);
      // If bucket doesn't exist error, provide helpful message
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        return res.status(500).json({ 
          ok: false, 
          error: `Storage bucket '${bucketName}' does not exist. Please create it in Supabase Storage with public access enabled.` 
        });
      }
      return res.status(500).json({ 
        ok: false, 
        error: uploadError.message || 'Failed to upload image. Please check your storage configuration.' 
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    return res.status(200).json({
      ok: true,
      url: publicUrl,
    });
  } catch (error: any) {
    console.error('[Project Header Upload] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Server error' });
  }
}

