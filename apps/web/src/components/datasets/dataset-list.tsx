'use client';

import { Database, FileSpreadsheet, FileText, Clock } from 'lucide-react';

export interface DatasetSummary {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  capability: string;
  rowCount?: number;
  columnCount?: number;
  sizeBytes: number;
  createdAt: string;
}

const typeIcons: Record<string, typeof Database> = {
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  pdf: FileText,
};

const capabilityLabels: Record<string, { text: string; color: string }> = {
  analysis_ready: { text: 'Analysis Ready', color: 'bg-emerald-500/15 text-emerald-400' },
  profile_ready: { text: 'Profiled', color: 'bg-blue-500/15 text-blue-400' },
  ingest_only: { text: 'Ingested', color: 'bg-amber-500/15 text-amber-400' },
};

export function DatasetList({
  datasets,
  selectedId,
  onSelect,
}: {
  datasets: DatasetSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (datasets.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Uploaded Datasets ({datasets.length})</h3>
      <div className="space-y-1.5">
        {datasets.map((ds) => {
          const Icon = typeIcons[ds.sourceType] ?? Database;
          const cap = capabilityLabels[ds.capability] ?? { text: 'Ingested', color: 'bg-amber-50 text-amber-700' };
          const isSelected = ds.id === selectedId;

          return (
            <button
              key={ds.id}
              onClick={() => onSelect(ds.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                isSelected
                  ? 'border-accent-cyan/30 bg-accent-cyan/5'
                  : 'border-border bg-surface hover:border-accent-cyan/20 hover:bg-surface-raised'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{ds.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cap.color}`}>
                    {cap.text}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{ds.sourceType.toUpperCase()}</span>
                  <span>{formatBytes(ds.sizeBytes)}</span>
                  {ds.rowCount ? <span>{ds.rowCount.toLocaleString()} rows</span> : null}
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatTime(ds.createdAt)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
