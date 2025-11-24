// @ts-nocheck - This file is not type-checked by Next.js
import { PrismaClient } from '@prisma/client';

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set!');
  throw new Error('DATABASE_URL environment variable is required');
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Connect to database with error handling
prisma.$connect().catch((err: any) => {
  console.error('Prisma connect error:', err);
});

