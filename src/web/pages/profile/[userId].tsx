/**
 * Public User Profile Page
 * 
 * View another user's profile and leave/edit reviews
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../../lib/telegram-webapp';

interface UserProfile {
  id: string;
  username?: string;
  firstName?: string;
  photoUrl?: string;
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

interface ExistingReview {
  id: string;
  score: number;
  comment: string;
  link?: string;
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
  
  // Existing review by current user
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);

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

  const loadProfile = useCallback(async (id: string) => {
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
  }, []);

  const loadReviews = useCallback(async (id: string) => {
    try {
      const initData = getInitData();
      const response = await fetch(`/api/reviews/${id}`, {
        headers: {
          'x-telegram-init-data': initData,
        },
      });
      const data = await response.json();
      if (data.ok) {
        setReviews(data.reviews || []);
        // Check if current user has an existing review
        if (data.currentUserReview) {
          setExistingReview(data.currentUserReview);
        }
      }
    } catch (err) {
      console.error('Failed to load reviews', err);
    }
  }, []);

  useEffect(() => {
    if (userId && typeof userId === 'string') {
      loadProfile(userId);
      loadReviews(userId);
    }
  }, [userId, loadProfile, loadReviews]);

  const openReviewModal = () => {
    // Pre-fill if editing existing review
    if (existingReview) {
      setReviewScore(existingReview.score as 1 | -1);
      setReviewComment(existingReview.comment);
      setReviewLink(existingReview.link || '');
    } else {
      setReviewScore(1);
      setReviewComment('');
      setReviewLink('');
    }
    setReviewMessage(null);
    setShowReviewModal(true);
  };

  const submitReview = async () => {
    if (!profile || !reviewComment.trim()) {
      setReviewMessage({ text: 'Please enter a comment', type: 'error' });
      return;
    }

    if (reviewComment.length > 140) {
      setReviewMessage({ text: 'Comment must be 140 characters or less', type: 'error' });
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
        setReviewMessage({ text: existingReview ? 'Review updated!' : 'Review submitted!', type: 'success' });
        setTimeout(() => {
          setShowReviewModal(false);
          // Reload to update
          loadProfile(profile.id);
          loadReviews(profile.id);
        }, 1000);
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
        <div className="animate-pulse">Loading profile...</div>
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white pb-6">
      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-purple-500/30">
            <h3 className="text-xl font-bold mb-4">
              {existingReview ? '✏️ Edit Your Review' : '✍️ Leave a Review'}
            </h3>
            
            {reviewMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                reviewMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
              }`}>
                {reviewMessage.text}
              </div>
            )}

            {/* Sentiment Toggle */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Your experience</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setReviewScore(1)}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    reviewScore === 1 
                      ? 'bg-green-600 ring-2 ring-green-400' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  👍 Positive
                </button>
                <button
                  onClick={() => setReviewScore(-1)}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    reviewScore === -1 
                      ? 'bg-red-600 ring-2 ring-red-400' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  👎 Negative
                </button>
              </div>
            </div>

            {/* Comment */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Comment (max 140 characters)</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value.slice(0, 140))}
                placeholder="Share your experience with this user..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm resize-none h-24 focus:border-purple-500 focus:outline-none"
              />
              <div className={`text-xs text-right mt-1 ${reviewComment.length > 120 ? 'text-amber-400' : 'text-gray-500'}`}>
                {reviewComment.length}/140
              </div>
            </div>

            {/* Optional Evidence Link */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Evidence link (optional)</label>
              <input
                type="url"
                value={reviewLink}
                onChange={(e) => setReviewLink(e.target.value)}
                placeholder="https://... (screenshot, chat, etc.)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 focus:outline-none"
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
                {submittingReview ? 'Saving...' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Avatar */}
      <header className="p-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-purple-700 flex items-center justify-center text-2xl">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.username || profile.firstName || 'User'}</h1>
            <p className="text-purple-300 text-sm">@{profile.username || 'unknown'}</p>
          </div>
        </div>
      </header>

      <div className="px-6 space-y-4">
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
            
            <div className="flex justify-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">+{profile.positiveReviews}</div>
                <div className="text-xs text-gray-400">Positive</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">-{profile.negativeReviews}</div>
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
              <div className="text-xl font-bold">{profile.points.toLocaleString()} aXP</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Tier</div>
              <div className="text-lg font-semibold">{profile.tier || 'Newcomer'}</div>
            </div>
          </div>
        </div>

        {/* Review Action Button */}
        {!isOwnProfile && (
          <button
            onClick={openReviewModal}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
              existingReview
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
            }`}
          >
            {existingReview ? '✏️ Edit Your Review' : '✍️ Leave a Review'}
          </button>
        )}

        {/* Reviews Section */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📝</span> Reviews
          </h2>
          
          {reviews.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔮</div>
              <div className="text-gray-400">No reviews yet.</div>
              {!isOwnProfile && (
                <div className="text-purple-300 text-sm mt-2">Be the first to review this user!</div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="border-b border-purple-500/20 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {/* Sentiment Tag */}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        review.score === 1 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {review.score === 1 ? '+ Positive' : '- Negative'}
                      </span>
                      <span className="text-sm text-gray-300">
                        @{review.reviewer.username || review.reviewer.firstName || 'anonymous'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 mb-2">{review.comment}</p>
                  {review.link && (
                    <a
                      href={review.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      🔗 View evidence
                    </a>
                  )}
                </div>
              ))}
              
              {reviews.length > 5 && (
                <div className="text-center pt-2">
                  <span className="text-sm text-gray-400">
                    +{reviews.length - 5} more reviews
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Back to own profile link */}
        {isOwnProfile && (
          <div className="text-center pt-4">
            <button
              onClick={() => router.push('/profile')}
              className="text-purple-300 hover:text-white text-sm underline"
            >
              ← Back to my profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
