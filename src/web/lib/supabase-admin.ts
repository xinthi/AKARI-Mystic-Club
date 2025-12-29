/**
 * Centralized Supabase Admin Client Helper
 * 
 * This module provides a centralized way to create Supabase admin clients
 * for API routes. The service role key should NEVER be exposed to the client.
 * 
 * Use this ONLY in:
 * - API routes (pages/api/**)
 * - Server-side code (getServerSideProps, etc.)
 * 
 * NEVER use this in:
 * - Client components
 * - Browser-side code
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// =============================================================================
// CLIENT CREATION
// =============================================================================

/**
 * Create a Supabase client with service role (admin) access.
 * Use this ONLY in backend API routes, never in frontend or client components.
 * The service role key bypasses Row Level Security (RLS).
 * 
 * @throws {Error} If Supabase configuration is missing
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!SUPABASE_URL) {
    const error = 'Missing Supabase URL configuration. Please check your environment variables (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL).';
    console.error('[getSupabaseAdmin]', error);
    throw new Error(error);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    const error = 'Missing Supabase service role key. Please check your environment variables (SUPABASE_SERVICE_ROLE_KEY).';
    console.error('[getSupabaseAdmin]', error);
    throw new Error(error);
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Check if Supabase configuration is available.
 * Useful for graceful error handling.
 */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get a user-friendly error message for missing Supabase configuration.
 */
export function getSupabaseConfigError(): string {
  const missing: string[] = [];
  if (!SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  
  if (missing.length === 0) {
    return '';
  }
  
  return `Missing environment variables: ${missing.join(', ')}. Please check your .env.local file.`;
}

