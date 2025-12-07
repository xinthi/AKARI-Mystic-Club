/**
 * Local Sentiment Analyzer
 * 
 * Simple keyword-based sentiment analysis that doesn't require external APIs.
 * This replaces the RapidAPI sentiment analysis service.
 * 
 * Returns scores from 0-100:
 * - 0-30: Negative
 * - 31-69: Neutral
 * - 70-100: Positive
 */

// =============================================================================
// SENTIMENT KEYWORDS
// =============================================================================

// Positive keywords with weights (1-3 scale)
const POSITIVE_KEYWORDS: Record<string, number> = {
  // Strong positive (3)
  'amazing': 3, 'excellent': 3, 'incredible': 3, 'fantastic': 3, 'brilliant': 3,
  'outstanding': 3, 'exceptional': 3, 'phenomenal': 3, 'bullish': 3, 'moon': 3,
  'gem': 3, 'winner': 3, 'best': 3, 'love': 3, 'perfect': 3,
  
  // Medium positive (2)
  'great': 2, 'good': 2, 'nice': 2, 'happy': 2, 'excited': 2, 'awesome': 2,
  'solid': 2, 'strong': 2, 'growing': 2, 'bullrun': 2, 'pump': 2,
  'buy': 2, 'accumulate': 2, 'opportunity': 2, 'potential': 2, 'promising': 2,
  'undervalued': 2, 'innovation': 2, 'revolutionary': 2,
  
  // Light positive (1)
  'okay': 1, 'fine': 1, 'interesting': 1, 'cool': 1, 'up': 1, 'green': 1,
  'gain': 1, 'profit': 1, 'win': 1, 'positive': 1, 'support': 1, 'like': 1,
};

// Negative keywords with weights (1-3 scale)
const NEGATIVE_KEYWORDS: Record<string, number> = {
  // Strong negative (3)
  'scam': 3, 'fraud': 3, 'rug': 3, 'rugpull': 3, 'terrible': 3, 'awful': 3,
  'horrible': 3, 'disaster': 3, 'crash': 3, 'dump': 3, 'dead': 3, 'worthless': 3,
  'hate': 3, 'worst': 3, 'avoid': 3, 'ponzi': 3, 'fake': 3,
  
  // Medium negative (2)
  'bad': 2, 'bearish': 2, 'sell': 2, 'selling': 2, 'drop': 2, 'fall': 2,
  'failing': 2, 'failed': 2, 'poor': 2, 'weak': 2, 'worried': 2, 'concern': 2,
  'risk': 2, 'risky': 2, 'overvalued': 2, 'bubble': 2, 'warning': 2,
  
  // Light negative (1)
  'down': 1, 'red': 1, 'loss': 1, 'lose': 1, 'problem': 1, 'issue': 1,
  'bug': 1, 'delay': 1, 'slow': 1, 'meh': 1, 'boring': 1,
};

// Intensifiers that modify the next word
const INTENSIFIERS: Record<string, number> = {
  'very': 1.5, 'really': 1.5, 'extremely': 2, 'super': 1.5, 'so': 1.3,
  'absolutely': 2, 'totally': 1.5, 'completely': 1.5, 'highly': 1.5,
};

// Negators that flip sentiment
const NEGATORS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'don\'t', 'doesn\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'couldn\'t',
  'shouldn\'t', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'ain\'t',
]);

// =============================================================================
// SENTIMENT ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Clean and tokenize text for analysis
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove mentions
    .replace(/@\w+/g, '')
    // Remove hashtags (keep the word)
    .replace(/#(\w+)/g, '$1')
    // Split on whitespace and punctuation
    .split(/[\s,.!?;:'"()\[\]{}]+/)
    .filter(word => word.length > 1);
}

/**
 * Analyze sentiment of a single text
 * Returns a score from 0-100
 */
export function analyzeSentiment(text: string): number {
  if (!text || text.trim().length < 3) {
    return 50; // Neutral for empty/short text
  }

  const tokens = tokenize(text);
  
  let positiveScore = 0;
  let negativeScore = 0;
  let intensifier = 1;
  let negated = false;
  
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    
    // Check for negators
    if (NEGATORS.has(word)) {
      negated = true;
      continue;
    }
    
    // Check for intensifiers
    if (INTENSIFIERS[word]) {
      intensifier = INTENSIFIERS[word];
      continue;
    }
    
    // Check for positive keywords
    if (POSITIVE_KEYWORDS[word]) {
      const score = POSITIVE_KEYWORDS[word] * intensifier;
      if (negated) {
        negativeScore += score;
      } else {
        positiveScore += score;
      }
      intensifier = 1;
      negated = false;
      continue;
    }
    
    // Check for negative keywords
    if (NEGATIVE_KEYWORDS[word]) {
      const score = NEGATIVE_KEYWORDS[word] * intensifier;
      if (negated) {
        positiveScore += score;
      } else {
        negativeScore += score;
      }
      intensifier = 1;
      negated = false;
      continue;
    }
    
    // Reset modifiers if no sentiment word found
    if (i > 0) {
      intensifier = 1;
      negated = false;
    }
  }
  
  // Calculate final score
  const totalWeight = positiveScore + negativeScore;
  
  if (totalWeight === 0) {
    return 50; // Neutral if no sentiment keywords found
  }
  
  // Score from 0-100 based on positive ratio
  const rawScore = (positiveScore / totalWeight) * 100;
  
  // Compress towards 50 to avoid extreme scores from single keywords
  const compressedScore = 50 + (rawScore - 50) * 0.6;
  
  return Math.round(Math.max(0, Math.min(100, compressedScore)));
}

/**
 * Analyze sentiment of multiple texts
 * Returns array of scores (0-100) in the same order as input
 */
export function analyzeSentiments(texts: string[]): number[] {
  return texts.map(text => analyzeSentiment(text));
}

/**
 * Analyze tweet sentiments with proper preprocessing
 */
export function analyzeTweetSentiments<T extends { text: string }>(
  tweets: T[]
): Array<T & { sentimentScore: number }> {
  return tweets.map(tweet => ({
    ...tweet,
    sentimentScore: analyzeSentiment(tweet.text),
  }));
}

/**
 * Clean tweet text before sentiment analysis
 */
export function cleanTweetText(text: string): string {
  return text
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove @mentions
    .replace(/@\w+/g, '')
    // Remove $tickers
    .replace(/\$\w+/g, '')
    // Remove hashtags (keep the word)
    .replace(/#(\w+)/g, '$1')
    // Remove RT prefix
    .replace(/^RT\s+/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get sentiment label from score
 */
export function getSentimentLabel(score: number): 'positive' | 'negative' | 'neutral' {
  if (score >= 60) return 'positive';
  if (score <= 40) return 'negative';
  return 'neutral';
}

