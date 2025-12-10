/**
 * Super Admin User Detail Page
 * 
 * View and manage user details, roles, feature grants, and access requests.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin, FEATURE_KEYS, type FeatureGrant } from '@/lib/permissions';
import { getUserTier, type UserTier } from '@/lib/userTier';

// =============================================================================
// TYPES
// =============================================================================

interface UserDetail {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  xUsername: string | null;
  xUserId: string | null;
  roles: string[];
}

// FeatureGrant type from permissions.ts uses Date | null for dates
// But API returns ISO strings, so we use a compatible type for API responses
type FeatureGrantResponse = Omit<FeatureGrant, 'startsAt' | 'endsAt'> & {
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

interface AccessRequest {
  id: string;
  featureKey: string;
  requestedPlan: string | null;
  justification: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface UserDetailData {
  user: UserDetail;
  featureGrants: FeatureGrantResponse[];
  accessRequests: AccessRequest[];
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateInput(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  // Format as YYYY-MM-DD for date input
  return date.toISOString().split('T')[0];
}

function getFeatureLabel(featureKey: string): string {
  switch (featureKey) {
    case FEATURE_KEYS.DeepExplorer:
      return 'Deep Explorer';
    case FEATURE_KEYS.InstitutionalPlus:
      return 'Institutional Plus';
    case FEATURE_KEYS.DeepAnalyticsAddon:
      return 'Deep Analytics Addon';
    default:
      return featureKey;
  }
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'admin':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'analyst':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
}

function isGrantActive(grant: FeatureGrantResponse | null): boolean {
  if (!grant) return false;
  const now = new Date();
  const startsAt = grant.startsAt ? new Date(grant.startsAt) : null;
  const endsAt = grant.endsAt ? new Date(grant.endsAt) : null;

  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
}

/**
 * Compute user tier from feature grants (for display in admin)
 */
function computeTierFromGrants(grants: FeatureGrantResponse[]): UserTier {
  const now = new Date();
  const activeGrants = grants.filter(g => isGrantActive(g)).map(g => g.featureKey);

  // Check for Institutional Plus features
  if (activeGrants.includes('deep.explorer') || activeGrants.includes('institutional.plus')) {
    return 'institutional_plus';
  }

  // Check for Analyst features
  if (activeGrants.includes('markets.analytics') || activeGrants.includes('sentiment.compare') || activeGrants.includes('sentiment.search')) {
    return 'analyst';
  }

  return 'seer';
}

function getTierColor(tier: UserTier): string {
  switch (tier) {
    case 'institutional_plus':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    case 'analyst':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'seer':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminUserDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const akariUser = useAkariUser();
  const [data, setData] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantErrors, setGrantErrors] = useState<Record<string, string>>({});
  const [grantSuccess, setGrantSuccess] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [grantDates, setGrantDates] = useState<Record<string, { startsAt: string; endsAt: string }>>({});
  const [grantDiscounts, setGrantDiscounts] = useState<Record<string, { discountPercent: number; discountNote: string }>>({});
  const [selectedTier, setSelectedTier] = useState<UserTier>('seer');
  const [tierProcessing, setTierProcessing] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);
  const [tierSuccess, setTierSuccess] = useState<string | null>(null);
  const [deepAnalyticsAddon, setDeepAnalyticsAddon] = useState(false);
  const [addonProcessing, setAddonProcessing] = useState(false);
  const [addonError, setAddonError] = useState<string | null>(null);
  const [addonSuccess, setAddonSuccess] = useState<string | null>(null);

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Load data
  useEffect(() => {
    if (!userIsSuperAdmin || !id || typeof id !== 'string') {
      setLoading(false);
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIsSuperAdmin, id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/admin/users/${id}`);
      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to load user detail');
      }

      const grants: FeatureGrantResponse[] = result.featureGrants || [];
      setData({
        user: result.user,
        featureGrants: grants,
        accessRequests: result.accessRequests || [],
      });

      // Compute and set current tier
      const currentTier = computeTierFromGrants(grants);
      setSelectedTier(currentTier);

      // Check if user has Deep Analytics addon
      const now = new Date();
      const addonGrant = grants.find((g: FeatureGrantResponse) => g.featureKey === FEATURE_KEYS.DeepAnalyticsAddon);
      const hasAddon = addonGrant && isGrantActive(addonGrant);
      setDeepAnalyticsAddon(hasAddon || false);

      // Initialize grant dates and discounts from existing grants (always initialize both features)
      const dates: Record<string, { startsAt: string; endsAt: string }> = {};
      const discounts: Record<string, { discountPercent: number; discountNote: string }> = {};
      for (const featureKey of [FEATURE_KEYS.DeepExplorer, FEATURE_KEYS.InstitutionalPlus]) {
        const grant = grants.find((g: FeatureGrantResponse) => g.featureKey === featureKey);
        dates[featureKey] = {
          startsAt: formatDateInput(grant?.startsAt || null),
          endsAt: formatDateInput(grant?.endsAt || null),
        };
        discounts[featureKey] = {
          discountPercent: grant?.discountPercent || 0,
          discountNote: grant?.discountNote || '',
        };
      }
      setGrantDates(dates);
      setGrantDiscounts(discounts);
    } catch (err: any) {
      setError(err.message || 'Failed to load user detail.');
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async (featureKey: string, startsAt: string | null, endsAt: string | null, discountPercent: number, discountNote: string | null) => {
    if (!id || typeof id !== 'string') return;
    if (processing[featureKey]) return;

    setProcessing((prev) => ({ ...prev, [featureKey]: true }));
    setGrantErrors((prev) => {
      const next = { ...prev };
      delete next[featureKey];
      return next;
    });
    setGrantSuccess((prev) => {
      const next = { ...prev };
      delete next[featureKey];
      return next;
    });

    try {
      const res = await fetch(`/api/portal/admin/users/${id}/feature-grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey, startsAt, endsAt, discountPercent, discountNote }),
      });

      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to update grant');
      }

      setGrantSuccess((prev) => ({ ...prev, [featureKey]: 'Grant updated successfully' }));
      // Reload data
      await loadData();
    } catch (err: any) {
      setGrantErrors((prev) => ({ ...prev, [featureKey]: err.message || 'Failed to update grant' }));
    } finally {
      setProcessing((prev) => ({ ...prev, [featureKey]: false }));
    }
  };

  const handleRevoke = async (featureKey: string) => {
    if (!id || typeof id !== 'string') return;
    if (processing[featureKey]) return;

    if (!confirm(`Are you sure you want to revoke ${getFeatureLabel(featureKey)} access?`)) {
      return;
    }

    setProcessing((prev) => ({ ...prev, [featureKey]: true }));
    setGrantErrors((prev) => {
      const next = { ...prev };
      delete next[featureKey];
      return next;
    });
    setGrantSuccess((prev) => {
      const next = { ...prev };
      delete next[featureKey];
      return next;
    });

    try {
      const res = await fetch(`/api/portal/admin/users/${id}/feature-grants?featureKey=${featureKey}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to revoke grant');
      }

      setGrantSuccess((prev) => ({ ...prev, [featureKey]: 'Grant revoked successfully' }));
      // Reload data
      await loadData();
    } catch (err: any) {
      setGrantErrors((prev) => ({ ...prev, [featureKey]: err.message || 'Failed to revoke grant' }));
    } finally {
      setProcessing((prev) => ({ ...prev, [featureKey]: false }));
    }
  };

  const handleTierChange = async () => {
    if (!id || typeof id !== 'string') return;
    if (tierProcessing) return;

    setTierProcessing(true);
    setTierError(null);
    setTierSuccess(null);

    try {
      const res = await fetch(`/api/portal/admin/users/${id}/tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier }),
      });

      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to update tier');
      }

      setTierSuccess('Access level updated successfully');
      // Reload data to reflect changes
      await loadData();
    } catch (err: any) {
      setTierError(err.message || 'Failed to update tier');
    } finally {
      setTierProcessing(false);
    }
  };

  const handleAddonChange = async () => {
    if (!id || typeof id !== 'string') return;
    if (addonProcessing) return;

    setAddonProcessing(true);
    setAddonError(null);
    setAddonSuccess(null);

    try {
      const res = await fetch(`/api/portal/admin/users/${id}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deepAnalyticsAddon }),
      });

      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to update addon');
      }

      setAddonSuccess(`Deep Analytics addon ${deepAnalyticsAddon ? 'enabled' : 'disabled'} successfully`);
      // Reload data to reflect changes
      await loadData();
    } catch (err: any) {
      setAddonError(err.message || 'Failed to update addon');
    } finally {
      setAddonProcessing(false);
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="User Detail">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <PortalLayout title="User Detail">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="User Detail">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Breadcrumb */}
        <Link
          href="/portal/admin/overview"
          className="mb-4 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-akari-primary transition"
        >
          ← Back to Admin Overview
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">User Detail</h1>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">Loading user detail...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* User Header */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Avatar */}
                {data.user.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.displayName || 'User'}
                    className="w-16 h-16 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                    <span className="text-2xl text-slate-400">
                      {(data.user.displayName || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-white mb-1">
                    {data.user.displayName || 'Unknown User'}
                  </h2>
                  {data.user.xUsername && (
                    <p className="text-sm text-slate-400 mb-2">@{data.user.xUsername}</p>
                  )}
                  <p className="text-xs text-slate-500 font-mono mb-2">ID: {data.user.id}</p>
                  <p className="text-xs text-slate-400 mb-3">
                    Created: {formatDate(data.user.createdAt)}
                  </p>

                  {/* Roles */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {data.user.roles.length > 0 ? (
                      data.user.roles.map((role) => (
                        <span
                          key={role}
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getRoleColor(role)}`}
                        >
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium border bg-slate-500/20 text-slate-400 border-slate-500/50">
                        No roles
                      </span>
                    )}
                  </div>

                  {/* Current Tier Display */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Current Tier:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTierColor(computeTierFromGrants(data.featureGrants))}`}>
                      {computeTierFromGrants(data.featureGrants).charAt(0).toUpperCase() + computeTierFromGrants(data.featureGrants).slice(1).replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tier Control */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4">Access Level</h2>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400">Tier</label>
                  <div className="flex flex-col gap-2">
                    {(['seer', 'analyst', 'institutional_plus'] as UserTier[]).map((tier) => (
                      <label key={tier} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tier"
                          value={tier}
                          checked={selectedTier === tier}
                          onChange={(e) => setSelectedTier(e.target.value as UserTier)}
                          className="w-4 h-4 text-akari-primary bg-slate-800 border-slate-700 focus:ring-akari-primary focus:ring-2"
                        />
                        <span className="text-sm text-white capitalize">
                          {tier.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleTierChange}
                  disabled={tierProcessing || selectedTier === computeTierFromGrants(data.featureGrants)}
                  className="px-4 py-2 min-h-[36px] rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tierProcessing ? 'Processing...' : 'Save'}
                </button>

                {/* Messages */}
                {tierError && (
                  <p className="text-xs text-red-400">{tierError}</p>
                )}
                {tierSuccess && (
                  <p className="text-xs text-green-400">{tierSuccess}</p>
                )}
              </div>
            </div>

            {/* Addons Control */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4">Addons</h2>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deepAnalyticsAddon}
                      onChange={(e) => setDeepAnalyticsAddon(e.target.checked)}
                      className="w-4 h-4 text-akari-primary bg-slate-800 border-slate-700 rounded focus:ring-akari-primary focus:ring-2"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">Deep Analytics</span>
                      <p className="text-xs text-slate-400 mt-1">
                        Gives this user access to project-level Twitter Analytics and CSV export, even if they are Seer.
                      </p>
                    </div>
                  </label>
                </div>

                <button
                  onClick={handleAddonChange}
                  disabled={addonProcessing}
                  className="px-4 py-2 min-h-[36px] rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addonProcessing ? 'Processing...' : 'Save'}
                </button>

                {/* Messages */}
                {addonError && (
                  <p className="text-xs text-red-400">{addonError}</p>
                )}
                {addonSuccess && (
                  <p className="text-xs text-green-400">{addonSuccess}</p>
                )}
              </div>
            </div>

            {/* Feature Grants Editor */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4">Feature Access</h2>

              {[FEATURE_KEYS.DeepExplorer, FEATURE_KEYS.InstitutionalPlus].map((featureKey) => {
                const grant: FeatureGrantResponse | null = data.featureGrants.find((g: FeatureGrantResponse) => g.featureKey === featureKey) || null;
                const active = isGrantActive(grant);
                const startsAt = grantDates[featureKey]?.startsAt || formatDateInput(grant?.startsAt || null);
                const endsAt = grantDates[featureKey]?.endsAt || formatDateInput(grant?.endsAt || null);
                const discountPercent = grantDiscounts[featureKey]?.discountPercent ?? (grant?.discountPercent || 0);
                const discountNote = grantDiscounts[featureKey]?.discountNote ?? (grant?.discountNote || '');

                return (
                  <div key={featureKey} className="mb-6 last:mb-0 pb-6 last:pb-0 border-b border-slate-800 last:border-0">
                    <div className="mb-3">
                      <h3 className="text-sm font-medium text-white mb-2">{getFeatureLabel(featureKey)}</h3>
                      <div className="text-xs text-slate-400 space-y-1">
                        {grant ? (
                          <>
                            <p>
                              Status:{' '}
                              <span className={active ? 'text-green-400' : 'text-yellow-400'}>
                                {active ? 'Active' : 'Expired'}
                              </span>
                            </p>
                            <p>Starts: {formatDate(grant.startsAt)}</p>
                            <p>Ends: {grant.endsAt ? formatDate(grant.endsAt) : 'No expiry'}</p>
                            <p>
                              Discount: <span className="text-akari-primary">{grant.discountPercent || 0}%</span>
                            </p>
                            {grant.discountNote && (
                              <p className="text-slate-500 italic">Note: {grant.discountNote}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-slate-500">Not granted</p>
                        )}
                      </div>
                    </div>

                    {/* Grant Form */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={startsAt}
                            onChange={(e) =>
                              setGrantDates((prev) => ({
                                ...prev,
                                [featureKey]: { ...prev[featureKey], startsAt: e.target.value, endsAt: endsAt },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">End Date (optional)</label>
                          <input
                            type="date"
                            value={endsAt}
                            onChange={(e) =>
                              setGrantDates((prev) => ({
                                ...prev,
                                [featureKey]: { ...prev[featureKey], startsAt: startsAt, endsAt: e.target.value },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Discount %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={discountPercent}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              setGrantDiscounts((prev) => ({
                                ...prev,
                                [featureKey]: { ...prev[featureKey], discountPercent: value, discountNote: discountNote },
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Internal Note</label>
                          <input
                            type="text"
                            value={discountNote}
                            onChange={(e) =>
                              setGrantDiscounts((prev) => ({
                                ...prev,
                                [featureKey]: { ...prev[featureKey], discountPercent: discountPercent, discountNote: e.target.value },
                              }))
                            }
                            placeholder="Reason for discount (optional)"
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const currentStartsAt = grantDates[featureKey]?.startsAt || '';
                            const currentEndsAt = grantDates[featureKey]?.endsAt || '';
                            const currentDiscountPercent = grantDiscounts[featureKey]?.discountPercent ?? discountPercent;
                            const currentDiscountNote = grantDiscounts[featureKey]?.discountNote ?? discountNote;
                            handleGrant(
                              featureKey,
                              currentStartsAt || null,
                              currentEndsAt || null,
                              currentDiscountPercent,
                              currentDiscountNote || null
                            );
                          }}
                          disabled={processing[featureKey]}
                          className="px-4 py-2 min-h-[36px] rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processing[featureKey] ? 'Processing...' : grant ? 'Update Grant' : 'Grant Access'}
                        </button>
                        {grant && (
                          <button
                            onClick={() => handleRevoke(featureKey)}
                            disabled={processing[featureKey]}
                            className="px-4 py-2 min-h-[36px] rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processing[featureKey] ? 'Processing...' : 'Remove'}
                          </button>
                        )}
                      </div>

                      {/* Messages */}
                      {grantErrors[featureKey] && (
                        <p className="text-xs text-red-400">{grantErrors[featureKey]}</p>
                      )}
                      {grantSuccess[featureKey] && (
                        <p className="text-xs text-green-400">{grantSuccess[featureKey]}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Access Requests History */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-white mb-4">Access Requests</h2>
              {data.accessRequests.length === 0 ? (
                <p className="text-xs text-slate-400">No access requests for this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                          Feature
                        </th>
                        <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                          Requested Plan
                        </th>
                        <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                          Status
                        </th>
                        <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                          Created
                        </th>
                        <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                          Decided
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accessRequests.map((request) => (
                        <tr
                          key={request.id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-2 px-3 text-white">
                            {getFeatureLabel(request.featureKey)}
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {request.requestedPlan || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                request.status === 'approved'
                                  ? 'bg-green-500/20 text-green-400'
                                  : request.status === 'rejected'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-yellow-500/20 text-yellow-400'
                              }`}
                            >
                              {request.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {formatDate(request.createdAt)}
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {request.decidedAt ? formatDate(request.decidedAt) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}

