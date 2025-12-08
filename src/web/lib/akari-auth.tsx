/**
 * AKARI Mystic Club - Authentication Context and Hooks
 * 
 * Provides user authentication state for the website.
 * DO NOT modify MiniApp code.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Role, AkariUser, FeatureGrant } from './permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AkariAuthContextValue {
  user: AkariUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  
  // Actions
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  
  // Super Admin "View As" mode
  setViewAsRole: (role: Role | null) => void;
}

interface AkariAuthProviderProps {
  children: React.ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

const AkariAuthContext = createContext<AkariAuthContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function AkariAuthProvider({ children }: AkariAuthProviderProps) {
  const [user, setUser] = useState<AkariUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(null);

  // Fetch current user from API
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/website/me');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          const fetchedUser: AkariUser = {
            id: data.user.id,
            displayName: data.user.displayName,
            avatarUrl: data.user.avatarUrl,
            realRoles: data.user.roles || ['user'],
            effectiveRoles: data.user.roles || ['user'],
            featureGrants: (data.user.featureGrants || []).map((g: any) => ({
              id: g.id,
              featureKey: g.feature_key,
              startsAt: g.starts_at ? new Date(g.starts_at) : null,
              endsAt: g.ends_at ? new Date(g.ends_at) : null,
            })),
            isLoggedIn: true,
            viewAsRole: null,
            xUsername: data.user.xUsername,
          };
          setUser(fetchedUser);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('[AkariAuth] Failed to fetch user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Handle "View As" role for Super Admins
  const setViewAsRole = useCallback((role: Role | null) => {
    if (!user) return;
    
    // Only Super Admins can use "View As"
    if (!user.realRoles.includes('super_admin')) {
      console.warn('[AkariAuth] Only Super Admins can use View As mode');
      return;
    }

    setViewAsRoleState(role);
    
    // Update effective roles
    setUser(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        viewAsRole: role,
        effectiveRoles: role ? [role] : prev.realRoles,
      };
    });
  }, [user]);

  // Login - redirect to X OAuth
  const login = useCallback(() => {
    // Store current URL for redirect after login
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('akari_redirect_after_login', window.location.pathname);
    }
    window.location.href = '/api/auth/website/x/start';
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/website/logout', { method: 'POST' });
      setUser(null);
      setViewAsRoleState(null);
    } catch (error) {
      console.error('[AkariAuth] Logout failed:', error);
    }
  }, []);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    await fetchUser();
  }, [fetchUser]);

  const value: AkariAuthContextValue = {
    user,
    isLoading,
    isLoggedIn: !!user,
    login,
    logout,
    refreshUser,
    setViewAsRole,
  };

  return (
    <AkariAuthContext.Provider value={value}>
      {children}
    </AkariAuthContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to access the authentication context.
 */
export function useAkariAuth(): AkariAuthContextValue {
  const context = useContext(AkariAuthContext);
  if (!context) {
    throw new Error('useAkariAuth must be used within an AkariAuthProvider');
  }
  return context;
}

/**
 * Hook to access the current user with all permissions info.
 * 
 * Returns:
 * - userId
 * - displayName
 * - roles (effective roles)
 * - realRoles
 * - featureGrants
 * - isLoggedIn
 * - viewAsRole
 * - xUsername
 */
export function useAkariUser() {
  const { user, isLoading, isLoggedIn } = useAkariAuth();

  return {
    userId: user?.id ?? null,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    roles: user?.effectiveRoles ?? [],
    realRoles: user?.realRoles ?? [],
    featureGrants: user?.featureGrants ?? [],
    isLoggedIn,
    isLoading,
    viewAsRole: user?.viewAsRole ?? null,
    xUsername: user?.xUsername ?? null,
    // Full user object for permission checks
    user,
  };
}

