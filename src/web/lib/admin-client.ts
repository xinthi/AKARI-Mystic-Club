/**
 * Admin Client Helper
 * 
 * Manages admin authentication token storage and provides
 * helper functions for admin API calls.
 */

const ADMIN_TOKEN_KEY = 'akari_admin_token';

/**
 * Get the stored admin token from localStorage
 */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Set the admin token in localStorage
 */
export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/**
 * Clear the admin token from localStorage
 */
export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Check if admin is logged in (has token stored)
 */
export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}

/**
 * Get headers for admin API requests
 */
export function getAdminHeaders(): HeadersInit {
  const token = getAdminToken();
  if (token) {
    return {
      'x-admin-token': token,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an admin API request with proper headers
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...getAdminHeaders(),
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Handle admin API response - check for auth errors
 */
export function handleAdminResponse(response: Response): {
  isUnauthorized: boolean;
  isNotConfigured: boolean;
} {
  if (response.status === 401 || response.status === 403) {
    return { isUnauthorized: true, isNotConfigured: false };
  }
  if (response.status === 500) {
    // Could be "not configured" - we'll check the response body
    return { isUnauthorized: false, isNotConfigured: false };
  }
  return { isUnauthorized: false, isNotConfigured: false };
}

