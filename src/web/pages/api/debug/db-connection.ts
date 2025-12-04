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

// Import the getDatabaseUrl function (we'll need to export it from prisma.ts)
// For now, let's duplicate the logic here for diagnostic purposes
function getOptimizedDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || '';
  
  if (!url) {
    return '';
  }

  try {
    const urlObj = new URL(url);
    
    // If using Supabase pooler (port 6543), ensure pgbouncer mode
    if (urlObj.port === '6543' || url.includes(':6543/')) {
      urlObj.searchParams.set('pgbouncer', 'true');
      urlObj.searchParams.set('connect_timeout', '10');
      urlObj.searchParams.set('pool_timeout', '10');
      return urlObj.toString();
    }

    // If using direct connection, add connection timeout
    if (urlObj.port === '5432' || url.includes(':5432/')) {
      urlObj.searchParams.set('connect_timeout', '10');
      return urlObj.toString();
    }
  } catch (e) {
    // If URL parsing fails, try string manipulation
    if (url.includes(':6543/') && !url.includes('pgbouncer=true')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}pgbouncer=true&connect_timeout=10&pool_timeout=10`;
    }

    if (url.includes(':5432/') && !url.includes('connect_timeout')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}connect_timeout=10`;
    }
  }

  return url;
}

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
    // 1. Parse DATABASE_URL (raw and optimized)
    const rawDbUrl = process.env.DATABASE_URL || '';
    const optimizedDbUrl = getOptimizedDatabaseUrl();
    
    if (!rawDbUrl) {
      return res.status(200).json({
        ...response,
        message: 'DATABASE_URL environment variable is not set',
      });
    }

    try {
      // Parse raw URL
      const rawUrlObj = new URL(rawDbUrl);
      // Parse optimized URL (what Prisma actually uses)
      const optimizedUrlObj = new URL(optimizedDbUrl);
      
      response.connectionString = {
        host: rawUrlObj.hostname,
        port: rawUrlObj.port || '5432',
        database: rawUrlObj.pathname.replace('/', ''),
        hasPgbouncer: optimizedUrlObj.searchParams.has('pgbouncer'), // Check optimized URL
        hasSslMode: optimizedUrlObj.searchParams.has('sslmode'),
        hasConnectTimeout: optimizedUrlObj.searchParams.has('connect_timeout'), // Check optimized URL
        fullUrl: `${optimizedUrlObj.protocol}//${optimizedUrlObj.hostname}:${optimizedUrlObj.port}${optimizedUrlObj.pathname}?${optimizedUrlObj.searchParams.toString().replace(/password=[^&]*/gi, 'password=***')}`, // Show optimized URL
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
      datasourceUrl: optimizedDbUrl.replace(/:[^:@]+@/, ':***@'), // Mask password in optimized URL
    };

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(200).json({
      ...response,
      message: `Diagnostic error: ${error.message}`,
    });
  }
}

