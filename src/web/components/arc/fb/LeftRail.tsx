/**
 * ARC Facebook-style Left Rail Navigation
 * 
 * Fixed/sticky vertical navigation menu
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useArcMode } from '@/lib/arc/useArcMode';

interface LeftRailProps {
  canManageArc?: boolean;
  onKindFilterChange?: (filter: 'all' | 'arena' | 'campaign' | 'gamified') => void;
  onTimeFilterChange?: (filter: 'all' | 'live' | 'upcoming') => void;
  projectSlug?: string | null;
  canManageProject?: boolean;
  isSuperAdmin?: boolean;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  active: boolean;
  badge?: number;
}

export function LeftRail({ canManageArc, projectSlug, canManageProject, isSuperAdmin }: LeftRailProps) {
  const router = useRouter();
  const { mode } = useArcMode();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (mode !== 'crm') return;
    const loadCount = async () => {
      const res = await fetch('/api/portal/brands/pending-requests', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPendingCount(Number(data.count || 0));
      }
    };
    loadCount();
  }, [mode]);

  const navItems: NavItem[] = mode === 'crm'
    ? [
      {
        label: 'Analytics',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15v-4m5 4V8m5 7v-6" />
          </svg>
        ),
        href: '/portal/arc',
        active: router.pathname === '/portal/arc',
      },
      {
        label: 'Brands',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
          </svg>
        ),
        href: '/portal/arc/brands',
        active: router.pathname.startsWith('/portal/arc/brands') && !router.asPath.includes('create=1'),
      },
      {
        label: 'Create Brand',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        ),
        href: '/portal/arc/brands?create=1',
        active: router.asPath.includes('create=1'),
      },
      {
        label: 'Requests',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        href: '/portal/arc/requests',
        active: router.pathname.startsWith('/portal/arc/requests'),
        badge: pendingCount > 0 ? pendingCount : 0,
      },
    ]
    : [
      {
        label: 'Live Quests',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        href: '/portal/arc?view=quests',
        active: router.pathname === '/portal/arc' && (!router.asPath.includes('view=') || router.asPath.includes('view=quests')),
      },
      {
        label: 'Live Brands',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
          </svg>
        ),
        href: '/portal/arc?view=brands',
        active: router.pathname === '/portal/arc' && router.asPath.includes('view=brands'),
      },
      {
        label: 'My Requests',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        href: '/portal/arc?view=requests',
        active: router.pathname === '/portal/arc' && router.asPath.includes('view=requests'),
      },
      {
        label: 'My Submissions',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-8 4h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        href: '/portal/arc/my-submissions',
        active: router.pathname.startsWith('/portal/arc/my-submissions'),
      },
      {
        label: 'Profile',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a5 5 0 100 10 5 5 0 000-10zm0 12c-4.418 0-8 2.239-8 5v3h16v-3c0-2.761-3.582-5-8-5z" />
          </svg>
        ),
        href: '/portal/me',
        active: router.pathname.startsWith('/portal/me'),
      },
    ];

  const adminItems = [] as Array<any>;

  return (
    <div className="w-60 flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      <nav className="space-y-1 p-4">
        <div className="pt-2">
          {navItems.map((item) => {
            const content = (
              <div
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  item.active
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            );

            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className="block">
                  {content}
                </Link>
              );
            }

            return <div key={item.label}>{content}</div>;
          })}

          {adminItems.length > 0 && (
            <>
              <div className="pt-4 pb-2">
                <div className="px-4 text-xs font-semibold text-white/40 uppercase">Admin</div>
              </div>
              {adminItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      item.active
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

