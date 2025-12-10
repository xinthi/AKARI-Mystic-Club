/**
 * ProfileCard Component
 * 
 * A shareable profile card displaying AKARI metrics with neon styling.
 * Used both for preview and server-side image generation.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileCardProps {
  /** Avatar URL */
  avatar: string | null;
  /** X username (without @) */
  username: string;
  /** User tier (Seer / Analyst / Institutional Plus) */
  tier: string;
  /** AKARI Score */
  score: number | null;
  /** Sentiment 30d score */
  sentiment: number | null;
  /** CT Heat score */
  heat: number | null;
  /** Inner Circle Power */
  power: number | null;
  /** Dynamic tagline based on score */
  tagline: string;
  /** Optional: Display name (falls back to username) */
  displayName?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function getTierColor(tier: string): string {
  const tierLower = tier.toLowerCase();
  if (tierLower.includes('institutional')) return '#fbbf24'; // amber
  if (tierLower.includes('analyst')) return '#a855f7'; // violet
  return '#60a5fa'; // blue (seer)
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileCard({
  avatar,
  username,
  tier,
  score,
  sentiment,
  heat,
  power,
  tagline,
  displayName,
}: ProfileCardProps) {
  const displayNameFinal = displayName || username;
  const tierColor = getTierColor(tier);
  const initial = displayNameFinal.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
        borderRadius: '24px',
        border: '2px solid rgba(59, 244, 255, 0.3)',
        boxShadow: '0 0 40px rgba(59, 244, 255, 0.2), inset 0 0 40px rgba(59, 244, 255, 0.05)',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Decorative rays behind avatar */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          opacity: 0.15,
          pointerEvents: 'none',
        }}
      >
        <svg width="300" height="300" viewBox="0 0 300 300" fill="none">
          <defs>
            <radialGradient id="rayGradient">
              <stop offset="0%" stopColor="#3bf4ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3bf4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[...Array(8)].map((_, i) => {
            const angle = (i * 360) / 8;
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={i}
                x1="150"
                y1="150"
                x2={150 + 150 * Math.cos(rad)}
                y2={150 + 150 * Math.sin(rad)}
                stroke="url(#rayGradient)"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>

      {/* Avatar with neon ring */}
      <div
        style={{
          position: 'relative',
          marginBottom: '24px',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${tierColor}40, #3bf4ff40)`,
            padding: '4px',
            boxShadow: `0 0 30px ${tierColor}60, inset 0 0 20px ${tierColor}30`,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: '#1a1a2e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={displayNameFinal}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: tierColor,
                }}
              >
                {initial}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Username */}
      <div
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#e0e0e0',
          marginBottom: '8px',
          textAlign: 'center',
        }}
      >
        @{username}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: '14px',
          color: '#888',
          marginBottom: '32px',
          textAlign: 'center',
          fontStyle: 'italic',
          maxWidth: '400px',
        }}
      >
        {tagline}
      </div>

      {/* AKARI Score - Large serif number */}
      <div
        style={{
          marginBottom: '32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: '#888',
            marginBottom: '8px',
            fontWeight: '600',
          }}
        >
          AKARI Score
        </div>
        <div
          style={{
            fontSize: '72px',
            fontWeight: 'bold',
            fontFamily: '"Playfair Display", "DM Serif Display", serif',
            background: 'linear-gradient(135deg, #3bf4ff, #a855f7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: '1',
          }}
        >
          {score !== null ? score : '-'}
        </div>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: 'flex',
          gap: '32px',
          marginBottom: '24px',
        }}
      >
        {/* Sentiment */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ec4899, #f472b6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              marginBottom: '4px',
            }}
          >
            💭
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#ec4899',
            }}
          >
            {sentiment !== null ? sentiment : '-'}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Sentiment
          </div>
        </div>

        {/* CT Heat */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #a855f7, #c084fc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              marginBottom: '4px',
            }}
          >
            🔥
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#a855f7',
            }}
          >
            {heat !== null ? heat : '-'}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            CT Heat
          </div>
        </div>

        {/* Power */}
        {power !== null && power > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #fbbf24, #fcd34d)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                marginBottom: '4px',
              }}
            >
              ⚡
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#fbbf24',
              }}
            >
              {formatNumber(power)}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Power
            </div>
          </div>
        )}
      </div>

      {/* Tier Badge */}
      <div
        style={{
          padding: '8px 20px',
          borderRadius: '20px',
          background: `${tierColor}20`,
          border: `1px solid ${tierColor}60`,
          color: tierColor,
          fontSize: '12px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        {tier}
      </div>
    </div>
  );
}

