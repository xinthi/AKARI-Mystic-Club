/**
 * Campaign Detail Page
 * 
 * Shows campaign tasks and allows completing them
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const TelegramWebApp = dynamic(() => import('@twa-dev/sdk'), { ssr: false });

interface Task {
  taskId: string;
  completed: boolean;
  type: string;
  title: string;
  description?: string;
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

  useEffect(() => {
    if (id) {
      loadCampaign();
    }
  }, [id]);

  const loadCampaign = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await TelegramWebApp;
        // @ts-ignore
        initData = (sdk as any).initData || '';
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

  const completeTask = async (taskIndex: number) => {
    setCompletingTask(`${id}_${taskIndex}`);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await TelegramWebApp;
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const response = await fetch(`/api/campaigns/${id}/complete-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ taskIndex }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete task');
      }

      const data = await response.json();
      alert(data.message);
      loadCampaign(); // Reload to show updated progress
    } catch (err: any) {
      console.error('Error completing task:', err);
      alert(err.message || 'Failed to complete task');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
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
              className="bg-purple-500 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
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
                className={`bg-purple-900/30 backdrop-blur-lg rounded-xl p-4 border ${
                  task.completed
                    ? 'border-green-500/30 bg-green-900/10'
                    : 'border-purple-500/20'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-2">
                      {task.completed ? '✓' : `${index + 1}.`} {task.title || `Task ${index + 1}`}
                    </div>
                    {task.description && (
                      <div className="text-sm text-purple-300 mt-1">{task.description}</div>
                    )}
                  </div>
                  {task.completed && (
                    <span className="text-green-400 text-sm">Completed</span>
                  )}
                </div>

                {!task.completed && (
                  <button
                    onClick={() => completeTask(index)}
                    disabled={completingTask === task.taskId}
                    className="mt-3 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold transition-colors"
                  >
                    {completingTask === task.taskId ? 'Completing...' : 'Complete Task'}
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

