import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon - Mystic Heros Logo */}
        <link rel="icon" type="image/png" href="/mystic-heros-favicon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/mystic-heros-favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/mystic-heros-favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/mystic-heros-logo.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Meta tags */}
        <meta name="theme-color" content="#050811" />
        <meta name="description" content="Akari Mystic Club - Prediction-native market intelligence for crypto markets, memecoins, and launchpads" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

