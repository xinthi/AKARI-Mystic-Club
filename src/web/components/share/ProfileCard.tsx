/**
 * ProfileCard Component
 * 
 * A compact credit card-style shareable profile card displaying AKARI metrics.
 * Optimized for html2canvas export compatibility.
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

function getTierConfig(tier: string): { color: string; bgColor: string; borderColor: string; icon: string } {
  const tierLower = tier.toLowerCase();
  if (tierLower.includes('institutional')) {
    return { 
      color: '#fbbf24', 
      bgColor: 'rgba(251, 191, 36, 0.25)', 
      borderColor: 'rgba(251, 191, 36, 0.6)',
      icon: '👑' 
    };
  }
  if (tierLower.includes('analyst')) {
    return { 
      color: '#a855f7', 
      bgColor: 'rgba(168, 85, 247, 0.25)', 
      borderColor: 'rgba(168, 85, 247, 0.6)',
      icon: '🔮' 
    };
  }
  return { 
    color: '#3bf4ff', 
    bgColor: 'rgba(59, 244, 255, 0.2)', 
    borderColor: 'rgba(59, 244, 255, 0.5)',
    icon: '✨' 
  };
}

function getScoreRank(score: number | null): { label: string; color: string } {
  if (score === null) return { label: 'Unranked', color: '#666666' };
  if (score >= 900) return { label: 'Elite', color: '#fbbf24' };
  if (score >= 700) return { label: 'Advanced', color: '#a855f7' };
  if (score >= 500) return { label: 'Rising', color: '#3bf4ff' };
  if (score >= 300) return { label: 'Active', color: '#22c55e' };
  return { label: 'Newcomer', color: '#6b7280' };
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
  const tierConfig = getTierConfig(tier);
  const scoreRank = getScoreRank(score);
  const initial = displayNameFinal.charAt(0).toUpperCase();
  const hasPower = power !== null && power > 0;

  return (
    <div
      style={{
        width: '380px',
        height: '238px',
        background: '#08080c',
        borderRadius: '14px',
        border: '1px solid rgba(59, 244, 255, 0.25)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        padding: '16px 18px',
        boxSizing: 'border-box',
      }}
    >
      {/* Blockchain/Data Grid Background */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '380px',
          height: '238px',
          pointerEvents: 'none',
        }}
        width="380"
        height="238"
        viewBox="0 0 380 238"
      >
        <defs>
          <linearGradient id="lineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3bf4ff" stopOpacity="0" />
            <stop offset="50%" stopColor="#3bf4ff" stopOpacity="1" />
            <stop offset="100%" stopColor="#3bf4ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f6a2" stopOpacity="0" />
            <stop offset="50%" stopColor="#00f6a2" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00f6a2" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid pattern */}
        <g opacity="0.12">
          {[0, 40, 80, 120, 160, 200].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="380" y2={y} stroke="#3bf4ff" strokeWidth="0.5" />
          ))}
          {[0, 50, 100, 150, 200, 250, 300, 350].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="238" stroke="#3bf4ff" strokeWidth="0.5" />
          ))}
        </g>

        {/* Data flow curves */}
        <path d="M -10 190 Q 80 170 150 195 Q 220 220 300 180 Q 350 160 390 175" stroke="url(#lineGrad1)" strokeWidth="1.5" fill="none" opacity="0.4" />
        <path d="M -10 50 Q 100 70 180 45 Q 260 20 340 55 Q 370 70 390 60" stroke="url(#lineGrad2)" strokeWidth="1.5" fill="none" opacity="0.35" />
        <path d="M -10 120 Q 70 140 140 115 Q 210 90 280 125 Q 340 150 390 130" stroke="url(#lineGrad3)" strokeWidth="1" fill="none" opacity="0.3" />

        {/* Blockchain nodes */}
        <circle cx="50" cy="185" r="4" fill="#3bf4ff" opacity="0.6" />
        <circle cx="150" cy="195" r="3" fill="#3bf4ff" opacity="0.5" />
        <circle cx="300" cy="180" r="3.5" fill="#3bf4ff" opacity="0.5" />
        <circle cx="355" cy="170" r="2.5" fill="#3bf4ff" opacity="0.4" />

        <circle cx="70" cy="55" r="3" fill="#a855f7" opacity="0.55" />
        <circle cx="180" cy="45" r="3.5" fill="#a855f7" opacity="0.5" />
        <circle cx="340" cy="55" r="3" fill="#a855f7" opacity="0.45" />

        <circle cx="140" cy="115" r="2.5" fill="#00f6a2" opacity="0.45" />
        <circle cx="280" cy="125" r="2.5" fill="#00f6a2" opacity="0.4" />

        {/* Connection lines between nodes */}
        <line x1="50" y1="185" x2="150" y2="195" stroke="#3bf4ff" strokeWidth="0.5" opacity="0.25" />
        <line x1="150" y1="195" x2="300" y2="180" stroke="#3bf4ff" strokeWidth="0.5" opacity="0.2" />
        <line x1="70" y1="55" x2="180" y2="45" stroke="#a855f7" strokeWidth="0.5" opacity="0.25" />

        {/* Corner decorations */}
        <path d="M 365 15 L 375 5 L 380 15" stroke="#3bf4ff" strokeWidth="1" fill="none" opacity="0.5" />
        <path d="M 0 223 L 10 233 L 15 223" stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.5" />
        <path d="M 5 5 L 15 5 L 15 15" stroke="#00f6a2" strokeWidth="1" fill="none" opacity="0.4" />

        {/* Floating particles */}
        <circle cx="320" cy="30" r="1.5" fill="#3bf4ff" opacity="0.7" />
        <circle cx="360" cy="90" r="2" fill="#a855f7" opacity="0.6" />
        <circle cx="25" cy="110" r="1.5" fill="#00f6a2" opacity="0.6" />
        <circle cx="60" cy="210" r="1.5" fill="#fbbf24" opacity="0.5" />
        <circle cx="220" cy="225" r="2" fill="#3bf4ff" opacity="0.4" />
        <circle cx="100" cy="25" r="1.5" fill="#ec4899" opacity="0.5" />
      </svg>

      {/* Gradient overlays */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 100% 0%, rgba(168, 85, 247, 0.15) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(59, 244, 255, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* === TOP ROW === */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="/mystic-heros-favicon.png"
            alt="AKARI"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
          />
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px' }}>
              AKARI
            </div>
            <div style={{ fontSize: '8px', fontWeight: '500', color: '#00f6a2', letterSpacing: '0.5px' }}>
              MYSTIC CLUB
            </div>
          </div>
        </div>

        {/* Tier Badge */}
        <div
          style={{
            padding: '6px 14px',
            borderRadius: '14px',
            background: tierConfig.bgColor,
            border: `1.5px solid ${tierConfig.borderColor}`,
            boxShadow: `0 0 12px ${tierConfig.color}40`,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '13px', verticalAlign: 'middle' }}>{tierConfig.icon}</span>
          <span 
            style={{ 
              fontSize: '10px', 
              fontWeight: '700', 
              color: tierConfig.color, 
              letterSpacing: '0.5px',
              marginLeft: '6px',
              verticalAlign: 'middle',
            }}
          >
            {tier.toUpperCase()}
          </span>
        </div>
      </div>

      {/* === MIDDLE ROW === */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* User Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar */}
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${tierConfig.color}, ${tierConfig.color}80)`,
              padding: '2px',
              boxShadow: `0 0 10px ${tierConfig.color}40`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '10px',
                background: '#10101a',
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
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: tierConfig.color }}>
                  {initial}
                </span>
              )}
            </div>
          </div>

          {/* Name & Handle */}
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '2px' }}>
              {displayNameFinal}
            </div>
            <div style={{ fontSize: '11px', color: '#888888', marginBottom: '3px' }}>
              @{username}
            </div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: scoreRank.color, letterSpacing: '0.5px' }}>
              {scoreRank.label.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Score Display */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '8px', color: '#666666', letterSpacing: '1.5px', marginBottom: '4px' }}>
            AKARI SCORE
          </div>
          <div
            style={{
              fontSize: '42px',
              fontWeight: '800',
              color: '#3bf4ff',
              lineHeight: '1',
              letterSpacing: '-1px',
              textShadow: '0 0 20px rgba(59, 244, 255, 0.5)',
            }}
          >
            {score !== null ? score : '—'}
          </div>
        </div>
      </div>

      {/* === BOTTOM ROW === */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Stats */}
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Sentiment */}
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#ec4899', lineHeight: '1' }}>
              {sentiment !== null ? sentiment : '-'}
            </div>
            <div style={{ fontSize: '8px', color: '#666666', letterSpacing: '0.3px', marginTop: '3px' }}>
              SENTIMENT
            </div>
          </div>

          {/* Heat */}
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#f97316', lineHeight: '1' }}>
              {heat !== null ? heat : '-'}
            </div>
            <div style={{ fontSize: '8px', color: '#666666', letterSpacing: '0.3px', marginTop: '3px' }}>
              CT HEAT
            </div>
          </div>

          {/* Power - show if > 0 */}
          {hasPower && (
            <div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fbbf24', lineHeight: '1' }}>
                {formatNumber(power)}
              </div>
              <div style={{ fontSize: '8px', color: '#666666', letterSpacing: '0.3px', marginTop: '3px' }}>
                CIRCLE POWER
              </div>
            </div>
          )}
        </div>

        {/* Tagline & Date */}
        <div style={{ textAlign: 'right', maxWidth: '140px' }}>
          <div style={{ fontSize: '9px', color: '#555555', fontStyle: 'italic', lineHeight: '1.3', marginBottom: '4px' }}>
            "{tagline}"
          </div>
          <div style={{ fontSize: '8px', color: '#444444', letterSpacing: '0.5px' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  );
}
