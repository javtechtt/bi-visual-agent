'use client';

import {
  Minus,
  AlertTriangle,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { InsightChart } from './insight-chart';

export interface InsightViz {
  chartType: string;
  title: string;
  data: Record<string, unknown>[];
  xAxis?: string;
  yAxis?: string;
}

export interface VisualSpec {
  type: 'line' | 'bar' | 'scatter' | 'histogram';
  x: string;
  y: string;
  title: string;
  data: Record<string, unknown>[];
}

export interface InsightData {
  title: string;
  description: string;
  confidence: { level: string; score: number; reasoning: string };
  visualization: InsightViz | null;
  visual?: VisualSpec | null;
  followUps?: string[];
}

export interface AnalyticsData {
  agent: string;
  datasetId: string;
  insights: InsightData[];
  metadata: {
    processingTimeMs: number;
    rowsAnalyzed: number;
    methodology: string;
  };
  confidence: { level: string; score: number; reasoning: string };
}

export interface FollowUpRequest {
  query: string;
  context: { metric?: string; insightType?: string };
}

export function InsightsView({ data, onFollowUp }: { data: AnalyticsData; onFollowUp?: (req: FollowUpRequest) => void }) {
  const { insights, metadata, confidence } = data;

  const kpiInsights = insights.filter((i) => i.visualization?.chartType === 'kpi_card');
  const chartInsights = insights.filter(
    (i) => i.visualization && i.visualization.chartType !== 'kpi_card',
  );
  const textInsights = insights.filter((i) => !i.visualization);

  const confColor =
    confidence.level === 'high'
      ? 'text-emerald-600'
      : confidence.level === 'medium'
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">Analytics Agent Results</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{metadata.rowsAnalyzed} rows analyzed</span>
          <span>{metadata.processingTimeMs.toFixed(0)}ms</span>
          <span className={`font-medium capitalize ${confColor}`}>{confidence.level} confidence</span>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiInsights.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpiInsights.map((insight, i) => (
            <KpiInsightCard key={i} insight={insight} onFollowUp={onFollowUp} />
          ))}
        </div>
      )}

      {/* Chart Insights */}
      {chartInsights.map((insight, i) => (
        <ChartInsightCard key={`chart-${i}`} insight={insight} onFollowUp={onFollowUp} />
      ))}

      {/* Text Insights (anomalies, no-data messages) */}
      {textInsights.map((insight, i) => (
        <TextInsightCard key={`text-${i}`} insight={insight} />
      ))}

      {/* Methodology */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Methodology:</span> {metadata.methodology}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{confidence.reasoning}</p>
      </div>
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────

function KpiInsightCard({ insight, onFollowUp }: { insight: InsightData; onFollowUp?: (req: FollowUpRequest) => void }) {
  const kpiData = insight.visualization?.data[0] as Record<string, number> | undefined;
  if (!kpiData) return null;

  const total = kpiData.total ?? kpiData.mean ?? 0;
  const mean = kpiData.mean ?? 0;
  const visual = insight.visual;

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {insight.visualization?.title ?? insight.title}
        </p>
        <ConfidenceDot level={insight.confidence.level} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNum(total)}</p>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span>Mean: {formatNum(mean)}</span>
        {kpiData.min !== undefined && <span>Min: {formatNum(kpiData.min)}</span>}
        {kpiData.max !== undefined && <span>Max: {formatNum(kpiData.max)}</span>}
      </div>
      {visual && visual.data.length > 0 && <InsightChart spec={visual} compact />}
      <p className="mt-2 text-xs text-muted-foreground">{insight.confidence.reasoning}</p>
      <FollowUpButtons insight={insight} onFollowUp={onFollowUp} />
    </div>
  );
}

// ─── Chart Card ─────────────────────────────────────────────

function ChartInsightCard({ insight, onFollowUp }: { insight: InsightData; onFollowUp?: (req: FollowUpRequest) => void }) {
  const viz = insight.visualization;
  const visual = insight.visual;
  if (!viz && !visual) return null;

  const isAnomaly = insight.title.toLowerCase().includes('anomal');

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAnomaly ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <BarChart3 className="h-4 w-4 text-indigo-500" />
          )}
          <p className="text-sm font-semibold">{insight.title}</p>
        </div>
        <ConfidenceDot level={insight.confidence.level} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>

      {visual && visual.data.length > 0 && <InsightChart spec={visual} />}

      <p className="mt-2 text-xs text-muted-foreground">{insight.confidence.reasoning}</p>
      <FollowUpButtons insight={insight} onFollowUp={onFollowUp} />
    </div>
  );
}

// ─── Text Insight Card ──────────────────────────────────────

function TextInsightCard({ insight }: { insight: InsightData }) {
  const isMissing = insight.title.toLowerCase().includes('no ');

  return (
    <div className={`rounded-xl border p-4 ${isMissing ? 'border-border bg-muted/20' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2">
        {isMissing ? (
          <Minus className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Sparkles className="h-4 w-4 text-violet-500" />
        )}
        <p className="text-sm font-semibold">{insight.title}</p>
        <ConfidenceDot level={insight.confidence.level} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
    </div>
  );
}

// ─── Follow-up Buttons ─────────────────────────────────────

function FollowUpButtons({ insight, onFollowUp }: { insight: InsightData; onFollowUp?: (req: FollowUpRequest) => void }) {
  const { followUps } = insight;
  if (!followUps || followUps.length === 0 || !onFollowUp) return null;

  // Extract metric from insight title: "Revenue Summary" → "Revenue", "Anomalies in Discount Pct" → "Discount Pct"
  const metric = extractMetric(insight.title);
  const insightType = insight.title.toLowerCase().includes('anomal')
    ? 'anomaly'
    : insight.title.toLowerCase().includes('trend')
      ? 'trend'
      : 'kpi';

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {followUps.map((q, i) => (
        <button
          key={i}
          onClick={() => onFollowUp({ query: q, context: { metric, insightType } })}
          className="rounded-full border border-indigo-200 bg-indigo-50/50 px-2.5 py-1 text-[11px] text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function extractMetric(title: string): string {
  return title
    .replace(/\s+Summary$/, '')
    .replace(/^Anomalies in\s+/, '')
    .replace(/\s+Trend:.*$/, '')
    .trim();
}

// ─── Helpers ────────────────────────────────────────────────

function ConfidenceDot({ level }: { level: string }) {
  const color =
    level === 'high' ? 'bg-emerald-500' : level === 'medium' ? 'bg-amber-500' : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={`${level} confidence`} />;
}

function formatNum(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  if (Math.abs(val) >= 1) return val.toFixed(2);
  return val.toFixed(4);
}
