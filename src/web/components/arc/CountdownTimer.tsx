/**
 * Countdown Timer Component
 * 
 * Displays a countdown to a target date
 */

import React, { useEffect, useState } from 'react';

interface CountdownTimerProps {
  targetDate: string | Date;
  onComplete?: () => void;
}

export function CountdownTimer({ targetDate, onComplete }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const target = new Date(targetDate);
    
    const updateTimer = () => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        if (onComplete) {
          onComplete();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [targetDate, onComplete]);

  if (timeLeft === null) {
    return (
      <div className="text-white/60 text-sm">Calculating...</div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-white">
      <div className="text-center">
        <div className="text-lg font-bold">{timeLeft.days}</div>
        <div className="text-xs text-white/60">Day</div>
      </div>
      <span className="text-white/40">:</span>
      <div className="text-center">
        <div className="text-lg font-bold">{String(timeLeft.hours).padStart(2, '0')}</div>
        <div className="text-xs text-white/60">Hour</div>
      </div>
      <span className="text-white/40">:</span>
      <div className="text-center">
        <div className="text-lg font-bold">{String(timeLeft.minutes).padStart(2, '0')}</div>
        <div className="text-xs text-white/60">Min</div>
      </div>
      <span className="text-white/40">:</span>
      <div className="text-center">
        <div className="text-lg font-bold">{String(timeLeft.seconds).padStart(2, '0')}</div>
        <div className="text-xs text-white/60">Sec</div>
      </div>
    </div>
  );
}
