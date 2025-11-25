/**
 * Telegram Bot Webhook Handler for Vercel
 * 
 * BUG FIX EXPLANATION:
 * The previous implementation tried to dynamically import a handler function from the bot module.
 * In production, Next.js minification and module resolution caused the imported handler to be
 * undefined or not a function, resulting in "TypeError: u is not a function".
 * 
 * SOLUTION:
 * Instead of importing a handler function, we now directly import the bot instance and call
 * bot.handleUpdate() directly. This is the recommended pattern for Grammy.js in serverless
 * environments and avoids module resolution issues.
 * 
 * TO SET WEBHOOK:
 * POST to: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
 * Body: { "url": "https://your-app.vercel.app/api/webhook" }
 * 
 * Or use curl:
 * curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// Lazy-load bot instance to avoid build-time issues
let botInstance: any = null;
let botInitialized = false;

async function getBotInstance() {
  if (botInitialized && botInstance) {
    return botInstance;
  }

  try {
    // Dynamic import to avoid bundling bot code at build time
    const botModule = await import('../../bot/src/index.js');
    
    // Import the default export which is the bot instance
    botInstance = botModule.default;
    
    if (!botInstance || typeof botInstance.handleUpdate !== 'function') {
      throw new Error('Bot instance not properly initialized');
    }
    
    botInitialized = true;
    return botInstance;
  } catch (error) {
    console.error('Failed to load bot instance:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests, return 200 for other methods (Telegram requirement)
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  // Validate environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('Telegram webhook error: Missing TELEGRAM_BOT_TOKEN');
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  if (!process.env.DATABASE_URL) {
    console.error('Telegram webhook error: Missing DATABASE_URL');
    return res.status(500).json({ ok: false, error: 'Database not configured' });
  }

  // Optional: Validate webhook secret if configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== webhookSecret) {
      console.error('Telegram webhook error: Invalid webhook secret');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    // Get bot instance (lazy-loaded)
    const bot = await getBotInstance();

    // Parse update from request body
    // Next.js automatically parses JSON, but handle both cases
    let update: any;
    if (typeof req.body === 'string') {
      try {
        update = JSON.parse(req.body);
      } catch (parseError) {
        console.error('Telegram webhook error: Failed to parse JSON body', parseError);
        return res.status(400).json({ ok: false, error: 'Invalid JSON' });
      }
    } else {
      update = req.body;
    }

    // Validate update structure
    if (!update || typeof update !== 'object') {
      console.error('Telegram webhook error: Invalid update format', update);
      return res.status(400).json({ ok: false, error: 'Invalid update format' });
    }

    if (!update.update_id) {
      console.error('Telegram webhook error: Missing update_id', update);
      return res.status(400).json({ ok: false, error: 'Missing update_id' });
    }

    // Defensive checks for update structure
    // Ensure message, callback_query, etc. are properly structured
    if (update.message && typeof update.message !== 'object') {
      console.error('Telegram webhook error: Invalid message structure', update);
      return res.status(400).json({ ok: false, error: 'Invalid message structure' });
    }

    // Handle the update using Grammy.js bot.handleUpdate()
    // This is the recommended pattern for serverless webhooks
    await bot.handleUpdate(update);

    // Success response (Telegram expects 200 OK)
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    // Log error with clear message for Vercel logs
    console.error('Telegram webhook error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      update: req.body?.update_id ? { update_id: req.body.update_id } : 'no update_id'
    });

    // Return error response (but still 200 to avoid Telegram retries for transient errors)
    // Telegram will retry on 5xx, so we return 200 with ok: false for non-critical errors
    if (!res.headersSent) {
      return res.status(200).json({ 
        ok: false, 
        error: 'Internal server error',
        // Only include error details in development
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      });
    }
  }
}

// Configure Next.js API route
// We use default JSON parsing (bodyParser: true) since Telegram sends JSON
// If you need raw body for signature verification, uncomment the config below:
// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };
