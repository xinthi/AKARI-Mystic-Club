/**
 * Prediction Detail Page
 *
 * Shows prediction details, options, and allows placing bets
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../../lib/telegram-webapp';

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
  winningOption?: string;
  endsAt: string;
  optionStats?: Array<{
    option: string;
    index: number;
    betCount: number;
    totalStars: number;
    totalPoints: number;
  }>;
  userBet?: {
    optionIndex: number;
    option?: string;
    starsBet: number;
    pointsBet: number;
  };
}

export default function PredictionDetailPage() {
  const router = useRouter();
  const [prediction, setPrediction] = useState<PredictionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<string>('');
  const [placingBet, setPlacingBet] = useState(false);

  // Safe array accessors
  const safeOptions = Array.isArray(prediction?.options) ? prediction!.options : [];
  const safeOptionStats = Array.isArray(prediction?.optionStats) ? prediction!.optionStats : [];

  const loadPrediction = useCallback(async (predictionId: string) => {
    try {
      setLoading(true);
      setError(null);

      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch(`/api/predictions/${predictionId}`, {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load prediction');
      }

      const data = await response.json();

      if (!data.prediction) {
        throw new Error('Prediction not found');
      }

      setPrediction(data.prediction);

      // Set selected option if user already has a bet
      if (data.prediction?.userBet?.optionIndex !== undefined) {
        setSelectedOption(data.prediction.userBet.optionIndex);
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load prediction:', err);
      setError(err.message || 'Failed to load prediction');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.error('Telegram WebApp SDK not available', e);
      }
    }

    // Wait for router to be ready and id to be a string
    if (!router.isReady) return;
    if (typeof router.query.id !== 'string') return;

    loadPrediction(router.query.id);
  }, [router.isReady, router.query.id, loadPrediction]);

  const placeBet = async () => {
    // Defensive checks
    if (!prediction) {
      setError('Market is not loaded yet');
      return;
    }

    if (selectedOption === null) {
      setError('Please select an option');
      return;
    }

    if (!betAmount || parseInt(betAmount) <= 0) {
      setError('Please enter a valid bet amount');
      return;
    }

    setPlacingBet(true);
    setError(null);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      // Get the option string from safeOptions
      const optionString = safeOptions[selectedOption];
      if (!optionString) {
        setError('Invalid option selected');
        setPlacingBet(false);
        return;
      }

      const betData: { option: string; betAmount?: number } = {
        option: optionString,
        betAmount: parseInt(betAmount),
      };

      const response = await fetch(`/api/predictions/${prediction.id}/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify(betData),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        console.error('Bet failed:', data);
        setError(data.reason ?? data.error ?? 'Failed to place bet');
        setPlacingBet(false);
        return;
      }

      // Success - reload prediction to show updated data
      if (typeof router.query.id === 'string') {
        await loadPrediction(router.query.id);
      }
    } catch (err: any) {
      console.error('Bet exception:', err);
      setError('Failed to place bet');
    } finally {
      setPlacingBet(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Error or no prediction state
  if (error || !prediction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-xl bg-red-900/40 px-6 py-4 text-center text-sm text-red-100 max-w-sm">
            <div className="text-2xl mb-2">🔮</div>
            <div>{error || 'Failed to load this market.'}</div>
            <div className="mt-2 text-red-300/70">Please close and reopen the Mini App.</div>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 text-white"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Safe user bet option display
  const getUserBetOptionLabel = (): string => {
    if (!prediction.userBet) return '';
    // Try to get option by string first, then by index
    if (prediction.userBet.option) return prediction.userBet.option;
    const idx = prediction.userBet.optionIndex;
    if (typeof idx === 'number' && safeOptions[idx]) {
      return safeOptions[idx];
    }
    return `Option ${idx}`;
  };

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
        {/* Error banner */}
        {error && (
          <div className="bg-red-900/30 backdrop-blur-lg rounded-xl p-4 border border-red-500/20">
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        {/* Pot and Stats */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Total Pot</div>
              <div className="text-2xl font-bold">
                {(prediction.pot ?? 0).toLocaleString()} {prediction.entryFeeStars > 0 ? '⭐' : 'EP'}
              </div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Ends</div>
              <div className="text-lg font-semibold">
                {prediction.endsAt ? new Date(prediction.endsAt).toLocaleDateString() : 'TBD'}
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Options</h2>
          <div className="space-y-3">
            {safeOptions.length === 0 ? (
              <div className="text-purple-300 text-sm">No options available</div>
            ) : (
              safeOptions.map((option, index) => {
                const stats = safeOptionStats.find((s) => s.index === index);
                const isSelected = selectedOption === index;
                const isWinner =
                  prediction.resolved &&
                  (prediction.winnerOption === index || prediction.winningOption === option);

                return (
                  <div
                    key={index}
                    onClick={() =>
                      !prediction.resolved && !prediction.userBet && setSelectedOption(index)
                    }
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
                        {stats.betCount} bets • {(stats.totalStars ?? 0) + (stats.totalPoints ?? 0)}{' '}
                        {prediction.entryFeeStars > 0 ? '⭐' : 'EP'}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* User Bet Status */}
        {prediction.userBet && (
          <div className="bg-blue-900/30 backdrop-blur-lg rounded-xl p-4 border border-blue-500/20">
            <div className="text-sm text-blue-300 mb-1">Your Bet</div>
            <div className="font-semibold">
              {getUserBetOptionLabel()} •{' '}
              {prediction.userBet.starsBet || prediction.userBet.pointsBet}{' '}
              {(prediction.userBet.starsBet ?? 0) > 0 ? '⭐' : 'EP'}
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
                placeholder={
                  prediction.entryFeeStars > 0
                    ? `Min: ${prediction.entryFeeStars} Stars`
                    : `Min: ${prediction.entryFeePoints} Points`
                }
                className="w-full bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                min={prediction.entryFeeStars || prediction.entryFeePoints || 1}
              />
            </div>

            <button
              onClick={placeBet}
              disabled={placingBet || selectedOption === null || !betAmount}
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
