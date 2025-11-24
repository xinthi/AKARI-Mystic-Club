import type { AppProps } from 'next/app';
import { useEffect } from 'react';
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

  return <Component {...pageProps} />;
}

