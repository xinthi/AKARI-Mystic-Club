/**
 * Database Cleanup Script (TypeScript)
 * 
 * Cleans all data from tables while preserving schema.
 * Run with: pnpm tsx prisma/cleanup.ts
 * 
 * WARNING: This deletes ALL data. Use with caution!
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('🧹 Starting database cleanup...');

  // Check if we're in production
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_CLEANUP) {
    console.error('❌ Cannot run cleanup in production without FORCE_CLEANUP=true');
    process.exit(1);
  }

  try {
    // Delete in order to respect foreign key constraints
    console.log('Deleting bets...');
    await prisma.bet.deleteMany({});
    
    console.log('Deleting predictions...');
    await prisma.prediction.deleteMany({});
    
    console.log('Deleting campaigns...');
    await prisma.campaign.deleteMany({});
    
    console.log('Deleting surveys...');
    await prisma.survey.deleteMany({});
    
    console.log('Deleting reviews...');
    await prisma.review.deleteMany({});
    
    console.log('Deleting users...');
    await prisma.user.deleteMany({});
    
    // Note: Tiers are not deleted as they are seed data
    // If you want to reset tiers, uncomment below:
    // console.log('Deleting tiers...');
    // await prisma.tier.deleteMany({});
    
    console.log('✅ Cleanup complete!');
    console.log('💡 Run "pnpm prisma:seed" to repopulate with seed data');
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();

