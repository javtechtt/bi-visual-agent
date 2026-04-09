import { AppShell } from '@/components/layout/app-shell';
import { Database, BarChart3, Briefcase, GitBranch } from 'lucide-react';

const agents = [
  {
    name: 'Orchestrator',
    icon: GitBranch,
    status: 'Active',
    description: 'Routes queries to specialized agents and coordinates multi-step analysis.',
  },
  {
    name: 'Data Agent',
    icon: Database,
    status: 'Active',
    description: 'Parses files, profiles columns, detects data types, and assesses quality.',
  },
  {
    name: 'Analytics Agent',
    icon: BarChart3,
    status: 'Active',
    description: 'Computes KPIs, detects anomalies, and analyzes trends using statistical methods.',
  },
  {
    name: 'Advisory Agent',
    icon: Briefcase,
    status: 'Pending',
    description: 'Synthesizes analysis into executive recommendations. LLM integration pending.',
  },
];

export default function AgentsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Multi-agent system for end-to-end business intelligence.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.name} className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                    <agent.icon className="h-4 w-4 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-semibold">{agent.name}</h3>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    agent.status === 'Active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {agent.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{agent.description}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
