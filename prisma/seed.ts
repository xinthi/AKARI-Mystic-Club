/**
 * Prisma Seed Script
 * 
 * Seeds the database with initial tier data and optional demo data.
 * Run with: pnpm prisma:seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Tiers
  const tiers = [
    // Seeker Tiers
    { name: 'Seeker', level: 1, minPoints: 0, maxPoints: 333, badgeEmoji: '🧭', color: '#FF0000', description: 'New adventurer hunting first drops' },
    { name: 'Seeker', level: 2, minPoints: 334, maxPoints: 666, badgeEmoji: '🧭', color: '#FF0000', description: 'New adventurer hunting first drops' },
    { name: 'Seeker', level: 3, minPoints: 667, maxPoints: 999, badgeEmoji: '🧭', color: '#FF0000', description: 'New adventurer hunting first drops' },
    
    // Alchemist Tiers
    { name: 'Alchemist', level: 1, minPoints: 1000, maxPoints: 2333, badgeEmoji: '🔥', color: '#FF4500', description: 'Fiery creator of opportunities' },
    { name: 'Alchemist', level: 2, minPoints: 2334, maxPoints: 3666, badgeEmoji: '🔥', color: '#FF4500', description: 'Fiery creator of opportunities' },
    { name: 'Alchemist', level: 3, minPoints: 3667, maxPoints: 4999, badgeEmoji: '🔥', color: '#FF4500', description: 'Fiery creator of opportunities' },
    
    // Sentinel Tiers
    { name: 'Sentinel', level: 1, minPoints: 5000, maxPoints: 8750, badgeEmoji: '🛡️', color: '#DC143C', description: 'Guardian of the club' },
    { name: 'Sentinel', level: 2, minPoints: 8751, maxPoints: 12500, badgeEmoji: '🛡️', color: '#DC143C', description: 'Guardian of the club' },
    { name: 'Sentinel', level: 3, minPoints: 12501, maxPoints: 16250, badgeEmoji: '🛡️', color: '#DC143C', description: 'Guardian of the club' },
    { name: 'Sentinel', level: 4, minPoints: 16251, maxPoints: 19999, badgeEmoji: '🛡️', color: '#DC143C', description: 'Guardian of the club' },
    
    // Merchant Tiers
    { name: 'Merchant', level: 1, minPoints: 20000, maxPoints: 30000, badgeEmoji: '💰', color: '#0000FF', description: 'Wise trader of rewards' },
    { name: 'Merchant', level: 2, minPoints: 30001, maxPoints: 40000, badgeEmoji: '💰', color: '#0000FF', description: 'Wise trader of rewards' },
    { name: 'Merchant', level: 3, minPoints: 40001, maxPoints: 49999, badgeEmoji: '💰', color: '#0000FF', description: 'Wise trader of rewards' },
    
    // Guardian Tiers
    { name: 'Guardian', level: 1, minPoints: 50000, maxPoints: 66666, badgeEmoji: '⚔️', color: '#000000', description: 'Defender of the realm' },
    { name: 'Guardian', level: 2, minPoints: 66667, maxPoints: 83333, badgeEmoji: '⚔️', color: '#000000', description: 'Defender of the realm' },
    { name: 'Guardian', level: 3, minPoints: 83334, maxPoints: 99999, badgeEmoji: '⚔️', color: '#000000', description: 'Defender of the realm' },
    
    // Sovereign Tier (no max)
    { name: 'Sovereign', level: 1, minPoints: 100000, maxPoints: null, badgeEmoji: '👑', color: '#000000', description: 'Ruler of quests' },
  ];

  for (const tier of tiers) {
    await prisma.tier.upsert({
      where: {
        name_level: {
          name: tier.name,
          level: tier.level,
        },
      },
      update: tier,
      create: tier,
    });
  }

  console.log(`✅ Seeded ${tiers.length} tiers`);

  // Optional: Create demo data (only in development)
  if (process.env.NODE_ENV === 'development' && process.env.SEED_DEMO_DATA === 'true') {
    console.log('📦 Creating demo data...');

    // Create demo users
    const demoUsers = await Promise.all([
      prisma.user.upsert({
        where: { telegramId: BigInt(123456789) },
        update: {},
        create: {
          telegramId: BigInt(123456789),
          username: 'demo_user_1',
          points: 5000,
          tier: 'Sentinel_L1',
          interests: ['airdrop_hunter', 'investor'],
        },
      }),
      prisma.user.upsert({
        where: { telegramId: BigInt(987654321) },
        update: {},
        create: {
          telegramId: BigInt(987654321),
          username: 'demo_user_2',
          points: 15000,
          tier: 'Sentinel_L3',
          interests: ['content_creator', 'founder'],
        },
      }),
    ]);

    console.log(`✅ Created ${demoUsers.length} demo users`);

    // Create demo predictions
    const demoPredictions = await Promise.all([
      prisma.prediction.create({
        data: {
          title: 'Will Bitcoin reach $100k by end of 2024?',
          description: 'Place your bets on Bitcoin price prediction',
          options: ['Yes', 'No'],
          entryFeePoints: 100,
          creatorId: demoUsers[0].id,
          endsAt: new Date('2024-12-31'),
          pot: 500,
        },
      }),
      prisma.prediction.create({
        data: {
          title: 'Which chain will have the most TVL in Q2 2024?',
          description: 'Ethereum, Solana, or TON?',
          options: ['Ethereum', 'Solana', 'TON'],
          entryFeePoints: 50,
          creatorId: demoUsers[1].id,
          endsAt: new Date('2024-06-30'),
          pot: 200,
        },
      }),
    ]);

    console.log(`✅ Created ${demoPredictions.length} demo predictions`);

    // Create demo campaigns
    const demoCampaigns = await Promise.all([
      prisma.campaign.create({
        data: {
          name: 'TON Ecosystem Airdrop',
          description: 'Complete tasks to qualify for TON airdrop',
          rewards: '500 TON tokens + 1000 EP',
          tasks: [
            { type: 'join_telegram', groupId: '@ton_blockchain', title: 'Join TON Telegram' },
            { type: 'follow_twitter', username: 'ton_blockchain', title: 'Follow TON on X' },
            { type: 'retweet', tweetId: '123456', title: 'Retweet announcement' },
          ],
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          createdById: demoUsers[0].id,
          starsFee: 0,
        },
      }),
    ]);

    console.log(`✅ Created ${demoCampaigns.length} demo campaigns`);
  }

  console.log('✨ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
