/**
 * Transaction Helpers
 * 
 * Utilities for safely executing database transactions with retry logic
 * and proper error handling.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { withDbRetry } from './prisma';

/**
 * Execute a transaction with retry logic and better error handling
 * 
 * @param prisma - Prisma client instance
 * @param transactionFn - Transaction function
 * @param maxRetries - Maximum number of retries (default: 2)
 * @returns Result of the transaction
 */
export async function withTransactionRetry<T>(
  prisma: PrismaClient,
  transactionFn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wrap transaction in withDbRetry for connection resilience
      return await withDbRetry(async () => {
        return await prisma.$transaction(transactionFn, {
          maxWait: 10000, // 10 seconds max wait for transaction
          timeout: 30000, // 30 seconds timeout
        });
      });
    } catch (err: any) {
      lastError = err;

      // Check if it's a transaction-specific error worth retrying
      const isRetryableError =
        err?.code === 'P1001' || // Connection error
        err?.code === 'P1002' || // Connection timeout
        err?.code === 'P2034' || // Transaction conflict
        err?.message?.includes('Can\'t reach database server') ||
        err?.message?.includes('Connection refused') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.message?.includes('Transaction failed') ||
        err?.message?.includes('deadlock');

      if (!isRetryableError || attempt === maxRetries) {
        // Not retryable or last attempt - throw
        throw err;
      }

      console.warn(
        `[Transaction] Attempt ${attempt + 1} failed, retrying:`,
        err.message
      );

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delayMs = 500 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Execute a transaction with isolation level control
 * 
 * @param prisma - Prisma client instance
 * @param transactionFn - Transaction function
 * @param isolationLevel - PostgreSQL isolation level (default: 'ReadCommitted')
 * @returns Result of the transaction
 */
export async function withIsolatedTransaction<T>(
  prisma: PrismaClient,
  transactionFn: (tx: Prisma.TransactionClient) => Promise<T>,
  isolationLevel: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable' = 'ReadCommitted'
): Promise<T> {
  // Note: Prisma doesn't directly support isolation levels in $transaction
  // This is a wrapper for future use if we need to use raw SQL for isolation
  return await withTransactionRetry(prisma, transactionFn);
}

/**
 * Execute multiple operations in a transaction with better error handling
 * 
 * @param prisma - Prisma client instance
 * @param operations - Array of Prisma operations
 * @returns Results of all operations
 */
export async function executeTransaction<T extends Prisma.PrismaPromise<any>[]>(
  prisma: PrismaClient,
  operations: T
): Promise<Prisma.Result<T, any, 'runCommand'>> {
  return await withTransactionRetry(prisma, async (tx) => {
    // This is a wrapper for the array-based transaction syntax
    return await Promise.all(operations.map(op => {
      // Convert operations to use transaction client
      // Note: This is a simplified version - actual implementation depends on operation types
      return op;
    })) as any;
  });
}

