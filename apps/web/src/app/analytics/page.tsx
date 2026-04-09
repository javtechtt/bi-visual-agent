'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Loader2,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Database,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { InsightsView, type AnalyticsData, type FollowUpRequest } from '@/components/datasets/insights-view';
import { api } from '@/lib/api-client';

interface DatasetEntry {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  capability: string;
  rowCount?: number;
  columnCount?: number;
  sizeBytes: number;
  lastAnalysis?: AnalyticsData;
  lastAnalyzedAt?: string;
  createdAt: string;
}

type AnalyzeState = 'idle' | 'running' | 'done' | 'error';

export default function AnalyticsPage() {
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>('idle');
  const [liveResult, setLiveResult] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: DatasetEntry[] }>('/api/v1/datasets')
      .then((data) => {
        setDatasets(data.items);
        // Auto-select the first analysis_ready dataset that has results, or just the first analysis_ready
        const withAnalysis = data.items.find((d) => d.lastAnalysis);
        const analysisReady = data.items.find((d) => d.capability === 'analysis_ready');
        const best = withAnalysis ?? analysisReady;
        if (best) setSelectedId(best.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load datasets'))
      .finally(() => setLoading(false));
  }, []);

  const selected = datasets.find((d) => d.id === selectedId) ?? null;

  // When selection changes, load persisted analysis if we don't have a live one
  useEffect(() => {
    setLiveResult(null);
    setAnalyzeState('idle');
    setError(null);
  }, [selectedId]);

  const handleAnalyze = useCallback(
    async (action: 'kpi' | 'anomaly' | 'trend' | 'all' | 'follow_up', followUp?: FollowUpRequest) => {
      if (!selected) return;
      setAnalyzeState('running');
      setError(null);
      try {
        const data = await api.post<AnalyticsData>(
          `/api/v1/datasets/${selected.id}/analyze`,
          {
            action,
            ...(followUp ? { query: followUp.query, context: followUp.context } : {}),
          },
        );
        setLiveResult(data);
        setAnalyzeState('done');
        // Update the local entry so the persisted flag is reflected
        setDatasets((prev) =>
          prev.map((d) =>
            d.id === selected.id
              ? { ...d, lastAnalysis: data, lastAnalyzedAt: new Date().toISOString() }
              : d,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed');
        setAnalyzeState('error');
      }
    },
    [selected],
  );

  // The result to display: live result takes priority, then persisted
  const displayResult = liveResult ?? (selected?.lastAnalysis as AnalyticsData | undefined) ?? null;

  const analysisReadyDatasets = datasets.filter((d) => d.capability === 'analysis_ready');
  const ingestOnlyDatasets = datasets.filter((d) => d.capability === 'ingest_only');

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 py-12">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading datasets...</span>
        </div>
      </AppShell>
    );
  }

  if (datasets.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Run KPI analysis, anomaly detection, and trend analysis on your datasets.
            </p>
          </div>
          <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No datasets uploaded yet.</p>
            <Link href="/datasets" className="text-sm font-medium text-indigo-600 hover:underline">
              Upload a dataset
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Run KPI analysis, anomaly detection, and trend analysis on your datasets.
          </p>
        </div>

        {/* Dataset selector */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select Dataset
          </h3>
          <div className="flex flex-wrap gap-2">
            {analysisReadyDatasets.map((ds) => {
              const isSelected = ds.id === selectedId;
              const hasResults = !!ds.lastAnalysis;
              return (
                <button
                  key={ds.id}
                  onClick={() => setSelectedId(ds.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-border bg-white hover:border-indigo-200'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{ds.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ds.rowCount?.toLocaleString() ?? '?'} rows
                      {hasResults && (
                        <span className="ml-1 text-emerald-600">
                          — analyzed {formatTime(ds.lastAnalyzedAt!)}
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Ingest-only datasets shown as disabled */}
          {ingestOnlyDatasets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {ingestOnlyDatasets.map((ds) => (
                <div
                  key={ds.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 opacity-60"
                >
                  {ds.sourceType === 'pdf' ? (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{ds.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {`${ds.sourceType.toUpperCase()} — no tabular data found`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis controls */}
        {selected && selected.capability === 'analysis_ready' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-semibold">
                {displayResult ? 'Re-run Analytics' : 'Run Analytics'}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                { action: 'all', label: 'Full Analysis', desc: 'KPIs + Anomalies + Trends' },
                { action: 'kpi', label: 'KPIs Only', desc: 'Summary statistics' },
                { action: 'anomaly', label: 'Anomaly Detection', desc: 'Outlier detection' },
                { action: 'trend', label: 'Trend Analysis', desc: 'Time-series trends' },
              ] as const).map(({ action, label, desc }) => (
                <button
                  key={action}
                  onClick={() => handleAnalyze(action)}
                  disabled={analyzeState === 'running'}
                  className="flex flex-col items-start rounded-lg border border-border bg-white px-4 py-2.5 text-left transition-all hover:border-violet-300 hover:bg-violet-50/50 disabled:opacity-50"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
            {analyzeState === 'running' && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                <span className="text-sm text-muted-foreground">Analytics Agent is processing...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        {displayResult && <InsightsView data={displayResult} onFollowUp={(req) => handleAnalyze('follow_up', req)} />}

        {/* No results yet for selected dataset */}
        {selected && selected.capability === 'analysis_ready' && !displayResult && analyzeState === 'idle' && (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Select an analysis type above to analyze "{selected.name}"
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}
