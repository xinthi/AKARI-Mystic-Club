/**
 * ProfileHeader Component
 * 
 * Displays the user's profile header with avatar, name, claim tick,
 * role badge, bio, and action buttons (View Public Profile, Compare).
 */

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { Role, PersonaType, getHighestRole } from '@/lib/permissions';
import { useAkariAuth } from '@/lib/akari-auth';
import { ProfileCardPreview } from '@/components/share/ProfileCardPreview';
import { getUserTier } from '@/lib/userTier';
import { useAkariUser } from '@/lib/akari-auth';

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
  /** Sentiment score (30d) */
  sentimentScore?: number | null;
  /** CT Heat score */
  ctHeatScore?: number | null;
  /** Inner Circle Power */
  innerCirclePower?: number | null;
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
  sentimentScore,
  ctHeatScore,
  innerCirclePower,
}: ProfileHeaderProps) {
  const router = useRouter();
  const { logout } = useAkariAuth();
  const akariUser = useAkariUser();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const roleBadge = getRoleBadge(roles);
  
  // Get user tier for share card
  const userTier = getUserTier(akariUser.user);
  const tierName = userTier === 'institutional_plus' ? 'Institutional Plus' : 
                   userTier === 'analyst' ? 'Analyst' : 'Seer';
  
  // Get tagline based on score
  const getTagline = (score: number | null): string => {
    if (score === null) return 'A quiet force in the shadows.';
    if (score > 900) return 'Your presence bends the narrative.';
    if (score >= 500) return 'Known in the Club.';
    return 'A quiet force in the shadows.';
  };
  
  const handleLogout = async () => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    try {
      await logout();
      // Redirect to home after logout
      router.push('/portal/sentiment');
    } catch (error) {
      console.error('[ProfileHeader] Logout error:', error);
      setIsLoggingOut(false);
    }
  };
  
  const handleCompareClick = () => {
    if (canCompare && slug) {
      router.push(`/portal/sentiment/compare?projectA=${slug}`);
    }
  };
  
  return (
    <section className="neon-card neon-hover p-6 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Avatar + Info */}
        <div className="flex items-start gap-5 flex-1">
          {/* Avatar with claim tick */}
          <div className="relative flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={80}
                height={80}
                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-akari-neon-teal/30 shadow-neon-teal"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-neon-teal flex items-center justify-center text-3xl font-bold text-black shadow-neon-teal">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Claim tick */}
            <div 
              className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-black shadow-lg ${
                personaType === 'company' 
                  ? 'bg-gradient-neon-teal' 
                  : 'bg-gradient-neon-pink'
              }`}
              title={personaType === 'company' ? 'Official' : 'Claimed'}
            >
              <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          
          {/* Name, handle, bio */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gradient-neon truncate">
                {displayName}
              </h1>
              {/* Role badge */}
              <span className={`pill-neon text-xs px-3 py-1 font-semibold border ${roleBadge.bgColor} ${roleBadge.color} border-akari-neon-teal/30`}>
                {roleBadge.label}
              </span>
            </div>
            {xUsername && (
              <a
                href={`https://x.com/${xUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-akari-muted hover:text-gradient-teal transition-all duration-300 font-medium"
              >
                {xUsername}
              </a>
            )}
            {bio && (
              <p className="mt-3 text-sm text-akari-muted line-clamp-2 max-w-xl leading-relaxed">
                {bio}
              </p>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
          <button
            onClick={() => setShowShareModal(true)}
            className="pill-neon flex items-center gap-2 px-5 py-2.5 min-h-[44px] border border-akari-neon-teal/30 bg-gradient-neon-teal text-black font-semibold hover:shadow-akari-glow transition-all duration-300 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Card
          </button>
          
          <Link
            href={`/portal/sentiment/${slug}`}
            className="pill-neon flex items-center gap-2 px-5 py-2.5 min-h-[44px] border border-akari-neon-teal/30 bg-akari-cardSoft/50 text-akari-text hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)] transition-all duration-300 text-sm font-semibold"
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
              className="pill-neon flex items-center gap-2 px-5 py-2.5 min-h-[44px] border border-akari-neon-teal/30 bg-akari-neon-teal/20 text-akari-neon-teal hover:bg-akari-neon-teal/30 hover:shadow-[0_0_12px_rgba(0,246,162,0.3)] transition-all duration-300 text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Compare
            </button>
          ) : (
            <div className="relative group">
              <button
                disabled
                className="pill-neon flex items-center gap-2 px-5 py-2.5 min-h-[44px] border border-akari-neon-teal/20 bg-akari-cardSoft/30 text-akari-muted text-sm cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Compare
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 neon-card border border-akari-neon-teal/30 bg-akari-card text-akari-text text-xs opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap z-10">
                Upgrade to unlock compare
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-akari-neon-teal/30"></div>
              </div>
            </div>
          )}
          
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="pill-neon flex items-center gap-2 px-5 py-2.5 min-h-[44px] border border-akari-neon-teal/20 bg-akari-cardSoft/50 text-akari-muted hover:border-akari-neon-teal/40 hover:text-akari-text hover:bg-akari-cardSoft transition-all duration-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <>
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-akari-muted border-t-transparent" />
                Logging out...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Share Modal */}
      {showShareModal && (
        <ProfileCardPreview
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          avatar={avatarUrl}
          username={xUsername || slug}
          tier={tierName}
          score={akariScore}
          sentiment={sentimentScore ?? null}
          heat={ctHeatScore ?? null}
          power={innerCirclePower ?? null}
          tagline={getTagline(akariScore)}
          displayName={displayName}
        />
      )}
    </section>
  );
}

