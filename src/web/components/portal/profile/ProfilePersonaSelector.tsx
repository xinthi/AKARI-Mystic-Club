/**
 * ProfilePersonaSelector Component
 * 
 * Allows users to select their Mystic Identity (persona type and tag).
 * Includes save functionality via API.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PersonaType,
  PersonaTag,
  IndividualPersonaTag,
  CompanyPersonaTag,
  INDIVIDUAL_TAGS,
  COMPANY_TAGS,
  getPersonaTagLabel,
} from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfilePersonaSelectorProps {
  /** Current saved persona type from DB */
  savedPersonaType: PersonaType;
  /** Current saved persona tag from DB */
  savedPersonaTag: PersonaTag | null;
  /** Callback after successful save */
  onSaveSuccess?: (personaType: PersonaType, personaTag: PersonaTag | null) => void;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface PersonaTagButtonProps {
  tag: PersonaTag;
  selected: boolean;
  onClick: () => void;
}

function PersonaTagButton({ tag, selected, onClick }: PersonaTagButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 min-h-[36px] rounded-lg text-xs font-medium transition-all ${
        selected
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
          : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50 hover:text-slate-300'
      }`}
    >
      {getPersonaTagLabel(tag)}
    </button>
  );
}

// Toast notification component
function Toast({ 
  message, 
  type, 
  onClose 
}: { 
  message: string; 
  type: 'success' | 'error'; 
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up ${
        type === 'success' 
          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
          : 'bg-red-500/20 border border-red-500/50 text-red-400'
      }`}
    >
      {type === 'success' ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )}
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfilePersonaSelector({
  savedPersonaType,
  savedPersonaTag,
  onSaveSuccess,
}: ProfilePersonaSelectorProps) {
  // Local state for editing
  const [localPersonaType, setLocalPersonaType] = useState<PersonaType>(savedPersonaType);
  const [localPersonaTag, setLocalPersonaTag] = useState<PersonaTag | null>(savedPersonaTag);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Sync local state when saved values change (e.g., after refresh)
  useEffect(() => {
    setLocalPersonaType(savedPersonaType);
    setLocalPersonaTag(savedPersonaTag);
  }, [savedPersonaType, savedPersonaTag]);
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = localPersonaType !== savedPersonaType || localPersonaTag !== savedPersonaTag;
  
  // Handle persona type change
  const handlePersonaTypeChange = (type: PersonaType) => {
    setLocalPersonaType(type);
    // Clear tag if it's not valid for the new type
    if (localPersonaTag) {
      if (type === 'individual' && !INDIVIDUAL_TAGS.includes(localPersonaTag as IndividualPersonaTag)) {
        setLocalPersonaTag(null);
      } else if (type === 'company' && !COMPANY_TAGS.includes(localPersonaTag as CompanyPersonaTag)) {
        setLocalPersonaTag(null);
      }
    }
  };
  
  // Handle tag selection
  const handleTagClick = (tag: PersonaTag) => {
    setLocalPersonaTag(localPersonaTag === tag ? null : tag);
  };
  
  // Save persona
  const handleSave = useCallback(async () => {
    if (isSaving || !hasUnsavedChanges) return;
    
    setIsSaving(true);
    
    try {
      const res = await fetch('/api/portal/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaType: localPersonaType,
          personaTag: localPersonaTag,
        }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setToast({ message: 'Identity updated', type: 'success' });
        onSaveSuccess?.(localPersonaType, localPersonaTag);
      } else {
        setToast({ message: data.error || 'Failed to save', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Network error. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, hasUnsavedChanges, localPersonaType, localPersonaTag, onSaveSuccess]);
  
  // Reset to saved values
  const handleReset = () => {
    setLocalPersonaType(savedPersonaType);
    setLocalPersonaTag(savedPersonaTag);
  };
  
  return (
    <>
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Your Mystic Identity</h2>
        
        {/* Persona Type Toggle */}
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-2">I am a/an</p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePersonaTypeChange('individual')}
              className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-all ${
                localPersonaType === 'individual'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                  : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Individual
              </span>
            </button>
            <button
              onClick={() => handlePersonaTypeChange('company')}
              className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-all ${
                localPersonaType === 'company'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Company
              </span>
            </button>
          </div>
        </div>
        
        {/* Persona Tags */}
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-2">
            {localPersonaType === 'individual' ? 'My role in CT' : 'Company type'}
          </p>
          <div className="flex flex-wrap gap-2">
            {localPersonaType === 'individual' ? (
              INDIVIDUAL_TAGS.map((tag) => (
                <PersonaTagButton
                  key={tag}
                  tag={tag}
                  selected={localPersonaTag === tag}
                  onClick={() => handleTagClick(tag)}
                />
              ))
            ) : (
              COMPANY_TAGS.map((tag) => (
                <PersonaTagButton
                  key={tag}
                  tag={tag}
                  selected={localPersonaTag === tag}
                  onClick={() => handleTagClick(tag)}
                />
              ))
            )}
          </div>
        </div>
        
        {/* Save/Reset buttons */}
        {hasUnsavedChanges && (
          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-emerald-500 text-black font-medium hover:bg-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Saving
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-slate-800 text-slate-400 hover:text-white transition text-sm disabled:opacity-50"
            >
              Reset
            </button>
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              You have unsaved changes
            </p>
          </div>
        )}
      </section>
      
      {/* Toast notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      
      {/* CSS for toast animation */}
      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </>
  );
}

