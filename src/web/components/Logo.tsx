import React from 'react';
import Image from 'next/image';

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 28, showText = false, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/mystic-heros-favicon.png"
        alt="AKARI Mystic Club"
        width={size}
        height={size}
        className="flex-shrink-0"
        style={{ width: size, height: size }}
        unoptimized
      />
      {showText && (
        <div className="flex flex-col">
          <span className="text-[11px] tracking-[0.18em] uppercase text-akari-muted font-medium">
            Akari Mystic Club
          </span>
        </div>
      )}
    </div>
  );
}

