import { useEffect, useState, useCallback } from 'react';

export type ArcMode = 'creator' | 'crm';

export function useArcMode() {
  const [mode, setMode] = useState<ArcMode>('creator');
  const [loading, setLoading] = useState(true);

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
    refresh();
  }, [refresh]);

  const updateMode = useCallback(async (nextMode: ArcMode) => {
    setMode(nextMode);
    await fetch('/api/portal/user/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ arcMode: nextMode }),
    }).catch(() => null);
  }, []);

  return { mode, loading, setMode: updateMode, refresh };
}
