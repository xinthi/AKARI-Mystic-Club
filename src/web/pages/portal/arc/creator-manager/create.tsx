/**
 * Creator Manager - Create Program Page
 * 
 * Allows project owners/admins/moderators to create new Creator Manager programs.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  twitter_username: string | null;
}

interface ProjectWithPrograms extends Project {
  programs: any[];
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
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg border shadow-lg flex items-center gap-3 ${
      type === 'success' 
        ? 'bg-green-500/20 border-green-500/50 text-green-400' 
        : 'bg-red-500/20 border-red-500/50 text-red-400'
    }`}>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 hover:opacity-70 transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreateProgramPage() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const { projectId: projectIdFromQuery } = router.query;
  
  const [projects, setProjects] = useState<ProjectWithPrograms[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const [formData, setFormData] = useState({
    projectId: '',
    title: '',
    description: '',
    visibility: 'private' as 'private' | 'public' | 'hybrid',
    startAt: '',
    endAt: '',
  });

  // Load projects user has access to
  useEffect(() => {
    async function loadProjects() {
      if (!akariUser.isLoggedIn) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/portal/creator-manager/projects', { credentials: 'include' });
        const data = await response.json();

        if (!data.ok) {
          if (data.error?.includes('configuration') || data.error?.includes('Service configuration')) {
            setError('Server configuration error. Please contact support.');
          } else {
            setError(data.error || 'Failed to load projects');
          }
          setProjects([]);
          return;
        }

        const projectsWithAccess: ProjectWithPrograms[] = data.projects || [];
        setProjects(projectsWithAccess);

        // If projectId is provided in query, find and select it
        if (projectIdFromQuery && typeof projectIdFromQuery === 'string') {
          const matchingProject = projectsWithAccess.find(
            (p) => p.id === projectIdFromQuery || p.slug === projectIdFromQuery
          );
          
          if (matchingProject) {
            setSelectedProject(matchingProject);
            setFormData((prev) => ({ ...prev, projectId: matchingProject.id }));
          } else {
            // Project not found or user doesn't have access
            setError('Project not found or you do not have access to it.');
          }
        }
      } catch (err: any) {
        console.error('[Create Program] Error loading projects:', err);
        setError('Failed to load projects. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, [akariUser.isLoggedIn, projectIdFromQuery]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.projectId || !formData.title.trim()) {
      setToast({ message: 'Project and title are required', type: 'error' });
      return;
    }

    if (!['private', 'public', 'hybrid'].includes(formData.visibility)) {
      setToast({ message: 'Invalid visibility value', type: 'error' });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        projectId: formData.projectId,
        title: formData.title.trim(),
        visibility: formData.visibility,
      };

      if (formData.description.trim()) {
        payload.description = formData.description.trim();
      }

      if (formData.startAt) {
        // Convert date to ISO string
        const startDate = new Date(formData.startAt);
        if (!isNaN(startDate.getTime())) {
          payload.startAt = startDate.toISOString();
        }
      }

      if (formData.endAt) {
        // Convert date to ISO string
        const endDate = new Date(formData.endAt);
        if (!isNaN(endDate.getTime())) {
          payload.endAt = endDate.toISOString();
        }
      }

      const res = await fetch('/api/portal/creator-manager/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create program');
      }

      // Get program ID from response
      const programId = data.programs?.[0]?.id;
      if (!programId) {
        throw new Error('Program created but ID not returned');
      }

      // Show success toast
      setToast({ message: 'Program created successfully!', type: 'success' });

      // Redirect to program detail page after a short delay
      setTimeout(() => {
        router.push(`/portal/arc/creator-manager/${programId}`);
      }, 1000);
    } catch (err: any) {
      console.error('[Create Program] Error:', err);
      setError(err.message || 'Failed to create program');
      setToast({ message: err.message || 'Failed to create program', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">Please log in to create a program</p>
        </div>
      </ArcPageShell>
    );
  }

  // Loading state
  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </ArcPageShell>
    );
  }

  // Error state (project not found or no access)
  if (error && (projectIdFromQuery || projects.length === 0)) {
    return (
      <ArcPageShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <Link href="/portal/arc/creator-manager" className="hover:text-white transition-colors">
              Creator Manager
            </Link>
            <span>/</span>
            <span className="text-white">Create Program</span>
          </div>

          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <Link
              href="/portal/arc/creator-manager"
              className="text-teal-400 hover:text-teal-300 text-sm underline inline-block"
            >
              Back to Creator Manager
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  // No projects with access
  if (projects.length === 0) {
    return (
      <ArcPageShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <Link href="/portal/arc/creator-manager" className="hover:text-white transition-colors">
              Creator Manager
            </Link>
            <span>/</span>
            <span className="text-white">Create Program</span>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60 mb-4">
              You don&apos;t have admin/moderator access to any projects yet.
            </p>
            <p className="text-sm text-white/60 mb-4">
              Projects must be claimed and you must be assigned as owner, admin, or moderator.
            </p>
            <Link
              href="/portal/arc/creator-manager"
              className="text-teal-400 hover:text-teal-300 text-sm underline inline-block"
            >
              Back to Creator Manager
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <>
      <ArcPageShell>
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <Link href="/portal/arc/creator-manager" className="hover:text-white transition-colors">
              Creator Manager
            </Link>
            <span>/</span>
            <span className="text-white">Create Program</span>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Create Program</h1>
            <p className="text-white/60">
              Create a new Creator Manager program for your project
            </p>
          </div>

          {/* Form */}
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project Selection */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Project <span className="text-red-400">*</span>
                </label>
                {projectIdFromQuery && selectedProject ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    {selectedProject.avatar_url && (
                      <img
                        src={selectedProject.avatar_url}
                        alt={selectedProject.name}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{selectedProject.name}</div>
                      {selectedProject.twitter_username && (
                        <div className="text-xs text-white/60">@{selectedProject.twitter_username}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <select
                    value={formData.projectId}
                    onChange={(e) => {
                      const project = projects.find((p) => p.id === e.target.value);
                      setSelectedProject(project || null);
                      setFormData({ ...formData, projectId: e.target.value });
                    }}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                    disabled={submitting}
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} {project.twitter_username ? `(@${project.twitter_username})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  placeholder="e.g., Q1 Creator Program"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50 placeholder-white/40"
                  disabled={submitting}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the program goals, rewards, and requirements..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50 placeholder-white/40 resize-none"
                  disabled={submitting}
                />
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Visibility <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.visibility}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as 'private' | 'public' | 'hybrid' })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                  disabled={submitting}
                >
                  <option value="private">Private (invite only)</option>
                  <option value="public">Public (anyone can apply)</option>
                  <option value="hybrid">Hybrid (invite + public applications)</option>
                </select>
                <p className="text-xs text-white/60 mt-1">
                  {formData.visibility === 'private' && 'Only invited creators can join'}
                  {formData.visibility === 'public' && 'Any creator can apply to join'}
                  {formData.visibility === 'hybrid' && 'Invited creators are auto-approved, others can apply'}
                </p>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Start Date (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.endAt}
                    onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting || !formData.projectId || !formData.title.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Creating...' : 'Create Program'}
                </button>
                <Link
                  href="/portal/arc/creator-manager"
                  className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors font-medium"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </ArcPageShell>

      {/* Toast notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* CSS for toast animation */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        :global(.fixed.top-4.right-4) {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

