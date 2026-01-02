/**
 * Legacy Redirect: /portal/arc/project/[projectId] → /portal/arc/[projectSlug]
 * 
 * This route redirects to the canonical project hub page using slug.
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

    // Try to find project by ID first (UUID format)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    
    let projectData: any = null;

    if (isUUID) {
      const { data, error } = await supabase
        .from('projects')
        .select('slug')
        .eq('id', projectId)
        .single();
      
      if (!error && data) {
        projectData = data;
      }
    } else {
      // Try slug (if projectId is actually a slug)
      const { data, error } = await supabase
        .from('projects')
        .select('slug')
        .eq('slug', projectId)
        .single();
      
      if (!error && data) {
        projectData = data;
      }
    }

    // If project found and has slug, redirect to canonical route
    if (projectData?.slug) {
      return {
        redirect: {
          destination: `/portal/arc/${projectData.slug}`,
          permanent: false, // 302 redirect (temporary, as requested)
        },
      };
    }

    // If no slug found, redirect to ARC home
    // (project might not have ARC enabled or slug might be missing)
    return {
      redirect: {
        destination: '/portal/arc',
        permanent: false,
      },
    };
  } catch (error) {
    console.error('[ARC Project Redirect] Error:', error);
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
export default function LegacyProjectRedirect() {
  return null;
}
