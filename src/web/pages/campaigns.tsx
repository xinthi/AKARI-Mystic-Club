/**
 * Campaigns Page
 * 
 * Lists active and recently closed campaigns
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  rewards: string;
  status: string;
  tasks: any[];
  tasksWithStatus: Array<{
    taskId: string;
    completed: boolean;
    [key: string]: any;
  }>;
  endsAt: string;
  starsFee: number;
  winnerCount?: number;
  participantCount?: number;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [closedCampaigns, setClosedCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // Telegram BackButton - navigate to home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    let isNavigating = false;

    const handleBack = () => {
      if (isNavigating) return; // Prevent multiple navigations
      isNavigating = true;
      
      router.replace('/').catch((err) => {
        console.error('[Campaigns] Navigation error:', err);
        isNavigating = false;
      });
    };

    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);

    return () => {
      try {
        if (tg.BackButton?.offClick) {
          tg.BackButton.offClick(handleBack);
        } else {
          tg.BackButton.onClick(() => {});
        }
        tg.BackButton.hide();
      } catch (_) {
        // ignore
      }
    };
  }, [router]);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.error('Telegram WebApp SDK not available', e);
      }
    }
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      // Load active campaigns
      const response = await fetch('/api/campaigns', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load campaigns');
      }

      const data = await response.json();
      const allCampaigns: Campaign[] = data.campaigns || [];

      // Separate active and closed campaigns
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const active: Campaign[] = [];
      const closed: Campaign[] = [];

      allCampaigns.forEach(c => {
        const endDate = new Date(c.endsAt);
        const status = (c.status || 'ACTIVE').toUpperCase();
        const isEnded = status === 'ENDED' || endDate < now;
        
        if (isEnded) {
          // Only show closed campaigns from the last 6 months
          if (endDate >= sixMonthsAgo) {
            closed.push(c);
          }
        } else if (status === 'ACTIVE') {
          // Only show ACTIVE campaigns to users
          active.push(c);
        }
      });

      setActiveCampaigns(active);
      setClosedCampaigns(closed);
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Error loading campaigns:', err);
      setActiveCampaigns([]);
      setClosedCampaigns([]);
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  };

  const formatTimeRemaining = (endsAt: string) => {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff < 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days} days`;
    
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${hours} hours`;
  };

  const formatClosedDate = (endsAt: string) => {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = now.getTime() - end.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Ended today';
    if (days === 1) return 'Ended yesterday';
    if (days < 7) return `Ended ${days} days ago`;
    if (days < 30) return `Ended ${Math.floor(days / 7)} weeks ago`;
    return `Ended ${Math.floor(days / 30)} months ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading campaigns...</div>
      </div>
    );
  }

  const showError = error && activeCampaigns.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">📋 Campaigns</h1>
        <p className="text-purple-300">Complete tasks and earn rewards</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {showError && (
          <div className="bg-red-900/30 backdrop-blur-lg rounded-xl p-4 border border-red-500/20 mb-4">
            <div className="text-sm text-red-200 mb-2">{error}</div>
            <button
              onClick={loadCampaigns}
              className="text-xs px-3 py-1 bg-red-600 rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Active Campaigns */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="text-green-400">●</span> Active Campaigns
          </h2>
          
          {activeCampaigns.length === 0 ? (
            <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-purple-500/20">
              <div className="text-4xl mb-4">🔮</div>
              <div className="text-lg mb-2">No active campaigns</div>
              <div className="text-sm text-purple-300">Check back later for new opportunities</div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeCampaigns.map((campaign) => {
                const completedTasks = campaign.tasksWithStatus.filter(t => t.completed).length;
                const totalTasks = campaign.tasksWithStatus.length;
                const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
                const allComplete = completedTasks === totalTasks && totalTasks > 0;

                return (
                  <div
                    key={campaign.id}
                    className={`bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border ${
                      allComplete ? 'border-green-500/30' : 'border-purple-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-semibold">{campaign.name}</h3>
                      {allComplete && (
                        <span className="text-xs bg-green-600/30 text-green-400 px-2 py-1 rounded">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    {campaign.description && (
                      <p className="text-purple-200 text-sm mb-4">{campaign.description}</p>
                    )}

                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-purple-300">Progress</span>
                        <span className="text-purple-300">{completedTasks}/{totalTasks} tasks</span>
                      </div>
                      <div className="w-full bg-purple-800/30 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            allComplete ? 'bg-green-500' : 'bg-purple-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-sm text-purple-300 mb-2">Rewards:</div>
                      <div className="text-purple-200">{campaign.rewards}</div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-purple-500/20">
                      <div className="text-sm text-purple-300">
                        ⏱️ {formatTimeRemaining(campaign.endsAt)} left
                        {campaign.winnerCount && (
                          <span className="ml-2">• 🏆 Top {campaign.winnerCount}</span>
                        )}
                      </div>
                      <button
                        onClick={() => router.push(`/campaigns/${campaign.id}`)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold transition-colors"
                      >
                        {allComplete ? 'View Status' : 'View Tasks'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Closed Campaigns Section */}
        {closedCampaigns.length > 0 && (
          <div>
            <button
              onClick={() => setShowClosed(!showClosed)}
              className="w-full flex items-center justify-between text-lg font-semibold mb-3 bg-gray-800/30 rounded-lg p-3"
            >
              <span className="flex items-center gap-2">
                <span className="text-gray-400">●</span> Past Campaigns ({closedCampaigns.length})
              </span>
              <span className="text-purple-400">{showClosed ? '▼' : '▶'}</span>
            </button>
            
            {showClosed && (
              <div className="space-y-4">
                {closedCampaigns.map((campaign) => {
                  const completedTasks = campaign.tasksWithStatus.filter(t => t.completed).length;
                  const totalTasks = campaign.tasksWithStatus.length;
                  const allComplete = completedTasks === totalTasks && totalTasks > 0;

                  return (
                    <div
                      key={campaign.id}
                      className="bg-gray-800/30 backdrop-blur-lg rounded-xl p-4 border border-gray-600/30 opacity-80"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-300">{campaign.name}</h3>
                        <div className="flex gap-2">
                          {allComplete && (
                            <span className="text-xs bg-green-600/30 text-green-400 px-2 py-1 rounded">
                              ✓ Completed
                            </span>
                          )}
                          <span className="text-xs bg-gray-600/30 text-gray-400 px-2 py-1 rounded">
                            Ended
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-gray-400 mb-3">
                        {formatClosedDate(campaign.endsAt)}
                        <span className="mx-2">•</span>
                        {completedTasks}/{totalTasks} tasks completed
                        {campaign.participantCount && (
                          <>
                            <span className="mx-2">•</span>
                            {campaign.participantCount} participants
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-600/20">
                        <div className="text-sm text-gray-400">
                          🎁 {campaign.rewards}
                        </div>
                        <button
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                        >
                          View Results
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
