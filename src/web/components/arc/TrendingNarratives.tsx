/**
 * Trending Narratives Component
 * 
 * Displays trending topics/narratives related to ARC campaigns
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface TrendingNarrative {
  id: string;
  label: string;
  postCount?: number;
  creatorCount?: number;
  associatedCampaigns?: Array<{
    project_id: string;
    slug: string | null;
    name: string | null;
  }>;
}

interface TrendingNarrativesProps {
  narratives?: TrendingNarrative[];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TrendingNarratives({ narratives }: TrendingNarrativesProps) {
  // Placeholder data if narratives not provided
  const displayNarratives: TrendingNarrative[] = narratives || [
    {
      id: '1',
      label: 'on-chain gaming',
      postCount: 1240,
      creatorCount: 45,
      associatedCampaigns: [],
    },
    {
      id: '2',
      label: 'RWA',
      postCount: 890,
      creatorCount: 32,
      associatedCampaigns: [],
    },
    {
      id: '3',
      label: 'DeFi innovation',
      postCount: 2100,
      creatorCount: 78,
      associatedCampaigns: [],
    },
  ];

  if (displayNarratives.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-akari-text">Trending Narratives</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayNarratives.map((narrative) => (
          <div
            key={narrative.id}
            className="rounded-xl border border-slate-700 p-5 bg-akari-card hover:border-akari-primary/30 transition-all duration-300"
          >
            <h3 className="text-lg font-semibold text-akari-text mb-3 capitalize">
              {narrative.label}
            </h3>

            <div className="space-y-2 mb-4">
              {narrative.postCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-akari-muted">Related Posts</span>
                  <span className="text-akari-text font-medium">
                    {narrative.postCount.toLocaleString()}
                  </span>
                </div>
              )}
              {narrative.creatorCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-akari-muted">Creators</span>
                  <span className="text-akari-text font-medium">
                    {narrative.creatorCount}
                  </span>
                </div>
              )}
            </div>

            {/* Associated campaigns */}
            {narrative.associatedCampaigns && narrative.associatedCampaigns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-akari-border/20">
                <p className="text-xs text-akari-muted mb-2">Related Campaigns</p>
                <div className="flex flex-wrap gap-2">
                  {narrative.associatedCampaigns.slice(0, 3).map((campaign) => (
                    <Link
                      key={campaign.project_id}
                      href={campaign.slug ? `/portal/arc/${campaign.slug}` : '#'}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-akari-cardSoft/30 border border-akari-border/30 text-akari-text hover:bg-akari-cardSoft/50 transition-colors"
                    >
                      {campaign.name || 'Campaign'}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
