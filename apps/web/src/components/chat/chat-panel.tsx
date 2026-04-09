'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api-client';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  error?: boolean;
}

interface ChatResponse {
  sessionId: string;
  routing: { targetAgent: string; reasoning: string };
  results: Record<string, unknown>[];
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      content:
        'Welcome. Upload a dataset or ask me a question about your business data. I can analyze trends, detect anomalies, compute KPIs, and provide executive-level recommendations.',
      timestamp: new Date(),
    },
  ]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit() {
    const query = input.trim();
    if (!query || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const data = await api.post<ChatResponse>('/api/v1/agents/chat', { query });

      // Build a readable response from the orchestrator results
      const parts: string[] = [];
      parts.push(`Routed to **${data.routing.targetAgent}** agent: ${data.routing.reasoning}`);
      for (const result of data.results) {
        const msg = (result as Record<string, unknown>).result as Record<string, unknown> | undefined;
        if (msg?.message) {
          parts.push(String(msg.message));
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          content: parts.join('\n\n'),
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Something went wrong. Is the API server running?';

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          content: message,
          timestamp: new Date(),
          error: true,
        },
      ]);
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
            <div
              key={msg.id}
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
          ))}
          {sending && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              <span className="text-xs text-muted-foreground">Thinking...</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-end gap-2"
        >
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
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
