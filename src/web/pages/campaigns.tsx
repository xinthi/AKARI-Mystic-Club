/**
 * Campaigns Page
 * 
 * Lists active campaigns with tasks
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  rewards: string;
  tasks: any[];
  tasksWithStatus: Array<{
    taskId: string;
    completed: boolean;
    [key: string]: any;
  }>;
  endsAt: string;
  starsFee: number;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const response = await fetch('/api/campaigns', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load campaigns');
      }

      const data = await response.json();
      setCampaigns(data.campaigns || []);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading campaigns:', err);
      setError(err.message || 'Failed to load campaigns');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading campaigns...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">📋 Campaigns</h1>
        <p className="text-purple-300">Complete tasks and earn rewards</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {campaigns.length === 0 ? (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-purple-500/20">
            <div className="text-4xl mb-4">🔮</div>
            <div className="text-lg mb-2">No active campaigns</div>
            <div className="text-sm text-purple-300">Check back later for new opportunities</div>
          </div>
        ) : (
          campaigns.map((campaign) => {
            const completedTasks = campaign.tasksWithStatus.filter(t => t.completed).length;
            const totalTasks = campaign.tasksWithStatus.length;
            const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

            return (
              <div
                key={campaign.id}
                className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20"
              >
                <h3 className="text-xl font-semibold mb-2">{campaign.name}</h3>
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
                      className="bg-purple-500 h-2 rounded-full transition-all"
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
                    {formatTimeRemaining(campaign.endsAt)} left
                  </div>
                  <button
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold transition-colors"
                  >
                    View Tasks
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

