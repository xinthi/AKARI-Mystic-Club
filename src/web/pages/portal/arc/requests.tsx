/**
 * ARC Leaderboard Requests - My Requests Page
 * 
 * Shows all leaderboard requests made by the current user with status badges and links.
 * 
 * Supports deep-linking with query params:
 * - ?projectId=<uuid> OR ?slug=<slug> - Pre-select project and show request form
 * - ?intent=request - Optional flag to indicate request mode
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified' | null;
  created_at: string;
  decided_at: string | null;
  arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified' | 'none' | null;
  project: {
    id: string;
    project_id?: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    twitter_username: string | null;
  } | null;
}

interface Project {
  id: string;
  name: string;
  display_name: string | null;
  slug: string | null;
  twitter_username: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadgeColor(status: 'pending' | 'approved' | 'rejected'): string {
  switch (status) {
    case 'approved':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'rejected':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'pending':
    default:
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
  }
}

function getStatusLabel(status: 'pending' | 'approved' | 'rejected'): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'pending':
    default:
      return 'Pending';
  }
}

function getAccessLevelLabel(level: 'creator_manager' | 'leaderboard' | 'gamified' | null): string {
  switch (level) {
    case 'creator_manager':
      return 'Creator Manager';
    case 'leaderboard':
      return 'Leaderboard';
    case 'gamified':
      return 'Gamified';
    default:
      return 'Not specified';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcRequestsPage() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const [requests, setRequests] = useState<LeaderboardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Request mode state
  const [requestMode, setRequestMode] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<'creator_manager' | 'leaderboard' | 'gamified'>('leaderboard');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Check query params for request mode
  useEffect(() => {
    const { projectId, slug, intent } = router.query;
    
    if (projectId || slug) {
      setRequestMode(true);
      loadProject(projectId as string | undefined, slug as string | undefined);
    } else {
      setRequestMode(false);
      setSelectedProject(null);
    }
  }, [router.query]);

  // Load requests (only if not in request mode)
  useEffect(() => {
    if (!akariUser.isLoggedIn) {
      setLoading(false);
      return;
    }

    if (!requestMode) {
      loadRequests();
    } else {
      setLoading(false);
    }
  }, [akariUser.isLoggedIn, requestMode]);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/arc/leaderboard-requests?scope=my');
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }

      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  const loadProject = async (projectId?: string, slug?: string) => {
    if (!projectId && !slug) return;

    setProjectLoading(true);
    setError(null);

    try {
      const identifier = projectId || slug;
      const res = await fetch(`/api/portal/arc/project/${identifier}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load project');
      }

      if (data.project) {
        setSelectedProject({
          id: data.project.id,
          name: data.project.name,
          display_name: data.project.display_name,
          slug: data.project.slug,
          twitter_username: data.project.twitter_username,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    } finally {
      setProjectLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedProject || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const res = await fetch('/api/portal/arc/leaderboard-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies (session token) - required for authentication
        body: JSON.stringify({
          projectId: selectedProject.id,
          justification: justification.trim() || null,
          requested_arc_access_level: selectedAccessLevel,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSubmitSuccess(true);
      
      // Redirect to requests list after a short delay
      setTimeout(() => {
        router.push('/portal/arc/requests');
      }, 2000);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  // Get project link URL
  const getProjectLink = (request: LeaderboardRequest): string => {
    if (!request.project) return '#';
    if (request.project.slug) {
      return `/portal/arc/project/${request.project.slug}`;
    }
    return `/portal/arc/project/${request.project.id}`;
  };

  // Get project display name with handle
  const getProjectDisplay = (request: LeaderboardRequest): { name: string; handle: string | null } => {
    if (!request.project) return { name: 'Unknown Project', handle: null };
    const name = request.project.display_name || request.project.name || 'Unknown Project';
    const handle = request.project.twitter_username || null;
    return { name, handle };
  };

  // Render request mode UI
  if (requestMode) {
    const projectDisplayName = selectedProject?.display_name || selectedProject?.name || 'Unknown Project';
    const projectHandle = selectedProject?.twitter_username;

    return (
      <PortalLayout title="Request ARC Access">
        <div className="min-h-screen bg-akari-dark text-white py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Back to My Requests Button */}
            <div className="mb-6">
              <Link
                href="/portal/arc/requests"
                className="inline-flex items-center gap-2 text-akari-muted hover:text-akari-neon-teal transition-colors text-sm"
              >
                ← Back to My Requests
              </Link>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">
                Request ARC access for {projectDisplayName}
              </h1>
              {projectHandle && (
                <p className="text-akari-muted">@{projectHandle}</p>
              )}
            </div>

            {/* Loading Project */}
            {projectLoading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-akari-neon-teal"></div>
                <p className="mt-4 text-akari-muted">Loading project...</p>
              </div>
            )}

            {/* Error Loading Project */}
            {error && !projectLoading && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Request Form */}
            {!projectLoading && selectedProject && (
              <div className="bg-akari-card border border-akari-border rounded-lg p-6">
                {submitSuccess ? (
                  <div className="text-center py-8">
                    <div className="text-green-400 text-4xl mb-4">✓</div>
                    <h2 className="text-xl font-semibold text-white mb-2">Request submitted</h2>
                    <p className="text-akari-muted mb-4">Redirecting to My Requests...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Access Level Selector */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Requested Type <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={selectedAccessLevel}
                        onChange={(e) => setSelectedAccessLevel(e.target.value as 'creator_manager' | 'leaderboard' | 'gamified')}
                        className="w-full px-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-neon-teal"
                      >
                        <option value="creator_manager">Creator Manager</option>
                        <option value="leaderboard">Leaderboard</option>
                        <option value="gamified">Gamified</option>
                      </select>
                      <p className="text-xs text-akari-muted mt-2">
                        {selectedAccessLevel === 'creator_manager'
                          ? 'Manage creator campaigns and programs'
                          : selectedAccessLevel === 'leaderboard' 
                          ? 'Display project leaderboard with rankings'
                          : 'Full gamified experience with missions and rewards'}
                      </p>
                    </div>

                    {/* Justification (optional) */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Justification (optional)
                      </label>
                      <textarea
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Explain why you'd like to enable ARC access for this project..."
                        className="w-full px-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-neon-teal resize-none"
                        rows={4}
                      />
                    </div>

                    {/* Submit Error */}
                    {submitError && (
                      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                        <p className="text-red-400 text-sm">{submitError}</p>
                      </div>
                    )}

                    {/* Submit Button */}
                    <div>
                      <button
                        onClick={handleSubmitRequest}
                        disabled={submitting}
                        className="w-full px-4 py-2 bg-akari-neon-teal text-black rounded-lg hover:bg-akari-neon-teal/80 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Render normal requests list
  return (
    <PortalLayout title="My ARC Requests">
      <div className="min-h-screen bg-akari-dark text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">My ARC Leaderboard Requests</h1>
            <p className="text-akari-muted">
              View the status of your ARC leaderboard access requests.
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-akari-neon-teal"></div>
              <p className="mt-4 text-akari-muted">Loading requests...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Requests List */}
          {!loading && !error && (
            <div>
              {requests.length === 0 ? (
                <div className="bg-akari-card border border-akari-border rounded-lg p-8 text-center">
                  <p className="text-akari-muted mb-4">You haven&apos;t made any requests yet.</p>
                  <Link
                    href="/portal/arc"
                    className="inline-block px-4 py-2 bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 rounded-lg hover:bg-akari-neon-teal/30 transition-colors"
                  >
                    Browse ARC Projects
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="bg-akari-card border border-akari-border rounded-lg p-6 hover:border-akari-neon-teal/50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        {/* Left Side: Project Info */}
                        <div className="flex-1">
                          <div className="flex items-start gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-white">
                              {request.project ? (
                                <>
                                  <Link
                                    href={getProjectLink(request)}
                                    className="hover:text-akari-neon-teal transition-colors"
                                  >
                                    {getProjectDisplay(request).name}
                                  </Link>
                                  {getProjectDisplay(request).handle && (
                                    <span className="text-akari-muted text-sm font-normal ml-2">
                                      @{getProjectDisplay(request).handle}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-akari-muted">Unknown Project</span>
                              )}
                            </h3>
                          </div>

                          {/* Request Details */}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-4 text-akari-muted">
                              <span>Created: {formatDate(request.created_at)}</span>
                              {request.decided_at && (
                                <span>Decided: {formatDate(request.decided_at)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Status Badge and Link */}
                        <div className="flex flex-col items-end gap-3">
                          <span
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${getStatusBadgeColor(
                              request.status
                            )}`}
                          >
                            {getStatusLabel(request.status)}
                          </span>

                          {request.status === 'approved' && request.project && (
                            <Link
                              href={getProjectLink(request)}
                              className="px-3 py-1.5 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors text-xs font-medium"
                            >
                              View Project
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

