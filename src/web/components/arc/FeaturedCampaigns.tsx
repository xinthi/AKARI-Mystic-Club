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
  const isDevMode = process.env.NODE_ENV === 'development';
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
    <section className="mb-12">
      <h2 className="text-xl font-semibold mb-4 text-white">Featured Campaigns</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {featured.map((project) => {
          const accentColor = project.meta?.accent_color || '#6A5ACD';
          const bannerUrl = project.meta?.banner_url;
          const avatarUrl = getProjectAvatarUrl(project.twitter_username);
          const status = userCampaignStatuses?.get(project.project_id) || {
            isFollowing: false,
            hasJoined: false,
          };
          const isFollowing = status.isFollowing;
          const hasJoined = status.hasJoined;

          // In dev mode, treat as following
          const effectiveIsFollowing = isDevMode || isFollowing;

          let ctaLabel = 'Follow on X to join';
          let ctaAction: () => void = () => {
            if (isDevMode) {
              if (project.slug) {
                window.location.href = `/portal/arc/${project.slug}`;
              }
            } else if (project.twitter_username) {
              window.open(`https://x.com/${project.twitter_username}`, '_blank');
            }
          };

          if (effectiveIsFollowing && hasJoined) {
            ctaLabel = 'View missions';
            ctaAction = () => {
              if (project.slug) {
                window.location.href = `/portal/arc/${project.slug}`;
              }
            };
          } else if (effectiveIsFollowing && !hasJoined) {
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
              className="relative rounded-xl overflow-hidden shadow-lg bg-gradient-to-b from-black/20 to-black/60 border border-white/10 hover:border-white/20 transition-all hover:scale-[1.02]"
              style={{
                boxShadow: `0 0 12px ${accentColor}44`,
              }}
            >
              {/* Banner Background */}
              {bannerUrl && (
                <div
                  style={{ backgroundImage: `url(${bannerUrl})` }}
                  className="absolute inset-0 bg-cover bg-center opacity-40"
                />
              )}
              
              {/* Dark Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/80" />

              {/* Content */}
              <div className="relative p-6 flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="mb-4">
                  {avatarUrl ? (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0 mx-auto border-2 border-white/20">
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
                      className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto border-2 border-white/20"
                      style={{ backgroundColor: accentColor }}
                    >
                      {(project.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-white mb-1">
                  {project.name || 'Unnamed Project'}
                </h3>
                
                {project.twitter_username && (
                  <p className="text-sm text-white/60 mb-3">
                    @{project.twitter_username}
                  </p>
                )}

                {/* Tagline */}
                {project.meta?.tagline && (
                  <p className="text-sm text-white/70 mb-6 line-clamp-2">
                    {project.meta.tagline}
                  </p>
                )}

                {/* CTA Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      ctaAction();
                    } catch (err) {
                      console.error('[FeaturedCampaigns] Error in ctaAction:', err);
                    }
                  }}
                  className="w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-300 text-white cursor-pointer relative z-10"
                  style={{
                    backgroundColor: accentColor,
                    boxShadow: `0 0 20px ${accentColor}60`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 30px ${accentColor}80`;
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 20px ${accentColor}60`;
                    e.currentTarget.style.transform = 'scale(1)';
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
