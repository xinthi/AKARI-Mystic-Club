/**
 * My Campaigns Component
 * 
 * Shows campaigns the user has already joined
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface UserCampaign {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arcPoints: number;
  ring?: string;
  rank?: number;
  meta?: {
    accent_color?: string | null;
  };
}

interface MyCampaignsProps {
  campaigns: UserCampaign[];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MyCampaigns({ campaigns }: MyCampaignsProps) {
  if (campaigns.length === 0) {
    return null;
  }

  const getRingColor = (ring?: string) => {
    switch (ring?.toLowerCase()) {
      case 'core':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
      case 'momentum':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'discovery':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold mb-4 text-white">My Campaigns</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {campaigns.map((campaign) => {
          const accentColor = campaign.meta?.accent_color || '#6A5ACD';
          
          return (
            <Link
              key={campaign.project_id}
              href={campaign.slug ? `/portal/arc/${campaign.slug}` : '#'}
              className="flex-shrink-0 w-72 rounded-xl border border-white/10 overflow-hidden bg-black/40 hover:border-white/20 hover:shadow-lg transition-all duration-300 group"
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
              <div className="p-5">
                {/* Project name */}
                <h3 className="text-lg font-bold text-white mb-4 truncate">
                  {campaign.name || 'Unnamed Project'}
                </h3>

                {/* Stats row */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">ARC Points</span>
                    <span className="text-base font-bold text-white">
                      {campaign.arcPoints.toLocaleString()}
                    </span>
                  </div>

                  {campaign.ring && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/60">Ring</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRingColor(campaign.ring)}`}>
                        {campaign.ring}
                      </span>
                    </div>
                  )}

                  {campaign.rank && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/60">Rank</span>
                      <span className="text-base font-bold text-white">
                        #{campaign.rank}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mb-4 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: '60%', // Placeholder - would be calculated from actual progress
                      backgroundColor: accentColor,
                      boxShadow: `0 0 10px ${accentColor}80`,
                    }}
                  />
                </div>

                {/* CTA */}
                <div className="text-center">
                  <span className="text-sm text-white/80 group-hover:text-white transition-colors font-medium">
                    View missions →
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
