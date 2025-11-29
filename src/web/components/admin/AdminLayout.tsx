/**
 * Admin Layout Component
 * 
 * Provides consistent layout and navigation for all admin pages.
 */

import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isAdminLoggedIn, clearAdminToken } from '../../lib/admin-client';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '🏠' },
  { href: '/admin/treasury', label: 'Treasury', icon: '🏦' },
  { href: '/admin/myst', label: 'MYST Grant', icon: '💎' },
  { href: '/admin/wheel', label: 'Wheel Pool', icon: '🎡' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: '💸' },
  { href: '/admin/campaigns', label: 'Campaigns', icon: '📋' },
  { href: '/admin/leaderboard', label: 'Analytics', icon: '📊' },
  { href: '/admin/campaign-requests', label: 'Campaign Req', icon: '📝' },
  { href: '/admin/prediction-requests', label: 'Prediction Req', icon: '🎯' },
];

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(isAdminLoggedIn());
  }, []);

  const handleLogout = () => {
    clearAdminToken();
    router.push('/admin');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>🔐</span> {title}
            </h1>
            {subtitle && (
              <p className="text-gray-400 text-sm mt-1">{subtitle}</p>
            )}
          </div>
          {isLoggedIn && (
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        {children}
      </main>

      {/* Bottom Navigation */}
      {isLoggedIn && (
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700">
          <div className="max-w-6xl mx-auto px-2 py-2">
            <div className="flex overflow-x-auto gap-1 scrollbar-hide">
              {ADMIN_NAV_ITEMS.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

