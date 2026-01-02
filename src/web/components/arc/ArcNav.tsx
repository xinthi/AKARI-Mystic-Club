/**
 * ARC Navigation Component
 * 
 * Reusable navigation component for ARC pages.
 * Shows links based on user permissions and current context.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface ArcNavProps {
  projectSlug?: string | null;
  canManageProject?: boolean;
  isSuperAdmin?: boolean;
}

export function ArcNav({ projectSlug, canManageProject = false, isSuperAdmin = false }: ArcNavProps) {
  const router = useRouter();

  // General section
  const generalItems = [
    {
      label: 'ARC Home',
      href: '/portal/arc',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
  ];

  // Project section (only if projectSlug exists)
  const projectItems = projectSlug
    ? [
        {
          label: 'Project Hub',
          href: `/portal/arc/${encodeURIComponent(projectSlug)}`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ),
        },
        ...(canManageProject || isSuperAdmin
          ? [
              {
                label: 'Project Admin',
                href: `/portal/arc/admin/${encodeURIComponent(projectSlug)}`,
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
              },
            ]
          : []),
      ]
    : [];

  // Superadmin section (only if isSuperAdmin is true)
  const superadminItems = isSuperAdmin
    ? [
        {
          label: 'Requests',
          href: '/portal/admin/arc/leaderboard-requests',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
        {
          label: 'Billing',
          href: '/portal/admin/arc/billing',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          label: 'Reports',
          href: '/portal/admin/arc/reports',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
        {
          label: 'Activity',
          href: '/portal/admin/arc/activity',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
      ]
    : [];

  const isActive = (href: string): boolean => {
    if (href === '/portal/arc') {
      return router.pathname === '/portal/arc';
    }
    return router.pathname.startsWith(href);
  };

  return (
    <div className="space-y-4">
      {/* General Section */}
      {generalItems.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
            General
          </div>
          <div className="space-y-1">
            {generalItems.map((item) => (
              <Link key={item.label} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Project Section */}
      {projectItems.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
            Project
          </div>
          <div className="space-y-1">
            {projectItems.map((item) => (
              <Link key={item.label} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Superadmin Section */}
      {superadminItems.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
            Superadmin
          </div>
          <div className="space-y-1">
            {superadminItems.map((item) => (
              <Link key={item.label} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
