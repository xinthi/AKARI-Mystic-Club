/**
 * Campaign Detail Page
 * 
 * Shows campaign tasks and allows completing them.
 * Tasks redirect users to the appropriate destinations (X, Telegram, etc.)
 * Users can share/invite friends to participate.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../../lib/telegram-webapp';

interface Task {
  taskId: string;
  completed: boolean;
  type: string;
  title: string;
  description?: string;
  targetUrl?: string;
  rewardPoints?: number;
  [key: string]: any;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  rewards: string;
  tasksWithStatus: Task[];
  endsAt: string;
  shareUrl?: string;
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [openedTasks, setOpenedTasks] = useState<Set<string>>(new Set()); // Track which tasks user has opened
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Telegram BackButton - navigate to campaigns list
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      router.push('/campaigns');
    });

    return () => {
      try {
        tg.BackButton.hide();
        tg.BackButton.onClick(() => {});
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
    if (id) {
      loadCampaign();
    }
  }, [id]);

  const loadCampaign = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch(`/api/campaigns/${id}`, {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load campaign');
      }

      const data = await response.json();
      setCampaign(data.campaign);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading campaign:', err);
      setError(err.message || 'Failed to load campaign');
      setLoading(false);
    }
  };

  // Get the appropriate icon for task type
  const getTaskIcon = (type: string): string => {
    switch (type) {
      case 'X_FOLLOW':
        return '👤';
      case 'X_LIKE':
        return '❤️';
      case 'X_RETWEET':
        return '🔄';
      case 'TELEGRAM_JOIN':
        return '📱';
      case 'VISIT_URL':
        return '🔗';
      default:
        return '✨';
    }
  };

  // Get the action button label based on task type
  const getActionLabel = (type: string): string => {
    switch (type) {
      case 'X_FOLLOW':
        return 'Go to X Profile';
      case 'X_LIKE':
        return 'Go to Tweet';
      case 'X_RETWEET':
        return 'Go to Tweet';
      case 'TELEGRAM_JOIN':
        return 'Open Telegram';
      case 'VISIT_URL':
        return 'Visit Link';
      default:
        return 'Open Link';
    }
  };

  // Open the task URL
  const openTaskUrl = (task: Task) => {
    if (!task.targetUrl) {
      showToast('No link configured for this task', 'error');
      return;
    }

    const tg = (window as any).Telegram?.WebApp;
    const url = task.targetUrl;

    console.log('[Campaign] Opening URL:', url);

    // Mark this task as opened
    setOpenedTasks(prev => new Set(prev).add(task.taskId));

    // For Telegram links, use openTelegramLink
    if (task.type === 'TELEGRAM_JOIN' && url.includes('t.me')) {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    } 
    // For external links (X/Twitter, etc)
    else {
      if (tg?.openLink) {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  // Verify/complete the task
  const verifyTask = async (task: Task) => {
    const taskIdentifier = task.taskId || (task as any).id;
    setCompletingTask(taskIdentifier);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch(`/api/campaigns/${id}/complete-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ taskId: taskIdentifier }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to complete task');
      }

      showToast(data.message || 'Task completed!', 'success');
      loadCampaign(); // Reload to show updated progress
    } catch (err: any) {
      console.error('Error completing task:', err);
      showToast(err.message || 'Failed to complete task', 'error');
    } finally {
      setCompletingTask(null);
    }
  };

  // Share campaign with friends
  const shareCampaign = () => {
    if (!campaign) return;

    const tg = (window as any).Telegram?.WebApp;
    const shareText = `🔮 Join me in "${campaign.name}" on AKARI Mystic Club!\n\n${campaign.description || 'Complete tasks to earn rewards!'}\n\n🎁 Rewards: ${campaign.rewards}`;
    const shareUrl = `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'AKARIMystic_Bot'}?start=campaign_${campaign.id}`;

    if (tg?.openTelegramLink) {
      const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      tg.openTelegramLink(telegramShareUrl);
    } else {
      const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      window.open(telegramShareUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error || 'Campaign not found'}</div>
        </div>
      </div>
    );
  }

  const completedCount = campaign.tasksWithStatus.filter(t => t.completed).length;
  const totalTasks = campaign.tasksWithStatus.length;
  const progress = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
  const allCompleted = completedCount === totalTasks && totalTasks > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <header className="p-6 pb-4">
        <button
          onClick={() => router.back()}
          className="text-purple-300 mb-4 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold mb-2">{campaign.name}</h1>
        {campaign.description && (
          <p className="text-purple-300">{campaign.description}</p>
        )}
      </header>

      <div className="px-6 pb-6 space-y-6">
        {/* Progress */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold">Progress</div>
            <div className="text-purple-300">{completedCount}/{totalTasks} tasks</div>
          </div>
          <div className="w-full bg-purple-800/30 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                allCompleted ? 'bg-green-500' : 'bg-purple-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {allCompleted && (
            <div className="mt-3 text-green-400 text-sm font-semibold">
              🎉 All tasks completed! Rewards claimed.
            </div>
          )}
        </div>

        {/* Rewards */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="text-lg font-semibold mb-2">🎁 Rewards</div>
          <div className="text-purple-200">{campaign.rewards}</div>
        </div>

        {/* Invite Friends */}
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-lg rounded-xl p-4 border border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <span>👥</span> Invite Friends
              </div>
              <div className="text-sm text-blue-300 mt-1">
                Earn bonus points for each friend who joins!
              </div>
            </div>
            <button
              onClick={shareCampaign}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-sm transition-colors"
            >
              Share 🔗
            </button>
          </div>
        </div>

        {/* Tasks */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Tasks</h2>
          <div className="space-y-3">
            {campaign.tasksWithStatus.map((task, index) => {
              const hasUrl = !!task.targetUrl;
              const hasOpened = openedTasks.has(task.taskId);
              const isVerifying = completingTask === (task.taskId || (task as any).id);

              return (
                <div
                  key={task.taskId}
                  className={`bg-purple-900/30 backdrop-blur-lg rounded-xl p-4 border transition-all ${
                    task.completed
                      ? 'border-green-500/30 bg-green-900/10'
                      : 'border-purple-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">
                        <span className="text-lg">{getTaskIcon(task.type)}</span>
                        <span className={task.completed ? 'text-green-300' : ''}>
                          {index + 1}. {task.title || `Task ${index + 1}`}
                        </span>
                        {task.completed && (
                          <span className="text-green-400">✓</span>
                        )}
                      </div>
                      {task.description && (
                        <div className="text-sm text-purple-300 mt-1 ml-7">{task.description}</div>
                      )}
                      {task.rewardPoints && task.rewardPoints > 0 && (
                        <div className="text-xs text-amber-400 mt-1 ml-7">
                          +{task.rewardPoints} aXP
                        </div>
                      )}
                    </div>
                  </div>

                  {task.completed ? (
                    <div className="mt-3 flex items-center justify-center gap-2 py-2 bg-green-600/20 rounded-lg text-green-400 font-semibold">
                      <span>✓</span>
                      <span>Completed</span>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {/* Step 1: Open the link */}
                      {hasUrl && (
                        <button
                          onClick={() => openTaskUrl(task)}
                          className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                            hasOpened
                              ? 'bg-gray-600 text-gray-300'
                              : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white'
                          }`}
                        >
                          {hasOpened ? (
                            <>
                              <span>✓</span>
                              <span>Opened - {getActionLabel(task.type)}</span>
                            </>
                          ) : (
                            <>
                              <span>{getTaskIcon(task.type)}</span>
                              <span>{getActionLabel(task.type)}</span>
                              <span>→</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Step 2: Verify completion */}
                      <button
                        onClick={() => verifyTask(task)}
                        disabled={isVerifying || (hasUrl && !hasOpened)}
                        className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                          hasUrl && !hasOpened
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-500 text-white'
                        } ${isVerifying ? 'opacity-50' : ''}`}
                      >
                        {isVerifying ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : hasUrl && !hasOpened ? (
                          <span>Complete step above first ↑</span>
                        ) : (
                          <>
                            <span>✓</span>
                            <span>Verify & Complete</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
