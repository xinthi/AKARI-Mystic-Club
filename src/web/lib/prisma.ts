import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Optimize for serverless: reduce connection pool size
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Helper to execute database operations with retry logic
 * Useful for serverless environments where connections can be flaky
 * 
 * @param operation - Async function that performs database operation
 * @param maxRetries - Maximum number of retries (default: 2)
 * @param delayMs - Delay between retries in milliseconds (default: 500)
 * @returns Result of the operation
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  delayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure connection is established
      await prisma.$connect();
      return await operation();
    } catch (err: any) {
      lastError = err;
      
      // Check if it's a connection error worth retrying
      const isConnectionError = 
        err?.message?.includes("Can't reach database server") ||
        err?.message?.includes('Connection refused') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.code === 'P1001' || // Connection error
        err?.code === 'P1002'; // Connection timed out
      
      if (!isConnectionError || attempt === maxRetries) {
        // Not a connection error or last attempt - throw
        throw err;
      }
      
      console.warn(`[DB] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, err.message);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Try to disconnect and reconnect
      try {
        await prisma.$disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
  }
  
  throw lastError;
}

