/**
 * CRM Brands Home
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

interface Brand {
  id: string;
  name: string;
  x_handle: string | null;
  website: string | null;
  logo_url: string | null;
  brief_text: string | null;
}

export default function BrandsHome() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    xHandle: '',
    website: '',
    tgCommunity: '',
    tgChannel: '',
    briefText: '',
  });
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [bannerImage, setBannerImage] = useState<string | null>(null);

  const loadBrands = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/brands', { credentials: 'include' });
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
    loadBrands();
  }, []);

  useEffect(() => {
    if (router.query.create === '1') {
      setShowCreate(true);
    }
  }, [router.query.create]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.xHandle.trim()) return;
    try {
      const res = await fetch('/api/portal/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          logoImage,
          bannerImage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create brand');
      }
      setShowCreate(false);
      setForm({
        name: '',
        xHandle: '',
        website: '',
        tgCommunity: '',
        tgChannel: '',
        briefText: '',
      });
      setLogoImage(null);
      setBannerImage(null);
      loadBrands();
    } catch (err: any) {
      setError(err.message || 'Failed to create brand');
    }
  };

  const readImage = (file: File, onLoad: (result: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onLoad(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Brands</h1>
          <button
            onClick={() => setShowCreate((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
          >
            {showCreate ? 'Close' : 'Create Brand'}
          </button>
        </div>

        {showCreate && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4 space-y-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Brand name"
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            />
            <input
              value={form.xHandle}
              onChange={(e) => setForm({ ...form, xHandle: e.target.value })}
              placeholder="X handle (required)"
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            />
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="Website (optional)"
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-white/60">
                Logo Image
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 w-full text-xs text-white/70"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      readImage(file, setLogoImage);
                    }
                  }}
                />
              </label>
              <label className="text-xs text-white/60">
                Banner Image
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 w-full text-xs text-white/70"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      readImage(file, setBannerImage);
                    }
                  }}
                />
              </label>
            </div>
            <textarea
              value={form.briefText}
              onChange={(e) => setForm({ ...form, briefText: e.target.value })}
              placeholder="Brief / overview"
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            />
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={!form.name.trim() || !form.xHandle.trim()}
                className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Brand
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-white/60">Loading brands...</div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadBrands} />
        ) : brands.length === 0 ? (
          <EmptyState
            icon="🏷️"
            title="No brands yet"
            description="Create a brand profile to launch quests."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href={`/portal/arc/brands/${brand.id}`}
                className="rounded-lg border border-white/10 bg-black/40 p-4 hover:border-white/20 transition-colors"
              >
                <div className="text-white font-medium">{brand.name}</div>
                {brand.x_handle && (
                  <div className="text-xs text-white/60">@{brand.x_handle.replace(/^@+/, '')}</div>
                )}
                {brand.brief_text && (
                  <div className="text-xs text-white/50 mt-2 line-clamp-2">{brand.brief_text}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
