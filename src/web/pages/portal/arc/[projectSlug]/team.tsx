/**
 * Project Team Management Page
 * 
 * Allows project owners/admins to manage team members (add/remove admins and moderators).
 * Accessible from /portal/arc/[projectSlug]/team
 */

import { useState, useEffect, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { getSessionTokenFromRequest, getUserIdFromSession } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface TeamMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
  affiliate_title: string | null;
  created_at: string;
  profile?: {
    id: string;
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
}

interface ProfileSearchResult {
  id: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  slug: string | null;
  twitter_username: string | null;
  avatar_url: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ProjectTeamPage() {
  const router = useRouter();
  const { projectSlug } = router.query;
  const akariUser = useAkariUser();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('admin');
  const [selectedAffiliateTitle, setSelectedAffiliateTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const loadProject = useCallback(async () => {
    if (!projectSlug || typeof projectSlug !== 'string') return;

    try {
      const res = await fetch(`/api/portal/arc/project-by-slug?slug=${encodeURIComponent(projectSlug)}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Project not found');
      }

      const data = await res.json();
      if (!data.ok || !data.project) {
        throw new Error('Project not found');
      }

      setProject({
        id: data.project.id,
        name: data.project.name,
        slug: data.project.slug,
        twitter_username: data.project.twitter_username,
        avatar_url: data.project.avatar_url,
      });
    } catch (err: any) {
      console.error('[Project Team] Error loading project:', err);
      setError(err.message || 'Failed to load project details');
    }
  }, [projectSlug]);

  const loadMembers = useCallback(async () => {
    if (!project) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/projects/team-members?projectId=${encodeURIComponent(project.id)}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load team members');
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load team members');
      }

      setMembers(data.members || []);
    } catch (err: any) {
      console.error('[Project Team] Error loading members:', err);
      setError(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (projectSlug && typeof projectSlug === 'string') {
      loadProject();
    }
  }, [projectSlug, loadProject]);

  useEffect(() => {
    if (project) {
      loadMembers();
    }
  }, [project, loadMembers]);

  const searchProfiles = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/portal/profiles/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setSearchResults(data.profiles || []);
      } else {
        setSearchResults([]);
        if (data.error) {
          console.warn('[Project Team] Search error:', data.error);
        }
      }
    } catch (err) {
      console.error('[Project Team] Error searching profiles:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProfiles(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddMember = async (profileId: string) => {
    if (!project) return;
    if (adding) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/projects/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          profileId,
          role: selectedRole,
          affiliate_title: selectedAffiliateTitle || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add team member');
      }

      // Reload members
      await loadMembers();
      setSearchQuery('');
      setSearchResults([]);
      setSelectedAffiliateTitle('');
    } catch (err: any) {
      console.error('[Project Team] Error adding member:', err);
      setError(err.message || 'Failed to add team member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!project) return;
    const key = profileId;
    if (removing.has(key)) return;

    if (!confirm('Are you sure you want to remove this team member?')) {
      return;
    }

    setRemoving((prev) => new Set(prev).add(key));
    setError(null);
    try {
      const res = await fetch('/api/portal/projects/team-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          profileId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to remove team member');
      }

      // Reload members
      await loadMembers();
    } catch (err: any) {
      console.error('[Project Team] Error removing member:', err);
      setError(err.message || 'Failed to remove team member');
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (loading && !project) {
    return (
      <ArcPageShell
        projectSlug={typeof projectSlug === 'string' ? projectSlug : null}
        canManageProject={false}
        isSuperAdmin={userIsSuperAdmin}
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
            <p className="mt-4 text-white/60">Loading...</p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  if (!project) {
    return (
      <ArcPageShell
        projectSlug={typeof projectSlug === 'string' ? projectSlug : null}
        canManageProject={false}
        isSuperAdmin={userIsSuperAdmin}
      >
        <div className="text-center py-12">
          <p className="text-white/60">Project not found</p>
          <Link href="/portal/arc" className="mt-4 inline-block text-teal-400 hover:text-teal-300">
            ← Back to ARC
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell
      projectSlug={typeof projectSlug === 'string' ? projectSlug : null}
      canManageProject={true}
      isSuperAdmin={userIsSuperAdmin}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
              <Link href={`/portal/arc/${projectSlug}`} className="hover:text-white transition-colors">
                {project.name}
              </Link>
              <span>/</span>
              <span className="text-white">Team</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Team Management</h1>
            <p className="text-white/60 text-sm mt-1">Manage admins and moderators for your project</p>
          </div>
          <Link
            href={`/portal/arc/${projectSlug}`}
            className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            ← Back to Project
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-4 text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Add Member Section */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Add Team Member</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'moderator')}
                className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">Affiliate Title (Optional)</label>
              <input
                type="text"
                value={selectedAffiliateTitle}
                onChange={(e) => setSelectedAffiliateTitle(e.target.value)}
                placeholder="e.g., Founder, CMO, Investor, Advisor"
                className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="mt-1 text-xs text-white/40">
                This title will be displayed on the project leaderboard page
              </p>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">Search by Twitter Username</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="@username"
                className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {searching && (
                <p className="mt-1 text-xs text-white/40">Searching...</p>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border border-white/10 rounded-lg bg-black/60 p-4 max-h-64 overflow-y-auto">
                <p className="text-xs text-white/60 mb-2">Search Results:</p>
                <div className="space-y-2">
                  {searchResults.map((profile) => {
                    const isAlreadyMember = members.some(m => m.profile_id === profile.id);
                    return (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {profile.profile_image_url && (
                            <Image
                              src={profile.profile_image_url}
                              alt={profile.username}
                              width={32}
                              height={32}
                              className="rounded-full"
                            />
                          )}
                          <div>
                            <p className="text-sm text-white font-medium">@{profile.username}</p>
                            {profile.name && (
                              <p className="text-xs text-white/60">{profile.name}</p>
                            )}
                          </div>
                        </div>
                        {isAlreadyMember ? (
                          <span className="text-xs text-white/40">Already a member</span>
                        ) : (
                          <button
                            onClick={() => handleAddMember(profile.id)}
                            disabled={adding}
                            className="px-3 py-1 text-xs bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded hover:bg-teal-500/30 disabled:opacity-50"
                          >
                            {adding ? 'Adding...' : 'Add'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Team Members</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white/60"></div>
              <p className="mt-2 text-white/60 text-sm">Loading members...</p>
            </div>
          ) : members.length === 0 ? (
            <p className="text-white/60 text-sm">No team members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    {member.profile?.profile_image_url && (
                      <Image
                        src={member.profile.profile_image_url}
                        alt={member.profile.username}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">
                          @{member.profile?.username || 'Unknown'}
                        </p>
                        <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded">
                          {member.role}
                        </span>
                        {member.affiliate_title && (
                          <span className="text-xs text-white/60">
                            ({member.affiliate_title})
                          </span>
                        )}
                      </div>
                      {member.profile?.name && (
                        <p className="text-xs text-white/60">{member.profile.name}</p>
                      )}
                    </div>
                  </div>
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(member.profile_id)}
                      disabled={removing.has(member.profile_id)}
                      className="px-3 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 disabled:opacity-50"
                    >
                      {removing.has(member.profile_id) ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectSlug } = context.params || {};
  
  if (!projectSlug || typeof projectSlug !== 'string') {
    return { notFound: true };
  }

  const supabase = getSupabaseAdmin();
  const sessionToken = getSessionTokenFromRequest(context.req);
  
  if (!sessionToken) {
    return {
      redirect: {
        destination: `/portal/arc/${projectSlug}`,
        permanent: false,
      },
    };
  }

  const userId = await getUserIdFromSession(sessionToken);
  if (!userId) {
    return {
      redirect: {
        destination: `/portal/arc/${projectSlug}`,
        permanent: false,
      },
    };
  }

  // Get project by slug
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .single();

  if (!project) {
    return { notFound: true };
  }

  // Check permissions - must be owner or admin (not just moderator)
  const permissions = await checkProjectPermissions(supabase, userId, project.id);
  
  // Only owners and admins can manage team members (moderators cannot)
  const canManageTeam = permissions.isOwner || permissions.isAdmin || permissions.isSuperAdmin;
  
  if (!canManageTeam) {
    return {
      redirect: {
        destination: `/portal/arc/${projectSlug}`,
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};
