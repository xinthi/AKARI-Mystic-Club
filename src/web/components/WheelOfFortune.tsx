/**
 * Wheel of Fortune Component
 * 
 * A beautiful, animated wheel that users can spin once per day.
 * Shows prizes, pool balance, and handles spin interactions.
 */

import { useState, useEffect } from 'react';
import { getWebApp } from '../lib/telegram-webapp';

interface WheelProps {
  onBalanceUpdate?: (newBalance: number) => void;
}

interface WheelStatus {
  hasSpunToday: boolean;
  poolBalance: number;
  nextSpinAt: string;
  prizes: number[];
}

// Prize colors for wheel segments
const SEGMENT_COLORS = [
  'from-purple-600 to-purple-700',   // 0
  'from-amber-500 to-amber-600',     // 0.1
  'from-purple-500 to-purple-600',   // 0.2
  'from-amber-400 to-amber-500',     // 0.5
  'from-purple-400 to-purple-500',   // 1
  'from-amber-300 to-amber-400',     // 3
  'from-purple-300 to-purple-400',   // 5
  'from-yellow-400 to-yellow-500',   // 10 (jackpot)
];

export default function WheelOfFortune({ onBalanceUpdate }: WheelProps) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ prize: number; message: string } | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Load wheel status
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const tg = (window as any).Telegram?.WebApp;
        initData = tg?.initData || '';
      }

      const response = await fetch('/api/wheel/status', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      const data = await response.json();
      if (data.ok) {
        setStatus({
          hasSpunToday: data.hasSpunToday,
          poolBalance: data.poolBalance,
          nextSpinAt: data.nextSpinAt,
          prizes: data.prizes,
        });
      }
    } catch (err) {
      console.error('[Wheel] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = async () => {
    if (spinning || status?.hasSpunToday || (status?.poolBalance ?? 0) <= 0) {
      return;
    }

    setSpinning(true);
    setShowResult(false);
    setResult(null);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const tg = (window as any).Telegram?.WebApp;
        initData = tg?.initData || '';
      }

      const response = await fetch('/api/wheel/spin', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': initData,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.ok) {
        // Calculate winning segment index
        const prizes = status?.prizes || [0, 0.1, 0.2, 0.5, 1, 3, 5, 10];
        const prizeIndex = prizes.indexOf(data.prize);
        
        // Calculate rotation to land on winning segment
        // Each segment is 360/8 = 45 degrees
        // Add multiple full rotations for effect
        const segmentAngle = 360 / prizes.length;
        const targetAngle = prizeIndex * segmentAngle;
        const fullRotations = 5; // Number of full spins
        const finalRotation = rotation + (360 * fullRotations) + (360 - targetAngle) + (segmentAngle / 2);
        
        setRotation(finalRotation);

        // Wait for animation to complete
        setTimeout(() => {
          setResult({ prize: data.prize, message: data.message });
          setShowResult(true);
          setSpinning(false);
          
          // Update status
          setStatus(prev => prev ? {
            ...prev,
            hasSpunToday: true,
            poolBalance: data.poolBalance,
          } : null);

          // Notify parent of balance update
          if (onBalanceUpdate && data.newBalance !== undefined) {
            onBalanceUpdate(data.newBalance);
          }
        }, 4000); // Match animation duration
      } else {
        // Handle error
        setResult({ prize: 0, message: data.message });
        setShowResult(true);
        setSpinning(false);
      }
    } catch (err) {
      console.error('[Wheel] Spin failed:', err);
      setResult({ prize: 0, message: 'Failed to spin. Please try again.' });
      setShowResult(true);
      setSpinning(false);
    }
  };

  const formatTimeUntilReset = () => {
    if (!status?.nextSpinAt) return '';
    
    const next = new Date(status.nextSpinAt);
    const now = new Date();
    const diff = next.getTime() - now.getTime();
    
    if (diff <= 0) return 'Now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-purple-900/50 to-amber-900/30 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/20">
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const prizes = status?.prizes || [0, 0.1, 0.2, 0.5, 1, 3, 5, 10];
  const canSpin = !status?.hasSpunToday && (status?.poolBalance ?? 0) > 0 && !spinning;

  return (
    <div className="bg-gradient-to-br from-purple-900/50 to-amber-900/30 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎰</span>
          <div>
            <h3 className="font-bold text-white">Wheel of Fortune</h3>
            <p className="text-xs text-purple-300">Free daily spin!</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-purple-300">Prize Pool</div>
          <div className="text-lg font-bold text-amber-400">
            {(status?.poolBalance ?? 0).toFixed(1)} MYST
          </div>
        </div>
      </div>

      {/* Wheel Container */}
      <div className="relative w-48 h-48 mx-auto mb-4">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
          <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-amber-400 drop-shadow-lg" />
        </div>

        {/* Wheel */}
        <div
          className="w-full h-full rounded-full border-4 border-amber-400 overflow-hidden shadow-2xl transition-transform ease-out"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: spinning ? '4s' : '0s',
            transitionTimingFunction: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)',
          }}
        >
          {prizes.map((prize, index) => {
            const angle = (360 / prizes.length) * index;
            const skew = 90 - (360 / prizes.length);
            
            return (
              <div
                key={index}
                className={`absolute w-1/2 h-1/2 origin-bottom-right bg-gradient-to-br ${SEGMENT_COLORS[index]} border-r border-purple-900/30`}
                style={{
                  transform: `rotate(${angle}deg) skewY(${skew}deg)`,
                  transformOrigin: 'bottom right',
                  top: 0,
                  right: '50%',
                }}
              >
                <span
                  className="absolute text-white font-bold text-xs drop-shadow-lg"
                  style={{
                    transform: `skewY(-${skew}deg) rotate(${360 / prizes.length / 2}deg)`,
                    left: '50%',
                    top: '30%',
                  }}
                >
                  {prize === 0 ? '💔' : prize >= 5 ? `🌟${prize}` : prize}
                </span>
              </div>
            );
          })}
          
          {/* Center circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
              <span className="text-lg">🎯</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result Popup */}
      {showResult && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-2xl z-20">
          <div className="text-center p-6 animate-bounce-in">
            <div className="text-5xl mb-3">
              {result.prize > 0 ? '🎉' : '😢'}
            </div>
            <div className="text-xl font-bold text-white mb-2">
              {result.prize > 0 ? `You won ${result.prize} MYST!` : 'Better luck next time!'}
            </div>
            <button
              onClick={() => setShowResult(false)}
              className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-semibold transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Spin Button */}
      <button
        onClick={handleSpin}
        disabled={!canSpin}
        className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
          canSpin
            ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        {spinning ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Spinning...
          </span>
        ) : status?.hasSpunToday ? (
          <span>Next spin in {formatTimeUntilReset()}</span>
        ) : (status?.poolBalance ?? 0) <= 0 ? (
          <span>Pool Empty</span>
        ) : (
          <span>🎰 SPIN FREE</span>
        )}
      </button>

      {/* Prize Legend */}
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {prizes.map((prize, i) => (
          <div key={i} className="text-[10px] text-purple-300">
            {prize === 0 ? '0' : prize} {prize > 0 && 'MYST'}
          </div>
        ))}
      </div>
    </div>
  );
}

