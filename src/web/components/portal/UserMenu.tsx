/**
 * User Menu Dropdown Component
 * 
 * Consolidated user menu with profile and admin submenu items.
 */

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { getUserTierInfo } from '@/lib/userTier';

export function UserMenu() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const { isLoggedIn, xUsername } = akariUser;
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  const tierInfo = getUserTierInfo(akariUser.user);
  
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!isLoggedIn) {
    return null;
  }

  const menuItems = [
    {
      label: 'My Profile',
      href: '/portal/me',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
      ),
    },
  ];

  const adminItems = userIsSuperAdmin
    ? [
        {
          label: 'Admin Overview',
          href: '/portal/admin/overview',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
            </svg>
          ),
        },
        {
          label: 'Projects Admin',
          href: '/portal/admin/projects',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
            </svg>
          ),
        },
        {
          label: 'Access Requests',
          href: '/portal/admin/access',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          ),
        },
      ]
    : [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-akari-muted hover:text-akari-primary transition-all duration-300 ease-out px-2 py-1.5 rounded-lg hover:bg-slate-800/50"
        aria-label="User menu"
      >
        <svg className="w-4 h-4 transition-all duration-300 hover:drop-shadow-[0_0_6px_rgba(0,246,162,0.5)]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
        <span className="hidden sm:inline max-w-[120px] truncate">
          {xUsername || 'Profile'}
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-xl z-50 overflow-hidden">
            {/* User Info Header */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${tierInfo.bgColor} ${tierInfo.color} text-xs font-medium`}>
                  {xUsername?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {xUsername || 'User'}
                  </div>
                  <div className={`text-xs ${tierInfo.color} truncate`}>
                    {tierInfo.name}
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2 text-sm transition ${
                      isActive
                        ? 'bg-akari-primary/10 text-akari-primary border-l-2 border-akari-primary'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}

              {/* Admin Section Divider */}
              {adminItems.length > 0 && (
                <>
                  <div className="my-2 border-t border-slate-800" />
                  <div className="px-4 py-2">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Admin
                    </div>
                  </div>
                  {adminItems.map((item) => {
                    const isActive = router.pathname === item.href || router.pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2 text-sm transition ${
                          isActive
                            ? 'bg-akari-primary/10 text-akari-primary border-l-2 border-akari-primary'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

