/**
 * ARC Facebook-style Top Bar
 * 
 * Sticky top bar with AKARI badge, search, Create menu, notifications, and avatar
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAkariUser } from '@/lib/akari-auth';
import { useArcMode } from '@/lib/arc/useArcMode';
import { Logo } from '@/components/Logo';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadCount: number;
}

function getUserInitials(displayName: string | null | undefined): string {
  if (!displayName) return 'U';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

export function TopBar({ searchQuery, onSearchChange, unreadCount }: TopBarProps) {
  const akariUser = useAkariUser();
  const { mode, setMode } = useArcMode();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const userDisplayName = akariUser.user?.displayName || 'User';
  const userAvatarUrl = akariUser.user?.avatarUrl || null;
  const userInitials = getUserInitials(userDisplayName);
  const userXUsername = akariUser.xUsername || null;
  
  // Normalize username for URL (remove @ if present)
  const normalizedXUsername = userXUsername 
    ? userXUsername.replace(/^@+/, '').toLowerCase()
    : null;
  
  const profileUrl = normalizedXUsername 
    ? `/portal/arc/creator/${encodeURIComponent(normalizedXUsername)}`
    : null;

  useEffect(() => {
    if (mode !== 'crm') return;
    const loadCount = async () => {
      const res = await fetch('/api/portal/brands/pending-requests', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPendingCount(Number(data.count || 0));
      }
    };
    loadCount();
  }, [mode]);

  return (
    <div className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left: Logo + brand */}
        <div className="flex items-center gap-3">
          {/* Creator/CRM Toggle */}
          <button
            onClick={() => setMode(mode === 'creator' ? 'crm' : 'creator')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white transition-colors"
          >
            {mode === 'creator' ? 'Creator View' : 'CRM View'}
          </button>
          <Link href="/portal" className="flex items-center gap-2 transition-all duration-300 ease-out hover:scale-105 flex-shrink-0">
            <div className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)] flex-shrink-0">
              <Logo size={28} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] tracking-[0.18em] uppercase text-gradient-teal font-medium whitespace-nowrap">
                Akari Mystic Club
              </span>
              <span className="text-[9px] text-akari-muted/60 hidden sm:block tracking-wider whitespace-nowrap">
                PREDICT.SHARE.INTELLIGENCE
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-4 py-2 pl-10 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-colors"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Create Button */}
          {mode === 'crm' && (
            <div className="relative">
              <button
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
              >
                Create
              </button>
              {pendingCount > 0 && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] rounded-full bg-red-500 text-white">
                  {pendingCount}
                </span>
              )}
              {showCreateMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-black/90 border border-white/20 rounded-lg shadow-lg z-10">
                  <div className="py-1">
                    <Link href="/portal/arc/brands?create=1" className="block w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">
                      New Brand
                    </Link>
                    <Link href="/portal/arc/brands" className="block w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">
                      New Campaign
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          <Link
            href="/portal/notifications"
            className="relative p-2 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Link>

          {/* Profile Avatar */}
          <div className="relative">
            {profileUrl ? (
              <Link href={profileUrl}>
                {userAvatarUrl ? (
                  <Image
                    src={userAvatarUrl}
                    alt={userDisplayName}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-white/30 transition-all"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-medium text-white cursor-pointer hover:bg-white/20 hover:ring-2 hover:ring-white/30 transition-all">
                    {userInitials}
                  </div>
                )}
              </Link>
            ) : (
              <>
                {userAvatarUrl ? (
                  <Image
                    src={userAvatarUrl}
                    alt={userDisplayName}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover cursor-pointer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-medium text-white cursor-pointer">
                    {userInitials}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

