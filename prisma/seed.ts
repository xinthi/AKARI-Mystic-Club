import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Akari database...');

  // 1. Create sample user
  const user = await prisma.user.upsert({
    where: { telegramId: process.env.ADMIN_TELEGRAM_ID || 'your-telegram-id' }, // Use env var or placeholder
    update: {},
    create: {
      telegramId: process.env.ADMIN_TELEGRAM_ID || 'your-telegram-id',
      username: 'AdminUser',
      firstName: 'Admin',
      points: 500,
      tier: 'Seeker_L2',
      credibilityScore: 0,
      positiveReviews: 0,
    },
  });

  console.log('👤 User ready:', user.telegramId);

  // 2. Create Predictions
  const btcPrediction = await prisma.prediction.upsert({
    where: { id: 'btc-100k-2025' },
    update: {},
    create: {
      id: 'btc-100k-2025',
      title: 'Will BTC close above $100k before 31 Dec 2025?',
      description:
        'Market resolves when daily close on a major USD exchange is recorded above $100,000 before 31 Dec 2025.',
      options: ['Yes', 'No'],
      entryFeeStars: 0,
      entryFeePoints: 100,
      pot: 0,
      resolved: false,
      endsAt: new Date('2025-12-31T23:59:59.000Z'),
    },
  });

  const ethPrediction = await prisma.prediction.upsert({
    where: { id: 'eth-10k-2026' },
    update: {},
    create: {
      id: 'eth-10k-2026',
      title: 'Will ETH close above $10k before 31 Dec 2026?',
      description:
        'Market resolves when ETH daily close trades above $10,000 before the end of 2026.',
      options: ['Yes', 'No'],
      entryFeeStars: 0,
      entryFeePoints: 50,
      pot: 0,
      resolved: false,
      endsAt: new Date('2026-12-31T23:59:59.000Z'),
    },
  });

  console.log('🎲 Predictions added:', btcPrediction.id, ethPrediction.id);

  // 3. Create Campaign
  const existingCampaign = await prisma.campaign.findFirst({
    where: { name: 'Akari OG Quest' },
  });

  const campaign =
    existingCampaign ||
    (await prisma.campaign.create({
      data: {
        name: 'Akari OG Quest',
        description: 'Complete the OG tasks to become an early Akari Mystic.',
        rewards: 'Akari OG role + 500 EP',
        endsAt: new Date('2025-12-31T23:59:59.000Z'),
        starsFee: 0,
      },
    }));

  console.log('📣 Campaign ready:', campaign.name);

  // 4. Create campaign tasks (if campaign was just created)
  if (!existingCampaign) {
    await prisma.campaignTask.createMany({
      data: [
        {
          campaignId: campaign.id,
          title: 'Join Akari Telegram',
          description: 'Join our main Telegram community.',
          type: 'join_telegram',
          metadata: { inviteLink: 'https://t.me/AkariMysticClub' },
        },
        {
          campaignId: campaign.id,
          title: 'Follow Akari on X',
          description: 'Follow the official Akari account on X.',
          type: 'follow_x',
          metadata: { handle: 'AkariOfficial' },
        },
        {
          campaignId: campaign.id,
          title: 'Retweet the Akari intro thread',
          description: 'Help spread the word about Akari Mystic Club.',
          type: 'retweet',
          metadata: { tweetUrl: 'https://x.com/AkariOfficial/status/placeholder' },
        },
      ],
    });

    console.log('📝 Campaign tasks added');
  } else {
    console.log('📝 Campaign tasks already exist');
  }
}

main()
  .then(() => {
    console.log('🌟 Seed completed successfully');
  })
  .catch((e) => {
    console.error('❌ Seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
