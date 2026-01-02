/**
 * Super Admin ARC Activity Page
 * 
 * View ARC audit log events for observability and debugging.
 */

import { useState, useEffect, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

interface AuditEvent {
  id: string;
  created_at: string;
  actor_profile_id: string | null;
  project_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  success: boolean;
  message: string | null;
  request_id: string | null;
  metadata: Record<string, any>;
  project?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  } catch {
    return '-';
  }
}

function getActionLabel(action: string): string {
  // Convert snake_case to Title Case
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    leaderboard_request: 'Request',
    arena: 'Arena',
    project_features: 'Features',
    project_access: 'Access',
    billing_record: 'Billing',
  };
  return labels[entityType] || entityType;
}

function getSuccessBadge(success: boolean): string {
  return success
    ? 'bg-green-500/20 text-green-400 border-green-500/50'
    : 'bg-red-500/20 text-red-400 border-red-500/50';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminActivityPage() {
  const akariUser = useAkariUser();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>('');

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Load events (memoized with useCallback to avoid infinite loops)
  const loadEvents = useCallback(async () => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (projectFilter.trim()) {
        params.set('projectId', projectFilter.trim());
      }
      params.set('limit', '200');

      const res = await fetch(`/api/portal/admin/arc/activity?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load activity events');
      }

      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity events.');
    } finally {
      setLoading(false);
    }
  }, [userIsSuperAdmin, projectFilter]);

  // Load events on mount and when dependencies change
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <ArcPageShell 
        canManageArc={true}
        isSuperAdmin={userIsSuperAdmin}
      >
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">Log in to view this page.</p>
        </div>
      </ArcPageShell>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <ArcPageShell 
        canManageArc={true}
        isSuperAdmin={userIsSuperAdmin}
      >
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">You need super admin access to view this page.</p>
          <Link
            href="/portal/arc"
            className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            ← Back to ARC Home
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell canManageArc={true}>
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <Link href="/portal/admin/arc" className="hover:text-white transition-colors">
            Super Admin
          </Link>
          <span>/</span>
          <span className="text-white">Activity</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ARC Activity Log</h1>
            <p className="text-white/60">View all ARC operations and events</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-white/80">Filter by Project ID:</label>
          <input
            type="text"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            placeholder="Enter project UUID (optional)"
            className="flex-1 max-w-md px-4 py-2 rounded-lg border border-white/10 bg-black/40 text-white placeholder-white/40 focus:outline-none focus:border-akari-neon-teal/50"
          />
          <button
            onClick={loadEvents}
            className="px-4 py-2 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-8 text-center">
            <p className="text-white/60">Loading activity events...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <ErrorState
            message={error}
            onRetry={loadEvents}
          />
        )}

        {/* Empty state */}
        {!loading && !error && events.length === 0 && (
          <EmptyState
            icon="📋"
            title="No activity events"
            description="No ARC activity events found. Events will appear here as actions are performed."
          />
        )}

        {/* Events table */}
        {!loading && !error && events.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Entity Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Success
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white/80">
                        <div className="flex flex-col">
                          <span>{formatRelativeTime(event.created_at)}</span>
                          <span className="text-xs text-white/40">{formatDate(event.created_at)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {getActionLabel(event.action)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {event.project ? (
                          <Link
                            href={`/portal/arc/admin/${event.project.slug || event.project.id}`}
                            className="text-akari-neon-teal hover:text-akari-neon-teal/80 transition-colors"
                          >
                            {event.project.name || event.project.id}
                          </Link>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {getEntityTypeLabel(event.entity_type)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getSuccessBadge(
                            event.success
                          )}`}
                        >
                          {event.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60 font-mono text-xs">
                        {event.actor_profile_id ? (
                          <span className="truncate max-w-[120px] inline-block" title={event.actor_profile_id}>
                            {event.actor_profile_id.substring(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/70 max-w-md">
                        <div className="truncate" title={event.message || ''}>
                          {event.message || '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Require Super Admin access
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }

  // User is authenticated and is Super Admin
  return {
    props: {},
  };
};
