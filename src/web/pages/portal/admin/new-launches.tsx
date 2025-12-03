/**
 * Admin Panel for New Launches
 * 
 * L2: Can create/edit launches
 * ADMIN: Can also manage platforms and user levels
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';

// This is a placeholder - in production, you'd fetch this from an API
// and check authentication/authorization
export default function AdminNewLaunchesPage() {
  const [activeTab, setActiveTab] = useState<'launches' | 'platforms' | 'users'>('launches');
  const [launches, setLaunches] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch data from API endpoints
    // For now, this is a placeholder UI
    setLoading(false);
  }, []);

  return (
    <PortalLayout>
      <Head>
        <title>Admin - New Launches - Akari Mystic Club</title>
      </Head>

      {/* Header */}
      <section className="mb-6">
        <Link href="/portal/new-launches" className="text-akari-primary hover:text-akari-accent mb-4 inline-block text-sm">
          ← Back to Launches
        </Link>
        <h2 className="text-xl font-semibold mb-2">Admin Panel</h2>
        <p className="text-sm text-akari-muted">Manage launches, platforms, and user levels</p>
      </section>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-akari-border">
        <button
          onClick={() => setActiveTab('launches')}
          className={`px-4 py-2 text-xs font-medium transition ${
            activeTab === 'launches'
              ? 'border-b-2 border-akari-primary text-akari-primary'
              : 'text-akari-muted hover:text-akari-text'
          }`}
        >
          Launches
        </button>
        <button
          onClick={() => setActiveTab('platforms')}
          className={`px-4 py-2 text-xs font-medium transition ${
            activeTab === 'platforms'
              ? 'border-b-2 border-akari-primary text-akari-primary'
              : 'text-akari-muted hover:text-akari-text'
          }`}
        >
          Platforms (ADMIN)
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-medium transition ${
            activeTab === 'users'
              ? 'border-b-2 border-akari-primary text-akari-primary'
              : 'text-akari-muted hover:text-akari-text'
          }`}
        >
          User Levels (ADMIN)
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-akari-muted">Loading...</div>
      ) : (
        <>
          {activeTab === 'launches' && (
            <div>
              <div className="mb-6">
                <button className="px-4 py-2 bg-akari-primary rounded-full text-xs font-medium text-black shadow-akari-glow hover:opacity-90 transition">
                  + Create Launch
                </button>
              </div>
              <div className="rounded-2xl border border-akari-border bg-akari-card p-6">
                <p className="text-sm text-akari-muted">
                  Launch management interface will be implemented here.
                  <br />
                  L2 users can create and edit launches.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'platforms' && (
            <div>
              <div className="mb-6">
                <button className="px-4 py-2 bg-akari-primary rounded-full text-xs font-medium text-black shadow-akari-glow hover:opacity-90 transition">
                  + Create Platform
                </button>
              </div>
              <div className="rounded-2xl border border-akari-border bg-akari-card p-6">
                <p className="text-sm text-akari-muted">
                  Platform management interface will be implemented here.
                  <br />
                  Only ADMIN users can create/edit/delete platforms.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div>
              <div className="rounded-2xl border border-akari-border bg-akari-card p-6">
                <p className="text-sm text-akari-muted">
                  User level management interface will be implemented here.
                  <br />
                  Only ADMIN users can change user levels (L1 ↔ L2, mark as ADMIN).
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </PortalLayout>
  );
}

