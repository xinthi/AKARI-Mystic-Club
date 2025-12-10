/**
 * ProfileReviews Component
 * 
 * Displays reviews from the Mystic Club.
 * Shows locked state if Telegram is not connected.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileReviewsProps {
  /** Whether Telegram is connected (unlocks reviews) */
  telegramConnected: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileReviews({ telegramConnected }: ProfileReviewsProps) {
  return (
    <div className="neon-card neon-hover p-6 relative overflow-hidden min-h-[200px]">
      <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-violet mb-6">Reviews from the Mystic Club</h2>
      
      {!telegramConnected ? (
        // Locked state
        <div className="relative">
          {/* Blurred placeholder reviews */}
          <div className="blur-sm pointer-events-none select-none opacity-40 space-y-3">
            <div className="flex items-start gap-3 p-3 bg-akari-cardSoft/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-akari-cardSoft flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-3 w-24 bg-akari-cardSoft rounded mb-2"></div>
                <div className="h-2 w-full bg-akari-cardSoft/50 rounded"></div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-akari-cardSoft/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-akari-cardSoft flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-3 w-20 bg-akari-cardSoft rounded mb-2"></div>
                <div className="h-2 w-3/4 bg-akari-cardSoft/50 rounded"></div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-akari-cardSoft/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-akari-cardSoft flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-3 w-28 bg-akari-cardSoft rounded mb-2"></div>
                <div className="h-2 w-5/6 bg-akari-cardSoft/50 rounded"></div>
              </div>
            </div>
          </div>
          
          {/* Lock overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-akari-card/80 backdrop-blur-sm rounded-xl border border-akari-neon-teal/20">
            <div className="w-16 h-16 rounded-full bg-gradient-neon-teal flex items-center justify-center mb-4 shadow-neon-teal">
              <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1.5c-2.76 0-5 2.24-5 5v3H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V11c0-1.1-.9-2-2-2h-1V6.5c0-2.76-2.24-5-5-5zm0 2c1.93 0 3.5 1.57 3.5 3.5v3h-7v-3c0-1.93 1.57-3.5 3.5-3.5z"/>
              </svg>
            </div>
            <p className="text-sm text-akari-muted text-center px-4 max-w-xs font-medium leading-relaxed">
              Reviews are locked. Connect Telegram to enable reviews from the community
            </p>
          </div>
        </div>
      ) : (
        // Connected state - placeholder for future reviews
        <div className="text-center py-12 text-akari-muted text-sm">
          <div className="w-16 h-16 rounded-full bg-gradient-neon-violet flex items-center justify-center mx-auto mb-4 shadow-neon-violet">
            <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="font-medium">No reviews yet</p>
        </div>
      )}
    </div>
  );
}

