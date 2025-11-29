/**
 * Onboarding Overlay Component
 * 
 * Shows a first-time guide for new users in the Mini App
 */

import { useState } from 'react';

interface OnboardingOverlayProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    emoji: '🔮',
    title: 'Welcome to AKARI Mystic Club',
    content: 'You start with 5 MYST tokens (until 01 Jan 2026)',
    highlight: 'Your prediction journey begins!',
  },
  {
    emoji: '🎯',
    title: 'Predict & Win',
    content: 'Use MYST to join prediction markets and quests',
    highlight: 'Correct predictions earn you more MYST!',
  },
  {
    emoji: '💎',
    title: 'Buy MYST with TON',
    content: [
      '1. Get a TON wallet (Tonkeeper, Ton Space)',
      '2. Connect your wallet in Profile',
      '3. Use "Buy MYST with TON" section',
      '4. Send TON – get MYST after confirmation',
    ],
    highlight: 'Easy deposits, secure withdrawals',
  },
  {
    emoji: '⚠️',
    title: 'Play Responsibly',
    content: [
      '• Do not gamble with money you cannot afford to lose',
      '• Prediction markets can be addictive',
      '• Take breaks if you feel stressed',
    ],
    highlight: 'Your wellbeing matters to us',
    isWarning: true,
  },
];

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleComplete = () => {
    setIsClosing(true);
    setTimeout(onComplete, 300);
  };

  const slide = SLIDES[currentSlide];
  const isLastSlide = currentSlide === SLIDES.length - 1;

  return (
    <div className={`fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentSlide
                  ? 'w-6 bg-purple-500'
                  : idx < currentSlide
                    ? 'bg-purple-500/50'
                    : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Slide content */}
        <div className={`bg-gradient-to-br ${slide.isWarning ? 'from-amber-900/50 to-red-900/50 border-amber-500/30' : 'from-purple-900/50 to-blue-900/50 border-purple-500/30'} backdrop-blur-lg rounded-2xl p-6 border`}>
          <div className="text-center">
            <div className="text-6xl mb-4">{slide.emoji}</div>
            <h2 className="text-2xl font-bold text-white mb-4">{slide.title}</h2>
            
            {/* Content - can be string or array */}
            <div className={`mb-4 ${slide.isWarning ? 'text-amber-200' : 'text-purple-200'}`}>
              {Array.isArray(slide.content) ? (
                <ul className="text-left space-y-2">
                  {slide.content.map((item, idx) => (
                    <li key={idx} className="text-sm">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-lg">{slide.content}</p>
              )}
            </div>
            
            {/* Highlight */}
            <div className={`text-sm font-medium ${slide.isWarning ? 'text-amber-400' : 'text-purple-400'}`}>
              ✨ {slide.highlight}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {currentSlide > 0 && (
            <button
              onClick={handlePrev}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold text-white transition-colors"
            >
              ← Back
            </button>
          )}
          
          {isLastSlide ? (
            <button
              onClick={handleComplete}
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl font-semibold text-white transition-colors"
            >
              Got it, let&apos;s play! 🚀
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold text-white transition-colors"
            >
              Next →
            </button>
          )}
        </div>

        {/* Skip option */}
        {!isLastSlide && (
          <button
            onClick={handleComplete}
            className="w-full mt-3 text-gray-500 hover:text-gray-400 text-sm"
          >
            Skip tutorial
          </button>
        )}
      </div>
    </div>
  );
}

