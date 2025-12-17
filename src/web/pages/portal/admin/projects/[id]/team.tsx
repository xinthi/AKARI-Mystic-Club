/**
 * Super Admin Project Team Management Page
 * 
 * Allows SuperAdmin to add/remove team members (admin, moderator roles) for a project.
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface TeamMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
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
  display_name: string | null;
  twitter_username: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ProjectTeamPage() {
  const router = useRouter();
  const { id: projectId } = router.query;
  const akariUser = useAkariUser();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('admin');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  useEffect(() => {
    if (projectId && typeof projectId === 'string' && userIsSuperAdmin) {
      loadProject();
      loadMembers();
    }
  }, [projectId, userIsSuperAdmin]);

  const loadProject = async () => {
    if (!projectId || typeof projectId !== 'string') return;

    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}`);
      
      // Check content type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('[Project Team] Response is not JSON:', contentType);
        setError('Server returned invalid response. Please refresh the page.');
        return;
      }
      
      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load project');
      }
      
      if (data.project) {
        setProject({
          id: data.project.id,
          name: data.project.name || data.project.display_name || 'Unknown Project',
          display_name: data.project.display_name,
          twitter_username: data.project.twitter_username || data.project.x_handle,
        });
      }
    } catch (err: any) {
      console.error('[Project Team] Error loading project:', err);
      setError(err.message || 'Failed to load project details');
    }
  };

  const loadMembers = async () => {
    if (!projectId || typeof projectId !== 'string') return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}/team`);
      
      // Check content type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('[Project Team] Response is not JSON:', contentType);
        setError('Server returned invalid response. Please refresh the page.');
        setLoading(false);
        return;
      }
      
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load team members');
      }

      setMembers(data.members || []);
    } catch (err: any) {
      console.error('[Project Team] Error loading members:', err);
      setError(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const searchProfiles = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/portal/admin/profiles/search?q=${encodeURIComponent(query)}`);
      
      // Check content type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('[Project Team] Search response is not JSON:', contentType);
        setSearchResults([]);
        setSearching(false);
        return;
      }
      
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
    if (!projectId || typeof projectId !== 'string') return;
    if (adding) return;

    setAdding(true);
    setError(null); // Clear previous errors
    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          role: selectedRole,
        }),
      });

      // Check content type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned invalid response');
      }

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add team member');
      }

      // Reload members
      await loadMembers();
      setSearchQuery('');
      setSearchResults([]);
    } catch (err: any) {
      console.error('[Project Team] Error adding member:', err);
      setError(err.message || 'Failed to add team member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (profileId: string, role: string) => {
    if (!projectId || typeof projectId !== 'string') return;
    const key = `${profileId}-${role}`;
    if (removing.has(key)) return;

    setRemoving((prev) => new Set(prev).add(key));
    setError(null); // Clear previous errors
    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}/team`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          role,
        }),
      });

      // Check content type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned invalid response');
      }

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

  // Not logged in or not super admin
  if (!akariUser.isLoggedIn || !userIsSuperAdmin) {
    return (
      <PortalLayout title="Project Team">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Project Team">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Link href="/portal/admin" className="hover:text-akari-primary transition-colors">
              Admin
            </Link>
            <span>/</span>
            <Link href="/portal/admin/projects" className="hover:text-akari-primary transition-colors">
              Projects
            </Link>
            <span>/</span>
            <span className="text-slate-300">Team</span>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">
            Team Management: {project?.display_name || project?.name || 'Loading...'}
          </h1>
          {project?.twitter_username && (
            <p className="text-sm text-slate-400">@{project.twitter_username}</p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400">
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
        <div className="mb-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Add Team Member</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'moderator')}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
              >
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Search Profile by Username</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Twitter username..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
              />
              {searching && (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></span>
                  Searching...
                </p>
              )}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">No profiles found. Try a different username.</p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-2">
                  {searchResults.map((profile) => {
                    const isAlreadyAdded = members.some(m => m.profile_id === profile.id && m.role === selectedRole);
                    return (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {profile.profile_image_url ? (
                            <img
                              src={profile.profile_image_url}
                              alt={profile.username}
                              className="w-10 h-10 rounded-full"
                              onError={(e) => {
                                // Hide broken images
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-medium">
                              {profile.username[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-white">@{profile.username}</p>
                            {profile.name && (
                              <p className="text-xs text-slate-400">{profile.name}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddMember(profile.id)}
                          disabled={adding || isAlreadyAdded}
                          className="px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {adding ? 'Adding...' : isAlreadyAdded ? 'Already Added' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Members */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Team Members</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
              <p className="text-slate-400">Loading...</p>
            </div>
          ) : members.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No team members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={`${member.profile_id}-${member.role}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    {member.profile?.profile_image_url && (
                      <img
                        src={member.profile.profile_image_url}
                        alt={member.profile.username}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        @{member.profile?.username || 'Unknown'}
                      </p>
                      {member.profile?.name && (
                        <p className="text-xs text-slate-400">{member.profile.name}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        Role: <span className="capitalize">{member.role}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(member.profile_id, member.role)}
                    disabled={removing.has(`${member.profile_id}-${member.role}`)}
                    className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removing.has(`${member.profile_id}-${member.role}`) ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }
  return { props: {} };
};

