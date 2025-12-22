/**
 * Client-Side Helper to Get Session Token
 * 
 * Extracts the akari_session token from browser cookies.
 * Used for Bearer token authentication in API calls.
 */

/**
 * Get the akari_session token from browser cookies
 * @returns Session token string or null if not found
 */
export function getSessionToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      const token = cookie.substring('akari_session='.length).trim();
      return token.length > 0 ? token : null;
    }
  }
  
  return null;
}

