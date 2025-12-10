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
  if (score === null) return { name: 'Unranked', color: 'text-slate-400', bgColor: 'bg-slate-400/10' };
  if (score >= 900) return { name: 'Celestial', color: 'text-purple-400', bgColor: 'bg-purple-400/10' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' };
  if (score >= 550) return { name: 'Ranger', color: 'text-blue-400', bgColor: 'bg-blue-400/10' };
  if (score >= 400) return { name: 'Nomad', color: 'text-amber-400', bgColor: 'bg-amber-400/10' };
  return { name: 'Shadow', color: 'text-slate-400', bgColor: 'bg-slate-400/10' };
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
        flex items-center gap-3 p-3 rounded-xl transition-colors
        ${index % 2 === 0 ? 'bg-slate-800/30' : 'bg-transparent'}
        hover:bg-slate-800/50
      `}
    >
      {/* Avatar + Handle */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          {entry.avatarUrl ? (
            <Image
              src={entry.avatarUrl}
              alt={entry.handle}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-700"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div 
            className={`
              w-8 h-8 rounded-full bg-slate-800 ring-1 ring-slate-700
              flex items-center justify-center text-[10px] text-slate-400
              ${entry.avatarUrl ? 'hidden' : ''}
            `}
          >
            {getInitials(entry.handle)}
          </div>
          {isHero && (
            <span className="absolute -top-0.5 -right-0.5 text-[8px]">⭐</span>
          )}
        </div>
        <a
          href={`https://x.com/${entry.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white hover:text-emerald-400 transition truncate"
        >
          {entry.handle}
        </a>
      </div>
      
      {/* Akari Tier Badge */}
      <div className="hidden sm:flex items-center gap-1.5 w-24">
        <span className={`px-2 py-0.5 rounded-full text-[10px] ${tier.color} ${tier.bgColor}`}>
          {tier.name}
        </span>
      </div>
      
      {/* CT Heat */}
      <div className="w-14 text-right">
        <span className={`text-sm ${(entry.ctHeat ?? 0) >= 60 ? 'text-amber-400' : 'text-slate-400'}`}>
          {entry.ctHeat ?? '-'}
        </span>
      </div>
      
      {/* Followers */}
      <div className="w-16 text-right hidden md:block">
        <span className="text-sm text-slate-400">{formatNumber(entry.followers)}</span>
      </div>
      
      {/* Role Pill */}
      <div className="w-16 text-right">
        <span
          className={`
            inline-block px-2 py-0.5 rounded-full text-[10px] font-medium
            ${isHero 
              ? 'bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20' 
              : 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/50'
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
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-slate-400">
            Inner Circle (Top Allies)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {entries.length} members • {heroCount} heroes, {playerCount} players
          </p>
        </div>
      </div>
      
      {!hasData ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          No inner circle data yet
        </div>
      ) : (
        <>
          {/* Column Headers */}
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <div className="flex-1 min-w-0">Profile</div>
            <div className="hidden sm:block w-24">Akari Score</div>
            <div className="w-14 text-right">CT Heat</div>
            <div className="w-16 text-right hidden md:block">Followers</div>
            <div className="w-16 text-right">Role</div>
          </div>
          
          {/* Member List */}
          <div className="divide-y divide-slate-800/50">
            {sortedEntries.map((entry, i) => (
              <MemberRow key={entry.handle} entry={entry} index={i} />
            ))}
          </div>
          
          {/* Summary Footer */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-center gap-4">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-amber-400/50" />
              Hero: Higher followers or AKARI than you
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              Player: Similar or lower stats
            </span>
          </div>
        </>
      )}
    </div>
  );
}

