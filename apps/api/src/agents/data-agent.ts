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
    logger.info({ sessionId: context.sessionId, datasetId, filename: request.filename }, 'Data agent: ingest started');

    // 1. Save file to disk
    await ensureUploadDir();
    const storageName = `${datasetId}-${request.filename}`;
    const storagePath = getUploadPath(storageName);
    await writeFile(storagePath, request.buffer);

    // 2. Register dataset
    createDataset({
      id: datasetId,
      name: request.filename,
      sourceType: 'csv',
      status: 'profiling',
      sizeBytes: request.buffer.length,
      storagePath,
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Call analytics service to profile
    let profileResult;
    try {
      profileResult = await profileCsv(datasetId, request.buffer, request.filename);
    } catch (err) {
      updateDataset(datasetId, { status: 'error' });
      throw err;
    }

    // 4. Update dataset with profile metadata
    const updatedDataset = updateDataset(datasetId, {
      status: 'ready',
      rowCount: profileResult.row_count,
      columnCount: profileResult.column_count,
      profile: profileResult as unknown as Record<string, unknown>,
    })!;

    const elapsedMs = Date.now() - startTime;
    logger.info({ datasetId, elapsedMs, rows: profileResult.row_count }, 'Data agent: profiling complete');

    // 5. Compute confidence based on data quality
    const qualityScore = profileResult.quality_score;
    const confidence = {
      level: (qualityScore >= 0.9 ? 'high' : qualityScore >= 0.7 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      score: qualityScore,
      reasoning:
        qualityScore >= 0.9
          ? `Data quality score ${qualityScore} — dataset is clean and ready for analysis`
          : qualityScore >= 0.7
            ? `Data quality score ${qualityScore} — some issues detected, review recommended`
            : `Data quality score ${qualityScore} — significant quality issues found, cleaning recommended`,
    };

    return {
      agent: this.role,
      dataset: updatedDataset,
      profile: {
        rowCount: profileResult.row_count,
        columnCount: profileResult.column_count,
        qualityScore: profileResult.quality_score,
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
      confidence,
    };
  }
}

export const dataAgent = new DataAgent();
