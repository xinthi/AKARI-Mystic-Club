/**
 * ARC Super Admin Dashboard
 * 
 * Comprehensive admin panel for super admins to manage:
 * - Dashboard/Overview with key metrics
 * - Access Management (super admin roles)
 * - Leaderboard Requests (approvals and confirmations)
 * - Reporting & Analytics
 * - Pricing & Billing for leaderboard approvals
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdmin } from '@/lib/permissions';
import { useAkariUser } from '@/lib/akari-auth';
import { requireSuperAdmin } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  pendingRequests: number;
  approvedRequests: number;
  totalRevenue: number;
  monthlyRevenue: number;
  activeArenas: number;
  activeCampaigns: number;
  activeLeaderboards: number;
  activeCRM: number;
  activeGamified: number;
}

interface ArcProject {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  security_status: 'normal' | 'alert' | 'clear';
  arenas_count: number;
  meta?: {
    banner_url?: string | null;
    accent_color?: string | null;
    tagline?: string | null;
  };
}

interface SuperAdminUser {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  created_at: string;
}

interface PricingConfig {
  access_level: 'creator_manager' | 'leaderboard' | 'gamified';
  base_price_usd: number;
  currency: string;
  description: string | null;
  is_active: boolean;
}

interface ArcAdminHomeProps {
  projects: ArcProject[];
  error: string | null;
}

type TabType = 'dashboard' | 'access' | 'requests' | 'reporting' | 'pricing';

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcAdminHome({ projects: initialProjects, error: initialError }: ArcAdminHomeProps) {
  const akariUser = useAkariUser();
  const [mounted, setMounted] = useState(false);
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminUser[]>([]);
  const [superAdminsLoading, setSuperAdminsLoading] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Set mounted flag on client to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load dashboard stats
  useEffect(() => {
    if (!userIsSuperAdmin || !mounted) return;

    async function loadStats() {
      try {
        setStatsLoading(true);
        const res = await fetch('/api/portal/admin/arc/dashboard-stats', {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.ok && data.stats) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('[ArcAdmin] Error loading stats:', err);
      } finally {
        setStatsLoading(false);
      }
    }

    loadStats();
  }, [userIsSuperAdmin, mounted]);

  // Load super admins
  useEffect(() => {
    if (!userIsSuperAdmin || !mounted || activeTab !== 'access') return;

    async function loadSuperAdmins() {
      try {
        setSuperAdminsLoading(true);
        const res = await fetch('/api/portal/admin/arc/super-admins', {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.ok && data.admins) {
          setSuperAdmins(data.admins);
        }
      } catch (err) {
        console.error('[ArcAdmin] Error loading super admins:', err);
      } finally {
        setSuperAdminsLoading(false);
      }
    }

    loadSuperAdmins();
  }, [userIsSuperAdmin, mounted, activeTab]);

  // Load pricing config
  useEffect(() => {
    if (!userIsSuperAdmin || !mounted || activeTab !== 'pricing') return;

    async function loadPricing() {
      try {
        setPricingLoading(true);
        setPricingError(null);
        const res = await fetch('/api/portal/admin/arc/pricing', {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.ok && data.pricing) {
          setPricingConfig(data.pricing);
        } else {
          setPricingError(data.error || 'Failed to load pricing');
        }
      } catch (err: any) {
        console.error('[ArcAdmin] Error loading pricing:', err);
        setPricingError(err.message || 'Failed to load pricing');
      } finally {
        setPricingLoading(false);
      }
    }

    loadPricing();
  }, [userIsSuperAdmin, mounted, activeTab]);

  // Handle pricing update
  const handlePricingUpdate = async (accessLevel: string, newPrice: number) => {
    try {
      setPricingError(null);
      const res = await fetch('/api/portal/admin/arc/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_level: accessLevel,
          base_price_usd: newPrice,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        // Reload pricing
        const reloadRes = await fetch('/api/portal/admin/arc/pricing', {
          credentials: 'include',
        });
        const reloadData = await reloadRes.json();
        if (reloadData.ok && reloadData.pricing) {
          setPricingConfig(reloadData.pricing);
        }
      } else {
        setPricingError(data.error || 'Failed to update pricing');
      }
    } catch (err: any) {
      setPricingError(err.message || 'Failed to update pricing');
    }
  };

  // Show loading state until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <ArcPageShell canManageArc={true}>
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </ArcPageShell>
    );
  }

  // Check access (only after mounted to prevent flash)
  if (!userIsSuperAdmin) {
    return (
      <ArcPageShell canManageArc={true}>
        <div>
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
            <p className="text-sm text-red-400">
              Access denied. Super Admin privileges required.
            </p>
            <Link
              href="/portal/arc"
              className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              ← Back to ARC Home
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell canManageArc={true}>
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link
            href="/portal/arc"
            className="hover:text-white transition-colors"
          >
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white">Super Admin</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">ARC Super Admin Dashboard</h1>
            <p className="text-white/60 mt-1">Manage access, approvals, pricing, and analytics</p>
          </div>
        </div>

        {/* Error state */}
        {initialError && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{initialError}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
          {(['dashboard', 'access', 'requests', 'reporting', 'pricing'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab
                  ? 'text-black bg-gradient-to-r from-teal-400 to-cyan-400 shadow-[0_0_15px_rgba(0,246,162,0.3)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab === 'dashboard' && '📊 Dashboard'}
              {tab === 'access' && '👥 Access Management'}
              {tab === 'requests' && '✅ Approvals'}
              {tab === 'reporting' && '📈 Reporting'}
              {tab === 'pricing' && '💰 Pricing & Billing'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              {statsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                </div>
              ) : stats ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Total Projects</div>
                      <div className="text-3xl font-bold text-white">{stats.totalProjects}</div>
                      <div className="text-xs text-white/60 mt-1">{stats.activeProjects} active</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Pending Requests</div>
                      <div className="text-3xl font-bold text-yellow-400">{stats.pendingRequests}</div>
                      <Link
                        href="/portal/admin/arc/leaderboard-requests"
                        className="text-xs text-teal-400 hover:underline mt-1 inline-block"
                      >
                        Review requests →
                      </Link>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Total Revenue</div>
                      <div className="text-3xl font-bold text-green-400">${stats.totalRevenue.toLocaleString()}</div>
                      <div className="text-xs text-white/60 mt-1">${stats.monthlyRevenue.toLocaleString()} this month</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Active Arenas</div>
                      <div className="text-3xl font-bold text-white">{stats.activeArenas}</div>
                      <div className="text-xs text-white/60 mt-1">{stats.activeCampaigns} campaigns</div>
                    </div>
                  </div>
                  
                  {/* Breakdown by Type */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Leaderboards</div>
                      <div className="text-3xl font-bold text-white">{stats.activeLeaderboards}</div>
                      <div className="text-xs text-white/60 mt-1">Normal Leaderboard (Option 2)</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">CRM</div>
                      <div className="text-3xl font-bold text-white">{stats.activeCRM}</div>
                      <div className="text-xs text-white/60 mt-1">Creator Manager (Option 1)</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                      <div className="text-sm text-white/60 mb-1">Gamified</div>
                      <div className="text-3xl font-bold text-white">{stats.activeGamified}</div>
                      <div className="text-xs text-white/60 mt-1">Gamified Leaderboard (Option 3)</div>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Recent Activity */}
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
                <div className="space-y-3">
                  <div className="text-sm text-white/60 text-center py-4">
                    Activity feed coming soon...
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Link
                    href="/portal/admin/arc/leaderboard-requests"
                    className="px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="font-medium text-white">Review Requests</div>
                    <div className="text-xs text-white/60 mt-1">Approve or reject leaderboard requests</div>
                  </Link>
                  <button
                    onClick={() => setActiveTab('pricing')}
                    className="px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="font-medium text-white">Manage Pricing</div>
                    <div className="text-xs text-white/60 mt-1">Update pricing for access levels</div>
                  </button>
                  <button
                    onClick={() => setActiveTab('access')}
                    className="px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="font-medium text-white">Manage Access</div>
                    <div className="text-xs text-white/60 mt-1">Super admin role management</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Access Management Tab */}
          {activeTab === 'access' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Super Admin Users</h2>
                </div>
                {superAdminsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  </div>
                ) : superAdmins.length === 0 ? (
                  <div className="text-sm text-white/60 text-center py-8">No super admins found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Roles</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {superAdmins.map((admin) => (
                          <tr key={admin.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-white">{admin.display_name || admin.username}</div>
                              <div className="text-xs text-white/60">@{admin.username}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {admin.roles.map((role) => (
                                  <span
                                    key={role}
                                    className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                  >
                                    {role}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-white/60">
                              {new Date(admin.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Requests Tab */}
          {activeTab === 'requests' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Leaderboard Requests</h2>
                  <Link
                    href="/portal/admin/arc/leaderboard-requests"
                    className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
                  >
                    View All Requests
                  </Link>
                </div>
                <p className="text-sm text-white/60">
                  Manage and approve leaderboard access requests. Click &quot;View All Requests&quot; to see the full management interface.
                </p>
              </div>
            </div>
          )}

          {/* Reporting Tab */}
          {activeTab === 'reporting' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Analytics & Reporting</h2>
                <div className="text-sm text-white/60 text-center py-8">
                  Reporting dashboard coming soon...
                </div>
              </div>
            </div>
          )}

          {/* Pricing & Billing Tab */}
          {activeTab === 'pricing' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Pricing Configuration</h2>
                </div>

                {pricingError && (
                  <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                    <p className="text-sm text-red-400">{pricingError}</p>
                  </div>
                )}

                {pricingLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pricingConfig.map((config) => (
                      <PricingRow
                        key={config.access_level}
                        config={config}
                        onUpdate={handlePricingUpdate}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Billing Records */}
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Billing Records</h2>
                <div className="text-sm text-white/60 text-center py-8">
                  Billing history coming soon...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// PRICING ROW COMPONENT
// =============================================================================

interface PricingRowProps {
  config: PricingConfig;
  onUpdate: (accessLevel: string, newPrice: number) => Promise<void>;
}

function PricingRow({ config, onUpdate }: PricingRowProps) {
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState(config.base_price_usd.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      alert('Please enter a valid price');
      return;
    }

    setSaving(true);
    try {
      await onUpdate(config.access_level, price);
      setEditing(false);
    } catch (err) {
      console.error('[PricingRow] Error saving:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
      <div className="flex-1">
        <div className="font-medium text-white capitalize">{config.access_level.replace('_', ' ')}</div>
        {config.description && (
          <div className="text-xs text-white/60 mt-1">{config.description}</div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {editing ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60">$</span>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                step="0.01"
                min="0"
                className="w-24 px-2 py-1 text-sm bg-black/40 border border-white/10 rounded text-white"
                disabled={saving}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setNewPrice(config.base_price_usd.toString());
              }}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium border border-white/10 rounded text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold text-white">
              ${config.base_price_usd.toFixed(2)}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-xs font-medium border border-white/10 rounded text-white hover:bg-white/10 transition-colors"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArcAdminHomeProps> = async (context) => {
  // Check super admin access
  // requireSuperAdmin returns null if authorized, or redirect object if not
  const superAdminCheck = await requireSuperAdmin(context);
  if (superAdminCheck !== null) {
    // Not authorized - return redirect
    return superAdminCheck;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Query project_arc_settings joined with projects
    const { data: arcSettingsData, error: arcSettingsError } = await supabase
      .from('project_arc_settings')
      .select(`
        project_id,
        tier,
        status,
        security_status,
        meta,
        projects (
          id,
          slug,
          name,
          twitter_username
        )
      `)
      .eq('is_arc_enabled', true);

    if (arcSettingsError) {
      console.error('[ArcAdminHome] Supabase error:', arcSettingsError);
      return {
        props: {
          projects: [],
          error: 'Failed to load ARC projects',
        },
      };
    }

    if (!arcSettingsData || arcSettingsData.length === 0) {
      return {
        props: {
          projects: [],
          error: null,
        },
      };
    }

    // Get project IDs to count arenas
    const projectIds = arcSettingsData.map((row: any) => row.project_id);

    // Count arenas per project
    const { data: arenasData } = await supabase
      .from('arenas')
      .select('project_id')
      .in('project_id', projectIds);

    const arenasCountByProject = new Map<string, number>();
    if (arenasData) {
      for (const arena of arenasData) {
        const count = arenasCountByProject.get(arena.project_id) || 0;
        arenasCountByProject.set(arena.project_id, count + 1);
      }
    }

    // Map data to response format
    const projects: ArcProject[] = arcSettingsData.map((row: any) => ({
      project_id: row.project_id,
      slug: row.projects?.slug ?? null,
      name: row.projects?.name ?? null,
      twitter_username: row.projects?.twitter_username ?? null,
      arc_tier: row.tier,
      arc_status: row.status,
      security_status: row.security_status,
      arenas_count: arenasCountByProject.get(row.project_id) || 0,
      meta: (row.meta as any) || {},
    }));

    return {
      props: {
        projects,
        error: null,
      },
    };
  } catch (error: any) {
    console.error('[ArcAdminHome] Error:', error);
    return {
      props: {
        projects: [],
        error: error.message || 'Internal server error',
      },
    };
  }
};
