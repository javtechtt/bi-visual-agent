'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip,
} from 'recharts';
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


interface VisualSpec {
  type: string;
  x: string;
  y: string;
  title: string;
  data: Record<string, unknown>[];
}

interface StreamInsight {
  title: string;
  description: string;
  confidence: { level: string; score: number; reasoning: string };
  visual?: VisualSpec | null;
  followUps?: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  routing?: RoutingDecision;
  advisory?: AdvisoryData | null;
  /** Visuals that arrived early via streaming */
  visuals?: StreamInsight[];
  /** Follow-up suggestions */
  streamFollowUps?: string[];
  timestamp: Date;
  error?: boolean;
  /** True while the message is still being assembled */
  streaming?: boolean;
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

    const userMsgId = crypto.randomUUID();
    const agentMsgId = crypto.randomUUID();

    setMessages((prev) => [...prev, {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: new Date(),
    }]);
    if (!overrideQuery) setInput('');
    setSending(true);

    // Add a placeholder agent message that will be progressively filled
    setMessages((prev) => [...prev, {
      id: agentMsgId,
      role: 'agent',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }]);

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    try {
      const response = await fetch(
        `${apiBase}/api/v1/query/stream?q=${encodeURIComponent(query)}`,
      );

      if (!response.ok || !response.body) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const chunk of lines) {
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          const event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          const stage = event.stage as string;

          if (stage === 'visual_ready') {
            const insights = event.insights as StreamInsight[];
            setMessages((prev) => prev.map((m) =>
              m.id === agentMsgId ? { ...m, visuals: insights } : m,
            ));
          }

          if (stage === 'narrative_ready') {
            const summary = event.summary as string;
            const advisory = event.advisory as AdvisoryData | null;
            setMessages((prev) => prev.map((m) =>
              m.id === agentMsgId ? { ...m, content: summary, advisory } : m,
            ));
            onResponse?.({ summary, advisory });
          }

          if (stage === 'followups_ready') {
            const followUps = event.followUps as string[];
            setMessages((prev) => prev.map((m) =>
              m.id === agentMsgId ? { ...m, streamFollowUps: followUps } : m,
            ));
          }

          if (stage === 'done') {
            setMessages((prev) => prev.map((m) =>
              m.id === agentMsgId ? { ...m, streaming: false } : m,
            ));
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.id === agentMsgId
          ? { ...m, content: err instanceof Error ? err.message : 'Something went wrong.', error: true, streaming: false }
          : m,
      ));
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
                  {msg.streaming && !msg.error && <Loader2 className="h-3 w-3 animate-spin text-accent-cyan" />}
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === 'user' ? 'You' : 'BI Agent'}
                  </p>
                </div>

                {/* Visuals arrive FIRST — chart appears before narrative */}
                {msg.visuals && msg.visuals.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.visuals.map((insight, vi) => (
                      insight.visual ? (
                        <div key={vi} className="rounded-lg border border-border bg-background/50 p-3">
                          <p className="mb-1 text-xs font-semibold text-accent-cyan">{insight.visual.title}</p>
                          <StreamChart spec={insight.visual} />
                          <p className="mt-1 text-[11px] text-muted-foreground">{insight.description}</p>
                        </div>
                      ) : null
                    ))}
                  </div>
                )}

                {/* Narrative text — arrives after visuals */}
                {msg.content && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{msg.content}</p>
                )}

                {/* Streaming indicator while waiting for narrative */}
                {msg.streaming && !msg.content && !msg.visuals && (
                  <p className="mt-1 text-xs text-muted-foreground">Analyzing...</p>
                )}
              </div>

              {/* Follow-ups from stream */}
              {msg.streamFollowUps && msg.streamFollowUps.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {msg.streamFollowUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSubmit(q)}
                      className="transition-theme rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[11px] text-cyan-400 hover:border-cyan-400/40 hover:bg-cyan-500/10"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {msg.advisory && <AdvisoryPanel advisory={msg.advisory} onFollowUp={(q) => handleSubmit(q)} />}
              {msg.routing && <RoutingBadge routing={msg.routing} />}
            </div>
          ))}
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

// ─── Stream Chart (inline in chat) ─────────────────────────

function StreamChart({ spec }: { spec: VisualSpec }) {
  if (!spec.data.length) return null;

  const tooltipStyle = {
    fontSize: 11,
    borderRadius: 8,
    border: '1px solid #1e2130',
    backgroundColor: '#10121a',
    color: '#e8eaed',
  };

  if (spec.type === 'line') {
    return (
      <div style={{ width: '100%', height: 140 }}>
        <ResponsiveContainer>
          <LineChart data={spec.data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey={spec.x} tick={{ fontSize: 9, fill: '#7a8194' }} axisLine={{ stroke: '#1e2130' }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#7a8194' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={spec.y} stroke="#22d3ee" strokeWidth={2} dot={spec.data.length <= 20 ? { r: 2.5, fill: '#22d3ee' } : false} />
            {spec.data[0] && 'trend' in spec.data[0] && (
              <Line type="monotone" dataKey="trend" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === 'bar' || spec.type === 'histogram') {
    const hasAnomaly = spec.data.some((d) => d.anomaly === 1);
    return (
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer>
          <BarChart data={spec.data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey={spec.x} tick={{ fontSize: 8, fill: '#7a8194' }} axisLine={{ stroke: '#1e2130' }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#7a8194' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={spec.y} radius={[3, 3, 0, 0]} maxBarSize={24}>
              {spec.data.map((entry, i) => (
                <Cell key={i} fill={hasAnomaly && entry.anomaly === 1 ? '#f59e0b' : '#6366f1'} opacity={hasAnomaly && entry.anomaly !== 1 ? 0.4 : 0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
