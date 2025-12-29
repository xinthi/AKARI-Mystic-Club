/**
 * Wrapper component for ARC page content
 * 
 * Provides the center feed container structure that matches the layout
 */

import React from 'react';

interface ArcPageContentWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function ArcPageContentWrapper({ children, className = '' }: ArcPageContentWrapperProps) {
  return (
    <div className={`flex-1 min-w-0 max-w-[1400px] mx-auto px-4 space-y-6 py-6 ${className}`}>
      {children}
    </div>
  );
}

