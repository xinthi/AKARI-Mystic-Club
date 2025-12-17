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
                        error.toLowerCase().includes('service configuration') ||
                        error.toLowerCase().includes('missing supabase');

  return (
    <div className={`rounded-lg border border-akari-danger/30 bg-slate-900/60 border-slate-800 rounded-2xl p-6 text-center ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold text-red-400 mb-2 leading-tight">{title}</h3>
      )}
      <p className="text-sm text-red-400 mb-4 leading-snug break-words">{error}</p>
      
      {isConfigError && (
        <div className="text-left bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-4 max-w-2xl mx-auto">
          <p className="text-xs font-semibold text-akari-muted mb-2">🔧 Setup Instructions:</p>
          <ol className="text-[11px] text-akari-muted/80 space-y-2 list-decimal list-inside">
            <li>Create a file named <code className="bg-black/30 px-1.5 py-0.5 rounded text-akari-neon-teal">.env.local</code> in the <code className="bg-black/30 px-1.5 py-0.5 rounded text-akari-neon-teal">src/web</code> directory</li>
            <li>Add these required variables:
              <pre className="mt-2 p-2 bg-black/30 rounded text-[10px] overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`}
              </pre>
            </li>
            <li>Get your credentials from <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-akari-neon-teal hover:underline">Supabase Dashboard</a> → Settings → API</li>
            <li>Restart your dev server after adding the file</li>
          </ol>
          <p className="text-[10px] text-akari-muted/60 mt-3 pt-3 border-t border-slate-700">
            📖 See <code className="bg-black/30 px-1 py-0.5 rounded">SUPABASE_LOCAL_SETUP.md</code> for detailed instructions
          </p>
        </div>
      )}
      
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-akari-primary/20 text-akari-primary rounded-md hover:bg-akari-primary/30 transition-colors text-xs font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

