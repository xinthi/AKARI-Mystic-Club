/**
 * Notifications Icon Component
 * 
 * Shows notification bell with unread count badge
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAkariUser } from '@/lib/akari-auth';

export function NotificationsIcon() {
  const akariUser = useAkariUser();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!akariUser.isLoggedIn) {
      setLoading(false);
      return;
    }

    // Skip all notification fetches in development mode to prevent 401 errors
    if (process.env.NODE_ENV === 'development') {
      console.log('[Notifications] DEV MODE - skipped');
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    async function fetchUnreadCount() {
      try {
        const res = await fetch('/api/portal/notifications?limit=1');
        
        // Handle 401 (Unauthorized) silently - treat as empty notifications
        // This prevents noisy errors from breaking ARC pages when user is not authenticated
        if (res.status === 401) {
          setUnreadCount(0);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.ok) {
          setUnreadCount(data.unreadCount || 0);
        } else {
          // Non-401 errors: silently set to 0 (don't spam console)
          setUnreadCount(0);
        }
      } catch (error) {
        // Silently handle errors - don't break pages if notifications fail
        setUnreadCount(0);
      } finally {
        setLoading(false);
      }
    }

    fetchUnreadCount();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [akariUser.isLoggedIn]);

  if (!akariUser.isLoggedIn) {
    return null;
  }

  return (
    <Link
      href="/portal/notifications"
      className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-800/50 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <svg
        className="w-5 h-5 text-akari-muted hover:text-akari-primary transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {!loading && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-akari-bg bg-akari-primary rounded-full border-2 border-akari-card">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

