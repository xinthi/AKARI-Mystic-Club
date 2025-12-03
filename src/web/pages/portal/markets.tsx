/**
 * Markets Dashboard (Placeholder)
 */

import Head from 'next/head';
import Link from 'next/link';

export default function MarketsPage() {
  return (
    <>
      <Head>
        <title>Markets - Akari Mystic Club</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Markets Dashboard</h1>
            <p className="text-xl text-gray-300 mb-8">Coming soon</p>
            <p className="text-gray-400 mb-12">
              Prediction markets dashboard will be available here soon.
            </p>
            <Link
              href="/portal"
              className="px-6 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500 transition-all"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

