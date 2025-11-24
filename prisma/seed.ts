import { PrismaClient, Interest } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed tiers with SVG placeholder images
 */
const tiers = [
  // Seeker L1-3 (0-1k EP, red #FF0000 🧭)
  {
    name: 'Seeker',
    level: 1,
    minPoints: 0,
    maxPoints: 333,
    badgeEmoji: '🧭',
    color: '#FF0000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK08L3RleHQ+PC9zdmc+',
    description: 'New adventurer hunting first drops'
  },
  {
    name: 'Seeker',
    level: 2,
    minPoints: 334,
    maxPoints: 666,
    badgeEmoji: '🧭',
    color: '#FF0000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK08L3RleHQ+PC9zdmc+',
    description: 'New adventurer hunting first drops'
  },
  {
    name: 'Seeker',
    level: 3,
    minPoints: 667,
    maxPoints: 1000,
    badgeEmoji: '🧭',
    color: '#FF0000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK08L3RleHQ+PC9zdmc+',
    description: 'New adventurer hunting first drops'
  },
  // Alchemist L1-3 (1k-5k, orange #FF4500 🔥)
  {
    name: 'Alchemist',
    level: 1,
    minPoints: 1001,
    maxPoints: 2333,
    badgeEmoji: '🔥',
    color: '#FF4500',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGNDUwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK88L3RleHQ+PC9zdmc+',
    description: 'Fiery creator of opportunities'
  },
  {
    name: 'Alchemist',
    level: 2,
    minPoints: 2334,
    maxPoints: 3666,
    badgeEmoji: '🔥',
    color: '#FF4500',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGNDUwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK88L3RleHQ+PC9zdmc+',
    description: 'Fiery creator of opportunities'
  },
  {
    name: 'Alchemist',
    level: 3,
    minPoints: 3667,
    maxPoints: 5000,
    badgeEmoji: '🔥',
    color: '#FF4500',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZGNDUwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjK88L3RleHQ+PC9zdmc+',
    description: 'Fiery creator of opportunities'
  },
  // Sentinel L1-4 (5k-20k, red #DC143C 🛡️)
  {
    name: 'Sentinel',
    level: 1,
    minPoints: 5001,
    maxPoints: 8750,
    badgeEmoji: '🛡️',
    color: '#DC143C',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0RDMTQzQyIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKE8L3RleHQ+PC9zdmc+',
    description: 'Guardian of the club'
  },
  {
    name: 'Sentinel',
    level: 2,
    minPoints: 8751,
    maxPoints: 12500,
    badgeEmoji: '🛡️',
    color: '#DC143C',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0RDMTQzQyIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKE8L3RleHQ+PC9zdmc+',
    description: 'Guardian of the club'
  },
  {
    name: 'Sentinel',
    level: 3,
    minPoints: 12501,
    maxPoints: 16250,
    badgeEmoji: '🛡️',
    color: '#DC143C',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0RDMTQzQyIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKE8L3RleHQ+PC9zdmc+',
    description: 'Guardian of the club'
  },
  {
    name: 'Sentinel',
    level: 4,
    minPoints: 16251,
    maxPoints: 20000,
    badgeEmoji: '🛡️',
    color: '#DC143C',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0RDMTQzQyIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKE8L3RleHQ+PC9zdmc+',
    description: 'Guardian of the club'
  },
  // Merchant L1-3 (20k-50k, blue #0000FF 💰)
  {
    name: 'Merchant',
    level: 1,
    minPoints: 20001,
    maxPoints: 30000,
    badgeEmoji: '💰',
    color: '#0000FF',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDBGRiIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKk8L3RleHQ+PC9zdmc+',
    description: 'Wise trader of rewards'
  },
  {
    name: 'Merchant',
    level: 2,
    minPoints: 30001,
    maxPoints: 40000,
    badgeEmoji: '💰',
    color: '#0000FF',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDBGRiIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKk8L3RleHQ+PC9zdmc+',
    description: 'Wise trader of rewards'
  },
  {
    name: 'Merchant',
    level: 3,
    minPoints: 40001,
    maxPoints: 50000,
    badgeEmoji: '💰',
    color: '#0000FF',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDBGRiIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKk8L3RleHQ+PC9zdmc+',
    description: 'Wise trader of rewards'
  },
  // Guardian L1-3 (50k-100k, black #000000 ⚔️)
  {
    name: 'Guardian',
    level: 1,
    minPoints: 50001,
    maxPoints: 66666,
    badgeEmoji: '⚔️',
    color: '#000000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKg8L3RleHQ+PC9zdmc+',
    description: 'Defender of the realm'
  },
  {
    name: 'Guardian',
    level: 2,
    minPoints: 66667,
    maxPoints: 83333,
    badgeEmoji: '⚔️',
    color: '#000000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKg8L3RleHQ+PC9zdmc+',
    description: 'Defender of the realm'
  },
  {
    name: 'Guardian',
    level: 3,
    minPoints: 83334,
    maxPoints: 100000,
    badgeEmoji: '⚔️',
    color: '#000000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKg8L3RleHQ+PC9zdmc+',
    description: 'Defender of the realm'
  },
  // Sovereign L1+ (100k+, black #000000 👑)
  {
    name: 'Sovereign',
    level: 1,
    minPoints: 100001,
    maxPoints: null,
    badgeEmoji: '👑',
    color: '#000000',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfjKk8L3RleHQ+PC9zdmc+',
    description: 'Ruler of quests'
  }
];

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing tiers
  await prisma.tier.deleteMany({});

  // Create tiers
  for (const tier of tiers) {
    await prisma.tier.create({
      data: tier
    });
  }

  console.log(`✅ Created ${tiers.length} tiers`);

  // Create test admin/founder user if ADMIN_TELEGRAM_ID is set
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (adminId) {
    const existingAdmin = await prisma.user.findUnique({
      where: { telegramId: BigInt(adminId) }
    });

    if (!existingAdmin) {
      await prisma.user.create({
        data: {
          telegramId: BigInt(adminId),
          isVerifiedFounder: true,
          founderSubscriptionEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          points: 10000,
          tier: 'Sentinel_L2',
          interests: [Interest.founder, Interest.investor]
        }
      });
      console.log('✅ Created test admin/founder user');
    }
  }

  console.log('✨ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

