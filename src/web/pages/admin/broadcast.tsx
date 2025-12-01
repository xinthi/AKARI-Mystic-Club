/**
 * Admin Broadcast Page
 * 
 * Send announcements, polls, or messages via CSV to users
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

type BroadcastMode = 'message' | 'poll' | 'csv';

export default function AdminBroadcastPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Mode selection
  const [mode, setMode] = useState<BroadcastMode>('message');
  
  // Message mode state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [includeMiniAppButton, setIncludeMiniAppButton] = useState(true);
  
  // Poll mode state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(true);
  const [pollMultipleAnswers, setPollMultipleAnswers] = useState(false);
  
  // CSV mode state
  const [csvTelegramIds, setCsvTelegramIds] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvMessage, setCsvMessage] = useState('');
  const [csvIncludeButton, setCsvIncludeButton] = useState(true);
  
  // Common state
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

  // Handle sending regular message
  const handleSendMessage = async () => {
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
          type: 'message',
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

  // Handle sending poll
  const handleSendPoll = async () => {
    const validOptions = pollOptions.filter(opt => opt.trim().length > 0);
    
    if (!pollQuestion.trim()) {
      setResult({ type: 'error', text: 'Poll question is required' });
      return;
    }
    if (validOptions.length < 2) {
      setResult({ type: 'error', text: 'At least 2 options are required' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await adminFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'poll',
          pollQuestion: pollQuestion.trim(),
          pollOptions: validOptions,
          pollAnonymous,
          pollMultipleAnswers,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setResult({
          type: 'success',
          text: data.message || 'Poll sent!',
          sent: data.sent,
          failed: data.failed,
          total: data.total,
        });
        setPollQuestion('');
        setPollOptions(['', '']);
      } else {
        setResult({ type: 'error', text: data.message || 'Failed to send poll' });
      }
    } catch (err) {
      setResult({ type: 'error', text: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  // Handle CSV file upload
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // Parse CSV - extract Telegram IDs
      const lines = text.split(/[\r\n]+/).filter(line => line.trim());
      const ids: string[] = [];
      
      for (const line of lines) {
        // Skip header row if it contains non-numeric values
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        for (const val of values) {
          // Check if it looks like a Telegram ID (numeric, 6-15 digits)
          if (/^\d{6,15}$/.test(val)) {
            ids.push(val);
          }
        }
      }
      
      // Remove duplicates
      const uniqueIds = [...new Set(ids)];
      setCsvTelegramIds(uniqueIds);
    };
    reader.readAsText(file);
  };

  // Handle sending via CSV
  const handleSendCsv = async () => {
    if (csvTelegramIds.length === 0) {
      setResult({ type: 'error', text: 'No Telegram IDs loaded from CSV' });
      return;
    }
    if (!csvMessage.trim()) {
      setResult({ type: 'error', text: 'Message is required' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await adminFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'csv',
          telegramIds: csvTelegramIds,
          message: csvMessage.trim(),
          includeMiniAppButton: csvIncludeButton,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setResult({
          type: 'success',
          text: data.message || 'Messages sent!',
          sent: data.sent,
          failed: data.failed,
          total: data.total,
        });
      } else {
        setResult({ type: 'error', text: data.message || 'Failed to send' });
      }
    } catch (err) {
      setResult({ type: 'error', text: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  // Download sample CSV
  const downloadSampleCsv = () => {
    const content = 'telegram_id\n123456789\n987654321\n555555555';
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'telegram_ids_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add poll option
  const addPollOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, '']);
    }
  };

  // Remove poll option
  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  // Update poll option
  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  return (
    <AdminLayout title="Broadcast Message" subtitle="Send announcements, polls, or messages via CSV">
      {/* Warning */}
      <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-semibold text-amber-200">Use with caution</div>
            <div className="text-sm text-amber-300/70">
              Avoid spamming - use only for important updates.
            </div>
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode('message'); setResult(null); }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'message'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📢 Message
        </button>
        <button
          onClick={() => { setMode('poll'); setResult(null); }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'poll'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📊 Poll
        </button>
        <button
          onClick={() => { setMode('csv'); setResult(null); }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'csv'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📋 CSV Import
        </button>
      </div>

      {/* Message Mode */}
      {mode === 'message' && (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="text-sm text-gray-400 mb-4">
            Send to all signed-up users with announcements enabled.
          </div>
          
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

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={sending || !message.trim()}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded-xl font-semibold text-lg transition-colors"
          >
            {sending ? 'Sending...' : '📢 Send Broadcast'}
          </button>
        </div>
      )}

      {/* Poll Mode */}
      {mode === 'poll' && (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="text-sm text-gray-400 mb-4">
            Send a poll to all signed-up users with announcements enabled.
          </div>
          
          {/* Poll Question */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Poll Question *</label>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="e.g. What prediction market should we add next?"
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
            />
          </div>

          {/* Poll Options */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Options (min 2, max 10)</label>
            <div className="space-y-2">
              {pollOptions.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updatePollOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => removePollOption(index)}
                      className="px-3 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded-lg"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 10 && (
              <button
                onClick={addPollOption}
                className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
              >
                + Add Option
              </button>
            )}
          </div>

          {/* Poll Settings */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pollAnonymous"
                checked={pollAnonymous}
                onChange={(e) => setPollAnonymous(e.target.checked)}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-600"
              />
              <label htmlFor="pollAnonymous" className="text-sm text-gray-300">
                Anonymous voting
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pollMultipleAnswers"
                checked={pollMultipleAnswers}
                onChange={(e) => setPollMultipleAnswers(e.target.checked)}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-600"
              />
              <label htmlFor="pollMultipleAnswers" className="text-sm text-gray-300">
                Allow multiple answers
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="border-t border-gray-700 pt-4">
            <div className="text-sm text-gray-400 mb-2">Preview:</div>
            <div className="bg-gray-900 rounded-lg p-4 text-sm">
              <div className="font-bold mb-3">📊 {pollQuestion || 'Your poll question'}</div>
              <div className="space-y-2">
                {pollOptions.filter(o => o.trim()).map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-4 h-4 border border-gray-500 rounded-full"></span>
                    <span>{option}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendPoll}
            disabled={sending || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded-xl font-semibold text-lg transition-colors"
          >
            {sending ? 'Sending...' : '📊 Send Poll'}
          </button>
        </div>
      )}

      {/* CSV Mode */}
      {mode === 'csv' && (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="text-sm text-gray-400 mb-4">
            Send messages to specific Telegram users by uploading their IDs.
            <br />
            <span className="text-yellow-400">⚠️ Users must have started a chat with the bot to receive messages.</span>
          </div>
          
          {/* CSV Upload */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Upload CSV with Telegram IDs</label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                📂 Choose File
              </button>
              <button
                onClick={downloadSampleCsv}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
              >
                📥 Download Sample CSV
              </button>
            </div>
            {csvFileName && (
              <div className="mt-2 text-sm">
                <span className="text-gray-400">File:</span>{' '}
                <span className="text-white">{csvFileName}</span>
                {csvTelegramIds.length > 0 && (
                  <span className="text-green-400 ml-2">
                    ✓ {csvTelegramIds.length} Telegram IDs loaded
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Preview IDs */}
          {csvTelegramIds.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-32 overflow-y-auto">
              <div className="text-xs text-gray-400 mb-2">Loaded IDs (first 20 shown):</div>
              <div className="text-xs text-gray-300 font-mono">
                {csvTelegramIds.slice(0, 20).join(', ')}
                {csvTelegramIds.length > 20 && <span className="text-gray-500"> ... and {csvTelegramIds.length - 20} more</span>}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Message *</label>
            <textarea
              value={csvMessage}
              onChange={(e) => setCsvMessage(e.target.value)}
              placeholder="Your message to these users..."
              rows={6}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none"
            />
            <div className="text-xs text-gray-500 mt-1">
              Supports HTML: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, &lt;a href=&quot;...&quot;&gt;link&lt;/a&gt;
            </div>
          </div>

          {/* Include Button */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="csvIncludeButton"
              checked={csvIncludeButton}
              onChange={(e) => setCsvIncludeButton(e.target.checked)}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-600"
            />
            <label htmlFor="csvIncludeButton" className="text-sm text-gray-300">
              Include &quot;Open Mini App&quot; button
            </label>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendCsv}
            disabled={sending || csvTelegramIds.length === 0 || !csvMessage.trim()}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded-xl font-semibold text-lg transition-colors"
          >
            {sending ? 'Sending...' : `📋 Send to ${csvTelegramIds.length} Users`}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`mt-6 p-4 rounded-lg ${
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
    </AdminLayout>
  );
}
