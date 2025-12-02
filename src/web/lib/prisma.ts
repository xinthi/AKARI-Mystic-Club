import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Optimize DATABASE_URL for serverless (add connection pooling params if using Supabase pooler)
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || '';
  
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // If using Supabase pooler (port 6543), ensure pgbouncer mode
  if (url.includes(':6543/') && !url.includes('pgbouncer=true')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}pgbouncer=true&connect_timeout=10`;
  }

  // If using direct connection, add connection timeout
  if (url.includes(':5432/') && !url.includes('connect_timeout')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}connect_timeout=10`;
  }

  return url;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Optimize for serverless environments
    datasources: {
      db: {
        url: getDatabaseUrl(),
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
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure connection is established
      await prisma.$connect();
      const result = await operation();
      return result;
    } catch (err: any) {
      lastError = err;
      
      // Check if it's a connection error worth retrying
      const isConnectionError = 
        err?.message?.includes("Can't reach database server") ||
        err?.message?.includes('Connection refused') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.message?.includes('Connection closed') ||
        err?.message?.includes('Connection terminated') ||
        err?.code === 'P1001' || // Connection error
        err?.code === 'P1002' || // Connection timed out
        err?.code === 'P1008' || // Operations timed out
        err?.code === 'P1017'; // Server has closed the connection
      
      if (!isConnectionError || attempt === maxRetries) {
        // Not a connection error or last attempt - throw
        console.error(`[DB] Final attempt failed:`, err.message);
        throw err;
      }
      
      console.warn(`[DB] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delayMs}ms:`, err.message);
      
      // Exponential backoff: 1s, 2s, 3s
      const backoffDelay = delayMs * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      // Try to disconnect and reconnect
      try {
        await prisma.$disconnect();
        // Small delay before reconnecting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (disconnectErr) {
        // Ignore disconnect errors - connection might already be closed
        console.warn('[DB] Disconnect error (ignored):', disconnectErr);
      }
    }
  }
  
  throw lastError || new Error('Database operation failed after retries');
}

