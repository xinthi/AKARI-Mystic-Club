/**
 * API Route: GET /api/portal/admin/arc/reports/platform
 * 
 * Platform-wide ARC reports with comprehensive metrics (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/server/require-superadmin';
import { getRequestId, writeArcAudit } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

interface PlatformReportResponse {
  ok: boolean;
  range: {
    from: string;
    to: string;
  };
  totals: {
    projects_active: {
      ms: number;
      gamefi: number;
      crm: number;
    };
    creators: {
      unique: number;
      total_participations: number;
    };
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    revenue: {
      gross: number;
      net: number;
      discounts: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    content: {
      posts: number;
      threads: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  };
  perProject: Array<{
    projectId: string;
    slug: string | null;
    name: string;
    ms: boolean;
    gamefi: boolean;
    crm: boolean;
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    revenue: {
      gross: number;
      net: number;
      discounts: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  }>;
  perCreator: Array<{
    twitter_username: string;
    projectId: string;
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  }>;
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if a date is within the range (considering start/end dates)
 */
function isFeatureActiveInRange(
  enabled: boolean,
  startAt: string | null,
  endAt: string | null,
  fromDate: Date,
  toDate: Date
): boolean {
  if (!enabled) return false;

  // If no dates, consider it always active
  if (!startAt && !endAt) return true;

  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;

  // Check if range overlaps with feature dates
  if (start && start > toDate) return false;
  if (end && end < fromDate) return false;

  return true;
}

// =============================================================================
// API HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlatformReportResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      range: { from: '', to: '' },
      totals: {
        projects_active: { ms: 0, gamefi: 0, crm: 0 },
        creators: { unique: 0, total_participations: 0 },
        utm: { clicks: 0, unique_clicks: 0 },
        revenue: { gross: 0, net: 0, discounts: 0 },
        engagement: { likes: 0, replies: 0, reposts: 0, quotes: 0 },
        content: { posts: 0, threads: 0 },
        views: { total_views: 0, total_impressions: 0 },
      },
      perProject: [],
      perCreator: [],
      error: 'Method not allowed',
    });
  }

  try {
    // SuperAdmin only
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({
        ok: false,
        range: { from: '', to: '' },
        totals: {
          projects_active: { ms: 0, gamefi: 0, crm: 0 },
          creators: { unique: 0, total_participations: 0 },
          utm: { clicks: 0, unique_clicks: 0 },
          revenue: { gross: 0, net: 0, discounts: 0 },
          engagement: { likes: 0, replies: 0, reposts: 0, quotes: 0 },
          content: { posts: 0, threads: 0 },
          views: { total_views: 0, total_impressions: 0 },
        },
        perProject: [],
        perCreator: [],
        error: auth.error,
      });
    }

    const supabase = getSupabaseAdmin();

    // Parse date range (default: last 30 days)
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = req.query.from && typeof req.query.from === 'string'
      ? new Date(req.query.from)
      : defaultFrom;
    const toDate = req.query.to && typeof req.query.to === 'string'
      ? new Date(req.query.to + 'T23:59:59')
      : now;

    const fromISO = fromDate.toISOString();
    const toISO = toDate.toISOString();

    // ========================================================================
    // 1. PROJECTS ACTIVE (from arc_project_features)
    // ========================================================================
    const { data: features, error: featuresError } = await supabase
      .from('arc_project_features')
      .select('project_id, leaderboard_enabled, leaderboard_start_at, leaderboard_end_at, gamefi_enabled, gamefi_start_at, gamefi_end_at, crm_enabled, crm_start_at, crm_end_at')
      .or('leaderboard_enabled.eq.true,gamefi_enabled.eq.true,crm_enabled.eq.true');

    if (featuresError) {
      console.error('[Platform Report] Error fetching features:', featuresError);
    }

    let msCount = 0;
    let gamefiCount = 0;
    let crmCount = 0;
    const activeProjects = new Set<string>();

    (features || []).forEach((f: any) => {
      const projectId = f.project_id;
      activeProjects.add(projectId);

      if (isFeatureActiveInRange(
        f.leaderboard_enabled || false,
        f.leaderboard_start_at,
        f.leaderboard_end_at,
        fromDate,
        toDate
      )) {
        msCount++;
      }

      if (isFeatureActiveInRange(
        f.gamefi_enabled || false,
        f.gamefi_start_at,
        f.gamefi_end_at,
        fromDate,
        toDate
      )) {
        gamefiCount++;
      }

      if (isFeatureActiveInRange(
        f.crm_enabled || false,
        f.crm_start_at,
        f.crm_end_at,
        fromDate,
        toDate
      )) {
        crmCount++;
      }
    });

    // ========================================================================
    // 2. CREATORS (from arc_campaign_participants)
    // ========================================================================
    const { data: participants, error: participantsError } = await supabase
      .from('arc_campaign_participants')
      .select('id, profile_id, twitter_username, campaign_id, joined_at')
      .gte('joined_at', fromISO)
      .lte('joined_at', toISO);

    if (participantsError) {
      console.error('[Platform Report] Error fetching participants:', participantsError);
    }

    const uniqueCreators = new Set<string>();
    (participants || []).forEach((p: any) => {
      if (p.twitter_username) {
        uniqueCreators.add(p.twitter_username);
      }
    });

    // ========================================================================
    // 3. UTM CLICKS (from arc_link_events)
    // ========================================================================
    const { data: linkEvents, error: linkEventsError } = await supabase
      .from('arc_link_events')
      .select('id, campaign_id, participant_id, ts, ip_hash, user_agent_hash')
      .gte('ts', fromISO)
      .lte('ts', toISO);

    if (linkEventsError) {
      console.error('[Platform Report] Error fetching link events:', linkEventsError);
    }

    const clicks = (linkEvents || []).length;
    const uniqueClickers = new Set<string>();
    (linkEvents || []).forEach((e: any) => {
      // Use ip_hash + user_agent_hash as unique identifier
      const visitorKey = `${e.ip_hash || ''}_${e.user_agent_hash || ''}`;
      if (visitorKey.trim()) {
        uniqueClickers.add(visitorKey);
      }
    });

    // ========================================================================
    // 4. REVENUE (from arc_billing_records)
    // ========================================================================
    const { data: billingRecords, error: billingError } = await supabase
      .from('arc_billing_records')
      .select('project_id, base_price_usd, final_price_usd')
      .gte('created_at', fromISO)
      .lte('created_at', toISO);

    if (billingError) {
      console.error('[Platform Report] Error fetching billing:', billingError);
    }

    let grossRevenue = 0;
    let netRevenue = 0;
    (billingRecords || []).forEach((b: any) => {
      grossRevenue += parseFloat(b.base_price_usd) || 0;
      netRevenue += parseFloat(b.final_price_usd) || 0;
    });
    const discountsRevenue = grossRevenue - netRevenue;

    // ========================================================================
    // 5. ENGAGEMENT / CONTENT / VIEWS
    // TODO: Join with engagement/content/views tables when they exist
    // For now, return 0 but keep fields in response
    // ========================================================================

    // ========================================================================
    // 6. PER-PROJECT BREAKDOWN
    // ========================================================================
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, slug')
      .in('id', Array.from(activeProjects));

    if (projectsError) {
      console.error('[Platform Report] Error fetching projects:', projectsError);
    }

    const perProjectData: PlatformReportResponse['perProject'] = [];

    for (const project of (projects || [])) {
      const projectId = project.id;
      const projectFeatures = (features || []).find((f: any) => f.project_id === projectId);

      // UTM clicks for this project (via campaigns)
      const { data: projectCampaigns } = await supabase
        .from('arc_campaigns')
        .select('id')
        .eq('project_id', projectId);

      const campaignIds = (projectCampaigns || []).map((c: any) => c.id);
      const projectLinkEvents = (linkEvents || []).filter((e: any) =>
        campaignIds.includes(e.campaign_id)
      );

      const projectClicks = projectLinkEvents.length;
      const projectUniqueClickers = new Set<string>();
      projectLinkEvents.forEach((e: any) => {
        const visitorKey = `${e.ip_hash || ''}_${e.user_agent_hash || ''}`;
        if (visitorKey.trim()) {
          projectUniqueClickers.add(visitorKey);
        }
      });

      // Revenue for this project
      const projectBilling = (billingRecords || []).filter((b: any) => b.project_id === projectId);
      let projectGross = 0;
      let projectNet = 0;
      projectBilling.forEach((b: any) => {
        projectGross += parseFloat(b.base_price_usd) || 0;
        projectNet += parseFloat(b.final_price_usd) || 0;
      });

      perProjectData.push({
        projectId,
        slug: project.slug,
        name: project.name,
        ms: isFeatureActiveInRange(
          projectFeatures?.leaderboard_enabled || false,
          projectFeatures?.leaderboard_start_at,
          projectFeatures?.leaderboard_end_at,
          fromDate,
          toDate
        ),
        gamefi: isFeatureActiveInRange(
          projectFeatures?.gamefi_enabled || false,
          projectFeatures?.gamefi_start_at,
          projectFeatures?.gamefi_end_at,
          fromDate,
          toDate
        ),
        crm: isFeatureActiveInRange(
          projectFeatures?.crm_enabled || false,
          projectFeatures?.crm_start_at,
          projectFeatures?.crm_end_at,
          fromDate,
          toDate
        ),
        utm: {
          clicks: projectClicks,
          unique_clicks: projectUniqueClickers.size,
        },
        revenue: {
          gross: projectGross,
          net: projectNet,
          discounts: projectGross - projectNet,
        },
        engagement: {
          likes: 0,
          replies: 0,
          reposts: 0,
          quotes: 0,
        },
        views: {
          total_views: 0,
          total_impressions: 0,
        },
      });
    }

    // ========================================================================
    // 7. PER-CREATOR BREAKDOWN
    // ========================================================================
    const perCreatorData: PlatformReportResponse['perCreator'] = [];
    const creatorMap = new Map<string, { username: string; projectId: string }>();

    // Map participants to projects via campaigns
    for (const participant of (participants || [])) {
      const { data: campaign } = await supabase
        .from('arc_campaigns')
        .select('project_id')
        .eq('id', participant.campaign_id)
        .single();

      if (campaign && participant.twitter_username) {
        const key = `${participant.twitter_username}_${campaign.project_id}`;
        if (!creatorMap.has(key)) {
          creatorMap.set(key, {
            username: participant.twitter_username,
            projectId: campaign.project_id,
          });
        }
      }
    }

    // Get all unique project IDs for creators
    const creatorProjectIds = Array.from(new Set(Array.from(creatorMap.values()).map(c => c.projectId)));
    const { data: creatorProjects } = await supabase
      .from('projects')
      .select('id, name, slug')
      .in('id', creatorProjectIds);

    const projectMap = new Map<string, { name: string; slug: string | null }>();
    (creatorProjects || []).forEach((p: any) => {
      projectMap.set(p.id, { name: p.name, slug: p.slug });
    });

    for (const [key, creator] of creatorMap.entries()) {
      // Get participant IDs for this creator in this project
      const creatorParticipants = (participants || []).filter(
        (p: any) => p.twitter_username === creator.username
      );

      // Get campaigns for this project to filter participants
      const { data: projectCampaigns } = await supabase
        .from('arc_campaigns')
        .select('id')
        .eq('project_id', creator.projectId);

      const projectCampaignIds = (projectCampaigns || []).map((c: any) => c.id);
      const relevantParticipants = creatorParticipants.filter((p: any) =>
        projectCampaignIds.includes(p.campaign_id)
      );
      const participantIds = relevantParticipants.map((p: any) => p.id);

      // UTM clicks for this creator
      const creatorLinkEvents = (linkEvents || []).filter((e: any) =>
        participantIds.includes(e.participant_id)
      );

      const creatorClicks = creatorLinkEvents.length;
      const creatorUniqueClickers = new Set<string>();
      creatorLinkEvents.forEach((e: any) => {
        const visitorKey = `${e.ip_hash || ''}_${e.user_agent_hash || ''}`;
        if (visitorKey.trim()) {
          creatorUniqueClickers.add(visitorKey);
        }
      });

      perCreatorData.push({
        twitter_username: creator.username,
        projectId: creator.projectId,
        utm: {
          clicks: creatorClicks,
          unique_clicks: creatorUniqueClickers.size,
        },
        engagement: {
          likes: 0,
          replies: 0,
          reposts: 0,
          quotes: 0,
        },
        views: {
          total_views: 0,
          total_impressions: 0,
        },
      });
    }

    // ========================================================================
    // 8. BUILD RESPONSE
    // ========================================================================
    const response: PlatformReportResponse = {
      ok: true,
      range: {
        from: fromISO,
        to: toISO,
      },
      totals: {
        projects_active: {
          ms: msCount,
          gamefi: gamefiCount,
          crm: crmCount,
        },
        creators: {
          unique: uniqueCreators.size,
          total_participations: (participants || []).length,
        },
        utm: {
          clicks,
          unique_clicks: uniqueClickers.size,
        },
        revenue: {
          gross: grossRevenue,
          net: netRevenue,
          discounts: discountsRevenue,
        },
        engagement: {
          likes: 0,
          replies: 0,
          reposts: 0,
          quotes: 0,
        },
        content: {
          posts: 0,
          threads: 0,
        },
        views: {
          total_views: 0,
          total_impressions: 0,
        },
      },
      perProject: perProjectData,
      perCreator: perCreatorData,
    };

    // ========================================================================
    // 9. AUDIT LOG
    // ========================================================================
    const requestId = getRequestId(req);
    await writeArcAudit(supabase, {
      actorProfileId: auth.profileId,
      projectId: null,
      entityType: 'report',
      entityId: null,
      action: 'report_viewed',
      success: true,
      message: 'Platform report viewed',
      requestId,
      metadata: {
        from: fromISO,
        to: toISO,
        report: 'platform',
      },
    });

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[Platform Report] Unexpected error:', err);

    // Log audit for failure
    try {
      const supabase = getSupabaseAdmin();
      const requestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: null,
        projectId: null,
        entityType: 'report',
        entityId: null,
        action: 'report_viewed',
        success: false,
        message: err.message || 'Failed to generate platform report',
        requestId,
        metadata: {
          error: err.message,
          report: 'platform',
        },
      });
    } catch (auditErr) {
      // Ignore audit errors
    }

    return res.status(500).json({
      ok: false,
      range: { from: '', to: '' },
      totals: {
        projects_active: { ms: 0, gamefi: 0, crm: 0 },
        creators: { unique: 0, total_participations: 0 },
        utm: { clicks: 0, unique_clicks: 0 },
        revenue: { gross: 0, net: 0, discounts: 0 },
        engagement: { likes: 0, replies: 0, reposts: 0, quotes: 0 },
        content: { posts: 0, threads: 0 },
        views: { total_views: 0, total_impressions: 0 },
      },
      perProject: [],
      perCreator: [],
      error: 'Internal server error',
    });
  }
}
