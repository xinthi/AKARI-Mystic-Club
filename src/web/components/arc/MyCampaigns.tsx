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
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-akari-text">My Campaigns</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {campaigns.map((campaign) => {
          const accentColor = campaign.meta?.accent_color || '#8B5CF6';
          
          return (
            <Link
              key={campaign.project_id}
              href={campaign.slug ? `/portal/arc/${campaign.slug}` : '#'}
              className="flex-shrink-0 w-64 rounded-xl border border-slate-700 p-4 bg-akari-card hover:border-opacity-60 transition-all duration-300 group"
              style={{
                borderColor: `${accentColor}40`,
              }}
            >
              {/* Project name */}
              <h3 className="text-base font-semibold text-akari-text mb-2 truncate">
                {campaign.name || 'Unnamed Project'}
              </h3>

              {/* Stats row */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-akari-muted">ARC Points</span>
                  <span className="text-sm font-semibold text-akari-text">
                    {campaign.arcPoints.toLocaleString()}
                  </span>
                </div>

                {campaign.ring && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-akari-muted">Ring</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRingColor(campaign.ring)}`}>
                      {campaign.ring}
                    </span>
                  </div>
                )}

                {campaign.rank && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-akari-muted">Rank</span>
                    <span className="text-sm font-semibold text-akari-text">
                      #{campaign.rank}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar placeholder */}
              <div className="mt-3 h-1.5 bg-akari-cardSoft/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: '60%', // Placeholder - would be calculated from actual progress
                    backgroundColor: accentColor,
                    boxShadow: `0 0 10px ${accentColor}60`,
                  }}
                />
              </div>

              {/* CTA */}
              <div className="mt-3 text-center">
                <span className="text-xs text-akari-muted group-hover:text-akari-primary transition-colors">
                  View missions →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
