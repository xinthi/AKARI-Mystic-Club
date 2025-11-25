/**
 * Telegram Mini App Authentication Utilities
 * 
 * Verifies Telegram init data and extracts user information
 */

import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramAuthData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
}

/**
 * Verify Telegram init data signature
 * @param initData - Raw init data string from Telegram WebApp
 * @param botToken - Telegram bot token
 * @returns true if signature is valid
 */
export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return false;
    }
    
    // Remove hash from params
    urlParams.delete('hash');
    
    // Sort and create data check string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Create secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Error verifying Telegram data:', error);
    return false;
  }
}

/**
 * Parse Telegram init data and extract user
 * @param initData - Raw init data string
 * @returns Parsed user data or null if invalid
 */
export function parseTelegramInitData(initData: string): TelegramAuthData | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    const authDate = urlParams.get('auth_date');
    const hash = urlParams.get('hash');
    
    if (!userParam || !authDate || !hash) {
      return null;
    }
    
    const user = JSON.parse(decodeURIComponent(userParam)) as TelegramUser;
    
    // Check auth date (should be within last 24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours
    
    if (now - authTimestamp > maxAge) {
      return null;
    }
    
    return {
      user,
      auth_date: authTimestamp,
      hash
    };
  } catch (error) {
    console.error('Error parsing Telegram init data:', error);
    return null;
  }
}

/**
 * Get user from request (from init data or headers)
 */
export function getTelegramUserFromRequest(req: any): TelegramUser | null {
  // Try to get from query params (Telegram WebApp sends initData)
  const initData = req.query.initData || req.headers['x-telegram-init-data'];
  
  if (!initData || typeof initData !== 'string') {
    return null;
  }
  
  // Verify signature
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  
  if (!verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN)) {
    console.error('Invalid Telegram init data signature');
    return null;
  }
  
  const authData = parseTelegramInitData(initData);
  return authData?.user || null;
}

