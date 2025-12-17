import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AkariAuthProvider, useAkariAuth } from '../lib/akari-auth';
import { AuthGate } from '../components/LockedOverlay';
import { SuperAdminViewAs } from '../components/SuperAdminViewAs';
import { Role } from '../lib/permissions';
import '../styles/globals.css';

// Routes that DON'T require X authentication (MiniApp, Admin, API routes, etc.)
// These routes either have their own auth (admin token) or are public
const PUBLIC_ROUTES = [
  '/miniapp',
  '/admin',      // Admin panel uses its own token auth
  '/api/',
  '/login',
  '/_next/',
  '/favicon',
  '/terms',      // Legal pages
  '/privacy',
];

// Check if a path is a public route (no auth required)
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

// Dev Mode Role Selector - uses auth context
function DevModeRoleSelector() {
  const { isDevMode, devRole, setDevRole } = useAkariAuth();
  
  if (!isDevMode) return null;
  
  return (
    <div className="fixed top-4 right-4 z-[100] bg-yellow-500 text-black p-3 rounded-xl shadow-lg text-sm max-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🛠️</span>
        <span className="font-bold">DEV MODE</span>
      </div>
      <select
        value={devRole}
        onChange={(e) => setDevRole(e.target.value as Role)}
        className="w-full px-2 py-1 rounded bg-yellow-100 text-black border border-yellow-600 font-semibold"
      >
        <option value="user">👤 User</option>
        <option value="analyst">📊 Analyst</option>
        <option value="admin">🔑 Admin</option>
        <option value="super_admin">⭐ Super Admin (Recommended)</option>
      </select>
      <p className="mt-2 text-[10px] opacity-70">
        Auth bypassed for testing
      </p>
      {devRole !== 'super_admin' && (
        <p className="mt-1 text-[10px] text-red-700 font-semibold">
          ⚠️ Use Super Admin to see all functions
        </p>
      )}
    </div>
  );
}

// Inner component that uses auth context
function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { isLoggedIn, isLoading, login, isDevMode } = useAkariAuth();

  // Check if current route requires auth
  const requiresAuth = !isPublicRoute(router.pathname);

  // If it's a public route (MiniApp, API, etc.), render without auth gate
  if (!requiresAuth) {
    return <Component {...pageProps} />;
  }

  // DEV MODE: Bypass auth entirely and show role selector
  if (isDevMode) {
    return (
      <>
        <Component {...pageProps} />
        <DevModeRoleSelector />
      </>
    );
  }

  // PRODUCTION: Apply auth gate
  return (
    <AuthGate
      isLoggedIn={isLoggedIn}
      isLoading={isLoading}
      onLogin={login}
    >
      <Component {...pageProps} />
      {/* Super Admin View As panel - only shows for SAs */}
      <SuperAdminViewAs />
    </AuthGate>
  );
}

export default function App(props: AppProps) {
  useEffect(() => {
    // Initialize Telegram Web App SDK
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((sdk) => {
        // SDK is automatically initialized on import
        // No need to call ready() in v8.0.2
      });

      // Fun message for curious developers who open F12 🕵️
      console.log(`
%c██╗  ██╗███████╗██╗   ██╗    ██╗   ██╗ ██████╗ ██╗   ██╗██╗
%c██║  ██║██╔════╝╚██╗ ██╔╝    ╚██╗ ██╔╝██╔═══██╗██║   ██║██║
%c███████║█████╗   ╚████╔╝      ╚████╔╝ ██║   ██║██║   ██║██║
%c██╔══██║██╔══╝    ╚██╔╝        ╚██╔╝  ██║   ██║██║   ██║╚═╝
%c██║  ██║███████╗   ██║          ██║   ╚██████╔╝╚██████╔╝██╗
%c╚═╝  ╚═╝╚══════╝   ╚═╝          ╚═╝    ╚═════╝  ╚═════╝ ╚═╝
`, 
        'color: #00E5A0; font-weight: bold;',
        'color: #00D4FF; font-weight: bold;',
        'color: #FBBF24; font-weight: bold;',
        'color: #F472B6; font-weight: bold;',
        'color: #A78BFA; font-weight: bold;',
        'color: #60A5FA; font-weight: bold;'
      );
      
      console.log(
        '%c🚀 Curious developer spotted! 👀',
        'font-size: 20px; font-weight: bold; color: #00E5A0;'
      );
      
      console.log(
        '%c📱 Follow @muazxinthi on X for alpha! 🔥',
        'font-size: 24px; font-weight: bold; color: #FBBF24; text-shadow: 2px 2px #000;'
      );
      
      console.log(
        '%c⚡ AKARI Mystic Club - Prediction-native market intelligence',
        'font-size: 14px; color: #888;'
      );
      
      console.log(
        '%c🔒 Nice try! All the juicy stuff is on the server side 😉',
        'font-size: 12px; color: #666; font-style: italic;'
      );
    }
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log error for monitoring
        console.error('App-level error:', error, errorInfo);
        // TODO: Send to error tracking service in production
      }}
    >
      <AkariAuthProvider>
        <AppContent {...props} />
      </AkariAuthProvider>
    </ErrorBoundary>
  );
}

