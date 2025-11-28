/**
 * Admin Campaigns Page
 * 
 * Simple admin UI to manage campaigns and tasks.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  rewards: string;
  startAt?: string;
  endsAt: string;
  tasks: any[];
  participantCount: number;
}

export default function AdminCampaignsPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New campaign form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('DRAFT');

  // New task form
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('X_FOLLOW');
  const [newTaskUrl, setNewTaskUrl] = useState('');
  const [newTaskReward, setNewTaskReward] = useState('10');

  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadCampaigns();
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    if (adminToken.trim()) {
      localStorage.setItem('adminToken', adminToken.trim());
      setIsAuthenticated(true);
    }
  };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/campaigns', {
        headers: { 'x-admin-token': adminToken },
      });
      const data = await response.json();
      if (data.ok) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async () => {
    if (!newName.trim()) return;
    
    try {
      const response = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          status: newStatus,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Campaign created!' });
        setNewName('');
        setNewDescription('');
        loadCampaigns();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create campaign' });
    }
  };

  const addTask = async () => {
    if (!selectedCampaignId || !newTaskTitle.trim()) return;
    
    try {
      const response = await fetch(`/api/admin/campaigns/${selectedCampaignId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          title: newTaskTitle,
          type: newTaskType,
          targetUrl: newTaskUrl || null,
          rewardPoints: Number(newTaskReward) || 10,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Task added!' });
        setNewTaskTitle('');
        setNewTaskUrl('');
        loadCampaigns();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add task' });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/campaigns/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
          <input
            type="password"
            placeholder="Admin Token"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg mb-4"
          />
          <button onClick={handleLogin} className="w-full p-3 bg-purple-600 rounded-lg">Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin: Campaigns</h1>
          <Link href="/admin/myst" className="text-purple-400 hover:underline">← Back to Admin</Link>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
            {message.text}
          </div>
        )}

        {/* Create Campaign */}
        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Create Campaign</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Campaign Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="p-3 bg-gray-700 rounded-lg"
            />
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="p-3 bg-gray-700 rounded-lg"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <textarea
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="p-3 bg-gray-700 rounded-lg md:col-span-2"
              rows={2}
            />
          </div>
          <button
            onClick={createCampaign}
            className="mt-4 px-6 py-2 bg-purple-600 rounded-lg"
          >
            Create Campaign
          </button>
        </div>

        {/* Campaigns List */}
        <h2 className="text-lg font-semibold mb-4">Campaigns ({campaigns.length})</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{campaign.name}</h3>
                    <p className="text-gray-400 text-sm">{campaign.description || 'No description'}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      {campaign.participantCount} participants • {campaign.tasks.length} tasks
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {['DRAFT', 'ACTIVE', 'ARCHIVED'].map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(campaign.id, s)}
                        className={`px-3 py-1 rounded text-xs ${
                          campaign.status === s ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tasks */}
                <div className="border-t border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-semibold mb-2">Tasks:</h4>
                  <div className="space-y-2">
                    {campaign.tasks.map((task: any) => (
                      <div key={task.id} className="text-sm bg-gray-700/50 p-2 rounded">
                        <span className="text-purple-400">[{task.type}]</span> {task.title}
                        {task.targetUrl && <span className="text-gray-500 ml-2">→ {task.targetUrl}</span>}
                      </div>
                    ))}
                  </div>

                  {/* Add Task */}
                  {selectedCampaignId === campaign.id ? (
                    <div className="mt-4 p-4 bg-gray-700/30 rounded-lg">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Task title"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          className="p-2 bg-gray-700 rounded text-sm"
                        />
                        <select
                          value={newTaskType}
                          onChange={(e) => setNewTaskType(e.target.value)}
                          className="p-2 bg-gray-700 rounded text-sm"
                        >
                          <option value="X_FOLLOW">X_FOLLOW</option>
                          <option value="X_LIKE">X_LIKE</option>
                          <option value="X_RETWEET">X_RETWEET</option>
                          <option value="JOIN_TELEGRAM">JOIN_TELEGRAM</option>
                          <option value="QUOTE_REPOST">QUOTE_REPOST</option>
                          <option value="CUSTOM">CUSTOM</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Target URL"
                          value={newTaskUrl}
                          onChange={(e) => setNewTaskUrl(e.target.value)}
                          className="p-2 bg-gray-700 rounded text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Reward Points"
                          value={newTaskReward}
                          onChange={(e) => setNewTaskReward(e.target.value)}
                          className="p-2 bg-gray-700 rounded text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addTask} className="px-4 py-1 bg-green-600 rounded text-sm">Add Task</button>
                        <button onClick={() => setSelectedCampaignId(null)} className="px-4 py-1 bg-gray-600 rounded text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedCampaignId(campaign.id)}
                      className="mt-2 text-sm text-purple-400 hover:underline"
                    >
                      + Add Task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

