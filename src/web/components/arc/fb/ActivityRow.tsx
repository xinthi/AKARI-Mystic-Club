/**
 * ARC Facebook-style Activity Row
 * 
 * Dense activity feed row for notifications
 */

import React from 'react';
import { ActivityRow as ActivityRowType } from '@/lib/arc/useArcNotifications';

interface ActivityRowProps {
  activity: ActivityRowType;
}

export function ActivityRow({ activity }: ActivityRowProps) {
  const timeAgo = (() => {
    const now = new Date();
    const diff = now.getTime() - activity.timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return activity.timestamp.toLocaleDateString();
  })();

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-black/40 hover:bg-white/5 transition-colors">
      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-akari-primary mt-2" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-white/60 uppercase">{activity.type}</span>
          <span className="text-xs text-white/40">{timeAgo}</span>
        </div>
        <p className="text-sm text-white/80 font-medium">{activity.title}</p>
        {activity.subtitle && (
          <p className="text-xs text-white/60 mt-1">{activity.subtitle}</p>
        )}
      </div>
    </div>
  );
}

