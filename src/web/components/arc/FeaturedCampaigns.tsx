/**
 * Featured Campaigns Component
 * 
 * Displays 2-4 highlighted ARC projects in a horizontal carousel
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface FeaturedProject {
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
}

interface FeaturedCampaignsProps {
  projects: FeaturedProject[];
  userTwitterUsername?: string | null;
  userCampaignStatuses?: Map<string, { isFollowing: boolean; hasJoined: boolean }>;
  onJoinCampaign?: (projectId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FeaturedCampaigns({ 
  projects, 
  userTwitterUsername,
  userCampaignStatuses,
  onJoinCampaign 
}: FeaturedCampaignsProps) {
  // Get featured projects (first 4 active projects)
  const featured = projects
    .filter(p => p.arc_status === 'active')
    .slice(0, 4);

  if (featured.length === 0) {
    return null;
  }

  const getProjectAvatarUrl = (username: string | null) => {
    if (!username) return null;
    return `https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=false`;
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-akari-text">Featured Campaigns</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {featured.map((project) => {
          const accentColor = project.meta?.accent_color || '#8B5CF6';
          const bannerUrl = project.meta?.banner_url;
          const avatarUrl = getProjectAvatarUrl(project.twitter_username);
          const status = userCampaignStatuses?.get(project.project_id) || {
            isFollowing: false,
            hasJoined: false,
          };
          const isFollowing = status.isFollowing;
          const hasJoined = status.hasJoined;

          let ctaLabel = 'Follow on X to join';
          let ctaAction: () => void = () => {
            if (project.twitter_username) {
              window.open(`https://x.com/${project.twitter_username}`, '_blank');
            }
          };

          if (isFollowing && hasJoined) {
            ctaLabel = 'View campaign';
            ctaAction = () => {
              if (project.slug) {
                window.location.href = `/portal/arc/${project.slug}`;
              }
            };
          } else if (isFollowing && !hasJoined) {
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
                borderColor: `${accentColor}40`,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}
            >
              {/* Banner */}
              {bannerUrl && (
                <div className="relative w-full h-32 bg-akari-cardSoft/30 overflow-hidden">
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
              )}

              <div className="p-4">
                {/* Avatar and name */}
                <div className="flex items-center gap-3 mb-3">
                  {avatarUrl ? (
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
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
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: accentColor }}
                    >
                      {(project.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-akari-text truncate">
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

                {/* CTA Button */}
                <button
                  onClick={ctaAction}
                  className="w-full px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 text-white"
                  style={{
                    backgroundColor: accentColor,
                    boxShadow: `0 0 20px ${accentColor}40`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 30px ${accentColor}60`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 20px ${accentColor}40`;
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
  );
}
