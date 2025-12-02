import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Initialize Telegram Web App SDK
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((sdk) => {
        // SDK is automatically initialized on import
        // No need to call ready() in v8.0.2
      });
    }
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log error for monitoring
        console.error('App-level error:', error, errorInfo);
        // TODO: Send to error tracking service in production
      }}
    >
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}

