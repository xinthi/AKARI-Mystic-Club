// Utility to import bot modules safely
// This helps with ESM/CommonJS compatibility in Next.js
// Note: Bot code is excluded from Next.js type checking via tsconfig.json

export async function getWebhookHandler() {
  try {
    // @ts-ignore - Bot code is excluded from type checking
    const botModule = await import('../../bot/src/index.js');
    return botModule.webhookHandler;
  } catch (error) {
    console.error('Failed to import webhook handler:', error);
    throw error;
  }
}

export async function getTwitterOAuthClient() {
  try {
    // @ts-ignore - Bot code is excluded from type checking
    const twitterModule = await import('../../bot/src/utils/twitter.js');
    return twitterModule.getTwitterOAuthClient;
  } catch (error) {
    console.error('Failed to import Twitter client:', error);
    throw error;
  }
}

export async function getOverallLeaderboard() {
  try {
    // @ts-ignore - Bot code is excluded from type checking
    const leaderboardModule = await import('../../bot/src/utils/leaderboard.js');
    return leaderboardModule.getOverallLeaderboard as (tierPattern: string | null) => Promise<any[]>;
  } catch (error) {
    console.error('Failed to import leaderboard utils:', error);
    throw error;
  }
}

