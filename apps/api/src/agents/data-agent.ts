import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { AgentContext, AgentRoleType } from '@bi/types';
import { logger } from '../logger.js';
import { profileFile } from '../services/analytics-client.js';
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
    logger.info({ datasetId, storagePath }, 'Data agent: file saved to disk');

    // 2. Register dataset
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
    logger.info({ datasetId }, 'Data agent: dataset record created');

    // 3. All tabular file types (CSV, Excel, PDF) go through the same
    // profiling pipeline. The Python analytics service detects the format
    // by filename extension and uses the appropriate parser.
    return this.handleTabularIngest(datasetId, request, startTime);
  }

  private async handleTabularIngest(
    datasetId: string,
    request: IngestAndProfileRequest,
    startTime: number,
  ): Promise<IngestAndProfileResult> {
    const label = request.fileType === 'excel' ? 'Excel' : 'CSV';

    logger.info({ datasetId, fileType: request.fileType }, `Data agent: sending ${label} to profiling service`);

    let profileResult;
    try {
      profileResult = await profileFile(datasetId, request.buffer, request.filename);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ datasetId, err: errorMsg }, `Data agent: ${label} profiling failed`);

      // File IS saved and dataset IS registered — don't crash with 500.
      // Return a partial result so the frontend shows the dataset with a
      // clear error instead of a generic "Internal server error".
      const updatedDataset = updateDataset(datasetId, { status: 'error' })!;

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
              severity: 'error',
              message: `${label} profiling failed: ${errorMsg}`,
            },
          ],
        },
        confidence: {
          level: 'low',
          score: 0,
          reasoning: `${label} file was saved but profiling failed. The analytics service could not parse this file.`,
        },
      };
    }

    logger.info(
      { datasetId, rows: profileResult.row_count, cols: profileResult.column_count },
      `Data agent: ${label} profile response received`,
    );

    const updatedDataset = updateDataset(datasetId, {
      status: 'ready',
      capability: 'analysis_ready',
      rowCount: profileResult.row_count,
      columnCount: profileResult.column_count,
      profile: profileResult as unknown as Record<string, unknown>,
    })!;

    const elapsedMs = Date.now() - startTime;
    logger.info(
      { datasetId, elapsedMs, rows: profileResult.row_count, capability: 'analysis_ready' },
      `Data agent: ${label} profiling complete`,
    );

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
