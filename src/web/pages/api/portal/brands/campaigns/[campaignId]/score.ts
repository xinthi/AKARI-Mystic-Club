/**
 * API Route: /api/portal/brands/campaigns/[campaignId]/score
 *
 * POST: Score a post based on quest guidelines/objectives.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { scoreQuestPost } from '@/lib/arc/quest-scoring';

type Response =
  | { ok: true; scores: any }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  const user = await requirePortalUser(req, res);
  if (!user) return;

  const campaignId = (req.query.campaignId ?? req.query.questId) as string | undefined;
  if (!campaignId) {
    return res.status(400).json({ ok: false, error: 'campaignId is required' });
  }

  const { submissionId, platform, text, usedCampaignLink, brandAttribution, likes, replies, reposts } = req.body || {};

  if (submissionId) {
    const { data: existing } = await supabase
      .from('campaign_submissions')
      .select('alignment_score, compliance_score, clarity_score, safety_score, post_quality_score, post_final_score, score_reason_json')
      .eq('id', submissionId)
      .maybeSingle();
    if (existing?.post_final_score !== null && existing?.post_final_score !== undefined) {
      return res.status(200).json({ ok: true, scores: existing });
    }
  }

  if (!platform || !text) {
    return res.status(400).json({ ok: false, error: 'platform and text are required' });
  }

  const { data: campaign } = await supabase
    .from('brand_campaigns')
    .select('objectives')
    .eq('id', campaignId)
    .maybeSingle();

  const scores = scoreQuestPost({
    text: String(text),
    objectives: campaign?.objectives || null,
    usedCampaignLink: Boolean(usedCampaignLink),
    brandAttribution: Boolean(brandAttribution),
    platform: String(platform).toLowerCase(),
    likes: likes ? Number(likes) : 0,
    replies: replies ? Number(replies) : 0,
    reposts: reposts ? Number(reposts) : 0,
  });

  return res.status(200).json({ ok: true, scores });
}
