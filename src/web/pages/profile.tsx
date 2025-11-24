import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import confetti from 'canvas-confetti';
import { Trophy, Star, Shield, TrendingUp } from 'lucide-react';

interface User {
  id: string;
  username: string | null;
  points: number;
  tier: string | null;
  tierConfig: {
    name: string;
    level: number;
    minPoints: number;
    maxPoints?: number | null;
    badgeEmoji: string;
    color: string;
    description: string;
  } | null;
  credibilityScore: number;
  positiveReviews: number;
  interests: string[];
  joinedAt: string;
  lastActive: string;
}

export default function Profile() {
  const router = useRouter();
  const { userId } = router.query;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [prevTier, setPrevTier] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    fetch(`${apiUrl}/profile/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setLoading(false);

        // Check for tier up
        if (prevTier && data.user.tier && prevTier !== data.user.tier) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        }
        setPrevTier(data.user.tier);
      })
      .catch((err) => {
        console.error('Error fetching profile:', err);
        setLoading(false);
      });
  }, [userId, prevTier]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">User not found</div>
      </div>
    );
  }

  const tierConfig = user.tierConfig;
  const tierColor = tierConfig?.color || '#6B46C1';
  const nextTierPoints = tierConfig ? (tierConfig.maxPoints || 100000) : 1000;
  const progress = tierConfig ? ((user.points / nextTierPoints) * 100) : 0;

  // Credibility stars (1-10 scale, display as 5 stars)
  const credStars = Math.round((user.credibilityScore / 10) * 5);

  return (
    <div className="min-h-screen bg-gradient-mystic text-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
          <p className="text-mystic-purple-300">@{user.username || 'Anonymous'}</p>
        </div>

        {/* Badge Carousel */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Badges</h2>
          <div className="badge-carousel">
            {tierConfig && (
              <div
                className="badge-item w-24 h-24 rounded-full flex items-center justify-center text-4xl"
                style={{
                  backgroundColor: tierColor,
                  boxShadow: `0 0 20px ${tierColor}40`,
                }}
              >
                {tierConfig.badgeEmoji}
              </div>
            )}
            {user.positiveReviews >= 10 && (
              <div className="badge-item w-24 h-24 rounded-full flex items-center justify-center text-4xl bg-yellow-500">
                🛡️
              </div>
            )}
            {/* Add more badges as needed */}
          </div>
        </div>

        {/* EP Progress Bar */}
        <div className="mb-8 bg-mystic-dark/50 rounded-lg p-6">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">EP Points</span>
            <span className="text-mystic-purple-300">
              {user.points.toLocaleString()} / {nextTierPoints.toLocaleString()}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {tierConfig ? `${tierConfig.name} L${tierConfig.level}` : 'No Tier'} - {tierConfig?.description || ''}
          </p>
        </div>

        {/* Credibility Score */}
        <div className="mb-8 bg-mystic-dark/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="font-semibold">Credibility Score</span>
            </div>
            <span className="text-2xl font-bold">{user.credibilityScore.toFixed(1)}/10</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-6 h-6 ${
                  star <= credStars ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {user.positiveReviews} positive reviews
          </p>
        </div>

        {/* Interests */}
        <div className="mb-8 bg-mystic-dark/50 rounded-lg p-6">
          <h3 className="font-semibold mb-4">Interests</h3>
          <div className="flex flex-wrap gap-2">
            {user.interests.map((interest) => {
              const emoji: Record<string, string> = {
                content_creator: '🎥',
                airdrop_hunter: '🪂',
                investor: '📈',
                founder: '👑',
                new_to_crypto: '🌱',
              };
              return (
                <span
                  key={interest}
                  className="px-3 py-1 bg-mystic-purple/30 rounded-full text-sm"
                >
                  {emoji[interest] || '•'} {interest.replace('_', ' ')}
                </span>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-mystic-dark/50 rounded-lg p-4 text-center">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
            <div className="text-2xl font-bold">{user.points.toLocaleString()}</div>
            <div className="text-sm text-gray-400">Total EP</div>
          </div>
          <div className="bg-mystic-dark/50 rounded-lg p-4 text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <div className="text-2xl font-bold">{user.positiveReviews}</div>
            <div className="text-sm text-gray-400">Positive Reviews</div>
          </div>
        </div>
      </div>
    </div>
  );
}

