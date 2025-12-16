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
  project?: {
    name: string;
    avatar_url: string | null;
  };
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
  const [submitForm, setSubmitForm] = useState({ postUrl: '', postTweetId: '' });

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
            project: foundProgram.project,
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
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowSubmitModal(null);
        setSubmitForm({ postUrl: '', postTweetId: '' });
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
            <div>
              <h1 className="text-3xl font-bold text-akari-text">{program.title}</h1>
              {program.project && (
                <p className="text-sm text-akari-muted">{program.project.name}</p>
              )}
            </div>
          </div>
          {program.description && (
            <p className="text-akari-muted mt-2">{program.description}</p>
          )}
        </div>

        {/* Missions List */}
        <div>
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
                <p className="text-xs text-akari-muted">
                  Provide either a post URL or tweet ID to link your submission
                </p>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowSubmitModal(null);
                    setSubmitForm({ postUrl: '', postTweetId: '' });
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

