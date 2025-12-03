/**
 * Meme Radar (Placeholder)
 */

import Head from 'next/head';
import Link from 'next/link';

export default function MemesPage() {
  return (
    <>
      <Head>
        <title>Meme Radar - Akari Mystic Club</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-pink-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">🔥 Meme Radar</h1>
            <p className="text-xl text-gray-300 mb-8">Coming soon</p>
            <p className="text-gray-400 mb-12">
              Meme coin tracking and discovery will be available here soon.
            </p>
            <Link
              href="/portal"
              className="px-6 py-3 bg-pink-600 rounded-lg font-semibold hover:bg-pink-500 transition-all"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

