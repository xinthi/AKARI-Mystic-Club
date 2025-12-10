/**
 * ProfileCardPreview Modal
 * 
 * Shows a preview of the shareable profile card with download/share options.
 */

import React, { useState, useRef } from 'react';
import { ProfileCard, ProfileCardProps } from './ProfileCard';
import html2canvas from 'html2canvas';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileCardPreviewProps extends ProfileCardProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Image URL for sharing (from API) */
  imageUrl?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileCardPreview({
  isOpen,
  onClose,
  imageUrl,
  ...cardProps
}: ProfileCardPreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0f',
        scale: 2,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `akari-profile-${cardProps.username}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('[ProfileCardPreview] Download error:', error);
      alert('Failed to download image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;

    setIsCopying(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0f',
        scale: 2,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Failed to copy image. Please try again.');
          return;
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
          alert('Image copied to clipboard!');
        } catch (err) {
          // Fallback: convert to data URL and copy
          const dataUrl = canvas.toDataURL('image/png');
          await navigator.clipboard.writeText(dataUrl);
          alert('Image data copied to clipboard!');
        }
      });
    } catch (error) {
      console.error('[ProfileCardPreview] Copy error:', error);
      alert('Failed to copy image. Please try again.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleShareOnX = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0f',
        scale: 2,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Failed to generate image for sharing. Please try again.');
          return;
        }

        // Create a temporary URL for the blob
        const imageUrl = URL.createObjectURL(blob);

        // Open X with pre-filled text
        const text = `My AKARI Score is ${cardProps.score ?? 'N/A'} — join the Mystic Club.`;
        const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;

        // Note: X doesn't support direct image upload via URL parameter
        // Users will need to attach the image manually
        window.open(shareUrl, '_blank');

        // Clean up
        setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      });
    } catch (error) {
      console.error('[ProfileCardPreview] Share error:', error);
      alert('Failed to prepare image for sharing. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="relative bg-akari-card border border-akari-neon-teal/30 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(0,246,162,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-akari-muted hover:text-akari-neon-teal transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.5)]"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gradient-neon mb-6 text-center">
          Share Your AKARI Profile
        </h2>

        {/* Card Preview */}
        <div className="flex justify-center mb-6">
          <div
            ref={cardRef}
            className="w-full max-w-[600px]"
            style={{
              aspectRatio: '3/4',
            }}
          >
            <ProfileCard {...cardProps} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="pill-neon flex items-center gap-2 px-6 py-3 bg-gradient-neon-teal text-black font-semibold hover:shadow-akari-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PNG
              </>
            )}
          </button>

          <button
            onClick={handleCopy}
            disabled={isCopying || isGenerating}
            className="pill-neon flex items-center gap-2 px-6 py-3 border border-akari-neon-teal/30 bg-akari-cardSoft/50 text-akari-text hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)] transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCopying ? (
              <>
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                Copying...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Image
              </>
            )}
          </button>

          <button
            onClick={handleShareOnX}
            disabled={isGenerating}
            className="pill-neon flex items-center gap-2 px-6 py-3 border border-akari-neon-teal/30 bg-akari-cardSoft/50 text-akari-text hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)] transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                Preparing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Share on X
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

