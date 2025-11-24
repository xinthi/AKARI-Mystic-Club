// Utility to import bot modules safely
// This helps with ESM/CommonJS compatibility in Next.js

export async function getWebhookHandler() {
  try {
    const botModule = await import('../../bot/src/index.js');
    return botModule.webhookHandler;
  } catch (error) {
    console.error('Failed to import webhook handler:', error);
    throw error;
  }
}

export async function getTwitterOAuthClient() {
  try {
    const twitterModule = await import('../../bot/src/utils/twitter.js');
    return twitterModule.getTwitterOAuthClient;
  } catch (error) {
    console.error('Failed to import Twitter client:', error);
    throw error;
  }
}

export async function getOverallLeaderboard() {
  try {
    const leaderboardModule = await import('../../bot/src/utils/leaderboard.js');
    return leaderboardModule.getOverallLeaderboard;
  } catch (error) {
    console.error('Failed to import leaderboard utils:', error);
    throw error;
  }
}

