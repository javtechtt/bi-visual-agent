'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api-client';

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

export function ChatPanel() {
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold">AI Assistant</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div
                className={`rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'ml-8 bg-indigo-50'
                    : msg.error
                      ? 'border border-red-200 bg-red-50'
                      : 'bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {msg.error && <AlertCircle className="h-3 w-3 text-red-500" />}
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === 'user' ? 'You' : 'BI Agent'}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
              {msg.advisory && <AdvisoryPanel advisory={msg.advisory} onFollowUp={(q) => handleSubmit(q)} />}
              {msg.routing && <RoutingBadge routing={msg.routing} />}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
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
            className="flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:opacity-50"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
    analyze: 'bg-violet-100 text-violet-700',
    profile: 'bg-blue-100 text-blue-700',
    summarize: 'bg-emerald-100 text-emerald-700',
    unsupported: 'bg-zinc-100 text-zinc-600',
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
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-zinc-100 text-zinc-600',
};

function AdvisoryPanel({ advisory, onFollowUp }: { advisory: AdvisoryData; onFollowUp: (query: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const ds = advisory.decisionSupport;

  return (
    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Sparkles className="h-3 w-3 text-violet-600" />
        <span className="text-xs font-semibold text-violet-800">Strategic Advisory</span>
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
                  <span className="text-violet-900">{ti.insight}</span>
                </div>
              ))}
            </div>
          )}

          {/* Implications */}
          {advisory.implications.length > 0 && (
            <div className="border-t border-violet-200 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Areas to investigate</p>
              <ul className="space-y-1">
                {advisory.implications.map((imp, i) => (
                  <li key={i} className="text-xs text-violet-800">
                    <span className="mr-1 text-violet-400">&rarr;</span>
                    {imp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decision Support — What to review next */}
          {ds && (ds.priorityFocus.length > 0 || ds.managementQuestions.length > 0) && (
            <div className="border-t border-violet-200 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">What to review next</p>
              {ds.priorityFocus.length > 0 && (
                <ul className="space-y-1">
                  {ds.priorityFocus.map((pf, i) => (
                    <li key={i} className="text-xs text-indigo-800">
                      <span className="mr-1 text-indigo-400">&#9656;</span>
                      {pf}
                    </li>
                  ))}
                </ul>
              )}
              {ds.managementQuestions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Questions to answer</p>
                  <ul className="space-y-1">
                    {ds.managementQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-indigo-800">
                        <span className="mr-1 text-indigo-400">&bull;</span>
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
            <div className="border-t border-violet-200 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">Possible explanations</p>
              <div className="space-y-2">
                {advisory.hypotheses.map((h, i) => (
                  <div key={i} className="rounded bg-violet-100/50 p-2">
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 rounded bg-violet-200 px-1 py-0.5 text-[9px] font-semibold uppercase text-violet-600">
                        {h.confidence}
                      </span>
                      <span className="text-xs text-violet-900">{h.explanation}</span>
                    </div>
                    <p className="mt-1 pl-[3.25rem] text-[11px] text-violet-600">
                      <span className="font-medium">Validate:</span> {h.validation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          <p className="border-t border-violet-200 pt-2 text-[11px] italic text-violet-600">
            {advisory.confidenceAssessment}
          </p>

          {/* Clickable Follow-up Questions */}
          {ds && ds.recommendedFollowUps.length > 0 && (
            <div className="border-t border-violet-200 pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Ask next</p>
              <div className="flex flex-wrap gap-1.5">
                {ds.recommendedFollowUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onFollowUp(q)}
                    className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50"
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
