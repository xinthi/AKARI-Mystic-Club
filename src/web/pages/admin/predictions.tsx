/**
 * Admin Predictions Page
 * 
 * Create, manage, pause, resume, and resolve predictions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface Prediction {
  id: string;
  title: string;
  description?: string;
  category: string;
  options: string[];
  status: string;
  winningOption?: number;
  totalPool: number;
  betCount: number;
  createdAt: string;
  endsAt?: string;
}

interface PredictionStats {
  id: string;
  title: string;
  status: string;
  totalPool: number;
  yesPool: number;
  noPool: number;
  totalBets: number;
  uniqueBettors: number;
  avgBetSize: number;
  largestBet: number;
  betsByOption: { option: string; count: number; total: number }[];
  recentBets: {
    id: string;
    username: string | null;
    option: string;
    amount: number;
    createdAt: string;
  }[];
}

const CATEGORIES = ['crypto', 'sports', 'politics', 'entertainment', 'other'];
const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'RESOLVED', 'CANCELLED'];

export default function AdminPredictionsPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New prediction form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('crypto');
  
  // Stats modal
  const [statsModal, setStatsModal] = useState<PredictionStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [newOptions, setNewOptions] = useState(['Yes', 'No']);
  const [newEndsAt, setNewEndsAt] = useState('');

  // Resolve modal
  const [resolveModal, setResolveModal] = useState<Prediction | null>(null);
  const [winningOption, setWinningOption] = useState<number>(0);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadPredictions();
  }, [router]);

  // Load stats for a prediction
  const loadStats = async (predictionId: string) => {
    setLoadingStats(true);
    try {
      const response = await adminFetch(`/api/admin/predictions/${predictionId}/stats`);
      const data = await response.json();
      if (data.ok && data.stats) {
        setStatsModal(data.stats);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load stats' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load stats' });
    } finally {
      setLoadingStats(false);
    }
  };

  const loadPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/predictions');
      
      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      const data = await response.json();
      if (data.ok) {
        setPredictions(data.predictions || []);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load predictions' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [router]);

  const createPrediction = async () => {
    if (!newTitle.trim() || newOptions.filter(o => o.trim()).length < 2) {
      setMessage({ type: 'error', text: 'Title and at least 2 options are required' });
      return;
    }

    try {
      const response = await adminFetch('/api/admin/predictions', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          category: newCategory,
          options: newOptions.filter(o => o.trim()),
          endsAt: newEndsAt || undefined,
          status: 'DRAFT',
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Prediction created!' });
        setNewTitle('');
        setNewDescription('');
        setNewOptions(['Yes', 'No']);
        setNewEndsAt('');
        setShowCreateForm(false);
        loadPredictions();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to create' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const response = await adminFetch(`/api/admin/predictions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `Prediction ${newStatus.toLowerCase()}` });
        loadPredictions();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to update' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const resolvePrediction = async () => {
    if (!resolveModal) return;

    try {
      const response = await adminFetch(`/api/admin/predictions/${resolveModal.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ winningOption }),
      });

      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `Prediction resolved! ${data.winnersCount} winners paid out.` });
        setResolveModal(null);
        loadPredictions();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to resolve' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const addOption = () => {
    if (newOptions.length < 6) {
      setNewOptions([...newOptions, '']);
    }
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...newOptions];
    updated[index] = value;
    setNewOptions(updated);
  };

  const removeOption = (index: number) => {
    if (newOptions.length > 2) {
      setNewOptions(newOptions.filter((_, i) => i !== index));
    }
  };

  // Export as CSV
  const exportCSV = () => {
    if (predictions.length === 0) {
      setMessage({ type: 'error', text: 'No predictions to export' });
      return;
    }

    const headers = ['ID', 'Title', 'Category', 'Status', 'Options', 'Total Pool', 'Bet Count', 'Created'];
    const rows = predictions.map(p => [
      p.id,
      `"${p.title}"`,
      p.category,
      p.status,
      `"${p.options.join('; ')}"`,
      p.totalPool.toFixed(2),
      p.betCount.toString(),
      new Date(p.createdAt).toLocaleDateString(),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-600',
    ACTIVE: 'bg-green-600',
    PAUSED: 'bg-yellow-600',
    RESOLVED: 'bg-blue-600',
    CANCELLED: 'bg-red-600',
  };

  const categoryColors: Record<string, string> = {
    crypto: 'text-orange-400',
    sports: 'text-green-400',
    politics: 'text-blue-400',
    entertainment: 'text-pink-400',
    other: 'text-gray-400',
  };

  return (
    <AdminLayout title="Predictions" subtitle="Create and manage prediction markets">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-900/30 rounded-xl p-4 border border-green-500/30">
          <div className="text-sm text-green-400">Active</div>
          <div className="text-2xl font-bold text-green-300">
            {predictions.filter(p => p.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-500/30">
          <div className="text-sm text-yellow-400">Paused</div>
          <div className="text-2xl font-bold text-yellow-300">
            {predictions.filter(p => p.status === 'PAUSED').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Draft</div>
          <div className="text-2xl font-bold">
            {predictions.filter(p => p.status === 'DRAFT').length}
          </div>
        </div>
        <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-500/30">
          <div className="text-sm text-blue-400">Resolved</div>
          <div className="text-2xl font-bold text-blue-300">
            {predictions.filter(p => p.status === 'RESOLVED').length}
          </div>
        </div>
      </div>

      {/* Create Button / Form */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="mb-6 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold"
        >
          ➕ Create New Prediction
        </button>
      ) : (
        <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">🎯 Create New Prediction</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Will Bitcoin reach $100k by end of 2025?"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Additional details about this prediction..."
                rows={2}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Ends At</label>
                <input
                  type="datetime-local"
                  value={newEndsAt}
                  onChange={(e) => setNewEndsAt(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Options *</label>
              <div className="space-y-2">
                {newOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                    {newOptions.length > 2 && (
                      <button
                        onClick={() => removeOption(i)}
                        className="px-3 bg-red-600 hover:bg-red-500 rounded-lg"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {newOptions.length < 6 && (
                  <button
                    onClick={addOption}
                    className="text-purple-400 hover:text-purple-300 text-sm"
                  >
                    + Add Option
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createPrediction}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold"
              >
                Create Prediction
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Predictions List */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">📊 All Predictions</h2>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={predictions.length === 0}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm"
            >
              📥 Export CSV
            </button>
            <button
              onClick={loadPredictions}
              disabled={loading}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {predictions.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No predictions yet. Create one above!
          </div>
        ) : (
          <div className="space-y-4">
            {predictions.map((pred) => (
              <div key={pred.id} className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{pred.title}</h3>
                    <span className={`text-sm ${categoryColors[pred.category] || 'text-gray-400'}`}>
                      {pred.category}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[pred.status] || 'bg-gray-600'}`}>
                    {pred.status}
                  </span>
                </div>

                {pred.description && (
                  <p className="text-sm text-gray-400 mb-2">{pred.description}</p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {pred.options.map((opt, i) => (
                    <span 
                      key={i} 
                      className={`px-2 py-1 rounded text-xs ${
                        pred.winningOption === i ? 'bg-green-600 text-white' : 'bg-gray-600'
                      }`}
                    >
                      {opt} {pred.winningOption === i && '✓'}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-3">
                  <span>💰 Pool: {pred.totalPool.toFixed(2)} MYST</span>
                  <span>🎟️ {pred.betCount} bets</span>
                  {pred.endsAt && (
                    <span>📅 Ends: {new Date(pred.endsAt).toLocaleDateString()}</span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {/* View Stats Button */}
                  <button
                    onClick={() => loadStats(pred.id)}
                    disabled={loadingStats}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
                  >
                    📊 Stats
                  </button>
                  {pred.status === 'DRAFT' && (
                    <>
                      <button
                        onClick={() => updateStatus(pred.id, 'ACTIVE')}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                      >
                        ▶️ Start
                      </button>
                      <button
                        onClick={() => updateStatus(pred.id, 'CANCELLED')}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                      >
                        🗑️ Cancel
                      </button>
                    </>
                  )}
                  
                  {pred.status === 'ACTIVE' && (
                    <>
                      <button
                        onClick={() => updateStatus(pred.id, 'PAUSED')}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm"
                      >
                        ⏸️ Pause
                      </button>
                      {pred.betCount === 0 ? (
                        <button
                          onClick={() => updateStatus(pred.id, 'CANCELLED')}
                          className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                        >
                          🗑️ Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setResolveModal(pred);
                            setWinningOption(0);
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                        >
                          ✅ Resolve
                        </button>
                      )}
                    </>
                  )}
                  
                  {pred.status === 'PAUSED' && (
                    <>
                      <button
                        onClick={() => updateStatus(pred.id, 'ACTIVE')}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                      >
                        ▶️ Resume
                      </button>
                      <button
                        onClick={() => {
                          setResolveModal(pred);
                          setWinningOption(0);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                      >
                        ✅ Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">✅ Resolve Prediction</h2>
            <p className="text-gray-300 mb-4">{resolveModal.title}</p>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Select Winning Option:</label>
              <div className="space-y-2">
                {resolveModal.options.map((opt, i) => (
                  <label 
                    key={i} 
                    className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                      winningOption === i ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="winningOption"
                      checked={winningOption === i}
                      onChange={() => setWinningOption(i)}
                      className="mr-3"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-200">
                ⚠️ This action cannot be undone. All bets will be settled and winners paid out.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={resolvePrediction}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold"
              >
                Confirm & Pay Winners
              </button>
              <button
                onClick={() => setResolveModal(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {statsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">📊 Prediction Stats</h2>
                <p className="text-gray-400">{statsModal.title}</p>
              </div>
              <button
                onClick={() => setStatsModal(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/30">
                <div className="text-purple-300 text-xs">Total Pool</div>
                <div className="text-xl font-bold text-purple-400">{statsModal.totalPool.toFixed(2)}</div>
                <div className="text-purple-300/70 text-xs">MYST</div>
              </div>
              <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                <div className="text-blue-300 text-xs">Total Bets</div>
                <div className="text-xl font-bold text-blue-400">{statsModal.totalBets}</div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                <div className="text-green-300 text-xs">Unique Bettors</div>
                <div className="text-xl font-bold text-green-400">{statsModal.uniqueBettors}</div>
              </div>
              <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30">
                <div className="text-amber-300 text-xs">Avg Bet Size</div>
                <div className="text-xl font-bold text-amber-400">{statsModal.avgBetSize.toFixed(2)}</div>
                <div className="text-amber-300/70 text-xs">MYST</div>
              </div>
            </div>

            {/* Pool Breakdown */}
            <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-3">💰 Pool Breakdown by Option</h3>
              <div className="space-y-3">
                {statsModal.betsByOption.map((opt, i) => {
                  const percentage = statsModal.totalPool > 0 
                    ? ((opt.total / statsModal.totalPool) * 100).toFixed(1) 
                    : '0';
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{opt.option}</span>
                        <span className="text-gray-400">{opt.count} bets · {opt.total.toFixed(2)} MYST ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${i === 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Bets */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="font-semibold mb-3">🎟️ Recent Bets (Last 10)</h3>
              {statsModal.recentBets.length === 0 ? (
                <p className="text-gray-400 text-sm">No bets yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {statsModal.recentBets.map((bet) => (
                    <div key={bet.id} className="flex justify-between items-center text-sm bg-gray-600/50 rounded px-3 py-2">
                      <div>
                        <span className="font-medium">{bet.username || 'Anonymous'}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                          bet.option === 'Yes' ? 'bg-green-600/50 text-green-300' : 'bg-red-600/50 text-red-300'
                        }`}>
                          {bet.option}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-400 font-medium">{bet.amount.toFixed(2)} MYST</div>
                        <div className="text-gray-500 text-xs">
                          {new Date(bet.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Extra Stats */}
            <div className="mt-4 pt-4 border-t border-gray-700 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Largest bet:</span>
                <span className="text-amber-400">{statsModal.largestBet.toFixed(2)} MYST</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

