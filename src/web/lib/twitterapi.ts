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

export async function twitterApiGetTweetById(tweetId: string): Promise<any | null> {
  const attempts = [
    { tweetId },
    { tweet_id: tweetId },
    { id: tweetId },
  ];

  for (const params of attempts) {
    try {
      const data = await twitterApiGet<any>('/twitter/tweet/info', params);
      if (data) return data;
    } catch {
      // try next param shape
    }
  }

  return null;
}
