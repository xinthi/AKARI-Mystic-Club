/**
 * ARC Project Page (v1)
 * 
 * Project detail page for ARC projects with leaderboard or gamified access levels
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  display_name: string | null;
  twitter_username: string | null;
  x_handle: string | null;
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
  slug: string | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getTierLabel(arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null): string {
  switch (arcAccessLevel) {
    case 'gamified':
      return 'Gamified';
    case 'leaderboard':
      return 'Leaderboard';
    case 'creator_manager':
      return 'Creator Manager';
    case 'none':
    default:
      return 'None';
  }
}

function getTierBadgeColor(arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null): string {
  switch (arcAccessLevel) {
    case 'gamified':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'leaderboard':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'creator_manager':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'none':
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
}

function getStatusBadgeColor(arcActive: boolean | undefined | null): string {
  if (arcActive === true) {
    return 'bg-green-500/20 text-green-400 border-green-500/50';
  }
  return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project by ID or slug
  useEffect(() => {
    async function fetchProject() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let supabase;
        try {
          supabase = createPortalClient();
        } catch (configError: any) {
          console.error('[ArcProjectPage] Supabase configuration error:', configError);
          setError('Server configuration error. Please contact support.');
          setLoading(false);
          return;
        }

        // Try to find project by ID first, then by slug
        // Support both UUID and slug identifiers
        let projectData: any = null;
        let projectError: any = null;

        // Try ID first (UUID format)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
        
        if (isUUID) {
          const { data, error } = await supabase
            .from('projects')
            .select('id, name, display_name, twitter_username, x_handle, avatar_url, arc_access_level, arc_active, slug')
            .eq('id', projectId)
            .single();
          projectData = data;
          projectError = error;
        } else {
          // Try slug
          const { data, error } = await supabase
            .from('projects')
            .select('id, name, display_name, twitter_username, x_handle, avatar_url, arc_access_level, arc_active, slug')
            .eq('slug', projectId)
            .single();
          projectData = data;
          projectError = error;
        }

        // Handle "not found" error gracefully (PGRST116 is the code for no rows)
        if (projectError) {
          if (projectError.code === 'PGRST116') {
            setError('Project not found');
            setLoading(false);
            return;
          }
          // Other errors - log but don't crash
          console.error('[ArcProjectPage] Supabase error:', projectError);
          setError('Failed to load project');
          setLoading(false);
          return;
        }

        if (!projectData) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        // Normalize twitter_username (use x_handle if twitter_username is null)
        const normalizedProject = {
          ...projectData,
          twitter_username: projectData.twitter_username || projectData.x_handle || null,
        };

        setProject(normalizedProject as Project);
      } catch (err: any) {
        // Never crash - show error state instead
        console.error('[ArcProjectPage] Fetch error:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  // Loading state
  if (loading) {
    return (
      <PortalLayout title="ARC Project">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-akari-muted">Loading project...</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Render page even if project not found - show error message but don't crash
  // This ensures the page never errors if data is missing

  // Safe data access - never error if data missing
  const displayName = project?.display_name || project?.name || 'Unknown Project';
  const twitterHandle = project?.twitter_username || project?.x_handle || null;
  const arcAccessLevel = project?.arc_access_level || 'none';
  const arcActive = project?.arc_active ?? false;
  const tierLabel = getTierLabel(arcAccessLevel);
  const tierBadgeColor = getTierBadgeColor(arcAccessLevel);
  const statusBadgeColor = getStatusBadgeColor(arcActive);
  const statusLabel = arcActive ? 'Active' : 'Inactive';

  return (
    <PortalLayout title={displayName}>
      <div className="space-y-6">
        {/* Error Message (if any) */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
            <Link
              href="/portal/arc"
              className="text-red-400 hover:text-red-300 text-sm underline mt-2 inline-block"
            >
              Back to ARC Home
            </Link>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white/80">Project</span>
          <span>/</span>
          <span className="text-white/80">{displayName}</span>
        </div>

        {/* Project Header */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-start gap-4">
            {project?.avatar_url && (
              <img
                src={project.avatar_url}
                alt={displayName}
                className="w-16 h-16 rounded-full border-2 border-white/10 flex-shrink-0"
                onError={(e) => {
                  // Hide image if it fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-white mb-2">{displayName}</h1>
              {twitterHandle && (
                <p className="text-white/60 mb-4">@{twitterHandle}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {/* ARC Tier Badge */}
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${tierBadgeColor}`}>
                  {tierLabel}
                </span>
                {/* Active/Inactive Status Badge */}
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${statusBadgeColor}`}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Overview Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Overview</h2>
          <p className="text-white/70">
            This project participates in the AKARI ARC InfluenceFi system.
          </p>
        </div>

        {/* Access Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Access</h2>
          {arcAccessLevel === 'creator_manager' ? (
            <div className="space-y-4">
              <p className="text-white/70 mb-4">
                This project uses Creator Manager for campaign management.
              </p>
              <Link
                href={`/portal/arc/creator-manager?projectId=${project?.slug || project?.id || projectId || ''}`}
                className="inline-flex items-center px-4 py-2 bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors font-medium"
              >
                View Creator Manager
              </Link>
            </div>
          ) : arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-white mb-2">Leaderboard Coming Soon</h3>
                <p className="text-white/60 text-sm">
                  The leaderboard for this project is currently under development. Check back soon!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-white/60">
                This project does not have ARC access enabled.
              </p>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

