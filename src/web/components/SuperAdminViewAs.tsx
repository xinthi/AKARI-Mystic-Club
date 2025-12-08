/**
 * AKARI Mystic Club - Super Admin "View As" Component
 * 
 * Allows Super Admins to temporarily view the site as different roles
 * for testing purposes. This is frontend-only and doesn't affect
 * actual permissions on the server.
 */

import React from 'react';
import { Role, isSuperAdmin } from '../lib/permissions';
import { useAkariAuth, useAkariUser } from '../lib/akari-auth';

const ROLE_LABELS: Record<Role, string> = {
  user: '👤 User',
  analyst: '📊 Analyst',
  admin: '🔑 Admin',
  super_admin: '⭐ Super Admin',
};

export function SuperAdminViewAs() {
  const { setViewAsRole } = useAkariAuth();
  const { user, realRoles, viewAsRole } = useAkariUser();

  // Only show for Super Admins
  if (!user || !isSuperAdmin({ realRoles })) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="rounded-xl border border-purple-500/30 bg-akari-card/95 backdrop-blur-sm p-3 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-purple-400 font-medium">
            ⭐ SA Mode
          </span>
        </div>
        
        <select
          value={viewAsRole || 'real'}
          onChange={(e) => {
            const value = e.target.value;
            setViewAsRole(value === 'real' ? null : value as Role);
          }}
          className="w-full px-3 py-2 text-xs rounded-lg bg-akari-cardSoft border border-akari-border text-akari-text focus:outline-none focus:border-purple-500"
        >
          <option value="real">Real Roles ({realRoles.join(', ')})</option>
          <option value="user">{ROLE_LABELS.user}</option>
          <option value="analyst">{ROLE_LABELS.analyst}</option>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </select>

        {viewAsRole && (
          <p className="mt-2 text-[10px] text-yellow-400">
            ⚠️ Viewing as: {ROLE_LABELS[viewAsRole]}
          </p>
        )}
      </div>
    </div>
  );
}

export default SuperAdminViewAs;

