import React, { useEffect, useState } from 'react';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';

export default function SuperAdminBrands() {
  const akariUser = useAkariUser();
  const canAccess = isSuperAdmin(akariUser.user);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/superadmin/brands', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load verifications');
      setBrands(data.brands || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load verifications');
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess]);

  const updateStatus = async (brandId: string, status: string) => {
    await fetch('/api/portal/superadmin/brands', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ brandId, status }),
    });
    load();
  };

  if (!canAccess) {
    return (
      <ArcPageShell hideRightRail>
        <ErrorState message="Superadmin access required." />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell hideRightRail>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Brand Verification</h1>
          <p className="text-sm text-white/60">Approve or reject new brand profiles.</p>
        </div>

        {loading ? (
          <div className="text-sm text-white/60">Loading verifications...</div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : brands.length === 0 ? (
          <EmptyState icon="✅" title="No pending brands" description="All brand verifications are up to date." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <div key={brand.id} className="rounded-xl border border-white/10 bg-black/40 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Brand</div>
                    <div className="text-base font-semibold text-white">{brand.name}</div>
                    {brand.x_handle && (
                      <div className="text-xs text-white/50">@{brand.x_handle.replace(/^@+/, '')}</div>
                    )}
                  </div>
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name} className="w-10 h-10 rounded-full border border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                      {(brand.name || 'B').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-xs text-white/40">
                  Requested: {brand.verification_requested_at ? new Date(brand.verification_requested_at).toLocaleDateString() : 'n/a'}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => updateStatus(brand.id, 'approved')}
                    className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded-lg"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateStatus(brand.id, 'rejected')}
                    className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded-lg"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
