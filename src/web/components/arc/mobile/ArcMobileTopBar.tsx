/**
 * ARC Mobile Top Bar Component
 */

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserInitials } from '../layout/arcRouteUtils';

interface ArcMobileTopBarProps {
  unreadCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ArcMobileTopBar({ unreadCount, searchQuery, onSearchChange }: ArcMobileTopBarProps) {
  const akariUser = useAkariUser();
  const [showSearch, setShowSearch] = useState(false);

  const userDisplayName = akariUser.user?.displayName || 'User';
  const userAvatarUrl = akariUser.user?.avatarUrl || null;
  const userInitials = getUserInitials(userDisplayName);

  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">ARC</span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Search Toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 text-white/80 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Notifications */}
            <Link href="/portal/notifications" className="relative p-2 text-white/80 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>

            {/* Avatar */}
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

        {/* Search Input (conditional) */}
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
  );
}

