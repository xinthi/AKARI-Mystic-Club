/**
 * Portal Homepage
 * akarimystic.club
 */

import Head from 'next/head';
import Link from 'next/link';

export default function PortalHomePage() {
  return (
    <>
      <Head>
        <title>Akari Mystic Club – Markets, Memes & New Launches</title>
        <meta name="description" content="Akari Mystic Club Portal - Explore prediction markets, meme coins, and new token launches" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Hero Section */}
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Akari Mystic Club
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-8">
              Markets, Memes & New Launches
            </p>
            <p className="text-lg text-gray-400 mb-12 max-w-2xl mx-auto">
              Your gateway to prediction markets, meme coin tracking, and early access to new token launches.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="https://play.akarimystic.club"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105 shadow-lg"
              >
                Open MiniApp
              </Link>
              <Link
                href="/portal/new-launches"
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-semibold hover:from-blue-500 hover:to-cyan-500 transition-all transform hover:scale-105 shadow-lg"
              >
                Explore New Launches
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-20">
            {/* Markets */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
              <div className="text-4xl mb-4">📊</div>
              <h2 className="text-2xl font-bold mb-3 text-purple-300">Markets</h2>
              <p className="text-gray-400 mb-4">
                Prediction markets for crypto, politics, sports, and more. Bet on outcomes and earn rewards.
              </p>
              <Link
                href="/portal/markets"
                className="text-purple-400 hover:text-purple-300 font-semibold"
              >
                Coming Soon →
              </Link>
            </div>

            {/* Meme Radar */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-pink-500/20">
              <div className="text-4xl mb-4">🔥</div>
              <h2 className="text-2xl font-bold mb-3 text-pink-300">Meme Radar</h2>
              <p className="text-gray-400 mb-4">
                Track trending meme coins and discover the next viral token before it moons.
              </p>
              <Link
                href="/portal/memes"
                className="text-pink-400 hover:text-pink-300 font-semibold"
              >
                Coming Soon →
              </Link>
            </div>

            {/* New Launches */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-cyan-500/20">
              <div className="text-4xl mb-4">🚀</div>
              <h2 className="text-2xl font-bold mb-3 text-cyan-300">New Launches</h2>
              <p className="text-gray-400 mb-4">
                Community-curated database of new token launches, IDOs, and airdrops with real-time price tracking.
              </p>
              <Link
                href="/portal/new-launches"
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Explore Now →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

