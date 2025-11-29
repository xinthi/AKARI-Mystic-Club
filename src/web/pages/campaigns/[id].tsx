/**
 * Campaign Detail Page
 * 
 * Shows campaign tasks and allows completing them.
 * Tasks redirect users to the appropriate destinations (X, Telegram, etc.)
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
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
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

  // Get the button label based on task type
  const getButtonLabel = (type: string): string => {
    switch (type) {
      case 'X_FOLLOW':
        return 'Follow on X';
      case 'X_LIKE':
        return 'Like on X';
      case 'X_RETWEET':
        return 'Repost on X';
      case 'TELEGRAM_JOIN':
        return 'Join Telegram';
      case 'VISIT_URL':
        return 'Visit Link';
      default:
        return 'Complete Task';
    }
  };

  // Open the task URL in appropriate way
  const openTaskUrl = (task: Task) => {
    if (!task.targetUrl) return;

    const tg = (window as any).Telegram?.WebApp;

    // For Telegram links, use openTelegramLink
    if (task.type === 'TELEGRAM_JOIN' && task.targetUrl.includes('t.me')) {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(task.targetUrl);
      } else {
        window.open(task.targetUrl, '_blank');
      }
    } 
    // For X/Twitter links, open externally
    else if (task.type.startsWith('X_') && (task.targetUrl.includes('twitter.com') || task.targetUrl.includes('x.com'))) {
      if (tg?.openLink) {
        tg.openLink(task.targetUrl);
      } else {
        window.open(task.targetUrl, '_blank');
      }
    }
    // For other URLs
    else {
      if (tg?.openLink) {
        tg.openLink(task.targetUrl);
      } else {
        window.open(task.targetUrl, '_blank');
      }
    }
  };

  const completeTask = async (task: Task) => {
    const taskIdentifier = task.taskId || (task as any).id;
    
    // If task has a URL, open it first
    if (task.targetUrl && !task.completed) {
      openTaskUrl(task);
      
      // For X tasks (which can't be verified), mark complete after opening
      if (task.type.startsWith('X_')) {
        // Small delay to let the user see they're being redirected
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // For Telegram tasks, the backend will verify
    }

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

        {/* Tasks */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Tasks</h2>
          <div className="space-y-3">
            {campaign.tasksWithStatus.map((task, index) => (
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
                  <button
                    onClick={() => completeTask(task)}
                    disabled={completingTask === (task.taskId || (task as any).id)}
                    className="mt-3 w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:from-purple-800 disabled:to-purple-800 disabled:opacity-50 rounded-lg py-3 font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    {completingTask === (task.taskId || (task as any).id) ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>{getTaskIcon(task.type)}</span>
                        <span>{getButtonLabel(task.type)}</span>
                        {task.targetUrl && <span>→</span>}
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
