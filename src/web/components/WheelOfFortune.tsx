/**
 * Wheel of Fortune Component
 * 
 * A beautiful, animated wheel with 2 free spins daily.
 * Prizes include both MYST and aXP.
 */

import { useState, useEffect, useCallback } from 'react';

interface WheelProps {
  onBalanceUpdate?: (newMystBalance: number, newAxp: number) => void;
}

interface Prize {
  type: string;
  label: string;
  myst: number;
  axp: number;
}

interface WheelStatus {
  spinsRemaining: number;
  maxSpinsPerDay: number;
  poolBalance: number;
  nextResetAt: string;
  prizes: Prize[];
  poolEmpty: boolean;
}

// Vibrant GenZ-friendly colors for wheel segments
const SEGMENT_COLORS = [
  'from-violet-500 to-purple-600',   // aXP +5
  'from-fuchsia-500 to-pink-600',    // aXP +10
  'from-amber-400 to-orange-500',    // 0.1 MYST
  'from-cyan-400 to-blue-500',       // 0.2 MYST
  'from-lime-400 to-green-500',      // 0.5 MYST
  'from-yellow-400 to-amber-500',    // 1 MYST
  'from-rose-400 to-red-500',        // 3 MYST
  'from-yellow-300 to-yellow-500',   // 10 MYST (jackpot)
];

export default function WheelOfFortune({ onBalanceUpdate }: WheelProps) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ prize: Prize; message: string } | null>(null);
  const [showResult, setShowResult] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
        initData = tg?.initData ?? '';
      }

      const response = await fetch('/api/wheel/status', {
        headers: { 'X-Telegram-Init-Data': initData },
      });

      const data = await response.json();
      if (data.ok) {
        setStatus({
          spinsRemaining: data.spinsRemaining,
          maxSpinsPerDay: data.maxSpinsPerDay,
          poolBalance: data.poolBalance,
          nextResetAt: data.nextResetAt,
          prizes: data.prizes,
          poolEmpty: data.poolEmpty,
        });
      }
    } catch (err) {
      console.error('[Wheel] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSpin = async () => {
    if (spinning || !status || status.spinsRemaining <= 0) return;

    setSpinning(true);
    setShowResult(false);
    setResult(null);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
        initData = tg?.initData ?? '';
      }

      const response = await fetch('/api/wheel/spin', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': initData,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.ok && data.prize) {
        // Find prize index for rotation
        const prizeIndex = status.prizes.findIndex(
          p => p.label === data.prize.label
        );
        
        // Calculate rotation (5 full spins + land on prize)
        const segmentAngle = 360 / status.prizes.length;
        const targetAngle = prizeIndex >= 0 ? prizeIndex * segmentAngle : 0;
        const fullRotations = 5;
        const finalRotation = rotation + (360 * fullRotations) + (360 - targetAngle) + (segmentAngle / 2);
        
        setRotation(finalRotation);

        // Wait for animation
        setTimeout(() => {
          setResult({ prize: data.prize, message: data.message });
          setShowResult(true);
          setSpinning(false);
          
          // Update status
          setStatus(prev => prev ? {
            ...prev,
            spinsRemaining: data.spinsRemaining,
            poolBalance: data.poolBalance,
          } : null);

          // Notify parent
          if (onBalanceUpdate) {
            onBalanceUpdate(data.newMystBalance ?? 0, data.newAxp ?? 0);
          }
        }, 4000);
      } else {
        setResult({ 
          prize: { type: 'none', label: 'Error', myst: 0, axp: 0 }, 
          message: data.message ?? 'Spin failed' 
        });
        setShowResult(true);
        setSpinning(false);
      }
    } catch (err) {
      console.error('[Wheel] Spin failed:', err);
      setResult({ 
        prize: { type: 'none', label: 'Error', myst: 0, axp: 0 }, 
        message: 'Failed to spin. Please try again.' 
      });
      setShowResult(true);
      setSpinning(false);
    }
  };

  const formatTimeUntilReset = (): string => {
    if (!status?.nextResetAt) return '';
    
    const next = new Date(status.nextResetAt);
    const now = new Date();
    const diff = next.getTime() - now.getTime();
    
    if (diff <= 0) return 'Now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-purple-900/50 to-fuchsia-900/30 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/20">
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const prizes = status?.prizes ?? [];
  const canSpin = status && status.spinsRemaining > 0 && !spinning;

  return (
    <div className="bg-gradient-to-br from-purple-900/50 to-fuchsia-900/30 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/20 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎰</span>
          <div>
            <h3 className="font-bold text-white">Wheel of Fortune</h3>
            <p className="text-xs text-purple-300">
              {status?.spinsRemaining ?? 0}/{status?.maxSpinsPerDay ?? 2} free spins daily
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-purple-300">Prize Pool</div>
          <div className="text-lg font-bold text-amber-400">
            {(status?.poolBalance ?? 0).toFixed(1)} MYST
          </div>
        </div>
      </div>

      {/* Pool Empty Banner */}
      {status?.poolEmpty && (
        <div className="mb-3 bg-amber-900/30 border border-amber-500/30 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div className="text-xs text-amber-200">
              <div className="font-semibold">Pool Empty</div>
              <div className="text-amber-300/70">Play predictions and quests to refill the prize pool.</div>
            </div>
          </div>
        </div>
      )}

      {/* Wheel Container */}
      <div className="relative w-52 h-52 mx-auto mb-4">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
          <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[18px] border-t-yellow-400 drop-shadow-lg" />
        </div>

        {/* Wheel */}
        <div
          className="w-full h-full rounded-full border-4 border-yellow-400 overflow-hidden shadow-2xl transition-transform"
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
                className={`absolute w-1/2 h-1/2 origin-bottom-right bg-gradient-to-br ${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} border-r border-purple-900/30`}
                style={{
                  transform: `rotate(${angle}deg) skewY(${skew}deg)`,
                  transformOrigin: 'bottom right',
                  top: 0,
                  right: '50%',
                }}
              >
                <span
                  className="absolute text-white font-bold text-[10px] drop-shadow-lg whitespace-nowrap"
                  style={{
                    transform: `skewY(-${skew}deg) rotate(${360 / prizes.length / 2}deg)`,
                    left: '35%',
                    top: '25%',
                  }}
                >
                  {prize.type === 'myst' ? `${prize.myst}` : `+${prize.axp}`}
                </span>
              </div>
            );
          })}
          
          {/* Center circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
              <span className="text-2xl">🔮</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {showResult && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl z-20">
          <div className="text-center p-6">
            <div className="text-6xl mb-4">
              {result.prize.type === 'myst' ? '💎' : '⭐'}
            </div>
            <div className="text-xl font-bold text-white mb-2">
              {result.prize.type === 'myst' 
                ? `You won ${result.prize.myst} MYST!`
                : `You gained +${result.prize.axp} aXP!`}
            </div>
            <button
              onClick={() => setShowResult(false)}
              className="mt-3 px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors"
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
            ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/30'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        {spinning ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Spinning...
          </span>
        ) : status?.spinsRemaining === 0 ? (
          <span>Next spin in {formatTimeUntilReset()}</span>
        ) : (
          <span>🎰 SPIN ({status?.spinsRemaining ?? 0} left)</span>
        )}
      </button>

      {/* Prize Legend */}
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {prizes.slice(0, 8).map((prize, i) => (
          <div 
            key={i} 
            className={`text-[9px] px-1 py-0.5 rounded ${
              prize.type === 'myst' ? 'text-amber-300' : 'text-purple-300'
            }`}
          >
            {prize.label}
          </div>
        ))}
      </div>
    </div>
  );
}
