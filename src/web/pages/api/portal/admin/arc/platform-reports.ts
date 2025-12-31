/**
 * API Route: GET /api/portal/admin/arc/platform-reports
 * 
 * Comprehensive platform-level reports for SuperAdmin
 * Includes aggregate metrics, financial ratios, cost/revenue metrics
 * 
 * Query Parameters:
 * - timeRange: '7d' | '30d' | 'custom'
 * - startDate: ISO date string (required if timeRange='custom')
 * - endDate: ISO date string (required if timeRange='custom')
 * 
 * ⚠️ CONFIDENTIAL - SuperAdmin Only ⚠️
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface PlatformReport {
  timeRange: {
    type: '7d' | '30d' | 'custom';
    startDate: string;
    endDate: string;
  };
  
  // Aggregate Metrics
  aggregate: {
    projects: {
      totalActive: number;
      mindshare: number;        // Option 2
      gamified: number;         // Option 3
      crm: number;              // Option 1
    };
    creators: {
      unique: number;            // Unique creators/KOLs
      totalParticipations: number;  // Total participations across all projects
    };
    engagement: {
      totalLikes: number;
      totalReplies: number;
      totalReposts: number;
      totalQuotes: number;
      totalEngagement: number;  // Sum of all above
    };
    content: {
      totalPosts: number;
      totalThreads: number;
      totalContent: number;     // Posts + threads
    };
    utm: {
      totalClicks: number;
      uniqueClicks: number;      // Unique users who clicked
    };
    platform: {
      totalViews: number;       // Combined views across all projects
      totalImpressions: number; // Combined impressions
      viewsPerProject: Array<{
        projectId: string;
        projectName: string;
        projectSlug: string | null;
        views: number;
        impressions: number;
      }>;
      viewsPerCreator: Array<{
        creatorId: string;
        creatorUsername: string;
        views: number;
        impressions: number;
      }>;
    };
  };
  
  // Financial Metrics
  financial: {
    revenue: {
      gross: number;            // Total revenue before discounts
      net: number;              // Revenue after discounts
      discountsTotal: number;   // Total discount amount
      discountRate: number;     // Average discount percentage
    };
    mrr: {
      mindshare: number;        // Monthly recurring revenue for MS
      gamified: number;         // MRR for GameFi
      crm: number;              // MRR for CRM
      total: number;
    };
    byAccessLevel: {
      leaderboard: {
        revenue: number;
        projects: number;
      };
      gamified: {
        revenue: number;
        projects: number;
      };
      creator_manager: {
        revenue: number;
        projects: number;
      };
    };
  };
  
  // Financial Ratios (Platform Level)
  ratios: {
    revenuePerCreator: number;
    revenuePer1000Views: number;  // RPM-style
    costPerParticipation: number; // CPP
    costPerUniqueCreator: number; // CPU-Creator
    engagementToSpendRatio: number;
    viewsToSpendRatio: number;
  };
  
  // Cost Metrics
  costs: {
    cpv: number;                // Cost per View
    cpe: number;                // Cost per Engagement
  };
}

type PlatformReportResponse =
  | { ok: true; report: PlatformReport }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const sessionCookie = cookies.find(c => c.startsWith('akari_session='));
  return sessionCookie?.split('=')[1] || null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

function getDateRange(timeRange: string, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  if (timeRange === '7d') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (timeRange === '30d') {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  } else if (timeRange === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    // Default to 30d if invalid
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  }

  return { start, end };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlatformReportResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const supabase = getSupabaseAdmin();

    // Get time range
    const { timeRange = '30d', startDate, endDate } = req.query;
    const { start, end } = getDateRange(
      timeRange as string,
      startDate as string,
      endDate as string
    );

    const timeRangeType = (timeRange === 'custom' ? 'custom' : timeRange === '7d' ? '7d' : '30d') as '7d' | '30d' | 'custom';

    console.log(`[Platform Reports API] Generating report for ${timeRangeType}: ${start.toISOString()} to ${end.toISOString()}`);

    // =========================================================================
    // 1. GET APPROVED PROJECTS BY TYPE
    // =========================================================================
    
    // Get all approved projects
    const { data: approvedAccess } = await supabase
      .from('arc_project_access')
      .select('project_id')
      .eq('application_status', 'approved');

    const approvedProjectIds = new Set((approvedAccess || []).map((a: any) => a.project_id));

    // Get legacy projects (for backward compatibility)
    const { data: legacyProjects } = await supabase
      .from('projects')
      .select('id, arc_active, arc_access_level')
      .eq('arc_active', true)
      .neq('arc_access_level', 'none');

    if (legacyProjects) {
      for (const project of legacyProjects) {
        approvedProjectIds.add(project.id);
      }
    }

    const allProjectIds = Array.from(approvedProjectIds);

    // Get project features to determine type
    const { data: projectFeatures } = await supabase
      .from('arc_project_features')
      .select('project_id, option1_crm_unlocked, option2_normal_unlocked, option3_gamified_unlocked')
      .in('project_id', allProjectIds);

    // Also check legacy arc_access_level
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, slug, arc_access_level')
      .in('id', allProjectIds);

    const projectMap = new Map(projects?.map((p: any) => [p.id, p]) || []);
    const featuresMap = new Map(projectFeatures?.map((f: any) => [f.project_id, f]) || []);

    // Categorize projects
    const mindshareProjects = new Set<string>();
    const gamifiedProjects = new Set<string>();
    const crmProjects = new Set<string>();

    for (const projectId of allProjectIds) {
      const features = featuresMap.get(projectId);
      const project = projectMap.get(projectId);

      if (features) {
        if (features.option2_normal_unlocked && !features.option3_gamified_unlocked) {
          mindshareProjects.add(projectId);
        }
        if (features.option3_gamified_unlocked) {
          gamifiedProjects.add(projectId);
        }
        if (features.option1_crm_unlocked) {
          crmProjects.add(projectId);
        }
      } else if (project) {
        // Legacy fallback
        if (project.arc_access_level === 'leaderboard') {
          mindshareProjects.add(projectId);
        } else if (project.arc_access_level === 'gamified') {
          gamifiedProjects.add(projectId);
        } else if (project.arc_access_level === 'creator_manager') {
          crmProjects.add(projectId);
        }
      }
    }

    // =========================================================================
    // 2. GET CREATORS/KOLs PARTICIPATION
    // =========================================================================

    // Get unique creators from arena_creators
    const { data: arenaCreators } = await supabase
      .from('arena_creators')
      .select('profile_id, twitter_username, arena_id, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Get unique creators from campaign participants
    const { data: campaignParticipants } = await supabase
      .from('arc_campaign_participants')
      .select('profile_id, campaign_id, created_at')
      .in('status', ['accepted', 'tracked'])
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Get unique creators from creator_manager_program_creators
    const { data: programCreators } = await supabase
      .from('creator_manager_program_creators')
      .select('profile_id, program_id, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const uniqueCreators = new Set<string>();
    const creatorParticipations: Array<{ creatorId: string; projectId: string }> = [];

    // Get all arenas with project_ids (batch query)
    const arenaIds = [...new Set(arenaCreators?.map(c => c.arena_id).filter(Boolean) || [])];
    const { data: arenas } = arenaIds.length > 0 ? await supabase
      .from('arenas')
      .select('id, project_id')
      .in('id', arenaIds) : { data: null };

    const arenaProjectMap = new Map((arenas || []).map((a: any) => [a.id, a.project_id]));

    // Get all campaigns with project_ids (batch query)
    const campaignIds = [...new Set(campaignParticipants?.map(p => p.campaign_id).filter(Boolean) || [])];
    const { data: campaigns } = campaignIds.length > 0 ? await supabase
      .from('arc_campaigns')
      .select('id, project_id')
      .in('id', campaignIds) : { data: null };

    const campaignProjectMap = new Map((campaigns || []).map((c: any) => [c.id, c.project_id]));

    // Get all programs with project_ids (batch query)
    const programIds = [...new Set(programCreators?.map(c => c.program_id).filter(Boolean) || [])];
    const { data: programs } = programIds.length > 0 ? await supabase
      .from('creator_manager_programs')
      .select('id, project_id')
      .in('id', programIds) : { data: null };

    const programProjectMap = new Map((programs || []).map((p: any) => [p.id, p.project_id]));

    // Process arena creators
    if (arenaCreators) {
      for (const creator of arenaCreators) {
        if (creator.profile_id) {
          uniqueCreators.add(creator.profile_id);
          const projectId = arenaProjectMap.get(creator.arena_id);
          if (projectId) {
            creatorParticipations.push({ creatorId: creator.profile_id, projectId });
          }
        }
      }
    }

    // Process campaign participants
    if (campaignParticipants) {
      for (const participant of campaignParticipants) {
        if (participant.profile_id) {
          uniqueCreators.add(participant.profile_id);
          const projectId = campaignProjectMap.get(participant.campaign_id);
          if (projectId) {
            creatorParticipations.push({ creatorId: participant.profile_id, projectId });
          }
        }
      }
    }

    // Process program creators
    if (programCreators) {
      for (const creator of programCreators) {
        if (creator.profile_id) {
          uniqueCreators.add(creator.profile_id);
          const projectId = programProjectMap.get(creator.program_id);
          if (projectId) {
            creatorParticipations.push({ creatorId: creator.profile_id, projectId });
          }
        }
      }
    }

    // =========================================================================
    // 3. GET ENGAGEMENT DATA
    // =========================================================================

    // Get engagement from user_ct_activity (within time range)
    const { data: ctActivity } = await supabase
      .from('user_ct_activity')
      .select('likes, replies, retweets, quotes, created_at, project_id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .in('project_id', allProjectIds);

    let totalLikes = 0;
    let totalReplies = 0;
    let totalReposts = 0;
    let totalQuotes = 0;

    if (ctActivity) {
      for (const activity of ctActivity) {
        totalLikes += Number(activity.likes || 0);
        totalReplies += Number(activity.replies || 0);
        totalReposts += Number(activity.retweets || 0);
        totalQuotes += Number(activity.quotes || 0);
      }
    }

    // =========================================================================
    // 4. GET CONTENT VOLUME
    // =========================================================================

    // Get posts from project_tweets (within time range)
    const { data: projectTweets } = await supabase
      .from('project_tweets')
      .select('id, text, is_thread, created_at, project_id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .in('project_id', allProjectIds);

    let totalPosts = 0;
    let totalThreads = 0;

    if (projectTweets) {
      for (const tweet of projectTweets) {
        if (tweet.is_thread) {
          totalThreads++;
        } else {
          totalPosts++;
        }
      }
    }

    // =========================================================================
    // 5. GET UTM CLICKS
    // =========================================================================

    // Get UTM clicks from creator_manager_link_clicks
    const { data: utmClicks } = await supabase
      .from('creator_manager_link_clicks')
      .select('id, creator_profile_id, clicked_at')
      .gte('clicked_at', start.toISOString())
      .lte('clicked_at', end.toISOString());

    const totalClicks = utmClicks?.length || 0;
    const uniqueClickers = new Set(utmClicks?.map(c => c.creator_profile_id).filter(Boolean) || []);
    const uniqueClicks = uniqueClickers.size;

    // =========================================================================
    // 6. GET VIEWS/IMPRESSIONS (if available)
    // =========================================================================

    // Note: Views/impressions tracking may need to be implemented
    // For now, we'll use project_refresh_state as a proxy for views
    const { data: refreshStates } = await supabase
      .from('project_refresh_state')
      .select('project_id, last_manual_view_at, interest_score')
      .in('project_id', allProjectIds)
      .gte('last_manual_view_at', start.toISOString())
      .lte('last_manual_view_at', end.toISOString());

    // Count views per project (using refresh_state as proxy)
    const projectViewsMap = new Map<string, number>();
    if (refreshStates) {
      for (const state of refreshStates) {
        const current = projectViewsMap.get(state.project_id) || 0;
        projectViewsMap.set(state.project_id, current + 1);
      }
    }

    // Build views per project
    const viewsPerProject = Array.from(projectViewsMap.entries()).map(([projectId, views]) => {
      const project = projectMap.get(projectId);
      return {
        projectId,
        projectName: project?.name || 'Unknown',
        projectSlug: project?.slug || null,
        views,
        impressions: views * 1.5, // Estimate: 1.5x impressions per view
      };
    });

    const totalViews = Array.from(projectViewsMap.values()).reduce((sum, v) => sum + v, 0);
    const totalImpressions = totalViews * 1.5; // Estimate

    // Views per creator (simplified - would need creator view tracking)
    const viewsPerCreator: PlatformReport['aggregate']['platform']['viewsPerCreator'] = [];

    // =========================================================================
    // 7. GET FINANCIAL DATA
    // =========================================================================

    // Get billing records within time range
    const { data: billingRecords } = await supabase
      .from('arc_billing_records')
      .select('final_price_usd, base_price_usd, discount_percent, access_level, created_at, payment_status')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    let grossRevenue = 0;
    let netRevenue = 0;
    let discountsTotal = 0;
    const revenueByLevel: Record<string, number> = {
      leaderboard: 0,
      gamified: 0,
      creator_manager: 0,
    };
    const projectsByLevel: Record<string, Set<string>> = {
      leaderboard: new Set(),
      gamified: new Set(),
      creator_manager: new Set(),
    };

    // Get all request_ids from billing records (batch query)
    const requestIds = [...new Set(billingRecords?.map((r: any) => r.request_id).filter(Boolean) || [])];
    const { data: requests } = requestIds.length > 0 ? await supabase
      .from('arc_leaderboard_requests')
      .select('id, project_id')
      .in('id', requestIds) : { data: null };

    const requestProjectMap = new Map((requests || []).map((r: any) => [r.id, r.project_id]));

    if (billingRecords) {
      for (const record of billingRecords) {
        const basePrice = Number(record.base_price_usd || 0);
        const finalPrice = Number(record.final_price_usd || 0);
        const discount = basePrice - finalPrice;

        grossRevenue += basePrice;
        netRevenue += finalPrice;
        discountsTotal += discount;

        if (record.access_level) {
          revenueByLevel[record.access_level] = (revenueByLevel[record.access_level] || 0) + finalPrice;
          
          // Get project_id from request map
          const projectId = requestProjectMap.get((record as any).request_id);
          if (projectId) {
            projectsByLevel[record.access_level].add(projectId);
          }
        }
      }
    }

    // Calculate MRR (Monthly Recurring Revenue)
    // For now, use current month's revenue as MRR estimate
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data: monthlyBilling } = await supabase
      .from('arc_billing_records')
      .select('final_price_usd, access_level')
      .gte('created_at', startOfMonth.toISOString())
      .eq('payment_status', 'paid');

    const mrrByLevel: Record<string, number> = {
      leaderboard: 0,
      gamified: 0,
      creator_manager: 0,
    };

    if (monthlyBilling) {
      for (const record of monthlyBilling) {
        const price = Number(record.final_price_usd || 0);
        if (record.access_level) {
          mrrByLevel[record.access_level] = (mrrByLevel[record.access_level] || 0) + price;
        }
      }
    }

    const mrrMindshare = mrrByLevel.leaderboard;
    const mrrGamified = mrrByLevel.gamified;
    const mrrCrm = mrrByLevel.creator_manager;
    const mrrTotal = mrrMindshare + mrrGamified + mrrCrm;

    const discountRate = grossRevenue > 0 ? (discountsTotal / grossRevenue) * 100 : 0;

    // =========================================================================
    // 8. CALCULATE FINANCIAL RATIOS
    // =========================================================================

    const uniqueCreatorsCount = uniqueCreators.size;
    const totalParticipations = creatorParticipations.length;
    const totalEngagement = totalLikes + totalReplies + totalReposts + totalQuotes;

    const revenuePerCreator = uniqueCreatorsCount > 0 ? netRevenue / uniqueCreatorsCount : 0;
    const revenuePer1000Views = totalViews > 0 ? (netRevenue / totalViews) * 1000 : 0;
    const costPerParticipation = totalParticipations > 0 ? netRevenue / totalParticipations : 0;
    const costPerUniqueCreator = uniqueCreatorsCount > 0 ? netRevenue / uniqueCreatorsCount : 0;
    const engagementToSpendRatio = netRevenue > 0 ? totalEngagement / netRevenue : 0;
    const viewsToSpendRatio = netRevenue > 0 ? totalViews / netRevenue : 0;

    // =========================================================================
    // 9. CALCULATE COST METRICS
    // =========================================================================

    const cpv = totalViews > 0 ? netRevenue / totalViews : 0; // Cost per View
    const cpe = totalEngagement > 0 ? netRevenue / totalEngagement : 0; // Cost per Engagement

    // =========================================================================
    // 10. BUILD REPORT
    // =========================================================================

    const report: PlatformReport = {
      timeRange: {
        type: timeRangeType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      aggregate: {
        projects: {
          totalActive: allProjectIds.length,
          mindshare: mindshareProjects.size,
          gamified: gamifiedProjects.size,
          crm: crmProjects.size,
        },
        creators: {
          unique: uniqueCreatorsCount,
          totalParticipations,
        },
        engagement: {
          totalLikes,
          totalReplies,
          totalReposts,
          totalQuotes,
          totalEngagement,
        },
        content: {
          totalPosts,
          totalThreads,
          totalContent: totalPosts + totalThreads,
        },
        utm: {
          totalClicks,
          uniqueClicks,
        },
        platform: {
          totalViews,
          totalImpressions,
          viewsPerProject,
          viewsPerCreator,
        },
      },
      financial: {
        revenue: {
          gross: grossRevenue,
          net: netRevenue,
          discountsTotal,
          discountRate,
        },
        mrr: {
          mindshare: mrrMindshare,
          gamified: mrrGamified,
          crm: mrrCrm,
          total: mrrTotal,
        },
        byAccessLevel: {
          leaderboard: {
            revenue: revenueByLevel.leaderboard,
            projects: projectsByLevel.leaderboard.size,
          },
          gamified: {
            revenue: revenueByLevel.gamified,
            projects: projectsByLevel.gamified.size,
          },
          creator_manager: {
            revenue: revenueByLevel.creator_manager,
            projects: projectsByLevel.creator_manager.size,
          },
        },
      },
      ratios: {
        revenuePerCreator,
        revenuePer1000Views,
        costPerParticipation,
        costPerUniqueCreator,
        engagementToSpendRatio,
        viewsToSpendRatio,
      },
      costs: {
        cpv,
        cpe,
      },
    };

    console.log(`[Platform Reports API] Report generated:`, {
      projects: report.aggregate.projects.totalActive,
      creators: report.aggregate.creators.unique,
      engagement: report.aggregate.engagement.totalEngagement,
      revenue: report.financial.revenue.net,
    });

    return res.status(200).json({ ok: true, report });
  } catch (error: any) {
    console.error('[Platform Reports API] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Server error' });
  }
}
