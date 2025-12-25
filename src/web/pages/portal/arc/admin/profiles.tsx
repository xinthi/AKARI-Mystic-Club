/**
 * ARC Admin Page - Manage ARC Visibility and Tier
 * 
 * SuperAdmin-only page to manage arc_active and arc_access_level per project profile.
 * Changes reflect immediately on /portal/arc (cards + treemap).
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { requireSuperAdmin } from '@/lib/server-auth';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ArcProfile {
  profile_id: string;
  name: string;
  twitter_username: string | null;
  logo_url: string | null;
  arc_active: boolean;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
}

type ArcAccessLevel = 'none' | 'creator_manager' | 'leaderboard' | 'gamified';

interface ProfileRowState {
  arc_active: boolean;
  arc_access_level: ArcAccessLevel;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcAdminProfilesPage() {
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [profiles, setProfiles] = useState<ArcProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Per-row state for editing and saving
  const [rowStates, setRowStates] = useState<Map<string, ProfileRowState>>(new Map());

  // Load profiles on mount
  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }
    loadProfiles();
  }, [userIsSuperAdmin]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/portal/admin/arc/profiles', { credentials: 'include' });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load profiles');
      }

      setProfiles(data.profiles || []);
      
      // Initialize row states with current values
      const initialStates = new Map<string, ProfileRowState>();
      (data.profiles || []).forEach((profile: ArcProfile) => {
        initialStates.set(profile.profile_id, {
          arc_active: profile.arc_active,
          arc_access_level: profile.arc_access_level,
          saving: false,
          saved: false,
          error: null,
        });
      });
      setRowStates(initialStates);
    } catch (err: any) {
      console.error('[ArcAdminProfiles] Error loading profiles:', err);
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = (profileId: string) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = next.get(profileId);
      if (current) {
        next.set(profileId, {
          ...current,
          arc_active: !current.arc_active,
          saved: false,
          error: null,
        });
      }
      return next;
    });
  };

  const handleAccessLevelChange = (profileId: string, newLevel: ArcAccessLevel) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = next.get(profileId);
      if (current) {
        next.set(profileId, {
          ...current,
          arc_access_level: newLevel,
          saved: false,
          error: null,
        });
      }
      return next;
    });
  };

  const handleSave = async (profileId: string) => {
    const rowState = rowStates.get(profileId);
    if (!rowState || rowState.saving) return;

    // Mark as saving
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = next.get(profileId);
      if (current) {
        next.set(profileId, {
          ...current,
          saving: true,
          error: null,
          saved: false,
        });
      }
      return next;
    });

    try {
      const res = await fetch(`/api/portal/admin/arc/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          arc_active: rowState.arc_active,
          arc_access_level: rowState.arc_access_level,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to save changes');
      }

      // Update local profile state
      setProfiles((prev) =>
        prev.map((p) =>
          p.profile_id === profileId
            ? {
                ...p,
                arc_active: data.profile.arc_active,
                arc_access_level: data.profile.arc_access_level,
              }
            : p
        )
      );

      // Mark as saved
      setRowStates((prev) => {
        const next = new Map(prev);
        const current = next.get(profileId);
        if (current) {
          next.set(profileId, {
            ...current,
            saving: false,
            saved: true,
            error: null,
          });
        }
        return next;
      });

      // Clear "saved" indicator after 2 seconds
      setTimeout(() => {
        setRowStates((prev) => {
          const next = new Map(prev);
          const current = next.get(profileId);
          if (current) {
            next.set(profileId, {
              ...current,
              saved: false,
            });
          }
          return next;
        });
      }, 2000);
    } catch (err: any) {
      console.error('[ArcAdminProfiles] Error saving profile:', err);
      setRowStates((prev) => {
        const next = new Map(prev);
        const current = next.get(profileId);
        if (current) {
          next.set(profileId, {
            ...current,
            saving: false,
            error: err.message || 'Failed to save. Please try again.',
          });
        }
        return next;
      });
    }
  };

  // Not logged in or not super admin
  if (!akariUser.isLoggedIn || !userIsSuperAdmin) {
    return (
      <PortalLayout title="ARC Admin - Profiles">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="neon-card neon-hover p-8 text-center">
            <p className="text-akari-muted">
              You need super admin access to view this page.
            </p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="ARC Admin - Profile Management">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-gradient-neon">ARC Profile Management</h1>
              <p className="text-base text-akari-muted leading-relaxed">
                Manage ARC visibility and access level per project profile. Changes reflect immediately on /portal/arc.
              </p>
            </div>
            <Link
              href="/portal/arc"
              className="pill-neon px-4 py-2 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 border border-akari-neon-teal/50"
            >
              ← Back to ARC
            </Link>
          </div>
        </div>

        {/* Main Card */}
        <div className="neon-card neon-hover p-6">
          {loading ? (
            <div className="py-12 text-center text-akari-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
              Loading profiles...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 font-semibold">
              {error}
            </div>
          ) : profiles.length === 0 ? (
            <div className="py-12 text-center text-akari-muted">
              No project profiles found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">
                      Name
                    </th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-blue">
                      @Handle
                    </th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-pink">
                      Profile ID
                    </th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-heat">
                      ARC Active
                    </th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">
                      Access Level
                    </th>
                    <th className="text-right py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => {
                    const rowState = rowStates.get(profile.profile_id);
                    const currentState = rowState || {
                      arc_active: profile.arc_active,
                      arc_access_level: profile.arc_access_level,
                      saving: false,
                      saved: false,
                      error: null,
                    };
                    const hasChanges =
                      currentState.arc_active !== profile.arc_active ||
                      currentState.arc_access_level !== profile.arc_access_level;

                    return (
                      <tr
                        key={profile.profile_id}
                        className="border-b border-akari-neon-teal/10 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)]"
                      >
                        {/* Name */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            {profile.logo_url && (
                              <img
                                src={profile.logo_url}
                                alt={profile.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <span className="text-sm text-akari-text font-semibold">
                              {profile.name}
                            </span>
                          </div>
                        </td>

                        {/* @Handle */}
                        <td className="py-4 px-5 text-sm text-akari-muted">
                          {profile.twitter_username ? `@${profile.twitter_username}` : '-'}
                        </td>

                        {/* Profile ID */}
                        <td className="py-4 px-5 text-sm text-akari-muted font-mono text-xs">
                          {profile.profile_id.substring(0, 8)}...
                        </td>

                        {/* ARC Active Toggle */}
                        <td className="py-4 px-5">
                          <button
                            onClick={() => handleToggleActive(profile.profile_id)}
                            disabled={currentState.saving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-akari-neon-teal/50 focus:ring-offset-2 focus:ring-offset-akari-card ${
                              currentState.arc_active
                                ? 'bg-akari-neon-teal'
                                : 'bg-akari-cardSoft/50'
                            } ${currentState.saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                currentState.arc_active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Access Level Dropdown */}
                        <td className="py-4 px-5">
                          <select
                            value={currentState.arc_access_level}
                            onChange={(e) =>
                              handleAccessLevelChange(
                                profile.profile_id,
                                e.target.value as ArcAccessLevel
                              )
                            }
                            disabled={currentState.saving}
                            className="px-3 py-1.5 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="none">none</option>
                            <option value="creator_manager">creator_manager</option>
                            <option value="leaderboard">leaderboard</option>
                            <option value="gamified">gamified</option>
                          </select>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5">
                          <div className="flex items-center justify-end gap-3">
                            {currentState.error && (
                              <span className="text-xs text-red-400 font-semibold">
                                {currentState.error}
                              </span>
                            )}
                            {currentState.saved && (
                              <span className="text-xs text-green-400 font-semibold">
                                Saved
                              </span>
                            )}
                            <button
                              onClick={() => handleSave(profile.profile_id)}
                              disabled={currentState.saving || !hasChanges}
                              className="pill-neon px-4 py-2 min-h-[36px] bg-akari-primary/20 text-akari-neon-teal hover:bg-akari-primary/30 border border-akari-primary/50 transition-all duration-300 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_12px_rgba(0,246,162,0.3)]"
                            >
                              {currentState.saving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
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

