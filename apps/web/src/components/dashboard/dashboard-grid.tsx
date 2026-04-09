import { KpiCard } from './kpi-card';

const placeholderKpis = [
  { title: 'Total Revenue', value: '$2.4M', change: 12.5, trend: 'up' as const, subtitle: 'vs last quarter' },
  { title: 'Active Users', value: '18,420', change: 8.3, trend: 'up' as const, subtitle: 'vs last month' },
  { title: 'Churn Rate', value: '2.1%', change: -0.4, trend: 'down' as const, subtitle: 'vs last month' },
  { title: 'Avg Deal Size', value: '$12,800', change: 0, trend: 'stable' as const, subtitle: 'vs last quarter' },
];

export function DashboardGrid() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">AI-powered insights across your business data</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {placeholderKpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-surface">
          <p className="text-sm text-muted-foreground">Revenue Trend Chart</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-surface">
          <p className="text-sm text-muted-foreground">Anomaly Detection Panel</p>
        </div>
      </div>
    </div>
  );
}
