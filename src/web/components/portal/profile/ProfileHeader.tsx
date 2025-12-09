/**
 * ProfileHeader Component
 * 
 * Displays the user's profile header with avatar, name, claim tick,
 * role badge, bio, and action buttons (View Public Profile, Compare).
 */

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Role, PersonaType, getHighestRole } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileHeaderProps {
  /** User's display name */
  displayName: string;
  /** User's X username (without @) */
  xUsername: string | null;
  /** Avatar URL (Twitter profile image or fallback) */
  avatarUrl: string | null;
  /** User's bio */
  bio?: string | null;
  /** User's effective roles array */
  roles: Role[];
  /** Current persona type (for claim tick color) */
  personaType: PersonaType;
  /** AKARI score */
  akariScore: number | null;
  /** AKARI tier info */
  tier: { name: string; color: string; bgColor: string };
  /** Whether user can use compare feature */
  canCompare: boolean;
  /** Slug for public profile link */
  slug: string;
  /** Callback for refresh action */
  onRefresh?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function getRoleBadge(roles: Role[]): { label: string; color: string; bgColor: string } {
  const highest = getHighestRole(roles);
  switch (highest) {
    case 'super_admin':
      return { label: 'Founder of the Realm', color: 'text-purple-300', bgColor: 'bg-purple-500/20' };
    case 'admin':
      return { label: 'Realm Keeper', color: 'text-amber-300', bgColor: 'bg-amber-500/20' };
    case 'analyst':
      return { label: 'Oracle', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20' };
    default:
      return { label: 'Mystic Member', color: 'text-slate-300', bgColor: 'bg-slate-500/20' };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileHeader({
  displayName,
  xUsername,
  avatarUrl,
  bio,
  roles,
  personaType,
  akariScore,
  tier,
  canCompare,
  slug,
  onRefresh,
}: ProfileHeaderProps) {
  const router = useRouter();
  const roleBadge = getRoleBadge(roles);
  
  const handleCompareClick = () => {
    if (canCompare && slug) {
      router.push(`/portal/sentiment/compare?projectA=${slug}`);
    }
  };
  
  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Avatar + Info */}
        <div className="flex items-start gap-4 flex-1">
          {/* Avatar with claim tick */}
          <div className="relative flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={80}
                height={80}
                className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-slate-700"
                unoptimized
              />
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-emerald-500/30 to-purple-500/30 flex items-center justify-center text-2xl font-bold text-emerald-400">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Claim tick */}
            <div 
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${
                personaType === 'company' 
                  ? 'bg-emerald-500' 
                  : 'bg-amber-500'
              }`}
              title={personaType === 'company' ? 'Verified Company' : 'Individual'}
            >
              <svg className="w-3.5 h-3.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          
          {/* Name, handle, bio */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl md:text-2xl font-semibold text-white truncate">
                {displayName}
              </h1>
              {/* Role badge */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${roleBadge.bgColor} ${roleBadge.color}`}>
                {roleBadge.label}
              </span>
            </div>
            {xUsername && (
              <a
                href={`https://x.com/${xUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-emerald-400 transition"
              >
                @{xUsername}
              </a>
            )}
            {bio && (
              <p className="mt-2 text-sm text-slate-500 line-clamp-2 max-w-xl">
                {bio}
              </p>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
          <Link
            href={`/portal/sentiment/${slug}`}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Public Profile
          </Link>
          
          {canCompare ? (
            <button
              onClick={handleCompareClick}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Compare My Profile
            </button>
          ) : (
            <div className="relative group">
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-xl bg-slate-800/50 text-slate-500 text-sm cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Compare My Profile
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                Compare unlocks when you become an Oracle
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

