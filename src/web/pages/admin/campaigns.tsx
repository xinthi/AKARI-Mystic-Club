/**
 * Admin Campaigns Page
 * 
 * Manage campaigns and tasks with proper URL support.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  targetUrl?: string;
  rewardPoints: number;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  rewards: string;
  startAt?: string;
  endsAt: string;
  tasks: Task[];
  participantCount: number;
}

// Task type configuration with descriptions and URL placeholders
const TASK_TYPES = {
  X_FOLLOW: {
    label: 'Follow on X',
    icon: '👤',
    urlPlaceholder: 'https://x.com/AkariMystic',
    urlLabel: 'X Profile URL',
    description: 'Follow an X account',
  },
  X_LIKE: {
    label: 'Like on X',
    icon: '❤️',
    urlPlaceholder: 'https://x.com/AkariMystic/status/123456789',
    urlLabel: 'Tweet URL to like',
    description: 'Like a specific tweet',
  },
  X_RETWEET: {
    label: 'Repost on X',
    icon: '🔄',
    urlPlaceholder: 'https://x.com/AkariMystic/status/123456789',
    urlLabel: 'Tweet URL to repost',
    description: 'Repost/retweet a specific post',
  },
  TELEGRAM_JOIN: {
    label: 'Join Telegram',
    icon: '📱',
    urlPlaceholder: 'https://t.me/AkariMysticClub',
    urlLabel: 'Telegram Group/Channel URL',
    description: 'Join a Telegram group or channel (verified)',
  },
  VISIT_URL: {
    label: 'Visit Link',
    icon: '🔗',
    urlPlaceholder: 'https://example.com/page',
    urlLabel: 'URL to visit',
    description: 'Visit any external link',
  },
};

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New campaign form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRewards, setNewRewards] = useState('');
  const [newStatus, setNewStatus] = useState('DRAFT');

  // New task form
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskType, setNewTaskType] = useState<keyof typeof TASK_TYPES>('X_FOLLOW');
  const [newTaskUrl, setNewTaskUrl] = useState('');
  const [newTaskReward, setNewTaskReward] = useState('10');

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadCampaigns();
  }, [router]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/campaigns');
      
      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      const data = await response.json();
      if (data.ok) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const createCampaign = async () => {
    if (!newName.trim()) return;
    
    try {
      const response = await adminFetch('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          rewards: newRewards || 'aXP rewards',
          status: newStatus,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Campaign created!' });
        setNewName('');
        setNewDescription('');
        setNewRewards('');
        loadCampaigns();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create campaign' });
    }
  };

  const addTask = async () => {
    if (!selectedCampaignId || !newTaskTitle.trim()) {
      setMessage({ type: 'error', text: 'Please select a campaign and enter a task title' });
      return;
    }

    // Validate URL for tasks that need it
    if (['X_FOLLOW', 'X_LIKE', 'X_RETWEET', 'TELEGRAM_JOIN'].includes(newTaskType) && !newTaskUrl.trim()) {
      setMessage({ type: 'error', text: `Please provide a ${TASK_TYPES[newTaskType].urlLabel}` });
      return;
    }
    
    try {
      const response = await adminFetch(`/api/admin/campaigns/${selectedCampaignId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDescription || null,
          type: newTaskType,
          targetUrl: newTaskUrl || null,
          rewardPoints: Number(newTaskReward) || 10,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Task added!' });
        setNewTaskTitle('');
        setNewTaskDescription('');
        setNewTaskUrl('');
        loadCampaigns();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add task' });
    }
  };

  const deleteTask = async (campaignId: string, taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await adminFetch(`/api/admin/campaigns/${campaignId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Task deleted' });
        loadCampaigns();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete task' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete task' });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await adminFetch(`/api/admin/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (data.ok) {
        loadCampaigns();
      }
    } catch (error) {
      console.error('Failed to update status');
    }
  };

  // Export campaigns as CSV
  const exportCampaignsCSV = () => {
    if (campaigns.length === 0) {
      setMessage({ type: 'error', text: 'No campaigns to export' });
      return;
    }

    const headers = ['ID', 'Name', 'Status', 'Participants', 'Tasks', 'End Date'];
    const rows = campaigns.map(c => [
      c.id,
      `"${c.name}"`,
      c.status,
      c.participantCount.toString(),
      c.tasks?.length?.toString() || '0',
      c.endsAt ? new Date(c.endsAt).toLocaleDateString() : 'N/A',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-600',
    ACTIVE: 'bg-green-600',
    PAUSED: 'bg-yellow-600',
    ENDED: 'bg-red-600',
  };

  const currentTaskType = TASK_TYPES[newTaskType];

  return (
    <AdminLayout title="Campaigns" subtitle="Create and manage campaigns with tasks">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Total Campaigns</div>
          <div className="text-2xl font-bold">{campaigns.length}</div>
        </div>
        <div className="bg-green-900/30 rounded-xl p-4 border border-green-500/30">
          <div className="text-sm text-green-400">Active</div>
          <div className="text-2xl font-bold text-green-300">
            {campaigns.filter(c => c.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Draft</div>
          <div className="text-2xl font-bold">
            {campaigns.filter(c => c.status === 'DRAFT').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Total Participants</div>
          <div className="text-2xl font-bold">
            {campaigns.reduce((sum, c) => sum + c.participantCount, 0)}
          </div>
        </div>
      </div>

      {/* Create Campaign */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">📋 Create New Campaign</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <input
            type="text"
            placeholder="Campaign Name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg"
          />
          <input
            type="text"
            placeholder="Rewards (e.g., '500 aXP + OG Role')"
            value={newRewards}
            onChange={(e) => setNewRewards(e.target.value)}
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg"
          />
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg"
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
          </select>
        </div>
        <button
          onClick={createCampaign}
          disabled={!newName.trim()}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg font-semibold"
        >
          Create Campaign
        </button>
      </div>

      {/* Add Task to Campaign */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">✅ Add Task to Campaign</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Campaign Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Campaign *</label>
            <select
              value={selectedCampaignId || ''}
              onChange={(e) => setSelectedCampaignId(e.target.value || null)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            >
              <option value="">Select Campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>

          {/* Task Title */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Title *</label>
            <input
              type="text"
              placeholder="e.g., Follow Akari on X"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          {/* Task Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Type *</label>
            <select
              value={newTaskType}
              onChange={(e) => setNewTaskType(e.target.value as keyof typeof TASK_TYPES)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            >
              {Object.entries(TASK_TYPES).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{currentTaskType.description}</p>
          </div>

          {/* Target URL */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {currentTaskType.urlLabel} {['X_FOLLOW', 'X_LIKE', 'X_RETWEET', 'TELEGRAM_JOIN'].includes(newTaskType) ? '*' : '(optional)'}
            </label>
            <input
              type="text"
              placeholder={currentTaskType.urlPlaceholder}
              value={newTaskUrl}
              onChange={(e) => setNewTaskUrl(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
            {newTaskType === 'TELEGRAM_JOIN' && (
              <p className="text-xs text-blue-400 mt-1">✓ Telegram tasks are automatically verified</p>
            )}
            {newTaskType.startsWith('X_') && (
              <p className="text-xs text-yellow-400 mt-1">⚠ X tasks cannot be verified (basic API)</p>
            )}
          </div>

          {/* Task Description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Description (optional)</label>
            <input
              type="text"
              placeholder="Additional instructions for users"
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          {/* Reward Points */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Reward (aXP)</label>
            <input
              type="number"
              placeholder="10"
              value={newTaskReward}
              onChange={(e) => setNewTaskReward(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>
        </div>

        <button
          onClick={addTask}
          disabled={!selectedCampaignId || !newTaskTitle.trim()}
          className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-lg font-semibold"
        >
          Add Task
        </button>
      </div>

      {/* Campaigns List */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">📊 All Campaigns</h2>
          <div className="flex gap-2">
            <button
              onClick={exportCampaignsCSV}
              disabled={campaigns.length === 0}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm"
            >
              📥 Export CSV
            </button>
            <button
              onClick={loadCampaigns}
              disabled={loading}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No campaigns yet. Create one above!
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{campaign.name}</h3>
                    {campaign.description && (
                      <p className="text-sm text-gray-400">{campaign.description}</p>
                    )}
                    {campaign.rewards && (
                      <p className="text-sm text-amber-400">🎁 {campaign.rewards}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[campaign.status] || 'bg-gray-600'}`}>
                      {campaign.status}
                    </span>
                    <select
                      value={campaign.status}
                      onChange={(e) => updateStatus(campaign.id, e.target.value)}
                      className="p-1 bg-gray-600 border border-gray-500 rounded text-sm"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="ENDED">Ended</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-400 items-center">
                  <span>👥 {campaign.participantCount} participants</span>
                  <span>✅ {campaign.tasks?.length || 0} tasks</span>
                  {campaign.endsAt && (
                    <span>📅 Ends: {new Date(campaign.endsAt).toLocaleDateString()}</span>
                  )}
                  {campaign.participantCount > 0 && (
                    <a
                      href={`/admin/campaigns/${campaign.id}/participants`}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg font-medium"
                    >
                      🏆 View Participants & Winners
                    </a>
                  )}
                </div>
                {campaign.tasks && campaign.tasks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <div className="text-xs text-gray-400 mb-2">Tasks:</div>
                    <div className="space-y-2">
                      {campaign.tasks.map((task) => {
                        const taskConfig = TASK_TYPES[task.type as keyof typeof TASK_TYPES] || { icon: '✨', label: task.type };
                        return (
                          <div key={task.id} className="flex items-center justify-between bg-gray-600/50 px-3 py-2 rounded">
                            <div className="flex items-center gap-2">
                              <span>{taskConfig.icon}</span>
                              <span className="font-medium">{task.title}</span>
                              <span className="text-amber-400 text-xs">+{task.rewardPoints} aXP</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {task.targetUrl && (
                                <a
                                  href={task.targetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline text-xs"
                                >
                                  🔗 URL
                                </a>
                              )}
                              <button
                                onClick={() => deleteTask(campaign.id, task.id)}
                                className="text-red-400 hover:text-red-300 text-xs"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
