/**
 * Active Quests Panel Component
 * 
 * Displays active quests for a project in the right rail (desktop) or collapsible panel (mobile).
 * Shows when viewing project hub pages with gamified (Option 3) enabled.
 */

import React, { useState } from 'react';
import Link from 'next/link';

interface Quest {
  id: string;
  name: string;
  title?: string;
  description?: string | null;
  narrative_focus?: string | null;
  points_reward?: number;
  reward_desc?: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
}

interface ActiveQuestsPanelProps {
  projectId: string;
  quests: Quest[];
  userCompletions?: Set<string> | string[];
  loading?: boolean;
  mobile?: boolean;
}

export function ActiveQuestsPanel({
  projectId,
  quests,
  userCompletions = [],
  loading = false,
  mobile = false,
}: ActiveQuestsPanelProps) {
  const [expanded, setExpanded] = useState(!mobile); // Desktop: expanded by default, mobile: collapsed

  // Normalize completions to Set
  const completedIds = React.useMemo(() => {
    if (userCompletions instanceof Set) {
      return userCompletions;
    }
    return new Set(userCompletions || []);
  }, [userCompletions]);

  // Filter to active quests only
  const activeQuests = React.useMemo(() => {
    return quests.filter(q => q.status === 'active' || q.status === 'draft');
  }, [quests]);

  // Get quest display name
  const getQuestName = (quest: Quest) => {
    return quest.title || quest.name || 'Untitled Quest';
  };

  // Get quest description
  const getQuestDescription = (quest: Quest) => {
    return quest.narrative_focus || quest.description || null;
  };

  // Get quest points
  const getQuestPoints = (quest: Quest) => {
    if (quest.points_reward) return quest.points_reward;
    if (quest.reward_desc) {
      const parsed = parseInt(quest.reward_desc);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Check if quest is completed
  const isQuestCompleted = (quest: Quest) => {
    // Try to match by mission_id from quest name (heuristic)
    const questKey = quest.name?.toLowerCase().trim() || '';
    const knownMissionIds: Record<string, string> = {
      'intro-thread': 'intro-thread',
      'intro thread': 'intro-thread',
      'meme-drop': 'meme-drop',
      'meme drop': 'meme-drop',
      'signal-boost': 'signal-boost',
      'signal boost': 'signal-boost',
      'deep-dive': 'deep-dive',
      'deep dive': 'deep-dive',
    };
    const missionId = knownMissionIds[questKey] || questKey;
    return completedIds.has(missionId);
  };

  if (mobile) {
    // Mobile: Collapsible panel
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        >
          <h3 className="text-sm font-semibold text-white">Active Quests</h3>
          <svg
            className={`w-5 h-5 text-white/60 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="p-4 pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
              </div>
            ) : activeQuests.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-white/60 mb-2">No active quests</p>
                <Link
                  href={`/portal/arc/gamified/${projectId}`}
                  className="text-xs text-akari-primary hover:text-akari-primary/80 transition-colors"
                >
                  View all quests
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {activeQuests.slice(0, 5).map((quest) => {
                  const isCompleted = isQuestCompleted(quest);
                  return (
                    <div
                      key={quest.id}
                      className="rounded-lg border border-white/10 bg-black/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-xs font-semibold text-white flex-1 min-w-0">
                          {getQuestName(quest)}
                        </h4>
                        {isCompleted && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                            Done
                          </span>
                        )}
                      </div>
                      {getQuestDescription(quest) && (
                        <p className="text-[10px] text-white/60 mb-2 line-clamp-2">
                          {getQuestDescription(quest)}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                          +{getQuestPoints(quest)} points
                        </span>
                        <Link
                          href={`/portal/arc/gamified/${projectId}`}
                          className="text-[10px] text-akari-primary hover:text-akari-primary/80 transition-colors"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {activeQuests.length > 5 && (
                  <Link
                    href={`/portal/arc/gamified/${projectId}`}
                    className="block text-center text-xs text-white/60 hover:text-white transition-colors py-2"
                  >
                    View all {activeQuests.length} quests →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Desktop: Right rail component
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Active Quests</h3>
        <Link
          href={`/portal/arc/gamified/${projectId}`}
          className="text-xs text-akari-primary hover:text-akari-primary/80 transition-colors"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      ) : activeQuests.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-white/60 mb-2">No active quests</p>
          <Link
            href={`/portal/arc/gamified/${projectId}`}
            className="text-xs text-akari-primary hover:text-akari-primary/80 transition-colors"
          >
            View quests
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {activeQuests.slice(0, 5).map((quest) => {
            const isCompleted = isQuestCompleted(quest);
            return (
              <div
                key={quest.id}
                className="rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-white flex-1 min-w-0 line-clamp-2">
                    {getQuestName(quest)}
                  </h4>
                  {isCompleted && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                      Done
                    </span>
                  )}
                </div>
                {getQuestDescription(quest) && (
                  <p className="text-[10px] text-white/60 mb-2 line-clamp-2">
                    {getQuestDescription(quest)}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                    +{getQuestPoints(quest)} points
                  </span>
                  <Link
                    href={`/portal/arc/gamified/${projectId}`}
                    className="text-[10px] text-akari-primary hover:text-akari-primary/80 transition-colors"
                  >
                    View →
                  </Link>
                </div>
              </div>
            );
          })}
          {activeQuests.length > 5 && (
            <Link
              href={`/portal/arc/gamified/${projectId}`}
              className="block text-center text-xs text-white/60 hover:text-white transition-colors py-2"
            >
              View all {activeQuests.length} quests →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

