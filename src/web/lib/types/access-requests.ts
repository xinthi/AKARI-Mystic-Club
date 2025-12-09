/**
 * AKARI Mystic Club - Access Request Types
 * 
 * Types for feature access requests (e.g., Deep Explorer, Institutional Plus)
 */

import type { FeatureKey } from '../permissions';

/**
 * Status of an access request
 */
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * Access request record from the database
 */
export interface AccessRequest {
  id: string;
  userId: string;
  featureKey: FeatureKey | string;
  requestedPlan: string | null;
  justification: string | null;
  status: AccessRequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

