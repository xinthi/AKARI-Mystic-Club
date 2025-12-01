/**
 * Admin Set Webhook API
 * 
 * Sets the Telegram webhook with proper allowed_updates to receive my_chat_member events
 * 
 * POST /api/admin/set-webhook
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify admin token
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return res.status(500).json({ ok: false, message: 'Admin panel not configured' });
  }

  const providedToken = req.headers['x-admin-token'] as string | undefined;
  if (!providedToken || providedToken !== adminToken) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, message: 'Bot token not configured' });
  }

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`
    : null;

  if (!webhookUrl) {
    return res.status(500).json({ ok: false, message: 'NEXT_PUBLIC_APP_URL not configured' });
  }

  try {
    // First, get current webhook info
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoData = await infoRes.json();
    
    console.log('[SetWebhook] Current webhook info:', infoData);

    // Set webhook with all necessary update types
    const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: [
          'message',
          'edited_message',
          'callback_query',
          'inline_query',
          'chosen_inline_result',
          'pre_checkout_query',
          'my_chat_member',    // Bot added/removed from chats
          'chat_member',       // User joins/leaves chat
          'chat_join_request',
        ],
        drop_pending_updates: false,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
      }),
    });

    const setData = await setRes.json();
    console.log('[SetWebhook] Set webhook result:', setData);

    if (!setData.ok) {
      return res.status(500).json({ 
        ok: false, 
        message: 'Failed to set webhook',
        error: setData.description,
      });
    }

    // Get updated webhook info
    const newInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const newInfoData = await newInfoRes.json();

    return res.status(200).json({
      ok: true,
      message: 'Webhook configured successfully',
      webhookUrl,
      previousInfo: infoData.result,
      newInfo: newInfoData.result,
    });

  } catch (error: any) {
    console.error('[SetWebhook] Error:', error);
    return res.status(500).json({ 
      ok: false, 
      message: 'Server error',
      error: error.message,
    });
  }
}

