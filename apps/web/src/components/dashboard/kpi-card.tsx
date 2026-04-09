import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  subtitle?: string;
}

export function KpiCard({ title, value, change, trend, subtitle }: KpiCardProps) {
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-400 bg-emerald-500/15'
      : trend === 'down'
        ? 'text-red-400 bg-red-500/15'
        : 'text-zinc-400 bg-zinc-500/15';

  return (
    <div className="transition-theme rounded-xl border border-border bg-surface p-5 hover:border-border/80">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {Math.abs(change)}%
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
