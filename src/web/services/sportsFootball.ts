/**
 * Sports Football Service
 * 
 * Fetches today's featured football matches from API-FOOTBALL.
 * 
 * Requires API_FOOTBALL_KEY in environment variables.
 */

export type FootballMatch = {
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: Date;
};

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: {
      name: string;
    };
    away: {
      name: string;
    };
  };
}

interface ApiFootballResponse {
  response: ApiFootballFixture[];
}

const API_FOOTBALL_BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

/**
 * Get upcoming football matches globally.
 * Returns up to the specified limit (default: 10).
 * Only returns matches that haven't started yet (kickOff > now).
 */
export async function getTodayFeaturedMatches(limit: number = 10): Promise<FootballMatch[]> {
  if (!API_FOOTBALL_KEY) {
    console.warn('[sportsFootball] API_FOOTBALL_KEY not set in environment variables');
    return [];
  }

  try {
    const url = new URL(`${API_FOOTBALL_BASE_URL}/fixtures`);
    url.searchParams.set('next', limit.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': API_FOOTBALL_KEY || '',
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      console.error('[sportsFootball] error:', `API-FOOTBALL fixtures API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: ApiFootballResponse = await response.json();

    if (!data.response || !Array.isArray(data.response)) {
      console.warn('[sportsFootball] Invalid response format from API-FOOTBALL');
      return [];
    }

    console.log('[sportsFootball] fixtures received (next):', data.response.length);

    const now = new Date();

    // Map and filter matches
    const matches: FootballMatch[] = data.response
      .map((item) => {
        const kickOff = new Date(item.fixture.date);
        return {
          fixtureId: item.fixture.id,
          leagueId: item.league.id,
          leagueName: item.league.name,
          homeTeam: item.teams.home.name,
          awayTeam: item.teams.away.name,
          kickOff,
        };
      })
      .filter((match) => match.kickOff > now); // Only future matches

    return matches;
  } catch (error) {
    console.error('[sportsFootball] error:', error);
    return [];
  }
}

