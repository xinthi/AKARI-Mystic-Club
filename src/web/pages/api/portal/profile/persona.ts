/**
 * API Route: POST /api/portal/profile/persona
 * 
 * Updates the current user's Mystic Identity (persona type and tag).
 * 
 * This is an authenticated endpoint - requires a valid session cookie.
 * 
 * Request body:
 *   {
 *     "personaType": "individual" | "company",
 *     "personaTag": "creator" | "investor" | "project" | ... | null
 *   }
 * 
 * Response:
 *   {
 *     "ok": true,
 *     "personaType": "individual",
 *     "personaTag": "creator"
 *   }
 * 
 * Error response:
 *   {
 *     "ok": false,
 *     "error": "Error message"
 *   }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type PersonaType = 'individual' | 'company';

// Valid persona tags
const INDIVIDUAL_TAGS = ['creator', 'investigator', 'investor', 'trader', 'contributor'] as const;
const COMPANY_TAGS = ['project', 'venture_capital', 'marketing', 'defi', 'dex', 'cex', 'ai', 'infra', 'l1', 'l2'] as const;

type IndividualPersonaTag = typeof INDIVIDUAL_TAGS[number];
type CompanyPersonaTag = typeof COMPANY_TAGS[number];
type PersonaTag = IndividualPersonaTag | CompanyPersonaTag;

interface PersonaUpdateRequest {
  personaType: PersonaType;
  personaTag: PersonaTag | null;
}

type PersonaResponse =
  | { ok: true; personaType: PersonaType; personaTag: PersonaTag | null }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

function isValidPersonaType(value: unknown): value is PersonaType {
  return value === 'individual' || value === 'company';
}

function isValidPersonaTag(value: unknown, personaType: PersonaType): value is PersonaTag | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  
  if (personaType === 'individual') {
    return INDIVIDUAL_TAGS.includes(value as IndividualPersonaTag);
  } else {
    return COMPANY_TAGS.includes(value as CompanyPersonaTag);
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PersonaResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate session and get user ID
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    const userId = session.user_id;

    // Parse and validate request body
    const { personaType, personaTag } = req.body as Partial<PersonaUpdateRequest>;

    if (!isValidPersonaType(personaType)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid personaType. Must be "individual" or "company".' 
      });
    }

    if (!isValidPersonaTag(personaTag, personaType)) {
      return res.status(400).json({ 
        ok: false, 
        error: `Invalid personaTag for ${personaType}. ${
          personaType === 'individual' 
            ? `Valid tags: ${INDIVIDUAL_TAGS.join(', ')}` 
            : `Valid tags: ${COMPANY_TAGS.join(', ')}`
        }` 
      });
    }

    // Update the user's persona
    const { error: updateError } = await supabase
      .from('akari_users')
      .update({
        persona_type: personaType,
        persona_tag: personaTag || null,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[Persona API] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update persona' });
    }

    // Return success
    return res.status(200).json({
      ok: true,
      personaType,
      personaTag: personaTag || null,
    });

  } catch (error: any) {
    console.error('[Persona API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

