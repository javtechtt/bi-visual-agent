'use client';

import { CheckCircle2, AlertTriangle, Info, Shield, Database, Columns3 } from 'lucide-react';

export interface ProfileData {
  agent: string;
  dataset: {
    id: string;
    name: string;
    status: string;
    capability: 'ingest_only' | 'profile_ready' | 'analysis_ready';
    sourceType: string;
    rowCount?: number;
    columnCount?: number;
    sizeBytes: number;
  };
  profile: {
    rowCount: number;
    columnCount: number;
    qualityScore: number;
    columns: {
      name: string;
      dtype: string;
      nullCount: number;
      uniqueCount: number;
      sampleValues: unknown[];
      semanticType: string | null;
    }[];
    issues: { severity: string; column?: string; message: string }[];
  };
  confidence: {
    level: 'high' | 'medium' | 'low';
    score: number;
    reasoning: string;
  };
}

export function ProfileView({ data }: { data: ProfileData }) {
  const { dataset, profile, confidence } = data;

  const qualityPct = Math.round(profile.qualityScore * 100);
  const qualityColor =
    qualityPct >= 90 ? 'text-emerald-400' : qualityPct >= 70 ? 'text-amber-400' : 'text-red-400';
  const qualityBg =
    qualityPct >= 90 ? 'bg-emerald-500/10' : qualityPct >= 70 ? 'bg-amber-500/10' : 'bg-red-500/10';
  const confidenceColor =
    confidence.level === 'high'
      ? 'text-emerald-400 bg-emerald-500/10'
      : confidence.level === 'medium'
        ? 'text-amber-400 bg-amber-500/10'
        : 'text-red-400 bg-red-500/10';

  return (
    <div className="space-y-4">
      {/* Header cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard icon={Database} label="Rows" value={profile.rowCount.toLocaleString()} />
        <StatCard icon={Columns3} label="Columns" value={String(profile.columnCount)} />
        <div className={`rounded-xl border p-4 ${qualityBg}`}>
          <div className="flex items-center gap-2">
            <Shield className={`h-4 w-4 ${qualityColor}`} />
            <span className="text-xs font-medium text-muted-foreground">Quality</span>
          </div>
          <p className={`mt-1 text-xl font-semibold ${qualityColor}`}>{qualityPct}%</p>
        </div>
        <div className={`rounded-xl border p-4 ${confidenceColor.split(' ')[1]}`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-4 w-4 ${confidenceColor.split(' ')[0]}`} />
            <span className="text-xs font-medium text-muted-foreground">Confidence</span>
          </div>
          <p className={`mt-1 text-xl font-semibold capitalize ${confidenceColor.split(' ')[0]}`}>
            {confidence.level}
          </p>
        </div>
      </div>

      {/* Agent reasoning */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data Agent Assessment
        </p>
        <p className="mt-1 text-sm">{confidence.reasoning}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Dataset: {dataset.name} &middot; {formatBytes(dataset.sizeBytes)} &middot; Status:{' '}
          <span className="font-medium text-emerald-400">{dataset.status}</span>
        </p>
      </div>

      {/* Issues */}
      {profile.issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Issues ({profile.issues.length})</p>
          {profile.issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3"
            >
              {issue.severity === 'warning' ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              )}
              <div>
                {issue.column && (
                  <span className="mr-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {issue.column}
                  </span>
                )}
                <span className="text-sm">{issue.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Column table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Column</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Semantic</th>
              <th className="px-4 py-2.5 text-right">Nulls</th>
              <th className="px-4 py-2.5 text-right">Unique</th>
              <th className="px-4 py-2.5">Sample</th>
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((col) => (
              <tr key={col.name} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2 font-mono text-xs font-medium">{col.name}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {col.dtype}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {col.semanticType ?? '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {col.nullCount > 0 ? (
                    <span className="text-amber-600">{col.nullCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{col.uniqueCount}</td>
                <td className="max-w-48 truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                  {col.sampleValues.slice(0, 3).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
