import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../../../components/portal/PortalLayout';

interface Investor {
  id: string;
  name: string;
  slug: string;
  websiteUrl?: string;
  tier?: string;
  notes?: string;
}

interface Props {
  userLevel: string;
}

export default function AdminLeadInvestorsPage({ userLevel }: Props) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    websiteUrl: '',
    tier: '',
    notes: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = userLevel === 'SUPER_ADMIN';

  useEffect(() => {
    if (isSuperAdmin) {
      loadInvestors();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const loadInvestors = async () => {
    try {
      const res = await fetch('/api/portal/admin/lead-investors');
      const json = await res.json();
      if (json.ok) {
        setInvestors(json.investors);
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to load investors' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load investors' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = '/api/portal/admin/lead-investors';
      const payload = editingId ? { id: editingId, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.ok) {
        setMessage({ type: 'success', text: `Investor ${editingId ? 'updated' : 'created'} successfully!` });
        resetForm();
        loadInvestors();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to save investor' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save investor' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      websiteUrl: '',
      tier: '',
      notes: '',
    });
    setEditingId(null);
  };

  const handleEdit = (investor: Investor) => {
    setEditingId(investor.id);
    setFormData({
      name: investor.name,
      slug: investor.slug,
      websiteUrl: investor.websiteUrl || '',
      tier: investor.tier || '',
      notes: investor.notes || '',
    });
  };

  if (!isSuperAdmin) {
    return (
      <PortalLayout>
        <Head>
          <title>Lead Investors - Admin - Akari Mystic Club</title>
        </Head>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 text-center">
          <p className="text-akari-muted">Super admins only. You do not have access to this page.</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Admin – Lead Investors">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Admin – Lead Investors</h1>
        <p className="text-sm text-akari-muted">Manage lead investor master data.</p>
      </section>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm mb-4 ${
            message.type === 'success'
              ? 'bg-akari-primary/20 text-akari-primary'
              : 'bg-akari-danger/20 text-akari-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {/* Form */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6">
          <h3 className="text-lg font-semibold mb-4 text-akari-text">
            {editingId ? 'Edit Investor' : 'Create New Investor'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">Slug</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="Auto-generated if empty"
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">Website URL</label>
              <input
                type="url"
                value={formData.websiteUrl}
                onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">Tier</label>
              <input
                type="text"
                value={formData.tier}
                onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                placeholder="e.g. Tier 1, Tier 2"
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div>
              <label className="block text-xs text-akari-muted mb-1 font-medium">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full bg-akari-cardSoft border border-akari-border rounded-lg px-3 py-2 text-sm text-akari-text"
              />
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-akari-primary rounded-full text-xs font-medium text-black shadow-akari-glow hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-akari-muted text-akari-muted rounded-full text-xs font-medium hover:text-akari-text hover:border-akari-text transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6">
          <h3 className="text-lg font-semibold mb-4 text-akari-text">Existing Investors</h3>
          {loading ? (
            <p className="text-akari-muted text-sm">Loading...</p>
          ) : investors.length === 0 ? (
            <p className="text-akari-muted text-sm">No investors created yet.</p>
          ) : (
            <div className="space-y-3">
              {investors.map((investor) => (
                <div
                  key={investor.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-akari-cardSoft border border-akari-border"
                >
                  <div>
                    <p className="text-sm font-medium text-akari-text">{investor.name}</p>
                    <p className="text-xs text-akari-muted">
                      {investor.tier && `${investor.tier} • `}
                      {investor.websiteUrl || 'No website'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleEdit(investor)}
                    className="px-3 py-1 text-xs text-akari-primary border border-akari-primary/30 rounded-full hover:bg-akari-primary/10 transition"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  // In development, allow access by default
  // In production, this should extract user level from session/auth
  const userLevel = process.env.NODE_ENV === 'development' ? 'SUPER_ADMIN' : 'L1';
  
  return {
    props: {
      userLevel,
    },
  };
};

