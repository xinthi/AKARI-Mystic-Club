/**
 * Admin Prediction Requests Page
 * 
 * Review and approve/reject community prediction submissions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface PredictionRequest {
  id: string;
  title: string;
  description: string;
  category: string;
  options: string[];
  suggestedEndDate?: string;
  status: string;
  createdAt: string;
  user?: {
    username?: string;
    telegramId: string;
  };
}

export default function AdminPredictionRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<PredictionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadRequests();
  }, [router, loadRequests]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/prediction-requests');
      
      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      const data = await response.json();
      if (data.ok) {
        setRequests(data.requests);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load requests' });
    } finally {
      setLoading(false);
    }
  }, [router]);

  const updateStatus = async (id: string, status: string, notes?: string) => {
    try {
      const response = await adminFetch(`/api/admin/prediction-requests`, {
        method: 'PATCH',
        body: JSON.stringify({ id, status, adminNotes: notes }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `Request ${status.toLowerCase()}` });
        loadRequests();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to update' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  // Export as CSV
  const exportCSV = () => {
    if (requests.length === 0) {
      setMessage({ type: 'error', text: 'No data to export' });
      return;
    }

    const headers = ['ID', 'Title', 'Category', 'Status', 'Options', 'Date'];
    const rows = requests.map(r => [
      r.id,
      `"${r.title}"`,
      r.category,
      r.status,
      `"${r.options.join('; ')}"`,
      new Date(r.createdAt).toLocaleDateString(),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction-requests-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-600',
    APPROVED: 'bg-green-600',
    REJECTED: 'bg-red-600',
    CREATED: 'bg-blue-600',
  };

  const categoryColors: Record<string, string> = {
    crypto: 'text-orange-400',
    sports: 'text-green-400',
    politics: 'text-blue-400',
    entertainment: 'text-pink-400',
    other: 'text-gray-400',
  };

  return (
    <AdminLayout title="Prediction Requests" subtitle="Review community prediction market submissions">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-500/30">
          <div className="text-sm text-yellow-400">Pending</div>
          <div className="text-2xl font-bold text-yellow-300">
            {requests.filter(r => r.status === 'PENDING').length}
          </div>
        </div>
        <div className="bg-green-900/30 rounded-xl p-4 border border-green-500/30">
          <div className="text-sm text-green-400">Approved</div>
          <div className="text-2xl font-bold text-green-300">
            {requests.filter(r => r.status === 'APPROVED' || r.status === 'CREATED').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Total</div>
          <div className="text-2xl font-bold">{requests.length}</div>
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">🎯 All Requests</h2>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={requests.length === 0}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm"
            >
              📥 Export CSV
            </button>
            <button
              onClick={loadRequests}
              disabled={loading}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No prediction requests yet
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{req.title}</h3>
                    <span className={`text-sm ${categoryColors[req.category] || 'text-gray-400'}`}>
                      {req.category}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[req.status] || 'bg-gray-600'}`}>
                    {req.status}
                  </span>
                </div>
                <p className="text-sm text-gray-300 mb-3">{req.description}</p>
                <div className="mb-3">
                  <div className="text-xs text-gray-400 mb-1">Options:</div>
                  <div className="flex flex-wrap gap-2">
                    {req.options.map((opt, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-600 rounded text-xs">
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-400">
                    📅 {new Date(req.createdAt).toLocaleDateString()}
                    {req.user && <span className="ml-2">by @{req.user.username || req.user.telegramId}</span>}
                  </div>
                  {req.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateStatus(req.id, 'APPROVED')}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium"
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => updateStatus(req.id, 'REJECTED')}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
