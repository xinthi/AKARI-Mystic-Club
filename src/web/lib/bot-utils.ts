/**
 * Temporary stub helpers for bot-related logic.
 * 
 * The real implementations used to live in src/bot, but the web app
 * currently runs without talking to the bot directly.
 * 
 * These functions are placeholders to maintain API compatibility
 * while the web app builds successfully without bot dependencies.
 */

export async function getWebhookHandler() {
  // TODO: implement real logic later if needed
  // This was previously used to import the bot's webhook handler
  // The webhook is now handled directly in pages/api/webhook.ts
  throw new Error('getWebhookHandler is not implemented - use pages/api/webhook.ts directly');
}

export async function getTwitterOAuthClient() {
  // TODO: implement real logic later if needed
  // This was previously used for X/Twitter OAuth integration
  // Currently, X callback is a stub endpoint in pages/api/x-callback.ts
  throw new Error('getTwitterOAuthClient is not implemented - X callback is currently a stub');
}

export async function getOverallLeaderboard(tierPattern: string | null = null) {
  // TODO: implement real logic later if needed
  // This was previously used to get leaderboard data from bot utilities
  // Leaderboard is now handled via API routes in pages/api/leaderboard/
  console.warn('getOverallLeaderboard is a stub - use /api/leaderboard instead');
  return [];
}

