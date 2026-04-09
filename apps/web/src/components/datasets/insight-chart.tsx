'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { VisualSpec } from './insights-view';

/**
 * InsightChart — renders a Recharts chart from a VisualSpec.
 *
 * Automatically selects the right chart type based on spec.type.
 * Designed to sit directly beneath an insight card — no configuration UI.
 *
 * @param spec   The visual specification from the analytics backend.
 * @param compact  If true, renders a smaller chart (used inside KPI cards).
 */
export function InsightChart({ spec, compact }: { spec: VisualSpec; compact?: boolean }) {
  if (!spec.data.length) return null;

  const height = compact ? 80 : 200;

  return (
    <div className="mt-3">
      {!compact && (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {spec.title}
        </p>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, compact)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderChart(spec: VisualSpec, compact?: boolean) {
  switch (spec.type) {
    case 'line':
      return <TrendLineChart spec={spec} compact={compact} />;
    case 'bar':
      return <AnomalyBarChart spec={spec} compact={compact} />;
    case 'histogram':
      return <DistributionHistogram spec={spec} compact={compact} />;
    case 'scatter':
      return <CorrelationScatter spec={spec} compact={compact} />;
    default:
      return <DistributionHistogram spec={spec} compact={compact} />;
  }
}

// ─── Trend Line Chart ──────────────────────────────────────

function TrendLineChart({ spec, compact }: { spec: VisualSpec; compact?: boolean }) {
  const hasTrend = spec.data.some((d) => d.trend != null);

  return (
    <LineChart data={spec.data} margin={compact ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 16, bottom: 4, left: 0 }}>
      {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
      {!compact && (
        <XAxis
          dataKey={spec.x}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
      )}
      {!compact && (
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => formatAxis(v)}
        />
      )}
      {!compact && (
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value: number) => [formatAxis(value), '']}
          labelFormatter={(label) => `Point ${label}`}
        />
      )}
      <Line
        type="monotone"
        dataKey={spec.y}
        stroke="#6366f1"
        strokeWidth={2}
        dot={!compact && spec.data.length <= 30 ? { r: 3, fill: '#6366f1' } : false}
        activeDot={!compact ? { r: 4, fill: '#6366f1' } : false}
      />
      {hasTrend && (
        <Line
          type="monotone"
          dataKey="trend"
          stroke="#c7d2fe"
          strokeWidth={1.5}
          strokeDasharray="6 3"
          dot={false}
          activeDot={false}
        />
      )}
    </LineChart>
  );
}

// ─── Anomaly Bar Chart ─────────────────────────────────────

const INDIGO = '#6366f1';
const AMBER = '#f59e0b';

function AnomalyBarChart({ spec, compact }: { spec: VisualSpec; compact?: boolean }) {
  const hasAnomalyFlag = spec.data.some((d) => Number(d.anomaly ?? 0) === 1);
  const values = spec.data.map((d) => Number(d[spec.y] ?? 0));
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);

  return (
    <BarChart data={spec.data} margin={compact ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 16, bottom: 4, left: 0 }}>
      {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />}
      {!compact && (
        <XAxis
          dataKey={spec.x}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
      )}
      {!compact && (
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => formatAxis(v)}
        />
      )}
      {!compact && (
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value: number, _name: string, entry) => {
            const isAnomaly = Number((entry as { payload?: Record<string, unknown> }).payload?.anomaly ?? 0) === 1;
            return [formatAxis(value), isAnomaly ? 'Outlier' : 'Value'];
          }}
        />
      )}
      {!compact && hasAnomalyFlag && (
        <ReferenceLine y={mean} stroke="#c7d2fe" strokeDasharray="4 3" label={{ value: 'mean', fontSize: 9, fill: '#9ca3af', position: 'right' }} />
      )}
      <Bar dataKey={spec.y} radius={[2, 2, 0, 0]} maxBarSize={compact ? 8 : 20}>
        {spec.data.map((entry, i) => {
          const isAnomaly = hasAnomalyFlag && Number(entry.anomaly ?? 0) === 1;
          return (
            <Cell
              key={i}
              fill={isAnomaly ? AMBER : INDIGO}
              opacity={isAnomaly ? 1 : 0.5}
            />
          );
        })}
      </Bar>
    </BarChart>
  );
}

// ─── Distribution Histogram ────────────────────────────────

function DistributionHistogram({ spec, compact }: { spec: VisualSpec; compact?: boolean }) {
  return (
    <BarChart data={spec.data} margin={compact ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 16, bottom: 4, left: 0 }}>
      {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />}
      {!compact && (
        <XAxis
          dataKey={spec.x}
          tick={{ fontSize: 9, fill: '#9ca3af' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={40}
        />
      )}
      {!compact && (
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
      )}
      {!compact && (
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value: number) => [value, 'Count']}
        />
      )}
      <Bar dataKey={spec.y} fill={INDIGO} opacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={compact ? 12 : 40} />
    </BarChart>
  );
}

// ─── Correlation Scatter ───────────────────────────────────

function CorrelationScatter({ spec, compact }: { spec: VisualSpec; compact?: boolean }) {
  return (
    <ScatterChart margin={compact ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 16, bottom: 4, left: 0 }}>
      {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
      {!compact && (
        <XAxis
          dataKey={spec.x}
          type="number"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
          name={spec.x}
          tickFormatter={(v: number) => formatAxis(v)}
        />
      )}
      {!compact && (
        <YAxis
          dataKey={spec.y}
          type="number"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={48}
          name={spec.y}
          tickFormatter={(v: number) => formatAxis(v)}
        />
      )}
      {!compact && (
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value: number) => formatAxis(value)}
        />
      )}
      <Scatter data={spec.data} fill={INDIGO} opacity={0.7} />
    </ScatterChart>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function formatAxis(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  if (Math.abs(val) >= 1) return val.toFixed(1);
  return val.toFixed(3);
}
