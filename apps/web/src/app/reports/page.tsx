import { AppShell } from '@/components/layout/app-shell';
import { FileText } from 'lucide-react';

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Generate executive reports from your analytics results.
          </p>
        </div>
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Report generation coming soon</p>
          <p className="text-xs text-muted-foreground">
            The Advisory Agent will synthesize analytics into executive-ready reports.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
