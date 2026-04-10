/**
 * Realtime Session — OpenAI Realtime API (gpt-4o-mini-realtime-preview)
 *
 * Architecture:
 *   Browser ←WebSocket→ Node server ←WebSocket→ OpenAI Realtime API
 *
 * The Node server relays audio, intercepts tool calls, executes them
 * against the local analytics stack, and sends results back.
 */

import WebSocket from 'ws';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { TOOL_DEFINITIONS, executeTool } from './realtime-tools.js';

const REALTIME_MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17';
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;

const SYSTEM_INSTRUCTIONS = `You are a senior Business Intelligence specialist working inside an enterprise analytics platform called BI Visual Agent.

You are NOT a generic chatbot. You are a domain expert who reads financial documents, spreadsheets, and data files — then delivers real analysis, real numbers, and real strategic advice. Users are executives, managers, and analysts who need actionable intelligence.

YOUR WORKFLOW — follow this sequence naturally:

1. DISCOVER — When a user asks about their data, ALWAYS start by calling list_datasets to see what's uploaded. Tell them what you found: file names, row counts, types.

2. READ — When they want to understand a specific file, call get_dataset_profile. Read through every column, the data types, sample values, and quality score. Describe what the data contains in plain business language: "This is a 43-row cash flow projection with monthly revenue, expenses, and operating balance columns."

3. ANALYZE — When they want insights, call analyze_dataset with action "all" for a comprehensive analysis. Read through EVERY insight the tool returns — the KPIs, the anomalies, the trends — and explain each one in business terms. Give specific numbers: "Revenue totals $1.08 million across the projection period, with a mean of $25,150 per month. Total expenses are fixed at $15,640."

4. ADVISE — After analysis, call generate_advisory to get strategic interpretation. Relay the key findings, the priority focus areas, the management questions, and the recommended follow-ups. If confidence is low, say so. If the data is limited, say so.

5. DRILL DOWN — When they ask follow-up questions like "what about anomalies in X" or "break down revenue", call analyze_dataset again with focus_column set to the specific metric. Compare the focused results with the broader picture.

HOW YOU SPEAK:

- You speak like a confident business analyst presenting to a boardroom — clear, direct, specific.
- Always cite actual numbers from the tool results. Never approximate or fabricate.
- Structure your responses: lead with the headline finding, then supporting detail, then what to watch.
- Use language like: "The data shows...", "Based on the analysis...", "The key finding is...", "One area worth monitoring is..."
- Keep each spoken response to 30-60 seconds. Be thorough but not exhausting.
- When there are multiple insights, prioritize: anomalies first (because they're actionable), then trends (because they're directional), then KPIs (because they're context).

WHAT YOU KNOW ABOUT THE PLATFORM:

- Users upload CSV, Excel (.xlsx), and PDF files containing financial data, sales data, operational metrics, etc.
- The platform extracts tables from PDFs, handles messy Excel files with merged cells and title rows, and profiles every dataset automatically.
- Analysis includes: summary statistics per numeric column, z-score + IQR anomaly detection, linear regression trend analysis.
- You have access to quality scores, null counts, and semantic type detection (monetary, date, percentage, identifier fields).
- After analysis, you can generate strategic advisory interpretation with decision-support guidance.

CRITICAL RULES:

- NEVER say "I don't have access to your data" — you DO, through the tools.
- NEVER give generic advice. Always ground every statement in actual numbers from the tool results.
- If a user asks a question and you haven't checked the data yet, CALL THE TOOL FIRST, then answer.
- If no datasets are uploaded, tell the user to upload a file and explain what formats you support.
- Do not read raw JSON to the user. Translate everything into natural business language.`;

// ─── Types ─────────────────────────────────────────────────

export type RealtimeEvent =
  | { type: 'state'; state: 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking' | 'idle' | 'error' }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean }
  | { type: 'audio'; data: string }
  | { type: 'error'; message: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'done' };

export interface RealtimeSessionCallbacks {
  onEvent: (event: RealtimeEvent) => void;
}

// ─── Session Class ─────────────────────────────────────────

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private callbacks: RealtimeSessionCallbacks;
  private sessionId: string;
  private closed = false;

  constructor(sessionId: string, callbacks: RealtimeSessionCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (!config.OPENAI_API_KEY) {
      this.callbacks.onEvent({ type: 'error', message: 'OPENAI_API_KEY not configured' });
      return;
    }

    this.callbacks.onEvent({ type: 'state', state: 'connecting' });

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(REALTIME_URL, {
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        logger.info({ sessionId: this.sessionId, model: REALTIME_MODEL }, 'Realtime: connected');
        this.configureSession();
        this.callbacks.onEvent({ type: 'state', state: 'connected' });
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleOpenAIEvent(JSON.parse(data.toString()));
      });

      this.ws.on('error', (err) => {
        logger.error({ sessionId: this.sessionId, err: err.message }, 'Realtime: error');
        this.callbacks.onEvent({ type: 'error', message: `Connection error: ${err.message}` });
        reject(err);
      });

      this.ws.on('close', () => {
        logger.info({ sessionId: this.sessionId }, 'Realtime: disconnected');
        if (!this.closed) {
          this.callbacks.onEvent({ type: 'state', state: 'idle' });
        }
      });
    });
  }

  sendAudio(base64Audio: string): void {
    this.send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }

  commitAudio(): void {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  sendText(text: string): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.send({ type: 'response.create' });
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  // ─── Private ───────────────────────────────────────────────

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: SYSTEM_INSTRUCTIONS,
        voice: 'ash',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
        tools: TOOL_DEFINITIONS.map((t) => ({
          type: t.type,
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    });
  }

  private handleOpenAIEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case 'session.created':
      case 'session.updated':
        logger.info({ sessionId: this.sessionId, type }, 'Realtime: session event');
        break;

      case 'input_audio_buffer.speech_started':
        this.callbacks.onEvent({ type: 'state', state: 'listening' });
        break;

      case 'input_audio_buffer.speech_stopped':
        this.callbacks.onEvent({ type: 'state', state: 'thinking' });
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (event as Record<string, unknown>).transcript as string;
        if (transcript) {
          this.callbacks.onEvent({ type: 'transcript', role: 'user', text: transcript, final: true });
        }
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = (event as Record<string, unknown>).delta as string;
        if (delta) {
          this.callbacks.onEvent({ type: 'transcript', role: 'assistant', text: delta, final: false });
        }
        break;
      }

      case 'response.audio_transcript.done': {
        const transcript = (event as Record<string, unknown>).transcript as string;
        if (transcript) {
          this.callbacks.onEvent({ type: 'transcript', role: 'assistant', text: transcript, final: true });
        }
        break;
      }

      case 'response.audio.delta': {
        const audioData = (event as Record<string, unknown>).delta as string;
        if (audioData) {
          this.callbacks.onEvent({ type: 'state', state: 'speaking' });
          this.callbacks.onEvent({ type: 'audio', data: audioData });
        }
        break;
      }

      case 'response.function_call_arguments.done':
        this.handleToolCall(event);
        break;

      case 'response.done':
        this.callbacks.onEvent({ type: 'state', state: 'idle' });
        this.callbacks.onEvent({ type: 'done' });
        break;

      case 'error': {
        const errorMsg = ((event as Record<string, unknown>).error as Record<string, unknown>)?.message as string ?? 'Unknown error';
        logger.error({ sessionId: this.sessionId, error: errorMsg }, 'Realtime: API error');
        this.callbacks.onEvent({ type: 'error', message: errorMsg });
        break;
      }

      default:
        break;
    }
  }

  private async handleToolCall(event: Record<string, unknown>): Promise<void> {
    const callId = event.call_id as string;
    const name = event.name as string;
    const argsStr = event.arguments as string;

    logger.info({ sessionId: this.sessionId, tool: name }, 'Realtime: tool call');
    this.callbacks.onEvent({ type: 'tool_call', name, args: argsStr });
    this.callbacks.onEvent({ type: 'state', state: 'thinking' });

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    const result = await executeTool(name, args);

    logger.info({ sessionId: this.sessionId, tool: name, resultLen: result.length }, 'Realtime: tool result');

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    });

    this.send({ type: 'response.create' });
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }
}
