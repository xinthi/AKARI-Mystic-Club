/**
 * Admin MYST Grant Page
 * 
 * Simple admin UI to grant MYST to users.
 * Protected by admin token stored in localStorage.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminMystPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Form state
  const [userId, setUserId] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    if (adminToken.trim()) {
      localStorage.setItem('adminToken', adminToken.trim());
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setAdminToken('');
    setIsAuthenticated(false);
  };

  const handleGrant = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/myst/grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          userId: userId || undefined,
          telegramId: telegramId || undefined,
          amount: Number(amount),
          reason: reason || undefined,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Granted ${data.granted} MYST. New balance: ${data.newBalance}` });
        setUserId('');
        setTelegramId('');
        setAmount('');
        setReason('');
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to grant MYST' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Admin Token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <button
              onClick={handleLogin}
              className="w-full p-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin: Grant MYST</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">User ID (internal)</label>
            <input
              type="text"
              placeholder="cuid..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          <div className="text-center text-gray-500">OR</div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Telegram ID</label>
            <input
              type="text"
              placeholder="123456789"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount (MYST)</label>
            <input
              type="number"
              placeholder="10"
              min="1"
              max="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Reason (optional)</label>
            <input
              type="text"
              placeholder="Contest winner, bug bounty, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          <button
            onClick={handleGrant}
            disabled={loading || (!userId && !telegramId) || !amount}
            className="w-full p-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
          >
            {loading ? 'Granting...' : 'Grant MYST'}
          </button>
        </div>

        <div className="mt-8 text-center">
          <Link href="/admin/leaderboard" className="text-purple-400 hover:underline mr-4">Analytics</Link>
          <Link href="/admin/wheel" className="text-purple-400 hover:underline mr-4">Wheel Pool</Link>
          <Link href="/admin/campaigns" className="text-purple-400 hover:underline mr-4">Campaigns</Link>
          <Link href="/admin/campaign-requests" className="text-purple-400 hover:underline mr-4">Campaign Requests</Link>
          <Link href="/admin/prediction-requests" className="text-purple-400 hover:underline">Prediction Requests</Link>
        </div>
      </div>
    </div>
  );
}

