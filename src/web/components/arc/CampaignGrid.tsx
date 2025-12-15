/**
 * Campaign Grid Component
 * 
 * Displays all ARC-enabled projects in a responsive grid
 */

import React, { useState } from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface CampaignProject {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  meta?: {
    banner_url?: string | null;
    accent_color?: string | null;
    tagline?: string | null;
  };
  stats?: {
    creatorCount?: number;
    totalPoints?: number;
    trend?: 'rising' | 'stable' | 'cooling';
  };
}

interface CampaignGridProps {
  projects: CampaignProject[];
  userTwitterUsername?: string | null;
  userCampaignStatuses?: Map<string, { isFollowing: boolean; hasJoined: boolean }>;
  onJoinCampaign?: (projectId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CampaignGrid({ 
  projects, 
  userTwitterUsername,
  userCampaignStatuses,
  onJoinCampaign 
}: CampaignGridProps) {
  const [showFollowModal, setShowFollowModal] = useState<string | null>(null);
  const isDevMode = process.env.NODE_ENV === 'development';

  const getProjectAvatarUrl = (username: string | null) => {
    if (!username) return null;
    return `https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=false`;
  };

  const getTrendColor = (trend?: string) => {
    switch (trend) {
      case 'rising':
        return 'text-green-400';
      case 'cooling':
        return 'text-red-400';
      default:
        return 'text-akari-muted';
    }
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'rising':
        return '↗';
      case 'cooling':
        return '↘';
      default:
        return '→';
    }
  };

  return (
    <>
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-white">All Campaigns</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const accentColor = project.meta?.accent_color || '#6A5ACD';
            const bannerUrl = project.meta?.banner_url;
            const avatarUrl = getProjectAvatarUrl(project.twitter_username);
            const status = userCampaignStatuses?.get(project.project_id) || {
              isFollowing: false,
              hasJoined: false,
            };

            // In dev mode, treat as following
            const effectiveIsFollowing = isDevMode || status.isFollowing;

            let ctaLabel = 'Follow on X to join';
            let ctaAction: () => void = () => {
              if (isDevMode) {
                if (project.slug) {
                  window.location.href = `/portal/arc/${project.slug}`;
                }
              } else {
                setShowFollowModal(project.project_id);
              }
            };

            if (effectiveIsFollowing && status.hasJoined) {
              ctaLabel = 'View missions';
              ctaAction = () => {
                if (project.slug) {
                  window.location.href = `/portal/arc/${project.slug}`;
                }
              };
            } else if (effectiveIsFollowing && !status.hasJoined) {
              ctaLabel = 'Join campaign';
              ctaAction = () => {
                if (onJoinCampaign) {
                  onJoinCampaign(project.project_id);
                }
              };
            }

            return (
              <div
                key={project.project_id}
                className="rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-white/20 hover:shadow-lg transition-all"
                style={{
                  boxShadow: `0 4px 6px rgba(0, 0, 0, 0.3), 0 0 8px ${accentColor}20`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 8px 12px rgba(0, 0, 0, 0.4), 0 0 16px ${accentColor}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 4px 6px rgba(0, 0, 0, 0.3), 0 0 8px ${accentColor}20`;
                }}
              >
                {/* Banner */}
                <div className="h-32 relative">
                  {bannerUrl ? (
                    <>
                      <div
                        style={{ backgroundImage: `url(${bannerUrl})` }}
                        className="absolute inset-0 bg-cover bg-center opacity-50"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/80" />
                    </>
                  ) : (
                    <div
                      className="absolute inset-0 bg-gradient-to-br opacity-30"
                      style={{
                        background: `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}60 100%)`,
                      }}
                    />
                  )}
                </div>

                <div className="p-4">
                  {/* Avatar and name */}
                  <div className="flex items-center gap-3 mb-3">
                    {avatarUrl ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatarUrl}
                          alt={project.name || 'Project'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0 border-2 border-white/10"
                        style={{ backgroundColor: accentColor }}
                      >
                        {(project.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-white truncate">
                        {project.name || 'Unnamed Project'}
                      </h3>
                      {project.twitter_username && (
                        <p className="text-xs text-white/60">
                          @{project.twitter_username}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tagline */}
                  {project.meta?.tagline && (
                    <p className="text-sm text-white/70 mb-4 line-clamp-2">
                      {project.meta.tagline}
                    </p>
                  )}

                  {/* Stats row */}
                  <div className="px-4 py-3 text-sm space-y-1 mb-3 bg-black/20 rounded-lg border border-white/5">
                    {project.stats?.creatorCount !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Active Creators</span>
                        <span className="text-white font-semibold">
                          {project.stats.creatorCount}
                        </span>
                      </div>
                    )}
                    {project.stats?.totalPoints !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Total ARC Points</span>
                        <span className="text-white font-semibold">
                          {project.stats.totalPoints.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {project.stats?.trend && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Engagement</span>
                        <span className={`font-semibold ${getTrendColor(project.stats.trend)}`}>
                          {getTrendIcon(project.stats.trend)} {project.stats.trend}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        ctaAction();
                      } catch (err) {
                        console.error('[CampaignGrid] Error in ctaAction:', err);
                      }
                    }}
                    className="w-full mt-3 py-2.5 rounded-lg text-center font-semibold transition-all cursor-pointer"
                    style={{
                      backgroundColor: ctaLabel === 'Follow on X to join' ? 'transparent' : accentColor,
                      color: ctaLabel === 'Follow on X to join' ? accentColor : 'white',
                      border: `1.5px solid ${accentColor}`,
                      boxShadow: ctaLabel === 'Follow on X to join' ? 'none' : `0 0 20px ${accentColor}50`,
                    }}
                    onMouseEnter={(e) => {
                      if (ctaLabel === 'Follow on X to join') {
                        e.currentTarget.style.backgroundColor = `${accentColor}20`;
                      } else {
                        e.currentTarget.style.opacity = '0.9';
                        e.currentTarget.style.boxShadow = `0 0 30px ${accentColor}70`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (ctaLabel === 'Follow on X to join') {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      } else {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.boxShadow = `0 0 20px ${accentColor}50`;
                      }
                    }}
                  >
                    {ctaLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Follow on X Modal */}
      {showFollowModal && (
        <FollowModal
          project={projects.find(p => p.project_id === showFollowModal)}
          onClose={() => setShowFollowModal(null)}
        />
      )}
    </>
  );
}

// =============================================================================
// FOLLOW MODAL COMPONENT
// =============================================================================

interface FollowModalProps {
  project: CampaignProject | undefined;
  onClose: () => void;
}

function FollowModal({ project, onClose }: FollowModalProps) {
  if (!project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-akari-text">
            Follow on X to Join
          </h3>
          <button
            onClick={onClose}
            className="text-akari-muted hover:text-akari-text transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-akari-muted mb-6">
          To join this campaign, you must first follow{' '}
          {project.name || 'this project'} on X (Twitter).
        </p>

        {project.twitter_username && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
            >
              Cancel
            </button>
            <a
              href={`https://x.com/${project.twitter_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors text-center"
            >
              Follow on X
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
