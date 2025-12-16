/**
 * Creator Program Detail - Creator Side
 * 
 * Shows missions for a specific Creator Manager program
 * Allows creators to submit missions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getLevelInfo } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface Mission {
  id: string;
  title: string;
  description: string | null;
  reward_arc_min: number;
  reward_arc_max: number;
  reward_xp: number;
  is_active: boolean;
}

interface MissionProgress {
  mission_id: string;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  post_url: string | null;
  post_tweet_id: string | null;
  last_update_at: string;
}

interface Program {
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

export default function CreatorProgramDetail() {
  const router = useRouter();
  const { programId } = router.query;
  const akariUser = useAkariUser();

  const [program, setProgram] = useState<Program | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, MissionProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingMission, setSubmittingMission] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [submitForm, setSubmitForm] = useState({ postUrl: '', postTweetId: '', notes: '' });

  const loadData = useCallback(async () => {
    if (!programId || typeof programId !== 'string') return;

    try {
      // Get missions
      const missionsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions`);
      const missionsData = await missionsRes.json();

      if (missionsData.ok) {
        setMissions(missionsData.missions || []);
      }

      // Get program info (we'll get it from my-programs endpoint)
      const programsRes = await fetch('/api/portal/creator-manager/my-programs');
      const programsData = await programsRes.json();

      if (programsData.ok) {
        const foundProgram = programsData.programs.find((p: any) => p.id === programId);
        if (foundProgram) {
          setProgram({
            id: foundProgram.id,
            title: foundProgram.title,
            description: foundProgram.description,
            visibility: foundProgram.visibility,
            status: foundProgram.status,
            project: foundProgram.project,
            creatorStatus: foundProgram.creatorStatus,
            arcPoints: foundProgram.arcPoints,
            xp: foundProgram.xp,
            creatorLevel: foundProgram.creatorLevel,
            class: foundProgram.class,
          });
        }
      }

      // Get mission progress for current creator
      const progressRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions/my-progress`);
      const progressData = await progressRes.json();
      if (progressData.ok) {
        const progressMap = new Map<string, MissionProgress>();
        (progressData.progress || []).forEach((p: MissionProgress) => {
          progressMap.set(p.mission_id, p);
        });
        setProgressMap(progressMap);
      }
    } catch (err: any) {
      console.error('[Program Detail] Error:', err);
      setError(err.message || 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [loadData, akariUser.isLoggedIn]);

  const handleSubmit = async (missionId: string) => {
    if (!submitForm.postUrl && !submitForm.postTweetId) {
      alert('Please provide either a post URL or tweet ID');
      return;
    }

    setSubmittingMission(missionId);
    try {
      const res = await fetch(`/api/portal/creator-manager/missions/${missionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postUrl: submitForm.postUrl || undefined,
          postTweetId: submitForm.postTweetId || undefined,
          notes: submitForm.notes || undefined,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowSubmitModal(null);
        setSubmitForm({ postUrl: '', postTweetId: '', notes: '' });
        // Update progress map
        const newProgress: MissionProgress = {
          mission_id: missionId,
          status: 'submitted',
          post_url: submitForm.postUrl || null,
          post_tweet_id: submitForm.postTweetId || null,
          last_update_at: new Date().toISOString(),
        };
        setProgressMap(new Map(progressMap.set(missionId, newProgress)));
        alert('Mission submitted successfully!');
      } else {
        alert(data.error || 'Failed to submit mission');
      }
    } catch (err: any) {
      console.error('[Submit Mission] Error:', err);
      alert('Failed to submit mission');
    } finally {
      setSubmittingMission(null);
    }
  };

  const getMissionStatus = (missionId: string): 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' => {
    const progress = progressMap.get(missionId);
    if (!progress) return 'not_started';
    return progress.status;
  };

  if (loading) {
    return (
      <PortalLayout title="Creator Program">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error || !program) {
    return (
      <PortalLayout title="Creator Program">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error || 'Program not found'}</p>
          <Link
            href="/portal/arc/my-creator-programs"
            className="mt-4 inline-block text-sm text-akari-primary hover:text-akari-neon-teal transition-colors"
          >
            ← Back to My Programs
          </Link>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title={`${program.title} - Missions`}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <Link href="/portal/arc/my-creator-programs" className="hover:text-akari-primary transition-colors">
            My Creator Programs
          </Link>
          <span>/</span>
          <span className="text-akari-text">{program.title}</span>
        </div>

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            {program.project?.avatar_url && (
              <img src={program.project.avatar_url} alt={program.project.name} className="w-12 h-12 rounded-full" />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-akari-text">{program.title}</h1>
              {program.project && (
                <p className="text-sm text-akari-muted">{program.project.name}</p>
              )}
            </div>
            {program.creatorStatus && (
              <span className={`px-3 py-1 rounded text-sm ${
                program.creatorStatus === 'approved' ? 'bg-green-500/20 text-green-300' :
                program.creatorStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                program.creatorStatus === 'rejected' ? 'bg-red-500/20 text-red-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {program.creatorStatus === 'approved' ? 'Approved' :
                 program.creatorStatus === 'pending' ? 'Pending' :
                 program.creatorStatus === 'rejected' ? 'Rejected' :
                 'Removed'}
              </span>
            )}
          </div>
          {program.description && (
            <p className="text-akari-muted mt-2">{program.description}</p>
          )}
        </div>

        {/* Stats Cards */}
        {program.creatorStatus === 'approved' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {program.creatorLevel !== undefined && (
              <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                <div className="text-sm text-akari-muted mb-1">Level</div>
                <div className="text-2xl font-bold text-akari-text">Level {program.creatorLevel}</div>
              </div>
            )}
            {program.xp !== undefined && (
              <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                <div className="text-sm text-akari-muted mb-1">XP</div>
                <div className="text-2xl font-bold text-akari-text">{program.xp.toLocaleString()}</div>
              </div>
            )}
            {program.arcPoints !== undefined && (
              <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                <div className="text-sm text-akari-muted mb-1">ARC Points</div>
                <div className="text-2xl font-bold text-akari-text">{program.arcPoints.toLocaleString()}</div>
              </div>
            )}
            {program.class && (
              <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                <div className="text-sm text-akari-muted mb-1">Class</div>
                <div className="text-2xl font-bold text-akari-primary">{program.class}</div>
              </div>
            )}
          </div>
        )}

        {/* CTA Section */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-6">
          {program.creatorStatus === 'pending' && (
            <div className="text-center">
              <p className="text-akari-muted mb-2">Application Pending</p>
              <p className="text-sm text-akari-muted">Your application is under review. You&apos;ll be notified once a decision is made.</p>
            </div>
          )}
          {program.creatorStatus === 'rejected' && (
            <div className="text-center">
              <p className="text-red-300 mb-2">Application Rejected</p>
              <p className="text-sm text-akari-muted">Your application to this program was not approved.</p>
            </div>
          )}
          {program.creatorStatus === 'approved' && (
            <div className="text-center">
              <p className="text-green-300 mb-4">You&apos;re approved! Start completing missions to earn rewards.</p>
              <button
                onClick={() => {
                  const missionsSection = document.getElementById('missions-section');
                  missionsSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-6 py-3 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors font-medium"
              >
                Start Missions
              </button>
            </div>
          )}
          {!program.creatorStatus && program.visibility !== 'private' && (
            <div className="text-center">
              <p className="text-akari-muted mb-4">This program is open for applications</p>
              <Link
                href={`/api/portal/creator-manager/programs/${programId}/creators/apply`}
                className="inline-block px-6 py-3 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors font-medium"
              >
                Apply to Program
              </Link>
            </div>
          )}
        </div>

        {/* Missions List */}
        <div id="missions-section">
          <h2 className="text-xl font-semibold text-akari-text mb-4">Missions</h2>
          {missions.length === 0 ? (
            <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
              <p className="text-akari-muted">No missions available yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {missions
                .filter((m) => m.is_active)
                .map((mission) => {
                  const status = getMissionStatus(mission.id);
                  return (
                    <div
                      key={mission.id}
                      className="rounded-xl border border-akari-border bg-akari-card p-6"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-akari-text">{mission.title}</h3>
                          {mission.description && (
                            <p className="text-sm text-akari-muted mt-2">{mission.description}</p>
                          )}
                          <div className="flex gap-4 mt-3 text-sm text-akari-muted">
                            <span>XP Reward: {mission.reward_xp}</span>
                            <span>
                              ARC Reward: {mission.reward_arc_min}
                              {mission.reward_arc_max > mission.reward_arc_min && `-${mission.reward_arc_max}`}
                            </span>
                          </div>
                          {status !== 'not_started' && (
                            <div className="mt-3">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  status === 'approved'
                                    ? 'bg-green-500/20 text-green-300'
                                    : status === 'rejected'
                                    ? 'bg-red-500/20 text-red-300'
                                    : status === 'submitted'
                                    ? 'bg-yellow-500/20 text-yellow-300'
                                    : 'bg-akari-cardSoft text-akari-muted'
                                }`}
                              >
                                {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : status === 'submitted' ? 'Submitted' : 'In Progress'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div>
                          {status === 'not_started' || status === 'in_progress' ? (
                            <button
                              onClick={() => setShowSubmitModal(mission.id)}
                              className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
                            >
                              Submit Mission
                            </button>
                          ) : status === 'submitted' ? (
                            <span className="text-sm text-akari-muted">Awaiting review</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Submit Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-akari-card rounded-xl border border-akari-border p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-akari-text mb-4">Submit Mission</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Post URL (optional)</label>
                  <input
                    type="text"
                    value={submitForm.postUrl}
                    onChange={(e) => setSubmitForm({ ...submitForm, postUrl: e.target.value })}
                    placeholder="https://x.com/username/status/..."
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Tweet ID (optional)</label>
                  <input
                    type="text"
                    value={submitForm.postTweetId}
                    onChange={(e) => setSubmitForm({ ...submitForm, postTweetId: e.target.value })}
                    placeholder="1234567890"
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Notes (optional)</label>
                  <textarea
                    value={submitForm.notes}
                    onChange={(e) => setSubmitForm({ ...submitForm, notes: e.target.value })}
                    placeholder="Add any additional notes about your submission..."
                    rows={3}
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text resize-none"
                  />
                </div>
                <p className="text-xs text-akari-muted">
                  Provide either a post URL or tweet ID to link your submission
                </p>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowSubmitModal(null);
                    setSubmitForm({ postUrl: '', postTweetId: '', notes: '' });
                  }}
                  className="px-4 py-2 rounded-lg border border-akari-border text-akari-text hover:bg-akari-cardSoft transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmit(showSubmitModal)}
                  disabled={submittingMission === showSubmitModal || (!submitForm.postUrl && !submitForm.postTweetId)}
                  className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors disabled:opacity-50"
                >
                  {submittingMission === showSubmitModal ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

