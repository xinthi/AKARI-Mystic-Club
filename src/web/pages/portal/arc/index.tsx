import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';
import { useArcMode } from '@/lib/arc/useArcMode';

const QUEST_TABS = [
  { key: 'invite', label: 'Invite Only' },
  { key: 'public', label: 'Public' },
];

export default function ArcHome() {
  const router = useRouter();
  const { mode } = useArcMode();
  const [quests, setQuests] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLanguageFilter, setShowLanguageFilter] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const viewParam = typeof router.query.view === 'string' ? router.query.view : null;
  const view = viewParam || (mode === 'crm' ? 'analytics' : 'quests');

  const loadCreatorQuests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/brands/quests', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load quests');
      }
      setQuests(data.quests || data.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load quests');
      setQuests([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCrmBrands = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/brands/overview', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load brands');
      }
      setBrands(data.brands || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load brands');
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (mode === 'creator') {
      loadCreatorQuests();
      return;
    }
    if (mode === 'crm') {
      loadCrmBrands();
    }
  }, [mode, view]);

  const availableLanguages = useMemo(() => {
    const all = new Set<string>();
    quests.forEach((q) => (q.languages || []).forEach((l: string) => all.add(l)));
    return Array.from(all);
  }, [quests]);

  const filteredQuests = useMemo(() => {
    let list = activeTab === 'all' ? quests : quests.filter((q) => q.campaign_type === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) =>
        [item.name, item.pitch, item.brand?.name].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q))
      );
    }
    if (selectedLanguages.length > 0) {
      list = list.filter((q) => (q.languages || []).some((l: string) => selectedLanguages.includes(l)));
    }
    return list;
  }, [quests, activeTab, searchQuery, selectedLanguages]);

  const liveQuests = useMemo(() => {
    const now = Date.now();
    return filteredQuests.filter((quest) => {
      const start = quest.start_at ? new Date(quest.start_at).getTime() : null;
      const end = quest.end_at ? new Date(quest.end_at).getTime() : null;
      if (!start || !end) return false;
      const hasStarted = start ? start <= now : true;
      const notEnded = end ? end >= now : true;
      return hasStarted && notEnded;
    });
  }, [filteredQuests]);

  const livePublicQuests = useMemo(() => {
    return liveQuests.filter((quest) => quest.campaign_type === 'public');
  }, [liveQuests]);

  const liveBrands = useMemo(() => {
    const map = new Map<string, any>();
    livePublicQuests.forEach((quest) => {
      if (quest.brand?.id && !map.has(quest.brand.id)) {
        map.set(quest.brand.id, quest.brand);
      }
    });
    return Array.from(map.values());
  }, [livePublicQuests]);

  const myRequests = useMemo(() => {
    return quests.filter((quest) => quest.creatorStatus === 'pending' || quest.creatorStatus === 'invited');
  }, [quests]);

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      exclusive: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      invite: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      public: 'bg-green-500/20 text-green-300 border-green-500/40',
      monad: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-[11px] border ${styles[type] || styles.public}`}>
        {type === 'invite' ? 'Invite Only' : type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (quest: any) => {
    if (!quest.isMember) {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 text-white/50 border border-white/10">Join Brand First</span>;
    }
    if (!quest.creatorStatus) {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-blue-500/20 text-blue-300 border border-blue-500/40">Open to Join</span>;
    }
    if (quest.creatorStatus === 'approved') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-green-500/20 text-green-300 border border-green-500/40">Joined</span>;
    }
    if (quest.creatorStatus === 'pending') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">Request Sent</span>;
    }
    if (quest.creatorStatus === 'invited') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-purple-500/20 text-purple-300 border border-purple-500/40">Invited</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-[11px] bg-red-500/20 text-red-300 border border-red-500/40">Rejected</span>;
  };

  const getTimeLabel = (quest: any) => {
    if (!quest.end_at && !quest.start_at) return 'Live';
    const now = Date.now();
    if (quest.start_at) {
      const start = new Date(quest.start_at).getTime();
      if (start > now) {
        const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
        return `Starts in ${days}d`;
      }
    }
    if (quest.end_at) {
      const end = new Date(quest.end_at).getTime();
      if (end <= now) return 'Ended';
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      return `Ends in ${days}d`;
    }
    return 'Live';
  };

  return (
    <ArcPageShell hideRightRail>
      <div className="space-y-6">
        {mode === 'creator' ? (
          <>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Creator Hub</h1>
              <p className="text-white/60">Live quests and brands with public campaigns.</p>
              <p className="text-xs text-white/40 mt-2">Analytics for discovery only. No rewards.</p>
            </div>

            {view === 'quests' && (
              <div className="flex flex-wrap gap-2">
                {QUEST_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      activeTab === tab.key
                        ? 'bg-white/10 text-white border-white/20'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {view === 'quests' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search quests..."
                    className="w-full px-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20"
                  />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowLanguageFilter((prev) => !prev)}
                    className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
                  >
                    Languages
                  </button>
                  {showLanguageFilter && (
                    <div className="absolute right-0 mt-2 w-48 rounded-lg border border-white/10 bg-black/90 p-2 z-10">
                      {availableLanguages.length === 0 ? (
                        <div className="text-xs text-white/50 px-2 py-1">No languages</div>
                      ) : (
                        availableLanguages.map((lang) => (
                          <label key={lang} className="flex items-center gap-2 px-2 py-1 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={selectedLanguages.includes(lang)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLanguages((prev) => [...prev, lang]);
                                } else {
                                  setSelectedLanguages((prev) => prev.filter((l) => l !== lang));
                                }
                              }}
                            />
                            <span>{lang}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-6 animate-pulse">
                    <div className="h-4 w-24 bg-white/10 rounded mb-4" />
                    <div className="h-6 w-3/4 bg-white/10 rounded mb-3" />
                    <div className="h-3 w-full bg-white/10 rounded mb-2" />
                    <div className="h-3 w-2/3 bg-white/10 rounded" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={loadCreatorQuests} />
            ) : view === 'brands' ? (
              liveBrands.length === 0 ? (
                <EmptyState icon="🏷️" title="No live brands yet" description="Brands with live public quests will appear here." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {liveBrands.map((brand) => (
                    <Link
                      key={brand.id}
                      href={`/portal/arc/brands/${brand.id}`}
                      className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 hover:shadow-[0_0_24px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Brand</div>
                          <h3 className="text-lg font-semibold text-white">{brand.name}</h3>
                          {brand.x_handle && (
                            <p className="text-xs text-white/50">@{brand.x_handle.replace(/^@+/, '')}</p>
                          )}
                        </div>
                        {brand.logo_url || brand.x_profile_image_url ? (
                          <img src={brand.logo_url || brand.x_profile_image_url} alt={brand.name} className="w-11 h-11 rounded-full border border-white/10" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                            {(brand.name || 'B').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-white/60">Live public quests available</div>
                    </Link>
                  ))}
                </div>
              )
            ) : view === 'requests' ? (
              myRequests.length === 0 ? (
                <EmptyState icon="📨" title="No requests yet" description="Your join requests will appear here." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {myRequests.map((quest) => (
                    <Link
                      key={quest.id}
                      href={`/portal/arc/quests/${quest.id}`}
                      className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 hover:shadow-[0_0_24px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
                            {quest.brand?.name || 'Brand'}
                          </div>
                          <h3 className="text-lg font-semibold text-white mb-1">{quest.name}</h3>
                          {quest.brand && (
                            <p className="text-xs text-white/50">
                              {quest.brand.x_handle
                                ? `@${quest.brand.x_handle.replace(/^@+/, '')}`
                                : quest.brand.name}
                            </p>
                          )}
                        </div>
                        {quest.brand?.logo_url || quest.brand?.x_profile_image_url ? (
                          <img
                            src={quest.brand.logo_url || quest.brand.x_profile_image_url}
                            alt={quest.brand.name}
                            className="w-11 h-11 rounded-full border border-white/10"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                            {(quest.brand?.name || 'B').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {quest.pitch && <p className="text-sm text-white/70 mb-4 line-clamp-2">{quest.pitch}</p>}

                      <div className="flex items-center gap-2 mb-4">
                        {getTypeBadge(quest.campaign_type)}
                        {getStatusBadge(quest)}
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : liveQuests.length === 0 ? (
              <EmptyState icon="🧭" title="No live quests" description="Live quests will appear here." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {liveQuests.map((quest) => (
                  <Link
                    key={quest.id}
                    href={`/portal/arc/quests/${quest.id}`}
                    className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 hover:shadow-[0_0_24px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
                          {quest.brand?.name || 'Brand'}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">{quest.name}</h3>
                        {quest.brand && (
                          <p className="text-xs text-white/50">
                            {quest.brand.x_handle
                              ? `@${quest.brand.x_handle.replace(/^@+/, '')}`
                              : quest.brand.name}
                          </p>
                        )}
                      </div>
                      {quest.brand?.logo_url || quest.brand?.x_profile_image_url ? (
                        <img
                          src={quest.brand.logo_url || quest.brand.x_profile_image_url}
                          alt={quest.brand.name}
                          className="w-11 h-11 rounded-full border border-white/10"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                          {(quest.brand?.name || 'B').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {quest.pitch && <p className="text-sm text-white/70 mb-4 line-clamp-2">{quest.pitch}</p>}

                    <div className="flex items-center gap-2 mb-4">
                      {getTypeBadge(quest.campaign_type)}
                      {getStatusBadge(quest)}
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>{quest.approvedCount} creators joined</span>
                      <span>{getTimeLabel(quest)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {view === 'analytics' ? (
              <>
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">Brand Analytics</h1>
                  <p className="text-white/60">Select a brand to view quest analytics.</p>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-6 animate-pulse">
                        <div className="h-4 w-24 bg-white/10 rounded mb-4" />
                        <div className="h-6 w-3/4 bg-white/10 rounded mb-3" />
                        <div className="h-3 w-full bg-white/10 rounded mb-2" />
                        <div className="h-3 w-2/3 bg-white/10 rounded" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <ErrorState message={error} onRetry={loadCrmBrands} />
                ) : brands.length === 0 ? (
                  <EmptyState icon="🏷️" title="No brands yet" description="Create a brand profile to view analytics." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {brands.map((brand) => (
                      <Link
                        key={brand.id}
                        href={`/portal/arc/brands/${brand.id}?view=analytics`}
                        className="rounded-xl border border-white/10 bg-black/40 p-6 hover:border-teal-400/50 hover:shadow-[0_0_24px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Brand</div>
                            <h3 className="text-lg font-semibold text-white">{brand.name}</h3>
                          </div>
                          {brand.logo_url || brand.x_profile_image_url ? (
                            <img
                              src={brand.logo_url || brand.x_profile_image_url}
                              alt={brand.name}
                              className="w-11 h-11 rounded-full border border-white/10"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                              {(brand.name || 'B').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/50">
                          <span>{brand.membersCount} members</span>
                          <span>{brand.questsCount} quests</span>
                        </div>
                        <div className="mt-3 text-xs text-white/50">View analytics →</div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Brand Hub</h1>
                    <p className="text-white/60">Manage your brands and launch quests.</p>
                  </div>
                  <Link
                    href="/portal/arc/brands?create=1"
                    className="px-4 py-2 text-sm font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30"
                  >
                    Create Brand
                  </Link>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-6 animate-pulse">
                        <div className="h-4 w-24 bg-white/10 rounded mb-4" />
                        <div className="h-6 w-3/4 bg-white/10 rounded mb-3" />
                        <div className="h-3 w-full bg-white/10 rounded mb-2" />
                        <div className="h-3 w-2/3 bg-white/10 rounded" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <ErrorState message={error} onRetry={loadCrmBrands} />
                ) : brands.length === 0 ? (
                  <EmptyState icon="🏷️" title="No brands yet" description="Create a brand profile to launch quests." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {brands.map((brand) => (
                      <div key={brand.id} className="rounded-xl border border-white/10 bg-black/40 p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Brand</div>
                            <h3 className="text-lg font-semibold text-white">{brand.name}</h3>
                          </div>
                          {brand.logo_url || brand.x_profile_image_url ? (
                            <img src={brand.logo_url || brand.x_profile_image_url} alt={brand.name} className="w-11 h-11 rounded-full border border-white/10" />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                              {(brand.name || 'B').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/50">
                          <span>{brand.membersCount} members</span>
                          <span>{brand.questsCount} quests</span>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Link
                            href={`/portal/arc/brands/${brand.id}?view=analytics`}
                            className="px-3 py-1.5 text-xs font-semibold bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10"
                          >
                            View
                          </Link>
                          <Link
                            href={`/portal/arc/brands/${brand.id}?create=1`}
                            className="px-3 py-1.5 text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30"
                          >
                            Launch Quest
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ArcPageShell>
  );
}

