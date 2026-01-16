import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';

export default function QuestsIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/portal/arc');
  }, [router]);

  return (
    <ArcPageShell>
      <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-white/60">
        Redirecting to quests...
      </div>
    </ArcPageShell>
  );
}
