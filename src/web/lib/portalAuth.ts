import type { NextApiRequest } from 'next';
import { prisma, withDbRetry } from './prisma';

export interface PortalUserProfile {
  id: string;
  telegramId: string;
  username?: string | null;
  avatarUrl?: string | null;
  level: string; // "L1", "L2", "ADMIN", "SUPER_ADMIN"
  positiveReviews: number;
  negativeReviews: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Require portal user authentication and return the user profile
 * Extracts user from request (could be from session, cookie, or header)
 * For now, we'll use a simple approach - in production you might use JWT or sessions
 */
export async function requirePortalUser(
  req: NextApiRequest
): Promise<PortalUserProfile> {
  // TODO: Implement proper session/auth extraction
  // For now, this is a placeholder that will need to be implemented
  // based on your actual auth mechanism (Telegram initData, JWT, etc.)
  
  // In development, allow bypassing auth if no header is provided
  // This is a temporary measure until proper auth is implemented
  if (process.env.NODE_ENV === 'development') {
    const userId = req.headers['x-portal-user-id'] as string | undefined;
    
    // If no user ID provided in dev, try to find or create a default admin user
    if (!userId) {
      // Try to find any SUPER_ADMIN user, or create a default one
      let user = await withDbRetry(() =>
        prisma.portalUserProfile.findFirst({
          where: { level: 'SUPER_ADMIN' },
        })
      );
      
      if (!user) {
        // Create a default admin user for development
        // WARNING: This is only for development!
        user = await withDbRetry(() =>
          prisma.portalUserProfile.create({
            data: {
              telegramId: 'dev-admin-000',
              username: 'dev-admin',
              level: 'SUPER_ADMIN',
            },
          })
        );
      }
      
      return user;
    }
    
    const user = await withDbRetry(() =>
      prisma.portalUserProfile.findUnique({
        where: { id: userId },
      })
    );

    if (!user) {
      throw new Error('Unauthorized: User not found');
    }

    return user;
  }
  
  // In production, require proper authentication
  const userId = req.headers['x-portal-user-id'] as string | undefined;
  
  if (!userId) {
    throw new Error('Unauthorized: No user ID provided');
  }

  const user = await withDbRetry(() =>
    prisma.portalUserProfile.findUnique({
      where: { id: userId },
    })
  );

  if (!user) {
    throw new Error('Unauthorized: User not found');
  }

  return user;
}

/**
 * Assert that the user has ADMIN or SUPER_ADMIN level
 */
export function assertAdmin(user: PortalUserProfile): void {
  if (user.level !== 'ADMIN' && user.level !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: Admin access required');
  }
}

/**
 * Assert that the user has SUPER_ADMIN level
 */
export function assertSuperAdmin(user: PortalUserProfile): void {
  if (user.level !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: Super admin access required');
  }
}

