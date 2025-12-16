/**
 * My Creator Programs - Creator Side View
 * 
 * Shows Creator Manager programs where the creator is a member or can apply
 * Displays XP, Level, Class, and progress
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getLevelInfo } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProgram {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  project?: {
    id: string;
    name: string;
    slug: string;
    avatar_url: string | null;
    twitter_username: string | null;
  };
  creatorStatus?: 'pending' | 'approved' | 'rejected' | 'removed' | null;
  arcPoints?: number;
  xp?: number;
  creatorLevel?: number;
  class?: string | null;
  dealLabel?: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function MyCreatorPrograms() {
  const akariUser = useAkariUser();
  const [programs, setPrograms] = useState<CreatorProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);

  const loadPrograms = useCallback(async () => {
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
      setError(err.message || 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadPrograms();
    } else {
      setLoading(false);
    }
  }, [akariUser.isLoggedIn, loadPrograms]);

  const handleApply = async (programId: string) => {
    setApplyingTo(programId);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/apply`,
        { method: 'POST' }
      );

      const data = await res.json();
      if (data.ok) {
        // Reload programs
        await loadPrograms();
        alert('Application submitted successfully!');
      } else {
        alert(data.error || 'Failed to apply');
      }
    } catch (err: any) {
      console.error('[Apply] Error:', err);
      alert('Failed to apply');
    } finally {
      setApplyingTo(null);
    }
  };

  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="My Creator Programs">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">Please log in to view your Creator Manager programs</p>
        </div>
      </PortalLayout>
    );
  }

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
  const myPrograms = programs.filter((p) => p.creatorStatus);
  const availablePrograms = programs.filter((p) => !p.creatorStatus);

  return (
    <PortalLayout title="My Creator Programs">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-akari-text">My Creator Programs</span>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-akari-text">My Creator Programs</h1>
          <p className="text-akari-muted mt-2">
            View your Creator Manager programs, track your progress, and discover new opportunities
          </p>
        </div>

        {/* My Programs */}
        {myPrograms.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-akari-text mb-4">My Programs</h2>
            <div className="space-y-4">
              {myPrograms.map((program) => {
                const levelInfo = program.xp !== undefined ? getLevelInfo(program.xp) : null;
                return (
                  <div
                    key={program.id}
                    className="rounded-xl border border-akari-border bg-akari-card p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {program.project?.avatar_url && (
                          <img
                            src={program.project.avatar_url}
                            alt={program.project.name}
                            className="w-12 h-12 rounded-full"
                          />
                        )}
                        <div>
                          <h3 className="text-lg font-semibold text-akari-text">{program.title}</h3>
                          <p className="text-sm text-akari-muted">
                            {program.project?.name || 'Unknown Project'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded text-sm ${
                          program.creatorStatus === 'approved'
                            ? 'bg-green-500/20 text-green-300'
                            : program.creatorStatus === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : 'bg-akari-cardSoft text-akari-muted'
                        }`}
                      >
                        {program.creatorStatus}
                      </span>
                    </div>

                    {program.description && (
                      <p className="text-akari-muted text-sm mb-4">{program.description}</p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <div className="text-sm text-akari-muted">XP</div>
                        <div className="text-lg font-semibold text-akari-text">
                          {program.xp || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-akari-muted">Level</div>
                        <div className="text-lg font-semibold text-akari-text">
                          {program.creatorLevel || 1}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-akari-muted">Class</div>
                        <div className="text-lg font-semibold text-akari-text">
                          {program.class || '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-akari-muted">ARC Points</div>
                        <div className="text-lg font-semibold text-akari-text">
                          {program.arcPoints || 0}
                        </div>
                        <div className="text-xs text-akari-muted mt-1">in this program</div>
                      </div>
                    </div>

                    {/* XP Progress Bar */}
                    {levelInfo && levelInfo.xpForNextLevel !== null && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-akari-muted mb-1">
                          <span>Progress to Level {levelInfo.level + 1}</span>
                          <span>{levelInfo.xpProgress}%</span>
                        </div>
                        <div className="w-full bg-akari-cardSoft rounded-full h-2">
                          <div
                            className="bg-akari-primary h-2 rounded-full transition-all"
                            style={{ width: `${levelInfo.xpProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Programs */}
        {availablePrograms.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-akari-text mb-4">Available Programs</h2>
            <div className="space-y-4">
              {availablePrograms.map((program) => (
                <div
                  key={program.id}
                  className="rounded-xl border border-akari-border bg-akari-card p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {program.project?.avatar_url && (
                        <img
                          src={program.project.avatar_url}
                          alt={program.project.name}
                          className="w-12 h-12 rounded-full"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-akari-text">{program.title}</h3>
                        <p className="text-sm text-akari-muted">
                          {program.project?.name || 'Unknown Project'}
                        </p>
                        {program.description && (
                          <p className="text-akari-muted text-sm mt-2">{program.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleApply(program.id)}
                      disabled={applyingTo === program.id}
                      className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {applyingTo === program.id ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {programs.length === 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">No Creator Manager programs found</p>
            <p className="text-sm text-akari-muted mt-2">
              Check back later or apply to public programs when they become available
            </p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

