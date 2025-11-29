/**
 * Wheel of Fortune Component
 * 
 * A beautiful, animated wheel with 2 free spins daily.
 * More aXP options than MYST to encourage engagement.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

// Colors match the prize types: purple/violet for aXP, amber/orange for MYST
const SEGMENT_COLORS = [
  '#9333ea', // purple - aXP +5
  '#f97316', // orange - 0.1 MYST
  '#8b5cf6', // violet - aXP +10
  '#eab308', // yellow - 0.5 MYST
  '#a855f7', // fuchsia - aXP +15
  '#7c3aed', // indigo - aXP +20
  '#6366f1', // purple - aXP +25
  '#f59e0b', // amber - 1 MYST jackpot
];

export default function WheelOfFortune({ onBalanceUpdate }: WheelProps) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ prize: Prize; message: string } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const spinSoundRef = useRef<HTMLAudioElement | null>(null);

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

    // Haptic feedback on Telegram
    try {
      const tg = (window as any).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred?.('medium');
    } catch (e) {}

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
        
        // Calculate rotation (6-8 full spins + land on prize)
        const segmentAngle = 360 / status.prizes.length;
        const targetAngle = prizeIndex >= 0 ? prizeIndex * segmentAngle : 0;
        const fullRotations = 6 + Math.random() * 2; // 6-8 full spins
        const finalRotation = rotation + (360 * fullRotations) + (360 - targetAngle) + (segmentAngle / 2);
        
        setRotation(finalRotation);

        // Wait for animation to complete
        setTimeout(() => {
          // Haptic feedback on win
          try {
            const tg = (window as any).Telegram?.WebApp;
            tg?.HapticFeedback?.notificationOccurred?.('success');
          } catch (e) {}

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
        }, 5000); // 5 second spin
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
          <div className="w-8 h-8 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
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
      <div className="relative w-56 h-56 mx-auto mb-4">
        {/* Outer glow effect */}
        <div className="absolute -inset-2 bg-gradient-to-r from-purple-600 via-amber-500 to-purple-600 rounded-full opacity-30 blur-lg animate-pulse" />
        
        {/* Pointer / Arrow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20">
          <div className="relative">
            <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[22px] border-t-yellow-400 drop-shadow-lg" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-yellow-300" />
          </div>
        </div>

        {/* Wheel */}
        <div
          ref={wheelRef}
          className="w-full h-full rounded-full border-4 border-yellow-400 overflow-hidden shadow-2xl relative"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning 
              ? 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)' 
              : 'none',
            boxShadow: '0 0 30px rgba(234, 179, 8, 0.3), inset 0 0 20px rgba(0,0,0,0.3)',
          }}
        >
          {/* SVG Wheel for proper pie slices */}
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {prizes.map((prize, index) => {
              const angle = 360 / prizes.length;
              const startAngle = index * angle - 90; // -90 to start from top
              const endAngle = startAngle + angle;
              
              // Calculate arc path
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              const x1 = 100 + 100 * Math.cos(startRad);
              const y1 = 100 + 100 * Math.sin(startRad);
              const x2 = 100 + 100 * Math.cos(endRad);
              const y2 = 100 + 100 * Math.sin(endRad);
              const largeArc = angle > 180 ? 1 : 0;
              
              const path = `M 100 100 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`;
              
              // Text position (middle of slice)
              const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
              const textX = 100 + 60 * Math.cos(midAngle);
              const textY = 100 + 60 * Math.sin(midAngle);
              const textRotation = (startAngle + endAngle) / 2 + 90;
              
              return (
                <g key={index}>
                  <path
                    d={path}
                    fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                    stroke="#1a1a2e"
                    strokeWidth="1"
                  />
                  <text
                    x={textX}
                    y={textY}
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                  >
                    {prize.type === 'myst' ? `${prize.myst} 💎` : `+${prize.axp} ⭐`}
                  </text>
                </g>
              );
            })}
          </svg>
          
          {/* Center circle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full border-4 border-white shadow-xl flex items-center justify-center">
              <span className="text-3xl">🔮</span>
            </div>
          </div>
        </div>

        {/* Decorative lights around wheel */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={`absolute w-2 h-2 rounded-full ${spinning ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor: i % 2 === 0 ? '#fbbf24' : '#fff',
                top: `${50 + 48 * Math.sin((i * 30 * Math.PI) / 180)}%`,
                left: `${50 + 48 * Math.cos((i * 30 * Math.PI) / 180)}%`,
                transform: 'translate(-50%, -50%)',
                boxShadow: spinning ? '0 0 8px rgba(251, 191, 36, 0.8)' : 'none',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Result Modal */}
      {showResult && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl z-30 backdrop-blur-sm">
          <div className="text-center p-6 animate-bounce-in">
            <div className="text-7xl mb-4 animate-pulse">
              {result.prize.type === 'myst' ? '💎' : '⭐'}
            </div>
            <div className="text-2xl font-bold text-white mb-2">
              {result.prize.type === 'myst' 
                ? `You won ${result.prize.myst} MYST!`
                : `You gained +${result.prize.axp} aXP!`}
            </div>
            <p className="text-purple-300 text-sm mb-4">
              {result.prize.type === 'myst' 
                ? 'MYST added to your balance!' 
                : 'Experience points earned!'}
            </p>
            <button
              onClick={() => setShowResult(false)}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 rounded-xl font-bold text-lg transition-all shadow-lg"
            >
              Awesome! 🎉
            </button>
          </div>
        </div>
      )}

      {/* Spin Button */}
      <button
        onClick={handleSpin}
        disabled={!canSpin}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all relative overflow-hidden ${
          canSpin
            ? 'bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:via-amber-400 hover:to-yellow-500 text-white shadow-lg shadow-amber-500/30'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        {spinning && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
        {spinning ? (
          <span className="flex items-center justify-center gap-2 relative z-10">
            <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            Spinning...
          </span>
        ) : status?.spinsRemaining === 0 ? (
          <span>Next spin in {formatTimeUntilReset()}</span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            🎰 SPIN NOW ({status?.spinsRemaining ?? 0} left)
          </span>
        )}
      </button>

      {/* Prize Legend */}
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {prizes.slice(0, 8).map((prize, i) => (
          <div 
            key={i} 
            className={`text-[9px] px-1 py-0.5 rounded ${
              prize.type === 'myst' ? 'bg-amber-900/30 text-amber-300' : 'bg-purple-900/30 text-purple-300'
            }`}
          >
            {prize.label}
          </div>
        ))}
      </div>

      {/* Shimmer animation style */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1s ease-in-out infinite;
        }
        @keyframes bounce-in {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
