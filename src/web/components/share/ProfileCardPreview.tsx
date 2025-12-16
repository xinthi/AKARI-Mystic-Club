/**
 * ProfileCardPreview Modal
 * 
 * Compact modal showing the shareable profile card with download/share options.
 * Responsive design optimized for all devices.
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
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileCardPreview({
  isOpen,
  onClose,
  ...cardProps
}: ProfileCardPreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Common html2canvas options for consistent rendering
  const getCanvasOptions = (element: HTMLElement) => ({
    backgroundColor: '#08080c',
    scale: 2,
    logging: false,
    useCORS: true,
    allowTaint: true,
    imageTimeout: 15000,
    width: 380,
    height: 238,
    windowWidth: 380,
    windowHeight: 238,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    // Clone callback to ensure computed styles are applied
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      // Force the cloned element to have exact dimensions
      clonedElement.style.width = '380px';
      clonedElement.style.height = '238px';
      clonedElement.style.position = 'relative';
      clonedElement.style.overflow = 'hidden';
    },
  });

  const handleDownload = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      // Get the actual card element (child of ref)
      const cardElement = cardRef.current.querySelector('div') as HTMLElement;
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const canvas = await html2canvas(cardElement, getCanvasOptions(cardElement));

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `akari-card-${cardProps.username}-${Date.now()}.png`;
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
    setCopySuccess(false);
    try {
      // Get the actual card element (child of ref)
      const cardElement = cardRef.current.querySelector('div') as HTMLElement;
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const canvas = await html2canvas(cardElement, getCanvasOptions(cardElement));

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Failed to copy image. Please try again.');
          setIsCopying(false);
          return;
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        } catch {
          const dataUrl = canvas.toDataURL('image/png');
          await navigator.clipboard.writeText(dataUrl);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
        setIsCopying(false);
      });
    } catch (error) {
      console.error('[ProfileCardPreview] Copy error:', error);
      alert('Failed to copy image. Please try again.');
      setIsCopying(false);
    }
  };

  const handleShareOnX = async () => {
    // Copy image first
    await handleCopy();
    
    // Open X with pre-filled text
    const text = `My AKARI Score is ${cardProps.score ?? 'N/A'} 🔮 Join the Mystic Club!`;
    const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3"
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0d0d12] border border-white/10 rounded-xl overflow-hidden"
        style={{ boxShadow: '0 0 40px rgba(0, 246, 162, 0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Share Your Card</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Card Preview */}
        <div className="p-4 flex justify-center overflow-x-auto">
          <div ref={cardRef}>
            <ProfileCard {...cardProps} />
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 relative z-10 bg-[#0d0d12]">
          <div className="flex gap-2 relative">
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-[#00f6a2] to-[#3bf4ff] text-black text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            >
              {isGenerating ? (
                <div className="w-3 h-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              <span>Download</span>
            </button>

            <button
              onClick={handleCopy}
              disabled={isCopying || isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 ${
                copySuccess
                  ? 'border-green-500/50 bg-green-500/10 text-green-400'
                  : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              {isCopying ? (
                <div className="w-3 h-3 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
              ) : copySuccess ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={handleShareOnX}
              disabled={isGenerating || isCopying}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-xs font-semibold transition-all hover:bg-white/10 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span>Share</span>
            </button>
          </div>

          <p className="mt-3 text-[10px] text-center text-gray-500">
            Tip: Image is copied when sharing • Paste it on X
          </p>
        </div>
      </div>
    </div>
  );
}
