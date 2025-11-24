import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Trophy, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  tier: string;
  cred: number;
}

export default function Leaderboard() {
  const router = useRouter();
  const { tier } = router.query;
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(
    (tier as string) || null
  );

  useEffect(() => {
    const tierParam = selectedTier || 'all';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    fetch(`${apiUrl}/leaderboard?tier=${tierParam}`)
      .then((res) => res.json())
      .then((data) => {
        setLeaderboard(data.leaderboard || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching leaderboard:', err);
        setLoading(false);
      });
  }, [selectedTier]);

  const tiers = [
    { name: 'all', label: 'All Tiers', emoji: '🏆' },
    { name: 'Seeker', label: 'Seeker', emoji: '🧭' },
    { name: 'Alchemist', label: 'Alchemist', emoji: '🔥' },
    { name: 'Sentinel', label: 'Sentinel', emoji: '🛡️' },
    { name: 'Merchant', label: 'Merchant', emoji: '💰' },
    { name: 'Guardian', label: 'Guardian', emoji: '⚔️' },
    { name: 'Sovereign', label: 'Sovereign', emoji: '👑' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">Loading leaderboard...</div>
      </div>
    );
  }

  const chartData = leaderboard.slice(0, 10).map((entry) => ({
    name: entry.username,
    points: entry.points,
  }));

  return (
    <div className="min-h-screen bg-gradient-mystic text-white p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">🏆 Leaderboard</h1>

        {/* Tier Filter */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {tiers.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelectedTier(t.name === 'all' ? null : t.name)}
              className={`px-4 py-2 rounded-lg transition ${
                (selectedTier === t.name) || (t.name === 'all' && !selectedTier)
                  ? 'bg-mystic-purple'
                  : 'bg-mystic-dark/50'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-mystic-dark/50 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Top 10 Points</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: '#fff' }} />
                <YAxis tick={{ fill: '#fff' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A2E',
                    border: '1px solid #6B46C1',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="points" fill="#6B46C1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-mystic-dark/50 rounded-lg p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-mystic-purple/30">
                  <th className="text-left p-2">Rank</th>
                  <th className="text-left p-2">Username</th>
                  <th className="text-left p-2">EP</th>
                  <th className="text-left p-2">Tier</th>
                  <th className="text-left p-2">Cred</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.rank}
                    className="border-b border-mystic-purple/10 hover:bg-mystic-purple/10"
                  >
                    <td className="p-2">
                      {entry.rank <= 3 ? (
                        <Trophy
                          className={`w-5 h-5 inline ${
                            entry.rank === 1
                              ? 'text-yellow-400'
                              : entry.rank === 2
                              ? 'text-gray-300'
                              : 'text-orange-400'
                          }`}
                        />
                      ) : (
                        <span className="text-gray-400">#{entry.rank}</span>
                      )}
                    </td>
                    <td className="p-2 font-medium">@{entry.username}</td>
                    <td className="p-2">{entry.points.toLocaleString()}</td>
                    <td className="p-2 text-sm text-gray-400">{entry.tier}</td>
                    <td className="p-2">{entry.cred.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

