import { useEffect, useState, useCallback } from 'react';

export type ArcMode = 'creator' | 'crm';

export function useArcMode() {
  const [mode, setMode] = useState<ArcMode>('creator');
  const [loading, setLoading] = useState(true);
  const storageKey = 'akari_arc_mode';

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/user/preferences', { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.arcMode) {
        setMode(data.arcMode);
      }
    } catch {
      // keep default
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(storageKey) as ArcMode | null;
      if (stored === 'creator' || stored === 'crm') {
        setMode(stored);
      }
    }
    refresh();
  }, [refresh, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const next = event.newValue as ArcMode | null;
      if (next === 'creator' || next === 'crm') {
        setMode(next);
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent).detail as ArcMode | undefined;
      if (detail === 'creator' || detail === 'crm') {
        setMode(detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('arc-mode-change', handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('arc-mode-change', handleCustom as EventListener);
    };
  }, [storageKey]);

  const updateMode = useCallback(async (nextMode: ArcMode) => {
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, nextMode);
      window.dispatchEvent(new CustomEvent('arc-mode-change', { detail: nextMode }));
    }
    await fetch('/api/portal/user/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ arcMode: nextMode }),
    }).catch(() => null);
  }, []);

  return { mode, loading, setMode: updateMode, refresh };
}
