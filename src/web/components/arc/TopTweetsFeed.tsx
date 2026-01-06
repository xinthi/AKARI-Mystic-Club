/**
 * Top Tweets Feed Component
 * 
 * Displays top performing tweets in a feed format
 */

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface TopTweet {
  tweet_id: string;
  url: string;
  text: string;
  author_handle: string;
  author_name: string | null;
  author_avatar: string | null;
  created_at: string;
  impressions: number | null;
  engagements: number | null;
  likes: number;
  replies: number;
  reposts: number;
  score: number;
}

interface TopTweetsFeedProps {
  tweets: TopTweet[];
  loading?: boolean;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m`;
  } else {
    return 'now';
  }
}

export function TopTweetsFeed({ tweets, loading }: TopTweetsFeedProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-4 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-white/10 rounded w-full mb-2"></div>
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!tweets || tweets.length === 0) {
    return (
      <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
        <p className="text-white/40 text-sm">No tweets available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white/80 mb-4">Top Performing Tweets</h3>
      {tweets.map((tweet) => (
        <Link
          key={tweet.tweet_id}
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white/5 rounded-lg border border-white/10 p-4 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-start gap-3 mb-2">
            {tweet.author_avatar ? (
              <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                <Image
                  src={tweet.author_avatar}
                  alt={tweet.author_handle || 'Avatar'}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex-shrink-0 flex items-center justify-center">
                <span className="text-white/60 text-xs">
                  {(tweet.author_handle || '?')[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white text-sm font-medium truncate">
                  {tweet.author_name || tweet.author_handle || 'Unknown'}
                </span>
                <span className="text-white/60 text-xs">@{tweet.author_handle}</span>
                <span className="text-white/40 text-xs">·</span>
                <span className="text-white/40 text-xs">{formatTimeAgo(tweet.created_at)}</span>
              </div>
              <p className="text-white/80 text-sm line-clamp-3 mb-2">
                {tweet.text}
              </p>
              <div className="flex items-center gap-4 text-white/60 text-xs">
                <span>❤️ {tweet.likes}</span>
                <span>💬 {tweet.replies}</span>
                <span>🔄 {tweet.reposts}</span>
                {tweet.impressions && (
                  <span>👁️ {tweet.impressions > 1000 ? `${(tweet.impressions / 1000).toFixed(1)}K` : tweet.impressions}</span>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
