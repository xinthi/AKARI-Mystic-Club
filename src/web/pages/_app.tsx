import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { SDKProvider, useSDK } from '@twa-dev/sdk-react';
import '../styles/globals.css';

function InitSDK() {
  const sdk = useSDK();
  
  useEffect(() => {
    if (sdk) {
      sdk.ready();
    }
  }, [sdk]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SDKProvider>
      <InitSDK />
      <Component {...pageProps} />
    </SDKProvider>
  );
}

