/**
 * ARC Home Page
 * 
 * Creator Arenas - Narrative Universe
 * Displays all projects with ARC settings enabled
 */

import React, { useEffect, useState } from 'react';
import { PortalLayout } from '@/components/portal/PortalLayout';

// =============================================================================
// TYPES
// =============================================================================

interface ArcProject {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  security_status: 'normal' | 'alert' | 'clear';
}

interface ArcProjectsResponse {
  ok: boolean;
  projects?: ArcProject[];
  error?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcHome() {
  const [projects, setProjects] = useState<ArcProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch ARC projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/portal/arc/projects');
        const data: ArcProjectsResponse = await res.json();

        if (!data.ok || !data.projects) {
          setError(data.error || 'Failed to load ARC projects');
          return;
        }

        setProjects(data.projects);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcHome] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'suspended':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'inactive':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to get tier badge color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'event_host':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'pro':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'basic':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  // Helper function to get security status badge color
  const getSecurityColor = (status: string) => {
    switch (status) {
      case 'alert':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      case 'clear':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'normal':
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  return (
    <PortalLayout title="ARC">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gradient-teal">
          ARC Narrative Universe
        </h1>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading ARC projects...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">Failed to load ARC projects.</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              No ARC projects yet. ARC will light up as soon as campaigns go live.
            </p>
          </div>
        )}

        {/* Projects grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.project_id}
                className="rounded-xl border border-slate-700 p-4 bg-akari-card hover:border-akari-neon-teal/50 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] transition-all duration-300"
              >
                {/* Project name */}
                <h3 className="text-lg font-semibold text-akari-text mb-2">
                  {project.name || 'Unnamed Project'}
                </h3>

                {/* Twitter username */}
                {project.twitter_username && (
                  <p className="text-sm text-akari-muted mb-4">
                    @{project.twitter_username}
                  </p>
                )}

                {/* Status badges */}
                <div className="flex flex-wrap gap-2">
                  {/* ARC Tier */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getTierColor(
                      project.arc_tier
                    )}`}
                  >
                    {project.arc_tier}
                  </span>

                  {/* ARC Status */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                      project.arc_status
                    )}`}
                  >
                    {project.arc_status}
                  </span>

                  {/* Security Status */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getSecurityColor(
                      project.security_status
                    )}`}
                  >
                    {project.security_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
