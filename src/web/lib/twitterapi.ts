/**
 * TwitterAPI.io server-side helper
 *
 * Uses Authorization: Bearer <key> and never runs client-side.
 */

const BASE_URL = process.env.TWITTERAPI_IO_BASE_URL
  || process.env.TWITTERAPIIO_BASE_URL
  || 'https://api.twitterapi.io';

const API_KEY = process.env.TWITTERAPI_IO_KEY
  || process.env.TWITTERAPIIO_API_KEY;

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function twitterApiGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  if (!API_KEY) {
    throw new Error('[TwitterAPI.io] TWITTERAPI_IO_KEY is not set');
  }

  const url = `${BASE_URL}${path}${buildQueryString(params)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000;
    await sleep(Number.isFinite(waitMs) ? waitMs : 1000);
    const retryRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!retryRes.ok) {
      const retryText = await retryRes.text();
      throw new Error(`[TwitterAPI.io] ${retryRes.status} ${retryRes.statusText}: ${retryText}`);
    }
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[TwitterAPI.io] ${res.status} ${res.statusText}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function sanitizeApiError(message: string): string {
  return message.replace(/TwitterAPI\.io/gi, 'X API');
}

export async function twitterApiGetTweetByIdDebug(
  tweetId: string,
  tweetUrl?: string
): Promise<{ data: any | null; errors: string[] }> {
  const paramAttempts = [
    { tweetId },
    { tweet_id: tweetId },
    { id: tweetId },
  ];
  let cleanUrl = tweetUrl;
  if (tweetUrl) {
    try {
      const parsed = new URL(tweetUrl);
      parsed.search = '';
      parsed.hash = '';
      cleanUrl = parsed.toString();
    } catch {
      cleanUrl = tweetUrl;
    }
  }
  const urlAttempts = cleanUrl
    ? [
        { url: cleanUrl },
        { tweet_url: cleanUrl },
        { tweetUrl: cleanUrl },
      ]
    : [];
  const endpointAttempts = [
    '/twitter/tweet/info',
    '/twitter/tweet/lookup',
    '/twitter/tweet',
  ];
  const errors: string[] = [];

  for (const path of endpointAttempts) {
    for (const params of paramAttempts) {
      try {
        const data = await twitterApiGet<any>(path, params);
        if (data) return { data, errors };
      } catch (err: any) {
        const msg = err?.message || 'Unknown error';
        errors.push(`${path} ${JSON.stringify(params)} -> ${sanitizeApiError(msg)}`);
      }
    }
    for (const params of urlAttempts) {
      try {
        const data = await twitterApiGet<any>(path, params);
        if (data) return { data, errors };
      } catch (err: any) {
        const msg = err?.message || 'Unknown error';
        errors.push(`${path} ${JSON.stringify(params)} -> ${sanitizeApiError(msg)}`);
      }
    }
  }

  return { data: null, errors };
}

export async function twitterApiGetTweetById(tweetId: string, tweetUrl?: string): Promise<any | null> {
  const result = await twitterApiGetTweetByIdDebug(tweetId, tweetUrl);
  return result.data;
}

export async function twitterApiSearchTweetsDebug(
  query: string,
  limit = 25
): Promise<{ data: any | null; errors: string[] }> {
  const errors: string[] = [];
  const endpointAttempts = [
    '/twitter/tweet/search',
    '/twitter/tweets/search',
    '/twitter/search',
  ];
  const paramAttempts = [
    { query, limit },
    { q: query, limit },
    { query },
    { q: query },
  ];

  for (const path of endpointAttempts) {
    for (const params of paramAttempts) {
      try {
        const data = await twitterApiGet<any>(path, params);
        if (data) return { data, errors };
      } catch (err: any) {
        const msg = err?.message || 'Unknown error';
        errors.push(`${path} ${JSON.stringify(params)} -> ${sanitizeApiError(msg)}`);
      }
    }
  }

  return { data: null, errors };
}
