/**
 * ProfileSocialConnections Component
 * 
 * Displays connected social accounts (X, Telegram, Discord, etc.)
 * with connection status for each platform.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileSocialConnectionsProps {
  /** Whether X (Twitter) is connected */
  xConnected: boolean;
  /** Whether Telegram is connected */
  telegramConnected: boolean;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface ConnectedAccountRowProps {
  icon: React.ReactNode;
  name: string;
  status: string;
  statusColor?: string;
  helperText?: string;
}

function ConnectedAccountRow({
  icon,
  name,
  status,
  statusColor = 'text-akari-muted',
  helperText,
}: ConnectedAccountRowProps) {
  const isConnected = statusColor === 'text-akari-neon-teal';
  return (
    <div className="flex items-center justify-between py-3 border-b border-akari-neon-teal/10 last:border-0 min-h-[52px] transition-all duration-300 hover:bg-akari-cardSoft/30 rounded-lg px-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-akari-cardSoft/50 border border-akari-neon-teal/20 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-akari-text font-semibold">{name}</p>
          {helperText && (
            <p className="text-xs text-akari-muted mt-0.5 max-w-[220px] leading-tight">
              {helperText}
            </p>
          )}
        </div>
      </div>
      <span className={`pill-neon text-xs flex-shrink-0 ml-2 px-3 py-1 font-semibold border ${statusColor} ${isConnected ? 'bg-akari-neon-teal/15 border-akari-neon-teal/30' : 'bg-akari-cardSoft/50 border-akari-neon-teal/20'}`}>{status}</span>
    </div>
  );
}

// =============================================================================
// ICONS
// =============================================================================

const XIcon = () => (
  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-4 h-4 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileSocialConnections({
  xConnected,
  telegramConnected,
}: ProfileSocialConnectionsProps) {
  return (
    <div className="neon-card neon-hover p-6">
      <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-blue mb-6">Connected Accounts</h2>
      <div className="space-y-1">
        <ConnectedAccountRow
          icon={<XIcon />}
          name="X (Twitter)"
          status={xConnected ? 'Connected' : 'Connect'}
          statusColor={xConnected ? 'text-akari-neon-teal' : 'text-akari-muted'}
        />
        <ConnectedAccountRow
          icon={<TelegramIcon />}
          name="Telegram"
          status={telegramConnected ? 'Connected' : 'Coming soon'}
          statusColor={telegramConnected ? 'text-akari-neon-teal' : 'text-akari-muted'}
          helperText="Connect Telegram to unlock reviews"
        />
        <ConnectedAccountRow
          icon={<DiscordIcon />}
          name="Discord"
          status="Available soon"
          statusColor="text-akari-muted"
        />
        <ConnectedAccountRow
          icon={<FacebookIcon />}
          name="Facebook"
          status="Available soon"
          statusColor="text-akari-muted"
        />
        <ConnectedAccountRow
          icon={<InstagramIcon />}
          name="Instagram"
          status="Available soon"
          statusColor="text-akari-muted"
        />
        <ConnectedAccountRow
          icon={<TikTokIcon />}
          name="TikTok"
          status="Available soon"
          statusColor="text-akari-muted"
        />
      </div>
    </div>
  );
}

