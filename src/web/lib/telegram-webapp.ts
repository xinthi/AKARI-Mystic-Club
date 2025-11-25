// src/web/lib/telegram-webapp.ts

/**
 * Safe helper to access the Telegram WebApp SDK in a Next.js app.
 * It only loads the SDK on the client (browser), never on the server.
 */

export function getWebApp() {
  if (typeof window === 'undefined') {
    return null;
  }

  // Load the SDK only on the client
  const sdk = require('@twa-dev/sdk');

  // Support both default and named export
  const WebApp = sdk.default ?? sdk;

  return WebApp;
}

