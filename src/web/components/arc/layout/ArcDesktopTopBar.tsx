/**
 * ARC Desktop Top Bar Component
 * 
 * Sticky top bar with search, notifications, and profile
 */

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserInitials } from './arcRouteUtils';

interface ArcDesktopTopBarProps {
  unreadCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ArcDesktopTopBar({ unreadCount, searchQuery, onSearchChange }: ArcDesktopTopBarProps) {
  const akariUser = useAkariUser();
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const userDisplayName = akariUser.user?.displayName || 'User';
  const userAvatarUrl = akariUser.user?.avatarUrl || null;
  const userInitials = getUserInitials(userDisplayName);

  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: ARC Label + Subtitle */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">ARC</h1>
            <span className="text-xs text-white/60">Command Center</span>
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
            <div className="relative">
              <button
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
              >
                Create
              </button>
              {showCreateMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-black/90 border border-white/20 rounded-lg shadow-lg z-10">
                  <div className="py-1">
                    <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">New Campaign</button>
                    <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">New Arena</button>
                    <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">New Program</button>
                  </div>
                </div>
              )}
            </div>

            {/* Notifications */}
            <Link
              href="/portal/notifications"
              className="relative p-2 text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>

            {/* Profile Avatar */}
            <div className="relative">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

