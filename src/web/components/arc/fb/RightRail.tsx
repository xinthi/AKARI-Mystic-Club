/**
 * ARC Facebook-style Right Rail
 * 
 * Filters and widgets sidebar
 */

import React, { useState, useEffect } from 'react';
import { LiveItem } from '@/lib/arc/useArcLiveItems';
import { useAkariUser } from '@/lib/akari-auth';
import Link from 'next/link';

interface RightRailProps {
  liveItems: LiveItem[];
  upcomingItems: LiveItem[];
  kindFilter: 'all' | 'arena' | 'campaign' | 'gamified';
  timeFilter: 'all' | 'live' | 'upcoming';
  onKindFilterChange: (filter: 'all' | 'arena' | 'campaign' | 'gamified') => void;
  onTimeFilterChange: (filter: 'all' | 'live' | 'upcoming') => void;
}

interface CreatorCircle {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  member_profile?: {
    username: string;
    name: string;
    profile_image_url: string | null;
  };
  creator_profile?: {
    username: string;
    name: string;
    profile_image_url: string | null;
  };
  initiated_by_profile_id: string;
}

interface CrmMessage {
  id: string;
  subject: string;
  is_read: boolean;
  has_proposal: boolean;
  project?: {
    name: string;
    slug: string | null;
  };
}

interface CrmProposal {
  id: string;
  status: 'pending' | 'accepted' | 'countered' | 'rejected';
  initial_price_amount: number;
  initial_price_currency: string;
  project?: {
    name: string;
  };
}

export function RightRail({
  liveItems,
  upcomingItems,
  kindFilter,
  timeFilter,
  onKindFilterChange,
  onTimeFilterChange,
}: RightRailProps) {
  const akariUser = useAkariUser();
  const [creatorCircles, setCreatorCircles] = useState<CreatorCircle[]>([]);
  const [pendingReceived, setPendingReceived] = useState(0);
  const [crmMessages, setCrmMessages] = useState<CrmMessage[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [crmProposals, setCrmProposals] = useState<CrmProposal[]>([]);
  const [pendingProposals, setPendingProposals] = useState(0);

  // Fetch creator circles
  useEffect(() => {
    if (!akariUser.isLoggedIn) return;

    fetch('/api/portal/creator-circles', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setCreatorCircles(data.circles || []);
          setPendingReceived(data.pendingReceivedCount || 0);
        }
      })
      .catch((err) => console.error('[RightRail] Error fetching circles:', err));
  }, [akariUser.isLoggedIn]);

  // Fetch CRM messages
  useEffect(() => {
    if (!akariUser.isLoggedIn) return;

    fetch('/api/portal/crm/messages', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setCrmMessages((data.messages || []).slice(0, 5)); // Show top 5
          setUnreadMessages(data.unreadCount || 0);
        }
      })
      .catch((err) => console.error('[RightRail] Error fetching messages:', err));
  }, [akariUser.isLoggedIn]);

  // Fetch CRM proposals
  useEffect(() => {
    if (!akariUser.isLoggedIn) return;

    fetch('/api/portal/crm/proposals', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setCrmProposals((data.proposals || []).slice(0, 5)); // Show top 5
          setPendingProposals(data.pendingCount || 0);
        }
      })
      .catch((err) => console.error('[RightRail] Error fetching proposals:', err));
  }, [akariUser.isLoggedIn]);

  // Calculate top projects (top 5 by creatorCount)
  const topProjects = [...liveItems, ...upcomingItems]
    .sort((a, b) => b.creatorCount - a.creatorCount)
    .slice(0, 5);

  return (
    <div className="w-64 flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Filters */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Filters</h3>
          
          {/* Kind Filter */}
          <div className="mb-4">
            <div className="text-xs font-medium text-white/60 mb-2 uppercase">Kind</div>
            <div className="space-y-1">
              {(['all', 'arena', 'campaign', 'gamified'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => onKindFilterChange(kind)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    kindFilter === kind
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {kind === 'all' ? 'All' : kind.charAt(0).toUpperCase() + kind.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Time Filter */}
          <div>
            <div className="text-xs font-medium text-white/60 mb-2 uppercase">Time</div>
            <div className="space-y-1">
              {(['all', 'live', 'upcoming'] as const).map((time) => (
                <button
                  key={time}
                  onClick={() => onTimeFilterChange(time)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    timeFilter === time
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {time === 'all' ? 'All' : time.charAt(0).toUpperCase() + time.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats Widget */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Quick Stats</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Total Live</span>
              <span className="text-sm font-medium text-white">{liveItems.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Total Upcoming</span>
              <span className="text-sm font-medium text-white">{upcomingItems.length}</span>
            </div>
          </div>
        </div>

        {/* Top Projects Widget */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top Projects</h3>
          {topProjects.length === 0 ? (
            <p className="text-xs text-white/60">N/A</p>
          ) : (
            <div className="space-y-2">
              {topProjects.map((project, index) => (
                <div key={project.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 w-4">{index + 1}</span>
                    <span className="text-white/80 truncate">{project.project.name}</span>
                  </div>
                  <span className="text-white/60">{project.creatorCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Creator Circle Widget */}
        {akariUser.isLoggedIn && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Creator Circle</h3>
              {pendingReceived > 0 && (
                <span className="bg-akari-primary text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingReceived}
                </span>
              )}
            </div>
            {creatorCircles.length === 0 ? (
              <p className="text-xs text-white/60">No connections yet</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Connected</span>
                  <span className="text-white font-medium">
                    {creatorCircles.filter((c) => c.status === 'accepted').length}
                  </span>
                </div>
                {pendingReceived > 0 && (
                  <Link
                    href="/portal/arc/creator-circles"
                    className="block text-xs text-akari-primary hover:text-akari-primary/80 transition-colors"
                  >
                    {pendingReceived} pending request{pendingReceived > 1 ? 's' : ''}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* CRM Messages Widget */}
        {akariUser.isLoggedIn && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Messages</h3>
              {unreadMessages > 0 && (
                <span className="bg-akari-primary text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadMessages}
                </span>
              )}
            </div>
            {crmMessages.length === 0 ? (
              <p className="text-xs text-white/60">No messages</p>
            ) : (
              <div className="space-y-2">
                {crmMessages.map((msg) => (
                  <Link
                    key={msg.id}
                    href={`/portal/arc/crm/messages/${msg.id}`}
                    className={`block text-xs truncate ${
                      msg.is_read ? 'text-white/60' : 'text-white font-medium'
                    } hover:text-akari-primary transition-colors`}
                  >
                    {msg.project?.name || 'Project'}: {msg.subject}
                    {msg.has_proposal && (
                      <span className="ml-1 text-akari-primary">💰</span>
                    )}
                  </Link>
                ))}
                <Link
                  href="/portal/arc/crm/messages"
                  className="block text-xs text-akari-primary hover:text-akari-primary/80 transition-colors mt-2"
                >
                  View all messages →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* CRM Proposals Widget */}
        {akariUser.isLoggedIn && pendingProposals > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Deal Proposals</h3>
              <span className="bg-akari-primary text-black text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingProposals}
              </span>
            </div>
            <div className="space-y-2">
              {crmProposals
                .filter((p) => p.status === 'pending')
                .slice(0, 3)
                .map((prop) => (
                  <Link
                    key={prop.id}
                    href={`/portal/arc/crm/proposals/${prop.id}`}
                    className="block text-xs text-white/80 hover:text-akari-primary transition-colors"
                  >
                    {prop.project?.name || 'Project'}:{' '}
                    {prop.initial_price_amount} {prop.initial_price_currency}
                  </Link>
                ))}
              <Link
                href="/portal/arc/crm/proposals"
                className="block text-xs text-akari-primary hover:text-akari-primary/80 transition-colors mt-2"
              >
                View all proposals →
              </Link>
            </div>
          </div>
        )}

        {/* Top Creators Today Widget */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top Creators Today</h3>
          <p className="text-xs text-white/60">N/A</p>
        </div>
      </div>
    </div>
  );
}

