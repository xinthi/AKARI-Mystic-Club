/**
 * Tweet Clustering Helper for Deep Explorer
 * 
 * Groups tweets into topic-based clusters using keyword matching.
 * This is a web-compatible version that doesn't import server-only modules.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectTweet {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  // Note: quotes not available in current schema, using 0
}

export interface TweetCluster {
  topic: string;        // e.g. 'defi', 'nfts', 'ai', 'memes'
  label: string;        // human label
  tweets: ProjectTweet[];
  totalEngagement: number;  // sum of likes + replies + retweets
}

// =============================================================================
// TOPIC CONFIGURATION (web-compatible copy)
// =============================================================================

const PROFILE_TOPICS = [
  'ai',
  'defi',
  'nfts',
  'news',
  'macro',
  'airdrops',
  'memes',
  'trading',
  'gaming',
  'crypto',
] as const;

type ProfileTopic = (typeof PROFILE_TOPICS)[number];

const TOPIC_KEYWORDS: Record<ProfileTopic, string[]> = {
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'gpt', 
    'llm', 'neural', 'deep learning', 'chatgpt', 'openai', 'anthropic',
    'claude', 'gemini', 'copilot', 'ai agent', 'autonomous agent',
    'generative ai', 'diffusion', 'stable diffusion', 'midjourney',
  ],
  
  defi: [
    'defi', 'decentralized finance', 'lending', 'borrowing', 'liquidity',
    'yield', 'farming', 'staking', 'lp', 'liquidity pool', 'amm',
    'swap', 'dex', 'uniswap', 'sushiswap', 'curve', 'aave', 'compound',
    'maker', 'dai', 'vault', 'protocol', 'tvl', 'apr', 'apy',
    'impermanent loss', 'flash loan', 'leverage', 'collateral',
  ],
  
  nfts: [
    'nft', 'nfts', 'erc721', 'erc-721', '721', 'mint', 'minting',
    'pfp', 'jpeg', 'jpegs', 'floor', 'floor price', 'opensea',
    'blur', 'rarible', 'foundation', 'art blocks', 'generative art',
    'digital art', 'collectible', 'ordinals', 'inscriptions', 'brc20',
    'punks', 'bayc', 'azuki', 'doodles', 'pudgy',
  ],
  
  news: [
    'breaking', 'just in', 'announcement', 'announced', 'launches',
    'launched', 'partnership', 'partners', 'collaboration', 'integrates',
    'integration', 'update', 'release', 'released', 'introducing',
    'unveils', 'revealed', 'confirms', 'confirmed', 'report',
    'according to', 'sources say', 'exclusive', 'developing',
  ],
  
  macro: [
    'macro', 'fed', 'federal reserve', 'interest rate', 'inflation',
    'cpi', 'gdp', 'recession', 'economy', 'economic', 'fiscal',
    'monetary', 'treasury', 'bonds', 'yields', 'dollar', 'dxy',
    'forex', 'geopolitical', 'regulation', 'sec', 'congress',
    'policy', 'etf', 'institutional', 'blackrock', 'grayscale',
  ],
  
  airdrops: [
    'airdrop', 'airdrops', 'claim', 'claiming', 'whitelist', 'wl',
    'allowlist', 'al', 'free mint', 'giveaway', 'drop', 'snapshot',
    'eligible', 'eligibility', 'retroactive', 'retro', 'allocation',
    'points', 'season', 'epoch', 'quest', 'testnet', 'incentive',
  ],
  
  memes: [
    'meme', 'memes', 'memecoin', 'memecoins', 'doge', 'shib', 'pepe',
    'wojak', 'frog', 'dog', 'cat', 'wen', 'wagmi', 'ngmi', 'gm',
    'ser', 'fren', 'based', 'rekt', 'ape', 'apeing', 'degen',
    'pump', 'pumping', 'moon', 'mooning', 'diamond hands', 'paper hands',
    'hodl', 'fomo', 'fud', 'copium', 'hopium', 'bonk', 'wif',
  ],
  
  trading: [
    'trading', 'trade', 'long', 'short', 'leverage', 'perp', 'perps',
    'perpetual', 'futures', 'options', 'spot', 'margin', 'liquidation',
    'liquidated', 'position', 'entry', 'exit', 'stop loss', 'take profit',
    'tp', 'sl', 'rsi', 'macd', 'ema', 'support', 'resistance',
    'breakout', 'breakdown', 'bullish', 'bearish', 'ta', 'chart',
    'pattern', 'candle', 'wick', 'volume', 'orderbook', 'bid', 'ask',
  ],
  
  gaming: [
    'gaming', 'game', 'games', 'gamefi', 'play to earn', 'p2e',
    'metaverse', 'virtual world', 'avatar', 'in-game', 'guild',
    'esports', 'steam', 'epic', 'xbox', 'playstation', 'nintendo',
    'mobile gaming', 'web3 gaming', 'blockchain game', 'axie',
    'sandbox', 'decentraland', 'immutable', 'gala', 'illuvium',
  ],
  
  crypto: [
    'crypto', 'cryptocurrency', 'bitcoin', 'btc', 'ethereum', 'eth',
    'blockchain', 'web3', 'decentralized', 'token', 'coin', 'wallet',
    'address', 'transaction', 'hash', 'block', 'chain', 'network',
    'mainnet', 'layer', 'l1', 'l2', 'rollup', 'bridge', 'cross-chain',
    'solana', 'sol', 'polygon', 'matic', 'avalanche', 'avax',
    'binance', 'bnb', 'coinbase', 'exchange', 'cex', 'self-custody',
  ],
};

const TOPIC_DISPLAY: Record<ProfileTopic, { label: string; emoji: string }> = {
  ai: { label: 'AI & ML', emoji: '🤖' },
  defi: { label: 'DeFi', emoji: '🏦' },
  nfts: { label: 'NFTs', emoji: '🎨' },
  news: { label: 'News', emoji: '📰' },
  macro: { label: 'Macro', emoji: '🌍' },
  airdrops: { label: 'Airdrops', emoji: '🪂' },
  memes: { label: 'Memes', emoji: '🐸' },
  trading: { label: 'Trading', emoji: '📈' },
  gaming: { label: 'Gaming', emoji: '🎮' },
  crypto: { label: 'Crypto', emoji: '₿' },
};

// =============================================================================
// CLASSIFICATION
// =============================================================================

/**
 * Classify a single tweet into topics based on keyword matching.
 * Returns up to 2 topics per tweet.
 */
function classifyTweetTopics(text: string): ProfileTopic[] {
  const lowerText = text.toLowerCase();
  const matchedTopics: { topic: ProfileTopic; matchCount: number }[] = [];
  
  for (const topic of PROFILE_TOPICS) {
    const keywords = TOPIC_KEYWORDS[topic];
    let matchCount = 0;
    
    for (const keyword of keywords) {
      // Use word boundary matching for short keywords, contains for longer ones
      if (keyword.length <= 3) {
        // Short keyword - require word boundary
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
        if (regex.test(lowerText)) {
          matchCount++;
        }
      } else {
        // Longer keyword - simple contains
        if (lowerText.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
    }
    
    if (matchCount > 0) {
      matchedTopics.push({ topic, matchCount });
    }
  }
  
  // Sort by match count and return top 2
  matchedTopics.sort((a, b) => b.matchCount - a.matchCount);
  return matchedTopics.slice(0, 2).map(m => m.topic);
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// CLUSTERING
// =============================================================================

/**
 * Build tweet clusters by grouping tweets into topics.
 * 
 * @param tweets - Array of project tweets
 * @param maxClusters - Maximum number of clusters to return (default: 5)
 * @returns Array of tweet clusters sorted by total engagement
 */
export function buildTweetClusters(
  tweets: ProjectTweet[],
  maxClusters: number = 5
): TweetCluster[] {
  // Filter tweets from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentTweets = tweets.filter(tweet => {
    const tweetDate = new Date(tweet.createdAt);
    return tweetDate >= thirtyDaysAgo;
  });
  
  if (recentTweets.length === 0) {
    return [];
  }
  
  // Group tweets by topic
  const topicMap = new Map<ProfileTopic, ProjectTweet[]>();
  
  for (const tweet of recentTweets) {
    const topics = classifyTweetTopics(tweet.text || '');
    
    // A tweet can belong to up to 2 topics
    for (const topic of topics) {
      if (!topicMap.has(topic)) {
        topicMap.set(topic, []);
      }
      topicMap.get(topic)!.push(tweet);
    }
  }
  
  // Build clusters with engagement totals
  const clusters: TweetCluster[] = [];
  
  for (const [topic, topicTweets] of topicMap.entries()) {
    // Calculate total engagement for this topic
    const totalEngagement = topicTweets.reduce((sum, tweet) => {
      return sum + tweet.likes + tweet.replies + tweet.retweets;
    }, 0);
    
    // Sort tweets by engagement (descending) and keep top 10 per cluster
    const sortedTweets = [...topicTweets].sort((a, b) => {
      const engagementA = a.likes + a.replies + a.retweets;
      const engagementB = b.likes + b.replies + b.retweets;
      return engagementB - engagementA;
    }).slice(0, 10);
    
    const display = TOPIC_DISPLAY[topic];
    
    clusters.push({
      topic,
      label: `${display.emoji} ${display.label}`,
      tweets: sortedTweets,
      totalEngagement,
    });
  }
  
  // Sort by total engagement descending
  clusters.sort((a, b) => b.totalEngagement - a.totalEngagement);
  
  // Return top maxClusters
  return clusters.slice(0, maxClusters);
}

