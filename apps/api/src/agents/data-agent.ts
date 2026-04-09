import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { AgentContext, AgentRoleType } from '@bi/types';
import { logger } from '../logger.js';
import { profileCsv } from '../services/analytics-client.js';
import { ensureUploadDir, getUploadPath } from '../services/storage.js';
import {
  createDataset,
  updateDataset,
  type DatasetRecord,
} from '../services/dataset-store.js';

export interface IngestAndProfileRequest {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  fileType: 'csv' | 'excel' | 'pdf';
}

export interface IngestAndProfileResult {
  agent: AgentRoleType;
  dataset: DatasetRecord;
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

class DataAgent {
  readonly role: AgentRoleType = 'data';

  async execute(task: string, context: AgentContext): Promise<Record<string, unknown>> {
    logger.info({ sessionId: context.sessionId, task }, 'Data agent: NL query (LLM pending)');
    return {
      agent: this.role,
      sessionId: context.sessionId,
      task,
      status: 'completed',
      result: { message: 'Data agent NL query — LLM integration pending' },
    };
  }

  async ingestAndProfile(
    request: IngestAndProfileRequest,
    context: AgentContext,
  ): Promise<IngestAndProfileResult> {
    const datasetId = randomUUID();
    const startTime = Date.now();
    logger.info(
      { sessionId: context.sessionId, datasetId, filename: request.filename, fileType: request.fileType },
      'Data agent: ingest started',
    );

    // 1. Save file to disk
    await ensureUploadDir();
    const storageName = `${datasetId}-${request.filename}`;
    const storagePath = getUploadPath(storageName);
    await writeFile(storagePath, request.buffer);

    // 2. Register dataset (capability set per file type below)
    createDataset({
      id: datasetId,
      name: request.filename,
      sourceType: request.fileType,
      status: 'profiling',
      capability: 'ingest_only',
      sizeBytes: request.buffer.length,
      storagePath,
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Route by file type
    if (request.fileType === 'pdf') {
      return this.handlePdfIngest(datasetId, request, storagePath, startTime);
    }

    if (request.fileType === 'excel') {
      return this.handleExcelIngest(datasetId, request, storagePath, startTime);
    }

    // CSV — call analytics service for profiling
    return this.handleCsvIngest(datasetId, request, storagePath, startTime);
  }

  private async handleCsvIngest(
    datasetId: string,
    request: IngestAndProfileRequest,
    _storagePath: string,
    startTime: number,
  ): Promise<IngestAndProfileResult> {
    let profileResult;
    try {
      profileResult = await profileCsv(datasetId, request.buffer, request.filename);
    } catch (err) {
      updateDataset(datasetId, { status: 'error' });
      throw err;
    }

    const updatedDataset = updateDataset(datasetId, {
      status: 'ready',
      capability: 'analysis_ready',
      rowCount: profileResult.row_count,
      columnCount: profileResult.column_count,
      profile: profileResult as unknown as Record<string, unknown>,
    })!;

    const elapsedMs = Date.now() - startTime;
    logger.info({ datasetId, elapsedMs, rows: profileResult.row_count }, 'Data agent: CSV profiling complete');

    const qualityScore = profileResult.quality_score;
    return {
      agent: this.role,
      dataset: updatedDataset,
      profile: {
        rowCount: profileResult.row_count,
        columnCount: profileResult.column_count,
        qualityScore,
        columns: profileResult.columns.map((c) => ({
          name: c.name,
          dtype: c.dtype,
          nullCount: c.null_count,
          uniqueCount: c.unique_count,
          sampleValues: c.sample_values,
          semanticType: c.semantic_type,
        })),
        issues: profileResult.issues,
      },
      confidence: this.makeConfidence(qualityScore),
    };
  }

  private async handleExcelIngest(
    datasetId: string,
    request: IngestAndProfileRequest,
    _storagePath: string,
    startTime: number,
  ): Promise<IngestAndProfileResult> {
    const updatedDataset = updateDataset(datasetId, {
      status: 'ready',
      capability: 'ingest_only',
    })!;

    logger.info({ datasetId, elapsedMs: Date.now() - startTime }, 'Data agent: Excel ingested (profiling pending)');

    return {
      agent: this.role,
      dataset: updatedDataset,
      profile: {
        rowCount: 0,
        columnCount: 0,
        qualityScore: 0,
        columns: [],
        issues: [
          {
            severity: 'info',
            message: `Excel file "${request.filename}" accepted and stored. Tabular profiling for .xlsx will be available when the Excel parser is connected. Convert to CSV for immediate profiling.`,
          },
        ],
      },
      confidence: {
        level: 'low',
        score: 0.2,
        reasoning: 'File ingested but not yet profiled — Excel parsing pipeline pending',
      },
    };
  }

  private handlePdfIngest(
    datasetId: string,
    request: IngestAndProfileRequest,
    _storagePath: string,
    startTime: number,
  ): IngestAndProfileResult {
    const updatedDataset = updateDataset(datasetId, { status: 'ready', capability: 'ingest_only' })!;

    logger.info({ datasetId, elapsedMs: Date.now() - startTime }, 'Data agent: PDF ingested (document pipeline pending)');

    return {
      agent: this.role,
      dataset: updatedDataset,
      profile: {
        rowCount: 0,
        columnCount: 0,
        qualityScore: 0,
        columns: [],
        issues: [
          {
            severity: 'info',
            message: `PDF document "${request.filename}" accepted and stored. Document ingestion and text extraction will be available when the PDF parsing pipeline is connected.`,
          },
        ],
      },
      confidence: {
        level: 'low',
        score: 0.1,
        reasoning: 'Document ingested but not yet analyzed — PDF extraction pipeline pending',
      },
    };
  }

  private makeConfidence(qualityScore: number) {
    return {
      level: (qualityScore >= 0.9 ? 'high' : qualityScore >= 0.7 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      score: qualityScore,
      reasoning:
        qualityScore >= 0.9
          ? `Data quality score ${qualityScore} — dataset is clean and ready for analysis`
          : qualityScore >= 0.7
            ? `Data quality score ${qualityScore} — some issues detected, review recommended`
            : `Data quality score ${qualityScore} — significant quality issues found, cleaning recommended`,
    };
  }
}

export const dataAgent = new DataAgent();
