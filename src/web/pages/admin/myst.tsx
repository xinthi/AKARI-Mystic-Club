/**
 * Admin MYST Grant Page
 * 
 * Grant MYST to users manually.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

export default function AdminMystPage() {
  const router = useRouter();
  
  // Form state
  const [userId, setUserId] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [grantHistory, setGrantHistory] = useState<Array<{
    telegramId: string;
    amount: number;
    newBalance: number;
    timestamp: string;
  }>>([]);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
    }
  }, [router]);

  const handleGrant = async () => {
    if (!amount || (!userId && !telegramId)) {
      setMessage({ type: 'error', text: 'Please enter a user ID/Telegram ID and amount' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await adminFetch('/api/admin/myst/grant', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId || undefined,
          telegramId: telegramId || undefined,
          amount: Number(amount),
          reason: reason || undefined,
        }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      if (data.ok) {
        setMessage({ type: 'success', text: `✅ Granted ${data.granted} MYST. New balance: ${data.newBalance}` });
        
        // Add to history
        setGrantHistory(prev => [{
          telegramId: telegramId || userId,
          amount: data.granted,
          newBalance: data.newBalance,
          timestamp: new Date().toLocaleTimeString(),
        }, ...prev.slice(0, 9)]);

        // Clear form
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

  // Quick grant helper
  const setQuickGrant = (qty: number) => {
    setAmount(String(qty));
  };

  return (
    <AdminLayout title="MYST Grant" subtitle="Grant MYST tokens to users manually">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Grant Form */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <h2 className="text-xl font-semibold mb-4">💎 Grant MYST to User</h2>
        
        <div className="space-y-4">
          {/* User Identifier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <p className="text-sm text-gray-500 text-center">
            Enter either User ID or Telegram ID (not both)
          </p>

          {/* Amount */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount (MYST)</label>
            <input
              type="number"
              placeholder="Enter amount..."
              min="1"
              max="100000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-lg"
            />
          </div>

          {/* Quick Amount Buttons */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Quick amounts:</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setQuickGrant(10)}
                className="px-4 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-sm"
              >
                10 MYST
              </button>
              <button
                onClick={() => setQuickGrant(50)}
                className="px-4 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-sm"
              >
                50 MYST
              </button>
              <button
                onClick={() => setQuickGrant(100)}
                className="px-4 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-sm"
              >
                100 MYST
              </button>
              <button
                onClick={() => setQuickGrant(500)}
                className="px-4 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-sm"
              >
                500 MYST
              </button>
              <button
                onClick={() => setQuickGrant(1000)}
                className="px-4 py-2 bg-amber-600/50 hover:bg-amber-600 rounded-lg text-sm font-semibold"
              >
                🎁 1000 MYST
              </button>
              <button
                onClick={() => setQuickGrant(5000)}
                className="px-4 py-2 bg-amber-600/50 hover:bg-amber-600 rounded-lg text-sm"
              >
                5000 MYST
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Reason (optional)</label>
            <input
              type="text"
              placeholder="Contest winner, bug bounty, testing, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleGrant}
            disabled={loading || (!userId && !telegramId) || !amount}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-all"
          >
            {loading ? 'Granting...' : `💎 Grant ${amount || '0'} MYST`}
          </button>
        </div>
      </div>

      {/* Grant History */}
      {grantHistory.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Recent Grants (this session)</h3>
          <div className="space-y-2">
            {grantHistory.map((grant, index) => (
              <div key={index} className="flex justify-between items-center text-sm bg-gray-700/50 rounded-lg p-3">
                <div>
                  <span className="text-purple-400">{grant.telegramId}</span>
                  <span className="text-gray-400 ml-2">+{grant.amount} MYST</span>
                </div>
                <div className="text-gray-500">
                  Balance: {grant.newBalance} · {grant.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-900/30 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">💡</span>
          <div>
            <div className="font-semibold text-blue-200">How to find your Telegram ID</div>
            <div className="text-sm text-blue-300/70">
              Open the Mini App → Go to Profile → Your Telegram ID is shown in the profile data.
              Or use @userinfobot on Telegram to get any user&apos;s ID.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
