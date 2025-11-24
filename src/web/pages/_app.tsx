import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Initialize Telegram Web App SDK
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((sdk) => {
        sdk.ready();
      });
    }
  }, []);

  return <Component {...pageProps} />;
}

