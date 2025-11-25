/**
 * Predictions Page
 * 
 * Lists all active predictions with ability to view details and place bets
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const TelegramWebApp = dynamic(() => import('@twa-dev/sdk'), { ssr: false });

interface Prediction {
  id: string;
  title: string;
  description?: string;
  options: string[];
  entryFeeStars: number;
  entryFeePoints: number;
  pot: number;
  resolved: boolean;
  endsAt: string;
  participantCount: number;
  creator: {
    username?: string;
    tier?: string;
  };
}

export default function PredictionsPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      // Get init data from Telegram
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await TelegramWebApp;
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const response = await fetch('/api/predictions?resolved=false', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load predictions');
      }

      const data = await response.json();
      setPredictions(data.predictions || []);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading predictions:', err);
      setError(err.message || 'Failed to load predictions');
      setLoading(false);
    }
  };

  const formatTimeRemaining = (endsAt: string) => {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff < 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error}</div>
          <button
            onClick={loadPredictions}
            className="mt-4 px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">🎲 Predictions</h1>
        <p className="text-purple-300">Bet on outcomes and win rewards</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {predictions.length === 0 ? (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-purple-500/20">
            <div className="text-4xl mb-4">🔮</div>
            <div className="text-lg mb-2">No active predictions</div>
            <div className="text-sm text-purple-300">Check back later for new markets</div>
          </div>
        ) : (
          predictions.map((prediction) => (
            <div
              key={prediction.id}
              onClick={() => router.push(`/predictions/${prediction.id}`)}
              className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20 cursor-pointer hover:bg-purple-900/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-xl font-semibold flex-1">{prediction.title}</h3>
                {prediction.resolved && (
                  <span className="bg-green-600 text-xs px-2 py-1 rounded">Resolved</span>
                )}
              </div>

              {prediction.description && (
                <p className="text-purple-200 text-sm mb-4 line-clamp-2">
                  {prediction.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-purple-300 mb-1">Pot</div>
                  <div className="text-lg font-semibold">
                    {prediction.pot.toLocaleString()} {prediction.entryFeeStars > 0 ? '⭐' : 'EP'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-300 mb-1">Participants</div>
                  <div className="text-lg font-semibold">{prediction.participantCount}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-purple-500/20">
                <div className="text-sm text-purple-300">
                  {prediction.entryFeeStars > 0
                    ? `Entry: ${prediction.entryFeeStars} ⭐`
                    : prediction.entryFeePoints > 0
                    ? `Entry: ${prediction.entryFeePoints} EP`
                    : 'Free to enter'}
                </div>
                <div className="text-sm text-purple-300">
                  {formatTimeRemaining(prediction.endsAt)} left
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

