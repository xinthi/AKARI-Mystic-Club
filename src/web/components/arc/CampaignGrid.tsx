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
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-akari-text">All Campaigns</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const accentColor = project.meta?.accent_color || '#8B5CF6';
            const bannerUrl = project.meta?.banner_url;
            const avatarUrl = getProjectAvatarUrl(project.twitter_username);
            const status = userCampaignStatuses?.get(project.project_id) || {
              isFollowing: false,
              hasJoined: false,
            };

            let ctaLabel = 'Follow on X to join';
            let ctaAction: () => void = () => {
              if (isDevMode) {
                // In dev mode, allow direct navigation
                if (project.slug) {
                  window.location.href = `/portal/arc/${project.slug}`;
                }
              } else {
                setShowFollowModal(project.project_id);
              }
            };

            // In dev mode, treat as following
            const effectiveIsFollowing = isDevMode || status.isFollowing;

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
                className="rounded-xl border border-slate-700 overflow-hidden bg-akari-card hover:border-opacity-60 transition-all duration-300 group"
                style={{
                  borderColor: `${accentColor}30`,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              >
                {/* Banner */}
                {bannerUrl ? (
                  <div className="relative w-full h-40 bg-akari-cardSoft/30 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bannerUrl}
                      alt={`${project.name} banner`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    className="w-full h-40 bg-gradient-to-br opacity-20"
                    style={{
                      background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}40 100%)`,
                    }}
                  />
                )}

                <div className="p-5">
                  {/* Avatar and name */}
                  <div className="flex items-center gap-3 mb-3">
                    {avatarUrl ? (
                      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
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
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: accentColor }}
                      >
                        {(project.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-akari-text truncate">
                        {project.name || 'Unnamed Project'}
                      </h3>
                      {project.twitter_username && (
                        <p className="text-xs text-akari-muted">
                          @{project.twitter_username}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tagline */}
                  {project.meta?.tagline && (
                    <p className="text-sm text-akari-muted mb-4 line-clamp-2">
                      {project.meta.tagline}
                    </p>
                  )}

                  {/* Stats row */}
                  <div className="space-y-2 mb-4">
                    {project.stats?.creatorCount !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-akari-muted">Active Creators</span>
                        <span className="text-akari-text font-medium">
                          {project.stats.creatorCount}
                        </span>
                      </div>
                    )}
                    {project.stats?.totalPoints !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-akari-muted">Total ARC Points</span>
                        <span className="text-akari-text font-medium">
                          {project.stats.totalPoints.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {project.stats?.trend && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-akari-muted">Engagement</span>
                        <span className={`font-medium ${getTrendColor(project.stats.trend)}`}>
                          {getTrendIcon(project.stats.trend)} {project.stats.trend}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={ctaAction}
                    className="w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300"
                    style={{
                      backgroundColor: status.hasJoined ? accentColor : 'transparent',
                      color: status.hasJoined ? 'white' : accentColor,
                      border: `1.5px solid ${accentColor}`,
                      boxShadow: status.hasJoined ? `0 0 20px ${accentColor}40` : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!status.hasJoined) {
                        e.currentTarget.style.backgroundColor = `${accentColor}10`;
                      } else {
                        e.currentTarget.style.boxShadow = `0 0 30px ${accentColor}60`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!status.hasJoined) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      } else {
                        e.currentTarget.style.boxShadow = `0 0 20px ${accentColor}40`;
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
