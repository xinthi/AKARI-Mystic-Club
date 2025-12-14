/**
 * ARC Home Page
 * 
 * Creator Arenas - Narrative Universe
 */

import React from 'react';
import { PortalLayout } from '@/components/portal/PortalLayout';

export default function ArcHome() {
  return (
    <PortalLayout title="ARC">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gradient-teal">
          ARC Narrative Universe
        </h1>
        <p className="text-akari-text">
          ARC Home is live
        </p>
      </div>
    </PortalLayout>
  );
}
