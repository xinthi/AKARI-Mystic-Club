/**
 * My Creator Programs - Creator Side
 * 
 * Lists all Creator Manager programs for the current creator:
 * - Programs they're invited to or have joined
 * - Public/hybrid programs they can apply to
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getLevelInfo } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProgram {
  id: string;
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

  useEffect(() => {
    async function loadPrograms() {
      try {
        const res = await fetch('/api/portal/creator-manager/my-programs');
        const data = await res.json();

        if (data.ok) {
          setPrograms(data.programs || []);
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

  if (loading) {
    return (
      <PortalLayout title="My Creator Programs">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="My Creator Programs">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error}</p>
        </div>
      </PortalLayout>
    );
  }

  // Separate programs by status
  const myPrograms = programs.filter(p => p.creatorStatus);
  const availablePrograms = programs.filter(p => !p.creatorStatus);

  return (
    <PortalLayout title="My Creator Programs">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-akari-text mb-2">My Creator Programs</h1>
          <p className="text-akari-muted">
            Manage your creator programs, missions, and track your progress
          </p>
        </div>

        {/* My Programs */}
        {myPrograms.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-akari-text mb-4">My Programs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPrograms.map((program) => {
                const levelInfo = program.xp !== undefined ? getLevelInfo(program.xp) : null;
                
                return (
                  <Link
                    key={program.id}
                    href={`/portal/arc/my-creator-programs/${program.id}`}
                    className="rounded-xl border border-akari-border bg-akari-card p-6 hover:border-akari-primary transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-akari-text mb-1">{program.title}</h3>
                        {program.project && (
                          <p className="text-sm text-akari-muted">{program.project.name}</p>
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
                      <p className="text-sm text-akari-muted mb-4 line-clamp-2">{program.description}</p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-akari-muted">Status</span>
                        {getStatusBadge(program.creatorStatus)}
                      </div>

                      {program.creatorStatus === 'approved' && (
                        <>
                          {levelInfo && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-akari-muted">Level</span>
                              <span className="text-sm font-semibold text-akari-text">
                                Level {levelInfo.level}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-akari-muted">ARC Points</span>
                            <span className="text-sm font-semibold text-akari-text">
                              {program.arcPoints?.toLocaleString() || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-akari-muted">XP</span>
                            <span className="text-sm font-semibold text-akari-text">
                              {program.xp?.toLocaleString() || 0}
                            </span>
                          </div>
                          {program.class && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-akari-muted">Class</span>
                              <span className="text-sm font-semibold text-akari-primary">
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
            <h2 className="text-xl font-semibold text-akari-text mb-4">Available Programs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePrograms.map((program) => (
                <Link
                  key={program.id}
                  href={`/portal/arc/my-creator-programs/${program.id}`}
                  className="rounded-xl border border-akari-border bg-akari-card p-6 hover:border-akari-primary transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-akari-text mb-1">{program.title}</h3>
                      {program.project && (
                        <p className="text-sm text-akari-muted">{program.project.name}</p>
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
                    <p className="text-sm text-akari-muted mb-4 line-clamp-2">{program.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-akari-muted">Visibility</span>
                    <span className="text-xs text-akari-text capitalize">{program.visibility}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {programs.length === 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">No creator programs available</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

