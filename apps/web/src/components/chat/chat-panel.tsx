'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api-client';
import type { OrbState } from '@/components/ai/voice-orb';

interface RoutingDecision {
  intent: string;
  targetDatasetId: string | null;
  actions: string[];
  reasoning: string;
}

interface TopInsight {
  insight: string;
  importance: 'high' | 'medium' | 'low';
}

interface Hypothesis {
  explanation: string;
  confidence: 'low' | 'speculative';
  validation: string;
}

interface DecisionSupport {
  priorityFocus: string[];
  managementQuestions: string[];
  recommendedFollowUps: string[];
}

interface AdvisoryData {
  summary: string;
  topInsights: TopInsight[];
  implications: string[];
  hypotheses: Hypothesis[];
  confidenceAssessment: string;
  decisionSupport?: DecisionSupport;
}

interface QueryResponse {
  query: string;
  routing: RoutingDecision;
  agentOutputs: Record<string, unknown>[];
  advisory: AdvisoryData | null;
  summary: string;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  routing?: RoutingDecision;
  advisory?: AdvisoryData | null;
  timestamp: Date;
  error?: boolean;
}

interface ChatPanelProps {
  /** Register an external submit function (e.g. from voice input) */
  onRegisterSubmit?: (submit: (query: string) => void) => void;
  /** Called when a response is received (for voice auto-speak) */
  onResponse?: (response: {
    summary?: string;
    advisory?: { summary?: string; topInsights?: { insight: string }[] } | null;
  }) => void;
  /** Voice state — shows indicator when active */
  voiceState?: OrbState;
}

export function ChatPanel({ onRegisterSubmit, onResponse, voiceState }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      content:
        'Ask me about your data. I\'ll route your question to the right agent — data profiling, KPI analysis, trend detection, or anomaly detection.',
      timestamp: new Date(),
    },
  ]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(overrideQuery?: string) {
    const query = (overrideQuery ?? input).trim();
    if (!query || sending) return;

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    }]);
    if (!overrideQuery) setInput('');
    setSending(true);

    try {
      const data = await api.post<QueryResponse>('/api/v1/query', { query });

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'agent',
        content: data.summary,
        routing: data.routing,
        advisory: data.advisory,
        timestamp: new Date(),
      }]);

      // Notify parent (for voice auto-speak)
      onResponse?.({ summary: data.summary, advisory: data.advisory });
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'agent',
        content: err instanceof ApiRequestError ? err.message : 'Something went wrong.',
        timestamp: new Date(),
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  }

  // Register the submit function so the parent (voice) can trigger it
  useEffect(() => {
    onRegisterSubmit?.(handleSubmit);
  }); // intentionally no deps — re-registers on every render to capture latest closure

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-accent-cyan" />
        <h2 className="text-sm font-semibold text-foreground">AI Assistant</h2>
        {voiceState && voiceState !== 'idle' && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-accent-cyan">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-cyan" />
            {voiceState === 'listening' ? 'Listening' : voiceState === 'thinking' ? 'Processing' : 'Speaking'}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div
                className={`rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'ml-8 border border-accent-indigo/20 bg-accent-indigo/10'
                    : msg.error
                      ? 'border border-error/30 bg-error/10'
                      : 'bg-surface'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {msg.error && <AlertCircle className="h-3 w-3 text-error" />}
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === 'user' ? 'You' : 'BI Agent'}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{msg.content}</p>
              </div>
              {msg.advisory && <AdvisoryPanel advisory={msg.advisory} onFollowUp={(q) => handleSubmit(q)} />}
              {msg.routing && <RoutingBadge routing={msg.routing} />}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 rounded-lg bg-surface p-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" />
              <span className="text-xs text-muted-foreground">Routing query to agents...</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data..."
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/20 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="transition-theme flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-indigo text-white hover:bg-accent-violet disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function RoutingBadge({ routing }: { routing: RoutingDecision }) {
  const [expanded, setExpanded] = useState(false);

  const intentColors: Record<string, string> = {
    analyze: 'bg-violet-500/20 text-violet-400',
    profile: 'bg-blue-500/20 text-blue-400',
    summarize: 'bg-emerald-500/20 text-emerald-400',
    unsupported: 'bg-zinc-500/20 text-zinc-400',
  };

  return (
    <div className="ml-0 mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className={`rounded-full px-1.5 py-0.5 font-medium ${intentColors[routing.intent] ?? intentColors.unsupported}`}>
          {routing.intent}
        </span>
        <span>{routing.actions.join(' → ')}</span>
      </button>
      {expanded && (
        <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{routing.reasoning}</p>
      )}
    </div>
  );
}

const importanceColors = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-zinc-500/20 text-zinc-400',
};

function AdvisoryPanel({ advisory, onFollowUp }: { advisory: AdvisoryData; onFollowUp: (query: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const ds = advisory.decisionSupport;

  return (
    <div className="mt-2 rounded-lg border border-accent-violet/20 bg-accent-violet/5 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Sparkles className="h-3 w-3 text-accent-violet" />
        <span className="text-xs font-semibold text-accent-violet">Strategic Advisory</span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3 text-violet-400" /> : <ChevronRight className="ml-auto h-3 w-3 text-violet-400" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Top Insights with importance badges */}
          {advisory.topInsights.length > 0 && (
            <div className="space-y-1.5">
              {advisory.topInsights.map((ti, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase ${importanceColors[ti.importance]}`}>
                    {ti.importance}
                  </span>
                  <span className="text-violet-300">{ti.insight}</span>
                </div>
              ))}
            </div>
          )}

          {/* Implications */}
          {advisory.implications.length > 0 && (
            <div className="border-t border-violet-500/20 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Areas to investigate</p>
              <ul className="space-y-1">
                {advisory.implications.map((imp, i) => (
                  <li key={i} className="text-xs text-violet-300">
                    <span className="mr-1 text-violet-400">&rarr;</span>
                    {imp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decision Support — What to review next */}
          {ds && (ds.priorityFocus.length > 0 || ds.managementQuestions.length > 0) && (
            <div className="border-t border-violet-500/20 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">What to review next</p>
              {ds.priorityFocus.length > 0 && (
                <ul className="space-y-1">
                  {ds.priorityFocus.map((pf, i) => (
                    <li key={i} className="text-xs text-indigo-300">
                      <span className="mr-1 text-cyan-400">&#9656;</span>
                      {pf}
                    </li>
                  ))}
                </ul>
              )}
              {ds.managementQuestions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Questions to answer</p>
                  <ul className="space-y-1">
                    {ds.managementQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-indigo-300">
                        <span className="mr-1 text-cyan-400">&bull;</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Hypotheses */}
          {advisory.hypotheses.length > 0 && (
            <div className="border-t border-violet-500/20 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Possible explanations</p>
              <div className="space-y-2">
                {advisory.hypotheses.map((h, i) => (
                  <div key={i} className="rounded bg-violet-500/10 p-2">
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 rounded bg-violet-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-violet-400">
                        {h.confidence}
                      </span>
                      <span className="text-xs text-violet-300">{h.explanation}</span>
                    </div>
                    <p className="mt-1 pl-[3.25rem] text-[11px] text-violet-400">
                      <span className="font-medium">Validate:</span> {h.validation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          <p className="border-t border-violet-500/20 pt-2 text-[11px] italic text-violet-400">
            {advisory.confidenceAssessment}
          </p>

          {/* Clickable Follow-up Questions */}
          {ds && ds.recommendedFollowUps.length > 0 && (
            <div className="border-t border-violet-500/20 pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Ask next</p>
              <div className="flex flex-wrap gap-1.5">
                {ds.recommendedFollowUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onFollowUp(q)}
                    className="rounded-full border border-cyan-500/20 bg-white px-2.5 py-1 text-[11px] text-cyan-300 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/10"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
