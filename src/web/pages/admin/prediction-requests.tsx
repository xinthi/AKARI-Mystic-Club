/**
 * Admin Prediction Requests Page
 * 
 * Review and approve/reject prediction market requests from community.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PredictionRequest {
  id: string;
  question: string;
  category?: string;
  proposedExpiry?: string;
  details?: string;
  status: string;
  createdBy?: { username?: string; telegramId: string };
  createdAt: string;
}

export default function AdminPredictionRequestsPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requests, setRequests] = useState<PredictionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('PENDING');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadRequests();
    }
  }, [isAuthenticated, filter]);

  const handleLogin = () => {
    if (adminToken.trim()) {
      localStorage.setItem('adminToken', adminToken.trim());
      setIsAuthenticated(true);
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/prediction-requests?status=${filter}`, {
        headers: { 'x-admin-token': adminToken },
      });
      const data = await response.json();
      if (data.ok) {
        setRequests(data.requests);
      }
    } catch (error) {
      console.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: string, action: 'APPROVE' | 'REJECT', createPrediction = false) => {
    try {
      const response = await fetch('/api/admin/prediction-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ requestId, action, createPrediction }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ 
          type: 'success', 
          text: `${action === 'APPROVE' ? 'Approved' : 'Rejected'}${data.prediction ? ` - Prediction market created` : ''}` 
        });
        loadRequests();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to process request' });
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
          <h1 className="text-2xl font-bold">Prediction Requests</h1>
          <Link href="/admin/myst" className="text-purple-400 hover:underline">← Back to Admin</Link>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
            {message.text}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg ${filter === s ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : requests.length === 0 ? (
          <div className="text-gray-500">No {filter.toLowerCase()} requests</div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="bg-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{req.question}</h3>
                    {req.category && (
                      <span className="inline-block px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded mt-1">
                        {req.category}
                      </span>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded text-xs ${
                    req.status === 'PENDING' ? 'bg-yellow-600' :
                    req.status === 'APPROVED' ? 'bg-green-600' : 'bg-red-600'
                  }`}>
                    {req.status}
                  </span>
                </div>

                {req.details && (
                  <div className="mb-2">
                    <span className="text-gray-500 text-sm">Details:</span>
                    <p className="text-sm text-gray-300">{req.details}</p>
                  </div>
                )}

                <div className="text-xs text-gray-500 mb-4">
                  Proposed expiry: {req.proposedExpiry ? new Date(req.proposedExpiry).toLocaleDateString() : 'Not specified'}
                  {req.createdBy && ` • By: @${req.createdBy.username || req.createdBy.telegramId}`}
                  {' • '}{new Date(req.createdAt).toLocaleDateString()}
                </div>

                {req.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'APPROVE', true)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
                    >
                      Approve + Create Market
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'APPROVE', false)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                    >
                      Approve Only
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'REJECT')}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

