/**
 * User Profile View Page
 * 
 * View another user's profile and leave reviews
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../../lib/telegram-webapp';

interface UserProfile {
  id: string;
  username?: string;
  firstName?: string;
  points: number;
  tier?: string;
  credibilityScore: number;
  positiveReviews: number;
  negativeReviews: number;
}

interface Review {
  id: string;
  reviewer: {
    id: string;
    username?: string;
    firstName?: string;
    credibilityScore: number;
  };
  score: number;
  comment: string;
  link?: string;
  createdAt: string;
}

export default function UserProfilePage() {
  const router = useRouter();
  const { userId } = router.query;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current user's ID to check if viewing own profile
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewScore, setReviewScore] = useState<1 | -1>(1);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLink, setReviewLink] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const getInitData = (): string => {
    if (typeof window === 'undefined') return '';
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initData || '';
  };

  // Telegram BackButton
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    tg.BackButton.onClick(() => router.back());

    return () => {
      try {
        tg.BackButton.hide();
      } catch (_) {}
    };
  }, [router]);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (userId && typeof userId === 'string') {
      loadProfile(userId);
      loadReviews(userId);
    }
  }, [userId]);

  const loadProfile = async (id: string) => {
    try {
      const initData = getInitData();
      const response = await fetch(`/api/profile/${id}`, {
        headers: {
          'x-telegram-init-data': initData,
        },
      });
      const data = await response.json();

      if (data.ok) {
        setProfile(data.user);
        setCurrentUserId(data.currentUserId || null);
        setError(null);
      } else {
        setError(data.message || 'User not found');
      }
    } catch (err: any) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (id: string) => {
    try {
      const response = await fetch(`/api/reviews/${id}`);
      const data = await response.json();
      if (data.ok) {
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error('Failed to load reviews', err);
    }
  };

  const submitReview = async () => {
    if (!profile || !reviewComment.trim()) {
      setReviewMessage({ text: 'Please enter a comment', type: 'error' });
      return;
    }

    setSubmittingReview(true);
    setReviewMessage(null);

    try {
      const initData = getInitData();
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          revieweeId: profile.id,
          score: reviewScore,
          comment: reviewComment.trim(),
          link: reviewLink.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setReviewMessage({ text: 'Review submitted!', type: 'success' });
        setShowReviewModal(false);
        setReviewComment('');
        setReviewLink('');
        // Reload to update
        loadProfile(profile.id);
        loadReviews(profile.id);
      } else {
        setReviewMessage({ text: data.message || 'Failed to submit', type: 'error' });
      }
    } catch (err) {
      setReviewMessage({ text: 'Network error', type: 'error' });
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">🔮</div>
          <div className="text-lg mb-2">{error || 'User not found'}</div>
          <button onClick={() => router.back()} className="px-4 py-2 bg-purple-600 rounded-lg">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUserId === profile.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-purple-500/30">
            <h3 className="text-xl font-bold mb-4">Leave a Review</h3>
            
            {reviewMessage && (
              <div className={`mb-4 p-2 rounded-lg text-sm ${
                reviewMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
              }`}>
                {reviewMessage.text}
              </div>
            )}

            {/* Score Toggle */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setReviewScore(1)}
                className={`flex-1 py-3 rounded-lg font-semibold ${
                  reviewScore === 1 ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                👍 Positive
              </button>
              <button
                onClick={() => setReviewScore(-1)}
                className={`flex-1 py-3 rounded-lg font-semibold ${
                  reviewScore === -1 ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                👎 Negative
              </button>
            </div>

            {/* Comment */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Comment (max 255 chars)</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value.slice(0, 255))}
                placeholder="Write your review..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm resize-none h-24"
              />
              <div className="text-xs text-gray-500 text-right">{reviewComment.length}/255</div>
            </div>

            {/* Optional Link */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Link (optional)</label>
              <input
                type="url"
                value={reviewLink}
                onChange={(e) => setReviewLink(e.target.value)}
                placeholder="https://..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={submittingReview || !reviewComment.trim()}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 rounded-lg font-semibold"
              >
                {submittingReview ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">👤 {profile.username || profile.firstName || 'User'}</h1>
        <p className="text-purple-300">@{profile.username || 'unknown'}</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {/* Credibility Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="text-center">
            <div className={`text-5xl font-bold mb-2 ${
              profile.credibilityScore > 0 ? 'text-green-400' :
              profile.credibilityScore < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {profile.credibilityScore > 0 ? '+' : ''}{profile.credibilityScore}
            </div>
            <div className="text-purple-300 text-sm mb-4">Credibility Score</div>
            
            <div className="flex justify-center gap-6">
              <div className="text-center">
                <div className="text-2xl text-green-400">+{profile.positiveReviews}</div>
                <div className="text-xs text-gray-400">Positive</div>
              </div>
              <div className="text-center">
                <div className="text-2xl text-red-400">-{profile.negativeReviews}</div>
                <div className="text-xs text-gray-400">Negative</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Experience</div>
              <div className="text-xl font-bold">{profile.points.toLocaleString()} EP</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Tier</div>
              <div className="text-lg font-semibold">{profile.tier || 'None'}</div>
            </div>
          </div>
        </div>

        {/* Leave Review Button (only for other users) */}
        {!isOwnProfile && (
          <button
            onClick={() => setShowReviewModal(true)}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl font-semibold text-lg"
          >
            ✍️ Leave a Review
          </button>
        )}

        {/* Recent Reviews */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <h2 className="text-lg font-semibold mb-4">Recent Reviews</h2>
          
          {reviews.length === 0 ? (
            <div className="text-center text-gray-400 py-4">
              No reviews yet
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="border-b border-purple-500/20 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={review.score === 1 ? 'text-green-400' : 'text-red-400'}>
                        {review.score === 1 ? '👍' : '👎'}
                      </span>
                      <span className="font-medium">
                        @{review.reviewer.username || review.reviewer.firstName || 'anonymous'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{review.comment}</p>
                  {review.link && (
                    <a
                      href={review.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline mt-1 inline-block"
                    >
                      🔗 {review.link.slice(0, 40)}...
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

