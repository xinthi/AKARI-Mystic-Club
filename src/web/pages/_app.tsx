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

      // Fun message for curious developers who open F12 🕵️
      console.log(`
%c██╗  ██╗███████╗██╗   ██╗    ██╗   ██╗ ██████╗ ██╗   ██╗██╗
%c██║  ██║██╔════╝╚██╗ ██╔╝    ╚██╗ ██╔╝██╔═══██╗██║   ██║██║
%c███████║█████╗   ╚████╔╝      ╚████╔╝ ██║   ██║██║   ██║██║
%c██╔══██║██╔══╝    ╚██╔╝        ╚██╔╝  ██║   ██║██║   ██║╚═╝
%c██║  ██║███████╗   ██║          ██║   ╚██████╔╝╚██████╔╝██╗
%c╚═╝  ╚═╝╚══════╝   ╚═╝          ╚═╝    ╚═════╝  ╚═════╝ ╚═╝
`, 
        'color: #00E5A0; font-weight: bold;',
        'color: #00D4FF; font-weight: bold;',
        'color: #FBBF24; font-weight: bold;',
        'color: #F472B6; font-weight: bold;',
        'color: #A78BFA; font-weight: bold;',
        'color: #60A5FA; font-weight: bold;'
      );
      
      console.log(
        '%c🚀 Curious developer spotted! 👀',
        'font-size: 20px; font-weight: bold; color: #00E5A0;'
      );
      
      console.log(
        '%c📱 Follow @muazxinthi on X for alpha! 🔥',
        'font-size: 24px; font-weight: bold; color: #FBBF24; text-shadow: 2px 2px #000;'
      );
      
      console.log(
        '%c⚡ AKARI Mystic Club - Prediction-native market intelligence',
        'font-size: 14px; color: #888;'
      );
      
      console.log(
        '%c🔒 Nice try! All the juicy stuff is on the server side 😉',
        'font-size: 12px; color: #666; font-style: italic;'
      );
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

