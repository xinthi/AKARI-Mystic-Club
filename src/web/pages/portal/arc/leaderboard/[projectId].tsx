/**
 * Page: /portal/arc/leaderboard/[projectId]
 * 
 * Legacy route that redirects to the active arena page for the project.
 * If leaderboard module is not enabled or no active arena exists, shows a friendly message.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';

export default function LegacyLeaderboardPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    async function handleRedirect() {
      if (!router.isReady || !projectId || typeof projectId !== 'string') {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Check ARC state
        const stateRes = await fetch(`/api/portal/arc/state?projectId=${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        const stateData = await stateRes.json();

        if (!stateData.ok) {
          setError(stateData.error || 'Failed to check ARC state');
          setLoading(false);
          return;
        }

        // Check if leaderboard module is enabled and active
        if (!stateData.modules?.leaderboard?.enabled || !stateData.modules?.leaderboard?.active) {
          setError('Leaderboard module is not enabled or active for this project');
          setLoading(false);
          return;
        }

        // Get active arena
        const arenaRes = await fetch(`/api/portal/arc/active-arena?projectId=${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        const arenaData = await arenaRes.json();

        if (!arenaData.ok || !arenaData.arena) {
          setError('No active arena found for this project');
          setLoading(false);
          return;
        }

        // Get project slug
        const projectRes = await fetch(`/api/portal/arc/project/${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        const projectData = await projectRes.json();

        if (!projectData.ok || !projectData.project) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        const projectSlug = projectData.project.slug;
        const arenaSlug = arenaData.arena.slug;

        // Redirect to active arena page
        setRedirecting(true);
        router.replace(`/portal/arc/${projectSlug}/arena/${arenaSlug}`);
      } catch (err: any) {
        console.error('[LegacyLeaderboardPage] Error:', err);
        setError(err.message || 'Failed to redirect');
        setLoading(false);
      }
    }

    handleRedirect();
  }, [router.isReady, projectId, router]);

  if (redirecting) {
    return (
      <ArcPageShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/60 mx-auto mb-4"></div>
            <p className="text-white">Redirecting to arena...</p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  if (loading) {
    return (
      <ArcPageShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/60 mx-auto mb-4"></div>
            <p className="text-white">Loading...</p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="max-w-2xl mx-auto">
        <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
          <h1 className="text-2xl font-semibold text-white mb-4">Leaderboard</h1>
          {error ? (
            <div className="space-y-4">
              <p className="text-white/60">{error}</p>
              <Link
                href="/portal/arc"
                className="inline-block px-4 py-2 bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
              >
                Back to ARC
              </Link>
            </div>
          ) : (
            <p className="text-white/60">Redirecting...</p>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}







