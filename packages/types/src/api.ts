// ─── API Response Wrappers ──────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  requestId: string;
  timestamp: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─── WebSocket Events ───────────────────────────────────────

export type WsEventType =
  | 'agent:status'
  | 'agent:message'
  | 'agent:complete'
  | 'agent:error'
  | 'job:progress'
  | 'job:complete';

export interface WsEvent<T = unknown> {
  type: WsEventType;
  sessionId: string;
  payload: T;
  timestamp: string;
}

// ─── Job Types ──────────────────────────────────────────────

export type JobType = 'data:ingest' | 'data:profile' | 'analytics:run' | 'report:generate';

export interface JobPayload {
  type: JobType;
  sessionId: string;
  userId: string;
  data: Record<string, unknown>;
}

export interface JobProgress {
  jobId: string;
  type: JobType;
  progress: number;
  stage: string;
  message?: string;
}
