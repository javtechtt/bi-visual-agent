import { z } from 'zod';

// ─── Identifiers ────────────────────────────────────────────

export const IdSchema = z.string().uuid();

export const TimestampSchema = z.string().datetime();

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
  });

// ─── Confidence & Trust ─────────────────────────────────────

export const ConfidenceLevel = z.enum(['high', 'medium', 'low']);

export const ConfidenceScore = z.object({
  level: ConfidenceLevel,
  score: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

// ─── Error Envelope ─────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string().uuid(),
  timestamp: TimestampSchema,
});

// ─── API Envelope ───────────────────────────────────────────

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    requestId: z.string().uuid(),
    timestamp: TimestampSchema,
  });
