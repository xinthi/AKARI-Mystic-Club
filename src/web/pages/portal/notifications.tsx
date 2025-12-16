/**
 * Notifications Page
 * 
 * Lists all notifications for the current user
 * Allows marking notifications as read
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface Notification {
  id: string;
  profile_id: string;
  type: string;
  context: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function getNotificationText(type: string): string {
  switch (type) {
    case 'creator_invited':
      return 'You have been invited to a Creator Manager program';
    case 'creator_approved':
      return 'Your Creator Manager application has been approved';
    case 'creator_rejected':
      return 'Your Creator Manager application has been rejected';
    case 'mission_submitted':
      return 'A creator has submitted a mission';
    case 'mission_approved':
      return 'Your mission submission has been approved';
    case 'mission_rejected':
      return 'Your mission submission has been rejected';
    default:
      return 'New notification';
  }
}

function getNotificationLink(notification: Notification): string | null {
  if (!notification.context) return null;

  if (notification.type === 'creator_invited' || notification.type === 'creator_approved' || notification.type === 'creator_rejected') {
    if (notification.context.programId) {
      return `/portal/arc/my-creator-programs/${notification.context.programId}`;
    }
  }

  if (notification.type === 'mission_submitted' || notification.type === 'mission_approved' || notification.type === 'mission_rejected') {
    if (notification.context.programId) {
      return `/portal/arc/creator-manager/${notification.context.programId}?tab=missions`;
    }
  }

  return null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function NotificationsPage() {
  const akariUser = useAkariUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/notifications?limit=100');
      const data = await res.json();

      if (data.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } else {
        setError(data.error || 'Failed to load notifications');
      }
    } catch (err: any) {
      console.error('[Notifications] Error:', err);
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadNotifications();
    } else {
      setLoading(false);
    }
  }, [akariUser.isLoggedIn, loadNotifications]);

  const handleMarkRead = async (notificationId?: string) => {
    setMarkingRead(notificationId || 'all');
    try {
      const res = await fetch('/api/portal/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationId ? { ids: [notificationId] } : {}),
      });

      const data = await res.json();
      if (data.ok) {
        await loadNotifications();
      } else {
        alert(data.error || 'Failed to mark as read');
      }
    } catch (err: any) {
      console.error('[Mark Read] Error:', err);
      alert('Failed to mark as read');
    } finally {
      setMarkingRead(null);
    }
  };

  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="Notifications">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">Please log in to view notifications</p>
        </div>
      </PortalLayout>
    );
  }

  if (loading) {
    return (
      <PortalLayout title="Notifications">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="Notifications">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error}</p>
        </div>
      </PortalLayout>
    );
  }

  const unreadNotifications = notifications.filter((n) => !n.is_read);

  return (
    <PortalLayout title="Notifications">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-akari-text">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-akari-muted mt-1">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => handleMarkRead()}
              disabled={markingRead === 'all'}
              className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium disabled:opacity-50"
            >
              {markingRead === 'all' ? 'Marking...' : 'Mark All as Read'}
            </button>
          )}
        </div>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const link = getNotificationLink(notification);
              const NotificationContent = (
                <div
                  className={`p-4 rounded-lg border ${
                    notification.is_read
                      ? 'border-akari-border bg-akari-card'
                      : 'border-akari-primary/30 bg-akari-cardSoft'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-akari-primary" />
                        )}
                        <p className="text-akari-text">{getNotificationText(notification.type)}</p>
                      </div>
                      <p className="text-xs text-akari-muted mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <button
                        onClick={() => handleMarkRead(notification.id)}
                        disabled={markingRead === notification.id}
                        className="px-2 py-1 text-xs text-akari-muted hover:text-akari-primary transition-colors disabled:opacity-50"
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                </div>
              );

              if (link) {
                return (
                  <Link key={notification.id} href={link}>
                    {NotificationContent}
                  </Link>
                );
              }

              return <div key={notification.id}>{NotificationContent}</div>;
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

