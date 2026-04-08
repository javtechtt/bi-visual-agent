import { type z } from 'zod';
import {
  AgentRole,
  AgentMessageSchema,
  OrchestratorRequestSchema,
  AgentRoutingDecision,
  DataAgentRequestSchema,
  DataProfileSchema,
  AnalyticsRequestSchema,
  AnalyticsResultSchema,
  AdvisoryRequestSchema,
  AdvisoryResponseSchema,
  RecommendationSchema,
  VisualizationSpec,
  ConfidenceScore,
} from '@bi/schemas';

// ─── Inferred Types from Schemas ────────────────────────────

export type AgentRoleType = z.infer<typeof AgentRole>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type OrchestratorRequest = z.infer<typeof OrchestratorRequestSchema>;
export type RoutingDecision = z.infer<typeof AgentRoutingDecision>;

export type DataAgentRequest = z.infer<typeof DataAgentRequestSchema>;
export type DataProfile = z.infer<typeof DataProfileSchema>;

export type AnalyticsRequest = z.infer<typeof AnalyticsRequestSchema>;
export type AnalyticsResult = z.infer<typeof AnalyticsResultSchema>;
export type Visualization = z.infer<typeof VisualizationSpec>;

export type AdvisoryRequest = z.infer<typeof AdvisoryRequestSchema>;
export type AdvisoryResponse = z.infer<typeof AdvisoryResponseSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;

export type Confidence = z.infer<typeof ConfidenceScore>;

// ─── Agent Interfaces ───────────────────────────────────────

export interface AgentContext {
  sessionId: string;
  userId: string;
  traceId: string;
  startedAt: Date;
}

export interface AgentExecutor<TRequest, TResponse> {
  readonly role: AgentRoleType;
  execute(request: TRequest, context: AgentContext): Promise<TResponse>;
  validate(request: unknown): TRequest;
}

// ─── Session ────────────────────────────────────────────────

export interface Session {
  id: string;
  userId: string;
  messages: AgentMessage[];
  activeDatasetId: string | null;
  createdAt: Date;
  lastActivityAt: Date;
}
