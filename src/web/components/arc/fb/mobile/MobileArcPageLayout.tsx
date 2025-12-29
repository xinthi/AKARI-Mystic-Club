/**
 * Mobile ARC Page Layout
 * 
 * Simplified mobile layout for ARC pages (without the home-specific feed content).
 * Just provides the top bar and renders page content.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAkariUser } from '@/lib/akari-auth';
import { Logo } from '@/components/Logo';

function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface MobileArcPageLayoutProps {
  children: React.ReactNode;
  unreadCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  canManageArc?: boolean;
}

export function MobileArcPageLayout({
  children,
  unreadCount,
  searchQuery,
  onSearchChange,
  canManageArc = false,
}: MobileArcPageLayoutProps) {
  const akariUser = useAkariUser();
  const [showSearch, setShowSearch] = useState(false);

  const userDisplayName = akariUser.user?.displayName || 'User';
  const userAvatarUrl = akariUser.user?.avatarUrl || null;
  const userInitials = getUserInitials(userDisplayName);

  return (
    <div className="flex flex-col min-h-screen w-full bg-black">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/portal" className="flex items-center gap-2 transition-all duration-300 ease-out hover:scale-105 flex-shrink-0">
              <div className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)] flex-shrink-0">
                <Logo size={28} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] tracking-[0.18em] uppercase text-gradient-teal font-medium whitespace-nowrap">
                  Akari Mystic Club
                </span>
                <span className="text-[9px] text-white/60 hidden sm:block tracking-wider whitespace-nowrap">
                  PREDICT.SHARE.INTELLIGENCE
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 text-white/80 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <Link href="/portal/notifications" className="relative p-2 text-white/80 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </Link>

              {userAvatarUrl ? (
                <Image
                  src={userAvatarUrl}
                  alt={userDisplayName}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-medium text-white">
                  {userInitials}
                </div>
              )}
            </div>
          </div>

          {showSearch && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}

