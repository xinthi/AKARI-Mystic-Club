/**
 * Legacy Redirect: /portal/arc/gamified/[projectId] → /portal/arc/[projectSlug]/arena/[arenaSlug]
 * 
 * Redirects to the canonical arena page for gamified quests.
 * Quest leaderboard is accessible via the arena page.
 */

import type { GetServerSideProps } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectId } = context.params || {};

  if (!projectId || typeof projectId !== 'string') {
  return {
      notFound: true,
    };
    }

    try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Get project by ID
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug')
      .eq('id', projectId)
      .single();

    if (projectError || !project || !project.slug) {
      // If project not found or no slug, redirect to ARC home
      return {
        redirect: {
          destination: '/portal/arc',
          permanent: false,
        },
      };
    }

    // Get current MS arena (same logic as current-ms-arena API)
    const { data: candidates, error: arenaError } = await supabase
      .from('arenas')
      .select('slug, kind, starts_at, ends_at, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .lte('starts_at', now)
      .order('updated_at', { ascending: false });

    if (arenaError || !candidates || candidates.length === 0) {
      // No active arena - redirect to project hub
      return {
        redirect: {
          destination: `/portal/arc/${project.slug}`,
          permanent: false,
        },
      };
    }

    // Filter for live timeframe and MS kind
    const liveArenas = candidates.filter((arena) => {
      if (!arena.ends_at) return true;
      return new Date(arena.ends_at) > new Date(now);
    });

    const msArenas = liveArenas.filter((arena) => {
      const kind = arena.kind || (arena as any).settings?.kind;
      return kind === 'ms' || kind === 'legacy_ms';
    });

    // Sort by priority: 'ms' first, then 'legacy_ms'
    msArenas.sort((a, b) => {
      const aKind = a.kind || (a as any).settings?.kind || '';
      const bKind = b.kind || (b as any).settings?.kind || '';
      if (aKind === 'ms' && bKind !== 'ms') return -1;
      if (aKind !== 'ms' && bKind === 'ms') return 1;
      return 0;
    });

    const activeArena = msArenas[0];

    if (!activeArena || !activeArena.slug) {
      // No active arena with slug - redirect to project hub
      return {
        redirect: {
          destination: `/portal/arc/${project.slug}`,
          permanent: false,
        },
      };
    }

    // Redirect to canonical arena route
    return {
      redirect: {
        destination: `/portal/arc/${project.slug}/arena/${activeArena.slug}`,
        permanent: false, // 302 redirect
      },
    };
  } catch (error) {
    console.error('[ARC Gamified Redirect] Error:', error);
    // On error, redirect to ARC home
              return {
      redirect: {
        destination: '/portal/arc',
        permanent: false,
      },
    };
  }
};

// This component should never render due to redirect
export default function LegacyGamifiedRedirect() {
  return null;
}
