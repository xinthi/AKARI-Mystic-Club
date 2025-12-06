/**
 * Profile Detail Page
 * 
 * Shows detailed information about a Twitter profile including:
 * - Profile header with avatar, name, bio
 * - Follower/following stats
 * - Recent tweets
 * - AKARI scoring (if available)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { PortalLayout } from '@/components/portal/PortalLayout';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileData {
  username: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  followers: number;
  following: number;
  tweetCount: number;
  verified: boolean;
  createdAt: string | null;
}

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

// =============================================================================
// AVATAR COMPONENT
// =============================================================================

function ProfileAvatar({ url, name, size = 'lg' }: { 
  url: string | null; 
  name: string; 
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const [imgError, setImgError] = useState(false);
  
  const sizeClasses = {
    sm: 'h-10 w-10 text-sm',
    md: 'h-14 w-14 text-lg',
    lg: 'h-20 w-20 text-2xl',
    xl: 'h-28 w-28 text-3xl',
  };

  const colors = [
    'from-purple-500/30 to-purple-600/30 text-purple-400',
    'from-blue-500/30 to-blue-600/30 text-blue-400',
    'from-green-500/30 to-green-600/30 text-green-400',
    'from-yellow-500/30 to-yellow-600/30 text-yellow-400',
    'from-pink-500/30 to-pink-600/30 text-pink-400',
    'from-cyan-500/30 to-cyan-600/30 text-cyan-400',
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;
  const colorClass = colors[colorIndex];

  const showFallback = !url || imgError;

  return (
    <div className="relative flex-shrink-0">
      {!showFallback ? (
        <img
          src={url}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover bg-akari-cardSoft border-2 border-akari-border`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`flex ${sizeClasses[size]} items-center justify-center rounded-full bg-gradient-to-br ${colorClass} font-bold border-2 border-akari-border`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ProfileDetailPage() {
  const router = useRouter();
  const { username } = router.query;
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username || typeof username !== 'string') return;

    async function fetchProfile() {
      setLoading(true);
      setError(null);

      try {
        // Fetch profile data
        const res = await fetch(`/api/portal/sentiment/profile/${username}`);
        const data = await res.json();

        if (!data.ok) {
          setError(data.error || 'Failed to load profile');
          return;
        }

        setProfile(data.profile);
        setTweets(data.tweets || []);
      } catch (err) {
        console.error('[Profile] Error:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [username]);

  const title = profile ? `${profile.name} (@${profile.username})` : 'Loading...';

  return (
    <PortalLayout title={title}>
      <Head>
        <title>{title} – Akari Mystic Club</title>
      </Head>

      {/* Back link */}
      <Link 
        href="/portal/sentiment"
        className="inline-flex items-center gap-1 text-sm text-akari-muted hover:text-akari-primary transition mb-6"
      >
        ← Back to Sentiment Terminal
      </Link>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-6 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <a
            href={`https://x.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 rounded-lg bg-akari-card border border-akari-border text-sm hover:border-akari-primary/50 transition"
          >
            View on X →
          </a>
        </div>
      )}

      {/* Profile Content */}
      {profile && !loading && (
        <div className="space-y-6">
          {/* Profile Header */}
          <section className="rounded-2xl bg-akari-card border border-akari-border p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <ProfileAvatar 
                url={profile.profileImageUrl} 
                name={profile.name || profile.username}
                size="xl"
              />

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-akari-text">
                    {profile.name || profile.username}
                  </h1>
                  {profile.verified && (
                    <span className="text-blue-400" title="Verified">✓</span>
                  )}
                </div>
                
                <p className="text-akari-muted mb-3">@{profile.username}</p>
                
                {profile.bio && (
                  <p className="text-akari-text/80 mb-4 max-w-2xl">{profile.bio}</p>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="font-bold text-akari-text">{formatNumber(profile.followers)}</span>
                    <span className="text-akari-muted ml-1">Followers</span>
                  </div>
                  <div>
                    <span className="font-bold text-akari-text">{formatNumber(profile.following)}</span>
                    <span className="text-akari-muted ml-1">Following</span>
                  </div>
                  <div>
                    <span className="font-bold text-akari-text">{formatNumber(profile.tweetCount)}</span>
                    <span className="text-akari-muted ml-1">Tweets</span>
                  </div>
                  {profile.createdAt && (
                    <div className="text-akari-muted">
                      Joined {formatDate(profile.createdAt)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <a
                    href={`https://x.com/${profile.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-akari-cardSoft border border-akari-border text-sm hover:border-akari-primary/50 transition"
                  >
                    View on X →
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Recent Tweets */}
          {tweets.length > 0 && (
            <section className="rounded-2xl bg-akari-card border border-akari-border p-6">
              <h2 className="text-lg font-semibold text-akari-text mb-4">Recent Tweets</h2>
              <div className="space-y-4">
                {tweets.map((tweet) => (
                  <div 
                    key={tweet.id}
                    className="p-4 rounded-xl bg-akari-cardSoft border border-akari-border/50"
                  >
                    <p className="text-sm text-akari-text mb-3">{tweet.text}</p>
                    <div className="flex items-center gap-4 text-xs text-akari-muted">
                      <span>❤️ {formatNumber(tweet.likeCount)}</span>
                      <span>🔁 {formatNumber(tweet.retweetCount)}</span>
                      <span>💬 {formatNumber(tweet.replyCount)}</span>
                      <span className="ml-auto">{formatDate(tweet.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PortalLayout>
  );
}

