'use client';

import { useState } from 'react';
import { ArrowRight, BarChart3, Database, FileSearch } from 'lucide-react';
import Link from 'next/link';
import { VoiceOrb } from './voice-orb';

const quickActions = [
  {
    label: 'Upload & Analyze',
    description: 'CSV, Excel, or PDF',
    icon: Database,
    href: '/datasets',
  },
  {
    label: 'Run Analytics',
    description: 'KPIs, trends, anomalies',
    icon: BarChart3,
    href: '/analytics',
  },
  {
    label: 'Explore Insights',
    description: 'AI-powered analysis',
    icon: FileSearch,
    href: '/analytics',
  },
] as const;

export function AssistantHero() {
  const [orbState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      {/* Orb */}
      <div className="mb-8">
        <VoiceOrb state={orbState} size={120} intensity={0.5} />
      </div>

      {/* Headline */}
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-foreground">
        What would you like to <span className="gradient-text">analyze</span>?
      </h1>
      <p className="mb-10 max-w-md text-center text-sm text-muted-foreground">
        Upload data, ask questions, and get AI-powered insights with trend analysis,
        anomaly detection, and strategic recommendations.
      </p>

      {/* Quick Actions */}
      <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="transition-theme group flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent-cyan/30 hover:bg-surface-raised"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised group-hover:bg-accent-cyan/10">
              <action.icon className="h-5 w-5 text-muted-foreground group-hover:text-accent-cyan" />
            </div>
            <span className="text-sm font-medium text-foreground">{action.label}</span>
            <span className="text-[11px] text-muted-foreground">{action.description}</span>
          </Link>
        ))}
      </div>

      {/* Prompt hint */}
      <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
        <span>Or ask a question in the assistant panel</span>
      </div>
    </div>
  );
}
