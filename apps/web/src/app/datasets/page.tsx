'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { UploadPanel } from '@/components/datasets/upload-panel';
import { DatasetList, type DatasetSummary } from '@/components/datasets/dataset-list';
import { DatasetDetail } from '@/components/datasets/dataset-detail';
import type { ProfileData } from '@/components/datasets/profile-view';
import { api } from '@/lib/api-client';

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch dataset list on mount
  useEffect(() => {
    setLoading(true);
    api
      .get<{ items: DatasetSummary[] }>('/api/v1/datasets')
      .then((data) => {
        setDatasets(data.items);
        setFetchError(null);
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load datasets');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUploaded = useCallback((data: ProfileData) => {
    const ds: DatasetSummary = {
      id: data.dataset.id,
      name: data.dataset.name,
      sourceType: data.dataset.sourceType,
      status: data.dataset.status,
      capability: data.dataset.capability,
      rowCount: data.dataset.rowCount,
      columnCount: data.dataset.columnCount,
      sizeBytes: data.dataset.sizeBytes,
      createdAt: new Date().toISOString(),
    };
    setDatasets((prev) => [ds, ...prev]);
    setSelectedId(ds.id);
  }, []);

  const selectedDataset = datasets.find((d) => d.id === selectedId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Upload CSV, Excel, or PDF files to profile, analyze, and generate insights.
          </p>
        </div>

        <UploadPanel onUploaded={handleUploaded} />

        {loading && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading datasets...</span>
          </div>
        )}

        {fetchError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Failed to load datasets</p>
            <p className="text-xs text-red-600">{fetchError}</p>
          </div>
        )}

        {!loading && (
          <DatasetList datasets={datasets} selectedId={selectedId} onSelect={setSelectedId} />
        )}

        {selectedDataset && <DatasetDetail dataset={selectedDataset} />}
      </div>
    </AppShell>
  );
}
