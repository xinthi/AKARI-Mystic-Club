/**
 * Admin Panel for New Launches
 * 
 * L2: Can create/edit launches
 * ADMIN: Can also manage platforms and user levels
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

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
    <>
      <Head>
        <title>Admin - New Launches - Akari Mystic Club</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link href="/portal/new-launches" className="text-purple-400 hover:text-purple-300 mb-4 inline-block">
              ← Back to Launches
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Admin Panel</h1>
            <p className="text-gray-300">Manage launches, platforms, and user levels</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-purple-500/20">
            <button
              onClick={() => setActiveTab('launches')}
              className={`px-6 py-3 font-semibold ${
                activeTab === 'launches'
                  ? 'border-b-2 border-purple-400 text-purple-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Launches
            </button>
            <button
              onClick={() => setActiveTab('platforms')}
              className={`px-6 py-3 font-semibold ${
                activeTab === 'platforms'
                  ? 'border-b-2 border-purple-400 text-purple-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Platforms (ADMIN)
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 font-semibold ${
                activeTab === 'users'
                  ? 'border-b-2 border-purple-400 text-purple-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              User Levels (ADMIN)
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <>
              {activeTab === 'launches' && (
                <div>
                  <div className="mb-6">
                    <button className="px-6 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500 transition-all">
                      + Create Launch
                    </button>
                  </div>
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                    <p className="text-gray-400">
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
                    <button className="px-6 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500 transition-all">
                      + Create Platform
                    </button>
                  </div>
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                    <p className="text-gray-400">
                      Platform management interface will be implemented here.
                      <br />
                      Only ADMIN users can create/edit/delete platforms.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'users' && (
                <div>
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                    <p className="text-gray-400">
                      User level management interface will be implemented here.
                      <br />
                      Only ADMIN users can change user levels (L1 ↔ L2, mark as ADMIN).
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

