import { AppShell } from '@/components/layout/app-shell';

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Platform configuration.</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold">API Connection</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              API URL: {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold">AI Configuration</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              LLM integration pending. Agents currently use deterministic analysis pipelines.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
