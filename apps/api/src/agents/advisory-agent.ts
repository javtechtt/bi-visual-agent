import type { AgentContext, AgentRoleType } from '@bi/types';
import { llmCompleteJSON } from '../services/llm-adapter.js';
import { logger } from '../logger.js';

// ─── Types ──────────────────────────────────────────────────

export interface AdvisoryInput {
  datasetName: string;
  rowCount: number;
  columnCount: number;
  insights: {
    title: string;
    description: string;
    confidence: { level: string; score: number; reasoning: string };
    supportingData?: Record<string, unknown> | null;
  }[];
  metadata: {
    processingTimeMs: number;
    rowsAnalyzed: number;
    methodology: string;
  };
  overallConfidence: { level: string; score: number; reasoning: string };
}

export interface TopInsight {
  insight: string;
  importance: 'high' | 'medium' | 'low';
}

export interface Hypothesis {
  explanation: string;
  confidence: 'low' | 'speculative';
  validation: string;
}

export interface DecisionSupport {
  priorityFocus: string[];
  managementQuestions: string[];
  recommendedFollowUps: string[];
}

export interface AdvisoryOutput {
  agent: AgentRoleType;
  summary: string;
  topInsights: TopInsight[];
  implications: string[];
  hypotheses: Hypothesis[];
  confidenceAssessment: string;
  decisionSupport: DecisionSupport;
}

// ─── Advisory Agent ─────────────────────────────────────────

class AdvisoryAgent {
  readonly role: AgentRoleType = 'advisory';

  async interpret(input: AdvisoryInput, _context: AgentContext): Promise<AdvisoryOutput> {
    logger.info(
      { datasetName: input.datasetName, insightCount: input.insights.length },
      'Advisory agent: strategic interpretation',
    );

    return this.llmInterpret(input);
  }

  // ─── LLM Interpretation ─────────────────────────────────

  private async llmInterpret(input: AdvisoryInput): Promise<AdvisoryOutput> {
    const analyticsPayload = JSON.stringify({
      dataset: `${input.datasetName} (${input.rowCount} rows, ${input.columnCount} columns)`,
      overallConfidence: input.overallConfidence,
      methodology: input.metadata.methodology,
      insights: input.insights.map((i) => ({
        title: i.title,
        description: i.description,
        confidence: i.confidence,
        supportingData: i.supportingData,
      })),
    }, null, 2);

    const systemPrompt = `You are a strategic business intelligence advisor. You interpret statistical analysis results for executive stakeholders and provide decision-support guidance.

Your job:
1. Identify the 2–3 MOST IMPORTANT findings and rank them by business importance.
2. Explain the "so what?" — what does each finding MEAN for the business.
3. Suggest areas worth investigating further (NOT prescriptive actions).
4. Generate possible explanations (hypotheses) for the most notable patterns.
5. For each hypothesis, explain what data would validate or reject it.
6. Assess confidence honestly.
7. Provide decision-support: priority focus areas, management questions to answer, and useful follow-up analyses.

Rules:
- ONLY interpret the provided results. NEVER fabricate values or causes.
- Do NOT give hard prescriptions (don't say "you should do X"). Instead frame as areas to review, questions to answer, and analyses to run.
- Hypotheses are POSSIBLE explanations — NEVER present them as facts.
- Each hypothesis MUST be tied to an observed data pattern.
- Each hypothesis MUST include what data would confirm or reject it.
- When confidence is low, decision-support should emphasize validation and getting more data.
- recommendedFollowUps should be phrased as natural-language questions a user could ask the BI system (e.g. "Show me anomalies in revenue by quarter").
- Be concise. No filler.

Respond with ONLY valid JSON:
{
  "summary": "2-3 sentence strategic summary — lead with the most important finding",
  "topInsights": [
    { "insight": "most important finding explained in business terms", "importance": "high" },
    { "insight": "second finding", "importance": "high" | "medium" },
    { "insight": "third finding if relevant", "importance": "medium" | "low" }
  ],
  "implications": [
    "business implication or area worth investigating"
  ],
  "hypotheses": [
    {
      "explanation": "possible explanation tied to an observed pattern",
      "confidence": "low" | "speculative",
      "validation": "what data would confirm or reject this hypothesis"
    }
  ],
  "confidenceAssessment": "1-2 sentences on reliability and what would strengthen these findings",
  "decisionSupport": {
    "priorityFocus": ["1-3 areas management should review first, grounded in the data"],
    "managementQuestions": ["specific questions a manager should answer based on these findings"],
    "recommendedFollowUps": ["natural-language questions to ask the BI system next, phrased as queries"]
  }
}`;

    const result = await llmCompleteJSON<{
      summary: string;
      topInsights: TopInsight[];
      implications: string[];
      hypotheses: Hypothesis[];
      confidenceAssessment: string;
      decisionSupport?: DecisionSupport;
    }>({
      system: systemPrompt,
      user: `Interpret these analytics results strategically:\n\n${analyticsPayload}`,
      maxTokens: 800,
      label: 'advisory-interpretation',
    });

    if (!result) {
      logger.info('No LLM available for advisory — using deterministic fallback');
      return this.deterministicInterpret(input);
    }

    const parsed = result.data;
    logger.info({ provider: result.provider, model: result.model }, 'Advisory LLM interpretation complete');

    return {
      agent: this.role,
      summary: parsed.summary,
      topInsights: parsed.topInsights.slice(0, 3),
      implications: parsed.implications,
      hypotheses: (parsed.hypotheses ?? []).map((h) => ({
        explanation: h.explanation,
        confidence: h.confidence === 'speculative' ? 'speculative' : 'low',
        validation: h.validation,
      })),
      confidenceAssessment: parsed.confidenceAssessment,
      decisionSupport: parsed.decisionSupport ?? {
        priorityFocus: [],
        managementQuestions: [],
        recommendedFollowUps: [],
      },
    };
  }

  // ─── Deterministic Fallback ───────────────────────────────

  private deterministicInterpret(input: AdvisoryInput): AdvisoryOutput {
    const scored: { insight: string; importance: 'high' | 'medium' | 'low'; score: number; type: string }[] = [];
    const implications: string[] = [];
    let hasAnomaly = false;

    for (const insight of input.insights) {
      const title = insight.title.toLowerCase();
      const conf = insight.confidence;
      const sd = insight.supportingData as Record<string, unknown> | null;

      // ── KPI insights ──────────────────────────────────────
      if (insight.description.includes('Total:')) {
        const totalMatch = insight.description.match(/Total: ([\d,.]+)/);
        const meanMatch = insight.description.match(/Mean: ([\d,.]+)/);
        const metricName = insight.title.replace(' Summary', '');
        const varianceMatch = insight.description.match(/Distribution is (.+?)\./);
        const variance = varianceMatch?.[1] ?? 'unknown';

        if (totalMatch) {
          const importance = variance.includes('high') ? 'high' : conf.score >= 0.5 ? 'medium' : 'low';
          scored.push({
            insight: `${metricName} totals ${totalMatch[1]} (mean: ${meanMatch?.[1] ?? '?'}). Distribution shows ${variance}.`,
            importance,
            score: conf.score + (variance.includes('high') ? 0.3 : 0),
            type: 'kpi',
          });
        }
      }

      // ── Anomaly insights ──────────────────────────────────
      if (title.includes('anomal')) {
        hasAnomaly = true;
        const outlierMatch = insight.description.match(/Found (\d+) outlier/);
        const colMatch = insight.title.match(/in (.+)/);
        const rateMatch = insight.description.match(/\((\d+\.?\d*)%\)/);

        if (outlierMatch && colMatch) {
          const rate = rateMatch?.[1] ? parseFloat(rateMatch[1]) : 0;
          scored.push({
            insight: `${outlierMatch[1]} statistical outlier(s) in ${colMatch[1]} (${rateMatch?.[1] ?? '?'}% of values) — these deviate significantly from the distribution.`,
            importance: rate > 5 ? 'high' : 'medium',
            score: conf.score + (rate > 5 ? 0.4 : 0.2),
            type: 'anomaly',
          });

          implications.push(
            `The outlier(s) in ${colMatch[1]} may indicate data entry errors, exceptional events, or a genuinely distinct sub-population worth isolating.`,
          );
        }
      }

      // ── Trend insights ────────────────────────────────────
      if (sd?.direction && sd?.r_squared !== undefined) {
        const dir = String(sd.direction);
        const r2 = Number(sd.r_squared);
        const pct = sd.pct_change !== undefined ? Number(sd.pct_change) : 0;
        const pVal = Number(sd.p_value ?? 1);
        const metricName = insight.title.replace(/Trend:.*/, '').trim();
        const significant = pVal < 0.05;

        if (dir !== 'stable') {
          const magnitude = Math.abs(pct);
          const importance = significant && magnitude > 20 ? 'high' : significant ? 'medium' : 'low';

          scored.push({
            insight: `${metricName} is ${dir} (${pct > 0 ? '+' : ''}${pct}% over the series). ${significant ? 'This is statistically significant.' : `Not yet significant (p=${pVal.toFixed(3)}) — more data needed to confirm.`}`,
            importance,
            score: (significant ? 0.7 : 0.3) + r2,
            type: 'trend',
          });

          if (magnitude > 10) {
            implications.push(
              `The ${dir} trend in ${metricName} (${pct > 0 ? '+' : ''}${pct}%) may be worth monitoring over a longer period to determine if it persists or reverses.`,
            );
          }
        } else {
          scored.push({
            insight: `${metricName} shows no clear directional pattern (R²=${r2.toFixed(2)}). The data is essentially flat over this period.`,
            importance: 'low',
            score: 0.1,
            type: 'trend',
          });
        }
      }
    }

    // Sort by score, take top 3
    scored.sort((a, b) => b.score - a.score);
    const topInsights: TopInsight[] = scored.slice(0, 3).map(({ insight, importance }) => ({ insight, importance }));

    // General implications
    if (input.overallConfidence.level === 'low') {
      implications.push(
        `With only ${input.rowCount} rows, all findings should be treated as preliminary signals. Collecting more data would substantially increase confidence.`,
      );
    }

    if (hasAnomaly && scored.some((s) => s.type === 'trend')) {
      implications.push(
        'Outliers may be influencing trend calculations. Investigating whether excluding anomalous values changes the trend direction could be informative.',
      );
    }

    // Hypotheses — possible explanations tied to observed patterns
    const hypotheses: Hypothesis[] = [];

    for (const s of scored) {
      if (s.type === 'anomaly') {
        const colMatch = s.insight.match(/in (.+?) \(/);
        const col = colMatch?.[1] ?? 'the flagged column';
        hypotheses.push({
          explanation: `The outlier(s) in ${col} could be the result of a one-time promotional event, a data entry error, or a genuinely different customer segment.`,
          confidence: 'speculative',
          validation: `Cross-reference the anomalous rows with transaction logs or event calendars. If the outlier dates align with known promotions or system changes, that would confirm a non-random cause.`,
        });
      }

      if (s.type === 'trend') {
        const dirMatch = s.insight.match(/is (increasing|decreasing)/);
        const metricMatch = s.insight.match(/^(.+?) is/);
        if (dirMatch && metricMatch) {
          const dir = dirMatch[1];
          const metric = metricMatch[1];
          hypotheses.push({
            explanation: `The ${dir} pattern in ${metric} may reflect a seasonal cycle, a market shift, or a change in business operations during the observed period.`,
            confidence: 'low',
            validation: `Compare with a longer time range (12+ months) to distinguish seasonal patterns from structural trends. External market data for the same period would also help isolate the cause.`,
          });
        }
      }
    }

    // If high variance KPI exists, add a hypothesis
    const highVarianceKpi = scored.find((s) => s.type === 'kpi' && s.insight.includes('high variance'));
    if (highVarianceKpi) {
      const metricMatch = highVarianceKpi.insight.match(/^(.+?) totals/);
      const metric = metricMatch?.[1] ?? 'the metric';
      hypotheses.push({
        explanation: `The high variance in ${metric} could indicate inconsistent pricing, mixed product segments, or a bimodal distribution from distinct customer groups.`,
        confidence: 'speculative',
        validation: `Segment the data by product category or customer type. If variance drops within segments, the metric is being driven by group composition rather than instability.`,
      });
    }

    // Summary — lead with the most important finding
    const topFinding = scored[0];
    const parts: string[] = [];
    if (topFinding) {
      parts.push(`The most notable finding from "${input.datasetName}": ${topFinding.insight.split('.')[0]}.`);
    }
    parts.push(`${input.insights.length} findings across ${input.rowCount} rows.`);
    if (input.overallConfidence.level === 'low') {
      parts.push('Confidence is limited — treat as directional signals, not conclusions.');
    }

    // Confidence assessment
    const rowCount = input.rowCount;
    const overallLevel = input.overallConfidence.level;
    let confidenceAssessment: string;
    if (overallLevel === 'high') {
      confidenceAssessment = `Based on ${rowCount} rows with high statistical confidence. Findings are suitable for informing business decisions.`;
    } else if (overallLevel === 'medium') {
      confidenceAssessment = `Moderate confidence from ${rowCount} rows. Core patterns are likely real but edge cases need verification. More data would strengthen trend and anomaly detection.`;
    } else {
      confidenceAssessment = `Low confidence — ${rowCount} rows is a small sample. These are possible patterns, not conclusions. Increasing to 50+ rows would substantially improve reliability.`;
    }

    // ── Decision Support — derived from observed analytics ────
    const priorityFocus: string[] = [];
    const managementQuestions: string[] = [];
    const recommendedFollowUps: string[] = [];

    // Priority focus: based on top scored findings
    for (const s of scored.slice(0, 2)) {
      if (s.type === 'anomaly') {
        const colMatch = s.insight.match(/in (.+?) \(/);
        const col = colMatch?.[1] ?? 'the flagged metric';
        priorityFocus.push(`Review outlier values in ${col} — determine if they represent errors, exceptions, or genuine patterns.`);
        managementQuestions.push(`Are the outlier values in ${col} the result of known events or data quality issues?`);
        recommendedFollowUps.push(`Show me the anomalous rows in ${col} with their full context`);
      }
      if (s.type === 'trend') {
        const metricMatch = s.insight.match(/^(.+?) is/);
        const dirMatch = s.insight.match(/is (increasing|decreasing)/);
        if (metricMatch && dirMatch) {
          priorityFocus.push(`Monitor the ${dirMatch[1]} trend in ${metricMatch[1]} — assess whether it aligns with expectations.`);
          managementQuestions.push(`Is the ${dirMatch[1]} trend in ${metricMatch[1]} driven by internal changes or external factors?`);
          recommendedFollowUps.push(`Break down ${metricMatch[1]} trend by category or segment`);
        }
      }
      if (s.type === 'kpi' && s.insight.includes('high variance')) {
        const metricMatch = s.insight.match(/^(.+?) totals/);
        const metric = metricMatch?.[1] ?? 'the high-variance metric';
        priorityFocus.push(`Investigate what drives the wide spread in ${metric} — this may mask distinct sub-groups.`);
        managementQuestions.push(`Does ${metric} behave differently across product lines, regions, or time periods?`);
        recommendedFollowUps.push(`Segment ${metric} by category and compare distributions`);
      }
    }

    // Low-confidence: emphasize validation
    if (overallLevel === 'low') {
      priorityFocus.push('Gather additional data before making decisions — current sample is too small for firm conclusions.');
      managementQuestions.push('Can we source a larger or more recent dataset to validate these preliminary patterns?');
      recommendedFollowUps.push('What is the data quality profile of this dataset?');
    }

    // Always suggest a general follow-up if we have data
    if (recommendedFollowUps.length === 0) {
      recommendedFollowUps.push(`Give me a full summary of ${input.datasetName}`);
    }

    return {
      agent: this.role,
      summary: parts.join(' '),
      topInsights,
      implications,
      hypotheses,
      confidenceAssessment,
      decisionSupport: {
        priorityFocus,
        managementQuestions,
        recommendedFollowUps,
      },
    };
  }
}

export const advisoryAgent = new AdvisoryAgent();
