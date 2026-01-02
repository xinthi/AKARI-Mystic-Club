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
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import Link from 'next/link';
import { getArcFeatureName, getArcFeatureDescription } from '@/lib/arc-naming';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';

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
  if (!level) return 'Not specified';
  return getArcFeatureName(level);
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
    // Wait for router to be ready
    if (!router.isReady) return;

    const { projectId, slug, intent, productType } = router.query;
    
    if (projectId || slug) {
      setRequestMode(true);
      loadProject(projectId as string | undefined, slug as string | undefined);
      
      // Map productType from query to selectedAccessLevel
      if (productType === 'ms') {
        setSelectedAccessLevel('leaderboard');
      } else if (productType === 'gamefi') {
        setSelectedAccessLevel('gamified');
      } else if (productType === 'crm') {
        setSelectedAccessLevel('creator_manager');
      }
    } else {
      setRequestMode(false);
      setSelectedProject(null);
    }
  }, [router.isReady, router.query]);

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
      const res = await fetch('/api/portal/arc/leaderboard-requests?scope=my', { credentials: 'include' });
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
    if (!projectId && !slug) {
      console.warn('[Request Form] No projectId or slug provided');
      setError('Project ID or slug is required');
      setProjectLoading(false);
      return;
    }

    setProjectLoading(true);
    setError(null);

    try {
      const identifier = projectId || slug;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Request Form] Loading project:', { projectId, slug, identifier });
      }

      const res = await fetch(`/api/portal/arc/project/${encodeURIComponent(identifier)}`, { 
        credentials: 'include' 
      });
      
      const data = await res.json();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Request Form] Project API response:', { 
          ok: res.ok, 
          dataOk: data.ok, 
          hasProject: !!data.project,
          projectId: data.project?.id 
        });
      }

      if (!res.ok || !data.ok) {
        const errorMsg = data.error || 'Failed to load project';
        console.error('[Request Form] Project load error:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!data.project || !data.project.id) {
        const errorMsg = 'Project data is missing or invalid';
        console.error('[Request Form] Invalid project data:', data);
        throw new Error(errorMsg);
      }

      setSelectedProject({
        id: data.project.id,
        name: data.project.name,
        display_name: data.project.display_name,
        slug: data.project.slug,
        twitter_username: data.project.twitter_username,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Request Form] Project loaded successfully:', {
          id: data.project.id,
          name: data.project.name,
        });
      }
    } catch (err: any) {
      console.error('[Request Form] Error loading project:', err);
      setError(err.message || 'Failed to load project. Please check the URL and try again.');
      setSelectedProject(null);
    } finally {
      setProjectLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedProject || !selectedProject.id || submitting) {
      setSubmitError('Project information is missing. Please refresh the page and try again.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Map selectedAccessLevel to productType (API expects 'ms', 'gamefi', 'crm')
      const productTypeMap: Record<string, 'ms' | 'gamefi' | 'crm'> = {
        'leaderboard': 'ms',
        'gamified': 'gamefi',
        'creator_manager': 'crm',
      };
      
      const productType = productTypeMap[selectedAccessLevel] || 'ms';
      
      // For ms and gamefi, dates are required. For crm, they're optional.
      // We'll let the API validate this, but we should prompt for dates in the UI if needed.
      const startAt = null; // TODO: Add date inputs to the form
      const endAt = null; // TODO: Add date inputs to the form

      // Validate projectId before sending
      if (!selectedProject.id || typeof selectedProject.id !== 'string') {
        throw new Error('Invalid project ID. Please refresh the page and try again.');
      }

      const requestBody = {
        projectId: selectedProject.id,
        productType: productType,
        startAt: startAt,
        endAt: endAt,
        notes: justification.trim() || null,
      };

      // Log request in dev mode
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Request Form] Submitting request:', requestBody);
      }

      const res = await fetch('/api/portal/arc/leaderboard-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies (session token) - required for authentication
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        // Provide more helpful error messages
        let errorMessage = data.error || 'Failed to submit request';
        if (errorMessage === 'projectId is required' || errorMessage === 'invalid_project_id') {
          errorMessage = 'Project ID is missing or invalid. Please refresh the page and try again.';
        } else if (errorMessage === 'invalid_product_type') {
          errorMessage = 'Invalid product type. Please select a valid option.';
        } else if (errorMessage === 'missing_dates') {
          errorMessage = 'Start and end dates are required for this request type.';
        }
        throw new Error(errorMessage);
      }

      setSubmitSuccess(true);
      
      // Redirect to requests list after a short delay
      setTimeout(() => {
        router.push('/portal/arc/requests');
      }, 2000);
    } catch (err: any) {
      console.error('[Request Form] Submit error:', err);
      setSubmitError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  // Get project link URL (use canonical route with slug)
  const getProjectLink = (request: LeaderboardRequest): string => {
    if (!request.project) return '#';
    if (request.project.slug) {
      return `/portal/arc/${request.project.slug}`;
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
      <ArcPageShell>
        <div>
          {/* Back to My Requests Button */}
          <div className="mb-6">
            <Link
              href="/portal/arc/requests"
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
            >
              ← Back to My Requests
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Request ARC access for {projectDisplayName}
                </h1>
                {projectHandle && (
                  <p className="text-white/60">@{projectHandle}</p>
                )}
              </div>
              {/* Admin Panel Link - Show if project has slug */}
              {selectedProject?.slug && (
                <Link
                  href={`/portal/arc/admin/${encodeURIComponent(selectedProject.slug)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin Panel
                </Link>
              )}
            </div>
          </div>

          {/* Loading Project */}
          {projectLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
              <p className="mt-4 text-white/60">Loading project...</p>
            </div>
          )}

          {/* Error Loading Project */}
          {error && !projectLoading && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Request Form */}
          {!projectLoading && selectedProject && selectedProject.id ? (
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
              {submitSuccess ? (
                  <div className="text-center py-8">
                    <div className="text-green-400 text-4xl mb-4">✓</div>
                    <h2 className="text-xl font-semibold text-white mb-2">Request submitted</h2>
                    <p className="text-white/60 mb-4">Redirecting to My Requests...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Debug info (dev only) */}
                    {process.env.NODE_ENV !== 'production' && (
                      <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3 text-xs text-blue-400">
                        <strong>Debug:</strong> Project ID: {selectedProject.id}
                      </div>
                    )}

                    {/* Access Level Selector */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Requested Type <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={selectedAccessLevel}
                        onChange={(e) => setSelectedAccessLevel(e.target.value as 'creator_manager' | 'leaderboard' | 'gamified')}
                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        <option value="creator_manager">{getArcFeatureName('creator_manager')}</option>
                        <option value="leaderboard">{getArcFeatureName('leaderboard')}</option>
                        <option value="gamified">{getArcFeatureName('gamified')}</option>
                      </select>
                      <p className="text-xs text-white/60 mt-2">
                        {getArcFeatureDescription(selectedAccessLevel)}
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
                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                        rows={4}
                      />
                    </div>

                    {/* Submit Error */}
                    {submitError && (
                      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                        <p className="text-red-400 text-sm font-medium mb-1">Error submitting request:</p>
                        <p className="text-red-400 text-sm">{submitError}</p>
                        {process.env.NODE_ENV !== 'production' && selectedProject?.id && (
                          <p className="text-red-300 text-xs mt-2">
                            Project ID being sent: {selectedProject.id}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Submit Button */}
                    <div>
                      <button
                        onClick={handleSubmitRequest}
                        disabled={submitting || !selectedProject?.id}
                        className="w-full px-4 py-2 bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : !projectLoading && !selectedProject ? (
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-6">
              <p className="text-yellow-400 font-medium mb-2">Project not loaded</p>
              <p className="text-yellow-300 text-sm mb-4">
                Unable to load project information. Please check the URL or try again.
              </p>
              {router.query.projectId && (
                <p className="text-yellow-200 text-xs">
                  Project ID from URL: {router.query.projectId}
                </p>
              )}
              <Link
                href="/portal/arc/requests"
                className="inline-block mt-4 text-yellow-400 hover:text-yellow-300 text-sm underline"
              >
                ← Back to My Requests
              </Link>
            </div>
          ) : null}
        </div>
      </ArcPageShell>
    );
  }

  // Render normal requests list
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  return (
    <ArcPageShell>
      <div>
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">My ARC Leaderboard Requests</h1>
                <p className="text-white/60">
                  View the status of your ARC leaderboard access requests.
                </p>
              </div>
              {userIsSuperAdmin && (
                <Link
                  href="/portal/admin/arc/leaderboard-requests"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 text-teal-400 border border-teal-400/50 rounded-lg hover:bg-teal-400/30 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Approve Requests (Admin)
                </Link>
              )}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
              <p className="mt-4 text-white/60">Loading requests...</p>
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
                <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
                  <p className="text-white/60 mb-4">You haven&apos;t made any requests yet.</p>
                  <Link
                    href="/portal/arc"
                    className="inline-block px-4 py-2 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 text-teal-400 border border-teal-400/50 rounded-lg hover:bg-teal-400/30 transition-colors"
                  >
                    Browse ARC Projects
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-white/20 transition-colors"
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
                                      className="hover:text-teal-400 transition-colors"
                                    >
                                      {getProjectDisplay(request).name}
                                    </Link>
                                    {getProjectDisplay(request).handle && (
                                      <span className="text-white/60 text-sm font-normal ml-2">
                                        @{getProjectDisplay(request).handle}
                                      </span>
                                    )}
                                </> 
                              ) : (
                                <span className="text-white/60">Unknown Project</span>
                              )}
                            </h3>
                          </div>

                          {/* Request Details */}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-4 text-white/60">
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
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-400/20 to-cyan-400/20 text-teal-400 border border-teal-400/50 hover:bg-teal-400/30 transition-colors text-xs font-medium"
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
      </ArcPageShell>
  );
}

