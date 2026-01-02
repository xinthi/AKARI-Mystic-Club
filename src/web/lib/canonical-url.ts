/**
 * Canonical URL utilities
 * 
 * Provides functions to construct canonical URLs for the application.
 * Canonical URLs use the full domain (akarimystic.club) without www prefix.
 */

/**
 * Get the canonical base URL for the application
 * 
 * In production: https://akarimystic.club
 * In development: http://localhost:3000 (or from VERCEL_URL if on Vercel)
 * 
 * Works on both server and client side.
 */
export function getCanonicalBaseUrl(): string {
  // Client-side: use window.location.origin (middleware ensures it's canonical)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side: use environment variables
  // In production, use the canonical domain
  if (process.env.NODE_ENV === 'production') {
    return 'https://akarimystic.club';
  }

  // On Vercel (preview/staging), use VERCEL_URL if available
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // In local development, default to localhost
  return 'http://localhost:3000';
}

/**
 * Get the canonical URL for a given path
 * 
 * @param path - The path (e.g., '/portal/arc' or '/portal/arc/project/slug')
 * @returns Full canonical URL (e.g., 'https://akarimystic.club/portal/arc')
 */
export function getCanonicalUrl(path: string): string {
  const baseUrl = getCanonicalBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Get canonical URL from a request (server-side)
 * 
 * @param hostname - The hostname from the request
 * @param pathname - The pathname from the request
 * @returns Full canonical URL
 */
export function getCanonicalUrlFromRequest(hostname: string, pathname: string): string {
  // Remove www. prefix if present
  const canonicalHost = hostname.replace(/^www\./, '');
  
  // Determine protocol
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  
  // For localhost, use as-is
  if (canonicalHost.includes('localhost') || canonicalHost.includes('127.0.0.1')) {
    return `${protocol}://${canonicalHost}${pathname}`;
  }
  
  // For production, ensure we use the canonical domain
  if (process.env.NODE_ENV === 'production') {
    return `https://akarimystic.club${pathname}`;
  }
  
  return `${protocol}://${canonicalHost}${pathname}`;
}
