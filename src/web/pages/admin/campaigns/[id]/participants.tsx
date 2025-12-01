/**
 * Admin Campaign Participants Page
 * 
 * View all participants and select winners
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  isAdminLoggedIn,
  adminFetch,
} from '../../../../lib/admin-client';
import AdminLayout from '../../../../components/admin/AdminLayout';

interface Participant {
  userId: string;
  username?: string;
  firstName?: string;
  telegramId: string;
  tasksCompleted: number;
  totalPoints: number;
  referralCount: number;
  referralBonus: number;
  totalScore: number;
  rank: number;
  isWinner: boolean;
  winnerRank?: number;
}

interface CampaignInfo {
  id: string;
  name: string;
  winnerCount: number;
  winnersSelected: boolean;
  totalTasks: number;
  referralBonus: number;
}

const WINNER_OPTIONS = [25, 50, 100];

export default function CampaignParticipantsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedWinnerCount, setSelectedWinnerCount] = useState(25);

  const loadParticipants = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/campaigns/${id}/participants`);
      const data = await res.json();

      if (data.ok) {
        setCampaign(data.campaign);
        setParticipants(data.participants);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load participants' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }

    if (id) {
      loadParticipants();
    }
  }, [id, loadParticipants, router]);

  const handleSelectWinners = async () => {
    if (!id || selecting) return;

    const effectiveWinnerCount = Math.min(selectedWinnerCount, participants.length);
    
    if (!confirm(`Are you sure you want to select the top ${effectiveWinnerCount} participants as winners?`)) {
      return;
    }

    setSelecting(true);
    setMessage(null);

    try {
      const res = await adminFetch(`/api/admin/campaigns/${id}/select-winners`, {
        method: 'POST',
        body: JSON.stringify({ winnerCount: selectedWinnerCount }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: data.message || 'Winners selected!' });
        loadParticipants(); // Reload to show updated status
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to select winners' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to select winners' });
    } finally {
      setSelecting(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Rank', 'Username', 'Name', 'Telegram ID', 'Tasks', 'Points', 'Referrals', 'Bonus', 'Total Score', 'Winner'];
    const rows = participants.map((p) => [
      p.rank,
      p.username || '-',
      p.firstName || '-',
      p.telegramId,
      p.tasksCompleted,
      p.totalPoints,
      p.referralCount,
      p.referralBonus,
      p.totalScore,
      p.isWinner ? `#${p.winnerRank}` : 'No',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${id}-participants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <AdminLayout title="Campaign Participants">
        <div className="text-center py-12 text-gray-400">Loading...</div>
      </AdminLayout>
    );
  }

  if (!campaign) {
    return (
      <AdminLayout title="Campaign Participants">
        <div className="text-center py-12 text-red-400">Campaign not found</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Campaign Participants">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/campaigns" className="text-purple-400 hover:text-purple-300 text-sm mb-2 inline-block">
          ← Back to Campaigns
        </Link>
        <h2 className="text-xl font-bold text-white">{campaign.name}</h2>
        <p className="text-gray-400 text-sm">
          {participants.length} participants • {campaign.totalTasks} tasks • Top {campaign.winnerCount} winners
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Winner Count Selector */}
        {!campaign.winnersSelected && (
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
            {WINNER_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => setSelectedWinnerCount(count)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedWinnerCount === count
                    ? 'bg-purple-600 text-white'
                    : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                Top {count}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleSelectWinners}
          disabled={selecting || campaign.winnersSelected || participants.length === 0}
          className={`px-4 py-2 rounded-lg font-medium ${
            campaign.winnersSelected
              ? 'bg-green-700/50 text-green-300 cursor-not-allowed'
              : participants.length === 0
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          }`}
        >
          {selecting 
            ? 'Selecting...' 
            : campaign.winnersSelected 
            ? `✓ Winners Selected (Top ${campaign.winnerCount})` 
            : `🏆 Select Top ${Math.min(selectedWinnerCount, participants.length)} Winners`}
        </button>

        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium"
        >
          📥 Export CSV
        </button>

        <button
          onClick={loadParticipants}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800/60 p-4 rounded-lg">
          <div className="text-2xl font-bold text-white">{participants.length}</div>
          <div className="text-gray-400 text-sm">Total Participants</div>
        </div>
        <div className="bg-gray-800/60 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-400">
            {participants.filter((p) => p.isWinner).length}
          </div>
          <div className="text-gray-400 text-sm">Winners Selected</div>
        </div>
        <div className="bg-gray-800/60 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-400">
            {participants.reduce((sum, p) => sum + p.referralCount, 0)}
          </div>
          <div className="text-gray-400 text-sm">Total Referrals</div>
        </div>
        <div className="bg-gray-800/60 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-400">
            {participants[0]?.totalScore || 0}
          </div>
          <div className="text-gray-400 text-sm">Top Score</div>
        </div>
      </div>

      {/* Participants Table */}
      {participants.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-800/40 rounded-lg">
          No participants yet
        </div>
      ) : (
        <div className="bg-gray-800/60 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400">Rank</th>
                  <th className="px-4 py-3 text-left text-gray-400">User</th>
                  <th className="px-4 py-3 text-center text-gray-400">Tasks</th>
                  <th className="px-4 py-3 text-center text-gray-400">Points</th>
                  <th className="px-4 py-3 text-center text-gray-400">Referrals</th>
                  <th className="px-4 py-3 text-center text-gray-400">Bonus</th>
                  <th className="px-4 py-3 text-center text-gray-400">Total</th>
                  <th className="px-4 py-3 text-center text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p, idx) => {
                  const effectiveWinnerCount = campaign.winnersSelected ? campaign.winnerCount : selectedWinnerCount;
                  return (
                  <tr
                    key={p.userId}
                    className={`border-t border-gray-700/50 ${
                      p.isWinner ? 'bg-yellow-900/20' : idx < effectiveWinnerCount ? 'bg-green-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className={`font-medium ${p.rank <= 3 ? 'text-yellow-400' : 'text-white'}`}>
                        {p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `#${p.rank}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">
                        {p.username ? `@${p.username}` : p.firstName || 'Unknown'}
                      </div>
                      <div className="text-gray-500 text-xs">{p.telegramId}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {p.tasksCompleted}/{campaign.totalTasks}
                    </td>
                    <td className="px-4 py-3 text-center text-purple-400">{p.totalPoints}</td>
                    <td className="px-4 py-3 text-center">
                      {p.referralCount > 0 ? (
                        <span className="text-blue-400">+{p.referralCount}</span>
                      ) : (
                        <span className="text-gray-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.referralBonus > 0 ? (
                        <span className="text-green-400">+{p.referralBonus}</span>
                      ) : (
                        <span className="text-gray-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-white">{p.totalScore}</td>
                    <td className="px-4 py-3 text-center">
                      {p.isWinner ? (
                        <span className="px-2 py-1 bg-yellow-500/30 text-yellow-300 rounded text-xs">
                          🏆 #{p.winnerRank}
                        </span>
                      ) : idx < effectiveWinnerCount ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          Eligible
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scoring Legend */}
      <div className="mt-6 p-4 bg-gray-800/40 rounded-lg text-sm text-gray-400">
        <div className="font-medium text-white mb-2">Scoring System</div>
        <ul className="space-y-1">
          <li>• <span className="text-purple-400">Task Points:</span> Points from completed tasks</li>
          <li>• <span className="text-blue-400">Referrals:</span> Friends invited to this campaign</li>
          <li>• <span className="text-green-400">Referral Bonus:</span> +{campaign.referralBonus || 5} aXP per referral</li>
          <li>• <span className="text-white">Total Score:</span> Task Points + Referral Bonus</li>
        </ul>
      </div>
    </AdminLayout>
  );
}

