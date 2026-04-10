'use client';

import { ArrowRight, BarChart3, Database, FileSearch, Mic } from 'lucide-react';
import Link from 'next/link';
import { VoiceOrb, type OrbState } from './voice-orb';

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

interface AssistantHeroProps {
  orbState: OrbState;
  onOrbClick: () => void;
  onStopSpeaking: () => void;
  transcript: string;
  voiceSupported: boolean;
  voiceError: string | null;
}

export function AssistantHero({
  orbState,
  onOrbClick,
  onStopSpeaking,
  transcript,
  voiceSupported,
  voiceError,
}: AssistantHeroProps) {
  const stateLabel: Record<OrbState, string> = {
    idle: voiceSupported ? 'Tap to speak' : 'Voice not available',
    listening: 'Listening...',
    thinking: 'Analyzing...',
    speaking: 'Speaking...',
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      {/* Orb — clickable */}
      <button
        onClick={orbState === 'speaking' ? onStopSpeaking : onOrbClick}
        disabled={!voiceSupported && orbState === 'idle'}
        className="group mb-4 cursor-pointer rounded-full p-2 transition-transform hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-50"
        aria-label={stateLabel[orbState]}
      >
        <VoiceOrb
          state={orbState}
          size={120}
          intensity={orbState === 'idle' ? 0.5 : 0.8}
        />
      </button>

      {/* State label */}
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {stateLabel[orbState]}
      </p>

      {/* Live transcript */}
      {orbState === 'listening' && transcript && (
        <p className="mb-4 max-w-sm text-center text-sm text-accent-cyan">
          &ldquo;{transcript}&rdquo;
        </p>
      )}

      {/* Voice error */}
      {voiceError && (
        <p className="mb-4 text-xs text-error">{voiceError}</p>
      )}

      {/* Headline */}
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-foreground">
        What would you like to <span className="gradient-text">analyze</span>?
      </h1>
      <p className="mb-10 max-w-md text-center text-sm text-muted-foreground">
        {voiceSupported
          ? 'Speak or type your question. AI-powered insights with trend analysis, anomaly detection, and strategic recommendations.'
          : 'Upload data, ask questions, and get AI-powered insights with trend analysis, anomaly detection, and strategic recommendations.'}
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
        {voiceSupported ? (
          <>
            <Mic className="h-3 w-3" />
            <span>Click the orb to speak, or type in the assistant panel</span>
          </>
        ) : (
          <>
            <ArrowRight className="h-3 w-3" />
            <span>Type a question in the assistant panel</span>
          </>
        )}
      </div>
    </div>
  );
}
