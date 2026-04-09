import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { listDatasets, getDataset, updateDataset, type DatasetRecord } from '../services/dataset-store.js';
import { analyticsAgent, type AnalyticsAgentResult } from './analytics-agent.js';
import { advisoryAgent, type AdvisoryOutput, type AdvisoryInput } from './advisory-agent.js';
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
  const apiKey = config.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('No ANTHROPIC_API_KEY — using heuristic routing');
    return heuristicRoute(query, datasets);
  }

  const client = new Anthropic({ apiKey });

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

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    // Extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ text }, 'LLM returned no JSON, falling back to heuristic');
      return heuristicRoute(query, datasets);
    }

    const parsed = JSON.parse(jsonMatch[0]) as RoutingDecision;

    // Validate
    if (!['profile', 'analyze', 'summarize', 'unsupported'].includes(parsed.intent)) {
      return heuristicRoute(query, datasets);
    }

    return parsed;
  } catch (err) {
    logger.error({ err }, 'LLM routing failed, falling back to heuristic');
    return heuristicRoute(query, datasets);
  }
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

  // Build summary: advisory summary if available, otherwise template
  let summary: string;
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
      for (const imp of advisory.implications) {
        parts.push(`→ ${imp}`);
      }
    }
    if (advisory.hypotheses.length > 0) {
      parts.push('');
      parts.push('Possible explanations:');
      for (const h of advisory.hypotheses) {
        parts.push(`? ${h.explanation} [${h.confidence}]`);
        parts.push(`  Validate: ${h.validation}`);
      }
    }
    if (advisory.decisionSupport) {
      const ds = advisory.decisionSupport;
      if (ds.priorityFocus.length > 0) {
        parts.push('');
        parts.push('Priority focus:');
        for (const pf of ds.priorityFocus) {
          parts.push(`  ▸ ${pf}`);
        }
      }
      if (ds.managementQuestions.length > 0) {
        parts.push('');
        parts.push('Questions to answer:');
        for (const q of ds.managementQuestions) {
          parts.push(`  • ${q}`);
        }
      }
    }
    parts.push('');
    parts.push(advisory.confidenceAssessment);
    summary = parts.join('\n');
  } else {
    // Fallback template for profile-only or error cases
    const summaryParts: string[] = [];
    for (const output of agentOutputs) {
      if (output.type === 'profile') {
        summaryParts.push(
          `Data profile: ${output.datasetName} has ${output.rowCount} rows and ${output.columnCount} columns (quality: ${output.qualityScore}).`,
        );
      }
      if (output.type === 'error') {
        summaryParts.push(String(output.message));
      }
    }
    summary = summaryParts.join('\n');
  }

  return { agentOutputs, advisory, summary };
}

// ─── Public API ─────────────────────────────────────────────

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

export const orchestrator = new Orchestrator();
