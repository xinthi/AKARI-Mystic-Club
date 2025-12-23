/**
 * Next.js Middleware
 * 
 * Redirects www.akarimystic.club to akarimystic.club (canonical domain)
 * Preserves path and query parameters.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Check if hostname starts with "www."
  if (hostname.startsWith('www.')) {
    // Remove "www." prefix
    const newHostname = hostname.replace(/^www\./, '');
    
    // Build new URL with canonical domain
    const url = request.nextUrl.clone();
    // Use hostname property instead of host to avoid port issues
    url.hostname = newHostname;
    // Ensure protocol is https in production
    if (process.env.NODE_ENV === 'production') {
      url.protocol = 'https:';
    }
    
    // Redirect to canonical domain (preserves path and query)
    return NextResponse.redirect(url, 308); // Permanent redirect (308 preserves method)
  }

  // No redirect needed
  return NextResponse.next();
}

// Match all routes including API routes
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

