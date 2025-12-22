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
    url.host = newHostname;
    
    // Redirect to canonical domain (preserves path and query)
    return NextResponse.redirect(url, 301); // Permanent redirect
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

