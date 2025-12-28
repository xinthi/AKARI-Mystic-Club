/**
 * ARC Report Page
 * 
 * Shows analytics report for an ended item (arena, campaign, or gamified program)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';

interface ReportData {
  kind: 'arena' | 'campaign' | 'gamified';
  id: string;
  title: string;
  projectName: string;
  projectSlug: string | null;
  stats: {
    participants: number;
    posts: number;
    views: number;
    likes: number;
    reposts: number;
    replies: number;
    quotes: number;
    engagementRate: number;
  };
}

export default function ArcReportPage() {
  const router = useRouter();
  const { kind, id } = router.query;
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      if (!kind || !id || typeof kind !== 'string' || typeof id !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/portal/admin/arc/item-report?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
          credentials: 'include',
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load report');
        }

        setReport(data);
      } catch (err: any) {
        console.error('[ARC Report] Error:', err);
        setError(err.message || 'Failed to load report');
      } finally {
        setLoading(false);
      }
    }

    if (router.isReady) {
      loadReport();
    }
  }, [router.isReady, kind, id]);

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent mx-auto mb-4" />
          <p className="text-white/60">Loading report...</p>
        </div>
      </ArcPageShell>
    );
  }

  if (error || !report) {
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400 mb-4">{error || 'Report not found'}</p>
          <Link
            href="/portal/arc"
            className="inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            Back to ARC Home
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  const formatMetric = (value: number): string => {
    if (value === 0) return 'N/A';
    return value.toLocaleString();
  };

  const formatPercentage = (value: number): string => {
    if (value === 0) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  return (
    <ArcPageShell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-teal-400 transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white">Report</span>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{report.title}</h1>
          <p className="text-white/60 text-sm">{report.projectName}</p>
          <div className="mt-2">
            <span className="inline-block px-2 py-1 text-xs font-medium bg-white/10 border border-white/20 text-white/70 rounded uppercase">
              {report.kind}
            </span>
          </div>
        </div>

        {/* Summary Stats Grid */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Participants</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.participants)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Posts</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.posts)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Views</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.views)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Engagement Rate</p>
              <p className="text-lg font-semibold text-white">{formatPercentage(report.stats.engagementRate)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Likes</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.likes)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Reposts</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.reposts)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Replies</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.replies)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60 mb-1">Quotes</p>
              <p className="text-lg font-semibold text-white">{formatMetric(report.stats.quotes)}</p>
            </div>
          </div>
        </div>
      </div>
    </ArcPageShell>
  );
}

