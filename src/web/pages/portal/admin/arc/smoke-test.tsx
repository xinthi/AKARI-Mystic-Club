/**
 * ARC Smoke Test Page
 * 
 * SuperAdmin-only manual test dashboard for verifying all ARC pages and APIs.
 */

import { useState, useEffect, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

interface TestProject {
  project_id: string;
  slug: string | null;
  name: string | null;
}

interface TestArena {
  slug: string | null;
}

interface TestCampaign {
  id: string;
  name: string;
  created_at?: string;
}

interface TestResult {
  name: string;
  type: 'page' | 'api' | 'action';
  url: string;
  status: 'pending' | 'pass' | 'fail';
  error?: string;
  result?: any;
}

interface ApprovalVerification {
  rpcResult?: any;
  request?: {
    id: string;
    status: string;
    decided_at: string | null;
  };
  projectAccess?: {
    application_status: string;
    approved_at: string | null;
    approved_by_profile_id: string | null;
  };
  projectFeatures?: {
    leaderboard_enabled: boolean | null;
    gamefi_enabled: boolean | null;
    crm_enabled: boolean | null;
    updated_at: string | null;
  };
  arena?: {
    id: string;
    kind: string;
    status: string;
    name: string | null;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcSmokeTestPage() {
  const akariUser = useAkariUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Test data
  const [testProject, setTestProject] = useState<TestProject | null>(null);
  const [testArena, setTestArena] = useState<TestArena | null>(null);
  const [testCampaign, setTestCampaign] = useState<TestCampaign | null>(null);
  
  // Test results
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  
  // Approval verification
  const [approvalVerification, setApprovalVerification] = useState<ApprovalVerification | null>(null);

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Load test data
  const loadTestData = useCallback(async () => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch test project
      const projectsRes = await fetch('/api/portal/arc/projects', {
        credentials: 'include',
        cache: 'no-store',
      });
      const projectsData = await projectsRes.json();

      if (!projectsData.ok || !projectsData.projects || projectsData.projects.length === 0) {
        throw new Error('No projects found. Please ensure at least one project has ARC enabled.');
      }

      // Find first project with valid slug
      const project = projectsData.projects.find((p: TestProject) => p.slug && p.slug.trim());
      if (!project) {
        throw new Error('No project with valid slug found.');
      }

      setTestProject(project);

      // 2. Fetch test arena
      if (project.project_id) {
        const arenaRes = await fetch(
          `/api/portal/arc/projects/${project.project_id}/current-ms-arena`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        );
        const arenaData = await arenaRes.json();

        if (arenaData.ok && arenaData.arena && arenaData.arena.slug) {
          setTestArena({ slug: arenaData.arena.slug });
        }
      }

      // 3. Fetch test campaign
      if (project.project_id) {
        const campaignsRes = await fetch(
          `/api/portal/arc/campaigns?projectId=${project.project_id}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        );
        const campaignsData = await campaignsRes.json();

        if (campaignsData.ok && campaignsData.campaigns && campaignsData.campaigns.length > 0) {
          // Get newest campaign
          const newestCampaign = campaignsData.campaigns.sort(
            (a: TestCampaign, b: TestCampaign) =>
              new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          )[0];
          setTestCampaign(newestCampaign);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load test data');
    } finally {
      setLoading(false);
    }
  }, [userIsSuperAdmin]);

  useEffect(() => {
    loadTestData();
  }, [loadTestData]);

  // Initialize test results
  useEffect(() => {
    if (!testProject) return;

    const projectSlug = testProject.slug || '';
    const arenaSlug = testArena?.slug || '';
    const campaignId = testCampaign?.id || '';

    const tests: TestResult[] = [
      // =============================================================================
      // PAGES (just open links)
      // =============================================================================
      { name: '/portal/arc', type: 'page', url: '/portal/arc', status: 'pending' },
      { name: `/portal/arc/[projectSlug]`, type: 'page', url: `/portal/arc/${projectSlug}`, status: 'pending' },
      { name: `/portal/arc/admin/[projectSlug]`, type: 'page', url: `/portal/arc/admin/${projectSlug}`, status: 'pending' },
      ...(arenaSlug
        ? [{ name: `/portal/arc/[projectSlug]/arena/[arenaSlug]`, type: 'page' as const, url: `/portal/arc/${projectSlug}/arena/${arenaSlug}`, status: 'pending' as const }]
        : []),
      { name: '/portal/admin/arc', type: 'page', url: '/portal/admin/arc', status: 'pending' },
      { name: '/portal/admin/arc/leaderboard-requests', type: 'page', url: '/portal/admin/arc/leaderboard-requests', status: 'pending' },
      { name: '/portal/admin/arc/billing', type: 'page', url: '/portal/admin/arc/billing', status: 'pending' },
      { name: '/portal/admin/arc/reports', type: 'page', url: '/portal/admin/arc/reports', status: 'pending' },
      { name: '/portal/admin/arc/activity', type: 'page', url: '/portal/admin/arc/activity', status: 'pending' },
      { name: '/portal/admin/arc/smoke-test (this page)', type: 'page', url: '/portal/admin/arc/smoke-test', status: 'pending' },
      
      // =============================================================================
      // APIS (run check = fetch and validate ok:true)
      // =============================================================================
      { name: 'GET /api/portal/arc/projects', type: 'api', url: '/api/portal/arc/projects', status: 'pending' },
      { name: `GET /api/portal/arc/project-by-slug?slug=${projectSlug}`, type: 'api', url: `/api/portal/arc/project-by-slug?slug=${projectSlug}`, status: 'pending' },
      { name: `GET /api/portal/arc/permissions?projectId=${testProject.project_id}`, type: 'api', url: `/api/portal/arc/permissions?projectId=${testProject.project_id}`, status: 'pending' },
      { name: `GET /api/portal/arc/projects/${testProject.project_id}/current-ms-arena`, type: 'api', url: `/api/portal/arc/projects/${testProject.project_id}/current-ms-arena`, status: 'pending' },
      { name: 'GET /api/portal/admin/arc/activity?limit=5', type: 'api', url: '/api/portal/admin/arc/activity?limit=5', status: 'pending' },
      { name: 'GET /api/portal/admin/arc/billing?limit=5', type: 'api', url: '/api/portal/admin/arc/billing?limit=5', status: 'pending' },
      { name: 'GET /api/portal/admin/arc/reports/platform', type: 'api', url: '/api/portal/admin/arc/reports/platform', status: 'pending' },
      { name: `GET /api/portal/arc/leaderboard-requests?projectId=${testProject.project_id}`, type: 'api', url: `/api/portal/arc/leaderboard-requests?projectId=${testProject.project_id}`, status: 'pending' },
      { name: `GET /api/portal/arc/campaigns?projectId=${testProject.project_id}`, type: 'api', url: `/api/portal/arc/campaigns?projectId=${testProject.project_id}`, status: 'pending' },
      ...(campaignId
        ? [
            { name: `GET /api/portal/arc/campaigns/${campaignId}/participants`, type: 'api' as const, url: `/api/portal/arc/campaigns/${campaignId}/participants`, status: 'pending' as const },
            { name: `GET /api/portal/arc/campaigns/${campaignId}/leaderboard`, type: 'api' as const, url: `/api/portal/arc/campaigns/${campaignId}/leaderboard`, status: 'pending' as const },
          ]
        : []),
    ];

    setTestResults(tests);
  }, [testProject, testArena, testCampaign]);

  // Run a single test
  const runTest = useCallback(
    async (test: TestResult) => {
      if (test.type === 'page') {
        // Pages: just mark as pass (user can click link to verify)
        setTestResults((prev) =>
          prev.map((t) => (t.url === test.url ? { ...t, status: 'pass' as const } : t))
        );
        return;
      }

      if (test.type === 'api') {
        // APIs: fetch and validate
        setTestResults((prev) =>
          prev.map((t) => (t.url === test.url ? { ...t, status: 'pending' as const } : t))
        );

        try {
          const res = await fetch(test.url, {
            credentials: 'include',
            cache: 'no-store',
          });
          const data = await res.json();

          if (data.ok === true) {
            setTestResults((prev) =>
              prev.map((t) =>
                t.url === test.url
                  ? { ...t, status: 'pass' as const, result: data }
                  : t
              )
            );
          } else {
            setTestResults((prev) =>
              prev.map((t) =>
                t.url === test.url
                  ? { ...t, status: 'fail' as const, error: data.error || 'API returned ok: false' }
                  : t
              )
            );
          }
        } catch (err: any) {
          setTestResults((prev) =>
            prev.map((t) =>
              t.url === test.url
                ? { ...t, status: 'fail' as const, error: err.message || 'Request failed' }
                : t
            )
          );
        }
      }
    },
    []
  );

  // Action: Create Campaign
  const handleCreateCampaign = useCallback(async () => {
    if (!testProject) return;

    const campaignName = `Smoke Test Campaign ${new Date().toISOString()}`;
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

    try {
      const res = await fetch('/api/portal/arc/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: testProject.project_id,
          name: campaignName,
          participation_mode: 'public',
          leaderboard_visibility: 'public',
          start_at: startAt,
          end_at: endAt,
        }),
      });

      const data = await res.json();
      if (data.ok && data.campaign) {
        setTestCampaign(data.campaign);
        alert(`Campaign created: ${data.campaign.id}`);
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testProject]);

  // Action: Add Participant
  const handleAddParticipant = useCallback(async () => {
    if (!testCampaign) {
      alert('No campaign available. Create a campaign first.');
      return;
    }

    try {
      const res = await fetch(`/api/portal/arc/campaigns/${testCampaign.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          twitter_username: 'smoketest_user',
          status: 'tracked',
        }),
      });

      const data = await res.json();
      if (data.ok && data.participant) {
        alert(`Participant added: ${data.participant.id}`);
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testCampaign]);

  // Action: Approve Request
  const handleApproveRequest = useCallback(async () => {
    if (!testProject) {
      alert('No project available.');
      return;
    }

    try {
      // Clear previous verification
      setApprovalVerification(null);

      // Fetch latest pending request for this project
      const requestsRes = await fetch(
        `/api/portal/arc/leaderboard-requests?projectId=${testProject.project_id}`,
        { credentials: 'include' }
      );
      const requestsData = await requestsRes.json();

      if (!requestsData.ok || !requestsData.requests || requestsData.requests.length === 0) {
        alert('No leaderboard requests found for this project.');
        return;
      }

      // Find the latest pending request
      const pendingRequest = requestsData.requests.find(
        (r: { status: string }) => r.status === 'pending'
      );

      if (!pendingRequest) {
        alert('No pending requests found. All requests are already approved or rejected.');
        return;
      }

      // Approve using PUT method (approve endpoint accepts both POST and PUT)
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests/${pendingRequest.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (data.ok) {
        // After success, re-run verification APIs
        const [campaignsRes, projectsRes] = await Promise.all([
          fetch(`/api/portal/arc/campaigns?projectId=${testProject.project_id}`, {
            credentials: 'include',
          }),
          fetch('/api/portal/arc/projects', {
            credentials: 'include',
          }),
        ]);

        const campaignsData = await campaignsRes.json();
        const projectsData = await projectsRes.json();

        // Fetch verification data
        const verifyRes = await fetch('/api/portal/admin/arc/verify-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ projectId: testProject.project_id }),
        });

        let verification: ApprovalVerification | null = null;
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.ok && verifyData.verification) {
            verification = verifyData.verification;
            verification.rpcResult = verifyData.rpcResult;
          }
        }

        // Set verification state
        setApprovalVerification(verification);

        // Reload test data to refresh state
        await loadTestData();
      } else {
        // Show RPC error details if available
        const errorMsg = data.error || 'Unknown error';
        const rpcError = data.rpcError ? `\n\nRPC Error:\nCode: ${data.rpcError.code}\nMessage: ${data.rpcError.message}\nDetails: ${data.rpcError.details}\nHint: ${data.rpcError.hint}` : '';
        alert(`Failed: ${errorMsg}${rpcError}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testProject, loadTestData]);

  // Action: Activate Arena
  const handleActivateArena = useCallback(async () => {
    if (!testArena || !testProject) {
      alert('No arena available. Arena activation requires an existing arena.');
      return;
    }

    try {
      // Get arena ID from current-ms-arena endpoint
      const arenaRes = await fetch(
        `/api/portal/arc/projects/${testProject.project_id}/current-ms-arena`,
        { credentials: 'include' }
      );
      const arenaData = await arenaRes.json();

      if (!arenaData.ok || !arenaData.arena || !arenaData.arena.id) {
        alert('No arena found to activate.');
        return;
      }

      const arenaId = arenaData.arena.id;

      // Activate using POST method
      const res = await fetch(`/api/portal/admin/arc/arenas/${arenaId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.ok) {
        alert(`Arena activated successfully! Arena ID: ${data.activatedArenaId}`);
        // Reload test data to refresh state
        await loadTestData();
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testArena, testProject, loadTestData]);

  // Action: Update Features
  const handleUpdateFeatures = useCallback(async () => {
    if (!testProject) {
      alert('No project available.');
      return;
    }

    try {
      // Update features using POST method with no-op payload
      const res = await fetch(
        `/api/portal/admin/arc/projects/${testProject.project_id}/update-features`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            crm_enabled: false,
            crm_visibility: 'private',
          }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        alert(`Features updated successfully! CRM enabled: ${data.features.crm_enabled}, visibility: ${data.features.crm_visibility}`);
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testProject]);

  // Action: Generate UTM Link
  const handleGenerateUTM = useCallback(async () => {
    if (!testCampaign) {
      alert('No campaign available. Create a campaign first.');
      return;
    }

    // First, get participants
    const participantsRes = await fetch(
      `/api/portal/arc/campaigns/${testCampaign.id}/participants`,
      { credentials: 'include' }
    );
    const participantsData = await participantsRes.json();

    if (!participantsData.ok || !participantsData.participants || participantsData.participants.length === 0) {
      alert('No participants found. Add a participant first.');
      return;
    }

    const participantId = participantsData.participants[0].id;

    try {
      const res = await fetch(
        `/api/portal/arc/campaigns/${testCampaign.id}/participants/${participantId}/link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            target_url: 'https://example.com',
          }),
        }
      );

      const data = await res.json();
      if (data.ok && data.link) {
        const shortCode = data.link.code || data.link.short_code;
        if (shortCode) {
          alert(`UTM link created! Code: ${shortCode}\nURL: ${data.redirect_url || `/r/${shortCode}`}`);
        } else {
          alert(`UTM link created: ${data.link.id}`);
        }
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }, [testCampaign]);

  // Copy report
  const handleCopyReport = useCallback(() => {
    const report = {
      timestamp: new Date().toISOString(),
      testProject,
      testArena,
      testCampaign,
      results: testResults,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    alert('Report copied to clipboard!');
  }, [testProject, testArena, testCampaign, testResults]);

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <ArcPageShell canManageArc={true} isSuperAdmin={userIsSuperAdmin}>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">Log in to view this page.</p>
        </div>
      </ArcPageShell>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <ArcPageShell canManageArc={true} isSuperAdmin={userIsSuperAdmin}>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">You need super admin access to view this page.</p>
          <Link
            href="/portal/arc"
            className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            ← Back to ARC Home
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell canManageArc={true} isSuperAdmin={userIsSuperAdmin}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <Link href="/portal/admin/arc" className="hover:text-white transition-colors">
            Super Admin
          </Link>
          <span>/</span>
          <span className="text-white">Smoke Test</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ARC Smoke Test</h1>
            <p className="text-white/60">Manual test dashboard for verifying ARC pages and APIs</p>
          </div>
          <button
            onClick={handleCopyReport}
            className="px-4 py-2 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
          >
            Copy Report
          </button>
        </div>

        {/* Test Data Summary */}
        {loading && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-center">
            <p className="text-white/60">Loading test data...</p>
          </div>
        )}

        {error && !loading && (
          <ErrorState message={error} onRetry={loadTestData} />
        )}

        {!loading && !error && testProject && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Test Data</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-white/60">Project: </span>
                <span className="text-white">{testProject.name || testProject.project_id}</span>
                <span className="text-white/40 ml-2">({testProject.slug})</span>
              </div>
              {testArena?.slug && (
                <div>
                  <span className="text-white/60">Arena: </span>
                  <span className="text-white">{testArena.slug}</span>
                </div>
              )}
              {testCampaign ? (
                <div>
                  <span className="text-white/60">Campaign: </span>
                  <span className="text-white">{testCampaign.name}</span>
                  <span className="text-white/40 ml-2">({testCampaign.id})</span>
                </div>
              ) : (
                <div className="text-white/40">No campaign found</div>
              )}
            </div>
          </div>
        )}

        {/* Approval Verification Status */}
        {approvalVerification && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <h3 className="text-sm font-semibold text-green-400">✓ Approval OK</h3>
            </div>
            <div className="space-y-3 text-sm">
              {approvalVerification.request && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-white/60">Request Status: </span>
                    <span className="text-white font-mono">{approvalVerification.request.status}</span>
                  </div>
                  {approvalVerification.request.decided_at && (
                    <div>
                      <span className="text-white/60">Decided At: </span>
                      <span className="text-white font-mono text-xs">
                        {new Date(approvalVerification.request.decided_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {approvalVerification.projectAccess && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-white/60">Access Status: </span>
                    <span className="text-white font-mono">{approvalVerification.projectAccess.application_status}</span>
                  </div>
                  {approvalVerification.projectAccess.approved_at && (
                    <div>
                      <span className="text-white/60">Approved At: </span>
                      <span className="text-white font-mono text-xs">
                        {new Date(approvalVerification.projectAccess.approved_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {approvalVerification.projectFeatures && (
                <div>
                  <div className="text-white/60 mb-2">Project Features:</div>
                  <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                    <div>
                      <span className="text-white/60">Leaderboard: </span>
                      <span className="text-white">{approvalVerification.projectFeatures.leaderboard_enabled ? '✓' : '✗'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">GameFi: </span>
                      <span className="text-white">{approvalVerification.projectFeatures.gamefi_enabled ? '✓' : '✗'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">CRM: </span>
                      <span className="text-white">{approvalVerification.projectFeatures.crm_enabled ? '✓' : '✗'}</span>
                    </div>
                    {approvalVerification.projectFeatures.updated_at && (
                      <div>
                        <span className="text-white/60">Updated At: </span>
                        <span className="text-white text-xs">
                          {new Date(approvalVerification.projectFeatures.updated_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {approvalVerification.arena && (
                <div>
                  <div className="text-white/60 mb-2">Arena Created:</div>
                  <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                    <div>
                      <span className="text-white/60">ID: </span>
                      <span className="text-white">{approvalVerification.arena.id}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Kind: </span>
                      <span className="text-white">{approvalVerification.arena.kind}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Status: </span>
                      <span className="text-white">{approvalVerification.arena.status}</span>
                    </div>
                    {approvalVerification.arena.name && (
                      <div>
                        <span className="text-white/60">Name: </span>
                        <span className="text-white">{approvalVerification.arena.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {approvalVerification.rpcResult && (
                <details className="mt-2">
                  <summary className="text-white/60 text-xs cursor-pointer hover:text-white/80">
                    View RPC Result
                  </summary>
                  <pre className="mt-2 p-2 bg-black/40 rounded text-xs text-white/80 font-mono overflow-x-auto">
                    {JSON.stringify(approvalVerification.rpcResult, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {!loading && !error && testProject && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleApproveRequest}
                className="px-3 py-1.5 text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/50 rounded-lg hover:bg-orange-500/30 transition-colors"
              >
                Approve Request
              </button>
              {testArena && (
                <button
                  onClick={handleActivateArena}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 transition-colors"
                >
                  Activate Arena
                </button>
              )}
              <button
                onClick={handleUpdateFeatures}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 rounded-lg hover:bg-indigo-500/30 transition-colors"
              >
                Update Features
              </button>
              <button
                onClick={handleCreateCampaign}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 transition-colors"
              >
                Create Campaign
              </button>
              {testCampaign && (
                <>
                  <button
                    onClick={handleAddParticipant}
                    className="px-3 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 transition-colors"
                  >
                    Add Participant
                  </button>
                  <button
                    onClick={handleGenerateUTM}
                    className="px-3 py-1.5 text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded-lg hover:bg-purple-500/30 transition-colors"
                  >
                    Generate UTM Link
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Test Checklist */}
        {!loading && !error && testResults.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">Test Checklist</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Test
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Actions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {testResults.map((test, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white/80 font-mono text-xs">
                        {test.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-white/20">
                          {test.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {test.type === 'page' ? (
                            <Link
                              href={test.url}
                              target="_blank"
                              className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded hover:bg-blue-500/30 transition-colors"
                            >
                              Open
                            </Link>
                          ) : (
                            <button
                              onClick={() => runTest(test)}
                              className="px-2 py-1 text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded hover:bg-teal-500/30 transition-colors"
                            >
                              Run Check
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {test.status === 'pending' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-yellow-500/50 bg-yellow-500/20 text-yellow-400">
                            Pending
                          </span>
                        )}
                        {test.status === 'pass' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-green-500/50 bg-green-500/20 text-green-400">
                            ✓ Pass
                          </span>
                        )}
                        {test.status === 'fail' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-red-500/50 bg-red-500/20 text-red-400">
                            ✗ Fail
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-400 max-w-md">
                        {test.error && (
                          <div className="truncate" title={test.error}>
                            {test.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && testResults.length === 0 && (
          <EmptyState
            icon="🧪"
            title="No tests available"
            description="Unable to initialize test checklist. Check that test data loaded correctly."
          />
        )}
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Require Super Admin access
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }

  // User is authenticated and is Super Admin
  return {
    props: {},
  };
};
