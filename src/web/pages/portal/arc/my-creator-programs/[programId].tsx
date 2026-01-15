/**
 * Creator Program Detail - Creator Side
 * 
 * Shows missions for a specific Creator Manager program
 * Allows creators to submit missions
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
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

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  awarded_at: string;
}

interface Program {
  id: string;
  project_id: string;
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
  creatorRank?: number;
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
  const [badges, setBadges] = useState<Badge[]>([]);
  const [leaderboard, setLeaderboard] = useState<Array<{ rank: number; username: string; arc_points: number; xp: number; level: number }>>([]);
  const [totalCreators, setTotalCreators] = useState(0);
  const [links, setLinks] = useState<Array<{ id: string; label: string; url: string; utm_url: string; code: string | null }>>([]);
  const [creatorProfileId, setCreatorProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followVerified, setFollowVerified] = useState<boolean | null>(null);
  const [verifyingFollow, setVerifyingFollow] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [requiresX, setRequiresX] = useState(false);
  const [submittingMission, setSubmittingMission] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [submitForm, setSubmitForm] = useState({ postUrl: '', postTweetId: '', notes: '' });

  // Normalize current user's username for comparisons
  const myUsername = useMemo(() => {
    return (akariUser.user?.xUsername ?? '').replace('@', '').toLowerCase();
  }, [akariUser.user?.xUsername]);

  const loadData = useCallback(async () => {
    if (!programId || typeof programId !== 'string') return;

    try {
      // Get missions
      const missionsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions`, { credentials: 'include' });
      const missionsData = await missionsRes.json();

      if (missionsData.ok) {
        setMissions(missionsData.missions || []);
      }

      // Get program info (we'll get it from my-programs endpoint)
      const programsRes = await fetch('/api/portal/creator-manager/my-programs', { credentials: 'include' });
      const programsData = await programsRes.json();

      if (!programsRes.ok || !programsData.ok) {
        setError(programsData.error || 'Failed to load program');
        return;
      }
      if (programsData.requiresX) {
        setRequiresX(true);
      }

      const foundProgram = programsData.programs.find((p: any) => p.id === programId);
      if (!foundProgram) {
        setError('Program not found');
        return;
      }

      setProgram({
        id: foundProgram.id,
        project_id: foundProgram.project_id,
        title: foundProgram.title,
        description: foundProgram.description,
        visibility: foundProgram.visibility,
        status: foundProgram.status,
        project: foundProgram.project,
        creatorStatus: foundProgram.creatorStatus,
        arcPoints: foundProgram.arcPoints,
        xp: foundProgram.xp,
        creatorLevel: foundProgram.creatorLevel,
        creatorRank: foundProgram.creatorRank,
        class: foundProgram.class,
      });
      if (!foundProgram.creatorStatus) {
        try {
          const followRes = await fetch(
            `/api/portal/arc/follow-status?projectId=${encodeURIComponent(foundProgram.project_id)}`,
            { credentials: 'include' }
          );
          const followData = await followRes.json();
          if (followData.ok) {
            setFollowVerified(!!followData.verified);
          }
        } catch (err) {
          console.error('[Follow Status] Error:', err);
        }
      }
      // Get creator profile ID from the membership
      if (foundProgram.creatorStatus) {
        // Fetch creator profile ID from my-programs endpoint response
        // We'll get it from the creators list
        try {
          const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`, { credentials: 'include' });
          const creatorsData = await creatorsRes.json();
          if (creatorsData.ok) {
            // Find current user's creator record
            const currentCreator = creatorsData.creators.find((c: any) => {
              const creatorUsername = (c.profile?.username ?? c.profile?.twitter_username ?? '').replace('@', '').toLowerCase();
              return creatorUsername === myUsername;
            });
            if (currentCreator) {
              setCreatorProfileId(currentCreator.creator_profile_id);
            }
          }
        } catch (err) {
          console.error('[Get Creator Profile ID] Error:', err);
        }
      }

      // Get leaderboard (top 10) for approved creators
      if (foundProgram.creatorStatus === 'approved') {
        try {
          const leaderboardRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`, { credentials: 'include' });
          const leaderboardData = await leaderboardRes.json();
          if (leaderboardData.ok) {
            const approvedCreators = leaderboardData.creators
              .filter((c: any) => c.status === 'approved')
              .slice(0, 10);
            setLeaderboard(approvedCreators.map((c: any) => ({
              rank: c.rank || 0,
              username: c.profile?.username || 'unknown',
              arc_points: c.arc_points || 0,
              xp: c.xp || 0,
              level: c.creatorLevel || 1,
            })));
            // Get total count of approved creators
            const allApproved = leaderboardData.creators.filter((c: any) => c.status === 'approved');
            setTotalCreators(allApproved.length);
          }
        } catch (err) {
          console.error('[Leaderboard] Error:', err);
        }
      }

      // Get mission progress for current creator
      const progressRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions/my-progress`, { credentials: 'include' });
      const progressData = await progressRes.json();
      if (progressData.ok) {
        const progressMap = new Map<string, MissionProgress>();
        (progressData.progress || []).forEach((p: MissionProgress) => {
          progressMap.set(p.mission_id, p);
        });
        setProgressMap(progressMap);
      }

      // Get badges for current creator
      const badgesRes = await fetch(`/api/portal/creator-manager/programs/${programId}/my-badges`, { credentials: 'include' });
      const badgesData = await badgesRes.json();
      if (badgesData.ok) {
        setBadges(badgesData.badges || []);
      }

      // Get links for this program
      const linksRes = await fetch(`/api/portal/creator-manager/programs/${programId}/links`, { credentials: 'include' });
      const linksData = await linksRes.json();
      if (linksData.ok) {
        setLinks(linksData.links || []);
      }
    } catch (err: any) {
      console.error('[Program Detail] Error:', err);
      setError(err.message || 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId, myUsername]);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [loadData, akariUser.isLoggedIn]);

  const handleVerifyFollow = async () => {
    if (!programId || typeof programId !== 'string') return;
    setVerifyingFollow(true);
    setApplyError(null);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/verify-follow`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );
      const data = await res.json();
      if (data.ok) {
        setFollowVerified(true);
      } else {
        setApplyError(data.error || 'Failed to verify follow');
      }
    } catch (err: any) {
      setApplyError(err.message || 'Failed to verify follow');
    } finally {
      setVerifyingFollow(false);
    }
  };

  const handleApply = async () => {
    if (!programId || typeof programId !== 'string') return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );
      const data = await res.json();
      if (data.ok) {
        await loadData();
      } else {
        setApplyError(data.error || 'Failed to apply');
      }
    } catch (err: any) {
      setApplyError(err.message || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

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
        credentials: 'include',
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
      <ArcPageShell>
        <div className="text-center py-12">
          <p className="text-white/60">Loading...</p>
        </div>
      </ArcPageShell>
    );
  }

  if (error || !program) {
    const needsX = !!error && error.toLowerCase().includes('connect your x account');
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">{error || 'Program not found'}</p>
          {needsX && (
            <Link
              href="/portal/me"
              className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              Connect X account
            </Link>
          )}
          <Link
            href="/portal/arc/my-creator-programs"
            className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            ← Back to My Programs
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="space-y-6">
        {requiresX && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400 mb-2">
              You can browse this program, but you must connect your X account to apply or track progress.
            </p>
            <Link
              href="/portal/me"
              className="inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              Connect X account
            </Link>
          </div>
        )}
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
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

        {/* Your Rank Card */}
        {program.creatorStatus === 'approved' && program.creatorRank !== undefined && totalCreators > 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <h2 className="text-xl font-semibold text-akari-text mb-4">Your Rank</h2>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-akari-primary">#{program.creatorRank}</div>
                <div className="text-sm text-akari-muted mt-1">Rank</div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-akari-muted mb-1">Percentile</div>
                <div className="text-2xl font-bold text-akari-text">
                  {Math.round(((totalCreators - program.creatorRank + 1) / totalCreators) * 100)}%
                </div>
                <div className="text-xs text-akari-muted mt-1">
                  Out of {totalCreators} approved creator{totalCreators !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* Mini Leaderboard */}
        {program.creatorStatus === 'approved' && leaderboard.length > 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <h2 className="text-xl font-semibold text-akari-text mb-4">Leaderboard (Top 10)</h2>
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    entry.username.toLowerCase() === myUsername
                      ? 'border-akari-primary bg-akari-primary/10'
                      : 'border-akari-border bg-akari-cardSoft'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                      entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-akari-card text-akari-muted'
                    }`}>
                      {entry.rank}
                    </div>
                    <div>
                      <div className="font-medium text-akari-text">@{entry.username}</div>
                      <div className="text-xs text-akari-muted">Level {entry.level}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-akari-text">
                      {entry.arc_points.toLocaleString()} ARC
                    </div>
                    <div className="text-xs text-akari-muted">
                      {entry.xp.toLocaleString()} XP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaign Links */}
        {program.creatorStatus === 'approved' && links.length > 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <h2 className="text-xl font-semibold text-akari-text mb-4">Campaign Links</h2>
            <div className="space-y-3">
              {links.map((link) => {
                // Use short code if available, fallback to link ID for backward compatibility
                const linkCode = (link as any).code || link.id;
                const redirectUrl = creatorProfileId
                  ? `/r/cm/${linkCode}?creator=${creatorProfileId}`
                  : `/r/cm/${linkCode}`;
                return (
                  <a
                    key={link.id}
                    href={redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 rounded-lg border border-akari-border bg-akari-cardSoft hover:bg-akari-card hover:border-akari-primary transition-colors"
                  >
                    <div className="font-medium text-akari-text mb-1">{link.label}</div>
                    <div className="text-sm text-akari-muted">{link.url}</div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Badges Section */}
        {program.creatorStatus === 'approved' && badges.length > 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <h2 className="text-xl font-semibold text-akari-text mb-4">Badges Earned</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className="rounded-lg border border-akari-border bg-akari-cardSoft p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🏆</span>
                    <div className="flex-1">
                      <div className="font-semibold text-akari-text">{badge.name}</div>
                      {badge.description && (
                        <div className="text-sm text-akari-muted mt-1">{badge.description}</div>
                      )}
                      <div className="text-xs text-akari-muted mt-2">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
          {!program.creatorStatus && (
            <div className="text-center">
              <p className="text-akari-muted mb-4">
                {program.visibility === 'private'
                  ? 'This is a private program. You can request access to join.'
                  : program.visibility === 'hybrid'
                  ? 'Invited creators are auto-approved. Others can apply to join.'
                  : 'This program is open for applications.'}
              </p>
              {followVerified === false && (
                <div className="mb-4 text-sm text-akari-muted">
                  Please verify that you follow the project on X before applying.
                </div>
              )}
              {followVerified === null && (
                <div className="mb-4 text-sm text-akari-muted">
                  Checking follow status...
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {followVerified === false && (
                  <button
                    onClick={handleVerifyFollow}
                    disabled={verifyingFollow}
                    className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/15 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {verifyingFollow ? 'Verifying...' : 'Verify Follow'}
                  </button>
                )}
                <button
                  onClick={handleApply}
                  disabled={applying || followVerified === false || followVerified === null}
                  className="px-6 py-3 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors font-medium disabled:opacity-50"
                >
                  {applying ? 'Applying...' : program.visibility === 'private' ? 'Request Access' : 'Apply to Program'}
                </button>
              </div>
              {applyError && (
                <div className="mt-3 text-sm text-red-400">{applyError}</div>
              )}
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
    </ArcPageShell>
  );
}

