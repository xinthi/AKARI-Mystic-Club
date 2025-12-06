/**
 * RapidAPI Sentiment Analysis Helper Module
 * 
 * Provides functions to analyze sentiment of tweet text using the
 * Sentiment Analysis API on RapidAPI.
 * 
 * API: https://rapidapi.com/softwaredeveloper2009/api/sentiment-analysis38
 * 
 * ⚠️ SERVER-SIDE ONLY - Never import this in frontend code!
 */

import axios, { AxiosInstance } from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// Sentiment Analysis API configuration
const SENTIMENT_API_HOST = 'sentiment-analysis38.p.rapidapi.com';
const SENTIMENT_API_BASE = `https://${SENTIMENT_API_HOST}`;

// Rate limiting: process texts sequentially with a small delay
const DELAY_BETWEEN_CALLS_MS = 100;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  /** Original text */
  text: string;
  /** Sentiment label: positive, negative, neutral */
  label: 'positive' | 'negative' | 'neutral';
  /** Confidence score 0-1 */
  confidence: number;
  /** Normalized score 0-100 (0=very negative, 50=neutral, 100=very positive) */
  score: number;
}

/**
 * Raw API response structure (may vary)
 */
interface RawApiResponse {
  // The API may return different structures, we handle multiple formats
  label?: string;
  sentiment?: string;
  score?: number;
  confidence?: number;
  result?: {
    label?: string;
    sentiment?: string;
    score?: number;
  };
  output?: {
    label?: string;
    sentiment?: string;
    score?: number;
  };
  // Array format
  [index: number]: {
    label?: string;
    score?: number;
  };
}

// =============================================================================
// HTTP CLIENT
// =============================================================================

/**
 * Create an Axios instance configured for RapidAPI Sentiment endpoints
 */
function createSentimentClient(): AxiosInstance {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY environment variable is not set');
  }

  return axios.create({
    baseURL: SENTIMENT_API_BASE,
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': SENTIMENT_API_HOST,
    },
    timeout: 30000,
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Map a sentiment label to a numeric score (0-100)
 */
function labelToScore(label: string): number {
  const normalizedLabel = label.toLowerCase().trim();
  
  if (normalizedLabel.includes('positive') || normalizedLabel === 'pos') {
    return 80;
  } else if (normalizedLabel.includes('negative') || normalizedLabel === 'neg') {
    return 20;
  } else {
    // neutral or unknown
    return 50;
  }
}

/**
 * Map a numeric sentiment value to 0-100 scale
 * Handles both [0,1] and [-1,1] ranges
 */
function numericToScore(value: number): number {
  // If value is in [-1, 1] range (common for sentiment APIs)
  if (value >= -1 && value <= 1) {
    // Map -1 to 0, 0 to 50, 1 to 100
    return Math.round(((value + 1) / 2) * 100);
  }
  
  // If value is already in [0, 1] range
  if (value >= 0 && value <= 1) {
    return Math.round(value * 100);
  }
  
  // If value is in [0, 100] range already
  if (value >= 0 && value <= 100) {
    return Math.round(value);
  }
  
  // Fallback
  return 50;
}

/**
 * Parse the API response and extract a sentiment score
 */
function parseApiResponse(response: RawApiResponse): number {
  // Try to find a label
  const label = 
    response.label || 
    response.sentiment || 
    response.result?.label || 
    response.result?.sentiment ||
    response.output?.label ||
    response.output?.sentiment ||
    (Array.isArray(response) && response[0]?.label);

  if (label && typeof label === 'string') {
    return labelToScore(label);
  }

  // Try to find a numeric score
  const score = 
    response.score ?? 
    response.confidence ??
    response.result?.score ??
    response.output?.score ??
    (Array.isArray(response) && response[0]?.score);

  if (typeof score === 'number') {
    return numericToScore(score);
  }

  // If response is an array with label objects (common format)
  if (Array.isArray(response) && response.length > 0) {
    // Find the highest scoring label
    let bestLabel = '';
    let bestScore = -1;
    
    for (const item of response) {
      if (item && typeof item === 'object' && 'label' in item && 'score' in item) {
        if (typeof item.score === 'number' && item.score > bestScore) {
          bestScore = item.score;
          bestLabel = item.label || '';
        }
      }
    }
    
    if (bestLabel) {
      return labelToScore(bestLabel);
    }
  }

  // Fallback to neutral
  return 50;
}

/**
 * Delay execution for a specified time
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Analyze sentiment of a single text.
 * 
 * @param text - Text to analyze
 * @returns Sentiment result with score 0-100
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  const client = createSentimentClient();

  try {
    const response = await client.post('/pipeline', {
      input: text,
    });

    const data = response.data as RawApiResponse;
    const score = parseApiResponse(data);

    // Determine label from score
    let label: 'positive' | 'negative' | 'neutral';
    if (score >= 60) {
      label = 'positive';
    } else if (score <= 40) {
      label = 'negative';
    } else {
      label = 'neutral';
    }

    return {
      text,
      label,
      confidence: Math.abs(score - 50) / 50, // Convert score to confidence 0-1
      score,
    };
  } catch (error: any) {
    console.error('[Sentiment API] Error analyzing text:', error.message);
    
    // Return neutral on error to avoid breaking the pipeline
    return {
      text,
      label: 'neutral',
      confidence: 0,
      score: 50,
    };
  }
}

/**
 * Analyze sentiment of multiple texts.
 * Processes texts sequentially to avoid rate limiting.
 * Returns array of scores (0-100) in the same order as input.
 * 
 * @param texts - Array of texts to analyze
 * @returns Array of sentiment scores (0-100)
 */
export async function analyzeSentiments(texts: string[]): Promise<number[]> {
  if (texts.length === 0) return [];

  const scores: number[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    
    // Skip empty or very short texts
    if (!text || text.trim().length < 3) {
      scores.push(50); // neutral
      continue;
    }

    try {
      const result = await analyzeSentiment(text);
      scores.push(result.score);
    } catch (error: any) {
      console.error(`[Sentiment API] Error on text ${i + 1}/${texts.length}:`, error.message);
      scores.push(50); // neutral fallback
    }

    // Add delay between calls to avoid rate limiting (except for last item)
    if (i < texts.length - 1) {
      await delay(DELAY_BETWEEN_CALLS_MS);
    }
  }

  return scores;
}

/**
 * Analyze sentiment with caching/deduplication.
 * Useful when the same text appears multiple times.
 * 
 * @param texts - Array of texts to analyze
 * @returns Map of text -> score
 */
export async function analyzeSentimentsWithCache(texts: string[]): Promise<Map<string, number>> {
  const cache = new Map<string, number>();
  const uniqueTexts = [...new Set(texts.filter(t => t && t.trim().length >= 3))];

  const scores = await analyzeSentiments(uniqueTexts);

  for (let i = 0; i < uniqueTexts.length; i++) {
    cache.set(uniqueTexts[i], scores[i]);
  }

  return cache;
}

/**
 * Clean tweet text before sentiment analysis.
 * Removes URLs, mentions, and common noise.
 * 
 * @param text - Raw tweet text
 * @returns Cleaned text
 */
export function cleanTweetText(text: string): string {
  return text
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove @mentions (but keep the context)
    .replace(/@\w+/g, '')
    // Remove $tickers (but keep the context)
    .replace(/\$\w+/g, '')
    // Remove hashtags (keep the word, remove #)
    .replace(/#(\w+)/g, '$1')
    // Remove RT prefix
    .replace(/^RT\s+/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyze sentiment of tweets with proper preprocessing.
 * 
 * @param tweets - Array of tweet objects with text
 * @returns Array of objects with original tweet and sentiment score
 */
export async function analyzeTweetSentiments<T extends { text: string }>(
  tweets: T[]
): Promise<Array<T & { sentimentScore: number }>> {
  if (tweets.length === 0) return [];

  // Clean and prepare texts
  const cleanedTexts = tweets.map((t) => cleanTweetText(t.text));

  // Filter out empty texts and track indices
  const nonEmptyIndices: number[] = [];
  const textsToAnalyze: string[] = [];

  for (let i = 0; i < cleanedTexts.length; i++) {
    if (cleanedTexts[i].length >= 3) {
      nonEmptyIndices.push(i);
      textsToAnalyze.push(cleanedTexts[i]);
    }
  }

  // Analyze non-empty texts
  const scores = await analyzeSentiments(textsToAnalyze);

  // Map scores back to original tweets
  const scoreMap = new Map<number, number>();
  for (let i = 0; i < nonEmptyIndices.length; i++) {
    scoreMap.set(nonEmptyIndices[i], scores[i]);
  }

  // Return tweets with sentiment scores
  return tweets.map((tweet, index) => ({
    ...tweet,
    sentimentScore: scoreMap.get(index) ?? 50, // Default to neutral if text was empty
  }));
}
