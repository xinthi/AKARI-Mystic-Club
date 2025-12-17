/**
 * AKARI Mystic Club - Authentication Context and Hooks
 * 
 * Provides user authentication state for the website.
 * DO NOT modify MiniApp code.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Role, AkariUser, FeatureGrant, PersonaType, PersonaTag } from './permissions';

// =============================================================================
// DEV MODE CONFIGURATION
// =============================================================================

// In development, bypass auth and use mock user
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development';

// Create a mock user for development testing
function createDevMockUser(role: Role): AkariUser {
  return {
    id: 'dev-mock-user',
    displayName: `Dev User (${role})`,
    avatarUrl: null,
    realRoles: [role],
    effectiveRoles: [role],
    featureGrants: [],
    isLoggedIn: true,
    viewAsRole: null,
    xUsername: 'dev_user',
    // Mystic Identity defaults
    personaType: 'individual',
    personaTag: null,
    telegramConnected: false,
  };
}

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
  
  // Dev mode
  isDevMode: boolean;
  devRole: Role;
  setDevRole: (role: Role) => void;
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
  
  // Dev mode state - persisted to localStorage
  // Always default to super_admin for dev_user to ensure admin functions are visible
  const [devRole, setDevRoleState] = useState<Role>(() => {
    // Initialize from localStorage on client side
    if (typeof window !== 'undefined' && DEV_BYPASS_AUTH) {
      const stored = localStorage.getItem('akari_dev_role');
      if (stored && ['user', 'analyst', 'admin', 'super_admin'].includes(stored)) {
        return stored as Role;
      }
    }
    // Default to super_admin to ensure dev_user can see all functions
    return 'super_admin';
  });
  
  // In dev mode, always use mock user
  // Ensure dev_user always has super_admin role for testing
  useEffect(() => {
    if (DEV_BYPASS_AUTH) {
      // If devRole is not super_admin, but we're in dev mode with dev_user,
      // ensure we use super_admin to see all functions
      const effectiveRole = devRole || 'super_admin';
      setUser(createDevMockUser(effectiveRole));
      setIsLoading(false);
      // Persist to localStorage
      localStorage.setItem('akari_dev_role', effectiveRole);
    }
  }, [devRole]);

  // Fetch current user from API (skip in dev mode)
  const fetchUser = useCallback(async () => {
    // Skip API call in dev mode
    if (DEV_BYPASS_AUTH) {
      setUser(createDevMockUser(devRole));
      setIsLoading(false);
      return;
    }
    
    try {
      const res = await fetch('/api/auth/website/me');
      
      // Check if response is JSON before parsing
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[AkariAuth] Response is not JSON, got:', contentType);
        setUser(null);
        setIsLoading(false);
        return;
      }
      
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
              discountPercent: g.discount_percent != null ? Number(g.discount_percent) : 0,
              discountNote: g.discount_note || null,
            })),
            isLoggedIn: true,
            viewAsRole: null,
            xUsername: data.user.xUsername ?? null,
            // Mystic Identity fields
            personaType: data.user.personaType || 'individual',
            personaTag: data.user.personaTag || null,
            telegramConnected: data.user.telegramConnected ?? false,
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
  }, [devRole]);

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

  // Dev mode role setter
  const setDevRole = useCallback((role: Role) => {
    if (DEV_BYPASS_AUTH) {
      setDevRoleState(role);
    }
  }, []);

  const value: AkariAuthContextValue = {
    user,
    isLoading,
    isLoggedIn: !!user,
    login,
    logout,
    refreshUser,
    setViewAsRole,
    // Dev mode
    isDevMode: DEV_BYPASS_AUTH,
    devRole,
    setDevRole,
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
 * - personaType
 * - personaTag
 * - telegramConnected
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
    // Mystic Identity
    personaType: user?.personaType ?? 'individual',
    personaTag: user?.personaTag ?? null,
    telegramConnected: user?.telegramConnected ?? false,
    // Full user object for permission checks
    user,
  };
}

