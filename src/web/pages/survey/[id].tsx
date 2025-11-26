/**
 * Survey Page - Coming Soon Placeholder
 * 
 * The survey feature is not yet implemented.
 * This page shows a friendly "coming soon" message.
 */

import React from 'react';
import { useRouter } from 'next/router';

const SurveyPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex flex-col items-center justify-center text-center px-4 text-white">
      <div className="text-6xl mb-6">📋</div>
      <h1 className="text-2xl font-bold mb-4">Surveys Coming Soon</h1>
      <p className="text-purple-300 mb-4 max-w-md">
        The survey feature is not live yet in this beta version. 
        Check back later for exciting surveys and rewards!
      </p>
      {id && (
        <p className="text-sm text-purple-400/60">
          Survey ID: {id}
        </p>
      )}
      <button
        onClick={() => router.push('/')}
        className="mt-6 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
      >
        ← Back to Home
      </button>
    </div>
  );
};

export default SurveyPage;
