/**
 * ARC Project Page (Placeholder)
 * 
 * Placeholder page for projects with leaderboard or gamified ARC access levels
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
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
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

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project by ID
  useEffect(() => {
    async function fetchProject() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const supabase = createPortalClient();

        // Find project by ID
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, name, display_name, twitter_username, avatar_url, arc_access_level')
          .eq('id', projectId)
          .single();

        if (projectError || !projectData) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        setProject(projectData as Project);
      } catch (err: any) {
        setError('Failed to load project');
        console.error('[ArcProjectPage] Fetch error:', err);
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

  // Error state
  if (error || !project) {
    return (
      <PortalLayout title="ARC Project">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Project not found'}</p>
            <Link
              href="/portal/arc"
              className="px-4 py-2 bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg transition text-sm font-medium"
            >
              Back to ARC Home
            </Link>
          </div>
        </div>
      </PortalLayout>
    );
  }

  const displayName = project.display_name || project.name;
  const tierLabel = getTierLabel(project.arc_access_level);
  const tierBadgeColor = getTierBadgeColor(project.arc_access_level);

  return (
    <PortalLayout title={displayName}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-akari-text">Project</span>
          <span>/</span>
          <span className="text-akari-text">{displayName}</span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4">
          {project.avatar_url && (
            <img
              src={project.avatar_url}
              alt={displayName}
              className="w-16 h-16 rounded-full border-2 border-akari-border"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-akari-text">{displayName}</h1>
            {project.twitter_username && (
              <p className="text-akari-muted">@{project.twitter_username}</p>
            )}
          </div>
          {/* Tier Badge */}
          <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${tierBadgeColor}`}>
            {tierLabel}
          </span>
        </div>

        {/* Leaderboard Coming Soon */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-2xl font-semibold text-akari-text mb-2">Leaderboard Coming Soon</h2>
          <p className="text-akari-muted max-w-md">
            The leaderboard for this project is currently under development. Check back soon!
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}

