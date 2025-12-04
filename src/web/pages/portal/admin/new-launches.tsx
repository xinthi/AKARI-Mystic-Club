import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { prisma, withDbRetry } from '@/lib/prisma';

interface LaunchListItem {
  id: string;
  name: string;
  tokenSymbol: string;
  platformName: string | null;
  createdAt: string;
}

interface Platform {
  id: string;
  name: string;
  slug: string;
  kind?: 'LAUNCHPAD' | 'CEX' | 'DEX' | 'OTHER';
}

interface Investor {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  launches: LaunchListItem[];
  platforms: Platform[];
  investors: Investor[];
  userLevel: string;
}

export default function AdminNewLaunchesPage({ launches: initialLaunches, platforms: initialPlatforms, investors: initialInvestors, userLevel }: Props) {
  const [launches, setLaunches] = useState(initialLaunches);
  const [platforms] = useState(initialPlatforms);
  const [investors] = useState(initialInvestors);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tokenSymbol: '',
    tokenName: '',
    platformId: '', // Legacy
    primaryPlatformId: '',
    listingPlatformId: '',
    leadInvestorId: '',
    salePriceUsd: '',
    totalRaiseUsd: '',
    tokensForSale: '',
    chain: '',
    category: '',
    status: '',
    tokenAddress: '',
    priceSource: '',
    airdropPercent: '',
    airdropValueUsd: '',
    vestingInfo: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetForm = () => {
    setFormData({
      name: '',
      tokenSymbol: '',
      tokenName: '',
      platformId: '',
      primaryPlatformId: '',
      listingPlatformId: '',
      leadInvestorId: '',
      salePriceUsd: '',
      totalRaiseUsd: '',
      tokensForSale: '',
      chain: '',
      category: '',
      status: '',
      tokenAddress: '',
      priceSource: '',
      airdropPercent: '',
      airdropValueUsd: '',
      vestingInfo: '',
    });
    setEditingId(null);
  };

  const loadLaunches = async () => {
    try {
      const res = await fetch('/api/portal/admin/new-launches');
      const json = await res.json();
      if (json.ok) {
        setLaunches(json.launches);
      }
    } catch (error) {
      console.error('Failed to load launches:', error);
    }
  };

  const handleEdit = async (launch: LaunchListItem) => {
    setEditingId(launch.id);
    setLoading(true);
    try {
      // Fetch full launch data including new fields
      const res = await fetch(`/api/portal/new-launches/${launch.id}`);
      const json = await res.json();
      if (json.ok && json.launch) {
        const fullLaunch = json.launch;
        setFormData({
          name: fullLaunch.name || '',
          tokenSymbol: fullLaunch.tokenSymbol || '',
          tokenName: fullLaunch.tokenName || '',
          platformId: fullLaunch.platformId || '',
          primaryPlatformId: fullLaunch.primaryPlatformId || '',
          listingPlatformId: fullLaunch.listingPlatformId || '',
          leadInvestorId: fullLaunch.leadInvestorId || '',
          salePriceUsd: fullLaunch.salePriceUsd?.toString() || '',
          totalRaiseUsd: fullLaunch.totalRaiseUsd?.toString() || '',
          tokensForSale: fullLaunch.tokensForSale?.toString() || '',
          chain: fullLaunch.chain || '',
          category: fullLaunch.category || '',
          status: fullLaunch.status || '',
          tokenAddress: fullLaunch.tokenAddress || '',
          priceSource: fullLaunch.priceSource || '',
          airdropPercent: fullLaunch.airdropPercent?.toString() || '',
          airdropValueUsd: fullLaunch.airdropValueUsd?.toString() || '',
          vestingInfo: fullLaunch.vestingInfo ? JSON.stringify(fullLaunch.vestingInfo, null, 2) : '',
        });
      } else {
        // Fallback to basic data if API fails
        setFormData({
          name: launch.name,
          tokenSymbol: launch.tokenSymbol,
          tokenName: '',
          platformId: '',
          primaryPlatformId: '',
          listingPlatformId: '',
          leadInvestorId: '',
          salePriceUsd: '',
          totalRaiseUsd: '',
          tokensForSale: '',
          chain: '',
          category: '',
          status: '',
          tokenAddress: '',
          priceSource: '',
          airdropPercent: '',
          airdropValueUsd: '',
          vestingInfo: '',
        });
      }
    } catch (error) {
      console.error('Failed to load launch details:', error);
      // Fallback to basic data
      setFormData({
        name: launch.name,
        tokenSymbol: launch.tokenSymbol,
        tokenName: '',
        platformId: '',
        primaryPlatformId: '',
        listingPlatformId: '',
        leadInvestorId: '',
        salePriceUsd: '',
        totalRaiseUsd: '',
        tokensForSale: '',
        chain: '',
        category: '',
        status: '',
        tokenAddress: '',
        priceSource: '',
        airdropPercent: '',
        airdropValueUsd: '',
        vestingInfo: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const url = '/api/portal/admin/new-launches';
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (json.ok) {
        setMessage({ type: 'success', text: editingId ? 'Launch updated!' : 'Launch created!' });
        resetForm();
        await loadLaunches();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to save launch' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save launch' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLayout title="Admin – New Launches">
      {/* Warning Banner */}
      <div className="rounded-2xl border border-akari-profit/30 bg-akari-cardSoft p-4 mb-6">
        <p className="text-xs text-akari-muted">
          <strong className="text-akari-profit">Admin only.</strong> Data is community-contributed. Use carefully.
        </p>
      </div>

      {/* Header */}
      <section className="mb-6">
        <Link
          href="/portal/new-launches"
          className="text-akari-primary hover:text-akari-accent mb-4 inline-block text-sm"
        >
          ← Back to Launches
        </Link>
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Admin – New Launches</h1>
        <p className="text-sm text-akari-muted">Manage launches, platforms, and user levels</p>
      </section>

      {/* Message */}
      {message && (
        <div
          className={`rounded-2xl border p-4 mb-6 ${
            message.type === 'success'
              ? 'border-akari-profit/30 bg-akari-profit/10 text-akari-profit'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6 max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold mb-4 text-akari-text">
          {editingId ? 'Edit Launch' : 'Create New Launch'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Basic Info */}
            <div className="md:col-span-2">
              <h4 className="text-sm font-medium text-akari-text mb-3">Basic Information</h4>
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Token Symbol *
              </label>
              <input
                type="text"
                required
                value={formData.tokenSymbol}
                onChange={(e) => setFormData({ ...formData, tokenSymbol: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Token Name
              </label>
              <input
                type="text"
                value={formData.tokenName}
                onChange={(e) => setFormData({ ...formData, tokenName: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Sale Platform
              </label>
              <select
                value={formData.primaryPlatformId}
                onChange={(e) => setFormData({ ...formData, primaryPlatformId: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              >
                <option value="">None</option>
                {['LAUNCHPAD', 'CEX', 'DEX', 'OTHER'].map((kind) => {
                  const kindPlatforms = platforms.filter((p) => p.kind === kind);
                  if (kindPlatforms.length === 0) return null;
                  return (
                    <optgroup key={kind} label={kind}>
                      {kindPlatforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Listing Platform
              </label>
              <select
                value={formData.listingPlatformId}
                onChange={(e) => setFormData({ ...formData, listingPlatformId: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              >
                <option value="">None</option>
                {['LAUNCHPAD', 'CEX', 'DEX', 'OTHER'].map((kind) => {
                  const kindPlatforms = platforms.filter((p) => p.kind === kind);
                  if (kindPlatforms.length === 0) return null;
                  return (
                    <optgroup key={kind} label={kind}>
                      {kindPlatforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Lead Investor
              </label>
              <select
                value={formData.leadInvestorId}
                onChange={(e) => setFormData({ ...formData, leadInvestorId: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              >
                <option value="">None</option>
                {investors.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Sale Price (USD)
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.salePriceUsd}
                onChange={(e) => setFormData({ ...formData, salePriceUsd: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Total Raise (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.totalRaiseUsd}
                onChange={(e) => setFormData({ ...formData, totalRaiseUsd: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Tokens for Sale
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.tokensForSale}
                onChange={(e) => setFormData({ ...formData, tokensForSale: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Chain
              </label>
              <input
                type="text"
                placeholder="ETH, BSC, SOL, TON"
                value={formData.chain}
                onChange={(e) => setFormData({ ...formData, chain: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Category
              </label>
              <input
                type="text"
                placeholder="IDO, IEO, LAUNCHPAD, AIRDROP"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Status
              </label>
              <input
                type="text"
                placeholder="UPCOMING, SALE, LISTED"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Token Address
              </label>
              <input
                type="text"
                value={formData.tokenAddress}
                onChange={(e) => setFormData({ ...formData, tokenAddress: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Price Source
              </label>
              <input
                type="text"
                placeholder="DEXSCREENER, OKX, BINANCE"
                value={formData.priceSource}
                onChange={(e) => setFormData({ ...formData, priceSource: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Airdrop %
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.airdropPercent}
                onChange={(e) => setFormData({ ...formData, airdropPercent: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">
                Airdrop Value (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.airdropValueUsd}
                onChange={(e) => setFormData({ ...formData, airdropValueUsd: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-akari-muted mb-1 font-medium">
              Vesting Info (JSON)
            </label>
            <textarea
              value={formData.vestingInfo}
              onChange={(e) => setFormData({ ...formData, vestingInfo: e.target.value })}
              rows={4}
              placeholder='{"round1": {"unlock": "2024-01-01", "percent": 25}, ...}'
              className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text font-mono text-xs"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-akari-primary rounded-full text-xs font-medium text-black shadow-akari-glow hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : editingId ? 'Update Launch' : 'Create Launch'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-akari-border rounded-full text-xs font-medium text-akari-muted hover:text-akari-text transition"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Launches List */}
      <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold mb-4 text-akari-text">
          Existing Launches
        </h3>
        {launches.length === 0 ? (
          <p className="text-sm text-akari-muted">No launches yet.</p>
        ) : (
          <div className="space-y-2">
            {launches.map((launch) => (
              <div
                key={launch.id}
                className="flex items-center justify-between p-3 rounded-lg bg-akari-cardSoft border border-akari-border"
              >
                <div>
                  <p className="text-sm font-medium text-akari-text">
                    {launch.name} ({launch.tokenSymbol})
                  </p>
                  {launch.platformName && (
                    <p className="text-xs text-akari-muted">{launch.platformName}</p>
                  )}
                </div>
                <button
                  onClick={() => handleEdit(launch)}
                  className="px-3 py-1 text-xs text-akari-primary border border-akari-primary/30 rounded-full hover:bg-akari-primary/10 transition"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  try {
    const [launches, platforms, investors] = await Promise.all([
      withDbRetry(() =>
        prisma.newLaunch.findMany({
          select: {
            id: true,
            name: true,
            tokenSymbol: true,
            createdAt: true,
            platform: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      ),
      withDbRetry(() =>
        prisma.launchPlatform.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            kind: true,
          },
          orderBy: { name: 'asc' },
        })
      ),
      withDbRetry(() =>
        prisma.leadInvestor.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: { name: 'asc' },
        })
      ),
    ]);

    // In development, allow access by default
    // In production, this should extract user level from session/auth
    const userLevel = process.env.NODE_ENV === 'development' ? 'SUPER_ADMIN' : 'ADMIN';

    return {
      props: {
        launches: launches.map((l) => ({
          id: l.id,
          name: l.name,
          tokenSymbol: l.tokenSymbol,
          platformName: l.platform?.name || null,
          createdAt: l.createdAt.toISOString(),
        })),
        platforms: JSON.parse(JSON.stringify(platforms)),
        investors: JSON.parse(JSON.stringify(investors)),
        userLevel,
      },
    };
  } catch (error) {
    console.error('[Admin New Launches] Error:', error);
    return {
      props: {
        launches: [],
        platforms: [],
        investors: [],
        userLevel: process.env.NODE_ENV === 'development' ? 'SUPER_ADMIN' : 'L1',
      },
    };
  }
};
