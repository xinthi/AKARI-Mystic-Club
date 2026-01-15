/**
 * My Creator Programs - Creator Side
 * 
 * Lists all Creator Manager programs for the current creator:
 * - Programs they're invited to or have joined
 * - Public/hybrid programs they can apply to
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { getLevelInfo } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProgram {
  id: string;
  project_id?: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  project?: {
    name: string;
    avatar_url: string | null;
  };
  creatorStatus?: 'pending' | 'approved' | 'rejected' | 'removed' | null;
  arcPoints?: number;
  xp?: number;
  creatorLevel?: number;
  class?: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function MyCreatorPrograms() {
  const akariUser = useAkariUser();
  const [programs, setPrograms] = useState<CreatorProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresX, setRequiresX] = useState(false);

  useEffect(() => {
    async function loadPrograms() {
      try {
        const res = await fetch('/api/portal/creator-manager/my-programs', { credentials: 'include' });
        const data = await res.json();

        if (data.ok) {
          setPrograms(data.programs || []);
          setRequiresX(!!data.requiresX);
        } else {
          setError(data.error || 'Failed to load programs');
        }
      } catch (err: any) {
        console.error('[My Creator Programs] Error:', err);
        setError('Failed to load programs');
      } finally {
        setLoading(false);
      }
    }

    if (akariUser.isLoggedIn) {
      loadPrograms();
    } else {
      setLoading(false);
    }
  }, [akariUser.isLoggedIn]);

  const getStatusBadge = (status: CreatorProgram['creatorStatus']) => {
    switch (status) {
      case 'approved':
        return <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-300">Approved</span>;
      case 'pending':
        return <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-300">Pending</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-300">Rejected</span>;
      case 'removed':
        return <span className="px-2 py-1 rounded text-xs bg-gray-500/20 text-gray-300">Removed</span>;
      default:
        return <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">Available to Apply</span>;
    }
  };

  const getVisibilityLabel = (visibility: CreatorProgram['visibility']) => {
    if (visibility === 'private') return 'Request Access';
    if (visibility === 'hybrid') return 'Invite + Apply';
    return 'Open Apply';
  };

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-center py-12">
          <p className="text-white/60">Loading...</p>
        </div>
      </ArcPageShell>
    );
  }

  if (error) {
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </ArcPageShell>
    );
  }

  // Separate programs by status
  const myPrograms = programs.filter(p => p.creatorStatus);
  const availablePrograms = programs.filter(p => !p.creatorStatus);

  return (
    <ArcPageShell>
      <div className="space-y-6">
        {requiresX && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-center">
            <p className="text-sm text-yellow-300">
              You can browse programs, but follow verification is required before applying.
            </p>
          </div>
        )}
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Creator Programs</h1>
          <p className="text-white/60">
            Manage your creator programs, missions, and track your progress
          </p>
        </div>

        {/* My Programs */}
        {myPrograms.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">My Programs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPrograms.map((program) => {
                const levelInfo = program.xp !== undefined ? getLevelInfo(program.xp) : null;
                
                return (
                  <Link
                    key={program.id}
                    href={`/portal/arc/my-creator-programs/${program.id}`}
                    className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">{program.title}</h3>
                        {program.project && (
                          <p className="text-sm text-white/60">{program.project.name}</p>
                        )}
                      </div>
                      {program.project?.avatar_url && (
                        <img
                          src={program.project.avatar_url}
                          alt={program.project.name}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                    </div>

                    {program.description && (
                      <p className="text-sm text-white/60 mb-4 line-clamp-2">{program.description}</p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Status</span>
                        {getStatusBadge(program.creatorStatus)}
                      </div>

                      {program.creatorStatus === 'approved' && (
                        <>
                          {levelInfo && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white/60">Level</span>
                              <span className="text-sm font-semibold text-white">
                                Level {levelInfo.level}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/60">ARC Points</span>
                            <span className="text-sm font-semibold text-white">
                              {program.arcPoints?.toLocaleString() || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/60">XP</span>
                            <span className="text-sm font-semibold text-white">
                              {program.xp?.toLocaleString() || 0}
                            </span>
                          </div>
                          {program.class && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white/60">Class</span>
                              <span className="text-sm font-semibold text-teal-400">
                                {program.class}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Available Programs */}
        {availablePrograms.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Available Programs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePrograms.map((program) => (
                <Link
                  key={program.id}
                  href={`/portal/arc/my-creator-programs/${program.id}`}
                  className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">{program.title}</h3>
                      {program.project && (
                        <p className="text-sm text-white/60">{program.project.name}</p>
                      )}
                    </div>
                    {program.project?.avatar_url && (
                      <img
                        src={program.project.avatar_url}
                        alt={program.project.name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                  </div>

                  {program.description && (
                    <p className="text-sm text-white/60 mb-4 line-clamp-2">{program.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Visibility</span>
                    <span className="text-xs text-white">{getVisibilityLabel(program.visibility)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {programs.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60">No creator programs available</p>
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}

