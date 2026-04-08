import { type z } from 'zod';
import {
  DatasetSchema,
  CreateDatasetSchema,
  DatasetStatus,
  DatasetSourceType,
  DatasetQuerySchema,
  QueryResultSchema,
} from '@bi/schemas';

// ─── Inferred Types ─────────────────────────────────────────

export type Dataset = z.infer<typeof DatasetSchema>;
export type CreateDataset = z.infer<typeof CreateDatasetSchema>;
export type DatasetStatusType = z.infer<typeof DatasetStatus>;
export type DatasetSource = z.infer<typeof DatasetSourceType>;
export type DatasetQuery = z.infer<typeof DatasetQuerySchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
