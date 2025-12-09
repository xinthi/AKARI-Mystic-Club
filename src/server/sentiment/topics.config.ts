/**
 * Topic Configuration for Zone of Expertise
 * 
 * Defines the fixed list of profile topics and keyword mappings
 * for classifying tweet content.
 */

// =============================================================================
// TOPIC DEFINITIONS
// =============================================================================

export const PROFILE_TOPICS = [
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

export type ProfileTopic = (typeof PROFILE_TOPICS)[number];

// =============================================================================
// KEYWORD MAPPINGS
// =============================================================================

/**
 * Keywords that indicate a tweet belongs to a specific topic.
 * Keywords are matched case-insensitively.
 * A tweet can match multiple topics (0-2 typically).
 */
export const TOPIC_KEYWORDS: Record<ProfileTopic, string[]> = {
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

// =============================================================================
// TOPIC DISPLAY INFO
// =============================================================================

/**
 * Display labels and colors for each topic (for future UI use)
 */
export const TOPIC_DISPLAY: Record<ProfileTopic, { label: string; color: string; emoji: string }> = {
  ai: { label: 'AI & ML', color: '#8B5CF6', emoji: '🤖' },
  defi: { label: 'DeFi', color: '#10B981', emoji: '🏦' },
  nfts: { label: 'NFTs', color: '#F59E0B', emoji: '🎨' },
  news: { label: 'News', color: '#3B82F6', emoji: '📰' },
  macro: { label: 'Macro', color: '#EF4444', emoji: '🌍' },
  airdrops: { label: 'Airdrops', color: '#EC4899', emoji: '🪂' },
  memes: { label: 'Memes', color: '#FBBF24', emoji: '🐸' },
  trading: { label: 'Trading', color: '#14B8A6', emoji: '📈' },
  gaming: { label: 'Gaming', color: '#6366F1', emoji: '🎮' },
  crypto: { label: 'Crypto', color: '#F97316', emoji: '₿' },
};

