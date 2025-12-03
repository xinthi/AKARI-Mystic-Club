/**
 * AKARI Mystic Club - Mini App Dashboard
 * 
 * Main entry point for the Telegram Mini App
 * Shows user stats, Wheel of Fortune, quick links, and active predictions/campaigns
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';
import WheelOfFortune from '../components/WheelOfFortune';
import OnboardingOverlay from '../components/OnboardingOverlay';
import FeaturedStrip, { FeaturedPrediction, FeaturedQuest } from '../components/FeaturedStrip';

interface User {
  id: string;
  username?: string;
  points: number;
  tier?: string;
  credibilityScore: string;
  positiveReviews: number;
  mystBalance?: number;
  hasSeenOnboardingGuide?: boolean;
}

interface Prediction {
  id: string;
  title: string;
  category?: string;
  originalCategory?: string;
  endsAt?: string | null;
  mystPoolYes?: number;
  mystPoolNo?: number;
  createdAt: string;
  resolved: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  endsAt?: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    // Initialize Telegram WebApp
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
        
        // @ts-ignore - SDK types may vary
        const initData = (WebApp as any).initData;
        if (initData) {
          setInitData(initData);
          authenticateUser(initData);
        } else {
          // Try to authenticate anyway - permissive mode
          console.warn('No initData from WebApp, attempting auth anyway');
          authenticateUser('');
        }
      } catch (err) {
        console.error('Telegram SDK error:', err);
        // Don't fail - try to authenticate anyway
        authenticateUser('');
      }
    } else {
      // Server-side - try to authenticate anyway
      console.warn('WebApp not available (server-side), attempting auth anyway');
      authenticateUser('');
    }
  }, []);

  const authenticateUser = async (initData: string) => {
    try {
      // Debug: log initData before sending
      console.log('[Dashboard] Sending initData to /api/auth/telegram:');
      console.log('[Dashboard]   - length:', initData?.length ?? 0);
      console.log('[Dashboard]   - preview:', initData ? initData.slice(0, 80) + '...' : '(empty)');

      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      // Treat any 200 response as success
      if (!response.ok) {
        console.error('Auth endpoint returned non-200:', response.status, response.statusText);
        // Still continue - permissive mode
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('Auth response:', { ok: data.ok, hasUser: !!data.user, reason: data.reason });
      
      // Store user if available, but don't require it
      if (data.user) {
        // Map the response to our User interface
        const newUser: User = {
          id: String(data.user.id || ''),
          username: data.user.username,
          points: data.user.points || 0,
          tier: data.user.tier,
          credibilityScore: data.user.credibilityScore || '0',
          positiveReviews: data.user.positiveReviews || 0,
          mystBalance: data.user.mystBalance || 0,
          hasSeenOnboardingGuide: data.user.hasSeenOnboardingGuide || false,
        };
        setUser(newUser);
        
        // Show onboarding if user hasn't seen it
        if (!newUser.hasSeenOnboardingGuide) {
          setShowOnboarding(true);
        }
      }
      
      setLoading(false);
      
      // Load predictions and campaigns after auth
      if (data.user) {
        loadFeaturedData(initData);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      // Don't show error - just continue loading
      setLoading(false);
    }
  };

  const loadFeaturedData = async (initData: string) => {
    try {
      // Load predictions
      const predictionsResponse = await fetch('/api/predictions?resolved=false', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });
      
      if (predictionsResponse.ok) {
        const predictionsData = await predictionsResponse.json();
        setPredictions(predictionsData.predictions || []);
      }

      // Load campaigns
      const campaignsResponse = await fetch('/api/campaigns', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });
      
      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json();
        setCampaigns(campaignsData.campaigns || []);
      }
    } catch (err) {
      console.error('Error loading featured data:', err);
      // Don't block UI if this fails
    }
  };

  const handleBalanceUpdate = (newBalance: number) => {
    if (user) {
      setUser({ ...user, mystBalance: newBalance });
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    
    // Mark onboarding as seen in the backend
    try {
      const WebApp = getWebApp();
      const telegramInitData = (WebApp as any)?.initData || '';
      
      await fetch('/api/user/onboarding-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': telegramInitData,
        },
      });
      
      // Update local state
      if (user) {
        setUser({ ...user, hasSeenOnboardingGuide: true });
      }
    } catch (err) {
      console.error('Failed to mark onboarding as seen:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-akari-bg flex items-center justify-center">
        <div className="text-akari-text text-xl">Loading...</div>
      </div>
    );
  }

  // Only show error if there's a critical error, not if user is missing
  if (error && (error.includes('critical') || error.includes('fatal'))) {
    return (
      <div className="min-h-screen bg-akari-bg flex items-center justify-center">
        <div className="text-akari-text text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg mb-2">Failed to load</div>
          <div className="text-sm text-akari-muted">{error}</div>
        </div>
      </div>
    );
  }

  // If no user, show a default state but still allow navigation
  const displayUser = user || {
    id: 'guest',
    username: 'Guest',
    points: 0,
    tier: undefined,
    credibilityScore: '0',
    positiveReviews: 0,
    mystBalance: 0,
  };

  // Derive featured predictions and quests
  const featuredPredictions = useMemo<FeaturedPrediction[]>(() => {
    const active = predictions.filter(p => !p.resolved);
    
    // Prioritize MEME_COIN and TRENDING_CRYPTO
    const prioritized = [
      ...active.filter(p => p.originalCategory === 'MEME_COIN' || p.originalCategory === 'TRENDING_CRYPTO'),
      ...active.filter(p => p.originalCategory !== 'MEME_COIN' && p.originalCategory !== 'TRENDING_CRYPTO'),
    ];
    
    // Sort by createdAt (newest first) and limit to 5
    return prioritized
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        title: p.title,
        category: p.originalCategory || p.category || 'Community',
        endsAt: p.endsAt,
        poolMyst: (p.mystPoolYes || 0) + (p.mystPoolNo || 0),
      }));
  }, [predictions]);

  const featuredQuests = useMemo<FeaturedQuest[]>(() => {
    return campaigns
      .filter(c => c.status === 'ACTIVE')
      .slice(0, 3)
      .map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        endsAt: c.endsAt,
      }));
  }, [campaigns]);

  return (
    <div className="min-h-screen bg-akari-bg text-akari-text">
      {/* Onboarding Overlay */}
      {showOnboarding && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
      
      {/* Header */}
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2 text-akari-text">🔮 AKARI Mystic Club</h1>
        <p className="text-akari-muted">Welcome back, {displayUser.username || 'Mystic'}</p>
      </header>

      {/* User Stats Card */}
      <div className="px-6 mb-4">
        <div className="bg-akari-cardSoft backdrop-blur-lg rounded-2xl p-5 border border-akari-accent/40 shadow-[0_0_40px_rgba(0,246,162,0.18)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-akari-muted mb-1">MYST Balance</div>
              <div className="text-3xl font-bold text-akari-primary">
                {(displayUser.mystBalance ?? 0).toLocaleString()} <span className="text-lg">MYST</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-akari-muted mb-1">Experience</div>
              <div className="text-xl font-semibold text-akari-profit">{displayUser.points.toLocaleString()} EP</div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-akari-accent/20">
            <div>
              <div className="text-xs text-akari-muted mb-1">Tier</div>
              <div className="text-sm font-semibold text-akari-text">{displayUser.tier || 'None'}</div>
            </div>
            {/* Clickable Credibility & Reviews - Opens Find Users Page */}
            <button
              onClick={() => router.push('/users')}
              className="col-span-2 bg-akari-card hover:bg-akari-card/80 rounded-lg p-2 -m-2 transition-all border border-transparent hover:border-akari-accent/30"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="text-left">
                  <div className="text-xs text-akari-muted mb-1">Credibility</div>
                  <div className="text-sm font-semibold text-akari-text">{displayUser.credibilityScore}/10</div>
                </div>
                <div className="text-left">
                  <div className="text-xs text-akari-muted mb-1">Reviews</div>
                  <div className="text-sm font-semibold text-akari-text">{displayUser.positiveReviews} 🛡️</div>
                </div>
              </div>
              <div className="text-[10px] text-akari-muted mt-1 text-center">
                Tap to find & review users →
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Featured Strip */}
      <FeaturedStrip predictions={featuredPredictions} quests={featuredQuests} />

      {/* Wheel of Fortune */}
      <div className="px-6 mb-4">
        <div className="bg-akari-cardSoft rounded-2xl p-4 border border-akari-accent/20">
          <WheelOfFortune onBalanceUpdate={handleBalanceUpdate} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-akari-text">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => router.push('/predictions')}
            className="bg-gradient-to-r from-akari-primary to-akari-accent hover:from-akari-primary/90 hover:to-akari-accent/90 rounded-xl p-4 text-left transition-all active:scale-95 shadow-[0_0_24px_rgba(0,246,162,0.3)]"
          >
            <div className="text-2xl mb-2">🎲</div>
            <div className="font-semibold text-neutral-900">Predictions</div>
            <div className="text-sm text-neutral-800">Bet & Win</div>
          </button>

          <button
            onClick={() => router.push('/leaderboard')}
            className="bg-gradient-to-r from-akari-primary to-akari-accent hover:from-akari-primary/90 hover:to-akari-accent/90 rounded-xl p-4 text-left transition-all active:scale-95 shadow-[0_0_24px_rgba(0,246,162,0.3)]"
          >
            <div className="text-2xl mb-2">🏆</div>
            <div className="font-semibold text-neutral-900">Leaderboard</div>
            <div className="text-sm text-neutral-800">Weekly Rankings</div>
          </button>

          <button
            onClick={() => router.push('/campaigns')}
            className="bg-gradient-to-r from-akari-primary to-akari-accent hover:from-akari-primary/90 hover:to-akari-accent/90 rounded-xl p-4 text-left transition-all active:scale-95 shadow-[0_0_24px_rgba(0,246,162,0.3)]"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold text-neutral-900">Campaigns</div>
            <div className="text-sm text-neutral-800">Tasks & Rewards</div>
          </button>

          <button
            onClick={() => router.push('/profile')}
            className="bg-gradient-to-r from-akari-primary to-akari-accent hover:from-akari-primary/90 hover:to-akari-accent/90 rounded-xl p-4 text-left transition-all active:scale-95 shadow-[0_0_24px_rgba(0,246,162,0.3)]"
          >
            <div className="text-2xl mb-2">👤</div>
            <div className="font-semibold text-neutral-900">Profile</div>
            <div className="text-sm text-neutral-800">Your Stats</div>
          </button>
        </div>
      </div>

      {/* Recent Activity Preview */}
      <div className="px-6 pb-6">
        <h2 className="text-xl font-semibold mb-4 text-akari-text">Active Predictions</h2>
        <div className="bg-akari-card backdrop-blur-lg rounded-xl p-4 border border-akari-accent/20">
          <button
            onClick={() => router.push('/predictions')}
            className="w-full text-left text-akari-muted hover:text-akari-text transition-colors"
          >
            View all predictions →
          </button>
        </div>
      </div>
    </div>
  );
}
