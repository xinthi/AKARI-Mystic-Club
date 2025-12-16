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
    <div className={`rounded-lg border border-akari-danger/30 bg-slate-900/60 p-3 text-center ${className}`}>
      {title && (
        <h3 className="text-xs font-semibold text-akari-danger mb-1.5 leading-tight">{title}</h3>
      )}
      <p className="text-xs text-akari-danger mb-2.5 leading-snug break-words">{error}</p>
      
      {isConfigError && (
        <p className="text-[10px] text-akari-muted/70 mb-2.5 leading-tight max-w-md mx-auto">
          Server configuration issue. Contact support if this persists.
        </p>
      )}
      
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 bg-akari-primary/20 text-akari-primary rounded-md hover:bg-akari-primary/30 transition-colors text-xs font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

