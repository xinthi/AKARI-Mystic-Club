/**
 * Project Audience Geo Service
 * 
 * Fetches follower samples from twitterapi.io and infers geographic distribution
 * from profile location strings. This is an additive, optional feature.
 * 
 * IMPORTANT: This module does NOT modify any existing sentiment formulas,
 * metrics_daily, project_tweets, or inner_circle logic.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { taioGetUserFollowers, IUserInfo } from './twitterapiio';

// =============================================================================
// TYPES
// =============================================================================

export interface FollowerSample {
  id: string;
  username: string;
  location: string | null;
}

export interface GeoInference {
  countryCode: string | null;
  countryName: string | null;
  regionLabel: string | null;
}

export interface AggregatedGeo {
  countryCode: string | null;
  countryName: string;
  regionLabel: string | null;
  followerCount: number;
  followerShare: number; // 0-100
}

export interface ComputeGeoResult {
  projectId: string;
  projectSlug: string;
  xUserId: string | null;
  sampleSize: number;
  mappedCount: number;
  countries: AggregatedGeo[];
}

// =============================================================================
// COUNTRY MAPPING DICTIONARY
// =============================================================================

// Top countries + common variations that appear in Twitter locations
// Format: { pattern: { code: string, name: string, region?: string } }
// Patterns are case-insensitive and match anywhere in the location string

interface CountryMapping {
  code: string;
  name: string;
  region?: string;
}

const COUNTRY_PATTERNS: Record<string, CountryMapping> = {
  // United States - most common first
  'united states': { code: 'US', name: 'United States', region: 'North America' },
  'usa': { code: 'US', name: 'United States', region: 'North America' },
  'u.s.a': { code: 'US', name: 'United States', region: 'North America' },
  'u.s.': { code: 'US', name: 'United States', region: 'North America' },
  'america': { code: 'US', name: 'United States', region: 'North America' },
  // Major US cities/states
  'new york': { code: 'US', name: 'United States', region: 'North America' },
  'california': { code: 'US', name: 'United States', region: 'North America' },
  'los angeles': { code: 'US', name: 'United States', region: 'North America' },
  'san francisco': { code: 'US', name: 'United States', region: 'North America' },
  'miami': { code: 'US', name: 'United States', region: 'North America' },
  'chicago': { code: 'US', name: 'United States', region: 'North America' },
  'texas': { code: 'US', name: 'United States', region: 'North America' },
  'florida': { code: 'US', name: 'United States', region: 'North America' },
  'seattle': { code: 'US', name: 'United States', region: 'North America' },
  'atlanta': { code: 'US', name: 'United States', region: 'North America' },
  'boston': { code: 'US', name: 'United States', region: 'North America' },
  'denver': { code: 'US', name: 'United States', region: 'North America' },
  'washington dc': { code: 'US', name: 'United States', region: 'North America' },
  'dc': { code: 'US', name: 'United States', region: 'North America' },
  
  // United Kingdom
  'united kingdom': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'uk': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'england': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'london': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'manchester': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'scotland': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'wales': { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  'britain': { code: 'GB', name: 'United Kingdom', region: 'Europe' },

  // Germany
  'germany': { code: 'DE', name: 'Germany', region: 'Europe' },
  'deutschland': { code: 'DE', name: 'Germany', region: 'Europe' },
  'berlin': { code: 'DE', name: 'Germany', region: 'Europe' },
  'munich': { code: 'DE', name: 'Germany', region: 'Europe' },
  'münchen': { code: 'DE', name: 'Germany', region: 'Europe' },
  'frankfurt': { code: 'DE', name: 'Germany', region: 'Europe' },
  '🇩🇪': { code: 'DE', name: 'Germany', region: 'Europe' },

  // France
  'france': { code: 'FR', name: 'France', region: 'Europe' },
  'paris': { code: 'FR', name: 'France', region: 'Europe' },
  'lyon': { code: 'FR', name: 'France', region: 'Europe' },
  '🇫🇷': { code: 'FR', name: 'France', region: 'Europe' },

  // Netherlands
  'netherlands': { code: 'NL', name: 'Netherlands', region: 'Europe' },
  'amsterdam': { code: 'NL', name: 'Netherlands', region: 'Europe' },
  'holland': { code: 'NL', name: 'Netherlands', region: 'Europe' },
  '🇳🇱': { code: 'NL', name: 'Netherlands', region: 'Europe' },

  // Spain
  'spain': { code: 'ES', name: 'Spain', region: 'Europe' },
  'españa': { code: 'ES', name: 'Spain', region: 'Europe' },
  'madrid': { code: 'ES', name: 'Spain', region: 'Europe' },
  'barcelona': { code: 'ES', name: 'Spain', region: 'Europe' },
  '🇪🇸': { code: 'ES', name: 'Spain', region: 'Europe' },

  // Italy
  'italy': { code: 'IT', name: 'Italy', region: 'Europe' },
  'italia': { code: 'IT', name: 'Italy', region: 'Europe' },
  'rome': { code: 'IT', name: 'Italy', region: 'Europe' },
  'milan': { code: 'IT', name: 'Italy', region: 'Europe' },
  'milano': { code: 'IT', name: 'Italy', region: 'Europe' },
  '🇮🇹': { code: 'IT', name: 'Italy', region: 'Europe' },

  // Portugal
  'portugal': { code: 'PT', name: 'Portugal', region: 'Europe' },
  'lisbon': { code: 'PT', name: 'Portugal', region: 'Europe' },
  'lisboa': { code: 'PT', name: 'Portugal', region: 'Europe' },
  '🇵🇹': { code: 'PT', name: 'Portugal', region: 'Europe' },

  // Poland
  'poland': { code: 'PL', name: 'Poland', region: 'Europe' },
  'polska': { code: 'PL', name: 'Poland', region: 'Europe' },
  'warsaw': { code: 'PL', name: 'Poland', region: 'Europe' },
  '🇵🇱': { code: 'PL', name: 'Poland', region: 'Europe' },

  // Austria
  'austria': { code: 'AT', name: 'Austria', region: 'Europe' },
  'österreich': { code: 'AT', name: 'Austria', region: 'Europe' },
  'vienna': { code: 'AT', name: 'Austria', region: 'Europe' },
  'wien': { code: 'AT', name: 'Austria', region: 'Europe' },
  '🇦🇹': { code: 'AT', name: 'Austria', region: 'Europe' },

  // Switzerland
  'switzerland': { code: 'CH', name: 'Switzerland', region: 'Europe' },
  'schweiz': { code: 'CH', name: 'Switzerland', region: 'Europe' },
  'zurich': { code: 'CH', name: 'Switzerland', region: 'Europe' },
  'zürich': { code: 'CH', name: 'Switzerland', region: 'Europe' },
  'geneva': { code: 'CH', name: 'Switzerland', region: 'Europe' },
  '🇨🇭': { code: 'CH', name: 'Switzerland', region: 'Europe' },

  // Belgium
  'belgium': { code: 'BE', name: 'Belgium', region: 'Europe' },
  'brussels': { code: 'BE', name: 'Belgium', region: 'Europe' },
  '🇧🇪': { code: 'BE', name: 'Belgium', region: 'Europe' },

  // Sweden
  'sweden': { code: 'SE', name: 'Sweden', region: 'Europe' },
  'stockholm': { code: 'SE', name: 'Sweden', region: 'Europe' },
  '🇸🇪': { code: 'SE', name: 'Sweden', region: 'Europe' },

  // Norway
  'norway': { code: 'NO', name: 'Norway', region: 'Europe' },
  'oslo': { code: 'NO', name: 'Norway', region: 'Europe' },
  '🇳🇴': { code: 'NO', name: 'Norway', region: 'Europe' },

  // Denmark
  'denmark': { code: 'DK', name: 'Denmark', region: 'Europe' },
  'copenhagen': { code: 'DK', name: 'Denmark', region: 'Europe' },
  '🇩🇰': { code: 'DK', name: 'Denmark', region: 'Europe' },

  // Finland
  'finland': { code: 'FI', name: 'Finland', region: 'Europe' },
  'helsinki': { code: 'FI', name: 'Finland', region: 'Europe' },
  '🇫🇮': { code: 'FI', name: 'Finland', region: 'Europe' },

  // Ireland
  'ireland': { code: 'IE', name: 'Ireland', region: 'Europe' },
  'dublin': { code: 'IE', name: 'Ireland', region: 'Europe' },
  '🇮🇪': { code: 'IE', name: 'Ireland', region: 'Europe' },

  // Greece
  'greece': { code: 'GR', name: 'Greece', region: 'Europe' },
  'athens': { code: 'GR', name: 'Greece', region: 'Europe' },
  '🇬🇷': { code: 'GR', name: 'Greece', region: 'Europe' },

  // Czech Republic
  'czech': { code: 'CZ', name: 'Czech Republic', region: 'Europe' },
  'prague': { code: 'CZ', name: 'Czech Republic', region: 'Europe' },
  '🇨🇿': { code: 'CZ', name: 'Czech Republic', region: 'Europe' },

  // Romania
  'romania': { code: 'RO', name: 'Romania', region: 'Europe' },
  'bucharest': { code: 'RO', name: 'Romania', region: 'Europe' },
  '🇷🇴': { code: 'RO', name: 'Romania', region: 'Europe' },

  // Ukraine
  'ukraine': { code: 'UA', name: 'Ukraine', region: 'Europe' },
  'kyiv': { code: 'UA', name: 'Ukraine', region: 'Europe' },
  'kiev': { code: 'UA', name: 'Ukraine', region: 'Europe' },
  '🇺🇦': { code: 'UA', name: 'Ukraine', region: 'Europe' },

  // Russia
  'russia': { code: 'RU', name: 'Russia', region: 'Europe' },
  'moscow': { code: 'RU', name: 'Russia', region: 'Europe' },
  '🇷🇺': { code: 'RU', name: 'Russia', region: 'Europe' },

  // Turkey
  'turkey': { code: 'TR', name: 'Turkey', region: 'Europe' },
  'türkiye': { code: 'TR', name: 'Turkey', region: 'Europe' },
  'istanbul': { code: 'TR', name: 'Turkey', region: 'Europe' },
  'ankara': { code: 'TR', name: 'Turkey', region: 'Europe' },
  '🇹🇷': { code: 'TR', name: 'Turkey', region: 'Europe' },

  // Canada
  'canada': { code: 'CA', name: 'Canada', region: 'North America' },
  'toronto': { code: 'CA', name: 'Canada', region: 'North America' },
  'vancouver': { code: 'CA', name: 'Canada', region: 'North America' },
  'montreal': { code: 'CA', name: 'Canada', region: 'North America' },
  '🇨🇦': { code: 'CA', name: 'Canada', region: 'North America' },

  // Mexico
  'mexico': { code: 'MX', name: 'Mexico', region: 'LATAM' },
  'méxico': { code: 'MX', name: 'Mexico', region: 'LATAM' },
  'cdmx': { code: 'MX', name: 'Mexico', region: 'LATAM' },
  'mexico city': { code: 'MX', name: 'Mexico', region: 'LATAM' },
  '🇲🇽': { code: 'MX', name: 'Mexico', region: 'LATAM' },

  // Brazil
  'brazil': { code: 'BR', name: 'Brazil', region: 'LATAM' },
  'brasil': { code: 'BR', name: 'Brazil', region: 'LATAM' },
  'são paulo': { code: 'BR', name: 'Brazil', region: 'LATAM' },
  'sao paulo': { code: 'BR', name: 'Brazil', region: 'LATAM' },
  'rio': { code: 'BR', name: 'Brazil', region: 'LATAM' },
  '🇧🇷': { code: 'BR', name: 'Brazil', region: 'LATAM' },

  // Argentina
  'argentina': { code: 'AR', name: 'Argentina', region: 'LATAM' },
  'buenos aires': { code: 'AR', name: 'Argentina', region: 'LATAM' },
  '🇦🇷': { code: 'AR', name: 'Argentina', region: 'LATAM' },

  // Colombia
  'colombia': { code: 'CO', name: 'Colombia', region: 'LATAM' },
  'bogota': { code: 'CO', name: 'Colombia', region: 'LATAM' },
  'bogotá': { code: 'CO', name: 'Colombia', region: 'LATAM' },
  '🇨🇴': { code: 'CO', name: 'Colombia', region: 'LATAM' },

  // Chile
  'chile': { code: 'CL', name: 'Chile', region: 'LATAM' },
  'santiago': { code: 'CL', name: 'Chile', region: 'LATAM' },
  '🇨🇱': { code: 'CL', name: 'Chile', region: 'LATAM' },

  // Peru
  'peru': { code: 'PE', name: 'Peru', region: 'LATAM' },
  'lima': { code: 'PE', name: 'Peru', region: 'LATAM' },
  '🇵🇪': { code: 'PE', name: 'Peru', region: 'LATAM' },

  // Venezuela
  'venezuela': { code: 'VE', name: 'Venezuela', region: 'LATAM' },
  'caracas': { code: 'VE', name: 'Venezuela', region: 'LATAM' },
  '🇻🇪': { code: 'VE', name: 'Venezuela', region: 'LATAM' },

  // Ecuador
  'ecuador': { code: 'EC', name: 'Ecuador', region: 'LATAM' },
  'quito': { code: 'EC', name: 'Ecuador', region: 'LATAM' },
  '🇪🇨': { code: 'EC', name: 'Ecuador', region: 'LATAM' },

  // China
  'china': { code: 'CN', name: 'China', region: 'Asia' },
  '中国': { code: 'CN', name: 'China', region: 'Asia' },
  'beijing': { code: 'CN', name: 'China', region: 'Asia' },
  'shanghai': { code: 'CN', name: 'China', region: 'Asia' },
  'shenzhen': { code: 'CN', name: 'China', region: 'Asia' },
  '🇨🇳': { code: 'CN', name: 'China', region: 'Asia' },

  // Japan
  'japan': { code: 'JP', name: 'Japan', region: 'Asia' },
  '日本': { code: 'JP', name: 'Japan', region: 'Asia' },
  'tokyo': { code: 'JP', name: 'Japan', region: 'Asia' },
  'osaka': { code: 'JP', name: 'Japan', region: 'Asia' },
  '🇯🇵': { code: 'JP', name: 'Japan', region: 'Asia' },

  // South Korea
  'south korea': { code: 'KR', name: 'South Korea', region: 'Asia' },
  'korea': { code: 'KR', name: 'South Korea', region: 'Asia' },
  '한국': { code: 'KR', name: 'South Korea', region: 'Asia' },
  'seoul': { code: 'KR', name: 'South Korea', region: 'Asia' },
  '🇰🇷': { code: 'KR', name: 'South Korea', region: 'Asia' },

  // Hong Kong
  'hong kong': { code: 'HK', name: 'Hong Kong', region: 'Asia' },
  '香港': { code: 'HK', name: 'Hong Kong', region: 'Asia' },
  '🇭🇰': { code: 'HK', name: 'Hong Kong', region: 'Asia' },

  // Taiwan
  'taiwan': { code: 'TW', name: 'Taiwan', region: 'Asia' },
  '台灣': { code: 'TW', name: 'Taiwan', region: 'Asia' },
  'taipei': { code: 'TW', name: 'Taiwan', region: 'Asia' },
  '🇹🇼': { code: 'TW', name: 'Taiwan', region: 'Asia' },

  // Singapore
  'singapore': { code: 'SG', name: 'Singapore', region: 'SEA' },
  '🇸🇬': { code: 'SG', name: 'Singapore', region: 'SEA' },

  // Malaysia
  'malaysia': { code: 'MY', name: 'Malaysia', region: 'SEA' },
  'kuala lumpur': { code: 'MY', name: 'Malaysia', region: 'SEA' },
  'kl': { code: 'MY', name: 'Malaysia', region: 'SEA' },
  '🇲🇾': { code: 'MY', name: 'Malaysia', region: 'SEA' },

  // Indonesia
  'indonesia': { code: 'ID', name: 'Indonesia', region: 'SEA' },
  'jakarta': { code: 'ID', name: 'Indonesia', region: 'SEA' },
  '🇮🇩': { code: 'ID', name: 'Indonesia', region: 'SEA' },

  // Thailand
  'thailand': { code: 'TH', name: 'Thailand', region: 'SEA' },
  'bangkok': { code: 'TH', name: 'Thailand', region: 'SEA' },
  '🇹🇭': { code: 'TH', name: 'Thailand', region: 'SEA' },

  // Vietnam
  'vietnam': { code: 'VN', name: 'Vietnam', region: 'SEA' },
  'hanoi': { code: 'VN', name: 'Vietnam', region: 'SEA' },
  'ho chi minh': { code: 'VN', name: 'Vietnam', region: 'SEA' },
  'saigon': { code: 'VN', name: 'Vietnam', region: 'SEA' },
  '🇻🇳': { code: 'VN', name: 'Vietnam', region: 'SEA' },

  // Philippines
  'philippines': { code: 'PH', name: 'Philippines', region: 'SEA' },
  'manila': { code: 'PH', name: 'Philippines', region: 'SEA' },
  'ph': { code: 'PH', name: 'Philippines', region: 'SEA' },
  '🇵🇭': { code: 'PH', name: 'Philippines', region: 'SEA' },

  // India
  'india': { code: 'IN', name: 'India', region: 'South Asia' },
  'mumbai': { code: 'IN', name: 'India', region: 'South Asia' },
  'delhi': { code: 'IN', name: 'India', region: 'South Asia' },
  'bangalore': { code: 'IN', name: 'India', region: 'South Asia' },
  'bengaluru': { code: 'IN', name: 'India', region: 'South Asia' },
  '🇮🇳': { code: 'IN', name: 'India', region: 'South Asia' },

  // Pakistan
  'pakistan': { code: 'PK', name: 'Pakistan', region: 'South Asia' },
  'karachi': { code: 'PK', name: 'Pakistan', region: 'South Asia' },
  'lahore': { code: 'PK', name: 'Pakistan', region: 'South Asia' },
  '🇵🇰': { code: 'PK', name: 'Pakistan', region: 'South Asia' },

  // Bangladesh
  'bangladesh': { code: 'BD', name: 'Bangladesh', region: 'South Asia' },
  'dhaka': { code: 'BD', name: 'Bangladesh', region: 'South Asia' },
  '🇧🇩': { code: 'BD', name: 'Bangladesh', region: 'South Asia' },

  // Sri Lanka
  'sri lanka': { code: 'LK', name: 'Sri Lanka', region: 'South Asia' },
  'colombo': { code: 'LK', name: 'Sri Lanka', region: 'South Asia' },
  '🇱🇰': { code: 'LK', name: 'Sri Lanka', region: 'South Asia' },

  // Australia
  'australia': { code: 'AU', name: 'Australia', region: 'Oceania' },
  'sydney': { code: 'AU', name: 'Australia', region: 'Oceania' },
  'melbourne': { code: 'AU', name: 'Australia', region: 'Oceania' },
  'brisbane': { code: 'AU', name: 'Australia', region: 'Oceania' },
  '🇦🇺': { code: 'AU', name: 'Australia', region: 'Oceania' },

  // New Zealand
  'new zealand': { code: 'NZ', name: 'New Zealand', region: 'Oceania' },
  'auckland': { code: 'NZ', name: 'New Zealand', region: 'Oceania' },
  'wellington': { code: 'NZ', name: 'New Zealand', region: 'Oceania' },
  '🇳🇿': { code: 'NZ', name: 'New Zealand', region: 'Oceania' },

  // UAE
  'uae': { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  'dubai': { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  'abu dhabi': { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  'emirates': { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  '🇦🇪': { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },

  // Saudi Arabia
  'saudi': { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },
  'riyadh': { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },
  '🇸🇦': { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },

  // Israel
  'israel': { code: 'IL', name: 'Israel', region: 'Middle East' },
  'tel aviv': { code: 'IL', name: 'Israel', region: 'Middle East' },
  '🇮🇱': { code: 'IL', name: 'Israel', region: 'Middle East' },

  // Egypt
  'egypt': { code: 'EG', name: 'Egypt', region: 'Africa' },
  'cairo': { code: 'EG', name: 'Egypt', region: 'Africa' },
  '🇪🇬': { code: 'EG', name: 'Egypt', region: 'Africa' },

  // South Africa
  'south africa': { code: 'ZA', name: 'South Africa', region: 'Africa' },
  'johannesburg': { code: 'ZA', name: 'South Africa', region: 'Africa' },
  'cape town': { code: 'ZA', name: 'South Africa', region: 'Africa' },
  '🇿🇦': { code: 'ZA', name: 'South Africa', region: 'Africa' },

  // Nigeria
  'nigeria': { code: 'NG', name: 'Nigeria', region: 'Africa' },
  'lagos': { code: 'NG', name: 'Nigeria', region: 'Africa' },
  '🇳🇬': { code: 'NG', name: 'Nigeria', region: 'Africa' },

  // Kenya
  'kenya': { code: 'KE', name: 'Kenya', region: 'Africa' },
  'nairobi': { code: 'KE', name: 'Kenya', region: 'Africa' },
  '🇰🇪': { code: 'KE', name: 'Kenya', region: 'Africa' },

  // Ghana
  'ghana': { code: 'GH', name: 'Ghana', region: 'Africa' },
  'accra': { code: 'GH', name: 'Ghana', region: 'Africa' },
  '🇬🇭': { code: 'GH', name: 'Ghana', region: 'Africa' },
};

// =============================================================================
// GEO INFERENCE FUNCTION
// =============================================================================

/**
 * Infer country from a Twitter profile location string.
 * Uses simple pattern matching against known countries/cities.
 * Returns null values if no match found.
 */
export function inferCountryFromLocation(location: string | null | undefined): GeoInference {
  if (!location || typeof location !== 'string') {
    return { countryCode: null, countryName: null, regionLabel: null };
  }

  const normalizedLocation = location.toLowerCase().trim();
  
  if (!normalizedLocation || normalizedLocation === 'null' || normalizedLocation === 'undefined') {
    return { countryCode: null, countryName: null, regionLabel: null };
  }

  // Check each pattern (order matters - more specific patterns first for emojis)
  for (const [pattern, mapping] of Object.entries(COUNTRY_PATTERNS)) {
    if (normalizedLocation.includes(pattern.toLowerCase())) {
      return {
        countryCode: mapping.code,
        countryName: mapping.name,
        regionLabel: mapping.region || null,
      };
    }
  }

  return { countryCode: null, countryName: null, regionLabel: null };
}

// =============================================================================
// FOLLOWER FETCHING
// =============================================================================

/**
 * Fetch a sample of followers for a project from twitterapi.io
 * 
 * @param supabase - Supabase client
 * @param projectId - Project UUID
 * @param maxFollowers - Maximum number of followers to fetch (default 500)
 */
export async function fetchProjectFollowersSample(
  supabase: SupabaseClient,
  projectId: string,
  maxFollowers: number = 500
): Promise<{ followers: FollowerSample[]; xHandle: string | null; xUserId: string | null }> {
  // Look up project to get X handle
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, twitter_username')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error(`[AudienceGeo] Project not found: ${projectId}`, projectError);
    return { followers: [], xHandle: null, xUserId: null };
  }

  const xHandle = project.twitter_username;
  if (!xHandle) {
    console.warn(`[AudienceGeo] Project ${projectId} has no twitter_username`);
    return { followers: [], xHandle: null, xUserId: null };
  }

  console.log(`[AudienceGeo] Fetching followers for @${xHandle} (max: ${maxFollowers})`);

  const followers: FollowerSample[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  const pageSize = Math.min(200, maxFollowers);

  while (hasMore && followers.length < maxFollowers) {
    try {
      const result = await taioGetUserFollowers(xHandle, pageSize, cursor);
      
      // Map to FollowerSample format
      for (const user of result.users) {
        if (followers.length >= maxFollowers) break;
        
        followers.push({
          id: user.id,
          username: user.username,
          location: user.description || null, // twitterapi.io includes location in the user object
        });
      }

      hasMore = result.hasNextPage;
      cursor = result.nextCursor || undefined;

      // Small delay to avoid rate limiting
      if (hasMore && followers.length < maxFollowers) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      console.error(`[AudienceGeo] Error fetching followers for @${xHandle}:`, error.message);
      break;
    }
  }

  console.log(`[AudienceGeo] Fetched ${followers.length} followers for @${xHandle}`);

  return {
    followers,
    xHandle,
    xUserId: null, // x_user_id not stored in projects table
  };
}

// =============================================================================
// COMPUTE AND STORE
// =============================================================================

/**
 * Compute and store audience geo distribution for a project.
 * 
 * This function:
 * 1. Fetches a sample of followers from twitterapi.io
 * 2. Parses location strings to infer countries
 * 3. Aggregates counts per country
 * 4. Stores the result in project_audience_geo table
 * 
 * @param supabase - Supabase client
 * @param projectId - Project UUID
 * @param options - Optional configuration
 */
export async function computeAndStoreAudienceGeo(
  supabase: SupabaseClient,
  projectId: string,
  options?: { maxFollowers?: number }
): Promise<ComputeGeoResult | null> {
  const maxFollowers = options?.maxFollowers || 500;
  
  // Get project info
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, twitter_username')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error(`[AudienceGeo] Project not found: ${projectId}`, projectError);
    return null;
  }

  // Fetch follower sample
  const { followers, xHandle, xUserId } = await fetchProjectFollowersSample(
    supabase,
    projectId,
    maxFollowers
  );

  if (followers.length === 0) {
    console.warn(`[AudienceGeo] No followers found for project ${project.slug}`);
    return null;
  }

  // Aggregate by country
  const countryMap = new Map<string, { count: number; name: string; region: string | null }>();
  let mappedCount = 0;

  for (const follower of followers) {
    const geo = inferCountryFromLocation(follower.location);
    
    if (geo.countryCode && geo.countryName) {
      mappedCount++;
      const existing = countryMap.get(geo.countryCode);
      if (existing) {
        existing.count++;
      } else {
        countryMap.set(geo.countryCode, {
          count: 1,
          name: geo.countryName,
          region: geo.regionLabel,
        });
      }
    }
  }

  if (mappedCount === 0) {
    console.warn(`[AudienceGeo] No locations could be mapped for project ${project.slug}`);
    // Still return result but with empty countries
    return {
      projectId,
      projectSlug: project.slug,
      xUserId,
      sampleSize: followers.length,
      mappedCount: 0,
      countries: [],
    };
  }

  // Convert to aggregated array with percentages
  const countries: AggregatedGeo[] = [];
  for (const [code, data] of countryMap.entries()) {
    countries.push({
      countryCode: code,
      countryName: data.name,
      regionLabel: data.region,
      followerCount: data.count,
      followerShare: Math.round((data.count / mappedCount) * 10000) / 100, // e.g. 44.00
    });
  }

  // Sort by follower count descending
  countries.sort((a, b) => b.followerCount - a.followerCount);

  // Store in database
  const now = new Date().toISOString();

  // Delete existing rows for this project (replace strategy)
  const { error: deleteError } = await supabase
    .from('project_audience_geo')
    .delete()
    .eq('project_id', projectId);

  if (deleteError) {
    console.error(`[AudienceGeo] Error deleting old geo data:`, deleteError);
  }

  // Insert new rows
  const rows = countries.map((c) => ({
    project_id: projectId,
    project_slug: project.slug,
    x_user_id: xUserId,
    sample_size: followers.length,
    country_code: c.countryCode,
    country_name: c.countryName,
    region_label: c.regionLabel,
    follower_count: c.followerCount,
    follower_share: c.followerShare,
    computed_at: now,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('project_audience_geo')
      .insert(rows);

    if (insertError) {
      console.error(`[AudienceGeo] Error inserting geo data:`, insertError);
      return null;
    }
  }

  console.log(`[AudienceGeo] Stored ${countries.length} countries for ${project.slug} (mapped ${mappedCount}/${followers.length})`);

  return {
    projectId,
    projectSlug: project.slug,
    xUserId,
    sampleSize: followers.length,
    mappedCount,
    countries,
  };
}

