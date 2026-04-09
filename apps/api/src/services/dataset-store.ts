/**
 * In-memory dataset store. Swap to Drizzle queries when Postgres is wired.
 * Structured to mirror the DB schema so migration is trivial.
 */

type DatasetCapability = 'ingest_only' | 'profile_ready' | 'analysis_ready';

interface DatasetRecord {
  id: string;
  name: string;
  description?: string;
  sourceType: string;
  status: 'uploading' | 'processing' | 'profiling' | 'ready' | 'error';
  capability: DatasetCapability;
  rowCount?: number;
  columnCount?: number;
  sizeBytes: number;
  storagePath: string;
  profile?: Record<string, unknown>;
  lastAnalysis?: Record<string, unknown>;
  lastAnalyzedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type { DatasetCapability };

const datasets = new Map<string, DatasetRecord>();

export function createDataset(record: DatasetRecord): DatasetRecord {
  datasets.set(record.id, record);
  return record;
}

export function getDataset(id: string): DatasetRecord | undefined {
  return datasets.get(id);
}

export function updateDataset(id: string, patch: Partial<DatasetRecord>): DatasetRecord | undefined {
  const existing = datasets.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  datasets.set(id, updated);
  return updated;
}

export function listDatasets(): DatasetRecord[] {
  return Array.from(datasets.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export type { DatasetRecord };
