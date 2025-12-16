/**
 * Reusable Error Display Component for Portal Pages
 * 
 * Provides a consistent, user-friendly error display with retry functionality.
 */

import React from 'react';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

export function ErrorDisplay({ error, onRetry, title, className = '' }: ErrorDisplayProps) {
  const isConfigError = error.toLowerCase().includes('configuration') || 
                        error.toLowerCase().includes('supabase') ||
                        error.toLowerCase().includes('service configuration');

  return (
    <div className={`rounded-xl border border-akari-danger/30 bg-slate-900/60 p-6 text-center ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold text-akari-danger mb-2">{title}</h3>
      )}
      <p className="text-sm text-akari-danger mb-4">{error}</p>
      
      {isConfigError && (
        <p className="text-xs text-akari-muted/70 mb-4">
          This appears to be a server configuration issue. Please contact support if this persists.
        </p>
      )}
      
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-akari-primary/20 text-akari-primary rounded-lg hover:bg-akari-primary/30 transition-colors text-sm font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

