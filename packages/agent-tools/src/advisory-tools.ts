import { z } from 'zod';
import { defineTool } from './tool-registry.js';

export const generateRecommendationsTool = defineTool({
  name: 'generate_recommendations',
  description: 'Synthesize analytics results into strategic recommendations',
  category: 'advisory',
  inputSchema: z.object({
    analyticsResults: z.array(z.record(z.unknown())),
    audienceLevel: z.enum(['executive', 'manager', 'analyst']).default('executive'),
    focusAreas: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    recommendations: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        impact: z.enum(['high', 'medium', 'low']),
        actionItems: z.array(z.string()),
        risks: z.array(z.string()),
        timeframe: z.string(),
      }),
    ),
  }),
});

export const generateExecutiveSummaryTool = defineTool({
  name: 'generate_executive_summary',
  description: 'Create a CEO-ready executive summary from analysis results',
  category: 'advisory',
  inputSchema: z.object({
    analyticsResults: z.array(z.record(z.unknown())),
    dataProfile: z.record(z.unknown()).optional(),
    maxLength: z.number().int().positive().default(500),
  }),
  outputSchema: z.object({
    summary: z.string(),
    keyMetrics: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        trend: z.enum(['up', 'down', 'stable']).optional(),
      }),
    ),
    followUpQuestions: z.array(z.string()),
  }),
});

export const advisoryTools = [generateRecommendationsTool, generateExecutiveSummaryTool] as const;
