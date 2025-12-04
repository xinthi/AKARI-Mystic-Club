import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
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
}

interface Props {
  launches: LaunchListItem[];
  platforms: Platform[];
}

export default function AdminNewLaunchesPage({ launches: initialLaunches, platforms: initialPlatforms }: Props) {
  const [launches, setLaunches] = useState(initialLaunches);
  const [platforms] = useState(initialPlatforms);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tokenSymbol: '',
    tokenName: '',
    platformId: '',
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

  const handleEdit = (launch: LaunchListItem) => {
    // For now, just set editing ID - in production, fetch full launch data
    setEditingId(launch.id);
    setFormData({
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      tokenName: '',
      platformId: '',
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
    <PortalLayout>
      <Head>
        <title>Admin - New Launches - Akari Mystic Club</title>
      </Head>

      {/* Header */}
      <section className="mb-6">
        <Link
          href="/portal/new-launches"
          className="text-akari-primary hover:text-akari-accent mb-4 inline-block text-sm"
        >
          ← Back to Launches
        </Link>
        <h2 className="text-xl font-semibold mb-2">Admin Panel</h2>
        <p className="text-sm text-akari-muted">Manage launches, platforms, and user levels</p>
      </section>

      {/* Warning */}
      <div className="rounded-2xl border border-akari-profit/30 bg-akari-cardSoft p-4 mb-6">
        <p className="text-xs text-akari-muted">
          <strong className="text-akari-profit">Admin only</strong> – data is community-contributed.
          Use carefully.
        </p>
      </div>

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
      <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
        <h3 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">
          {editingId ? 'Edit Launch' : 'Create New Launch'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
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
                Platform
              </label>
              <select
                value={formData.platformId}
                onChange={(e) => setFormData({ ...formData, platformId: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              >
                <option value="">None</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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
      <div className="rounded-2xl border border-akari-border bg-akari-card p-6">
        <h3 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">
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

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const [launches, platforms] = await Promise.all([
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
          },
          orderBy: { name: 'asc' },
        })
      ),
    ]);

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
      },
    };
  } catch (error) {
    console.error('[Admin New Launches] Error:', error);
    return {
      props: {
        launches: [],
        platforms: [],
      },
    };
  }
};
