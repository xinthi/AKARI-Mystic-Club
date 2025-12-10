/**
 * ProfileInnerCircleList Component
 * 
 * Displays a table/list view of inner circle members with
 * their stats, Akari tier badge, CT Heat, followers, and role.
 */

import Image from 'next/image';

// =============================================================================
// TYPES
// =============================================================================

export interface InnerCircleEntry {
  handle: string;
  avatarUrl: string | null;
  akariScore: number | null;
  ctHeat: number | null;
  followers: number | null;
  role: 'hero' | 'player';
}

export interface ProfileInnerCircleListProps {
  entries: InnerCircleEntry[];
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function getAkariTier(score: number | null): { name: string; color: string; bgColor: string } {
  if (score === null) return { name: 'Unranked', color: 'text-akari-muted', bgColor: 'bg-akari-cardSoft/50' };
  if (score >= 900) return { name: 'Celestial', color: 'text-akari-neon-violet', bgColor: 'bg-akari-neon-violet/15' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-akari-neon-teal', bgColor: 'bg-akari-neon-teal/15' };
  if (score >= 550) return { name: 'Ranger', color: 'text-akari-neon-blue', bgColor: 'bg-akari-neon-blue/15' };
  if (score >= 400) return { name: 'Nomad', color: 'text-akari-neon-pink', bgColor: 'bg-akari-neon-pink/15' };
  return { name: 'Shadow', color: 'text-akari-muted', bgColor: 'bg-akari-cardSoft/50' };
}

function getInitials(handle: string): string {
  return handle.slice(0, 2).toUpperCase();
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface MemberRowProps {
  entry: InnerCircleEntry;
  index: number;
}

function MemberRow({ entry, index }: MemberRowProps) {
  const tier = getAkariTier(entry.akariScore);
  const isHero = entry.role === 'hero';
  
  return (
    <div
      className={`
        flex items-center gap-4 p-4 rounded-xl transition-all duration-300
        ${index % 2 === 0 ? 'bg-akari-cardSoft/30' : 'bg-transparent'}
        hover:bg-akari-cardSoft/50 hover:border hover:border-akari-neon-teal/20
      `}
    >
      {/* Avatar + Handle */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          {entry.avatarUrl ? (
            <Image
              src={entry.avatarUrl}
              alt={entry.handle}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-akari-neon-teal/30"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div 
            className={`
              w-10 h-10 rounded-full bg-gradient-neon-teal ring-2 ring-akari-neon-teal/30
              flex items-center justify-center text-xs text-black font-bold
              ${entry.avatarUrl ? 'hidden' : ''}
            `}
          >
            {getInitials(entry.handle)}
          </div>
          {isHero && (
            <span className="absolute -top-0.5 -right-0.5 text-xs">⭐</span>
          )}
        </div>
        <a
          href={`https://x.com/${entry.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-akari-text hover:text-gradient-teal transition-all duration-300 truncate font-semibold"
        >
          {entry.handle}
        </a>
      </div>
      
      {/* Akari Tier Badge */}
      <div className="hidden sm:flex items-center gap-1.5 w-24">
        <span className={`pill-neon px-3 py-1 text-xs font-semibold border ${tier.color} ${tier.bgColor} border-akari-neon-teal/30`}>
          {tier.name}
        </span>
      </div>
      
      {/* CT Heat */}
      <div className="w-14 text-right">
        <span className={`text-sm font-semibold ${(entry.ctHeat ?? 0) >= 60 ? 'text-akari-neon-pink' : 'text-akari-muted'}`}>
          {entry.ctHeat ?? '-'}
        </span>
      </div>
      
      {/* Followers */}
      <div className="w-16 text-right hidden md:block">
        <span className="text-sm text-akari-muted font-medium">{formatNumber(entry.followers)}</span>
      </div>
      
      {/* Role Pill */}
      <div className="w-16 text-right">
        <span
          className={`
            pill-neon inline-block px-3 py-1 text-xs font-semibold border
            ${isHero 
              ? 'bg-akari-neon-pink/15 text-akari-neon-pink border-akari-neon-pink/30' 
              : 'bg-akari-cardSoft/50 text-akari-muted border-akari-neon-teal/20'
            }
          `}
        >
          {isHero ? 'Hero' : 'Player'}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileInnerCircleList({ entries }: ProfileInnerCircleListProps) {
  const hasData = entries.length > 0;
  
  // Sort by akari score descending, then by followers
  const sortedEntries = [...entries].sort((a, b) => {
    const scoreA = a.akariScore ?? 0;
    const scoreB = b.akariScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.followers ?? 0) - (a.followers ?? 0);
  });
  
  const heroCount = entries.filter(e => e.role === 'hero').length;
  const playerCount = entries.filter(e => e.role === 'player').length;
  
  return (
    <div className="neon-card neon-hover p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-blue">
            Inner Circle (Top Allies)
          </h2>
          <p className="text-xs text-akari-muted mt-1 font-medium">
            {entries.length} members • {heroCount} heroes, {playerCount} players
          </p>
        </div>
      </div>
      
      {!hasData ? (
        <div className="py-12 text-center text-akari-muted text-sm font-medium">
          No inner circle data yet
        </div>
      ) : (
        <>
          {/* Column Headers */}
          <div className="flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider font-semibold text-gradient-teal border-b border-akari-neon-teal/20">
            <div className="flex-1 min-w-0">Profile</div>
            <div className="hidden sm:block w-24">Akari Score</div>
            <div className="w-14 text-right">CT Heat</div>
            <div className="w-16 text-right hidden md:block">Followers</div>
            <div className="w-16 text-right">Role</div>
          </div>
          
          {/* Member List */}
          <div className="divide-y divide-akari-neon-teal/10">
            {sortedEntries.map((entry, i) => (
              <MemberRow key={entry.handle} entry={entry} index={i} />
            ))}
          </div>
          
          {/* Summary Footer */}
          <div className="mt-6 pt-4 border-t border-akari-neon-teal/20 flex justify-center gap-6">
            <span className="flex items-center gap-1.5 text-xs text-akari-muted font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-akari-neon-pink/50" />
              Hero: Higher followers or AKARI than you
            </span>
            <span className="flex items-center gap-1.5 text-xs text-akari-muted font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-akari-cardSoft" />
              Player: Similar or lower stats
            </span>
          </div>
        </>
      )}
    </div>
  );
}

