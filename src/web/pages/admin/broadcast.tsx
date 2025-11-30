/**
 * Admin Broadcast Page
 * 
 * Send announcements to all users who have opted in
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

export default function AdminBroadcastPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [includeMiniAppButton, setIncludeMiniAppButton] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    type: 'success' | 'error';
    text: string;
    sent?: number;
    failed?: number;
    total?: number;
  } | null>(null);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
    }
  }, [router]);

  const handleSend = async () => {
    if (!message.trim()) {
      setResult({ type: 'error', text: 'Message is required' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await adminFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          message: message.trim(),
          includeMiniAppButton,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setResult({
          type: 'success',
          text: data.message || 'Broadcast sent!',
          sent: data.sent,
          failed: data.failed,
          total: data.total,
        });
        // Clear form on success
        setTitle('');
        setMessage('');
      } else {
        setResult({ type: 'error', text: data.message || 'Failed to send' });
      }
    } catch (err) {
      setResult({ type: 'error', text: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout title="Broadcast Message" subtitle="Send announcements to all users who have opted in.">
      {/* Warning */}
      <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-semibold text-amber-200">Use with caution</div>
            <div className="text-sm text-amber-300/70">
              This will send a message to ALL users with announcements enabled.
              Avoid spamming - use only for important updates.
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New Feature Announcement"
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
          />
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Message *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your announcement message..."
            rows={6}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none"
          />
          <div className="text-xs text-gray-500 mt-1">
            Supports HTML: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, &lt;a href=&quot;...&quot;&gt;link&lt;/a&gt;
          </div>
        </div>

        {/* Include Mini App Button */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="includeMiniAppButton"
            checked={includeMiniAppButton}
            onChange={(e) => setIncludeMiniAppButton(e.target.checked)}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-600"
          />
          <label htmlFor="includeMiniAppButton" className="text-sm text-gray-300">
            Include &quot;Open Mini App&quot; button
          </label>
        </div>

        {/* Preview */}
        <div className="border-t border-gray-700 pt-4">
          <div className="text-sm text-gray-400 mb-2">Preview:</div>
          <div className="bg-gray-900 rounded-lg p-4 text-sm">
            {title && <div className="font-bold mb-2">{title}</div>}
            <div className="whitespace-pre-wrap">{message || '(No message yet)'}</div>
            {includeMiniAppButton && (
              <div className="mt-3">
                <span className="px-4 py-2 bg-blue-600 rounded-lg text-xs">
                  🚀 Open Mini App
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-lg ${
            result.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}>
            <div>{result.text}</div>
            {result.sent !== undefined && (
              <div className="text-sm mt-2">
                ✅ Sent: {result.sent} | ❌ Failed: {result.failed} | 📊 Total: {result.total}
              </div>
            )}
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded-xl font-semibold text-lg transition-colors"
        >
          {sending ? 'Sending...' : '📢 Send Broadcast'}
        </button>
      </div>
    </AdminLayout>
  );
}

