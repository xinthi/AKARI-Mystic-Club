/**
 * ARC Facebook-style Left Rail Navigation
 * 
 * Fixed/sticky vertical navigation menu
 */

import React from 'react';
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

export function LeftRail({ canManageArc, projectSlug, canManageProject, isSuperAdmin }: LeftRailProps) {
  const router = useRouter();
  const { mode } = useArcMode();

  const navItems = mode === 'crm'
    ? [
      {
        label: 'Brands',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
          </svg>
        ),
        href: '/portal/arc/brands',
        active: router.pathname.startsWith('/portal/arc/brands'),
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
        label: 'Campaigns',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        href: '/portal/arc/brands',
        active: router.pathname.startsWith('/portal/arc/brands'),
      },
    ]
    : [
      {
        label: 'Campaigns',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        href: '/portal/arc/my-creator-programs',
        active: router.pathname.startsWith('/portal/arc/my-creator-programs') || router.pathname.startsWith('/portal/arc/campaigns'),
      },
      {
        label: 'Brands',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
          </svg>
        ),
        href: '/portal/arc/brands',
        active: router.pathname.startsWith('/portal/arc/brands'),
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
                } ${item.onClick ? 'cursor-pointer' : ''}`}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
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

