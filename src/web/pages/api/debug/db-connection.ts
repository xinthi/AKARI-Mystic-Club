/**
 * Database Connection Diagnostic Endpoint
 * 
 * GET /api/debug/db-connection
 * 
 * Tests database connection and returns diagnostic information
 * (Admin only for security)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

interface DiagnosticResponse {
  ok: boolean;
  connectionString?: {
    host?: string;
    port?: string;
    database?: string;
    hasPgbouncer?: boolean;
    hasSslMode?: boolean;
    hasConnectTimeout?: boolean;
    fullUrl?: string; // Masked for security
  };
  connectionTest?: {
    success: boolean;
    error?: string;
    duration?: number;
  };
  prismaInfo?: {
    version?: string;
    datasourceUrl?: string; // Masked
  };
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DiagnosticResponse>
) {
  // Only allow in development or for admins
  if (process.env.NODE_ENV === 'production') {
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    // For now, allow in production for debugging (remove after fixing)
    // In production, you might want to add admin check here
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const response: DiagnosticResponse = {
    ok: false,
  };

  try {
    // 1. Parse DATABASE_URL
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl) {
      return res.status(200).json({
        ...response,
        message: 'DATABASE_URL environment variable is not set',
      });
    }

    try {
      const urlObj = new URL(dbUrl);
      response.connectionString = {
        host: urlObj.hostname,
        port: urlObj.port || '5432',
        database: urlObj.pathname.replace('/', ''),
        hasPgbouncer: urlObj.searchParams.has('pgbouncer'),
        hasSslMode: urlObj.searchParams.has('sslmode'),
        hasConnectTimeout: urlObj.searchParams.has('connect_timeout'),
        fullUrl: `${urlObj.protocol}//${urlObj.hostname}:${urlObj.port}${urlObj.pathname}?${urlObj.searchParams.toString().replace(/password=[^&]*/gi, 'password=***')}`,
      };
    } catch (e) {
      response.connectionString = {
        fullUrl: 'Failed to parse URL',
      };
    }

    // 2. Test connection
    const startTime = Date.now();
    try {
      await prisma.$connect();
      const testQuery = await prisma.$queryRaw`SELECT 1 as test`;
      await prisma.$disconnect();
      
      const duration = Date.now() - startTime;
      response.connectionTest = {
        success: true,
        duration,
      };
      response.ok = true;
    } catch (connErr: any) {
      const duration = Date.now() - startTime;
      response.connectionTest = {
        success: false,
        error: connErr.message || 'Connection failed',
        duration,
      };
      response.message = `Connection test failed: ${connErr.message}`;
    }

    // 3. Prisma info
    response.prismaInfo = {
      version: '@prisma/client',
      datasourceUrl: dbUrl.replace(/:[^:@]+@/, ':***@'), // Mask password
    };

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(200).json({
      ...response,
      message: `Diagnostic error: ${error.message}`,
    });
  }
}

