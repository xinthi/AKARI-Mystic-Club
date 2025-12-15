/**
 * ARC Arena Details Page
 * 
 * Dynamic route for individual arena pages
 * Shows arena details, creators leaderboard, tasks, and analytics
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ArenaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string;
  avatar_url: string | null;
}

interface Creator {
  id?: string;
  twitter_username: string;
  arc_points: number;
  ring?: 'core' | 'momentum' | 'discovery' | string;
  style?: string | null;
  meta?: Record<string, any>;
  joined_at?: string | null;
}

interface ArenaDetailResponse {
  ok: true;
  arena: ArenaDetail;
  project: ProjectInfo;
  creators: Creator[];
}

interface ArenaErrorResponse {
  ok: false;
  error: string;
}

type ArenaResponse = ArenaDetailResponse | ArenaErrorResponse;

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaDetailsPage() {
  const router = useRouter();
  const { slug: projectSlug, arenaSlug } = router.query;
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Leaderboard filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [ringFilter, setRingFilter] = useState<'all' | 'core' | 'momentum' | 'discovery'>('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'joined_newest' | 'joined_oldest'>('points_desc');

  // Admin modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form state for Add/Edit
  const [formData, setFormData] = useState({
    twitter_username: '',
    arc_points: 0,
    ring: 'discovery' as 'core' | 'momentum' | 'discovery',
    style: '',
  });

  // Fetch arena details using the arena slug
  useEffect(() => {
    async function fetchArenaDetails() {
      // Wait for router to be ready and ensure we have the arena slug
      if (!router.isReady) {
        return;
      }

      if (!arenaSlug || typeof arenaSlug !== 'string') {
        setLoading(false);
        setError('Arena slug is required');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use the correct API route that returns arena, project, and creators in one call
        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}`);
        
        if (!res.ok) {
          const errorData: ArenaErrorResponse = await res.json().catch(() => ({
            ok: false,
            error: `HTTP ${res.status}: Failed to fetch arena`,
          }));
          setError(errorData.error || 'Failed to load arena');
          setLoading(false);
          return;
        }

        const data: ArenaResponse = await res.json().catch(() => {
          throw new Error('Invalid response from server');
        });

        if (!data.ok) {
          setError(data.error || 'Failed to load arena');
          setLoading(false);
          return;
        }

        // Data is valid, set all state
        setArena(data.arena);
        setProject(data.project);
        // Creators are already sorted by arc_points DESC from the API
        setCreators(data.creators || []);
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to connect to API';
        setError(errorMessage);
        console.error('[ArenaDetailsPage] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArenaDetails();
  }, [router.isReady, arenaSlug]);

  // Helper function to get arena status badge color
  const getArenaStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'scheduled':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'ended':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      case 'cancelled':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'draft':
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to format date range
  const formatDateRange = (startsAt: string | null, endsAt: string | null) => {
    if (!startsAt && !endsAt) return 'No dates set';
    if (!startsAt) return `Until ${new Date(endsAt!).toLocaleDateString()}`;
    if (!endsAt) return `From ${new Date(startsAt).toLocaleDateString()}`;
    
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;
  };

  // Helper function to get ring badge color
  const getRingColor = (ring: string) => {
    switch (ring) {
      case 'core':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'momentum':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'discovery':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Filter and sort creators
  const visibleCreators = React.useMemo(() => {
    let filtered = [...creators];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((creator) => {
        const usernameMatch = creator.twitter_username?.toLowerCase().includes(term);
        const styleMatch = creator.style?.toLowerCase().includes(term);
        return usernameMatch || styleMatch;
      });
    }

    // Filter by ring
    if (ringFilter !== 'all') {
      filtered = filtered.filter((creator) => {
        return creator.ring?.toLowerCase() === ringFilter.toLowerCase();
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'points_desc':
          return (b.arc_points ?? 0) - (a.arc_points ?? 0);
        case 'points_asc':
          return (a.arc_points ?? 0) - (b.arc_points ?? 0);
        case 'joined_newest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1; // Missing dates go to bottom
          if (!b.joined_at) return -1;
          return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
        case 'joined_oldest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1; // Missing dates go to bottom
          if (!b.joined_at) return -1;
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [creators, searchTerm, ringFilter, sortBy]);

  // Refresh creators list
  const refreshCreators = async () => {
    if (!arenaSlug || typeof arenaSlug !== 'string') return;

    try {
      const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}`);
      if (!res.ok) return;

      const data: ArenaResponse = await res.json();
      if (data.ok) {
        setCreators(data.creators || []);
      }
    } catch (err) {
      console.error('[ArenaDetailsPage] Error refreshing creators:', err);
    }
  };

  // Handle Add Creator
  const handleAddCreator = async () => {
    if (!arena || !formData.twitter_username.trim()) {
      setModalError('Twitter username is required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arena-creators-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arenaId: arena.id,
          twitter_username: formData.twitter_username.trim(),
          arc_points: formData.arc_points,
          ring: formData.ring,
          style: formData.style.trim() || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to add creator');
      }

      // Refresh the list
      await refreshCreators();

      // Reset form and close modal
      setFormData({
        twitter_username: '',
        arc_points: 0,
        ring: 'discovery',
        style: '',
      });
      setShowAddModal(false);
      setModalError(null);
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error adding creator:', err);
      setModalError(err?.message || 'Failed to save creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Edit Creator
  const handleEditCreator = async () => {
    if (!editingCreator || !editingCreator.id || !arena) {
      setModalError('Invalid creator data');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arena-creators-admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCreator.id,
          arc_points: formData.arc_points,
          ring: formData.ring,
          style: formData.style.trim() || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to update creator');
      }

      // Refresh the list
      await refreshCreators();

      // Close modal and reset state
      closeModals();
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error updating creator:', err);
      setModalError(err?.message || 'Failed to save creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Remove Creator
  const handleRemoveCreator = async (creatorId: string) => {
    if (!window.confirm('Are you sure you want to remove this creator from the arena?')) {
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/portal/arc/arena-creators-admin?id=${encodeURIComponent(creatorId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to remove creator');
      }

      // Refresh the list
      await refreshCreators();

      // Close modal and reset state
      closeModals();
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error removing creator:', err);
      setModalError(err?.message || 'Failed to remove creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (creator: Creator) => {
    setEditingCreator(creator);
    setFormData({
      twitter_username: creator.twitter_username,
      arc_points: creator.arc_points,
      ring: (creator.ring as 'core' | 'momentum' | 'discovery') || 'discovery',
      style: creator.style || '',
    });
    setModalError(null);
    setShowEditModal(true);
  };

  // Close modals
  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingCreator(null);
    setFormData({
      twitter_username: '',
      arc_points: 0,
      ring: 'discovery',
      style: '',
    });
    setModalError(null);
  };

  // Safe project slug for navigation
  const safeProjectSlug = typeof projectSlug === 'string' ? projectSlug : '';

  return (
    <PortalLayout title="ARC Arena">
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link
            href="/portal/arc"
            className="hover:text-akari-primary transition-colors"
          >
            ARC Home
          </Link>
          <span>/</span>
          {safeProjectSlug && (
            <>
              <Link
                href={`/portal/arc/${safeProjectSlug}`}
                className="hover:text-akari-primary transition-colors"
              >
                {project?.name || 'Project'}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-akari-text">Arena</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading arena…</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">
              Failed to load arena. Please try again later.
            </p>
            {error && error !== 'Failed to load arena. Please try again later.' && (
              <p className="text-xs text-akari-muted mt-2">{error}</p>
            )}
          </div>
        )}

        {/* Arena content */}
        {!loading && !error && arena && (
          <>
            {/* Arena header card */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {project && (
                    <p className="text-sm text-akari-muted mb-1">
                      {project.name}
                    </p>
                  )}
                  <h1 className="text-2xl font-bold text-akari-text mb-2">
                    {arena.name}
                  </h1>
                  <p className="text-xs text-akari-muted mb-2">
                    Slug: {arena.slug}
                  </p>
                  {arena.description && (
                    <p className="text-base text-akari-muted mb-4">
                      {arena.description}
                    </p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${getArenaStatusColor(
                    arena.status
                  )}`}
                >
                  {arena.status}
                </span>
              </div>

              {/* Arena metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-akari-muted mb-1">Date Range</p>
                  <p className="text-sm text-akari-text">
                    {formatDateRange(arena.starts_at, arena.ends_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-akari-muted mb-1">Reward Depth</p>
                  <p className="text-sm font-medium text-akari-text">
                    {arena.reward_depth}
                  </p>
                </div>
              </div>
            </div>

            {/* Creators Leaderboard Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-akari-text">Creators Leaderboard</h2>
                {userIsSuperAdmin && (
                  <button
                    onClick={() => {
                      setFormData({
                        twitter_username: '',
                        arc_points: 0,
                        ring: 'discovery',
                        style: '',
                      });
                      setModalError(null);
                      setShowAddModal(true);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                  >
                    Add Creator
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                {creators.length === 0 ? (
                  <p className="text-sm text-akari-muted">
                    No creators have joined this arena yet.
                  </p>
                ) : (
                  <>
                    {/* Controls Bar */}
                    <div className="mb-6 space-y-4">
                      {/* Search and Filters Row */}
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        {/* Search Input */}
                        <input
                          type="text"
                          placeholder="Search creators…"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                        />

                        {/* Ring Filter Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {(['all', 'core', 'momentum', 'discovery'] as const).map((ring) => (
                            <button
                              key={ring}
                              onClick={() => setRingFilter(ring)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                ringFilter === ring
                                  ? ring === 'all'
                                    ? 'bg-akari-primary/20 border-akari-primary/50 text-akari-primary'
                                    : getRingColor(ring) + ' border-opacity-50'
                                  : 'bg-akari-cardSoft/30 border-akari-border/30 text-akari-muted hover:border-akari-border/50'
                              }`}
                            >
                              {ring.charAt(0).toUpperCase() + ring.slice(1)}
                            </button>
                          ))}
                        </div>

                        {/* Sort Dropdown */}
                        <div className="flex items-center gap-2">
                          <label htmlFor="sort-select" className="text-xs text-akari-muted">
                            Sort:
                          </label>
                          <select
                            id="sort-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                            className="px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                          >
                            <option value="points_desc">Top points</option>
                            <option value="points_asc">Lowest points</option>
                            <option value="joined_newest">Newest joined</option>
                            <option value="joined_oldest">Oldest joined</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Creators List */}
                    {visibleCreators.length === 0 ? (
                      <p className="text-sm text-akari-muted">
                        No creators match your filters.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {visibleCreators.map((creator, index) => {
                          const rank = index + 1;
                          return (
                            <div
                              key={creator.id || `creator-${index}`}
                              className="flex items-center justify-between p-3 rounded-lg bg-akari-cardSoft/30 border border-akari-border/30 hover:border-akari-neon-teal/30 transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-semibold text-akari-text w-8">
                                  {rank}
                                </span>
                                <Link
                                  href={`/portal/arc/creator/${encodeURIComponent((creator.twitter_username || '').toLowerCase())}`}
                                  className="text-sm text-akari-text hover:text-akari-primary transition-colors"
                                >
                                  @{creator.twitter_username || 'Unknown'}
                                </Link>
                                {creator.ring && (
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium border ${getRingColor(
                                      creator.ring
                                    )}`}
                                  >
                                    {creator.ring}
                                  </span>
                                )}
                                {creator.style && (
                                  <span className="text-xs text-akari-muted">
                                    {creator.style}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-akari-text">
                                  {creator.arc_points ?? 0} pts
                                </span>
                                {userIsSuperAdmin && creator.id && (
                                  <button
                                    onClick={() => openEditModal(creator)}
                                    className="px-2 py-1 text-xs text-akari-muted hover:text-akari-primary transition-colors"
                                    title="Edit creator"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {/* Add Creator Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">Add Creator</h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                  disabled={modalLoading}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Twitter Username</label>
                  <input
                    type="text"
                    value={formData.twitter_username}
                    onChange={(e) => setFormData({ ...formData, twitter_username: e.target.value })}
                    placeholder="username (without @)"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">ARC Points</label>
                  <input
                    type="number"
                    value={formData.arc_points}
                    onChange={(e) => setFormData({ ...formData, arc_points: Number(e.target.value) || 0 })}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Ring</label>
                  <select
                    value={formData.ring}
                    onChange={(e) => setFormData({ ...formData, ring: e.target.value as 'core' | 'momentum' | 'discovery' })}
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  >
                    <option value="core">Core</option>
                    <option value="momentum">Momentum</option>
                    <option value="discovery">Discovery</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Style (optional)</label>
                  <input
                    type="text"
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    placeholder="e.g., Threads + deep dives"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                {modalError && (
                  <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
                    <p className="text-xs text-akari-danger">{modalError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={closeModals}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
                    disabled={modalLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCreator}
                    disabled={modalLoading}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Adding...' : 'Add Creator'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Creator Modal */}
        {showEditModal && editingCreator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">Edit Creator</h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                  disabled={modalLoading}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Twitter Username</label>
                  <input
                    type="text"
                    value={formData.twitter_username}
                    disabled
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/20 border border-akari-border/20 rounded-lg text-akari-muted cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">ARC Points</label>
                  <input
                    type="number"
                    value={formData.arc_points}
                    onChange={(e) => setFormData({ ...formData, arc_points: Number(e.target.value) || 0 })}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Ring</label>
                  <select
                    value={formData.ring}
                    onChange={(e) => setFormData({ ...formData, ring: e.target.value as 'core' | 'momentum' | 'discovery' })}
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  >
                    <option value="core">Core</option>
                    <option value="momentum">Momentum</option>
                    <option value="discovery">Discovery</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Style (optional)</label>
                  <input
                    type="text"
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    placeholder="e.g., Threads + deep dives"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                {modalError && (
                  <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
                    <p className="text-xs text-akari-danger">{modalError}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={closeModals}
                      className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
                      disabled={modalLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditCreator}
                      disabled={modalLoading}
                      className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {modalLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                  {editingCreator.id && (
                    <button
                      onClick={() => editingCreator.id && handleRemoveCreator(editingCreator.id)}
                      disabled={modalLoading}
                      className="w-full px-4 py-2 text-sm font-medium border border-akari-danger/30 text-akari-danger rounded-lg hover:bg-akari-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove from Arena
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
