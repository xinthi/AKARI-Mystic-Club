/**
 * Check Telegram Bot Status
 * 
 * Verifies:
 * 1. Bot token is set
 * 2. Webhook is configured
 * 3. Bot can receive updates
 */

// Try to load dotenv if available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use environment variables directly
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
  console.log('💡 Make sure .env file exists in the root directory');
  process.exit(1);
}

async function checkBotStatus() {
  console.log('🔍 Checking bot status...\n');

  try {
    // Check bot info
    const botInfoResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const botInfo = await botInfoResponse.json();

    if (!botInfo.ok) {
      console.error('❌ Invalid bot token');
      console.error('Error:', botInfo.description);
      return;
    }

    console.log('✅ Bot Token: Valid');
    console.log(`   Bot Name: @${botInfo.result.username}`);
    console.log(`   Bot ID: ${botInfo.result.id}`);
    console.log(`   Bot Name: ${botInfo.result.first_name}\n`);

    // Check webhook info
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const webhookInfo = await webhookResponse.json();

    if (!webhookInfo.ok) {
      console.error('❌ Failed to get webhook info');
      return;
    }

    const webhook = webhookInfo.result;

    if (webhook.url) {
      console.log('✅ Webhook: Configured');
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Pending Updates: ${webhook.pending_update_count}`);
      
      if (webhook.last_error_date) {
        console.log(`   ⚠️  Last Error: ${new Date(webhook.last_error_date * 1000).toLocaleString()}`);
        console.log(`   Error Message: ${webhook.last_error_message}`);
      } else {
        console.log('   ✅ No errors');
      }

      if (webhook.last_error_date) {
        const errorAge = Date.now() / 1000 - webhook.last_error_date;
        if (errorAge < 3600) { // Less than 1 hour
          console.log('\n⚠️  Warning: Recent webhook errors detected!');
        }
      }
    } else {
      console.log('❌ Webhook: Not configured');
      console.log('💡 Set webhook using:');
      const vercelUrl = process.env.VERCEL_URL || process.env.TELEGRAM_WEBAPP_URL || 'your-app.vercel.app';
      console.log(`   curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://${vercelUrl}/api/webhook"`);
    }

    console.log('\n📊 Summary:');
    if (webhook.url && !webhook.last_error_date) {
      console.log('✅ Bot is ready and receiving updates');
    } else if (webhook.url && webhook.last_error_date) {
      console.log('⚠️  Bot webhook has errors - check Vercel logs');
    } else {
      console.log('❌ Bot webhook not configured - set it up first');
    }

  } catch (error) {
    console.error('❌ Error checking bot status:', error.message);
  }
}

checkBotStatus();

