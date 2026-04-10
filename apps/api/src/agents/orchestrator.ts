import { listDatasets, getDataset, updateDataset, type DatasetRecord } from '../services/dataset-store.js';
import { analyticsAgent, type AnalyticsAgentResult } from './analytics-agent.js';
import { advisoryAgent, type AdvisoryOutput, type AdvisoryInput } from './advisory-agent.js';
import { llmCompleteJSON } from '../services/llm-adapter.js';
import { logger } from '../logger.js';

// ─── Routing Decision Schema ────────────────────────────────

export interface RoutingDecision {
  intent: 'profile' | 'analyze' | 'summarize' | 'unsupported';
  targetDatasetId: string | null;
  actions: ('data_agent' | 'analytics_agent')[];
  reasoning: string;
}

export interface QueryResult {
  query: string;
  routing: RoutingDecision;
  agentOutputs: Record<string, unknown>[];
  advisory: AdvisoryOutput | null;
  summary: string;
  timestamp: string;
}

// ─── LLM Router ─────────────────────────────────────────────

async function routeWithLLM(query: string, datasets: DatasetRecord[]): Promise<RoutingDecision> {
  const datasetSummary = datasets.length === 0
    ? 'No datasets uploaded yet.'
    : datasets.map((d) => {
        const cols = (d.profile as Record<string, unknown>)?.columns;
        const colNames = Array.isArray(cols) ? cols.map((c: Record<string, unknown>) => c.name).join(', ') : 'unknown';
        return `- id="${d.id}" name="${d.name}" type=${d.sourceType} capability=${d.capability} rows=${d.rowCount ?? '?'} columns=[${colNames}]`;
      }).join('\n');

  const systemPrompt = `You are a routing agent for a Business Intelligence platform. Your job is to interpret user queries and decide which agents should handle them.

Available agents:
- data_agent: profiles datasets, describes columns, assesses quality
- analytics_agent: computes KPIs, detects anomalies, analyzes trends

Available datasets:
${datasetSummary}

Respond with ONLY valid JSON matching this exact schema:
{
  "intent": "profile" | "analyze" | "summarize" | "unsupported",
  "targetDatasetId": "<dataset id>" | null,
  "actions": ["data_agent"] | ["analytics_agent"] | ["data_agent", "analytics_agent"] | [],
  "reasoning": "<brief explanation>"
}

Rules:
- "profile" intent → actions: ["data_agent"]
- "analyze" intent (KPIs, trends, anomalies) → actions: ["analytics_agent"]
- "summarize" intent → actions: ["data_agent", "analytics_agent"] (chain: profile then analyze)
- "unsupported" → actions: [], reasoning explains why
- If the query mentions a specific dataset or file, match it to targetDatasetId
- If only one dataset with capability=analysis_ready exists, default to that
- If no datasets exist or none are analysis_ready, set intent to "unsupported" with clear reasoning
- Never fabricate data. Route to agents that can compute real answers.`;

  const result = await llmCompleteJSON<RoutingDecision>({
    system: systemPrompt,
    user: query,
    maxTokens: 300,
    label: 'orchestrator-routing',
  });

  if (!result) {
    logger.info('No LLM available for routing — using heuristic');
    return heuristicRoute(query, datasets);
  }

  // Validate intent
  if (!['profile', 'analyze', 'summarize', 'unsupported'].includes(result.data.intent)) {
    logger.warn({ intent: result.data.intent }, 'LLM returned invalid intent, falling back');
    return heuristicRoute(query, datasets);
  }

  logger.info({ provider: result.provider, model: result.model, intent: result.data.intent }, 'LLM routing decision');
  return result.data;
}

// ─── Heuristic Fallback Router ──────────────────────────────

function heuristicRoute(query: string, datasets: DatasetRecord[]): RoutingDecision {
  const q = query.toLowerCase();
  const analysisReady = datasets.filter((d) => d.capability === 'analysis_ready');
  const targetDataset = analysisReady[0] ?? null;

  if (datasets.length === 0) {
    return {
      intent: 'unsupported',
      targetDatasetId: null,
      actions: [],
      reasoning: 'No datasets uploaded. Upload a CSV or Excel file first to enable analysis.',
    };
  }

  if (!targetDataset) {
    return {
      intent: 'unsupported',
      targetDatasetId: null,
      actions: [],
      reasoning: 'No datasets are ready for analysis. Upload a CSV or Excel file to enable profiling and analytics.',
    };
  }

  const analyzeKeywords = ['kpi', 'trend', 'anomal', 'revenue', 'sale', 'profit', 'growth', 'decline', 'forecast', 'metric', 'performance', 'top', 'bottom', 'average', 'total', 'compare', 'analysis', 'analyze', 'insight'];
  const profileKeywords = ['column', 'type', 'schema', 'quality', 'profile', 'describe', 'field', 'null', 'missing'];
  const summaryKeywords = ['summary', 'summarize', 'overview', 'tell me about', 'what is in', 'what do we have'];

  if (summaryKeywords.some((k) => q.includes(k))) {
    return {
      intent: 'summarize',
      targetDatasetId: targetDataset.id,
      actions: ['data_agent', 'analytics_agent'],
      reasoning: `Summarizing dataset "${targetDataset.name}" — will profile and then analyze.`,
    };
  }

  if (analyzeKeywords.some((k) => q.includes(k))) {
    return {
      intent: 'analyze',
      targetDatasetId: targetDataset.id,
      actions: ['analytics_agent'],
      reasoning: `Running analytics on "${targetDataset.name}" to answer: ${query}`,
    };
  }

  if (profileKeywords.some((k) => q.includes(k))) {
    return {
      intent: 'profile',
      targetDatasetId: targetDataset.id,
      actions: ['data_agent'],
      reasoning: `Profiling dataset "${targetDataset.name}" to describe its structure.`,
    };
  }

  // Default: try analytics if we have a ready dataset
  return {
    intent: 'analyze',
    targetDatasetId: targetDataset.id,
    actions: ['analytics_agent'],
    reasoning: `Interpreting as analytics query on "${targetDataset.name}".`,
  };
}

// ─── Execution Layer ────────────────────────────────────────

async function executeRouting(
  _query: string,
  routing: RoutingDecision,
): Promise<{ agentOutputs: Record<string, unknown>[]; advisory: AdvisoryOutput | null; summary: string }> {
  const agentOutputs: Record<string, unknown>[] = [];
  const sessionId = crypto.randomUUID();
  const context = { sessionId, userId: 'demo-user', traceId: crypto.randomUUID(), startedAt: new Date() };

  if (routing.intent === 'unsupported') {
    return { agentOutputs: [], advisory: null, summary: routing.reasoning };
  }

  const datasetId = routing.targetDatasetId;
  if (!datasetId) {
    return { agentOutputs: [], advisory: null, summary: 'No target dataset identified. Please upload a dataset first.' };
  }

  const dataset = getDataset(datasetId);
  if (!dataset) {
    return { agentOutputs: [], advisory: null, summary: `Dataset ${datasetId} not found.` };
  }

  for (const action of routing.actions) {
    if (action === 'data_agent') {
      // Return the stored profile
      if (dataset.profile) {
        const profile = dataset.profile as Record<string, unknown>;
        agentOutputs.push({
          agent: 'data',
          type: 'profile',
          datasetName: dataset.name,
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          qualityScore: (profile as Record<string, unknown>).quality_score ?? (profile as Record<string, unknown>).qualityScore,
          columns: (profile as Record<string, unknown>).columns,
        });
      }
    }

    if (action === 'analytics_agent') {
      if (dataset.capability !== 'analysis_ready') {
        agentOutputs.push({
          agent: 'analytics',
          type: 'error',
          message: `Dataset "${dataset.name}" is not ready for analysis (capability: ${dataset.capability}).`,
        });
        continue;
      }

      try {
        const result: AnalyticsAgentResult = await analyticsAgent.analyze(
          { datasetId, action: 'all' },
          context,
        );

        // Persist the analysis result
        updateDataset(datasetId, {
          lastAnalysis: result as unknown as Record<string, unknown>,
          lastAnalyzedAt: new Date().toISOString(),
        });

        agentOutputs.push({
          type: 'analysis',
          ...result,
        });
      } catch (err) {
        logger.error({ err, datasetId }, 'Analytics execution failed');
        agentOutputs.push({
          agent: 'analytics',
          type: 'error',
          message: `Analytics failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }
  }

  // Run Advisory Agent on analytics results
  let advisory: AdvisoryOutput | null = null;
  const analysisOutput = agentOutputs.find((o) => o.type === 'analysis') as (AnalyticsAgentResult & { type: string }) | undefined;

  if (analysisOutput) {
    try {
      const advisoryInput: AdvisoryInput = {
        datasetName: dataset.name,
        rowCount: dataset.rowCount ?? 0,
        columnCount: dataset.columnCount ?? 0,
        insights: analysisOutput.insights,
        metadata: analysisOutput.metadata,
        overallConfidence: analysisOutput.confidence,
      };

      advisory = await advisoryAgent.interpret(advisoryInput, context);
      agentOutputs.push({ type: 'advisory', ...advisory });
    } catch (err) {
      logger.error({ err }, 'Advisory agent failed');
    }
  }

  return { agentOutputs, advisory, summary: buildSummary(advisory, agentOutputs) };
}

// ─── Public API ─────────────────────────────────────────────

// ─── Stream Events ─────────────────────────────────────────

export type StreamEvent =
  | { stage: 'query_received'; query: string }
  | { stage: 'routing_done'; routing: RoutingDecision }
  | { stage: 'visual_ready'; insights: Record<string, unknown>[] }
  | { stage: 'narrative_ready'; summary: string; advisory: AdvisoryOutput | null }
  | { stage: 'followups_ready'; followUps: string[] }
  | { stage: 'done'; result: QueryResult };

class Orchestrator {
  async query(userQuery: string): Promise<QueryResult> {
    const datasets = listDatasets();
    logger.info({ query: userQuery.slice(0, 100), datasetCount: datasets.length }, 'Orchestrator: routing query');

    const routing = await routeWithLLM(userQuery, datasets);
    logger.info({ routing }, 'Orchestrator: routing decision');

    const { agentOutputs, advisory, summary } = await executeRouting(userQuery, routing);

    return {
      query: userQuery,
      routing,
      agentOutputs,
      advisory,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Progressive query execution — emits events at each stage so the
   * frontend can render visuals before the narrative is ready.
   */
  async *queryStream(userQuery: string): AsyncGenerator<StreamEvent> {
    yield { stage: 'query_received', query: userQuery };

    const datasets = listDatasets();
    const routing = await routeWithLLM(userQuery, datasets);
    yield { stage: 'routing_done', routing };

    if (routing.intent === 'unsupported' || !routing.targetDatasetId) {
      const summary = routing.reasoning;
      yield { stage: 'narrative_ready', summary, advisory: null };
      yield { stage: 'done', result: { query: userQuery, routing, agentOutputs: [], advisory: null, summary, timestamp: new Date().toISOString() } };
      return;
    }

    const datasetId = routing.targetDatasetId;
    const dataset = getDataset(datasetId);
    if (!dataset) {
      const summary = `Dataset ${datasetId} not found.`;
      yield { stage: 'narrative_ready', summary, advisory: null };
      yield { stage: 'done', result: { query: userQuery, routing, agentOutputs: [], advisory: null, summary, timestamp: new Date().toISOString() } };
      return;
    }

    const agentOutputs: Record<string, unknown>[] = [];
    const sessionId = crypto.randomUUID();
    const context = { sessionId, userId: 'demo-user', traceId: crypto.randomUUID(), startedAt: new Date() };

    // ── Profile ──
    if (routing.actions.includes('data_agent') && dataset.profile) {
      const profile = dataset.profile as Record<string, unknown>;
      agentOutputs.push({
        agent: 'data', type: 'profile', datasetName: dataset.name,
        rowCount: dataset.rowCount, columnCount: dataset.columnCount,
        qualityScore: profile.quality_score ?? profile.qualityScore, columns: profile.columns,
      });
    }

    // ── Analytics — emit visuals as soon as insights are ready ──
    let analysisResult: AnalyticsAgentResult | null = null;
    if (routing.actions.includes('analytics_agent') && dataset.capability === 'analysis_ready') {
      try {
        analysisResult = await analyticsAgent.analyze({ datasetId, action: 'all' }, context);
        updateDataset(datasetId, { lastAnalysis: analysisResult as unknown as Record<string, unknown>, lastAnalyzedAt: new Date().toISOString() });
        agentOutputs.push({ type: 'analysis', ...analysisResult });

        // Emit visuals EARLY — before advisory runs
        const insightsWithVisuals = analysisResult.insights.filter((i) => i.visual);
        if (insightsWithVisuals.length > 0) {
          yield { stage: 'visual_ready', insights: insightsWithVisuals as unknown as Record<string, unknown>[] };
        }
      } catch (err) {
        logger.error({ err, datasetId }, 'Analytics execution failed');
        agentOutputs.push({ agent: 'analytics', type: 'error', message: `Analytics failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
    }

    // ── Advisory — runs AFTER visual_ready was emitted ──
    let advisory: AdvisoryOutput | null = null;
    if (analysisResult) {
      try {
        const advisoryInput: AdvisoryInput = {
          datasetName: dataset.name, rowCount: dataset.rowCount ?? 0, columnCount: dataset.columnCount ?? 0,
          insights: analysisResult.insights, metadata: analysisResult.metadata, overallConfidence: analysisResult.confidence,
        };
        advisory = await advisoryAgent.interpret(advisoryInput, context);
        agentOutputs.push({ type: 'advisory', ...advisory });
      } catch (err) {
        logger.error({ err }, 'Advisory agent failed');
      }
    }

    // ── Narrative ──
    const summary = buildSummary(advisory, agentOutputs);
    yield { stage: 'narrative_ready', summary, advisory };

    // ── Follow-ups ──
    const allFollowUps: string[] = [];
    if (analysisResult) {
      for (const insight of analysisResult.insights) {
        if (insight.followUps) allFollowUps.push(...insight.followUps);
      }
    }
    if (advisory?.decisionSupport?.recommendedFollowUps) {
      allFollowUps.push(...advisory.decisionSupport.recommendedFollowUps);
    }
    if (allFollowUps.length > 0) {
      // Deduplicate
      yield { stage: 'followups_ready', followUps: [...new Set(allFollowUps)].slice(0, 6) };
    }

    yield {
      stage: 'done',
      result: { query: userQuery, routing, agentOutputs, advisory, summary, timestamp: new Date().toISOString() },
    };
  }

  // Legacy method for the /agents/chat endpoint
  async handle(request: { sessionId: string; query: string }): Promise<Record<string, unknown>> {
    const result = await this.query(request.query);
    return {
      sessionId: request.sessionId,
      routing: result.routing,
      results: result.agentOutputs,
      summary: result.summary,
      completedAt: result.timestamp,
    };
  }
}

// ─── Summary Builder ───────────────────────────────────────

function buildSummary(advisory: AdvisoryOutput | null, agentOutputs: Record<string, unknown>[]): string {
  if (advisory) {
    const parts = [advisory.summary];
    if (advisory.topInsights.length > 0) {
      parts.push('');
      for (const ti of advisory.topInsights) {
        const badge = ti.importance === 'high' ? '[!]' : ti.importance === 'medium' ? '[~]' : '[-]';
        parts.push(`${badge} ${ti.insight}`);
      }
    }
    if (advisory.implications.length > 0) {
      parts.push('');
      for (const imp of advisory.implications) parts.push(`→ ${imp}`);
    }
    parts.push('');
    parts.push(advisory.confidenceAssessment);
    return parts.join('\n');
  }

  const summaryParts: string[] = [];
  for (const output of agentOutputs) {
    if (output.type === 'profile') {
      summaryParts.push(`Data profile: ${output.datasetName} has ${output.rowCount} rows and ${output.columnCount} columns (quality: ${output.qualityScore}).`);
    }
    if (output.type === 'error') summaryParts.push(String(output.message));
  }
  return summaryParts.join('\n');
}

export const orchestrator = new Orchestrator();
