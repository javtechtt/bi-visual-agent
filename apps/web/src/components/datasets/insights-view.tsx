'use client';

import {
  Minus,
  AlertTriangle,
  BarChart3,
  Sparkles,
} from 'lucide-react';

export interface InsightViz {
  chartType: string;
  title: string;
  data: Record<string, unknown>[];
  xAxis?: string;
  yAxis?: string;
}

export interface InsightData {
  title: string;
  description: string;
  confidence: { level: string; score: number; reasoning: string };
  visualization: InsightViz | null;
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

export function InsightsView({ data }: { data: AnalyticsData }) {
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
            <KpiInsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Chart Insights */}
      {chartInsights.map((insight, i) => (
        <ChartInsightCard key={`chart-${i}`} insight={insight} />
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

function KpiInsightCard({ insight }: { insight: InsightData }) {
  const kpiData = insight.visualization?.data[0] as Record<string, number> | undefined;
  if (!kpiData) return null;

  const total = kpiData.total ?? kpiData.mean ?? 0;
  const mean = kpiData.mean ?? 0;

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
      <p className="mt-2 text-xs text-muted-foreground">{insight.confidence.reasoning}</p>
    </div>
  );
}

// ─── Chart Card ─────────────────────────────────────────────

function ChartInsightCard({ insight }: { insight: InsightData }) {
  const viz = insight.visualization;
  if (!viz) return null;

  const isAnomaly = insight.title.toLowerCase().includes('anomal');
  const isTrend = viz.chartType === 'line';

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

      {/* Mini inline chart */}
      {isTrend && viz.data.length > 0 && <MiniLineChart data={viz.data} />}
      {!isTrend && viz.data.length > 0 && <MiniBarChart data={viz.data} yKey={viz.yAxis ?? 'value'} />}

      <p className="mt-2 text-xs text-muted-foreground">{insight.confidence.reasoning}</p>
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

// ─── Mini Charts (pure CSS, no chart library) ───────────────

function MiniLineChart({ data }: { data: Record<string, unknown>[] }) {
  const values = data.map((d) => Number(d.actual ?? d.value ?? 0));
  const trends = data.map((d) => Number(d.trend ?? 0));
  const max = Math.max(...values, ...trends);
  const min = Math.min(...values, ...trends);
  const range = max - min || 1;

  return (
    <div className="mt-3 flex h-20 items-end gap-px">
      {values.map((v, i) => {
        const h = ((v - min) / range) * 100;
        const trendH = trends[i] ? ((trends[i] - min) / range) * 100 : 0;
        return (
          <div key={i} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
            {trendH > 0 && (
              <div
                className="absolute bottom-0 w-full rounded-sm bg-indigo-100 opacity-60"
                style={{ height: `${trendH}%` }}
              />
            )}
            <div
              className="relative z-10 w-full rounded-sm bg-indigo-500"
              style={{ height: `${Math.max(h, 2)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function MiniBarChart({ data, yKey }: { data: Record<string, unknown>[]; yKey: string }) {
  const values = data.map((d) => Math.abs(Number(d[yKey] ?? 0)));
  const max = Math.max(...values) || 1;

  return (
    <div className="mt-3 flex h-16 items-end gap-1">
      {values.slice(0, 20).map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-amber-400"
          style={{ height: `${(v / max) * 100}%`, minHeight: '2px' }}
        />
      ))}
    </div>
  );
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
