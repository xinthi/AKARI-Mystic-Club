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
    <section className="mb-12">
      <h2 className="text-xl font-semibold mb-4 text-white">Trending Narratives</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayNarratives.map((narrative) => (
          <div
            key={narrative.id}
            className="rounded-xl border border-white/10 p-5 bg-black/40 hover:border-white/20 hover:shadow-lg transition-all duration-300"
            style={{
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h3 className="text-lg font-bold text-white mb-4 capitalize">
              {narrative.label}
            </h3>

            <div className="space-y-2 mb-4">
              {narrative.postCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Related Posts</span>
                  <span className="text-white font-semibold">
                    {narrative.postCount.toLocaleString()}
                  </span>
                </div>
              )}
              {narrative.creatorCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Creators</span>
                  <span className="text-white font-semibold">
                    {narrative.creatorCount}
                  </span>
                </div>
              )}
            </div>

            {/* Associated campaigns */}
            {narrative.associatedCampaigns && narrative.associatedCampaigns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-white/60 mb-2">Related Campaigns</p>
                <div className="flex flex-wrap gap-2">
                  {narrative.associatedCampaigns.slice(0, 3).map((campaign) => (
                    <Link
                      key={campaign.project_id}
                      href={campaign.slug ? `/portal/arc/${campaign.slug}` : '#'}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
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
