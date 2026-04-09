'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api-client';
import { ProfileView, type ProfileData } from './profile-view';
import { InsightsView, type AnalyticsData } from './insights-view';
import type { DatasetSummary } from './dataset-list';

type AnalyzeState = 'idle' | 'running' | 'done' | 'error';

export function DatasetDetail({ dataset }: { dataset: DatasetSummary }) {
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>('idle');
  const [analyticsResult, setAnalyticsResult] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullDataset, setFullDataset] = useState<ProfileData | null>(null);

  // Fetch full dataset detail (includes profile) when selected
  useEffect(() => {
    setAnalyticsResult(null);
    setAnalyzeState('idle');
    setError(null);

    api
      .get<Record<string, unknown>>(`/api/v1/datasets/${dataset.id}`)
      .then((data) => {
        // The stored profile is the raw Python response (snake_case keys).
        // Cast as Record to safely access either naming convention.
        const raw = data.profile as Record<string, unknown> | undefined;
        const cols = raw?.columns as Record<string, unknown>[] | undefined;
        if (raw && cols && cols.length > 0) {
          const qualityScore = Number(raw.quality_score ?? raw.qualityScore ?? 0);
          setFullDataset({
            agent: 'data',
            dataset: {
              id: dataset.id,
              name: dataset.name,
              status: dataset.status,
              capability: dataset.capability as ProfileData['dataset']['capability'],
              sourceType: dataset.sourceType,
              rowCount: dataset.rowCount,
              columnCount: dataset.columnCount,
              sizeBytes: dataset.sizeBytes,
            },
            profile: {
              rowCount: Number(raw.row_count ?? raw.rowCount ?? 0),
              columnCount: Number(raw.column_count ?? raw.columnCount ?? 0),
              qualityScore,
              columns: cols.map((c) => ({
                name: String(c.name ?? ''),
                dtype: String(c.dtype ?? ''),
                nullCount: Number(c.null_count ?? c.nullCount ?? 0),
                uniqueCount: Number(c.unique_count ?? c.uniqueCount ?? 0),
                sampleValues: (c.sample_values ?? c.sampleValues ?? []) as unknown[],
                semanticType: (c.semantic_type ?? c.semanticType ?? null) as string | null,
              })),
              issues: ((raw.issues ?? []) as Record<string, unknown>[]).map((i) => ({
                severity: String(i.severity ?? 'info'),
                column: i.column as string | undefined,
                message: String(i.message ?? ''),
              })),
            },
            confidence: {
              level: dataset.capability === 'analysis_ready' ? 'high' : 'low',
              score: dataset.capability === 'analysis_ready' ? qualityScore : 0.1,
              reasoning:
                dataset.capability === 'analysis_ready'
                  ? 'Dataset profiled and ready for analysis'
                  : 'File ingested but not yet profiled',
            },
          });
        } else {
          setFullDataset(null);
        }
      })
      .catch(() => setFullDataset(null));
  }, [dataset]);

  const handleAnalyze = useCallback(
    async (action: 'kpi' | 'anomaly' | 'trend' | 'all') => {
      setAnalyzeState('running');
      setError(null);
      setAnalyticsResult(null);
      try {
        const data = await api.post<AnalyticsData>(
          `/api/v1/datasets/${dataset.id}/analyze`,
          { action },
        );
        setAnalyticsResult(data);
        setAnalyzeState('done');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed');
        setAnalyzeState('error');
      }
    },
    [dataset.id],
  );

  return (
    <div className="space-y-5">
      {/* Profile view for profiled datasets */}
      {fullDataset && <ProfileView data={fullDataset} />}

      {/* Ingest-only message */}
      {!fullDataset && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-medium text-amber-800">Analytics not available</p>
          <p className="mt-1 text-sm text-amber-700">
            {dataset.sourceType === 'pdf'
              ? `PDF document "${dataset.name}" has been accepted and stored. Analytics will be available after the document extraction pipeline is implemented.`
              : `${dataset.sourceType.toUpperCase()} file "${dataset.name}" has been accepted and stored. Convert to CSV for immediate profiling and analysis.`}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Analyze buttons — only for analysis_ready */}
      {dataset.capability === 'analysis_ready' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold">Run Analytics</h3>
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

      {analyticsResult && <InsightsView data={analyticsResult} />}
    </div>
  );
}
