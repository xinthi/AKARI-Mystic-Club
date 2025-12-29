/**
 * User Menu Dropdown Component
 * 
 * Consolidated user menu with profile and admin submenu items.
 */

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  
  // Debug logging for admin access issues
  useEffect(() => {
    if (typeof window !== 'undefined' && akariUser.user) {
      console.log('[UserMenu] User roles check:', {
        xUsername: akariUser.user.xUsername,
        realRoles: akariUser.user.realRoles,
        effectiveRoles: akariUser.user.effectiveRoles,
        isSuperAdmin: userIsSuperAdmin,
        userId: akariUser.user.id,
        isDevMode: process.env.NODE_ENV === 'development',
      });
    }
  }, [akariUser.user, userIsSuperAdmin]);
  
  const [isOpen, setIsOpen] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch profile image when xUsername is available
  useEffect(() => {
    if (!xUsername) {
      setProfileImageUrl(null);
      return;
    }

    async function fetchProfileImage() {
      if (!xUsername) {
        setProfileImageUrl(null);
        return;
      }

      try {
        // Convert xUsername to slug (same logic as in me.tsx)
        const slug = xUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        const res = await fetch(`/api/portal/sentiment/${slug}`);
        const data = await res.json();
        
        if (data.ok && data.project) {
          const imageUrl = data.project.twitter_profile_image_url || data.project.avatar_url;
          setProfileImageUrl(imageUrl || null);
        } else {
          setProfileImageUrl(null);
        }
      } catch (error) {
        console.error('[UserMenu] Error fetching profile image:', error);
        setProfileImageUrl(null);
      }
    }

    fetchProfileImage();
  }, [xUsername]);

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
    <div className="relative z-[60]" ref={menuRef}>
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
            className="fixed inset-0 z-[55]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-akari-neon-teal/30 bg-akari-card shadow-[0_0_30px_rgba(0,246,162,0.3)] z-[60] overflow-hidden">
            {/* User Info Header */}
            <div className="px-4 py-3 border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  {profileImageUrl ? (
                    <Image
                      src={profileImageUrl}
                      alt={xUsername || 'User'}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover border-2 border-akari-neon-teal/30 shadow-neon-teal"
                      unoptimized
                      onError={() => setProfileImageUrl(null)}
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-akari-neon-teal/30 bg-gradient-neon-teal text-black text-sm font-bold shadow-neon-teal`}>
                      {xUsername?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-akari-text truncate">
                    {xUsername || 'User'}
                  </div>
                  <div className={`text-xs font-semibold ${tierInfo.color} truncate`}>
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
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-300 group ${
                      isActive
                        ? 'bg-akari-neon-teal/10 text-akari-neon-teal border-l-2 border-akari-neon-teal'
                        : 'text-akari-muted hover:bg-akari-cardSoft/50 hover:text-akari-text'
                    }`}
                  >
                    {React.cloneElement(item.icon, { className: `${item.icon.props.className} group-hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)]` })}
                    {item.label}
                  </Link>
                );
              })}

              {/* Admin Section Divider */}
              {adminItems.length > 0 && (
                <>
                  <div className="my-2 border-t border-akari-neon-teal/20" />
                  <div className="px-4 py-2">
                    <div className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">
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
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-300 group ${
                          isActive
                            ? 'bg-akari-neon-teal/10 text-akari-neon-teal border-l-2 border-akari-neon-teal'
                            : 'text-akari-muted hover:bg-akari-cardSoft/50 hover:text-akari-text'
                        }`}
                      >
                        {React.cloneElement(item.icon, { className: `${item.icon.props.className} group-hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)]` })}
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

