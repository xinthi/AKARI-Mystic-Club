/**
 * Prediction Detail Page
 * 
 * Shows prediction details, options, and allows placing bets
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const TelegramWebApp = dynamic(() => import('@twa-dev/sdk'), { ssr: false });

interface PredictionDetail {
  id: string;
  title: string;
  description?: string;
  options: string[];
  entryFeeStars: number;
  entryFeePoints: number;
  pot: number;
  resolved: boolean;
  winnerOption?: number;
  endsAt: string;
  optionStats: Array<{
    option: string;
    index: number;
    betCount: number;
    totalStars: number;
    totalPoints: number;
  }>;
  userBet?: {
    optionIndex: number;
    starsBet: number;
    pointsBet: number;
  };
}

export default function PredictionDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [prediction, setPrediction] = useState<PredictionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<string>('');
  const [placingBet, setPlacingBet] = useState(false);

  useEffect(() => {
    if (id) {
      loadPrediction();
    }
  }, [id]);

  const loadPrediction = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await TelegramWebApp;
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const response = await fetch(`/api/predictions/${id}`, {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load prediction');
      }

      const data = await response.json();
      setPrediction(data.prediction);
      if (data.prediction.userBet) {
        setSelectedOption(data.prediction.userBet.optionIndex);
      }
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading prediction:', err);
      setError(err.message || 'Failed to load prediction');
      setLoading(false);
    }
  };

  const placeBet = async () => {
    if (!selectedOption || selectedOption === null || !betAmount) {
      alert('Please select an option and enter bet amount');
      return;
    }

    setPlacingBet(true);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await TelegramWebApp;
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const betData: any = {
        optionIndex: selectedOption,
      };

      if (prediction?.entryFeeStars > 0) {
        betData.starsBet = parseInt(betAmount);
      } else {
        betData.pointsBet = parseInt(betAmount);
      }

      const response = await fetch(`/api/predictions/${id}/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify(betData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to place bet');
      }

      const data = await response.json();
      alert(`Bet placed! New pot: ${data.newPot}`);
      loadPrediction(); // Reload to show updated data
    } catch (err: any) {
      console.error('Error placing bet:', err);
      alert(err.message || 'Failed to place bet');
    } finally {
      setPlacingBet(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error || 'Prediction not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <button
          onClick={() => router.back()}
          className="text-purple-300 mb-4 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold mb-2">{prediction.title}</h1>
        {prediction.description && (
          <p className="text-purple-300">{prediction.description}</p>
        )}
      </header>

      <div className="px-6 pb-6 space-y-6">
        {/* Pot and Stats */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Total Pot</div>
              <div className="text-2xl font-bold">
                {prediction.pot.toLocaleString()} {prediction.entryFeeStars > 0 ? '⭐' : 'EP'}
              </div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Ends In</div>
              <div className="text-lg font-semibold">
                {new Date(prediction.endsAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Options</h2>
          <div className="space-y-3">
            {prediction.options.map((option, index) => {
              const stats = prediction.optionStats.find(s => s.index === index);
              const isSelected = selectedOption === index;
              const isWinner = prediction.resolved && prediction.winnerOption === index;

              return (
                <div
                  key={index}
                  onClick={() => !prediction.resolved && !prediction.userBet && setSelectedOption(index)}
                  className={`bg-purple-900/30 backdrop-blur-lg rounded-xl p-4 border transition-colors ${
                    isSelected
                      ? 'border-purple-400 bg-purple-900/50'
                      : isWinner
                      ? 'border-green-400 bg-green-900/20'
                      : 'border-purple-500/20 hover:border-purple-400/40'
                  } ${!prediction.resolved && !prediction.userBet ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-lg">{option}</div>
                    {isWinner && <span className="text-green-400">🏆 Winner</span>}
                    {isSelected && !prediction.userBet && (
                      <span className="text-purple-400">✓ Selected</span>
                    )}
                  </div>
                  {stats && (
                    <div className="text-sm text-purple-300">
                      {stats.betCount} bets • {stats.totalStars + stats.totalPoints} {prediction.entryFeeStars > 0 ? '⭐' : 'EP'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* User Bet Status */}
        {prediction.userBet && (
          <div className="bg-blue-900/30 backdrop-blur-lg rounded-xl p-4 border border-blue-500/20">
            <div className="text-sm text-blue-300 mb-1">Your Bet</div>
            <div className="font-semibold">
              {prediction.options[prediction.userBet.optionIndex]} •{' '}
              {prediction.userBet.starsBet || prediction.userBet.pointsBet}{' '}
              {prediction.userBet.starsBet > 0 ? '⭐' : 'EP'}
            </div>
          </div>
        )}

        {/* Place Bet Form */}
        {!prediction.resolved && !prediction.userBet && (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-lg font-semibold mb-4">Place Your Bet</h3>
            
            <div className="mb-4">
              <label className="block text-sm text-purple-300 mb-2">Bet Amount</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder={prediction.entryFeeStars > 0 ? `Min: ${prediction.entryFeeStars} Stars` : `Min: ${prediction.entryFeePoints} Points`}
                className="w-full bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                min={prediction.entryFeeStars || prediction.entryFeePoints}
              />
            </div>

            <button
              onClick={placeBet}
              disabled={placingBet || !selectedOption || !betAmount}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg py-3 font-semibold transition-colors"
            >
              {placingBet ? 'Placing Bet...' : 'Place Bet'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

