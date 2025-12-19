/**
 * ARC Leaderboard Requests - My Requests Page
 * 
 * Shows all leaderboard requests made by the current user with status badges and links.
 */

import { useState, useEffect } from 'react';
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
  const akariUser = useAkariUser();
  const [requests, setRequests] = useState<LeaderboardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load requests
  useEffect(() => {
    if (!akariUser.isLoggedIn) {
      setLoading(false);
      return;
    }

    loadRequests();
  }, [akariUser.isLoggedIn]);

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

