/**
 * ARC Project Page
 * 
 * Page for projects with leaderboard or gamified ARC access levels
 * Shows project overview, leaderboard, and campaigns
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
  slug: string;
  twitter_username: string | null;
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
}

type TabType = 'overview' | 'leaderboard' | 'campaigns';

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

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Fetch project by slug or ID
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

        // Try to find project by slug first, then by ID
        let query = supabase
          .from('projects')
          .select('id, name, display_name, slug, twitter_username, avatar_url, arc_access_level, arc_active')
          .or(`slug.eq.${projectId},id.eq.${projectId}`)
          .single();

        const { data: projectData, error: projectError } = await query;

        if (projectError || !projectData) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        // Verify project has appropriate access level
        if (projectData.arc_access_level !== 'leaderboard' && projectData.arc_access_level !== 'gamified') {
          setError('This project does not have leaderboard or gamified ARC access');
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
          <div>
            <h1 className="text-3xl font-bold text-akari-text">{displayName}</h1>
            {project.twitter_username && (
              <p className="text-akari-muted">@{project.twitter_username}</p>
            )}
          </div>
        </div>

        {/* ARC Tier Info */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-4">
          <p className="text-sm text-akari-muted">
            This project has ARC tier: <span className="font-semibold text-akari-text">{tierLabel}</span>
            {project.arc_active ? (
              <span className="ml-2 px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Active</span>
            ) : (
              <span className="ml-2 px-2 py-1 rounded text-xs bg-gray-500/20 text-gray-400">Inactive</span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-akari-border">
          <div className="flex gap-4">
            {(['overview', 'leaderboard', 'campaigns'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-akari-primary text-akari-primary'
                    : 'border-transparent text-akari-muted hover:text-akari-text hover:border-akari-border'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-6 min-h-[400px]">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-akari-text">Overview</h2>
              <p className="text-akari-muted">
                Project overview content coming soon...
              </p>
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-akari-text">Leaderboard</h2>
              <p className="text-akari-muted">
                Leaderboard content coming soon...
              </p>
            </div>
          )}

          {activeTab === 'campaigns' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-akari-text">Campaigns</h2>
              <p className="text-akari-muted">
                Campaigns content coming soon...
              </p>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

